#!/usr/bin/env node
/**
 * Official GameConductor sync for DQR deckbuilder.
 *
 * Usage:
 *   node tools/sync_official_gameconductor.mjs
 *
 * What it does:
 *   1. Fetches https://gameconductor.com/dqrivals/card
 *   2. Extracts every <a href="/dqrivals/c/d/{id}">card name</a> from the official list.
 *   3. Opens each matched detail page.
 *   4. Applies official.imageUrl ONLY when the detail page's 名称 exactly matches local cards.json name.
 *   5. Sets deckBuildable=false for official category トークン, except cards explicitly overridden in deck_rules.json.
 *
 * This script intentionally prefers missing images over wrong images.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const cardsPath = path.join(ROOT, 'data', 'cards.json');
const rulesPath = path.join(ROOT, 'data', 'deck_rules.json');
const reportPath = path.join(ROOT, 'data', 'official_sync_report.json');
const mapPath = path.join(ROOT, 'data', 'official_image_map.json');
const BASE = 'https://gameconductor.com';
const LIST_URL = `${BASE}/dqrivals/card`;

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#038;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
function norm(s) {
  return String(s ?? '')
    .replace(/\s+/g, '')
    .replace(/[：]/g, ':')
    .replace(/[－−]/g, '-')
    .trim();
}
function extractField(text, label, nextLabels) {
  const start = text.indexOf(label);
  if (start < 0) return '';
  let from = start + label.length;
  let to = text.length;
  for (const n of nextLabels) {
    const p = text.indexOf(n, from);
    if (p >= 0 && p < to) to = p;
  }
  return text.slice(from, to).trim();
}
async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 DQR private deckbuilder sync' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${url}`);
  return await res.text();
}
async function main() {
  const cardsJson = JSON.parse(await fs.readFile(cardsPath, 'utf8'));
  let rules = {};
  try { rules = JSON.parse(await fs.readFile(rulesPath, 'utf8')); } catch {}
  const explicitDeckable = new Set((rules.forceDeckBuildableNames || rules.deckBuildableNames || []).map(norm));
  const explicitNonDeck = new Set((rules.forceNonDeckBuildableNames || []).map(norm));

  console.log('Fetching official list:', LIST_URL);
  const listHtml = await fetchText(LIST_URL);
  const linkRe = /<a\s+[^>]*href=["'](\/dqrivals\/c\/d\/(\d+))["'][^>]*>([\s\S]*?)<\/a>/gi;
  const byName = new Map();
  let m;
  while ((m = linkRe.exec(listHtml))) {
    const officialId = m[2];
    const name = stripTags(m[3]);
    if (!name || name === '全カード一覧') continue;
    const key = norm(name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push({ officialId, name, pageUrl: `${BASE}/dqrivals/c/d/${officialId}` });
  }
  console.log('Official anchors:', byName.size);

  const report = { generatedAt: new Date().toISOString(), matched: [], unmatched: [], ambiguous: [], failed: [] };
  const imageMap = {};

  for (const card of cardsJson.cards) {
    const key = norm(card.name);
    const hits = byName.get(key) || [];
    if (!hits.length) {
      card.official = { ...(card.official || {}), imageVerified: false, nameVerified: false, imageStatus: 'not_found_in_official_list_by_exact_name' };
      report.unmatched.push({ id: card.id, name: card.name });
      continue;
    }
    // If duplicates exist, pick the one whose detail page exact name + basic stats best match.
    let best = null;
    let bestScore = -1;
    for (const hit of hits) {
      try {
        const html = await fetchText(hit.pageUrl);
        const text = stripTags(html);
        const officialName = extractField(text, '名称', ['構築評価', '闘技場評価', 'カード画像', 'リーダー']);
        if (norm(officialName) !== key) continue;
        const cost = extractField(text, 'コスト', ['カテゴリ', 'レアリティ']);
        const category = extractField(text, 'カテゴリ', ['レアリティ', '分解で', '生成に']);
        const rarity = extractField(text, 'レアリティ', ['分解で', '生成に', '種族', '攻撃力', 'HP', '効果']);
        const atk = extractField(text, '攻撃力', ['HP', '効果', '考察']);
        const hp = extractField(text, 'HP', ['効果', '考察']);
        const effect = extractField(text, '効果', ['考察', 'カード評価点数の基準']);
        let score = 10;
        if (String(card.cost ?? '') === cost) score += 3;
        if (String(card.attack ?? '') === atk) score += 1;
        if (String(card.hp ?? '') === hp) score += 1;
        if (norm(card.text || '') && norm(effect).includes(norm(card.text || '').slice(0, 20))) score += 3;
        if (norm(card.rarity || '') === norm(rarity)) score += 1;
        if (score > bestScore) {
          bestScore = score;
          best = { ...hit, officialName, cost, category, rarity, atk, hp, effect, score };
        }
      } catch (e) {
        report.failed.push({ id: card.id, name: card.name, pageUrl: hit.pageUrl, error: String(e.message || e) });
      }
    }
    if (!best) {
      report.ambiguous.push({ id: card.id, name: card.name, hits });
      card.official = { ...(card.official || {}), imageVerified: false, nameVerified: false, imageStatus: 'official_list_hit_but_detail_name_not_verified' };
      continue;
    }
    const imageUrl = `${BASE}/dqrivals/wp-content/uploads/card_img_${best.officialId}.jpg`;
    card.official = {
      ...(card.official || {}),
      site: 'gameconductor',
      officialId: best.officialId,
      verifiedName: best.officialName,
      nameVerified: true,
      imageVerified: true,
      cardPageUrl: best.pageUrl,
      imageUrl,
      category: best.category,
      rarity: best.rarity || card.rarity,
      officialEffect: best.effect,
      syncScore: best.score,
      syncMethod: 'official_anchor_and_detail_exact_name_match'
    };
    imageMap[card.name] = { officialId: best.officialId, imageUrl, cardPageUrl: best.pageUrl };
    if (norm(best.category) === norm('トークン') && !explicitDeckable.has(key)) {
      card.flags = { ...(card.flags || {}), deckBuildable: false };
      card.cardType = 'トークン';
      card.generatedKind = card.generatedKind || 'official_token';
    }
    if (explicitNonDeck.has(key)) {
      card.flags = { ...(card.flags || {}), deckBuildable: false };
    }
    report.matched.push({ id: card.id, name: card.name, officialId: best.officialId, imageUrl, category: best.category, score: best.score });
  }

  await fs.writeFile(cardsPath, JSON.stringify(cardsJson, null, 2), 'utf8');
  await fs.writeFile(mapPath, JSON.stringify(imageMap, null, 2), 'utf8');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`Done. matched=${report.matched.length} unmatched=${report.unmatched.length} ambiguous=${report.ambiguous.length} failed=${report.failed.length}`);
  console.log('Wrote:', cardsPath, mapPath, reportPath);
}

main().catch(err => { console.error(err); process.exit(1); });
