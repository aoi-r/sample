import fs from 'node:fs';
const root = new URL('../', import.meta.url);
const app = fs.readFileSync(new URL('js/app.js', root), 'utf8');
const cardsJson = JSON.parse(fs.readFileSync(new URL('data/cards.json', root), 'utf8'));
const cards = cardsJson.cards || [];
const failures = [];
const pass = [];
function ok(name, cond, detail='') { (cond ? pass : failures).push({name, detail}); }
function includesAll(name, text, parts){ ok(name, parts.every(p=>text.includes(p)), parts.filter(p=>!text.includes(p)).join(', ')); }
// Syntax-level and route-level tests that can run without Firebase/browser state.
includesAll('フローズンリンク: 敵盤面の氷塊だけで隣接判定', app, ["function v236EnemyUnitAdjacentToIce", "adjacentBoardPositions('enemy'", "v236Board('enemy')", "v236UnitRefs('enemyUnit'"]);
ok('フローズンリンク: 旧v235経路もv236隣接チェックへ委譲', app.includes("case 'フローズンリンク': return (typeof v236UseFrozenLink"));
includesAll('まもののツボ: 固定候補なしで6〜7コストユニットから3枚提示', app, ["function v236UseMamonoTsubo", "Number(c.cost||0)>=6", "Number(c.cost||0)<=7", ".slice(0,3)", "costOverride:0"]);
includesAll('剣の錬成: 壊れた自分の武器プールを使い+1/+1コピーを手札へ', app, ["function v237AddReforgedWeaponToHand", "copy.attack = Number(copy.attack || 0) + 1", "copy.hp = Number(copy.hp || 0) + 1", "copy.durability = Number(copy.durability || 0) + 1", "v237BrokenWeapon"]);
includesAll('剣の錬成: destroyWeapon/装備上書き/福招きで壊れた武器を記録', app, ["function v237RecordDestroyedWeapon", "destroyWeaponV111 = function", "equipWeaponToLeaderV110 = function", "福招きのそろばんBET"]);
includesAll('魔王の号令: 両手札からランダムユニットを場に出すが召喚時なし', app, ["function v236UseMaouCommand", "obj.hand.splice", "v236PutCardIntoPlay", "召喚時なし"]);
includesAll('占い: v216以降の占い使用回数は占い解決時だけ加算', app, ["countFortuneCardUseV202", "v216: 占い使用回数は実際の占い解決時にだけ加算"]);
includesAll('6〜7コストユニットpass1: 代表的な召喚/死亡効果の入口あり', app, ["function v237ApplyCost67SummonPass1", "ブラッドハンド", "エビルホーク", "ランプのまじん", "ジャックポッター", "アークデーモン", "ベリアル", "function v237ApplyCost67DeathPass1"]);
const cost67Units = cards.filter(c=>c.cardType==='ユニット' && [6,7].includes(Number(c.cost||0)) && c.flags?.deckBuildable!==false);
ok('カードDB: まもののツボ候補 6〜7コストユニットが存在', cost67Units.length > 0, `count=${cost67Units.length}`);
const mamono = cards.find(c=>c.name==='まもののツボ');
ok('カードDB: まもののツボ公式テキストは6〜7コストユニット', !!mamono && /コスト6.*7.*ユニット/.test(mamono.text||''), mamono?.text||'');
const frozen = cards.find(c=>c.name==='フローズンリンク');
ok('カードDB: フローズンリンク公式テキストは敵ユニット', !!frozen && /敵ユニット/.test(frozen.text||''), frozen?.text||'');
const result = {passed:pass.length, failed:failures.length, failures, pass};
console.log(JSON.stringify(result, null, 2));
if(failures.length) process.exit(1);
