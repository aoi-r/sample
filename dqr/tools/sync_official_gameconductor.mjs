import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(process.cwd());
const cardsPath = path.join(ROOT, "data", "cards.json");
const listUrl = "https://gameconductor.com/dqrivals/card";
const base = "https://gameconductor.com";

const normalize = (s="") => s.replace(/\s+/g, "").replace(/[：:]/g, ":").replace(/[、，]/g, ",").trim();
const stripTags = (s="") => s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

async function fetchText(url){
  const res = await fetch(url, { headers: { "user-agent": "DQR local sync script" }});
  if(!res.ok) throw new Error(`${res.status} ${url}`);
  return await res.text();
}

function extractOfficialLinks(html){
  const rx = /<a\s+[^>]*href=["'](\/dqrivals\/c\/d\/(\d+))["'][^>]*>([\s\S]*?)<\/a>/g;
  const out = new Map();
  let m;
  while((m = rx.exec(html))){
    const name = stripTags(m[3]);
    if(!name || name.includes("Home") || name.includes("全カード一覧")) continue;
    const officialId = Number(m[2]);
    if(!out.has(`${officialId}:${name}`)) out.set(`${officialId}:${name}`, { officialId, name, url: base + m[1] });
  }
  return [...out.values()];
}

function extractField(text, label){
  const idx = text.indexOf(label);
  if(idx < 0) return "";
  let rest = text.slice(idx + label.length).trim();
  const labels = ["名称", "構築評価", "闘技場評価", "カード画像", "リーダー", "カードパック", "コスト", "カテゴリ", "レアリティ", "種族", "攻撃力", "HP", "効果", "考察"];
  let end = rest.length;
  for(const l of labels){
    const p = rest.indexOf(" " + l + " ");
    if(p > 0) end = Math.min(end, p);
  }
  return rest.slice(0,end).trim();
}

async function detail(link){
  const html = await fetchText(link.url);
  const text = stripTags(html);
  const name = extractField(text, "名称") || link.name;
  const imageMatch = html.match(/https?:\/\/[^"']*card_img_\d+\.jpg|\/dqrivals\/wp-content\/uploads\/card_img_\d+\.jpg|\/wp-content\/uploads\/card_img_\d+\.jpg/);
  const imageUrl = imageMatch ? (imageMatch[0].startsWith("http") ? imageMatch[0] : base + imageMatch[0]) : `${base}/dqrivals/wp-content/uploads/card_img_${link.officialId}.jpg`;
  return {
    ...link,
    verifiedName: name,
    imageUrl,
    leader: extractField(text, "リーダー"),
    pack: extractField(text, "カードパック"),
    category: extractField(text, "カテゴリ"),
    rarity: extractField(text, "レアリティ"),
    cost: Number(extractField(text, "コスト")) || 0,
    attack: Number(extractField(text, "攻撃力")) || 0,
    hp: Number(extractField(text, "HP")) || 0,
    effect: extractField(text, "効果"),
    constructionScore: Number((extractField(text, "構築評価").match(/\d+/)||[0])[0]),
    arenaScore: Number((extractField(text, "闘技場評価").match(/\d+/)||[0])[0])
  };
}

function scoreMatch(local, off){
  let score = 0;
  if(local.name === off.verifiedName) score += 100;
  if(Number(local.cost||0) === Number(off.cost||0)) score += 10;
  if(Number(local.attack||0) === Number(off.attack||0)) score += 5;
  if(Number(local.hp||0) === Number(off.hp||0)) score += 5;
  if(normalize(local.text||"") && normalize(off.effect||"") && normalize(local.text||"") === normalize(off.effect||"")) score += 40;
  if(local.rarity && off.rarity && local.rarity === off.rarity) score += 10;
  return score;
}

const raw = JSON.parse(await fs.readFile(cardsPath, "utf8"));
const cards = raw.cards;
const byName = new Map();
for(const c of cards){
  if(!byName.has(c.name)) byName.set(c.name, []);
  byName.get(c.name).push(c);
}

const html = await fetchText(listUrl);
const links = extractOfficialLinks(html);
console.log(`official links: ${links.length}`);

const report = { matched: [], ambiguous: [], missing: [], errors: [] };
let i = 0;
for(const link of links){
  i++;
  try{
    const off = await detail(link);
    const candidates = byName.get(off.verifiedName) || byName.get(link.name) || [];
    if(!candidates.length){ report.missing.push(off); continue; }
    candidates.sort((a,b)=>scoreMatch(b,off)-scoreMatch(a,off));
    const best = candidates[0];
    const bestScore = scoreMatch(best, off);
    const secondScore = candidates[1] ? scoreMatch(candidates[1], off) : -1;
    if(bestScore < 100 || secondScore === bestScore){
      report.ambiguous.push({ official: off, candidates: candidates.map(c=>({ id:c.id, name:c.name, text:c.text, score:scoreMatch(c,off) })) });
      continue;
    }
    best.official = {
      site: "gameconductor",
      officialId: off.officialId,
      verifiedName: off.verifiedName,
      nameVerified: true,
      imageVerified: true,
      cardPageUrl: off.url,
      imageUrl: off.imageUrl,
      constructionScore: off.constructionScore,
      arenaScore: off.arenaScore,
      leader: off.leader,
      pack: off.pack,
      category: off.category,
      rarity: off.rarity,
      syncMethod: "detail_page_exact_name_plus_stats"
    };
    if(off.category === "トークン"){
      best.cardType = "トークン";
      best.flags = best.flags || {};
      best.flags.deckBuildable = false;
      best.flags.obtainOnly = true;
      best.flags.generatedOrEvolved = true;
      best.flags.deckBuildRuleReason = [...new Set([...(best.flags.deckBuildRuleReason||[]), "official_token_category"])] ;
    }
    report.matched.push({ cardId: best.id, name: best.name, officialId: off.officialId });
  }catch(e){ report.errors.push({ link, error: String(e) }); }
  if(i % 50 === 0) console.log(`${i}/${links.length}`);
}
await fs.writeFile(cardsPath, JSON.stringify(raw, null, 2), "utf8");
await fs.writeFile(path.join(ROOT, "data", "official_sync_report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`matched=${report.matched.length} ambiguous=${report.ambiguous.length} missing=${report.missing.length} errors=${report.errors.length}`);
