// Node 20+ 用。公式DBを巡回して cards.json に officialId / imageUrl / 構築点数 / カテゴリを補完します。
// 使い方: node tools/sync_official_gameconductor.mjs
// 方針:
// - 一覧ページだけで雑に画像を当てず、詳細ページの「名称」が完全一致した場合だけ imageUrl を入れます。
// - コスト/攻撃力/HP/効果文/カテゴリも一致度に使い、officialMatchConfidence を保存します。
// - 公式カテゴリが「トークン」かつ構築評価0のカードは deckBuildable=false 候補として marks を付けます。
import fs from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);
const cardsPath = new URL('./data/cards.json', ROOT);
const notesPath = new URL('./data/official_sync_report.json', ROOT);
const sourceUrl = 'https://gameconductor.com/dqrivals/card';
const base = 'https://gameconductor.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s ?? '').replace(/[\s　・:：、。,.()（）「」『』!！?？]/g,'').toLowerCase();
const compactText = s => norm(String(s ?? '').replace(/&amp;/g,'&'));

function textBetween(html, label){
  const re = new RegExp(`${label}\\s*([^<\\n]+)`);
  const m = html.replace(/<[^>]+>/g,'\n').match(re);
  return m ? m[1].trim() : '';
}
function numBetween(html, label){
  const t = textBetween(html,label);
  const m = t.match(/-?\d+/); return m ? Number(m[0]) : null;
}
function parseDetail(html){
  const plain = html.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,'\n').replace(/\n+/g,'\n');
  const get = label => { const m = plain.match(new RegExp(`${label}\\s*([^\\n]+)`)); return m ? m[1].trim() : ''; };
  const img = html.match(/https?:\/\/gameconductor\.com\/dqrivals\/wp-content\/uploads\/card_img_\d+\.jpg/) || html.match(/\/dqrivals\/wp-content\/uploads\/card_img_\d+\.jpg/);
  return {
    name: get('名称'),
    constructionScore: numBetween(html,'構築評価'),
    arenaScore: numBetween(html,'闘技場評価'),
    leader: get('リーダー'),
    pack: get('カードパック'),
    cost: numBetween(html,'コスト'),
    category: get('カテゴリ'),
    rarity: get('レアリティ'),
    tribe: get('種族'),
    attack: numBetween(html,'攻撃力'),
    hp: numBetween(html,'HP'),
    effect: get('効果'),
    imageUrl: img ? (String(img[0]).startsWith('http') ? img[0] : base + img[0]) : null,
  };
}

const cardsJson = JSON.parse(await fs.readFile(cardsPath, 'utf8'));
const cards = cardsJson.cards || [];
const byName = new Map();
for(const c of cards){
  const key = norm(c.name);
  if(!byName.has(key)) byName.set(key, []);
  byName.get(key).push(c);
}

const listHtml = await fetch(sourceUrl).then(r => r.text());
const linkRe = /href="\/dqrivals\/c\/d\/(\d+)"[^>]*>([^<]+)<\/a>/g;
const officialLinks = [];
let m;
while((m = linkRe.exec(listHtml))){
  officialLinks.push({officialId:Number(m[1]), name:m[2].trim(), url:`${base}/dqrivals/c/d/${m[1]}`});
}

let matched=0, imageMatched=0, mismatched=[];
for(const link of officialLinks){
  const candidates = byName.get(norm(link.name));
  if(!candidates?.length) continue;
  await sleep(120);
  const html = await fetch(link.url).then(r => r.text()).catch(e => '');
  if(!html) continue;
  const d = parseDetail(html);
  for(const card of candidates){
    const nameExact = norm(d.name) === norm(card.name);
    const costOk = d.cost == null || Number(card.cost ?? 0) === d.cost;
    const atkOk = d.attack == null || Number(card.attack ?? 0) === d.attack;
    const hpOk = d.hp == null || Number(card.hp ?? 0) === d.hp;
    const effectOk = !d.effect || compactText(card.text).includes(compactText(d.effect).slice(0,20)) || compactText(d.effect).includes(compactText(card.text).slice(0,20));
    const score = [nameExact,costOk,atkOk,hpOk,effectOk].filter(Boolean).length;
    card.official ||= {};
    card.official.site = 'gameconductor';
    card.official.officialId = link.officialId;
    card.official.cardPageUrl = link.url;
    card.official.constructionScore = d.constructionScore;
    card.official.arenaScore = d.arenaScore;
    card.official.category = d.category;
    card.official.leader = d.leader;
    card.official.pack = d.pack;
    card.official.nameOnOfficial = d.name;
    card.official.matchChecks = { nameExact, costOk, atkOk, hpOk, effectOk, score };
    card.official.officialMatchConfidence = nameExact && score >= 4 ? 'high' : nameExact ? 'medium' : 'low';
    if(nameExact && d.imageUrl){
      card.official.imageUrl = d.imageUrl || `https://gameconductor.com/dqrivals/wp-content/uploads/card_img_${link.officialId}.jpg`;
      card.official.imageStatus = 'validated_by_detail_name';
      imageMatched++;
    } else {
      delete card.official.imageUrl;
      card.official.imageStatus = 'not_set_name_mismatch_or_missing';
      mismatched.push({localName:card.name, officialName:d.name, officialId:link.officialId, url:link.url});
    }
    // 公式DB上のトークン/派生候補マーキング。自動で消しすぎないよう「候補」に留める。
    if(d.category === 'トークン' || d.constructionScore === 0){
      card.flags ||= {};
      card.flags.officialGeneratedCandidate = true;
      card.flags.deckBuildRuleReason ||= [];
      if(!card.flags.deckBuildRuleReason.includes('official_generated_candidate')) card.flags.deckBuildRuleReason.push('official_generated_candidate');
    }
    matched++;
  }
}

cardsJson.cards = cards;
cardsJson.officialSync = { sourceUrl, matched, imageMatched, totalOfficialLinks: officialLinks.length, syncedAt: new Date().toISOString(), note:'詳細ページ名称一致時のみ画像URLを採用' };
await fs.writeFile(cardsPath, JSON.stringify(cardsJson, null, 2));
await fs.writeFile(notesPath, JSON.stringify({sourceUrl, matched, imageMatched, mismatched}, null, 2));
console.log(`official links: ${officialLinks.length}`);
console.log(`matched cards: ${matched}`);
console.log(`validated images: ${imageMatched}`);
console.log(`report: ${notesPath.pathname}`);
