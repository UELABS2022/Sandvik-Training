#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

import psycopg2
from psycopg2.extras import Json, execute_values

DB_ITEM_ID = 'fu7yvf5ci6fqi5vcbxx6dcf65a'
QUIZ_BANK_PATH = Path('/mnt/d/Sandvik mining suite/Mining AI/app/quiz-data/quiz_bank.json')

def get_conn_str():
    p = subprocess.run(
        ['op', 'item', 'get', DB_ITEM_ID, '--vault', 'Clawd Frog', '--format', 'json', '--reveal'],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
    )
    item = json.loads(p.stdout)
    direct = {}
    pooler = {}
    for f in item.get('fields') or []:
        if f.get('label') and f.get('value') is not None:
            direct[f['label']] = f['value']
    for sec in item.get('sections') or []:
        slabel = (sec.get('label') or sec.get('id') or '').lower()
        for f in sec.get('fields') or []:
            if f.get('label') and f.get('value') is not None:
                (pooler if 'pooler' in slabel else direct)[f['label']] = f['value']
    return pooler.get('connection_string') or direct.get('connection_string')

def main():
    data = json.loads(QUIZ_BANK_PATH.read_text(encoding='utf-8'))
    sections, quiz_sets, questions, answers = [], [], [], []
    seen_questions = set()
    for s_i, s in enumerate(data.get('sections') or []):
        sections.append((s['id'], s['name'], s.get('icon'), s.get('description'), s_i))
        for qs_i, qs in enumerate(s.get('quizSets') or []):
            quiz_sets.append((qs['id'], s['id'], qs['name'], qs.get('description'), qs_i))
            for q in qs.get('questions') or []:
                qid = q['id']
                if qid in seen_questions:
                    raise ValueError(f'duplicate question id: {qid}')
                seen_questions.add(qid)
                difficulty = q.get('difficulty') if q.get('difficulty') in ('easy','medium','hard') else None
                questions.append((
                    qid, qs['id'], q.get('question') or '', difficulty,
                    q.get('source'), Json([]), Json([]),
                ))
                if q.get('hasAnswer') and q.get('answer'):
                    answers.append((qid, q['answer'], True))

    conn_str = get_conn_str()
    with psycopg2.connect(conn_str) as conn:
        with conn.cursor() as cur:
            execute_values(cur, """
                insert into public.sections(id,name,icon,description,sort_order)
                values %s
                on conflict(id) do update set
                  name=excluded.name, icon=excluded.icon, description=excluded.description,
                  sort_order=excluded.sort_order, updated_at=now()
            """, sections, page_size=100)
            execute_values(cur, """
                insert into public.quiz_sets(id,section_id,name,description,sort_order)
                values %s
                on conflict(id) do update set
                  section_id=excluded.section_id, name=excluded.name, description=excluded.description,
                  sort_order=excluded.sort_order, updated_at=now()
            """, quiz_sets, page_size=100)
            execute_values(cur, """
                insert into public.questions(id,quiz_set_id,question_text,difficulty,source_manual,citation_refs,media_refs)
                values %s
                on conflict(id) do update set
                  quiz_set_id=excluded.quiz_set_id, question_text=excluded.question_text,
                  difficulty=excluded.difficulty, source_manual=excluded.source_manual,
                  citation_refs=excluded.citation_refs, media_refs=excluded.media_refs,
                  updated_at=now()
            """, questions, page_size=500)
            execute_values(cur, """
                insert into public.answers(question_id,answer_text,has_answer)
                values %s
                on conflict(question_id) do update set
                  answer_text=excluded.answer_text, has_answer=excluded.has_answer, updated_at=now()
            """, answers, page_size=500)
            cur.execute("select count(*) from public.sections")
            db_sections = cur.fetchone()[0]
            cur.execute("select count(*) from public.quiz_sets")
            db_quiz_sets = cur.fetchone()[0]
            cur.execute("select count(*) from public.questions")
            db_questions = cur.fetchone()[0]
            cur.execute("select count(*) from public.answers")
            db_answers = cur.fetchone()[0]
        conn.commit()

    print(json.dumps({
        'ok': db_questions == len(questions) == 3616,
        'source_stats_total_questions': data.get('stats', {}).get('totalQuestions'),
        'source_stats_total_sections': data.get('stats', {}).get('totalSections'),
        'source_actual_sections': len(sections),
        'source_quiz_sets': len(quiz_sets),
        'source_answers': len(answers),
        'db_sections': db_sections,
        'db_quiz_sets': db_quiz_sets,
        'db_questions': db_questions,
        'db_answers': db_answers,
    }, indent=2))

if __name__ == '__main__':
    main()
