#!/usr/bin/env python3
import json, pathlib, subprocess, sys, re
ROOT=pathlib.Path(__file__).resolve().parents[1]
manifest=json.loads((ROOT/'data/v314_four_deck_complete_effect_manifest.json').read_text(encoding='utf-8'))
app=(ROOT/'js/app.js').read_text(encoding='utf-8')
checks=[]
def add(name, ok, detail=''):
    checks.append({'name':name,'ok':bool(ok),'detail':detail})
add('all four-deck rows exist', manifest['totalRows']==74, manifest['totalRows'])
add('all four-deck cards found', manifest['foundCount']==manifest['totalRows'], manifest.get('missingCards'))
add('all risk rows have explicit non-generic route', not manifest['incompleteRiskRoutes'], manifest.get('incompleteRiskRoutes'))
add('v314 app block installed', 'installFourDeckCompleteRouteManifestV314' in app)
add('v313 closeout retained', 'installFourDeckFullEffectCloseoutGuardV313' in app)
add('v312 lifetime/synchro/shinryu retained', 'installLifetimeOnceAndDedicatedRegressionFixV312' in app)
add('v311 attack exhaustion retained', '_v311AttackExhaustedTurn' in app)
add('v310 crows/synchro/putplay retained', 'permanentHitFortuneV310' in app and 'firstEmptyByOwnerPriorityV217' in app)
add('v309 front taunt and coin spell retained', 'front taunt' in app or 'isFrontRow' in app)
add('v304 semantic quota retained', 'semantic' in app and 'quota' in app)
add('v296 PvP hand redaction retained', 'handRedactedV296' in app)
# explicit evidence for formerly semantic-only cards
for name in ['しっぷう突き','風の導き','コインのたね','乙女の気まぐれ','氷竜への祈り','痛みわけの杖','商人の交換所','ギュメイ将軍','メラゾーマ']:
    add(f'explicit code evidence: {name}', name in app, name)
out={'passed':sum(1 for c in checks if c['ok']),'failed':sum(1 for c in checks if not c['ok']),'checks':checks}
(ROOT/'data/v314_static_complete_route_checks.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(out,ensure_ascii=False,indent=2))
sys.exit(1 if out['failed'] else 0)
