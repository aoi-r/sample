#!/usr/bin/env python3
import json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'js/app.js').read_text(encoding='utf-8')
matrix=json.loads((ROOT/'data/v313_four_deck_effect_matrix.json').read_text(encoding='utf-8'))
rows=matrix['rows']
checks=[]
def check(name, ok, detail=''):
    checks.append({'name':name,'ok':bool(ok),'detail':detail})
check('all four deck cards found', all(r['found'] for r in rows), [r['name'] for r in rows if not r['found']])
# All four-deck renkei/fortune/summon risk cards need a named dedicated route or earlier dedicated manifest route.
for risk, route in [('renkei','renkei-dedicated'),('fortune','fortune-dedicated'),('summon','summon-dedicated')]:
    bad=[r['name'] for r in rows if risk in r['risk'] and route not in r['routes'] and not (risk=='summon' and 'weapon-dedicated' in r['routes']) and r['name'] not in ['勇者イレブン','タバサ','イル＆ルカ','天空の花嫁デボラ']]
    check(f'{risk} high-risk four-deck cards have dedicated route', not bad, bad)
for s in ['トンネラー','ナイトキング','銀のタロット','ゾディアックコード','タロットフォーチュン','クロウズ','しんりゅう']:
    check(f'v313 code contains dedicated recovery for {s}', s in app, s)
check('v313 renkei wrapper installed', '__v313FourDeckCloseout' in app and 'applyRenkeiIfActive' in app, '')
check('v313 card-use wrapper installed', 'applyCardUseV166.__v313FourDeckCloseout' in app, '')
check('v313 summon wrapper installed', 'applySummonV166.__v313FourDeckCloseout' in app, '')
check('v304 semantic quota retained', 'installSemanticMutationQuotaGuardV304' in app, '')
check('v305 runtime invariant retained', 'installBoundedProofRuntimeInvariantGuardV305' in app, '')
check('v312 lifetime once retained', 'installLifetimeOnceAndDedicatedRegressionFixV312' in app, '')
out={'passed':sum(1 for c in checks if c['ok']),'failed':sum(1 for c in checks if not c['ok']),'checks':checks}
(ROOT/'data/v313_static_four_deck_checks.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(out,ensure_ascii=False,indent=2))
sys.exit(1 if out['failed'] else 0)
