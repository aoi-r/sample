from pathlib import Path
import re, json
root = Path(__file__).resolve().parents[1]
app = (root/'js/app.js').read_text(encoding='utf-8')
index = (root/'index.html').read_text(encoding='utf-8')
results = []

def check(name, ok, detail=''):
    results.append({'name': name, 'passed': bool(ok), 'detail': detail})

# Active v270 render wrapper must not exist. Comments are allowed, executable wrapper is not.
active_render_wrapper = re.search(
    r"renderBattleArena\s*=\s*function\s*\([^)]*\)\s*\{[^{}]*?oldRender\.call\(this\)[\s\S]*?scheduleSyncV270\(\s*['\"]render['\"]\s*\)",
    app
)
check('no executable render->sync wrapper', not active_render_wrapper, 'renderBattleArena must not schedule Firebase sync just because UI rendered')
check('duplicate v270 seq is rejected', 'seq <= old' in app, 'same remote stateSeq must not trigger another render')
check('duplicate v270 does not fallback to old renderer', "if(entry?.v270Snapshot || entry?.stateSeq) return false" in app, 'duplicate v270 snapshots are ignored, not rendered by old fallback')
check('real actions still schedule sync', "scheduleSyncV270(`action:${type}`)" in app, 'pushBattleAction still syncs real game mutations')
check('end turn still schedules sync', "scheduleSyncV270('endTurn')" in app, 'endTurn still syncs turn change')
check('cache buster app.js', 'app.js?v=v279_pvp_sync_loop_fix' in index, 'GitHub Pages/PWA should not keep stale app.js')
check('cache buster style.css', 'style.css?v=v279_pvp_sync_loop_fix' in index, 'GitHub Pages/PWA should not keep stale style.css')

failed = [r for r in results if not r['passed']]
print(json.dumps({'passed': len(results)-len(failed), 'failed': len(failed), 'results': results}, ensure_ascii=False, indent=2))
if failed:
    raise SystemExit(1)
