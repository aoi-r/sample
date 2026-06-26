# v279 PvP sync loop fix

## Symptom
- Solo test room works on PC and smartphone.
- PvP room only: hand cards flicker rapidly.
- Card tap/click does not open use/cancel modal.
- Choice modal close button, battle exit, and turn end appear unresponsive.

## Root cause
This was not caused by the background image itself.
The PvP-only failure came from the v270 authoritative sync wrapper:

```js
renderBattleArena = function(){
  const r = oldRender.call(this);
  scheduleSyncV270('render');
  return r;
};
```

In PvP, Firebase state receiving calls `applyRemoteOpponentState()`, which calls `renderBattleArena()`.
Because render scheduled another `syncMyBattleState()`, two clients could bounce state writes and renders:

remote state received -> render -> local state write -> other client receives -> render -> state write ...

That rebuilt `#player-hand` repeatedly.  During this loop, pointer/click targets disappeared and were recreated, so buttons and hand cards looked visible but did not reliably receive events.
Solo mode did not hit the bug because it does not use Firebase room state sync.

## Fix
- Removed the executable render-to-sync wrapper.
- Kept explicit syncs for real state mutations/actions.
- Kept sync after `pushBattleAction()`.
- Kept sync after `endTurn()`.
- Changed v270 remote sequence handling so the same `stateSeq` is accepted only once.
- Prevented duplicate v270 snapshots from falling back to the older render path.
- Added cache busters for `app.js` and `style.css` in `index.html`.

## Validation
- `node --check js/app.js`: OK
- `tools/v279_pvp_sync_loop_static_tests.py`: 7 passed / 0 failed

Note: Browser execution was not used for the final assertion because the sandbox blocked local HTTP/file navigation, but the static checks directly verify the broken executable loop is removed and mutation-based sync remains.
