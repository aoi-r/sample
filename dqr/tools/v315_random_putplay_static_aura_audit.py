#!/usr/bin/env python3
import json, pathlib, subprocess, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
app=(ROOT/'js/app.js').read_text(encoding='utf-8')
manifest=json.loads((ROOT/'data/v315_random_putplay_static_aura_manifest.json').read_text(encoding='utf-8'))
checks=[]
def add(name, ok, detail=''):
    checks.append({'name':name,'ok':bool(ok),'detail':detail})
add('v315 install block exists','installRandomPutPlayStaticAuraGuardV315' in app)
add('put into play is marked not summoned','_v315NoSummonEffects' in app and 'putIntoPlayNotSummonedV315' in app)
add('summon handlers are blocked for put-play units','__v315NoSummonForPutPlay' in app)
add('field statics are applied','applyPrintedStaticEffectsV315' in app)
add('continuous refresh runs after put-play','refreshAllContinuousV315' in app)
add('random unit pool has eligibility filter','isEligibleRandomPutPlayUnitV315' in app)
add('remote put-play static route exists','__v315RemotePutStaticAura' in app)
add('four deck manifest has no incomplete rows', not manifest.get('incomplete'))
res=subprocess.run(['node','--check',str(ROOT/'js/app.js')],capture_output=True,text=True)
add('node --check js/app.js',res.returncode==0,res.stderr[:500])
out={'passed':sum(1 for c in checks if c['ok']),'failed':sum(1 for c in checks if not c['ok']),'checks':checks}
(ROOT/'data/v315_static_random_putplay_checks.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(out,ensure_ascii=False,indent=2))
sys.exit(1 if out['failed'] else 0)
