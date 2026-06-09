import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getDatabase, ref, set, push, remove, onValue, serverTimestamp, get, update } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const state = {
  cards: [], allCards: [], systems: {}, strategies: {}, choices: {}, coin: {}, dungeons: {}, fortune: {}, heroes: {}, exchanges: {}, generatedCards: {}, tensionSystem: {},
  classes: [], cardTypes: [], rarities: [], userDecks: {},
  username: localStorage.getItem('dqr_username') || '',
  playerId: localStorage.getItem('dqr_player_id') || '',
  deviceId: localStorage.getItem('dqr_device_id') || crypto.randomUUID(),
  selectedClass: '', selectedHeroId: '', deck: new Map(),
  battle: { selectedDeckId: '', selectedDeck: null, matchId: '', roomId: '', game: null },
  firebase: { enabled: false, app: null, auth: null, db: null, uid: null }
};
localStorage.setItem('dqr_device_id', state.deviceId);

function normalizePlayerId(id){
  return String(id || '').trim().replace(/[.#$\[\]\/]/g, '_').slice(0, 32);
}

function hasPlayerId(){
  return !!state.playerId;
}

function setPlayerIdentity(playerId, displayName){
  const id = normalizePlayerId(playerId);
  if(!id) return false;
  state.playerId = id;
  state.username = String(displayName || '').trim() || id;
  localStorage.setItem('dqr_player_id', state.playerId);
  localStorage.setItem('dqr_username', state.username);
  return true;
}


const $ = id => document.getElementById(id);
const screens = ['start','user','menu','deckbuilder','battle'];
const fallbackClasses = ['共通','戦士','魔法使い','武闘家','僧侶','商人','占い師','魔剣士','盗賊'];
const DATA_VERSION = 'v39-left-right-front-back-board';

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
  try{ const r = await fetch(`${path}?v=${encodeURIComponent(DATA_VERSION)}`, { cache: 'no-store' }); if(!r.ok) throw new Error(`${path}: ${r.status}`); return await r.json(); }
  catch(e){ console.warn(e); return fallback; }
}

async function loadData(){
  const [cards, systems, strategies, choices, coin, dungeons, fortune, heroes, exchanges, generatedCards, tensionSystem] = await Promise.all([
    loadJson('./data/cards.json', {cards: []}),
    loadJson('./data/systems.json', {}),
    loadJson('./data/strategies.json', {}),
    loadJson('./data/choices.json', {cards: []}),
    loadJson('./data/coin.json', {cards: []}),
    loadJson('./data/dungeons.json', {cards: []}),
    loadJson('./data/fortune.json', {cards: []}),
    loadJson('./data/heroes.json', {heroes: [], relatedCards: []}),
    loadJson('./data/exchanges.json', {cards: []}),
    loadJson('./data/generated_cards.json', {cards: []}),
    loadJson('./data/tension_system.json', {})
  ]);
  state.systems = systems; state.strategies = strategies; state.choices = choices; state.coin = coin;
  state.dungeons = dungeons; state.fortune = fortune; state.heroes = heroes; state.exchanges = exchanges; state.generatedCards = generatedCards; state.tensionSystem = tensionSystem;
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


function tryLandscapeMode(){
  // Safari/iOSでは向き固定は基本効かない。失敗しても画面遷移は止めない。
  try{
    if(document.documentElement.requestFullscreen && !document.fullscreenElement){
      Promise.resolve(document.documentElement.requestFullscreen()).catch(e => console.info('fullscreen skipped', e));
    }
  }catch(e){ console.info('fullscreen skipped', e); }
  try{
    if(screen.orientation?.lock){
      Promise.resolve(screen.orientation.lock('landscape')).catch(e => console.info('orientation lock skipped', e));
    }
  }catch(e){ console.info('orientation lock skipped', e); }
}

function bindEvents(){
  document.querySelector('.tap-start').addEventListener('click', () => { show(hasPlayerId() ? 'menu' : 'user'); tryLandscapeMode(); });
  document.querySelector('.tap-start').addEventListener('keydown', e => { if(e.key === 'Enter'){ show(hasPlayerId() ? 'menu' : 'user'); tryLandscapeMode(); } });
  $('username-ok').addEventListener('click', saveUsername);
  const changeUsername = $('change-username');
  if(changeUsername) changeUsername.addEventListener('click', () => show('user'));
  $('username-input').addEventListener('keydown', e => { if(e.key === 'Enter') saveUsername(); });
  $('open-deckbuilder').addEventListener('click', () => { show('deckbuilder'); renderAll(); });
  $('open-battle').addEventListener('click', () => { show('battle'); renderBattleDeckList(); });
  document.querySelectorAll('.back-menu').forEach(b => b.addEventListener('click', () => show('menu')));
  $('class-select').addEventListener('change', e => changeClass(e.target.value));
  ['search-input','type-filter','cost-filter','rarity-filter'].forEach(id => $(id).addEventListener('input', renderCards));
  const sizeSlider = $('mobile-card-size');
  if(sizeSlider){
    const savedSize = localStorage.getItem('dqr_mobile_card_size') || sizeSlider.value;
    sizeSlider.value = savedSize;
    document.documentElement.style.setProperty('--mobile-card-w', `${savedSize}px`);
    sizeSlider.addEventListener('input', e => {
      const v = e.target.value;
      document.documentElement.style.setProperty('--mobile-card-w', `${v}px`);
      localStorage.setItem('dqr_mobile_card_size', v);
    });
  }
  $('clear-deck').addEventListener('click', () => { state.deck.clear(); state.selectedHeroId=''; renderAll(); });
  $('save-deck').addEventListener('click', saveDeck);
  const confirmDeckBtn = $('confirm-deck-view');
  if(confirmDeckBtn) confirmDeckBtn.addEventListener('click', showDeckConfirm);
  $('import-deck').addEventListener('change', importDeck);
  const battleModalClose = $('battle-deck-modal-close');
  if(battleModalClose) battleModalClose.addEventListener('click', () => $('battle-deck-modal').close());
  const startMatchBtn = $('start-match');
  if(startMatchBtn) startMatchBtn.addEventListener('click', startMatch);
  const tensionBtn = $('tension-button');
  if(tensionBtn) tensionBtn.addEventListener('click', useOrChargeTension);
  const endTurnBtn = $('end-turn');
  if(endTurnBtn) endTurnBtn.addEventListener('click', endTurn);
  const endTurnTop = $('end-turn-top');
  if(endTurnTop) endTurnTop.addEventListener('click', endTurn);
  const zoom = $('battle-card-zoom');
  if(zoom) zoom.addEventListener('click', closeBattleCardZoom);
  const resultOverlay = $('battle-result-overlay');
  if(resultOverlay) resultOverlay.addEventListener('click', resetAfterBattleResult);
  const battleExit = $('battle-exit');
  if(battleExit) battleExit.addEventListener('click', () => $('battle-exit-modal').showModal());
  const battleExitCancel = $('battle-exit-cancel');
  if(battleExitCancel) battleExitCancel.addEventListener('click', () => $('battle-exit-modal').close());
  const battleExitConfirm = $('battle-exit-confirm');
  if(battleExitConfirm) battleExitConfirm.addEventListener('click', leaveBattleAsDefeat);
  const heroSkillBtn = $('hero-skill-button');
  if(heroSkillBtn) heroSkillBtn.addEventListener('click', openHeroSkillModal);
  const heroSkillClose = $('hero-skill-close');
  if(heroSkillClose) heroSkillClose.addEventListener('click', () => $('hero-skill-modal').close());
  const deckConfirmClose = $('deck-confirm-close');
  if(deckConfirmClose) deckConfirmClose.addEventListener('click', () => $('deck-confirm-modal').close());
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
  const id = $('player-id-input')?.value || state.playerId;
  const name = $('username-input')?.value || id;
  if(!setPlayerIdentity(id, name)){
    return toast('プレイヤーIDを入力してください。', false);
  }
  updateLoginStatus();
  subscribeFirebaseDecks();
  show('menu');
}

function updateLoginStatus(){
  $('welcome-title').textContent = `${state.username || state.playerId || 'プレイヤー'} さん`;
  const uid = state.firebase.uid ? `Firebase匿名接続 / uid: ${state.firebase.uid.slice(0,8)}…` : 'Firebase未接続または設定待ち';
  $('login-status').textContent = `${uid} / playerId: ${state.playerId || '未設定'} / 端末ID: ${state.deviceId.slice(0,8)}…`;
  if($('player-id-input')) $('player-id-input').value = state.playerId || '';
  if($('username-input')) $('username-input').value = state.username || '';
}

function show(name){
  if(['menu','deckbuilder','battle'].includes(name) && !hasPlayerId()) name = 'user';
  screens.forEach(s => $(`screen-${s}`).classList.toggle('active', s === name));
  updateLoginStatus();
}

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
      img.className = 'card-thumb'; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; img.src = imgUrl; img.alt = card.name;
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
    btn.addEventListener('click', e => { e.stopPropagation(); addCard(card); });
    node.querySelector('.detail-card').addEventListener('click', e => { e.stopPropagation(); showCardDetail(card); });
    node.addEventListener('click', () => {
      if(canAdd(card).ok) addCard(card);
      else showCardDetail(card);
    });
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
      const miniImg = getOfficialImage(card);
      row.innerHTML = `${miniImg ? `<img class="selected-card-mini-thumb" src="${escapeHtml(miniImg)}" alt="${escapeHtml(card.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${card.cost ?? '-'} ${escapeHtml(card.name)}</span><strong>×${count}</strong>`;
      const minus = document.createElement('button'); minus.textContent='−'; minus.onclick=(e)=>{ e.stopPropagation(); removeCard(card.id); };
      const plus = document.createElement('button'); plus.textContent='＋'; plus.onclick=(e)=>{ e.stopPropagation(); addCard(card); };
      plus.disabled = !canAdd(card).ok;
      row.append(minus, plus); list.appendChild(row);
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
  if(!hasPlayerId()) return show('user');
  const validation = validateDeck(); if(!validation.ok) return toast('まだ保存できません。枚数や職業を確認してね。', false);
  const payload = makeDeckPayload();
  const localId = `local_${Date.now()}`; saveLocalDeck(localId, payload);
  if(state.firebase.enabled && state.firebase.uid && state.firebase.db){
    const newRef = push(ref(state.firebase.db, `players/${state.playerId}/decks`));
    await set(newRef, { ...payload, updatedAt: serverTimestamp() });
    $('save-status').textContent = 'Firebase保存済み'; toast('Firebaseに保存しました。', true);
  }else{ $('save-status').textContent = 'ローカル保存済み'; toast('Firebase未設定なのでブラウザに保存しました。', true); }
  renderSavedDecks();
}

function saveLocalDeck(id, payload){ const all = JSON.parse(localStorage.getItem('dqr_decks') || '{}'); all[id] = payload; localStorage.setItem('dqr_decks', JSON.stringify(all)); state.userDecks = all; }
function loadLocalDecks(){ state.userDecks = JSON.parse(localStorage.getItem('dqr_decks') || '{}'); renderSavedDecks(); }
function subscribeFirebaseDecks(){
  if(!state.firebase.enabled || !state.playerId || !state.firebase.db) return;
  onValue(ref(state.firebase.db, `players/${state.playerId}/decks`), snap => { state.firebaseDecks = snap.val() || {}; renderSavedDecks(); if($('battle-deck-list')) renderBattleDeckList(); });
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
  if(state.firebase.enabled && state.firebase.uid && state.firebase.db && !id.startsWith('local_')) await remove(ref(state.firebase.db, `players/${state.playerId}/decks/${id}`));
  renderSavedDecks();
}
function loadDeck(data){
  if(data.className){ state.selectedClass = data.className; $('class-select').value = data.className; }
  state.selectedHeroId = data.heroId || '';
  state.deck.clear(); for(const item of data.cards || []) state.deck.set(item.cardId, item.count || 1);
  $('deck-name').value = data.deckName || ''; renderAll(); toast('デッキを読み込みました。');
}


function showDeckConfirm(){
  if(!state.selectedClass) return toast('職業を選択してください。', false);
  const deckCards = [...state.deck.entries()].map(([id,count]) => ({card: byId(id), count})).filter(x => x.card)
    .sort((a,b) => (a.card.cost ?? 0) - (b.card.cost ?? 0) || a.card.name.localeCompare(b.card.name,'ja'));
  $('deck-confirm-title').textContent = $('deck-name').value.trim() || '新しいデッキ';
  $('deck-confirm-meta').textContent = `${state.selectedClass} / ${deckTotal()}/30枚 / ユニット:${countDeckType(deckCards,'ユニット')} 特技:${countDeckType(deckCards,'特技')} 武器:${countDeckType(deckCards,'武器')} その他:${countDeckOther(deckCards)}`;
  const grid = $('deck-confirm-grid');
  if(!deckCards.length){
    grid.innerHTML = '<div class="empty">カードが入っていません</div>';
  }else{
    grid.innerHTML = deckCards.map(({card,count}) => {
      const img = getOfficialImage(card);
      return `<article class="deck-confirm-card">${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(card.name)}" loading="lazy" referrerpolicy="no-referrer">` : '<div class="no-img"></div>'}<b>×${count}</b><span>${escapeHtml(card.name)}</span></article>`;
    }).join('');
  }
  $('deck-confirm-modal').showModal();
}

function countDeckType(deckCards, type){
  return deckCards.filter(x => x.card.cardType === type).reduce((s,x)=>s+x.count,0);
}
function countDeckOther(deckCards){
  return deckCards.filter(x => !['ユニット','特技','武器'].includes(x.card.cardType)).reduce((s,x)=>s+x.count,0);
}

function getAllSavedDeckEntries(){
  const merged = {...(state.userDecks || {}), ...(state.firebaseDecks || {})};
  return Object.entries(merged).sort((a,b)=>String(b[1].updatedAtLocal||'').localeCompare(String(a[1].updatedAtLocal||'')));
}

function renderBattleDeckList(){
  const box = $('battle-deck-list');
  if(!box) return;
  const entries = getAllSavedDeckEntries().filter(([id, deck]) => deck && Number(deck.total || 0) === 30);
  if(!entries.length){
    box.className = 'battle-deck-list empty';
    box.textContent = '30枚完成済みの保存デッキがありません。先にデッキ作成で保存してください。';
    return;
  }
  box.className = 'battle-deck-list';
  box.innerHTML = '';
  for(const [id, deck] of entries){
    const row = document.createElement('button');
    row.className = `battle-deck-card ${state.battle.selectedDeckId === id ? 'selected' : ''}`;
    const hero = (deck.cards || []).map(x => byId(x.cardId)).filter(c => c?.cardType === 'ヒーロー').map(c => c.name).join(' / ') || 'ヒーローなし';
    row.innerHTML = `<strong>${escapeHtml(deck.deckName || '無名デッキ')}</strong><span>${escapeHtml(deck.className || '')} / ${deck.total || 0}枚</span><small>${escapeHtml(hero)}</small>`;
    row.addEventListener('click', () => openBattleDeckModal(id, deck));
    box.appendChild(row);
  }
}

function openBattleDeckModal(id, deck){
  const body = $('battle-deck-modal-body');
  state.battle.previewDeckId = id;
  state.battle.previewDeck = deck;
  $('battle-deck-modal-title').textContent = deck.deckName || 'デッキ確認';
  const cards = (deck.cards || []).map(x => ({...x, card: byId(x.cardId)})).filter(x => x.card)
    .sort((a,b)=> (a.card.cost ?? 0) - (b.card.cost ?? 0) || a.card.name.localeCompare(b.card.name,'ja'));
  const expanded = [];
  for(const x of cards){
    for(let i=0; i<Number(x.count || 0); i++) expanded.push(x.card);
  }
  body.innerHTML = `
    <div class="battle-deck-compact-head">
      <strong>${escapeHtml(deck.className || '')} / ${deck.total || 0}枚</strong>
      <span>${escapeHtml(deck.deckName || '')}</span>
    </div>
    <div class="battle-deck-compact-grid">
      ${expanded.map(card => {
        const img = getOfficialImage(card);
        return `<article class="battle-deck-compact-card">${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(card.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}</article>`;
      }).join('')}
    </div>
    <div class="battle-deck-modal-actions">
      <button id="confirm-battle-deck" class="primary">このデッキでバトルへ</button>
    </div>
  `;
  $('confirm-battle-deck').addEventListener('click', () => {
    state.battle.selectedDeckId = id;
    state.battle.selectedDeck = deck;
    $('selected-battle-deck-label').textContent = `選択中: ${deck.deckName || '無名デッキ'} / ${deck.className || ''}`;
    $('battle-deck-modal').close();
    renderBattleDeckList();
  });
  $('battle-deck-modal').showModal();
}

function makeRoomId(matchId){
  return normalizePlayerId(matchId).toLowerCase();
}

async function startMatch(){
  if(!state.battle.selectedDeck) return toast('先にデッキを選択してください。', false);
  const matchId = $('match-id-input').value.trim();
  if(!matchId) return toast('合言葉IDを入力してください。', false);
  state.battle.matchId = matchId;
  state.battle.roomId = makeRoomId(matchId);
  initLocalBattleGame();
  if(state.firebase.enabled && state.firebase.db){
    try{
      const roomRef = ref(state.firebase.db, `rooms/${state.battle.roomId}/players/${state.playerId}`);
      await set(roomRef, {
        playerId: state.playerId,
        displayName: state.username,
        deckName: state.battle.selectedDeck.deckName,
        className: state.battle.selectedDeck.className,
        joinedAt: serverTimestamp()
      });
    }catch(e){ console.warn(e); }
    subscribeRoomPlayers();
  }
  $('battle-setup').classList.add('hidden');
  $('battle-arena').classList.remove('hidden');
  $('battle-status').textContent = `入室: ${matchId}`;
  renderBattleArena();
}




function subscribeRoomPlayers(){
  if(!state.firebase.enabled || !state.firebase.db || !state.battle.roomId) return;
  const playersRef = ref(state.firebase.db, `rooms/${state.battle.roomId}/players`);
  onValue(playersRef, async snap => {
    const players = snap.val() || {};
    const playerList = Object.values(players).filter(Boolean);
    const others = playerList.filter(p => p.playerId !== state.playerId);
    if(others.length){
      $('battle-status').textContent = `対戦相手: ${others[0].displayName || others[0].playerId}`;
      const sorted = playerList.map(p => p.playerId).sort((a,b)=>a.localeCompare(b,'ja'));
      const firstPlayerId = sorted[0];
      if(state.firebase.db && state.battle.roomId){
        const metaRef = ref(state.firebase.db, `rooms/${state.battle.roomId}/meta`);
        const metaSnap = await get(metaRef);
        if(!metaSnap.exists()){
          await set(metaRef, {
            firstPlayerId,
            currentTurnPlayerId: firstPlayerId,
            createdAt: serverTimestamp(),
            status: 'playing'
          });
        }
      }
    }else{
      $('battle-status').textContent = `入室: ${state.battle.matchId} / 相手待ち`;
    }
    renderBattleLog();
  });

  const metaRef = ref(state.firebase.db, `rooms/${state.battle.roomId}/meta`);
  onValue(metaRef, snap => {
    const meta = snap.val();
    if(!meta || !state.battle.game) return;
    state.battle.game.currentTurnPlayerId = meta.currentTurnPlayerId || state.playerId;
    state.battle.game.isMyTurn = state.battle.game.currentTurnPlayerId === state.playerId;
    $('battle-status').textContent = state.battle.game.isMyTurn ? '自分のターン' : '相手のターン';
    renderBattleArena();
  });

  const statesRef = ref(state.firebase.db, `rooms/${state.battle.roomId}/states`);
  onValue(statesRef, snap => {
    const states = snap.val() || {};
    state.battle.remoteStates = states;
    applyRemoteOpponentState(states);
  });
}

async function syncMyBattleState(){
  const game = state.battle.game;
  if(!game || !state.firebase.enabled || !state.firebase.db || !state.battle.roomId) return;
  const publicState = {
    playerId: state.playerId,
    displayName: state.username,
    hp: game.player.hp,
    maxMp: game.player.maxMp,
    mp: game.player.mp,
    tension: game.player.tension,
    board: game.player.board,
    handCount: game.player.hand.length,
    deckCount: game.player.deck.length,
    updatedAt: serverTimestamp()
  };
  try{
    await set(ref(state.firebase.db, `rooms/${state.battle.roomId}/states/${state.playerId}`), publicState);
  }catch(e){ console.warn('syncMyBattleState failed', e); }
}

function applyRemoteOpponentState(states){
  const game = state.battle.game;
  if(!game) return;
  const entry = Object.values(states || {}).find(s => s && s.playerId !== state.playerId);
  if(!entry) return;
  game.enemy.hp = entry.hp ?? game.enemy.hp;
  game.enemy.maxMp = entry.maxMp ?? game.enemy.maxMp;
  game.enemy.mp = entry.mp ?? game.enemy.mp;
  game.enemy.tension = entry.tension ?? game.enemy.tension;
  game.enemy.board = normalizeRemoteBoard(entry.board);
  if(game.enemy.hp <= 0) showBattleResult('win');
  renderBattleArena();
}

function normalizeRemoteBoard(board){
  const arr = Array(6).fill(null);
  if(Array.isArray(board)){
    for(let i=0;i<Math.min(6,board.length);i++) arr[i] = board[i] || null;
  }else if(board && typeof board === 'object'){
    for(const [k,v] of Object.entries(board)){
      const i = Number(k);
      if(i >= 0 && i < 6) arr[i] = v || null;
    }
  }
  return arr;
}

async function advanceTurnToOpponent(){
  if(!state.firebase.enabled || !state.firebase.db || !state.battle.roomId) return;
  const playersSnap = await get(ref(state.firebase.db, `rooms/${state.battle.roomId}/players`));
  const players = playersSnap.val() || {};
  const ids = Object.keys(players).sort((a,b)=>a.localeCompare(b,'ja'));
  if(ids.length < 2) return;
  const next = ids.find(id => id !== state.playerId) || ids[0];
  await update(ref(state.firebase.db, `rooms/${state.battle.roomId}/meta`), {
    currentTurnPlayerId: next,
    updatedAt: serverTimestamp()
  });
}


function showBattleResult(result){
  const game = state.battle.game;
  if(game) game.finished = true;
  const isWin = result === 'win';
  $('battle-result-title').textContent = isWin ? '勝利' : '敗北';
  $('battle-result-message').textContent = 'タップしてマッチング前に戻る';
  $('battle-result-overlay').classList.toggle('lose', !isWin);
  $('battle-result-overlay').classList.remove('hidden');
}

function resetAfterBattleResult(){
  $('battle-result-overlay').classList.add('hidden');
  state.battle.game = null;
  state.battle.matchId = '';
  state.battle.roomId = '';
  state.battle.selectedDeckId = '';
  state.battle.selectedDeck = null;
  const arena = $('battle-arena');
  const setup = $('battle-setup');
  if(arena) arena.classList.add('hidden');
  if(setup) setup.classList.remove('hidden');
  $('battle-status').textContent = '待機中';
  renderBattleDeckList();
}

async function leaveBattleAsDefeat(){
  const roomId = state.battle.roomId;
  $('battle-exit-modal').close();
  if(state.firebase.enabled && state.firebase.db && roomId){
    try{
      await update(ref(state.firebase.db, `rooms/${roomId}/players/${state.playerId}`), {
        status: 'defeated',
        leftAt: serverTimestamp()
      });
    }catch(e){ console.warn(e); }
  }
  state.battle.game = null;
  state.battle.matchId = '';
  state.battle.roomId = '';
  state.battle.selectedDeckId = '';
  state.battle.selectedDeck = null;
  $('battle-arena').classList.add('hidden');
  $('battle-setup').classList.remove('hidden');
  $('battle-status').textContent = '待機中';
  renderBattleDeckList();
}

function initLocalBattleGame(){
  const deck = state.battle.selectedDeck;
  const className = deck.className || '戦士';
  const deckList = buildOpeningDeck(deck);
  const hand = drawOpeningHand(deckList, 4);
  state.battle.game = {
    className,
    phase: 'player',
    turn: 1,
    currentTurnPlayerId: state.playerId,
    isMyTurn: true,
    selectedHandIndex: null,
    selectedAttacker: null,
    player: {
      hp: 25,
      maxHp: 25,
      maxMp: 1,
      mp: 1,
      tension: 0,
      tensionUsedThisTurn: false,
      leaderSkill: getBaseTensionSkill(className),
      heroSkill: null,
      heroLevel: 0,
      deck: deckList,
      hand,
      board: Array(6).fill(null)
    },
    enemy: {
      hp: 25,
      maxHp: 25,
      maxMp: 1,
      mp: 1,
      tension: 0,
      board: makeDummyEnemyBoard()
    },
    log: []
  };
  battleLog('バトル開始。ヒーローカードはサマルトリアの王子以外、開始時手札に入りました。');
}

function buildOpeningDeck(deck){
  const all = expandDeckCards(deck);
  const heroIds = [];
  const rest = [];
  for(const id of all){
    const c = byId(id);
    if(c?.cardType === 'ヒーロー' && c.name !== 'サマルトリアの王子') heroIds.push(id);
    else rest.push(id);
  }
  shuffle(rest);
  return [...heroIds, ...rest];
}

function drawOpeningHand(deckList, desiredCount=4){
  const hand = [];
  while(hand.length < desiredCount && deckList.length) hand.push(deckList.shift());
  return hand;
}

function makeDummyEnemyBoard(){
  return Array(6).fill(null);
}

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function expandDeckCards(deck){
  const arr = [];
  for(const item of deck.cards || []){
    for(let i=0; i<Number(item.count || 0); i++) arr.push(item.cardId);
  }
  return arr;
}

function getBaseTensionSkill(className){
  const skills = state.tensionSystem?.leaderSkills || [];
  return skills.find(s => s.class === className) || null;
}

function makeUnitFromCard(card){
  return {
    id: `${card.id}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    cardId: card.id,
    name: card.name,
    attack: Number(card.attack ?? 0),
    hp: Number(card.hp ?? 1),
    maxHp: Number(card.hp ?? 1),
    canAttack: false,
    summoningSickness: true
  };
}


function parseKeywordFlags(card){
  const text = String(card?.text || '');
  return {
    taunt: text.includes('におうだち'),
    haste: text.includes('速攻'),
    support: text.includes('おうえん'),
    snipe: text.includes('ねらい撃ち'),
    stealth: text.includes('ステルス'),
    piercing: text.includes('貫通'),
    metal: text.includes('メタルボディ'),
    hardMetal: text.includes('ハードメタルボディ'),
    doubleAttack: text.includes('2回攻撃'),
    superPiercing: text.includes('超貫通')
  };
}

function applySummonKeywords(unit, card){
  const flags = parseKeywordFlags(card);
  unit.keywords = flags;
  if(flags.haste){
    unit.canAttack = true;
    unit.summoningSickness = false;
  }
  if(flags.support){
    const game = state.battle.game;
    game.player.tension = Math.min(3, game.player.tension + 1);
    battleLog('おうえん：テンション+1。');
  }
}

function isFrontPosition(side, pos){
  // DQR layout in this project:
  // player: left leader, front column is the right column toward opponent => pos 0,1,2
  // enemy: right leader, front column is the left column toward player => pos 0,1,2
  // back column is pos 3,4,5.
  return [0,1,2].includes(Number(pos));
}

function hasEnemyTaunt(){
  const game = state.battle.game;
  return game.enemy.board.some((u, pos) => u?.keywords?.taunt && isFrontPosition('enemy', pos));
}

function canTargetEnemyUnit(unit){
  const game = state.battle.game;
  const atkRef = game.selectedAttacker;
  if(!atkRef) return true;
  const atk = (atkRef.side === 'player' ? game.player.board : game.enemy.board)[atkRef.pos];
  if(atk?.keywords?.snipe) return true;
  if(hasEnemyTaunt()) return !!unit?.keywords?.taunt;
  return true;
}

function cardCanBeSummoned(card){
  return card && card.cardType === 'ユニット';
}

function renderBattleArena(){
  const game = state.battle.game;
  if(!game) return;
  $('player-hp').textContent = game.player.hp;
  $('enemy-hp').textContent = game.enemy.hp;
  $('player-mp').textContent = `${game.player.mp}/${game.player.maxMp}`;
  $('enemy-mp').textContent = `${game.enemy.mp}/${game.enemy.maxMp}`;
  if($('battle-turn-label')) $('battle-turn-label').textContent = `TURN ${game.turn}`;
  const endTop = $('end-turn-top');
  if(endTop){
    const myTurn = !!game.isMyTurn;
    endTop.textContent = myTurn ? 'ターン終了' : '相手のターン';
    endTop.disabled = !myTurn;
    endTop.classList.toggle('opponent-turn', !myTurn);
  }
  renderTension();
  renderBattleBoard();
  renderBattleHand();
  renderBattleLog();
  const heroBtn = $('hero-skill-button');
  if(heroBtn) heroBtn.classList.toggle('hidden', !game.player.heroSkill);
}

function renderBattleBoard(){
  const game = state.battle.game;
  document.querySelectorAll('.unit-slot').forEach(slot => {
    const side = slot.dataset.side;
    const pos = Number(slot.dataset.pos);
    const board = side === 'player' ? game.player.board : game.enemy.board;
    const unit = board[pos];
    slot.classList.toggle('has-unit', !!unit);
    slot.classList.toggle('selected', game.selectedAttacker?.side === side && game.selectedAttacker?.pos === pos);
    if(unit){
      const card = byId(unit.cardId);
      const img = getOfficialImage(card);
      slot.innerHTML = `${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(unit.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}<span class="unit-atk">${unit.attack}</span><span class="unit-hp">${unit.hp}</span>`;
      slot.onclick = () => handleBoardClick(side, pos);
      attachLongPress(slot, () => showBattleCardZoom(card));
    }else{
      slot.innerHTML = '';
      slot.ondragover = e => { if(side === 'player'){ e.preventDefault(); slot.classList.add('drop-ready'); } };
      slot.ondragleave = () => slot.classList.remove('drop-ready');
      slot.ondrop = e => { e.preventDefault(); slot.classList.remove('drop-ready'); if(side === 'player'){ const idx = Number(e.dataTransfer.getData('text/plain')); state.battle.game.selectedHandIndex = idx; handleEmptySlotClick(side, pos); } };
      slot.onclick = () => handleEmptySlotClick(side, pos);
    }
  });
  document.querySelector('.enemy-leader').onclick = () => attackLeader('enemy');
  document.querySelector('.player-leader').onclick = () => attackLeader('player');
}

function renderBattleHand(){
  const game = state.battle.game;
  const hand = $('player-hand');
  hand.innerHTML = '';
  game.player.hand.forEach((id, index) => {
    const card = byId(id);
    if(!card) return;
    const btn = document.createElement('button');
    btn.className = `hand-card ${game.selectedHandIndex === index ? 'selected' : ''}`;
    const img = getOfficialImage(card);
    const playable = Number(card.cost || 0) <= game.player.mp;
    btn.classList.toggle('unplayable', !playable);
    btn.innerHTML = `${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(card.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${escapeHtml(card.name)}</span>`;
    btn.draggable = true;
    btn.addEventListener('dragstart', e => {
      game.selectedHandIndex = index;
      e.dataTransfer.setData('text/plain', String(index));
      btn.classList.add('dragging');
      renderBattleLog();
    });
    btn.addEventListener('dragend', () => btn.classList.remove('dragging'));
    btn.addEventListener('click', () => selectHandCard(index));
    attachLongPress(btn, () => showBattleCardZoom(card));
    hand.appendChild(btn);
  });
}

function renderBattleLog(){
  const box = $('battle-log');
  if(!box) return;
  box.innerHTML = (state.battle.game?.log || []).slice(-3).map(escapeHtml).join('<br>');
}

function battleLog(text){
  const game = state.battle.game;
  if(!game) return;
  game.log.push(text);
}

function selectHandCard(index){
  const game = state.battle.game;
  if(game?.finished) return;
  if(!game?.isMyTurn) return toast('相手のターンです。', false);
  const card = byId(game.player.hand[index]);
  if(!card) return;
  if(Number(card.cost || 0) > game.player.mp){
    toast('MPが足りません。', false);
    return;
  }
  if(cardCanBeSummoned(card)){
    game.selectedHandIndex = index;
    game.selectedAttacker = null;
    battleLog(`${card.name}：召喚先を選んでください。`);
    renderBattleArena();
  }else{
    useNonUnitCard(index, card);
  }
}

function handleEmptySlotClick(side, pos){
  const game = state.battle.game;
  if(game?.finished) return;
  if(!game?.isMyTurn) return;
  if(side !== 'player') return;
  if(game.selectedHandIndex == null) return;
  const card = byId(game.player.hand[game.selectedHandIndex]);
  if(!cardCanBeSummoned(card)) return;
  summonSelectedCard(pos);
}

function summonSelectedCard(pos){
  const game = state.battle.game;
  if(game.player.board[pos]) return;
  const index = game.selectedHandIndex;
  const card = byId(game.player.hand[index]);
  if(!card || Number(card.cost || 0) > game.player.mp) return;
  game.player.mp -= Number(card.cost || 0);
  game.player.hand.splice(index, 1);
  game.player.board[pos] = makeUnitFromCard(card);
  game.selectedHandIndex = null;
  battleLog(`${card.name}を召喚しました。`);
  applySummonKeywords(game.player.board[pos], card);
  renderBattleArena();
  syncMyBattleState();
}

function useNonUnitCard(index, card){
  const game = state.battle.game;
  if(Number(card.cost || 0) > game.player.mp) return;
  game.player.mp -= Number(card.cost || 0);
  game.player.hand.splice(index, 1);
  // 基礎版: 特技/武器/ヒーローはまずログだけ。効果は順次個別実装。
  if(card.cardType === 'ヒーロー'){
    activateHeroCard(card);
  }else{
    battleLog(`${card.name}を使用しました。効果処理は次フェーズで個別実装します。`);
  }
  renderBattleArena();
  syncMyBattleState();
}

function handleBoardClick(side, pos){
  const game = state.battle.game;
  if(game?.finished) return;
  if(!game?.isMyTurn && side === 'player') return toast('相手のターンです。', false);
  const board = side === 'player' ? game.player.board : game.enemy.board;
  const unit = board[pos];
  if(!unit) return;
  if(side === 'player'){
    if(unit.canAttack){
      game.selectedAttacker = {side, pos};
      game.selectedHandIndex = null;
      battleLog(`${unit.name}：攻撃対象を選んでください。`);
    }else{
      battleLog(`${unit.name}はまだ攻撃できません。`);
    }
    renderBattleArena();
    return;
  }
  if(game.selectedAttacker){
    if(side === 'enemy' && !canTargetEnemyUnit(unit)) return toast('におうだちを持つユニットを先に攻撃してください。', false);
    attackUnit(game.selectedAttacker, {side, pos});
  }
}

function attackUnit(attackerRef, defenderRef){
  const game = state.battle.game;
  const atkBoard = attackerRef.side === 'player' ? game.player.board : game.enemy.board;
  const defBoard = defenderRef.side === 'player' ? game.player.board : game.enemy.board;
  const atk = atkBoard[attackerRef.pos];
  const def = defBoard[defenderRef.pos];
  if(!atk || !def || !atk.canAttack) return;
  def.hp -= atk.attack;
  atk.hp -= def.attack;
  atk.canAttack = false;
  battleLog(`${atk.name}が${def.name}を攻撃。`);
  resolveDeaths();
  game.selectedAttacker = null;
  renderBattleArena();
  syncMyBattleState();
}

function attackLeader(targetSide){
  const game = state.battle.game;
  if(targetSide === 'enemy' && hasEnemyTaunt()) return toast('におうだちを持つユニットを先に攻撃してください。', false);
  if(!game.selectedAttacker) return;
  const atkBoard = game.selectedAttacker.side === 'player' ? game.player.board : game.enemy.board;
  const atk = atkBoard[game.selectedAttacker.pos];
  if(!atk || !atk.canAttack) return;
  const target = targetSide === 'enemy' ? game.enemy : game.player;
  target.hp = Math.max(0, target.hp - atk.attack);
  atk.canAttack = false;
  battleLog(`${atk.name}が${targetSide === 'enemy' ? '敵リーダー' : '自分リーダー'}に${atk.attack}ダメージ。`);
  game.selectedAttacker = null;
  renderBattleArena();
  syncMyBattleState();
  if(target.hp <= 0) showBattleResult(targetSide === 'enemy' ? 'win' : 'lose');
}

function resolveDeaths(){
  const game = state.battle.game;
  for(const side of ['player','enemy']){
    const player = side === 'player' ? game.player : game.enemy;
    player.board.forEach((unit, i) => {
      if(unit && unit.hp <= 0){
        battleLog(`${unit.name}は死亡しました。`);
        player.board[i] = null;
      }
    });
  }
}

function useOrChargeTension(){
  const game = state.battle.game;
  if(game?.finished) return;
  if(!game?.isMyTurn) return toast('相手のターンです。', false);
  if(!game) return;
  if(game.player.tension >= 3){
    applyTensionSkill(game.player.leaderSkill);
    game.player.tension = 0;
    game.player.tensionUsedThisTurn = true;
  }else{
    if(game.player.mp < 1) return toast('MPが足りません。', false);
    if(game.player.tensionUsedThisTurn) return toast('このターンは既にテンション操作済みです。', false);
    game.player.mp -= 1;
    game.player.tension = Math.min(3, game.player.tension + 1);
    game.player.tensionUsedThisTurn = true;
    battleLog(`テンションが${game.player.tension}段階になりました。`);
  }
  renderBattleArena();
  syncMyBattleState();
}

function applyTensionSkill(skill){
  const game = state.battle.game;
  const name = skill?.skillName || 'テンションスキル';
  battleLog(`${name}を使用しました。`);
  const effect = skill?.effect;
  if(!effect) return;
  if(effect.type === 'dealDamage'){
    game.enemy.hp = Math.max(0, game.enemy.hp - Number(effect.amount || 0));
    battleLog(`敵リーダーに${effect.amount}ダメージ。`);
  }else if(effect.type === 'heal'){
    game.player.hp = Math.min(game.player.maxHp, game.player.hp + Number(effect.amount || 0));
    battleLog(`味方リーダーを${effect.amount}回復。`);
  }else if(effect.type === 'summonToken'){
    const idx = game.player.board.findIndex(x => !x);
    if(idx >= 0){
      game.player.board[idx] = {
        id:`token_${Date.now()}`,
        cardId:'',
        name:effect.tokenName || 'トークン',
        attack:Number(effect.attack || 0),
        hp:Number(effect.hp || 1),
        maxHp:Number(effect.hp || 1),
        canAttack:false,
        summoningSickness:true
      };
      battleLog(`${effect.tokenName}を出しました。`);
    }
  }else if(effect.type === 'drawFromDeckByType' || effect.type === 'multi'){
    drawCard(1);
    battleLog('カードを1枚引きました。');
  }else if(effect.type === 'temporaryLeaderBuff'){
    battleLog(`このターン中リーダー攻撃力+${effect.attack || 0}。攻撃処理は次フェーズで実装します。`);
  }else if(effect.type === 'equipWeapon'){
    battleLog(`${effect.weapon?.name || '武器'}を装備しました。武器処理は次フェーズで実装します。`);
  }
}

function drawCard(count=1){
  const game = state.battle.game;
  for(let i=0;i<count;i++){
    if(game.player.deck.length){
      game.player.hand.push(game.player.deck.shift());
    }else{
      game.player.hp = Math.max(0, game.player.hp - 1);
      battleLog('デッキ切れで1ダメージ。');
    }
  }
}

function renderTension(){
  const game = state.battle.game;
  if(!game) return;
  const pips = [...$('tension-pips').querySelectorAll('i')];
  pips.forEach((p, i) => p.classList.toggle('on', i < game.player.tension));
  $('tension-button').classList.toggle('ready', game.player.tension >= 3);
  $('tension-button').title = game.player.tension >= 3 ? `テンションスキル: ${game.player.leaderSkill?.skillName || ''}` : 'テンションをためる';
}

async function endTurn(){
  const game = state.battle.game;
  if(game?.finished) return;
  if(!game?.isMyTurn) return toast('相手のターンです。', false);
  if(!game) return;
  game.turn += 1;
  game.player.maxMp = Math.min(10, game.player.maxMp + 1);
  game.player.mp = game.player.maxMp;
  game.player.tensionUsedThisTurn = false;
  for(const unit of game.player.board){
    if(unit){
      unit.summoningSickness = false;
      unit.canAttack = true;
    }
  }
  drawCard(1);
  battleLog(`ターン${game.turn}: MPが${game.player.mp}になりました。`);
  renderBattleArena();
  syncMyBattleState();
  advanceTurnToOpponent();
}


function activateHeroCard(card){
  const game = state.battle.game;
  game.player.heroSkill = {
    heroCardName: card.name,
    level: 1,
    currentCardName: getHeroLevelCardName(card.name, 1)
  };
  game.player.heroLevel = 1;
  battleLog(`${card.name}のヒーロースキルが使えるようになりました。`);
}

function getHeroLevelCardName(heroName, level){
  const map = {
    'ロトの血を引く者': ['たたかう','王女救出','竜王一閃'],
    '天空の花嫁ビアンカ': ['なかまとの出会い','天空への挑戦','家族の絆'],
    '天空の花嫁フローラ': ['癒しをあなたに','天空への挑戦','贈り物をみんなに'],
    '天空の花嫁デボラ': ['この手に切り札を','アゲていくわよ','小魚への施し'],
    '勇者姫アンルシア': ['勇者の雷','覚醒の光','裁きを彼らに'],
    '大魔王ゾーマ': ['滅びこそ我が喜び','死にゆく者こそ美しい','我が腕の中で息絶えるがいい'],
    'ムーンブルクの王女': ['わたしのとくいわざ','導かれし者たち','精霊ルビスの加護']
  };
  return map[heroName]?.[level-1] || `レベル${level}ヒーロースキル`;
}

function openHeroSkillModal(){
  const game = state.battle.game;
  const hs = game?.player?.heroSkill;
  if(!hs) return toast('ヒーローカードを使用すると使えるようになります。', false);
  $('hero-skill-title').textContent = `${hs.heroCardName} Lv.${hs.level}`;
  const card = state.allCards.find(c => c.name === hs.currentCardName);
  const img = card ? getOfficialImage(card) : '';
  $('hero-skill-body').innerHTML = `
    <div class="hero-skill-confirm">
      ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(hs.currentCardName)}" referrerpolicy="no-referrer">` : ''}
      <div>
        <h4>${escapeHtml(hs.currentCardName)}</h4>
        <p>${escapeHtml(card?.text || 'ヒーロースキルを使用します。')}</p>
        <button id="use-hero-skill-confirm" class="primary">使用する</button>
      </div>
    </div>`;
  $('use-hero-skill-confirm').addEventListener('click', useHeroSkillCard);
  $('hero-skill-modal').showModal();
}

function useHeroSkillCard(){
  const game = state.battle.game;
  if(!game?.isMyTurn) return toast('相手のターンです。', false);
  const hs = game.player.heroSkill;
  if(!hs) return;
  battleLog(`${hs.currentCardName}を使用しました。`);
  // 条件判定は個別実装前なので、基礎版では使用後に次レベルへ進める。
  if(hs.level < 3){
    hs.level += 1;
    hs.currentCardName = getHeroLevelCardName(hs.heroCardName, hs.level);
    battleLog(`ヒーロースキルがLv.${hs.level}に進化しました。`);
  }
  $('hero-skill-modal').close();
  renderBattleArena();
  syncMyBattleState();
}

function attachLongPress(el, callback){
  let timer = null;
  const start = e => {
    timer = setTimeout(() => callback(e), 420);
  };
  const cancel = () => {
    if(timer) clearTimeout(timer);
    timer = null;
  };
  el.addEventListener('touchstart', start, {passive:true});
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
}

function showBattleCardZoom(card){
  const img = getOfficialImage(card);
  if(!img) return;
  $('battle-card-zoom-img').src = img;
  $('battle-card-zoom-img').alt = card.name;
  $('battle-card-zoom').classList.remove('hidden');
}

function closeBattleCardZoom(){
  $('battle-card-zoom').classList.add('hidden');
  $('battle-card-zoom-img').src = '';
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
