import json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
app=(ROOT/'js/app.js').read_text(encoding='utf-8')
css=(ROOT/'css/style.css').read_text(encoding='utf-8')
idx=(ROOT/'index.html').read_text(encoding='utf-8')
checks=[
 ("DATA_VERSION v284", "v284_landscape_wide_slots_pvp_board_patch" in app),
 ("cache app v284", "app.js?v=v284_landscape_wide_slots_pvp_board_patch" in idx),
 ("cache css v284", "style.css?v=v284_landscape_wide_slots_pvp_board_patch" in idx),
 ("boardPatch action installed", "boardPatchV284" in app and "applyBoardPatchV284" in app),
 ("summon sends board patch", "summonUnitFromHandToBoard" in app and "sendBoardPatchV284('summon')" in app),
 ("put into play sends board patch", "sendBoardPatchV284('putIntoPlay')" in app),
 ("death sends board patch", "sendBoardPatchV284('resolveDeaths')" in app),
 ("hand IDs not sent in board patch", "handIds" not in app[app.find("function makeBoardPatchPayloadV284"):app.find("function applyUnitPatchV284")]),
 ("wide slots css", "minmax(92px, 1fr)" in css and "max-width:190px" in css),
 ("enemy leader mirrored css", "right:clamp(58px, 11vw, 160px)" in css),
]
out={"passed":sum(1 for _,ok in checks if ok),"failed":sum(1 for _,ok in checks if not ok),"results":[{"name":n,"passed":bool(ok)} for n,ok in checks]}
print(json.dumps(out,ensure_ascii=False,indent=2))
raise SystemExit(0 if out["failed"]==0 else 1)
