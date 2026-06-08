#!/usr/bin/env node
/**
 * Sync GameConductor official card pages safely.
 * Usage: node tools/sync_official_gameconductor.mjs
 *
 * This script fetches https://gameconductor.com/dqrivals/card,
 * extracts every <a href="/dqrivals/c/d/{id}">name</a>, then opens each detail page.
 * It only writes official.imageUrl when the detail page's 名称 exactly matches cards.json's name.
 */
import fs from 'node:fs/promises';
const ROOT = new URL('..', import.meta.url);
const cardsPath = new URL('../data/cards.json', import.meta.url);
const listUrl = 'https://gameconductor.com/dqrivals/card';
const base = 'https://gameconductor.com';
const sleep = ms => new Promise(r => setTimeout(r, ms));
function clean(s){ return String(s||'').replace(/\s+/g,' ').trim(); }
function stripTags(s){ return clean(String(s||'').replace(/<[^>]+>/g,' ')); }
function extractField(html, label){
  const re = new RegExp(`${label}\\s*([^<\\n]+)`, 'u');
  const m = stripTags(html).match(re);
  return m ? clean(m[1]) : '';
}
async function fetchText(url){
  const r = await fetch(url, {headers:{'user-agent':'Mozilla/5.0 DQR private deckbuilder sync'}});
  if(!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.text();
}
const data = JSON.parse(await fs.readFile(cardsPath, 'utf8'));
const byName = new Map(data.cards.map(c => [c.name, c]));
const listHtml = await fetchText(listUrl);
const linkRe = /<a[^>]+href=["']([^"']*\/dqrivals\/c\/d\/(\d+)[^"']*)["'][^>]*>(.*?)<\/a>/gisu;
const officialRows = [];
let m;
while((m = linkRe.exec(listHtml))){
  const href = m[1].startsWith('http') ? m[1] : base + m[1];
  const officialId = m[2];
  const name = stripTags(m[3]);
  if(name && byName.has(name)) officialRows.push({name, officialId, href});
}
const report = {listUrl, totalCards:data.cards.length, listMatches:officialRows.length, verified:[], notFoundInList:[], mismatches:[], errors:[]};
for(const c of data.cards){
  c.official = {site:'gameconductor', imageVerified:false, nameVerified:false, imageStatus:'not_synced'};
}
for(let i=0;i<officialRows.length;i++){
  const row = officialRows[i];
  const c = byName.get(row.name);
  try{
    await sleep(120);
    const html = await fetchText(row.href);
    const detailName = extractField(html, '名称');
    const buildScore = extractField(html, '構築評価').match(/\d+/)?.[0] ?? null;
    const arenaScore = extractField(html, '闘技場評価').match(/\d+/)?.[0] ?? null;
    const category = extractField(html, 'カテゴリ');
    if(detailName === c.name){
      c.official = {
        site:'gameconductor', officialId:row.officialId, cardPageUrl:row.href,
        imageUrl:`https://gameconductor.com/dqrivals/wp-content/uploads/card_img_${row.officialId}.jpg`,
        imageVerified:true, nameVerified:true,
        buildScore: buildScore ? Number(buildScore) : null,
        arenaScore: arenaScore ? Number(arenaScore) : null,
        category,
        imageStatus:'verified_by_detail_name_match'
      };
      report.verified.push({name:c.name, officialId:row.officialId});
    }else{
      report.mismatches.push({localName:c.name, listName:row.name, detailName, officialId:row.officialId, href:row.href});
    }
  }catch(e){ report.errors.push({name:row.name, officialId:row.officialId, error:String(e)}); }
  if(i%50===0) console.log(`checked ${i}/${officialRows.length}`);
}
for(const c of data.cards){
  if(!c.official?.nameVerified) report.notFoundInList.push({name:c.name,id:c.id});
}
await fs.writeFile(cardsPath, JSON.stringify(data,null,2));
await fs.writeFile(new URL('../data/official_sync_report.json', import.meta.url), JSON.stringify(report,null,2));
console.log(`verified images: ${report.verified.length}/${data.cards.length}`);
console.log('wrote data/official_sync_report.json');
