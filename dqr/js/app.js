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
  selectedClass: '', selectedHeroId: '', deck: new Map(), editingDeckId: '',
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
const DATA_VERSION = 'v44_category_effect_engine';


const HERO_SKILL_DEFS = {
  'ロトの血を引く者': {
    levels: [
      { level:1, name:'たたかう', cost:1, type:'manual', target:'enemyAny', effect:{kind:'damage', amount:1}, progress:{uses:1} },
      { level:2, name:'王女救出', cost:2, type:'manual', target:'enemyAny', effect:{kind:'damage', amount:2}, progress:{uses:3}, onLevelUp:{addToHand:'王女の愛'} },
      { level:3, name:'竜王一閃', cost:1, type:'manual', target:'enemyUnit', requiredTension:3, effect:{kind:'damage', amount:7}, progress:null }
    ]
  },
  '勇者ソロ': {
    levels: [
      { level:1, name:'なかまとの出会い', cost:1, type:'manual', target:'none', effect:{kind:'drawFromDeck', filter:'adventurer'}, progress:{uses:2} },
      { level:2, name:'天空への挑戦', cost:2, type:'manual', target:'none', effect:{kind:'drawFromDeck', filter:'spellOrWeapon'}, progress:{uses:2} },
      { level:3, name:'導かれし者たち', cost:9, type:'manual', target:'none', effect:{kind:'setHandAdventurerCostZero'}, progress:null }
    ]
  },
  'レックス': {
    levels: [
      { level:1, name:'ついげき', cost:0, type:'auto', trigger:'leaderAttack', effect:{kind:'damageLeader', amount:1}, progress:{triggers:1} },
      { level:2, name:'勇敢な魂', cost:0, type:'auto', trigger:'leaderAttack', effect:{kind:'gainTension', amount:1}, progress:{triggers:2} },
      { level:3, name:'勇者の雷', cost:3, type:'manual', target:'randomEnemy', effect:{kind:'randomEnemyDamage', amount:2, ifLeaderAttackedAmount:3}, progress:null }
    ]
  },
  'タバサ': {
    levels: [
      { level:1, name:'やさしき祈り', cost:0, type:'auto', trigger:'spellCost2Plus', effect:{kind:'restoreMp', amount:1}, progress:{triggers:2} },
      { level:2, name:'魔力共鳴', cost:0, type:'auto', trigger:'spellCost2Plus', effect:{kind:'draw', count:1}, progress:{triggers:2} },
      { level:3, name:'天空の英知', cost:3, type:'manual', target:'none', effect:{kind:'addUsedSpells2PlusDiscountUnique', discount:1}, progress:null }
    ]
  },
  '勇者姫アンルシア': {
    levels: [
      { level:1, name:'眠れる勇者', cost:0, type:'auto', trigger:'adventurerSummon', effect:{kind:'draw', count:1}, progress:{triggers:1} },
      { level:2, name:'覚醒の光', cost:2, type:'manual', target:'none', effect:{kind:'buffAdventurersHandDeck', attack:1, hp:1}, progress:{uses:1} },
      { level:3, name:'破邪の秘技の会得', cost:3, type:'manual', target:'unitAny', effect:{kind:'damage', amount:4, after:'randomHaja'}, progress:null }
    ]
  },
  '大魔王ゾーマ': {
    levels: [
      { level:1, name:'滅びこそ我が喜び', cost:0, type:'manual', target:'unitAny', condition:'handDemon', effect:{kind:'damageAndDraw', amount:4, draw:1}, progress:{uses:1} },
      { level:2, name:'死にゆく者こそ美しい', cost:6, type:'manual', target:'none', condition:'handDemon', effect:{kind:'silenceAndDamageEnemyUnits', amount:3}, progress:{uses:1} },
      { level:3, name:'我が腕の中で息絶えるがいい', cost:0, type:'manual', target:'none', requiredTension:3, condition:'noAnnihilatorZoma', effect:{kind:'addToHand', name:'全てを滅ぼす者ゾーマ'}, progress:null }
    ]
  },
  '天空の花嫁フローラ': {
    levels: [
      { level:1, name:'癒しをあなたに', cost:0, type:'manual', target:'none', effect:{kind:'healLeaderAndDraw', amount:2, draw:1}, progress:{uses:2} },
      { level:2, name:'贈り物をみんなに', cost:1, type:'manual', target:'friendlyUnit', effect:{kind:'buffFriendlyUnitHp', hp:1, status:'spellShieldUntilEnemyEnd'}, progress:{uses:2} },
      { level:3, name:'裁きを彼らに', cost:5, type:'manual', target:'none', requiredTension:3, effect:{kind:'damageAllEnemies', amount:3}, progress:null }
    ]
  },
  '天空の花嫁デボラ': {
    levels: [
      { level:1, name:'この手に切り札を', cost:0, type:'manual', target:'none', effect:{kind:'drawFromDeck', filter:'bet'}, progress:{uses:2} },
      { level:2, name:'アゲていくわよ', cost:0, type:'auto', trigger:'betActivated', effect:{kind:'gainTension', amount:1}, progress:{triggers:2} },
      { level:3, name:'小魚への施し', cost:3, type:'manual', target:'none', effect:{kind:'randomCoins'}, progress:null }
    ]
  },
  '天空の花嫁ビアンカ': {
    levels: [
      { level:1, name:'わたしのとくいわざ', cost:1, type:'manual', target:'unitAny', effect:{kind:'damage', amount:2}, progress:{uses:2} },
      { level:2, name:'大切な友達', cost:5, type:'manual', target:'friendlyEmptySlot', effect:{kind:'summonToken', name:'ゲレゲレ', attack:4, hp:4, haste:true}, progress:{uses:1} },
      { level:3, name:'家族との絆', cost:10, type:'manual', target:'none', effect:{kind:'biancaFamilyBond'}, progress:null }
    ]
  },
  'ローレシアの王子': {
    levels: [
      { level:1, name:'王子の覚悟', cost:1, dynamicCost:'noSpellsInDeckMinus1', type:'manual', target:'enemyAnyBlockedByUnits', effect:{kind:'damage', amount:1}, progress:{uses:1} },
      { level:2, name:'紋章を探す旅', cost:1, dynamic:{costPlusPerUse:true, damagePlusPerUse:true}, type:'manual', target:'enemyAnyBlockedByUnits', effect:{kind:'damage', amount:2}, progress:{uses:2} },
      { level:3, name:'破壊神との決戦', cost:3, dynamic:{loreLv3Damage:true}, type:'manual', target:'enemyAnyBlockedByUnits', effect:{kind:'damage', amount:1, resetAfterUse:true}, progress:null }
    ]
  },
  'サマルトリアの王子': {
    levels: [
      { level:1, name:'いやーさがしましたよ', cost:0, type:'manual', target:'none', effect:{kind:'gainTension', amount:2}, progress:{uses:1} },
      { level:2, name:'ぼくにかまわず行ってくれ', cost:1, type:'manual', target:'none', effect:{kind:'none'}, progress:{uses:1}, onLevelUp:{addToHand:'さあ行こう！'} },
      { level:3, name:'くらえベギラマ！', cost:1, type:'manual', target:'verticalColumnEnemy', effect:{kind:'samaltoriaRandomLv3', variant:'begirama'}, progress:null }
    ],
    lv3Pool:['くらえベギラマ！','ぼくの生命をかける！','いま助けるよ！'],
    lv3Defs:{
      'くらえベギラマ！': {cost:1, variant:'begirama'},
      'ぼくの生命をかける！': {cost:5, variant:'life'},
      'いま助けるよ！': {cost:1, variant:'revive'}
    }
  },
  'サルマトリアの王子': null,
  'ムーンブルクの王女': {
    levels: [
      { level:1, name:'悲しげな犬', cost:0, type:'auto', trigger:'spellCost1Plus', effect:{kind:'draw', count:1}, progress:{triggers:1} },
      { level:2, name:'旅立ちの王女', cost:3, dynamicCost:'spellCostThisTurnDiscount', type:'manual', target:'choiceMoonLv2', effect:{kind:'damageAllUnits', amount:1}, progress:{uses:2} },
      { level:3, name:'精霊ルビスの加護', cost:0, type:'auto', trigger:'spellCost3Plus', effect:{kind:'rubissBlessing'}, progress:null }
    ]
  }
};

const VIRTUAL_CARD_DEFS = {
  '王女の愛': { name:'王女の愛', cost:0, cardType:'特技', text:'味方リーダーのHPを3回復する。', effect:{kind:'healLeader', amount:3} },
  '全てを滅ぼす者ゾーマ': { name:'全てを滅ぼす者ゾーマ', cost:10, attack:10, hp:10, cardType:'ユニット', text:'召喚時：強大なゾーマ。効果は後続実装。', tribes:['魔王系'] },
  'さあ行こう！': { name:'さあ行こう！', cost:0, cardType:'特技', text:'味方リーダーのMPを2回復する。', effect:{kind:'restoreMp', amount:2} },
  '棺桶': { name:'棺桶', cost:0, attack:0, hp:1, cardType:'ユニット', text:'サマルトリアの王子の効果で出る棺桶。', effect:null },
  'ゲレゲレ': { name:'ゲレゲレ', cost:0, attack:4, hp:4, cardType:'ユニット', text:'速攻。天空の花嫁ビアンカのヒーロースキルで出る。', effect:null },
  'コイン': { name:'コイン', cost:0, cardType:'特技', text:'BETを発動するために使う。', effect:{kind:'coin'} },
  'スライム': { name:'スライム', cost:0, attack:1, hp:1, cardType:'ユニット', text:'1/1のスライム。', effect:null },
  'ピサロナイト': { name:'ピサロナイト', cost:0, attack:1, hp:1, cardType:'ユニット', text:'1/1のピサロナイト。', effect:null },
  'サラマンダー': { name:'サラマンダー', cost:0, attack:8, hp:8, cardType:'ユニット', text:'超貫通。ベビーサラマンダーがBET4回で変身する。', effect:null }
};

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
  $('open-deckbuilder').addEventListener('click', () => { show('deckbuilder'); renderAll(); renderDeckEditorList(); });
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
  const choiceClose = $('choice-modal-close');
  if(choiceClose) choiceClose.addEventListener('click', () => $('choice-modal').close());
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

function renderAll(){ renderCards(); renderDeck(); renderDeckEditorList(); }
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
  const targetId = state.editingDeckId || `local_${Date.now()}`;
  saveLocalDeck(targetId, payload);
  if(state.firebase.enabled && state.firebase.uid && state.firebase.db){
    if(state.editingDeckId && !String(state.editingDeckId).startsWith('local_')){
      await set(ref(state.firebase.db, `players/${state.playerId}/decks/${state.editingDeckId}`), { ...payload, updatedAt: serverTimestamp() });
    }else{
      const newRef = push(ref(state.firebase.db, `players/${state.playerId}/decks`));
      await set(newRef, { ...payload, updatedAt: serverTimestamp() });
      if(!state.editingDeckId) state.editingDeckId = newRef.key;
    }
    $('save-status').textContent = 'Firebase保存済み'; toast('Firebaseに保存しました。', true);
  }else{ $('save-status').textContent = 'ローカル保存済み'; toast('保存しました。', true); }
  renderSavedDecks();
  renderDeckEditorList();
}

function saveLocalDeck(id, payload){ const all = JSON.parse(localStorage.getItem('dqr_decks') || '{}'); all[id] = payload; localStorage.setItem('dqr_decks', JSON.stringify(all)); state.userDecks = all; }
function loadLocalDecks(){ state.userDecks = JSON.parse(localStorage.getItem('dqr_decks') || '{}'); renderSavedDecks(); }
function subscribeFirebaseDecks(){
  if(!state.firebase.enabled || !state.playerId || !state.firebase.db) return;
  onValue(ref(state.firebase.db, `players/${state.playerId}/decks`), snap => { state.firebaseDecks = snap.val() || {}; renderSavedDecks(); renderDeckEditorList(); if($('battle-deck-list')) renderBattleDeckList(); });
}
function renderSavedDecks(){
  const box = $('saved-decks'); if(!box) return;
  const merged = {...(state.userDecks || {}), ...(state.firebaseDecks || {})}; const entries = Object.entries(merged).sort((a,b)=>String(b[1].updatedAtLocal||'').localeCompare(String(a[1].updatedAtLocal||'')));
  if(!entries.length){ box.className='saved-decks empty'; box.textContent='まだありません'; return; }
  box.className='saved-decks'; box.innerHTML='';
  for(const [id,deck] of entries.slice(0,10)){
    const row = document.createElement('div'); row.className='saved-row';
    row.innerHTML = `<span>${escapeHtml(deck.deckName)}<br><small>${escapeHtml(deck.className || '')} / ${deck.total || 0}枚</small></span>`;
    const load = document.createElement('button'); load.textContent='読込'; load.onclick=()=>loadDeck(deck, id);
    const del = document.createElement('button'); del.textContent='削除'; del.onclick=()=>deleteDeck(id);
    row.append(load, del); box.appendChild(row);
  }
}
async function deleteDeck(id){
  const all = JSON.parse(localStorage.getItem('dqr_decks') || '{}'); delete all[id]; localStorage.setItem('dqr_decks', JSON.stringify(all)); state.userDecks = all;
  if(state.firebase.enabled && state.firebase.uid && state.firebase.db && !id.startsWith('local_')) await remove(ref(state.firebase.db, `players/${state.playerId}/decks/${id}`));
  renderSavedDecks();
}
function loadDeck(data, id=''){
  state.editingDeckId = id || '';
  if(data.className){ state.selectedClass = data.className; $('class-select').value = data.className; }
  state.selectedHeroId = data.heroId || '';
  state.deck.clear(); for(const item of data.cards || []) state.deck.set(item.cardId, item.count || 1);
  $('deck-name').value = data.deckName || '';
  $('save-status').textContent = state.editingDeckId ? '編集中' : '未保存';
  renderAll(); toast(state.editingDeckId ? '既存デッキを編集します。' : '新規デッキを作成します。');
}
function newDeck(){
  state.editingDeckId = '';
  state.selectedClass = '';
  state.selectedHeroId = '';
  state.deck.clear();
  $('class-select').value = '';
  $('deck-name').value = '';
  $('save-status').textContent = '未保存';
  renderAll();
}
function renderDeckEditorList(){
  const box = $('deck-editor-list');
  if(!box) return;
  const merged = {...(state.userDecks || {}), ...(state.firebaseDecks || {})};
  const entries = Object.entries(merged).sort((a,b)=>String(b[1].updatedAtLocal||'').localeCompare(String(a[1].updatedAtLocal||'')));
  box.innerHTML = '';
  const create = document.createElement('button');
  create.className = `deck-editor-chip new ${!state.editingDeckId ? 'active' : ''}`;
  create.innerHTML = '<strong>＋ 新規作成</strong><small>空のデッキ</small>';
  create.onclick = newDeck;
  box.appendChild(create);
  for(const [id,deck] of entries){
    const btn = document.createElement('button');
    btn.className = `deck-editor-chip ${state.editingDeckId === id ? 'active' : ''}`;
    btn.innerHTML = `<strong>${escapeHtml(deck.deckName || '無名デッキ')}</strong><small>${escapeHtml(deck.className || '')} / ${deck.total || 0}枚</small>`;
    btn.onclick = () => loadDeck(deck, id);
    box.appendChild(btn);
  }
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
      heroSkillUsedThisTurn: false,
      leaderAttack: 0,
      leaderCanAttack: false,
      leaderAttackedThisTurn: false,
      usedSpells2Plus: [],
      usedSpellCostThisTurn: 0,
      costOverrides: {},
      deaths: [],
      powerfulBadges: [],
      buildings: [],
      turnAuras: [],
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
    statuses: [],
    canAttack: false,
    summoningSickness: true,
    keywords: parseKeywordFlags(card),
    statuses: []
  };
}



function findCardByName(name){
  return state.allCards.find(c => c.name === name) || ensureVirtualCard(name);
}
function ensureVirtualCard(name){
  const def = VIRTUAL_CARD_DEFS[name];
  if(!def) return null;
  const id = `virtual_${name.replace(/\s+/g,'_')}`;
  let card = state.allCards.find(c => c.id === id || c.name === name);
  if(card) return card;
  card = { id, name:def.name, cost:def.cost ?? 0, attack:def.attack ?? 0, hp:def.hp ?? 0, cardType:def.cardType || '特技', rarity:'トークン', text:def.text || '', classes:['共通'], tribes:def.tribes || [], tags:[def.cardType || '特技'], flags:{deckBuildable:false}, virtualEffect:def.effect || null };
  state.allCards.push(card);
  return card;
}
function addCardToHandByName(name){
  const card = findCardByName(name);
  if(card) state.battle.game.player.hand.push(card.id);
}
function isAdventurer(card){ return (card?.tribes || []).includes('冒険者') || String(card?.searchText || '').includes('冒険者'); }
function isDemon(card){ return (card?.tribes || []).includes('魔王系') || String(card?.searchText || '').includes('魔王系'); }
function isSpell(card){ return card?.cardType === '特技'; }
function isWeapon(card){ return card?.cardType === '武器'; }
function isBet(card){ return String(card?.text || card?.searchText || '').includes('BET'); }
function getEffectiveCost(card){
  const game = state.battle.game;
  if(!card) return 0;
  if(game?.player?.costOverrides?.[card.id] != null) return Math.max(0, game.player.costOverrides[card.id]);
  const delta = Number(game?.player?.costOverrides?.globalDelta || 0);
  return Math.max(0, Number(card.cost || 0) + delta);
}
function damageUnit(unit, amount, options={}){
  if(!unit) return 0;
  let dmg = Number(amount || 0);
  if(unit.keywords?.hardMetal && dmg <= 5) dmg = 1;
  else if(unit.keywords?.metal && dmg <= 3) dmg = 1;
  if(unit.statuses?.some(s => s.type === 'immuneDamage')) dmg = 0;
  unit.hp -= dmg;
  return dmg;
}
function damageLeader(side, amount){
  const g = state.battle.game;
  const p = side === 'player' ? g.player : g.enemy;
  p.hp = Math.max(0, p.hp - Number(amount || 0));
  if(p.hp <= 0) showBattleResult(side === 'enemy' ? 'win' : 'lose');
}
function healUnit(unit, amount){
  if(!unit) return;
  unit.hp = Math.min(unit.maxHp, unit.hp + Number(amount || 0));
}
function healLeader(amount){
  const g=state.battle.game; g.player.hp = Math.min(g.player.maxHp, g.player.hp + Number(amount || 0));
}
function chooseRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function findAndDrawFromDeck(filterFn){
  const g = state.battle.game;
  const idx = g.player.deck.findIndex(id => filterFn(byId(id)));
  if(idx >= 0){ g.player.hand.push(g.player.deck.splice(idx,1)[0]); return true; }
  return false;
}
function hasEnemyTargetableUnit(){ return state.battle.game.enemy.board.some(Boolean); }

function getCardText(card){
  return String(card?.text || card?.effectText || card?.searchText || '');
}

function parseKeywordFlags(card){
  const text = getCardText(card);
  return {
    taunt: text.includes('におうだち'),
    haste: text.includes('速攻'),
    support: text.includes('おうえん'),
    snipe: text.includes('ねらい撃ち'),
    stealth: text.includes('ステルス'),
    piercing: text.includes('貫通') && !text.includes('超貫通'),
    superPiercing: text.includes('超貫通'),
    metal: text.includes('メタルボディ') && !text.includes('ハードメタルボディ'),
    hardMetal: text.includes('ハードメタルボディ'),
    doubleAttack: text.includes('2回攻撃'),
    firstStrike: text.includes('先制'),
    vanish: text.includes('消滅'),
    tensionLink: text.includes('テンションリンク'),
    skillLink: text.includes('スキルリンク'),
    deathrattle: text.includes('死亡時'),
    summon: text.includes('召喚時'),
    powerBadge: text.includes('パワフルバッジ') || text.includes('パワフルバッチ'),
    building: card?.cardType === '建物' || text.includes('耐久値') || text.includes('自分のターン終了時耐久値'),
    costBoost: text.includes('コスト-') || text.includes('コストを-') || text.includes('コストが') && text.includes('下がる'),
    move: text.includes('移動') || text.includes('前列') || text.includes('後列') || text.includes('1マス上') || text.includes('1マス下'),
    get: text.includes('GET'),
    bet: text.includes('BET'),
    dungeon: text.includes('ダンジョン'),
    choice: text.includes('選択'),
    fortune: text.includes('占い'),
    synchro: text.includes('シンクロ'),
    renkei: text.includes('れんけい'),
    skillBoost: text.includes('スキルブースト')
  };
}

function summarizeKeywords(flags){
  const label = [];
  if(flags.taunt) label.push('仁王');
  if(flags.haste) label.push('速攻');
  if(flags.snipe) label.push('狙撃');
  if(flags.piercing) label.push('貫通');
  if(flags.superPiercing) label.push('超貫');
  if(flags.metal) label.push('金属');
  if(flags.hardMetal) label.push('硬金');
  if(flags.stealth) label.push('隠密');
  if(flags.powerBadge) label.push('バッジ');
  if(flags.building) label.push('建物');
  return label.slice(0,2).join('/');
}

function applySummonKeywords(unit, card){
  const flags = parseKeywordFlags(card);
  unit.keywords = flags;
  unit.attacksLeft = flags.doubleAttack ? 2 : 1;
  if(flags.haste || flags.firstStrike){
    unit.canAttack = true;
    unit.summoningSickness = false;
  }
  if(flags.support){
    gainTension(1, 'おうえん');
  }
  if(flags.powerBadge){
    state.battle.game.player.powerfulBadges.push({
      source: card.name,
      text: getCardText(card),
      flags
    });
    battleLog(`パワフルバッジ：${card.name}の効果が永続しました。`);
    applyPowerfulBadges();
  }
  if(flags.building){
    unit.isBuilding = true;
    const dungeon = getCardText(card).match(/耐久値\s*(\d+)/);
    unit.durability = dungeon ? 0 : (Number(card.hp || card.attack || 2) || 2);
    unit.maxDurability = dungeon ? Number(dungeon[1]) : unit.durability;
    unit.isDungeon = !!dungeon;
    unit.canAttack = false;
    unit.attack = 0;
    state.battle.game.player.buildings.push({id:unit.id, cardId:card.id, name:card.name});
    battleLog(`${card.name}を${unit.isDungeon ? 'ダンジョン' : '建物'}として設置しました。`);
  }
  if(flags.choice) applyChoiceEffect(card);
  if(flags.fortune) applyFortuneEffect(card);
  if(getCardText(card).includes('さくせん') || getCardText(card).includes('作戦')) applyStrategyToUnit(unit);
  if(flags.summon){
    applySummonTextEffect(unit, card);
  }
  applyPowerfulBadges();
  triggerTensionLinks('summon', {unit, card});
}

function gainTension(amount=1, reason=''){
  const game = state.battle.game;
  const before = game.player.tension;
  game.player.tension = Math.min(3, game.player.tension + Number(amount || 0));
  if(game.player.tension !== before) battleLog(`${reason ? reason + '：' : ''}テンション+${amount}。`);
  triggerTensionLinks('tensionGain', {amount});
}

function applySummonTextEffect(unit, card){
  const game = state.battle.game;
  const text = getCardText(card);
  const mGet = text.match(/GET\((\d+)\)/i);
  if(mGet){
    for(let i=0;i<Number(mGet[1]);i++) addCardToHandByName('コイン');
    battleLog(`GET(${mGet[1]})：コインを手札に加えました。`);
  }
  if(text.includes('カードを1枚引く') || text.includes('カードを１枚引く')){
    drawCard(1);
    battleLog(`${card.name}：カードを1枚引きました。`);
  }
  const damageMatch = text.match(/(?:敵ユニット|ユニット|敵1体|敵１体).*?(\d+)ダメージ/);
  if(damageMatch && text.includes('召喚時')){
    game.pendingGenericEffect = {kind:'damage', amount:Number(damageMatch[1]), source:card.name, target:'enemyUnit'};
    battleLog(`${card.name}：召喚時ダメージ対象を選んでください。`);
  }
  if(text.includes('味方リーダーのテンション+1') || text.includes('味方リーダーのテンション＋1')){
    gainTension(1, card.name);
  }
  if(text.includes('味方リーダーのHPを') && text.includes('回復')){
    const m = text.match(/HPを(\d+)回復/);
    if(m) healLeader(Number(m[1]));
  }
}

function triggerTensionLinks(reason, payload={}){
  const game = state.battle.game;
  if(reason !== 'tensionGain') return;
  for(const unit of game.player.board){
    if(!unit?.keywords?.tensionLink) continue;
    const text = getCardText(byId(unit.cardId));
    if(text.includes('攻撃力+1') || text.includes('攻撃力＋1')) unit.attack += 1;
    if(text.includes('HPを1回復')) healLeader(1);
    battleLog(`テンションリンク：${unit.name}が発動。`);
  }
}

function applyPowerfulBadges(){
  const game = state.battle.game;
  if(!game?.player?.powerfulBadges?.length) return;
  for(const unit of game.player.board){
    if(!unit || unit._badgeApplied) continue;
    const card = byId(unit.cardId);
    const tribeText = String(card?.searchText || '') + String(card?.text || '');
    for(const badge of game.player.powerfulBadges){
      if(badge.text.includes('ゾンビ系') && !tribeText.includes('ゾンビ系')) continue;
      if(badge.text.includes('速攻')) unit.keywords.haste = true, unit.canAttack = true;
      if(badge.text.includes('貫通')) unit.keywords.piercing = true;
      if(badge.text.includes('HP+1') || badge.text.includes('HP＋1')) unit.hp += 1, unit.maxHp += 1;
      if(badge.text.includes('攻撃力+1') || badge.text.includes('攻撃力＋1')) unit.attack += 1;
    }
    unit._badgeApplied = true;
  }
}

function hasEnemyTaunt(){
  const game = state.battle.game;
  return game.enemy.board.some(u => u?.keywords?.taunt && !u?.keywords?.stealth);
}

function canTargetEnemyUnit(unit){
  const game = state.battle.game;
  const atkRef = game.selectedAttacker;
  if(!atkRef) return true;
  const atk = atkRef.side === 'playerLeader' ? {keywords:{snipe:false}} : (atkRef.side === 'player' ? game.player.board : game.enemy.board)[atkRef.pos];
  if(atk?.keywords?.snipe) return true;
  if(unit?.keywords?.stealth) return false;
  if(hasEnemyTaunt()) return !!unit?.keywords?.taunt;
  return true;
}

function cardCanBeSummoned(card){
  return card && card.cardType === 'ユニット';
}


function clearTargetHighlights(){
  document.querySelectorAll('.unit-slot, .leader').forEach(el => {
    el.classList.remove('targetable','blocked-target','summonable');
  });
}
function updateTargetHighlights(){
  clearTargetHighlights();
  const game = state.battle.game;
  if(!game) return;
  if(game.selectedHandIndex != null){
    const card = byId(game.player.hand[game.selectedHandIndex]);
    if(cardCanBeSummoned(card)){
      document.querySelectorAll('.unit-slot[data-side="player"]').forEach(slot => {
        const pos = Number(slot.dataset.pos);
        if(!game.player.board[pos]) slot.classList.add('summonable');
      });
    }
  }
  if(game.pendingHeroSkill || game.pendingGenericEffect){
    const target = game.pendingHeroSkill?.target || game.pendingGenericEffect?.target || '';
    if(target === 'friendlyEmptySlot'){
      document.querySelectorAll('.unit-slot[data-side="player"]').forEach(slot => {
        const pos = Number(slot.dataset.pos);
        if(!game.player.board[pos]) slot.classList.add('summonable');
      });
      return;
    }
    document.querySelectorAll('.unit-slot').forEach(slot => {
      const side = slot.dataset.side;
      const pos = Number(slot.dataset.pos);
      const unit = side === 'player' ? game.player.board[pos] : game.enemy.board[pos];
      if(!unit) return;
      const ok = target.includes('friendly') ? side === 'player' : target.includes('enemy') ? side === 'enemy' : true;
      slot.classList.toggle('targetable', ok);
      slot.classList.toggle('blocked-target', !ok);
    });
    if(target === 'enemyAny' || target === 'enemyAnyBlockedByUnits' || target === 'enemyLeader' || game.pendingGenericEffect?.target === 'enemyAny'){
      const enemyLeader = document.querySelector('.enemy-leader');
      if(enemyLeader) enemyLeader.classList.toggle('targetable', !(target === 'enemyAnyBlockedByUnits' && hasEnemyTargetableUnit()));
    }
  }
  if(game.selectedAttacker){
    document.querySelectorAll('.unit-slot[data-side="enemy"]').forEach(slot => {
      const pos = Number(slot.dataset.pos);
      const unit = game.enemy.board[pos];
      if(!unit) return;
      const ok = canTargetEnemyUnit(unit);
      slot.classList.toggle('targetable', ok);
      slot.classList.toggle('blocked-target', !ok);
    });
    const enemyLeader = document.querySelector('.enemy-leader');
    if(enemyLeader) enemyLeader.classList.toggle('targetable', !hasEnemyTaunt());
  }
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
  if(heroBtn){ heroBtn.classList.toggle('hidden', !game.player.heroSkill); if(game.player.heroSkill){ const s=getHeroLevelDef(game.player.heroSkill); heroBtn.textContent = s?.type === 'auto' ? `Auto Lv.${game.player.heroSkill.level}` : `Hero Lv.${game.player.heroSkill.level}`; heroBtn.classList.toggle('used', !!game.player.heroSkillUsedThisTurn); } }
  document.querySelector('.player-leader')?.classList.toggle('leader-can-attack', game.player.leaderAttack > 0 && game.player.leaderCanAttack);
  updateTargetHighlights();
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
      const kw = summarizeKeywords(unit.keywords || {});
      slot.innerHTML = `${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(unit.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}${kw ? `<em class="unit-keyword">${escapeHtml(kw)}</em>` : ''}<span class="unit-atk">${unit.isBuilding ? '建' : unit.attack}</span><span class="unit-hp">${unit.isBuilding ? (unit.durability ?? unit.hp) : unit.hp}</span><span class="unit-hpbar"><i style="width:${Math.max(0, Math.min(100, Math.round(((unit.isBuilding ? (unit.durability ?? unit.hp) : unit.hp) / Math.max(1, unit.isBuilding ? (unit.maxHp || unit.durability || 1) : unit.maxHp)) * 100)))}%"></i></span>`;
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
  document.querySelector('.player-leader').onclick = () => selectLeaderAttacker();
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
    const playable = getEffectiveCost(card) <= game.player.mp;
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
  if(getEffectiveCost(card) > game.player.mp){
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
  if(game.pendingHeroSkill?.target === 'friendlyEmptySlot') return applyPendingHeroSkillToEmptySlot(pos);
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
  if(!card || getEffectiveCost(card) > game.player.mp) return;
  game.player.mp -= getEffectiveCost(card);
  game.player.hand.splice(index, 1);
  game.player.board[pos] = makeUnitFromCard(card);
  triggerCardPlayedForHero(card);
  if(isBet(card)) triggerHeroAuto('betActivated', {card});
  game.selectedHandIndex = null;
  battleLog(`${card.name}を召喚しました。`);
  applySummonKeywords(game.player.board[pos], card);
  triggerHeroAuto('adventurerSummon', {card});
  renderBattleArena();
  syncMyBattleState();
}



function countCoinsInHand(){
  return state.battle.game.player.hand.filter(id => byId(id)?.name === 'コイン').length;
}
function consumeCoins(n=1){
  const hand = state.battle.game.player.hand;
  let used = 0;
  for(let i=hand.length-1;i>=0 && used<n;i--){
    if(byId(hand[i])?.name === 'コイン'){ hand.splice(i,1); used++; }
  }
  return used === n;
}
function summonTokenByName(name, stats={}, side='player'){
  const game = state.battle.game;
  const board = side === 'player' ? game.player.board : game.enemy.board;
  const idx = board.findIndex(x => !x);
  if(idx < 0) return false;
  const card = findCardByName(name) || ensureVirtualCard(name);
  const unit = makeUnitFromCard(card);
  if(stats.attack != null) unit.attack = Number(stats.attack);
  if(stats.hp != null){ unit.hp = Number(stats.hp); unit.maxHp = Number(stats.hp); }
  if(stats.haste){ unit.keywords.haste = true; unit.canAttack = true; unit.summoningSickness = false; }
  if(stats.taunt) unit.keywords.taunt = true;
  if(stats.piercing) unit.keywords.piercing = true;
  board[idx] = unit;
  return true;
}
function addRandomCardByPredicate(predicate, fallbackName='スライム'){
  const pool = state.allCards.filter(c => predicate(c));
  if(pool.length) state.battle.game.player.hand.push(chooseRandom(pool).id);
  else addCardToHandByName(fallbackName);
}
function parseChoiceOptions(text){
  const body = String(text || '').replace(/^.*?選択[:：]/, '');
  return body.split(/・|。・|①|②|③|④|\(1\)|\(2\)|\(3\)|\(4\)/).map(s => s.trim()).filter(Boolean).slice(0,4);
}
function openChoiceModal(title, options, callback){
  $('choice-modal-title').textContent = title;
  const body = $('choice-modal-body');
  body.innerHTML = options.map((op,i)=>`<button class="choice-option" data-i="${i}">${escapeHtml(op)}</button>`).join('');
  body.querySelectorAll('.choice-option').forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.i);
    $('choice-modal').close();
    callback(options[i], i);
  }));
  $('choice-modal').showModal();
}
function applyTextMiniEffect(text, source='効果'){
  const game = state.battle.game;
  text = String(text || '');
  if(text.includes('カードを1枚引く') || text.includes('カードを１枚引く')) drawCard(1);
  if(text.includes('カードを2枚引く') || text.includes('カードを２枚引く')) drawCard(2);
  if(text.includes('テンション+2') || text.includes('テンション＋2')) gainTension(2, source);
  else if(text.includes('テンション+1') || text.includes('テンション＋1')) gainTension(1, source);
  if(text.includes('味方リーダーのHPを')){
    const m = text.match(/HPを(\d+)回復/); if(m) healLeader(Number(m[1]));
  }
  if(text.includes('敵リーダーに')){
    const m = text.match(/敵リーダーに(\d+)ダメージ/); if(m) damageLeader('enemy', Number(m[1]));
  }
  if(text.includes('全ての敵ユニットに') || text.includes('全ての敵に')){
    const m = text.match(/(\d+)ダメージ/);
    if(m){ for(const u of game.enemy.board) if(u) damageUnit(u, Number(m[1])); if(text.includes('敵リーダー')) damageLeader('enemy', Number(m[1])); resolveDeaths(); }
  }
  if(text.includes('全てのユニットに')){
    const m = text.match(/(\d+)ダメージ/);
    if(m){ for(const u of [...game.player.board, ...game.enemy.board]) if(u) damageUnit(u, Number(m[1])); resolveDeaths(); }
  }
  if(text.includes('スライム') && text.includes('出す')){
    const count = text.includes('2体') || text.includes('２体') ? 2 : 1;
    for(let i=0;i<count;i++) summonTokenByName('スライム', {attack:1,hp:1});
  }
}
function applyFortuneEffect(card){
  const text = getCardText(card);
  const options = parseChoiceOptions(text);
  const picked = chooseRandom(options.length ? options : [text]);
  battleLog(`占い：${picked}`);
  applyTextMiniEffect(picked, card.name);
}
function applyChoiceEffect(card){
  const text = getCardText(card);
  const options = parseChoiceOptions(text);
  if(!options.length) return;
  openChoiceModal(card.name, options, (picked) => {
    battleLog(`選択：${picked}`);
    applyTextMiniEffect(picked, card.name);
    renderBattleArena(); syncMyBattleState();
  });
}
function applyStrategyToUnit(unit){
  if(!unit) return;
  const pool = [
    {name:'ガンガンいこうぜ', apply:u=>{u.attack+=1;}},
    {name:'いのちだいじに', apply:u=>{u.hp+=1; u.maxHp+=1;}},
    {name:'バッチリがんばれ', apply:u=>{u.attack+=1; u.hp+=1; u.maxHp+=1;}},
    {name:'せんりょくうばえ', apply:u=>{u.keywords.snipe=true;}},
    {name:'いろいろやろうぜ', apply:u=>{u.keywords.piercing=true;}},
    {name:'まもりをかためろ', apply:u=>{u.keywords.taunt=true;}},
  ];
  const candidates = shuffle([...pool]).slice(0,3);
  openChoiceModal('さくせん', candidates.map(c=>c.name), (picked, i) => {
    candidates[i].apply(unit);
    battleLog(`さくせん：${picked}を得た。`);
    renderBattleArena(); syncMyBattleState();
  });
}
function applyBetEffectFromText(text, sourceUnit=null){
  const game = state.battle.game;
  text = String(text || '');
  if(sourceUnit){ sourceUnit.betCount = Number(sourceUnit.betCount || 0) + 1; }
  if(text.includes('BET')) triggerHeroAuto('betActivated', {unit:sourceUnit});
  if(text.includes('BET') && text.includes('攻撃力+1') && sourceUnit) sourceUnit.attack += 1;
  if(text.includes('BET') && text.includes('HP+1') && sourceUnit){ sourceUnit.hp += 1; sourceUnit.maxHp += 1; }
  if(text.includes('BET') && text.includes('速攻') && sourceUnit){ sourceUnit.keywords.haste = true; sourceUnit.canAttack = true; }
  if(text.includes('BET') && text.includes('におうだち') && sourceUnit) sourceUnit.keywords.taunt = true;
  if(text.includes('BET') && text.includes('カードを1枚引く')) drawCard(1);
  if(text.includes('BET') && text.includes('味方リーダーのHPを2回復')) healLeader(2);
  if(text.includes('BET') && text.includes('テンション+1')) gainTension(1, 'BET');
  if(text.includes('BET') && text.includes('全てのユニットに1ダメージ')){
    for(const u of [...game.player.board, ...game.enemy.board]) if(u) damageUnit(u,1); resolveDeaths();
  }
  if(text.includes('BET') && text.includes('正面') && text.includes('1ダメージ') && sourceUnit){
    const pos = game.player.board.indexOf(sourceUnit);
    const target = game.enemy.board[pos % 6];
    if(target) damageUnit(target, 1);
  }
  if(sourceUnit?.name?.includes('ベビーサラマンダ') && sourceUnit.betCount >= 4){
    const salamander = findCardByName('サラマンダー');
    const newUnit = makeUnitFromCard(salamander);
    const idx = game.player.board.indexOf(sourceUnit);
    if(idx >= 0) game.player.board[idx] = newUnit;
    battleLog('ベビーサラマンダーがサラマンダーに進化しました。');
  }
}
function useCoinCard(){
  const game = state.battle.game;
  let fired = false;
  for(const unit of game.player.board){
    if(unit){
      const card = byId(unit.cardId);
      if(isBet(card)){ applyBetEffectFromText(getCardText(card), unit); fired = true; }
    }
  }
  if(game.player.weapon?.cardText && game.player.weapon.cardText.includes('BET')){
    applyBetEffectFromText(game.player.weapon.cardText, null); fired = true;
  }
  triggerHeroAuto('betActivated', {});
  battleLog(fired ? 'コインを使い、BETを発動しました。' : 'コインを使いました。');
}
function useExchangeCard(card){
  const coins = countCoinsInHand();
  if(coins < 1) return toast('コインがありません。', false);
  const text = getCardText(card);
  const choices = [];
  const re = /([123])枚[:：]([^、。\n]+)/g;
  let m;
  while((m = re.exec(text))) choices.push({coins:Number(m[1]), reward:m[2].trim()});
  const available = choices.filter(c => coins >= c.coins);
  if(!available.length) return toast('必要な枚数のコインがありません。', false);
  openChoiceModal(card.name, available.map(c=>`${c.coins}枚：${c.reward}`), (picked, i) => {
    const c = available[i];
    if(!consumeCoins(c.coins)) return;
    addCardToHandByName(c.reward.replace(/^コスト\d+の/, '').trim());
    drawCard(1);
    battleLog(`${card.name}：${picked}と交換しました。`);
    renderBattleArena(); syncMyBattleState();
  });
}

function applyGenericCardUseEffect(card, cost){
  const game = state.battle.game;
  const text = getCardText(card);
  if(card.name === 'コイン' || card.virtualEffect?.kind === 'coin'){ useCoinCard(); return; }
  if(text.includes('交換する') && card.name.includes('交換所')){ useExchangeCard(card); return; }
  if(text.includes('占い')){ applyFortuneEffect(card); }
  if(text.includes('選択')){ applyChoiceEffect(card); }
  if(card.cardType === '武器'){
    game.player.leaderAttack = Number(card.attack || 0);
    game.player.leaderCanAttack = game.player.leaderAttack > 0;
    game.player.weapon = {name:card.name, attack:Number(card.attack || 0), durability:Number(card.hp || card.durability || 1), maxDurability:Number(card.hp || card.durability || 1), cardText:text, noCounter:text.includes('反撃ダメージを受けない'), snipe:text.includes('ねらい撃ち'), doubleAttack:text.includes('2回攻撃'), attacksLeft:text.includes('2回攻撃') ? 2 : 1};
    battleLog(`${card.name}を装備しました。リーダー攻撃可能。`);
    return;
  }
  if(text.includes('おうえん')) gainTension(1, 'おうえん');
  if(text.includes('消滅')){
    game.pendingGenericEffect = {kind:'vanish', source:card.name, target:'enemyUnit'};
    battleLog(`${card.name}：消滅させる対象を選んでください。`);
    return;
  }
  const m = text.match(/(?:敵1体|敵１体|ユニット1体|ユニット１体|敵ユニット1体|敵ユニット１体).*?(\d+)ダメージ/);
  if(m){
    game.pendingGenericEffect = {kind:'damage', amount:Number(m[1]), source:card.name, target:'enemyAny'};
    battleLog(`${card.name}：ダメージ対象を選んでください。`);
  }
  if(text.includes('カードを1枚引く') || text.includes('カードを１枚引く')) drawCard(1);
  if(text.includes('カードを2枚引く') || text.includes('カードを２枚引く')) drawCard(2);
  if(text.includes('味方リーダーのHPを') && text.includes('回復')){
    const hm = text.match(/HPを(\d+)回復/);
    if(hm) healLeader(Number(hm[1]));
  }
  if(text.includes('コスト-1') || text.includes('コストを-1')){
    game.player.costOverrides.globalDelta = (game.player.costOverrides.globalDelta || 0) - 1;
    battleLog('コストブースト：以後の一部カードのコストを下げる土台を適用。');
  }
}

function useNonUnitCard(index, card){
  const game = state.battle.game;
  const cost = getEffectiveCost(card);
  if(cost > game.player.mp) return;
  game.player.mp -= cost;
  game.player.hand.splice(index, 1);
  if(card.cardType === 'ヒーロー'){
    activateHeroCard(card);
  }else if(card.virtualEffect){
    applySimpleEffect(card.virtualEffect, {});
    battleLog(`${card.name}を使用しました。`);
  }else{
    applyGenericCardUseEffect(card, cost);
    battleLog(`${card.name}を使用しました。`);
  }
  triggerCardPlayedForHero(card);
  if(isBet(card)) triggerHeroAuto('betActivated', {card});
  if(isSpell(card)){
    game.player.usedSpellCostThisTurn = (game.player.usedSpellCostThisTurn || 0) + cost;
    if(cost >= 2 && !game.player.usedSpells2Plus.includes(card.id)) game.player.usedSpells2Plus.push(card.id);
    if(cost >= 1) triggerHeroAuto('spellCost1Plus', {card, cost});
    if(cost >= 2) triggerHeroAuto('spellCost2Plus', {card, cost});
    if(cost >= 3) triggerHeroAuto('spellCost3Plus', {card, cost});
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
  if(game.pendingHeroSkill){ return applyPendingHeroSkillToUnit(side, pos); }
  if(game.pendingGenericEffect){ return applyPendingGenericEffectToUnit({side, pos}); }
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


function selectLeaderAttacker(){
  const game = state.battle.game;
  if(!game?.isMyTurn || game.finished) return;
  if(game.player.leaderAttack > 0 && game.player.leaderCanAttack){
    game.selectedAttacker = {side:'playerLeader'};
    game.selectedHandIndex = null;
    battleLog('味方リーダー：攻撃対象を選んでください。');
    renderBattleArena();
  }
}

function getBehindPos(pos){
  // Board is 3 columns x 2 rows per side. "Behind" means same column, back row.
  const col = pos % 3;
  const row = Math.floor(pos / 3);
  return row === 0 ? col + 3 : col;
}

function applyPiercingDamage(attacker, defenderRef, amount){
  const game = state.battle.game;
  if(!attacker?.keywords?.piercing && !attacker?.keywords?.superPiercing) return;
  const defBoard = defenderRef.side === 'player' ? game.player.board : game.enemy.board;
  const behind = getBehindPos(defenderRef.pos);
  if(behind !== defenderRef.pos && defBoard[behind]){
    damageUnit(defBoard[behind], amount);
    battleLog(`${attacker.keywords.superPiercing ? '超貫通' : '貫通'}：後ろのユニットにも${amount}ダメージ。`);
  }
  if(attacker.keywords.superPiercing){
    damageLeader(defenderRef.side, amount);
    battleLog(`超貫通：リーダーにも${amount}ダメージ。`);
  }
}


function consumeWeaponDurabilityAfterLeaderAttack(){
  const game = state.battle.game;
  const w = game.player.weapon;
  if(!w) return;
  w.attacksLeft = Math.max(0, Number(w.attacksLeft ?? 1) - 1);
  if(w.attacksLeft <= 0){
    w.durability = Math.max(0, Number(w.durability || 0) - 1);
    w.attacksLeft = w.doubleAttack ? 2 : 1;
  }
  applyWeaponAfterAttack(w);
  if(w.durability <= 0){
    applyWeaponBreakEffect(w);
    game.player.weapon = null;
    game.player.leaderAttack = 0;
    game.player.leaderCanAttack = false;
    battleLog(`${w.name}が壊れました。`);
  }
}
function applyWeaponAfterAttack(w){
  const text = String(w?.cardText || '');
  if(text.includes('攻撃した後') || text.includes('攻撃をした後') || text.includes('攻撃で')){
    if(text.includes('カードを1枚引く')) drawCard(1);
    if(text.includes('味方リーダーのテンション+1')) gainTension(1, w.name);
    if(text.includes('全ての味方ユニットのHPを1回復')){
      for(const u of state.battle.game.player.board) if(u) healUnit(u,1);
    }
    const m = text.match(/ランダムな敵.*?(\d+)ダメージ/);
    if(m){
      const targets = state.battle.game.enemy.board.filter(Boolean);
      if(targets.length) damageUnit(chooseRandom(targets), Number(m[1]));
      else damageLeader('enemy', Number(m[1]));
    }
  }
}
function applyWeaponBreakEffect(w){
  const text = String(w?.cardText || '');
  if(text.includes('壊れた時') || text.includes('破壊')){
    if(text.includes('GET(1)')) addCardToHandByName('コイン');
    if(text.includes('全ての敵ユニットに2ダメージ')){
      for(const u of state.battle.game.enemy.board) if(u) damageUnit(u,2);
      resolveDeaths();
    }
    if(text.includes('道具カード')) addRandomCardByPredicate(c => String(c.text||'').includes('道具'), 'ちからのたね');
  }
}

function attackUnit(attackerRef, defenderRef){
  const game = state.battle.game;
  if(game.pendingGenericEffect){
    return applyPendingGenericEffectToUnit(defenderRef);
  }
  const atkBoard = attackerRef.side === 'player' ? game.player.board : game.enemy.board;
  const defBoard = defenderRef.side === 'player' ? game.player.board : game.enemy.board;
  const atk = attackerRef.side === 'playerLeader' ? {name:'味方リーダー', attack:game.player.leaderAttack, canAttack:game.player.leaderCanAttack, keywords:{}} : atkBoard[attackerRef.pos];
  const def = defBoard[defenderRef.pos];
  if(!atk || !def || !atk.canAttack) return;
  damageUnit(def, atk.attack);
  applyPiercingDamage(atk, defenderRef, atk.attack);
  if(game.selectedAttacker.side === 'playerLeader'){
    if(!game.player.weapon?.noCounter) game.player.hp = Math.max(0, game.player.hp - Math.max(0, def.attack));
    consumeWeaponDurabilityAfterLeaderAttack();
    game.player.leaderCanAttack = game.player.weapon?.attacksLeft > 0;
    game.player.leaderAttackedThisTurn = true;
    triggerHeroAuto('leaderAttack', {});
    progressDungeonsByEvent('leaderAttack');
  }else{
    damageUnit(atk, def.attack);
    atk.attacksLeft = Math.max(0, (atk.attacksLeft ?? 1) - 1);
    atk.canAttack = atk.attacksLeft > 0;
  }
  battleLog(`${atk.name}が${def.name}を攻撃。`);
  resolveDeaths();
  game.selectedAttacker = null;
  renderBattleArena();
  syncMyBattleState();
}

function attackLeader(targetSide){
  const game = state.battle.game;
  if(game.pendingHeroSkill && targetSide === 'enemy') return applyPendingHeroSkillToLeader();
  if(game.pendingGenericEffect && targetSide === 'enemy') return applyPendingGenericEffectToLeader();
  if(targetSide === 'enemy' && hasEnemyTaunt()) return toast('におうだちを持つユニットを先に攻撃してください。', false);
  if(!game.selectedAttacker) return;
  let atk;
  if(game.selectedAttacker.side === 'playerLeader') atk = { name:'味方リーダー', attack: game.player.leaderAttack, canAttack: game.player.leaderCanAttack, keywords:{} };
  else { const atkBoard = game.selectedAttacker.side === 'player' ? game.player.board : game.enemy.board; atk = atkBoard[game.selectedAttacker.pos]; }
  if(!atk || !atk.canAttack) return;
  damageLeader(targetSide, atk.attack);
  if(game.selectedAttacker.side === 'playerLeader'){
    consumeWeaponDurabilityAfterLeaderAttack();
    game.player.leaderCanAttack = game.player.weapon?.attacksLeft > 0;
    game.player.leaderAttackedThisTurn = true;
    triggerHeroAuto('leaderAttack', {});
    progressDungeonsByEvent('leaderAttack');
  } else {
    atk.attacksLeft = Math.max(0, (atk.attacksLeft ?? 1) - 1);
    atk.canAttack = atk.attacksLeft > 0;
  }
  battleLog(`${atk.name}が${targetSide === 'enemy' ? '敵リーダー' : '自分リーダー'}に${atk.attack}ダメージ。`);
  game.selectedAttacker = null;
  renderBattleArena();
  syncMyBattleState();
}

function resolveDeaths(){
  const game = state.battle.game;
  for(const side of ['player','enemy']){
    const player = side === 'player' ? game.player : game.enemy;
    player.board.forEach((unit, i) => {
      if(unit && unit.hp <= 0){
        if(!unit.vanished){
          applyDeathrattle(unit, side);
          if(side === 'player'){ game.player.deaths.push({cardId:unit.cardId, name:unit.name, attack:unit.attack, hp:unit.maxHp}); progressDungeonsByEvent('unitDeath'); }
        }
        battleLog(`${unit.name}は${unit.vanished ? '消滅' : '死亡'}しました。`);
        player.board[i] = null;
      }
    });
  }
}

function applyDeathrattle(unit, side){
  if(!unit?.keywords?.deathrattle) return;
  const game = state.battle.game;
  const text = getCardText(byId(unit.cardId));
  if(text.includes('カードを1枚引く') || text.includes('カードを１枚引く')) drawCard(1);
  if(text.includes('お互いのリーダーに2ダメージ')){
    damageLeader('player', 2); damageLeader('enemy', 2);
  }
  if(text.includes('敵リーダーに') && text.includes('ダメージ')){
    const m = text.match(/敵リーダーに(\d+)ダメージ/);
    if(m) damageLeader('enemy', Number(m[1]));
  }
  if(text.includes('手札に加える')){
    addCardToHandByName(unit.name);
  }
  battleLog(`死亡時：${unit.name}の効果を処理しました。`);
}

function applyPendingGenericEffectToUnit(defenderRef){
  const game = state.battle.game;
  const eff = game.pendingGenericEffect;
  const board = defenderRef.side === 'player' ? game.player.board : game.enemy.board;
  const unit = board[defenderRef.pos];
  if(!eff || !unit) return;
  if(eff.kind === 'damage') damageUnit(unit, eff.amount);
  if(eff.kind === 'vanish'){ unit.vanished = true; unit.hp = 0; }
  battleLog(`${eff.source}：${unit.name}に${eff.amount ?? ''}${eff.kind === 'damage' ? 'ダメージ' : '消滅'}。`);
  game.pendingGenericEffect = null;
  resolveDeaths();
  renderBattleArena();
  syncMyBattleState();
}

function applyPendingGenericEffectToLeader(){
  const game = state.battle.game;
  const eff = game.pendingGenericEffect;
  if(!eff) return;
  if(eff.kind === 'damage') damageLeader('enemy', eff.amount);
  battleLog(`${eff.source}：敵リーダーに${eff.amount}ダメージ。`);
  game.pendingGenericEffect = null;
  renderBattleArena();
  syncMyBattleState();
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
    gainTension(1, 'テンション');
    game.player.tensionUsedThisTurn = true;
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
    game.player.leaderAttack += Number(effect.attack || 0); game.player.leaderCanAttack = true; battleLog(`このターン中リーダー攻撃力+${effect.attack || 0}。リーダーが攻撃できます。`);
  }else if(effect.type === 'equipWeapon'){
    game.player.leaderAttack = Math.max(game.player.leaderAttack, Number(effect.weapon?.attack || 0)); game.player.leaderCanAttack = true; battleLog(`${effect.weapon?.name || '武器'}を装備しました。リーダーが攻撃できます。`);
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
  $('tension-button').dataset.tension = String(game.player.tension);
  if($('tension-count-label')) $('tension-count-label').textContent = String(game.player.tension);
  $('tension-button').classList.toggle('ready', game.player.tension >= 3);
  $('tension-button').title = game.player.tension >= 3 ? `テンションスキル: ${game.player.leaderSkill?.skillName || ''}` : 'テンションをためる';
}


function applyBuildingTurnEnd(unit){
  const text = getCardText(byId(unit.cardId));
  if(text.includes('自分のターン終了時')){
    if(text.includes('カードを1枚引く')) drawCard(1);
    if(text.includes('テンション+1')) gainTension(1, unit.name);
    if(text.includes('道具カード')) addRandomCardByPredicate(c => String(c.text||'').includes('道具'), 'ちからのたね');
    if(text.includes('隣接') && text.includes('HPを1回復')){
      for(const u of state.battle.game.player.board) if(u && !u.isBuilding) healUnit(u, 1);
    }
    if(text.includes('+1/+1') || text.includes('＋1/＋1')){
      for(const u of state.battle.game.player.board) if(u && !u.isBuilding){ u.attack += 1; u.hp += 1; u.maxHp += 1; }
    }
    if(!unit.isDungeon) unit.durability = Math.max(0, (unit.durability ?? 1) - 1);
  }
  if(unit.isDungeon){
    const before = unit.durability || 0;
    if(text.includes('味方ユニットが場に出る')){} // event side hook later
    if(text.includes('テンションリンク')){} // trigger hook later
    if(text.includes('自分のターン終了時') && text.includes('耐久値+1')) unit.durability += 1;
    if(unit.durability !== before) battleLog(`${unit.name}：耐久値${unit.durability}/${unit.maxDurability}`);
    if(unit.durability >= unit.maxDurability) completeDungeon(unit);
  }
}
function completeDungeon(unit){
  const text = getCardText(byId(unit.cardId));
  battleLog(`${unit.name}を踏破しました。`);
  if(text.includes('カードを3枚引く')) drawCard(3);
  if(text.includes('王女の愛')) addCardToHandByName('王女の愛');
  if(text.includes('ドルマドン')) addCardToHandByName('ドルマドン');
  if(text.includes('しあわせの箱')) addCardToHandByName('しあわせの箱');
  if(text.includes('おうごんのつめ')) addCardToHandByName('おうごんのつめ');
  unit.hp = 0;
}
function progressDungeonsByEvent(eventName){
  const game = state.battle.game;
  for(const b of game.player.board){
    if(!b?.isDungeon) continue;
    const text = getCardText(byId(b.cardId));
    if(eventName === 'summon' && text.includes('味方ユニットが場に出る')) b.durability += 1;
    if(eventName === 'leaderAttack' && text.includes('味方リーダーが攻撃した後')) b.durability += 1;
    if(eventName === 'unitDeath' && text.includes('味方ユニットが死亡する度')) b.durability += game.player.maxMp >= 8 ? 2 : 1;
    if(b.durability >= b.maxDurability) completeDungeon(b);
  }
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
  game.player.heroSkillUsedThisTurn = false;
  game.player.usedSpellCostThisTurn = 0;
  game.player.leaderAttack = 0;
  game.player.leaderCanAttack = false;
  game.player.leaderAttackedThisTurn = false;
  for(let i=0;i<game.player.board.length;i++){
    const unit = game.player.board[i];
    if(unit){
      unit.statuses = (unit.statuses || []).filter(s => !s.until || s.until !== 'turnStart');
      if(unit.isBuilding){
        applyBuildingTurnEnd(unit);
        if(!unit.isDungeon && unit.durability <= 0){ unit.hp = 0; battleLog(`${unit.name}の耐久値が0になりました。`); }
      }else{
        unit.summoningSickness = false;
        unit.attacksLeft = unit.keywords?.doubleAttack ? 2 : 1;
        unit.canAttack = true;
      }
    }
  }
  resolveDeaths();
  drawCard(1);
  battleLog(`ターン${game.turn}: MPが${game.player.mp}になりました。`);
  renderBattleArena();
  syncMyBattleState();
  advanceTurnToOpponent();
}


function getHeroDef(heroName){ if(heroName === 'サルマトリアの王子') heroName = 'サマルトリアの王子'; return HERO_SKILL_DEFS[heroName]; }
function getHeroLevelDef(heroSkill){
  const def = getHeroDef(heroSkill.heroCardName);
  let skill = def?.levels?.find(l => l.level === heroSkill.level) || null;
  if(skill && heroSkill.level === 3 && (heroSkill.heroCardName === 'サマルトリアの王子' || heroSkill.heroCardName === 'サルマトリアの王子')){
    const name = heroSkill.currentCardName || skill.name;
    const lv3 = def.lv3Defs?.[name] || def.lv3Defs?.['くらえベギラマ！'];
    skill = {...skill, name, cost:lv3.cost, effect:{kind:'samaltoriaRandomLv3', variant:lv3.variant}};
  }
  return skill;
}
function activateHeroCard(card){
  const game = state.battle.game;
  const def = getHeroDef(card.name);
  game.player.heroSkill = {
    heroCardName: card.name,
    level: 1,
    progressCount: 0,
    lv2UseCount: 0,
    currentCardName: def?.levels?.[0]?.name || getHeroLevelCardName(card.name, 1)
  };
  game.player.heroLevel = 1;
  battleLog(`${card.name}のヒーロースキルが使えるようになりました。`);
}
function getHeroLevelCardName(heroName, level){
  const def = HERO_SKILL_DEFS[heroName];
  return def?.levels?.find(l => l.level === level)?.name || `レベル${level}ヒーロースキル`;
}
function getHeroSkillCost(skill){
  const game = state.battle.game;
  let cost = Number(skill?.cost || 0);
  if(skill?.dynamicCost === 'noSpellsInDeckMinus1' && !game.player.deck.some(id => isSpell(byId(id)))) cost -= 1;
  if(skill?.dynamicCost === 'spellCostThisTurnDiscount') cost -= Number(game.player.usedSpellCostThisTurn || 0);
  if(skill?.dynamic?.costPlusPerUse) cost += Number(game.player.heroSkill?.lv2UseCount || 0);
  return Math.max(0, cost);
}
function canUseHeroSkill(skill){
  const game = state.battle.game;
  if(!game?.isMyTurn) return {ok:false, reason:'相手のターンです'};
  if(game.player.heroSkillUsedThisTurn && skill.type !== 'auto') return {ok:false, reason:'ヒーロースキルは1ターンに1回までです'};
  const cost = getHeroSkillCost(skill);
  if(cost > game.player.mp) return {ok:false, reason:'MPが足りません'};
  if(skill.requiredTension && game.player.tension < 3) return {ok:false, reason:'必殺技にはテンション3が必要です'};
  if(skill.condition === 'handDemon' && !game.player.hand.some(id => isDemon(byId(id)))) return {ok:false, reason:'手札に魔王系カードが必要です'};
  if(skill.condition === 'noAnnihilatorZoma'){
    const exists = game.player.hand.some(id => byId(id)?.name === '全てを滅ぼす者ゾーマ') || game.player.board.some(u => u?.name === '全てを滅ぼす者ゾーマ');
    if(exists) return {ok:false, reason:'既に全てを滅ぼす者ゾーマが存在します'};
  }
  return {ok:true, cost};
}
function openHeroSkillModal(){
  const game = state.battle.game;
  const hs = game?.player?.heroSkill;
  if(!hs) return toast('ヒーローカードを使用すると使えるようになります。', false);
  const skill = getHeroLevelDef(hs);
  if(!skill) return toast('このヒーロースキルは未登録です。', false);
  $('hero-skill-title').textContent = `${hs.heroCardName} Lv.${hs.level}`;
  const card = state.allCards.find(c => c.name === skill.name) || ensureVirtualCard(skill.name);
  const img = card ? getOfficialImage(card) : '';
  const cost = getHeroSkillCost(skill);
  const progressText = skill.progress ? `進行: ${hs.progressCount || 0}/${skill.progress.uses || skill.progress.triggers}` : '最終レベル';
  const usable = canUseHeroSkill(skill);
  const isAuto = skill.type === 'auto';
  $('hero-skill-body').innerHTML = `
    <div class="hero-skill-confirm">
      ${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(skill.name)}" referrerpolicy="no-referrer">` : ''}
      <div>
        <h4>${escapeHtml(skill.name)} <small>コスト${cost}</small></h4>
        <p>${escapeHtml(card?.text || describeHeroSkill(skill))}</p>
        <p class="hint">${escapeHtml(isAuto ? '自動発動スキルです。条件を満たすと発動します。' : progressText)}</p>
        ${isAuto ? '' : `<button id="use-hero-skill-confirm" class="primary" ${usable.ok ? '' : 'disabled'}>${usable.ok ? '使用する' : escapeHtml(usable.reason)}</button>`}
      </div>
    </div>`;
  const btn = $('use-hero-skill-confirm');
  if(btn) btn.addEventListener('click', () => beginHeroSkillUse(skill));
  $('hero-skill-modal').showModal();
}
function describeHeroSkill(skill){
  if(skill.effect?.kind === 'damage') return `対象に${skill.effect.amount}ダメージを与える。`;
  if(skill.effect?.kind === 'drawFromDeck') return '条件に合うカードをデッキから手札に加える。';
  return 'ヒーロースキルを使用します。';
}
function beginHeroSkillUse(skill){
  const game = state.battle.game;
  const check = canUseHeroSkill(skill);
  if(!check.ok) return toast(check.reason, false);
  if(['enemyAny','enemyUnit','enemyAnyBlockedByUnits','unitAny','friendlyUnit','friendlyEmptySlot'].includes(skill.target)){
    game.pendingHeroSkill = skill;
    $('hero-skill-modal').close();
    battleLog(`${skill.name}：対象を選んでください。`);
    renderBattleArena();
    return;
  }
  useHeroSkillCard(skill, {});
}
function useHeroSkillCard(skillArg=null, target={}){
  const game = state.battle.game;
  const hs = game.player.heroSkill;
  const skill = skillArg || getHeroLevelDef(hs);
  if(!skill) return;
  const check = canUseHeroSkill(skill);
  if(!check.ok) return toast(check.reason, false);
  game.player.mp -= check.cost;
  if(skill.requiredTension) game.player.tension = 0;
  game.player.heroSkillUsedThisTurn = true;
  applyHeroSkillEffect(skill, target);
  battleLog(`${skill.name}を使用しました。`);
  progressHeroSkill(skill, 'uses');
  game.pendingHeroSkill = null;
  const modal = $('hero-skill-modal'); if(modal?.open) modal.close();
  renderBattleArena();
  syncMyBattleState();
}
function applyPendingHeroSkillToUnit(side, pos){
  const game = state.battle.game;
  const skill = game.pendingHeroSkill;
  const board = side === 'player' ? game.player.board : game.enemy.board;
  const unit = board[pos];
  if(!unit) return;
  if(skill.target === 'enemyUnit' && side !== 'enemy') return toast('敵ユニットを選んでください。', false);
  if(skill.target === 'enemyAny' && side !== 'enemy') return toast('敵を選んでください。', false);
  if(skill.target === 'enemyAnyBlockedByUnits' && side !== 'enemy') return toast('敵を選んでください。', false);
  if(skill.target === 'friendlyUnit' && side !== 'player') return toast('味方ユニットを選んでください。', false);
  useHeroSkillCard(skill, {side, pos, unit});
}
function applyPendingHeroSkillToLeader(){
  const game = state.battle.game;
  const skill = game.pendingHeroSkill;
  if(!skill) return;
  if(skill.target === 'enemyUnit' || skill.target === 'friendlyUnit' || skill.target === 'unitAny') return toast('ユニットを選んでください。', false);
  if(skill.target === 'enemyAnyBlockedByUnits' && hasEnemyTargetableUnit()) return toast('対象にできる敵ユニットがいる間、敵リーダーを対象にできません。', false);
  useHeroSkillCard(skill, {side:'enemyLeader'});
}

function applyPendingHeroSkillToEmptySlot(pos){
  const game = state.battle.game;
  const skill = game.pendingHeroSkill;
  if(!skill || skill.target !== 'friendlyEmptySlot') return;
  if(game.player.board[pos]) return toast('空きマスを選んでください。', false);
  useHeroSkillCard(skill, {side:'player', pos});
}

function applySimpleEffect(effect, target){
  const game = state.battle.game;
  if(!effect) return;
  if(effect.kind === 'healLeader') healLeader(effect.amount);
  if(effect.kind === 'restoreMp') game.player.mp = Math.min(game.player.maxMp, game.player.mp + Number(effect.amount || 0));
}

function getHeroSkillDamage(skill){
  const game = state.battle.game;
  let amount = Number(skill?.effect?.amount || 0);
  if(skill?.dynamic?.damagePlusPerUse) amount += Number(game.player.heroSkill?.lv2UseCount || 0);
  if(skill?.dynamic?.loreLv3Damage) amount = Number(game.player.heroSkill?.loreLv3Damage || 1);
  return amount;
}

function triggerCardPlayedForHero(card){
  const game = state.battle.game;
  for(const aura of game?.player?.permanentAuras || []){
    if(aura.kind === 'damageEnemyLeaderOnCardPlayed'){
      damageLeader('enemy', aura.amount);
      battleLog(`${aura.source}：敵リーダーに${aura.amount}ダメージ。`);
    }
  }
  const hs = game?.player?.heroSkill;
  if(!hs) return;
  if(hs.heroCardName === 'ローレシアの王子' && hs.level === 3 && !isSpell(card)){
    hs.loreLv3Damage = Number(hs.loreLv3Damage || 1) + 1;
    battleLog('ローレシアLv3：破壊神との決戦のダメージ+1。');
  }
}

function applyHeroSkillEffect(skill, target){
  const game = state.battle.game;
  const e = skill.effect || {};
  if(e.kind === 'damage'){
    const amount = getHeroSkillDamage(skill);
    if(target.side === 'enemyLeader') damageLeader('enemy', amount);
    else if(target.unit) damageUnit(target.unit, amount);
    if(e.resetAfterUse) game.player.heroSkill.loreLv3Damage = 1;
  }else if(e.kind === 'damageAndDraw'){
    if(target.unit) damageUnit(target.unit, e.amount);
    drawCard(e.draw || 1);
  }else if(e.kind === 'damageLeader'){
    game.enemy.hp = Math.max(0, game.enemy.hp - Number(e.amount || 0));
  }else if(e.kind === 'draw'){
    drawCard(e.count || 1);
  }else if(e.kind === 'gainTension'){
    game.player.tension = Math.min(3, game.player.tension + Number(e.amount || 0));
  }else if(e.kind === 'restoreMp'){
    game.player.mp = Math.min(game.player.maxMp, game.player.mp + Number(e.amount || 0));
  }else if(e.kind === 'drawFromDeck'){
    const ok = findAndDrawFromDeck(c => e.filter === 'adventurer' ? isAdventurer(c) : e.filter === 'bet' ? isBet(c) : (isSpell(c) || isWeapon(c)));
    if(!ok) battleLog('対象カードがデッキにありません。');
  }else if(e.kind === 'setHandAdventurerCostZero'){
    game.player.costOverrides ||= {};
    for(const id of game.player.hand){ if(isAdventurer(byId(id))) game.player.costOverrides[id] = 0; }
  }else if(e.kind === 'buffAdventurersHandDeck'){
    battleLog('手札とデッキの冒険者を+1/+1しました。');
  }else if(e.kind === 'healLeaderAndDraw'){
    healLeader(e.amount || 0); drawCard(e.draw || 1);
  }else if(e.kind === 'buffFriendlyUnitHp'){
    if(target.unit){ target.unit.hp += Number(e.hp || 0); target.unit.maxHp += Number(e.hp || 0); target.unit.statuses ||= []; target.unit.statuses.push(e.status); }
  }else if(e.kind === 'damageAllEnemies'){
    game.enemy.hp = Math.max(0, game.enemy.hp - Number(e.amount || 0));
    for(const u of game.enemy.board) if(u) damageUnit(u, e.amount);
    resolveDeaths();
  }else if(e.kind === 'silenceAndDamageEnemyUnits'){
    for(const u of game.enemy.board) if(u){ u.keywords = {}; u.statuses = []; damageUnit(u, e.amount); }
    resolveDeaths();
  }else if(e.kind === 'addToHand'){
    addCardToHandByName(e.name);
  }else if(e.kind === 'addUsedSpells2PlusDiscountUnique'){
    game.player.costOverrides ||= {};
    for(const id of game.player.usedSpells2Plus || []){ game.player.hand.push(id); const c=byId(id); game.player.costOverrides[id]=Math.max(0, Number(c?.cost || 0) - Number(e.discount || 0)); }
  }else if(e.kind === 'randomEnemyDamage'){
    const amount = game.player.leaderAttackedThisTurn ? e.ifLeaderAttackedAmount : e.amount;
    const targets = game.enemy.board.map((u,i)=>u?{unit:u,pos:i}:null).filter(Boolean);
    if(targets.length && Math.random() < 0.65) damageUnit(chooseRandom(targets).unit, amount);
    else game.enemy.hp = Math.max(0, game.enemy.hp - amount);
    resolveDeaths();
  }else if(e.kind === 'damageAllUnits'){
    for(const u of [...game.player.board, ...game.enemy.board]) if(u) damageUnit(u, e.amount);
    resolveDeaths();
  }else if(e.kind === 'rubissBlessing'){
    // handled in triggerHeroAuto with spell cost
  }else if(e.kind === 'randomCoins'){
    const r = Math.random();
    const count = r < 0.30 ? 1 : r < 0.70 ? 2 : r < 0.90 ? 3 : 4;
    for(let i=0;i<count;i++) addCardToHandByName('コイン');
    battleLog(`小魚への施し：コイン${count}枚を手札に加えました。`);
  }else if(e.kind === 'summonToken'){
    const pos = target.pos;
    if(pos == null || game.player.board[pos]) return toast('空きマスを選んでください。', false);
    const card = findCardByName(e.name);
    const unit = makeUnitFromCard(card);
    unit.attack = Number(e.attack ?? unit.attack);
    unit.hp = Number(e.hp ?? unit.hp);
    unit.maxHp = Number(e.hp ?? unit.maxHp);
    if(e.haste){ unit.keywords.haste = true; unit.canAttack = true; unit.summoningSickness = false; }
    game.player.board[pos] = unit;
    battleLog(`${e.name}を指定マスに出しました。`);
  }else if(e.kind === 'biancaFamilyBond'){
    game.player.permanentAuras ||= [];
    game.player.permanentAuras.push({kind:'damageEnemyLeaderOnCardPlayed', amount:2, source:'家族との絆'});
    battleLog('家族との絆：以後、自分が手札を使う度敵リーダーに2ダメージ。');
  }else if(e.kind === 'samaltoriaRandomLv3'){
    if(e.variant === 'begirama'){
      damageLeader('enemy', 2);
      for(const u of game.enemy.board) if(u) damageUnit(u, 2);
      resolveDeaths();
    }else if(e.variant === 'life'){
      damageLeader('enemy', 3);
      for(const u of game.enemy.board) if(u) damageUnit(u, 3);
      const idx = game.player.board.findIndex(x => !x);
      if(idx >= 0){
        const coffin = findCardByName('棺桶');
        game.player.board[idx] = makeUnitFromCard(coffin);
        battleLog('棺桶を1つ出しました。');
      }
      resolveDeaths();
    }else if(e.variant === 'revive'){
      const dead = [...(game.player.deaths || [])].reverse().find(d => Number(byId(d.cardId)?.cost || 0) <= 3);
      const idx = game.player.board.findIndex(x => !x);
      if(dead && idx >= 0){
        const card = byId(dead.cardId);
        game.player.board[idx] = makeUnitFromCard(card);
        battleLog(`${card.name}を復活させました。`);
      }else battleLog('復活できるユニットまたは空きマスがありません。');
    }
    const def = getHeroDef('サマルトリアの王子');
    const pool = def.lv3Pool.filter(n=>n!==skill.name);
    game.player.heroSkill.currentCardName = chooseRandom(pool);
  }
  if(game.enemy.hp <= 0) showBattleResult('win');
  if(game.player.hp <= 0) showBattleResult('lose');
}
function progressHeroSkill(skill, mode){
  const game = state.battle.game;
  const hs = game.player.heroSkill;
  if(!hs || !skill.progress) return;
  const key = skill.progress.uses ? 'uses' : 'triggers';
  if(key !== mode) return;
  hs.progressCount = (hs.progressCount || 0) + 1;
  if(skill.dynamic?.costPlusPerUse || skill.dynamic?.damagePlusPerUse) hs.lv2UseCount = (hs.lv2UseCount || 0) + 1;
  const need = skill.progress[key];
  if(need && hs.progressCount >= need && hs.level < 3){
    if(skill.onLevelUp?.addToHand) addCardToHandByName(skill.onLevelUp.addToHand);
    hs.level += 1;
    hs.progressCount = 0;
    hs.lv2UseCount = 0;
    hs.loreLv3Damage = 1;
    hs.currentCardName = getHeroLevelCardName(hs.heroCardName, hs.level);
    if((hs.heroCardName === 'サマルトリアの王子' || hs.heroCardName === 'サルマトリアの王子') && hs.level === 3) hs.currentCardName = 'くらえベギラマ！';
    battleLog(`ヒーロースキルがLv.${hs.level}に進化しました。`);
  }
}
function triggerHeroAuto(trigger, ctx){
  const game = state.battle.game;
  const hs = game?.player?.heroSkill;
  if(!hs) return;
  const skill = getHeroLevelDef(hs);
  if(!skill || skill.type !== 'auto' || skill.trigger !== trigger) return;
  if(trigger === 'spellCost3Plus' && skill.effect?.kind === 'rubissBlessing'){
    const cost = ctx.cost || 0;
    if(cost >= 3) game.player.mp = Math.min(game.player.maxMp, game.player.mp + 1);
    if(cost >= 5) game.player.tension = Math.min(3, game.player.tension + 1);
    if(cost >= 7) drawCard(1);
  }else{
    applyHeroSkillEffect(skill, ctx || {});
  }
  battleLog(`${skill.name}が自動発動しました。`);
  progressHeroSkill(skill, 'triggers');
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
