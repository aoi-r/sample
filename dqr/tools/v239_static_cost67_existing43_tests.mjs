import fs from 'fs';
const app = fs.readFileSync('js/app.js','utf8');
const cards = JSON.parse(fs.readFileSync('data/cards.json','utf8')).cards;
const audit = JSON.parse(fs.readFileSync('data/v239_cost67_existing43_runtime_audit.json','utf8'));
const tests=[];
function ok(name, cond, detail=''){ tests.push({name, ok:!!cond, detail}); }
function card(name){ return cards.find(c=>c.name===name); }
const existing43 = audit.rows.map(r=>r.name);
ok('v239CompletionMarker exists', /function v239CompletionMarker\(\)/.test(app));
ok('existing runtime bucket is closed', audit.summary.remaining_runtime_bucket===0, JSON.stringify(audit.summary));
ok('all 43 names are represented in audit', existing43.length===43, `count=${existing43.length}`);
ok('regular マルティナ hardened', app.includes('function v239RegularMartinaSummon') && app.includes("name!=='マルティナ'") && app.includes('v239DamageRandomEnemyColumnSlots'));
ok('ヒドラ discard-count keywords hardened', app.includes('function v239ApplyHydraDiscardKeywords') && app.includes('discardedCardsThisMatch') && app.includes('doubleAttack'));
ok('basic keyword cards text remains correct', ['テラノライナー','ガメゴン','デンデン竜','全てを滅ぼす者ゾーマ'].every(n=>!!card(n)?.text));
ok('dragon key existing hooks still present', ['ドラゴンガイア','ドラゴンロード','グレイナル','ワイバーンドッグ','竜将ドラゴンガイア'].every(n=>app.includes(n)));
ok('battle-damage multiplier for ジャコラ exists', app.includes('combatDamageMultiplier = 2'));
ok('discard hook wraps discardHandCardAtIndex after v239', app.includes('_v239_orig_discardHandCardAtIndex'));
const failed=tests.filter(t=>!t.ok);
const out={passed:tests.length-failed.length, failed:failed.length, failures:failed, pass:tests.filter(t=>t.ok)};
fs.writeFileSync('data/v239_static_cost67_existing43_tests.json', JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
if(failed.length) process.exit(1);
