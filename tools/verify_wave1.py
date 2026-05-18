#!/usr/bin/env python3
import json, subprocess, uuid
import requests
import psycopg2

ANON_ID='jkoy2cxqwnvcerzpcybya57534'
DB_ID='fu7yvf5ci6fqi5vcbxx6dcf65a'

def get_item(iid):
    p=subprocess.run(['op','item','get',iid,'--vault','Clawd Frog','--format','json','--reveal'],text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
    return json.loads(p.stdout)

def fields(item):
    out={}
    for f in item.get('fields') or []:
        if f.get('label') and f.get('value') is not None:
            out[f['label']]=f['value']
    sections={}
    for sec in item.get('sections') or []:
        sl=sec.get('label') or sec.get('id') or ''
        sections[sl]={}
        for f in sec.get('fields') or []:
            if f.get('label') and f.get('value') is not None:
                sections[sl][f['label']]=f['value']
    return out,sections

anon,_=fields(get_item(ANON_ID))
dbv,dbs=fields(get_item(DB_ID))
conn_str=(dbs.get('PoolerSession') or {}).get('connection_string') or dbv.get('connection_string')
url=anon['project_url'].rstrip('/')
key=anon['anon_key']

# RLS sanity: anonymous API key must not be able to write content.
rls_insert = requests.post(
    f'{url}/rest/v1/sections',
    headers={'apikey':key,'Authorization':f'Bearer {key}','Content-Type':'application/json','Prefer':'return=minimal'},
    json={'id':'rls-anon-deny-test','name':'RLS anon deny test'},
    timeout=20,
)
rls_denied = rls_insert.status_code in (401,403)

# Trigger sanity in rolled-back DB transaction to avoid polluting production data.
uid=str(uuid.uuid4())
with psycopg2.connect(conn_str) as conn:
    conn.autocommit=False
    with conn.cursor() as cur:
        cur.execute("insert into public.sections(id,name) values(%s,%s)",('trigger-test-section','Trigger Test Section'))
        cur.execute("insert into public.quiz_sets(id,section_id,name) values(%s,%s,%s)",('trigger-test-set','trigger-test-section','Trigger Test Set'))
        cur.execute("insert into public.questions(id,quiz_set_id,question_text,difficulty) values(%s,%s,%s,%s)",('trigger-test-question','trigger-test-set','Trigger question?','easy'))
        cur.execute("""
            insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
            values (%s, 'authenticated', 'authenticated', %s, crypt('not-used', gen_salt('bf')), now(), now(), now(), '{}'::jsonb, '{}'::jsonb)
        """,(uid, f'phase44-trigger-test-{uid}@example.invalid'))
        cur.execute("insert into public.attempts(user_id,question_id,user_answer_text,was_correct,time_taken_seconds,app_source) values(%s,%s,%s,%s,%s,%s)",(uid,'trigger-test-question','test',True,1,'training_app'))
        cur.execute("select attempts_count, correct_count, percent_complete from public.cert_progress where user_id=%s and section_id=%s",(uid,'trigger-test-section'))
        row=cur.fetchone()
    conn.rollback()

print(json.dumps({
    'ok': bool(rls_denied and row and row[0] == 1 and row[1] == 1),
    'rls_anon_insert_status': rls_insert.status_code,
    'rls_anon_insert_denied': rls_denied,
    'trigger_cert_progress_row': {'attempts_count': row[0], 'correct_count': row[1], 'percent_complete': str(row[2])} if row else None,
    'transaction_rolled_back': True,
}, indent=2))
