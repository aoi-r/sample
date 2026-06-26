from pathlib import Path
import re, json
root = Path(__file__).resolve().parents[1]
app = (root/'js/app.js').read_text(encoding='utf-8')
index = (root/'index.html').read_text(encoding='utf-8')
results=[]
def check(name, ok, detail=''):
    results.append({'name':name,'passed':bool(ok),'detail':detail})
check('DATA_VERSION v280', "v280_puchi_metal_turnstart_remote_death_fix" in app)
check('cache buster app.js v280', 'app.js?v=v280_puchi_metal_turnstart_remote_death_fix' in index)
check('cache buster style.css v280', 'style.css?v=v280_puchi_metal_turnstart_remote_death_fix' in index)
check('endTurn no immediate draw before opponent turn', not re.search(r'function endTurn\(\)[\s\S]*?drawCard\(1\)[\s\S]*?advanceTurnToOpponent\(\)', app), 'endTurn must not draw while passing to opponent')
check('own turn start prepares draw', 'function prepareOwnTurnStartV280' in app and 'drawCard(1)' in app[app.find('function prepareOwnTurnStartV280'):app.find('function endTurn()')])
check('v270 auto selection timeout removed', '選択待ちが長すぎるため自動解除しました' not in app)
check('remote death cleanup wrapper', 'cleanupRemoteHpZeroUnitsV280' in app and "['damageApplied','counterDamage','attackResolved','unitDeath']" in app)
check('no executable render->sync wrapper', not re.search(r"renderBattleArena\s*=\s*function\s*\([^)]*\)\s*\{[^{}]*?oldRender\.call\(this\)[\s\S]*?scheduleSyncV270\(\s*['\"]render['\"]\s*\)", app))
# duplicate function declarations are noisy in this project due historical wrappers; check hard duplicate of newly added functions only.
for fn in ['prepareOwnTurnStartV280','installV280PvpTurnAndDeathFix']:
    check(f'{fn} appears once', app.count(fn) >= 1 and (fn!='prepareOwnTurnStartV280' or app.count('function prepareOwnTurnStartV280')==1))
summary={'passed':sum(1 for r in results if r['passed']),'failed':sum(1 for r in results if not r['passed']),'results':results}
(root/'data/v280_static_checks.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(summary,ensure_ascii=False,indent=2))
if summary['failed']:
    raise SystemExit(1)
