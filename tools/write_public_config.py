#!/usr/bin/env python3
import json, subprocess
from pathlib import Path
ANON_ID='jkoy2cxqwnvcerzpcybya57534'
out=Path(__file__).resolve().parents[1]/'app'/'supabase-config.js'
p=subprocess.run(['op','item','get',ANON_ID,'--vault','Clawd Frog','--format','json','--reveal'],text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
item=json.loads(p.stdout)
vals={}
for f in item.get('fields') or []:
    if f.get('label') and f.get('value') is not None:
        vals[f['label']]=f['value']
url=vals.get('project_url') or vals.get('Project URL')
key=vals.get('anon_key') or vals.get('API Key')
if not url or not key:
    raise SystemExit('Supabase public URL/anon key not found in 1Password item')
out.write_text('window.SANDVIK_TRAINING_CONFIG = '+json.dumps({'supabaseUrl':url,'supabaseAnonKey':key},indent=2)+';\n',encoding='utf-8')
print('wrote app/supabase-config.js with public Supabase URL + anon key')
