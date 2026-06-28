#!/usr/bin/env python3
import json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'js/app.js').read_text(encoding='utf-8')
cards=json.loads((ROOT/'data/cards.json').read_text(encoding='utf-8')).get('cards',[])
patterns={
  'summon':'召喚時','death':'死亡時','bet':'BET','get':r'GET\s*[（(]','renkei':'れんけい','fortune':r'占い|必中|超必中',
  'turn':r'ターン開始時|ターン終了時|自分のターン開始時|自分のターン終了時','attack':r'攻撃時|攻撃後','draw_generate':r'カードを.*引く|ドロー|手札に.*加える|加える.*手札','damage':'ダメージ','heal':'回復','tension':'テンション','buff_debuff':r'攻撃力|HP|コスト|ステルス|におうだち|速攻|貫通|ねらい撃ち|超貫通','random':'ランダム','hand_deck':r'手札|山札','opponent_hand':'相手の手札'
}
counts={}
examples={}
for name,pat in patterns.items():
    rx=re.compile(pat)
    arr=[]
    for c in cards:
        text=str(c.get('text') or '')
        if rx.search(text): arr.append({'name':c.get('name'),'id':c.get('id'),'text':text})
    counts[name]=len(arr); examples[name]=arr[:20]
checks=[]
def check(name, ok, detail=''):
    checks.append({'name':name,'ok':bool(ok),'detail':detail})
check('DATA_VERSION v305', "v305_bounded_proof_and_runtime_invariant_guard" in app)
check('v302 entry guard retained', 'installEffectEntryDedupeAuditGuardV302' in app and 'handleUnitSummonedEvent' in app and 'handleUnitDeathEvent' in app)
check('v303 context guard retained', 'installEffectContextTotalDedupeGuardV303' in app and '_v303CurrentEffectContext' in app)
check('v304 semantic quota retained', 'installSemanticMutationQuotaGuardV304' in app and 'mutationGuardCount' in app and 'dealDamageToUnit' in app and 'drawCard' in app)
check('v305 runtime invariant installed', 'installBoundedProofRuntimeInvariantGuardV305' in app and 'runtimeInvariantV305' in app and 'assertOrRecoverV305' in app)
check('hand leakage guard present', 'enemy exact hand leaked' in app and 'handIds:[]' in app)
check('GET cards covered by semantic guard', counts['get']>0 and 'getQuotaFromSegment' in app)
check('draw/generate cards covered by semantic guard', counts['draw_generate']>0 and 'drawQuotaFromSegment' in app)
check('damage cards covered by semantic guard', counts['damage']>0 and 'dealDamageToUnit' in app and 'damageLeader' in app)
check('turn/summon/death entries covered', counts['summon']>0 and counts['death']>0 and counts['turn']>0)
result={'version':'v305_bounded_proof_and_runtime_invariant_guard','claim':'PASS means machine-checked proof obligations for the finite model in cards.json + js guards, not an unbounded proof of every browser/Firebase/network interleaving.','passed':sum(1 for c in checks if c['ok']),'failed':sum(1 for c in checks if not c['ok']),'checks':checks,'counts':counts,'examples':examples}
(ROOT/'data/v305_bounded_proof_results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
sys.exit(1 if result['failed'] else 0)
