import fs from 'fs';
const app = fs.readFileSync('js/app.js','utf8');
const cards = JSON.parse(fs.readFileSync('data/cards.json','utf8')).cards;
const audit = fs.existsSync('data/v237_cost6_7_unit_pool_audit.csv') ? fs.readFileSync('data/v237_cost6_7_unit_pool_audit.csv','utf8') : '';
const tests=[];
function ok(name, cond, detail=''){ tests.push({name, ok:!!cond, detail}); }
function card(name){ return cards.find(c=>c.name===name); }
const implemented = [
 'ジャミラス','メガボーグ','エメラルドーン','悪の化身りゅうおう','れんごくちょう','サイクロプス','クレイジーボーナス','ヘルチェイサー','ヌーデビル','からくりしょうぐん','牙王ゴースネル','デビルアーマー','ムチおとこ','ダークキング','エビルマージ','リーズレット','悪霊の神々バズズ','ハッサン','キラーデーモン','チャモロ','マルチェロ','悪霊の神々ベリアル','タコメット','かぶとこぞう','ダイヤモンドスライム','レジェンドホーン','ジェリーマン','プラチナキング','デュラハーン','わかめ王子','サイコマスター','タタリ御前','ドルマゲス','アスラ王','魔女グレイツェル','ヘルバオム','魔勇者アンルシア','アフロのドン・モグーラ','薔薇子ジャックポッター',
 'ゆうれいせんちょう','キングミミック','邪神官ハーゴン','悪霊の神々アトラス','ウドラー'
];
ok('v238ValidationMarker exists', /function v238ValidationMarker\(\)/.test(app));
ok('v238 pass2 summon switch includes 39 named entries', implemented.filter(n=>app.includes(`case '${n}'`)).length >= 39, `found=${implemented.filter(n=>app.includes(`case '${n}'`)).length}`);
ok('v238 death pass covers key deathrattles', ['ゆうれいせんちょう','キングミミック','邪神官ハーゴン','悪霊の神々アトラス','ウドラー'].every(n=>app.includes(`case '${n}'`)));
ok('v238 tension links cover アンクルホーン/マザーウッド/マッスルウータン/カロン/ドン・モグーラ', ['アンクルホーン','マザーウッド','マッスルウータン','カロン','ドン・モグーラ'].every(n=>app.includes(`unit.name==='${n}'`)));
ok('v238 spell watchers cover ウインドマージ/ようじゅつし/モリー', ['ウインドマージ','ようじゅつし','モリー'].every(n=>app.includes(`u.name==='${n}'`)));
ok('まもののツボ exists and text says 6〜7 cost units', /まもののツボ/.test(app) && /6〜7/.test(card('まもののツボ')?.text||''), card('まもののツボ')?.text||'');
const cost67 = cards.filter(c=>c.cardType==='ユニット' && [6,7].includes(Number(c.cost||0)) && c.flags?.deckBuildable!==false);
ok('cost6/7 unit pool exists', cost67.length>=140, `count=${cost67.length}`);
ok('official-like text exists for key pass2 cards', ['ムチおとこ','ダイヤモンドスライム','デュラハーン','薔薇子ジャックポッター'].every(n=>!!card(n)?.text), ['ムチおとこ','ダイヤモンドスライム','デュラハーン','薔薇子ジャックポッター'].map(n=>`${n}:${card(n)?.text||''}`).join(' | '));
const failed=tests.filter(t=>!t.ok);
const out={passed:tests.length-failed.length, failed:failed.length, failures:failed, pass:tests.filter(t=>t.ok)};
fs.writeFileSync('data/v238_static_cost67_tests.json', JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
if(failed.length) process.exit(1);
