import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getDatabase, ref, set, push, remove, onValue, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const state = {
  cards: [], allCards: [], systems: {}, strategies: {}, choices: {}, coin: {}, dungeons: {}, fortune: {}, heroes: {}, exchanges: {}, generatedCards: {},
  classes: [], cardTypes: [], rarities: [], userDecks: {},
  username: localStorage.getItem('dqr_username') || '',
  deviceId: localStorage.getItem('dqr_device_id') || crypto.randomUUID(),
  selectedClass: '', selectedHeroId: '', deck: new Map(),
  firebase: { enabled: false, app: null, auth: null, db: null, uid: null }
};
localStorage.setItem('dqr_device_id', state.deviceId);

const $ = id => document.getElementById(id);
const screens = ['start','user','menu','deckbuilder','battle'];
const fallbackClasses = ['共通','戦士','魔法使い','武闘家','僧侶','商人','占い師','魔剣士','盗賊'];

init().catch(err => {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin', `<div class="toast bad">初期化エラー: ${escapeHtml(err.message)}</div>`);
});

async function init(){
  await loadData();
  setupFirebase();
  bindEvents();
  fillControls();
  loadLocalDecks();
  if(state.username) $('username-input').value = state.username;
  updateLoginStatus();
}

async function loadJson(path, fallback = {}){
  try{ const r = await fetch(path); if(!r.ok) throw new Error(`${path}: ${r.status}`); return await r.json(); }
  catch(e){ console.warn(e); return fallback; }
}

async function loadData(){
  const [cards, systems, strategies, choices, coin, dungeons, fortune, heroes, exchanges, generatedCards] = await Promise.all([
    loadJson('./data/cards.json', {cards: []}),
    loadJson('./data/systems.json', {}),
    loadJson('./data/strategies.json', {}),
    loadJson('./data/choices.json', {cards: []}),
    loadJson('./data/coin.json', {cards: []}),
    loadJson('./data/dungeons.json', {cards: []}),
    loadJson('./data/fortune.json', {cards: []}),
    loadJson('./data/heroes.json', {heroes: [], relatedCards: []}),
    loadJson('./data/exchanges.json', {cards: []}),
    loadJson('./data/generated_cards.json', {cards: []})
  ]);
  state.systems = systems; state.strategies = strategies; state.choices = choices; state.coin = coin;
  state.dungeons = dungeons; state.fortune = fortune; state.heroes = heroes; state.exchanges = exchanges; state.generatedCards = generatedCards;
  state.allCards = cards.cards || [];
  state.cards = state.allCards.filter(c => c.flags?.deckBuildable !== false && c.cardType !== "トークン");
  state.classes = (cards.classes || fallbackClasses).filter(c => c !== '共通');
  state.cardTypes = cards.cardTypes || [...new Set(state.cards.map(c => c.cardType).filter(Boolean))];
  state.rarities = [...new Set(state.cards.map(c => c.rarity).filter(Boolean))];
}

function setupFirebase(){
  const invalid = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes('PASTE_');
  if(invalid){ $('login-status').textContent = 'Firebase未設定：保存はブラウザ内バックアップになります。'; return; }
  try{
    state.firebase.app = initializeApp(firebaseConfig);
    state.firebase.auth = getAuth(state.firebase.app);
    state.firebase.db = getDatabase(state.firebase.app);
    state.firebase.enabled = true;
    signInAnonymously(state.firebase.auth).catch(err => toast('Firebase匿名ログイン失敗: '+err.message, false));
    onAuthStateChanged(state.firebase.auth, user => {
      state.firebase.uid = user?.uid || null;
      updateLoginStatus();
      subscribeFirebaseDecks();
    });
  }catch(e){ toast('Firebase初期化失敗: '+e.message, false); }
}

function bindEvents(){
  document.querySelector('.tap-start').addEventListener('click', () => show('user'));
  document.querySelector('.tap-start').addEventListener('keydown', e => { if(e.key === 'Enter') show('user'); });
  $('username-ok').addEventListener('click', saveUsername);
  $('username-input').addEventListener('keydown', e => { if(e.key === 'Enter') saveUsername(); });
  $('open-deckbuilder').addEventListener('click', () => { show('deckbuilder'); renderAll(); });
  $('open-battle').addEventListener('click', () => show('battle'));
  document.querySelectorAll('.back-menu').forEach(b => b.addEventListener('click', () => show('menu')));
  $('class-select').addEventListener('change', e => changeClass(e.target.value));
  ['search-input','type-filter','cost-filter','rarity-filter'].forEach(id => $(id).addEventListener('input', renderCards));
  $('clear-deck').addEventListener('click', () => { state.deck.clear(); state.selectedHeroId=''; renderAll(); });
  $('save-deck').addEventListener('click', saveDeck);
  $('export-deck').addEventListener('click', exportDeck);
  $('import-deck').addEventListener('change', importDeck);
  $('modal-close').addEventListener('click', () => $('card-modal').close());
}

function fillControls(){
  for(const c of state.classes) $('class-select').add(new Option(c, c));
  for(const t of state.cardTypes) $('type-filter').add(new Option(t, t));
  for(let i=0;i<=12;i++) $('cost-filter').add(new Option(String(i), String(i)));
  $('cost-filter').add(new Option('13以上', '13+'));
  for(const r of state.rarities) $('rarity-filter').add(new Option(r, r));
}

function fillHeroSelect(){}

function saveUsername(){
  const name = $('username-input').value.trim();
  if(!name) return toast('ユーザ名を入力してください。', false);
  state.username = name; localStorage.setItem('dqr_username', name);
  updateLoginStatus(); show('menu');
}

function updateLoginStatus(){
  $('welcome-title').textContent = `${state.username || 'プレイヤー'} さん`;
  const uid = state.firebase.uid ? `Firebase接続済み / uid: ${state.firebase.uid.slice(0,8)}…` : 'Firebase未接続または設定待ち';
  $('login-status').textContent = `${uid} / device: ${state.deviceId.slice(0,8)}…`;
}

function show(name){ screens.forEach(s => $(`screen-${s}`).classList.toggle('active', s === name)); updateLoginStatus(); }

function changeClass(next){
  if(next !== state.selectedClass && state.deck.size){ state.deck.clear(); state.selectedHeroId=''; toast('職業を変更したのでデッキをリセットしました。'); }
  state.selectedClass = next; renderAll();
}

function visibleCards(){
  if(!state.selectedClass) return [];
  const q = normalize($('search-input').value), type = $('type-filter').value, cost = $('cost-filter').value, rarity = $('rarity-filter').value;
  return state.cards.filter(card => {
    const classes = card.classes || [];
    if(!(classes.includes('共通') || classes.includes(state.selectedClass))) return false;
    if(type && card.cardType !== type) return false;
    if(rarity && card.rarity !== rarity) return false;
    if(cost){ const c = Number(card.cost ?? 0); if(cost === '13+' ? c < 13 : c !== Number(cost)) return false; }
    if(q && !normalize(`${card.searchText || ''} ${card.name} ${card.text} ${(card.keywords||[]).join(' ')}`).includes(q)) return false;
    return true;
  }).sort((a,b) => (a.cost ?? 0) - (b.cost ?? 0) || String(a.name).localeCompare(String(b.name),'ja'));
}

function getOfficialImage(card){
  return card.official?.imageVerified === true && card.official?.imageUrl ? card.official.imageUrl : '';
}

function renderCards(){
  const grid = $('card-grid'); grid.innerHTML = '';
  if(!state.selectedClass){ $('card-count-label').textContent = 'まず職業を選択してください。'; return; }
  const cards = visibleCards(); $('card-count-label').textContent = `${cards.length}枚表示`;
  const tpl = $('card-template');
  for(const card of cards){
    const count = state.deck.get(card.id) || 0, max = maxCopies(card);
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector('.cost').textContent = card.cost ?? '-';
    node.querySelector('.name').textContent = card.name;
    const imgUrl = getOfficialImage(card);
    if(imgUrl){
      const img = document.createElement('img');
      img.className = 'card-thumb'; img.loading = 'lazy'; img.src = imgUrl; img.alt = card.name;
      img.onerror = () => img.remove();
      node.prepend(img);
    }
    node.querySelector('.owned').textContent = count ? `×${count}` : '';
    node.querySelector('.card-meta').textContent = `${card.cardType || ''} / ${(card.classes||[]).join('・')} / ${card.rarity || ''}`;
    node.querySelector('.card-text').textContent = card.text || '—';
    node.querySelector('.stats').textContent = card.cardType === 'ユニット' ? `${card.attack ?? '-'} / ${card.hp ?? '-'}` : weaponStats(card);
    node.querySelector('.chips').innerHTML = (card.keywords || []).slice(0,4).map(k => `<span class="chip">${escapeHtml(k)}</span>`).join('');
    const btn = node.querySelector('.add-card'), can = canAdd(card).ok;
    btn.disabled = !can; btn.textContent = count >= max ? '上限' : '追加'; if(!can) node.classList.add('disabled');
    btn.addEventListener('click', () => addCard(card));
    node.querySelector('.detail-card').addEventListener('click', () => showCardDetail(card));
    grid.appendChild(node);
  }
}

function weaponStats(card){ return card.cardType === '武器' ? `${card.attack ?? '-'} / ${card.hp ?? '-'}` : ''; }

function renderDeck(){
  const list = $('selected-list'); list.innerHTML = '';
  const deckCards = [...state.deck.entries()].map(([id,count]) => ({card: byId(id), count})).filter(x => x.card)
    .sort((a,b) => (a.card.cost ?? 0) - (b.card.cost ?? 0) || a.card.name.localeCompare(b.card.name,'ja'));
  if(!deckCards.length){ list.className = 'selected-list empty'; list.textContent = 'カードを選択してください'; }
  else{
    list.className = 'selected-list';
    for(const {card,count} of deckCards){
      const row = document.createElement('div'); row.className='selected-row';
      row.innerHTML = `<span>${card.cost ?? '-'} ${escapeHtml(card.name)}</span><strong>×${count}</strong>`;
      const minus = document.createElement('button'); minus.textContent='−'; minus.onclick=()=>removeCard(card.id);
      row.appendChild(minus); list.appendChild(row);
    }
  }
  const heroCards = deckCards.filter(x => x.card.cardType === 'ヒーロー');
  if(heroCards.length){
    state.selectedHeroId = heroCards.map(x => { const hero = (state.heroes.heroes || []).find(h => h.starterCardId === x.card.id); return hero?.heroId || x.card.id; }).join(',');
    $('hero-status').textContent = heroCards.map(x => `${x.card.name}×${x.count}`).join(' / ');
  } else {
    state.selectedHeroId = '';
    $('hero-status').textContent = '未投入';
  }
  $('deck-count').textContent = deckTotal();
  $('deck-hero-count').textContent = deckCards.filter(x => x.card.cardType === 'ヒーロー').reduce((s,x)=>s+x.count,0);
  $('deck-legend-count').textContent = deckCards.filter(x => isLegend(x.card)).reduce((s,x)=>s+x.count,0);
  renderCurve(deckCards);
  const validation = validateDeck(), box = $('validation-box');
  box.className = `validation ${validation.ok ? 'ok':'bad'}`; box.innerHTML = validation.messages.map(escapeHtml).join('<br>');
  renderSavedDecks();
}

function renderCurve(deckCards){
  const buckets = Array(8).fill(0);
  for(const {card,count} of deckCards){ const c = Math.min(Number(card.cost || 0), 7); buckets[c] += count; }
  const max = Math.max(1, ...buckets), labels = ['0','1','2','3','4','5','6','7+'];
  $('curve-box').innerHTML = buckets.map((v,i)=>`<div class="curve-row"><b>${labels[i]}</b><div class="bar"><span style="width:${(v/max)*100}%"></span></div><small>${v}</small></div>`).join('');
}

function renderAll(){ renderCards(); renderDeck(); }
function byId(id){ return state.allCards.find(c => c.id === id); }
function deckTotal(){ return [...state.deck.values()].reduce((a,b)=>a+b,0); }
function isLegend(card){ return String(card.rarity || '').includes('レジェンド'); }
function maxCopies(card){ return isLegend(card) ? 1 : 2; }
function normalize(s){ return String(s || '').toLowerCase().replace(/[\s　]+/g,''); }

function canAdd(card){
  if(!state.selectedClass) return {ok:false, reason:'職業未選択'};
  if(deckTotal() >= 30) return {ok:false, reason:'30枚上限'};
  const count = state.deck.get(card.id) || 0;
  if(count >= maxCopies(card)) return {ok:false, reason:'同名上限'};
  return {ok:true};
}
function addCard(card){ const check = canAdd(card); if(!check.ok) return toast(check.reason, false); state.deck.set(card.id, (state.deck.get(card.id)||0)+1); renderAll(); }
function removeCard(id){ const count = state.deck.get(id) || 0; if(count <= 1) state.deck.delete(id); else state.deck.set(id, count-1); renderAll(); }

function validateDeck(){
  const messages = [];
  if(!state.username) messages.push('ユーザ名がありません。');
  if(!state.selectedClass) messages.push('職業を選択してください。');
  const total = deckTotal(); if(total !== 30) messages.push(`デッキは30枚です。現在${total}枚。`);
  for(const [id,count] of state.deck){
    const card = byId(id); if(!card) continue;
    if(count > maxCopies(card)) messages.push(`${card.name} は上限${maxCopies(card)}枚です。`);
    const classes = card.classes || [];
    if(card.flags?.deckBuildable === false) messages.push(`${card.name} はデッキ編成不可カードです。`);
    if(!(classes.includes('共通') || classes.includes(state.selectedClass))) messages.push(`${card.name} は ${state.selectedClass} で使えません。`);
  }
  if(!messages.length) messages.push('保存できます。');
  return {ok: messages.length === 1 && messages[0] === '保存できます。', messages};
}

function makeDeckPayload(){
  const cards = [...state.deck.entries()].map(([cardId,count]) => { const c = byId(cardId); return { cardId, name:c?.name, count, cost:c?.cost, rarity:c?.rarity, cardType:c?.cardType }; });
  return { deckName: $('deck-name').value.trim() || '新しいデッキ', className: state.selectedClass, heroId: state.selectedHeroId || '', cards, total: deckTotal(), username: state.username, deviceId: state.deviceId, updatedAtLocal: new Date().toISOString(), schemaVersion: 'dqr.userDeck.v3_hero_unlimited' };
}

async function saveDeck(){
  const validation = validateDeck(); if(!validation.ok) return toast('まだ保存できません。枚数や職業を確認してね。', false);
  const payload = makeDeckPayload();
  const localId = `local_${Date.now()}`; saveLocalDeck(localId, payload);
  if(state.firebase.enabled && state.firebase.uid && state.firebase.db){
    const newRef = push(ref(state.firebase.db, `users/${state.firebase.uid}/decks`));
    await set(newRef, { ...payload, updatedAt: serverTimestamp() });
    $('save-status').textContent = 'Firebase保存済み'; toast('Firebaseに保存しました。', true);
  }else{ $('save-status').textContent = 'ローカル保存済み'; toast('Firebase未設定なのでブラウザに保存しました。', true); }
  renderSavedDecks();
}

function saveLocalDeck(id, payload){ const all = JSON.parse(localStorage.getItem('dqr_decks') || '{}'); all[id] = payload; localStorage.setItem('dqr_decks', JSON.stringify(all)); state.userDecks = all; }
function loadLocalDecks(){ state.userDecks = JSON.parse(localStorage.getItem('dqr_decks') || '{}'); renderSavedDecks(); }
function subscribeFirebaseDecks(){
  if(!state.firebase.enabled || !state.firebase.uid || !state.firebase.db) return;
  onValue(ref(state.firebase.db, `users/${state.firebase.uid}/decks`), snap => { state.firebaseDecks = snap.val() || {}; renderSavedDecks(); });
}
function renderSavedDecks(){
  const box = $('saved-decks'); if(!box) return;
  const merged = {...(state.userDecks || {}), ...(state.firebaseDecks || {})}; const entries = Object.entries(merged).sort((a,b)=>String(b[1].updatedAtLocal||'').localeCompare(String(a[1].updatedAtLocal||'')));
  if(!entries.length){ box.className='saved-decks empty'; box.textContent='まだありません'; return; }
  box.className='saved-decks'; box.innerHTML='';
  for(const [id,deck] of entries.slice(0,10)){
    const row = document.createElement('div'); row.className='saved-row';
    row.innerHTML = `<span>${escapeHtml(deck.deckName)}<br><small>${escapeHtml(deck.className || '')} / ${deck.total || 0}枚</small></span>`;
    const load = document.createElement('button'); load.textContent='読込'; load.onclick=()=>loadDeck(deck);
    const del = document.createElement('button'); del.textContent='削除'; del.onclick=()=>deleteDeck(id);
    row.append(load, del); box.appendChild(row);
  }
}
async function deleteDeck(id){
  const all = JSON.parse(localStorage.getItem('dqr_decks') || '{}'); delete all[id]; localStorage.setItem('dqr_decks', JSON.stringify(all)); state.userDecks = all;
  if(state.firebase.enabled && state.firebase.uid && state.firebase.db && !id.startsWith('local_')) await remove(ref(state.firebase.db, `users/${state.firebase.uid}/decks/${id}`));
  renderSavedDecks();
}
function loadDeck(data){
  if(data.className){ state.selectedClass = data.className; $('class-select').value = data.className; }
  state.selectedHeroId = data.heroId || '';
  state.deck.clear(); for(const item of data.cards || []) state.deck.set(item.cardId, item.count || 1);
  $('deck-name').value = data.deckName || ''; renderAll(); toast('デッキを読み込みました。');
}
function exportDeck(){ const payload = makeDeckPayload(); const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${payload.deckName || 'deck'}.json`; a.click(); URL.revokeObjectURL(a.href); }
async function importDeck(e){ const file = e.target.files?.[0]; if(!file) return; loadDeck(JSON.parse(await file.text())); }

function showCardDetail(card){
  $('modal-title').textContent = card.name;
  const details = [baseDetail(card), relatedDetail(card)].join('');
  $('modal-body').innerHTML = details;
  $('card-modal').showModal();
}
function baseDetail(card){
  const buildable = card.flags?.deckBuildable === false ? 'デッキ編成不可 / 効果で取得・進化・システム用' : 'デッキ編成可';
  const reason = card.flags?.deckBuildRuleReason ? `<p>整理理由: ${escapeHtml(card.flags.deckBuildRuleReason.join(' / '))}</p>` : '';
  const official = card.official?.cardPageUrl ? `<p><a href="${escapeHtml(card.official.cardPageUrl)}" target="_blank" rel="noreferrer">公式DBページを開く</a></p>` : '';
  const safeImgUrl = getOfficialImage(card);
  const img = safeImgUrl ? `<img class="detail-card-image" src="${escapeHtml(safeImgUrl)}" alt="${escapeHtml(card.name)}" onerror="this.remove()">` : '';
  return `<div class="detail-block"><h4>カード情報</h4>${img}<p><b>${buildable}</b></p>${reason}${official}<p>コスト: ${card.cost ?? '-'} / 種類: ${escapeHtml(card.cardType || '')} / レア: ${escapeHtml(card.rarity || '')}</p><p>職業: ${escapeHtml((card.classes||[]).join('・'))}</p><p>系統: ${escapeHtml((card.tribes||[]).join('・') || 'なし')}</p><p>${escapeHtml(card.text || '—')}</p><p>${(card.keywords||[]).map(k=>`<span class="chip">${escapeHtml(k)}</span>`).join(' ')}</p></div>`;
}
function relatedDetail(card){
  const blocks = [];
  const fortune = findByCard(state.fortune.cards, card.id); if(fortune) blocks.push(block('占い', fortune.options.map(o => `<div class="option">${o.optionNo}: ${escapeHtml(o.text)}</div>`).join('')));
  const choice = findByCard(state.choices.cards, card.id); if(choice) blocks.push(block('選択', choice.options.map(o => `<div class="option">${o.optionNo}: ${escapeHtml(o.text)}</div>`).join('')));
  const dungeon = findByCard(state.dungeons.cards, card.id); if(dungeon) blocks.push(block('ダンジョン', `<p>踏破耐久値: ${dungeon.clearDurability ?? '-'}</p><p>条件: ${escapeHtml(dungeon.progressConditionText || '')}</p><p>踏破時: ${escapeHtml(dungeon.completionEffectText || '')}</p>`));
  const coin = findByCard(state.coin.cards, card.id); if(coin) blocks.push(block('コイン / GET・BET', `<p>GET: ${escapeHtml((coin.get||[]).map(g=>g.amount).join(', ') || 'なし')}</p><p>BET: ${escapeHtml(coin.bet?.effectText || 'なし')}</p>`));
  const exchange = findByCard(state.exchanges.cards, card.id) || findByCard(state.systems?.systems?.exchanges?.cards, card.id); if(exchange) blocks.push(block('交換所', `<p>${escapeHtml(exchange.usageRule || '')}</p><p>最低必要コイン: ${exchange.minimumCoinCost ?? '-'}</p>${(exchange.options||[]).map(o=>`<div class="option">${o.coinCost}枚: ${escapeHtml(o.effectText)}</div>`).join('')}<p>その後: ${escapeHtml(exchange.afterEffectText || '')}</p>`));
  const hero = (state.heroes.heroes || []).find(h => h.starterCardId === card.id); if(hero) blocks.push(block('ヒーロー', `<p>${escapeHtml(hero.name)}</p><p>${escapeHtml(hero.skillKind || '')}</p><p>${hero.needsSkillDataReview ? 'スキル詳細は後で補完予定' : ''}</p>`));
  const strategyCards = state.strategies.cards || state.systems?.systems?.strategies?.cards || [];
  const strat = findByCard(strategyCards, card.id); if(strat){ const pool = state.strategies.pools?.default || state.systems?.systems?.strategies?.pools?.default; blocks.push(block('さくせん', `<p>${escapeHtml(strat.targetHint || '対象ユニット')}</p>${(pool?.candidates||[]).map(c=>`<div class="option"><b>${escapeHtml(c.name)}</b>: ${escapeHtml(c.displayText || c.effectText)}</div>`).join('')}`)); }
  if(!blocks.length) blocks.push(block('関連システム', '<p>なし</p>'));
  return blocks.join('');
}
function findByCard(list, id){ return (list || []).find(x => x.cardId === id); }
function block(title, html){ return `<div class="detail-block"><h4>${escapeHtml(title)}</h4>${html}</div>`; }

function toast(msg, ok=true){ const div = document.createElement('div'); div.className = `toast ${ok?'ok':'bad'}`; div.textContent = msg; document.body.appendChild(div); setTimeout(()=>div.remove(), 2800); }
function escapeHtml(s){ return String(s ?? '').replace(/[&<>\"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
