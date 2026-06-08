// Node 20+ 用。公式DBを巡回して cards.json に officialId / imageUrl / constructionScore / category を補完する補助ツール。
// 使い方: node tools/sync_official_gameconductor.mjs
import fs from 'node:fs/promises';
const ROOT = new URL('../', import.meta.url);
const cardsPath = new URL('./data/cards.json', ROOT);
const sourceUrl = 'https://gameconductor.com/dqrivals/card';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s ?? '').replace(/[\s　・:：]/g,'').toLowerCase();
const cardsJson = JSON.parse(await fs.readFile(cardsPath, 'utf8'));
const cards = cardsJson.cards || [];
const byName = new Map(cards.map(c => [norm(c.name), c]));
const html = await fetch(sourceUrl).then(r => r.text());
const rowRe = /href="\/dqrivals\/c\/d\/(\d+)"[^>]*>([^<]+)<\/a>\s*(\d+)\s*(\d+)\s*(\d+)\s*([\s\S]*?)\s+(\d+)\s+(\d+)\s+([^<\n]+)/g;
let m, matched = 0;
while((m = rowRe.exec(html))){
  const [, id, name, cost, atk, hp, effect, constructed, arena, rarity] = m;
  const card = byName.get(norm(name));
  if(!card) continue;
  card.official ||= {};
  card.official.site = 'gameconductor';
  card.official.officialId = Number(id);
  card.official.cardPageUrl = `https://gameconductor.com/dqrivals/c/d/${id}`;
  card.official.imageUrl = `https://gameconductor.com/dqrivals/wp-content/uploads/card_img_${id}.jpg`;
  card.official.constructionScore = Number(constructed);
  card.official.arenaScore = Number(arena);
  card.official.rarityText = rarity.trim();
  matched++;
}
for(const c of cards){
  if(c.official?.constructionScore === 0 && c.cardType !== 'ヒーロー'){
    c.flags ||= {};
    c.flags.deckBuildable = false;
    c.flags.obtainOnly = true;
    c.flags.generatedOrEvolved = true;
    c.flags.deckBuildRuleReason ||= [];
    if(!c.flags.deckBuildRuleReason.includes('official_construction_score_zero')) c.flags.deckBuildRuleReason.push('official_construction_score_zero');
  }
}
cardsJson.cards = cards;
cardsJson.officialSync = { sourceUrl, matched, syncedAt: new Date().toISOString() };
await fs.writeFile(cardsPath, JSON.stringify(cardsJson, null, 2));
console.log(`matched ${matched} cards. Updated ${cardsPath.pathname}`);
