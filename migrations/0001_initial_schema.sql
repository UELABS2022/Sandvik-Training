-- =============================================
-- Phase 44 — Sandvik Training schema v1
-- Idempotent migration for Supabase project mining-training
-- =============================================

create extension if not exists pgcrypto;

create table if not exists public.sections (
  id text primary key,
  name text not null,
  icon text,
  description text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.quiz_sets (
  id text primary key,
  section_id text not null references public.sections(id) on delete cascade,
  name text not null,
  description text,
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists quiz_sets_section_id_idx on public.quiz_sets(section_id);

create table if not exists public.questions (
  id text primary key,
  quiz_set_id text not null references public.quiz_sets(id) on delete cascade,
  question_text text not null,
  difficulty text check (difficulty in ('easy', 'medium', 'hard')),
  source_manual text,
  citation_refs jsonb default '[]'::jsonb,
  media_refs jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists questions_quiz_set_id_idx on public.questions(quiz_set_id);
create index if not exists questions_difficulty_idx on public.questions(difficulty);

create table if not exists public.answers (
  question_id text primary key references public.questions(id) on delete cascade,
  answer_text text not null,
  has_answer boolean default true,
  updated_at timestamptz default now()
);

create table if not exists public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null references public.questions(id) on delete cascade,
  attempted_at timestamptz default now(),
  user_answer_text text,
  was_correct boolean,
  time_taken_seconds int,
  app_source text check (app_source in ('mining_ai', 'training_app'))
);
create index if not exists attempts_user_id_idx on public.attempts(user_id);
create index if not exists attempts_question_id_idx on public.attempts(question_id);
create index if not exists attempts_attempted_at_idx on public.attempts(attempted_at);

create table if not exists public.cert_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  section_id text not null references public.sections(id) on delete cascade,
  attempts_count int default 0,
  correct_count int default 0,
  last_attempted_at timestamptz,
  percent_complete numeric(5,2),
  primary key (user_id, section_id)
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'trainee' check (role in ('trainee', 'trainer', 'editor', 'admin')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.profiles (user_id, display_name) values (new.id, new.email)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.update_cert_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_section_id text;
begin
  select qs.section_id into v_section_id
    from public.questions q
    join public.quiz_sets qs on qs.id = q.quiz_set_id
   where q.id = new.question_id;

  insert into public.cert_progress (user_id, section_id, attempts_count, correct_count, last_attempted_at, percent_complete)
  values (
    new.user_id,
    v_section_id,
    1,
    case when new.was_correct then 1 else 0 end,
    new.attempted_at,
    round(100.0 * (case when new.was_correct then 1 else 0 end)::numeric /
      nullif((select count(*) from public.questions q join public.quiz_sets qs on qs.id = q.quiz_set_id where qs.section_id = v_section_id), 0), 2)
  )
  on conflict (user_id, section_id) do update set
    attempts_count = public.cert_progress.attempts_count + 1,
    correct_count = public.cert_progress.correct_count + (case when new.was_correct then 1 else 0 end),
    last_attempted_at = greatest(public.cert_progress.last_attempted_at, new.attempted_at),
    percent_complete = round(
      100.0 * (public.cert_progress.correct_count + (case when new.was_correct then 1 else 0 end))::numeric
      / nullif((select count(*) from public.questions q join public.quiz_sets qs on qs.id = q.quiz_set_id where qs.section_id = v_section_id), 0),
      2
    );
  return new;
end;
$$;
drop trigger if exists on_attempt_insert on public.attempts;
create trigger on_attempt_insert after insert on public.attempts
  for each row execute function public.update_cert_progress();

alter table public.sections      enable row level security;
alter table public.quiz_sets     enable row level security;
alter table public.questions     enable row level security;
alter table public.answers       enable row level security;
alter table public.attempts      enable row level security;
alter table public.cert_progress enable row level security;
alter table public.profiles      enable row level security;

create or replace function public.user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid();
$$;

-- Drop/recreate policies for idempotency.
drop policy if exists "Anyone signed in can read sections" on public.sections;
drop policy if exists "Editors+ can write sections" on public.sections;
drop policy if exists "Anyone signed in can read quiz_sets" on public.quiz_sets;
drop policy if exists "Editors+ can write quiz_sets" on public.quiz_sets;
drop policy if exists "Anyone signed in can read questions" on public.questions;
drop policy if exists "Editors+ can write questions" on public.questions;
drop policy if exists "Anyone signed in can read answers" on public.answers;
drop policy if exists "Editors+ can write answers" on public.answers;
drop policy if exists "Trainees see own attempts" on public.attempts;
drop policy if exists "Trainees insert own attempts" on public.attempts;
drop policy if exists "No one updates attempts" on public.attempts;
drop policy if exists "No one deletes attempts" on public.attempts;
drop policy if exists "Trainees see own cert progress" on public.cert_progress;
drop policy if exists "Trainees see own profile" on public.profiles;
drop policy if exists "Trainees update own display_name" on public.profiles;
drop policy if exists "Admins can update roles" on public.profiles;

create policy "Anyone signed in can read sections" on public.sections for select using (auth.role() = 'authenticated');
create policy "Editors+ can write sections" on public.sections for all using (public.user_role() in ('editor', 'admin'));
create policy "Anyone signed in can read quiz_sets" on public.quiz_sets for select using (auth.role() = 'authenticated');
create policy "Editors+ can write quiz_sets" on public.quiz_sets for all using (public.user_role() in ('editor', 'admin'));
create policy "Anyone signed in can read questions" on public.questions for select using (auth.role() = 'authenticated');
create policy "Editors+ can write questions" on public.questions for all using (public.user_role() in ('editor', 'admin'));
create policy "Anyone signed in can read answers" on public.answers for select using (auth.role() = 'authenticated');
create policy "Editors+ can write answers" on public.answers for all using (public.user_role() in ('editor', 'admin'));
create policy "Trainees see own attempts" on public.attempts for select using (user_id = auth.uid() or public.user_role() in ('trainer', 'editor', 'admin'));
create policy "Trainees insert own attempts" on public.attempts for insert with check (user_id = auth.uid());
create policy "No one updates attempts" on public.attempts for update using (false);
create policy "No one deletes attempts" on public.attempts for delete using (false);
create policy "Trainees see own cert progress" on public.cert_progress for select using (user_id = auth.uid() or public.user_role() in ('trainer', 'editor', 'admin'));
create policy "Trainees see own profile" on public.profiles for select using (user_id = auth.uid() or public.user_role() = 'admin');
create policy "Trainees update own display_name" on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid() and role = public.user_role());
create policy "Admins can update roles" on public.profiles for all using (public.user_role() = 'admin');
