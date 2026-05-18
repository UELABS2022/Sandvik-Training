#!/usr/bin/env python3
import json
import subprocess
from pathlib import Path

import psycopg2

DB_ITEM_ID = 'fu7yvf5ci6fqi5vcbxx6dcf65a'
SQL_PATH = Path(__file__).resolve().parents[1] / 'migrations' / '0001_initial_schema.sql'


def load_db_values():
    p = subprocess.run(
        ['op', 'item', 'get', DB_ITEM_ID, '--vault', 'Clawd Frog', '--format', 'json', '--reveal'],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True,
    )
    item = json.loads(p.stdout)
    # The DB item has direct DB fields first and optional PoolerSession duplicate labels later.
    values = {}
    pooler = {}
    for f in item.get('fields') or []:
        label = f.get('label') or f.get('id')
        val = f.get('value')
        if label and val is not None:
            values[label] = val
    sections = item.get('sections') or []
    for sec in sections:
        slabel = (sec.get('label') or sec.get('id') or '').lower()
        for f in sec.get('fields') or []:
            label = f.get('label') or f.get('id')
            val = f.get('value')
            if not label or val is None:
                continue
            if 'pooler' in slabel:
                pooler[label] = val
            else:
                values.setdefault(label, val)
    # Prefer pooler because direct Supabase host is often IPv6-only on WSL/Windows networks.
    conn = pooler.get('connection_string') or values.get('connection_string')
    if not conn:
        raise RuntimeError('No connection string found in 1Password DB item')
    return conn


def main():
    sql = SQL_PATH.read_text(encoding='utf-8')
    conn_str = load_db_values()
    with psycopg2.connect(conn_str) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(sql)
            cur.execute("""
                select table_name
                from information_schema.tables
                where table_schema='public'
                  and table_name in ('sections','quiz_sets','questions','answers','attempts','cert_progress','profiles')
                order by table_name
            """)
            tables = [r[0] for r in cur.fetchall()]
            cur.execute("select count(*) from public.questions")
            q_count = cur.fetchone()[0]
    print(json.dumps({'ok': True, 'tables': tables, 'questions': q_count}, indent=2))

if __name__ == '__main__':
    main()
