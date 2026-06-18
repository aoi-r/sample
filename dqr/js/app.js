import { firebaseConfig } from './firebase-config.js';

// v88: Firebase SDK is loaded dynamically after the app boots.
// Static remote imports can block the whole app before tap-start is bound on iOS/PWA.
let initializeApp, getAuth, signInAnonymously, onAuthStateChanged;
let getDatabase, ref, set, push, remove, onValue, serverTimestamp, get, update, onDisconnect;
let firebaseSdkReadyPromise = null;


function safeGetLocalStorage(key, fallback=''){
  try{ return localStorage.getItem(key) || fallback; }catch(e){ return fallback; }
}
function safeSetLocalStorage(key, value){
  try{ localStorage.setItem(key, value); }catch(e){}
}
function safeRandomId(prefix='id'){
  try{
    if(globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    if(globalThis.crypto && crypto.getRandomValues){
      const arr = new Uint32Array(4);
      crypto.getRandomValues(arr);
      return Array.from(arr).map(x => x.toString(16)).join('');
    }
  }catch(e){}
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const state = {
  cards: [], allCards: [], systems: {}, strategies: {}, choices: {}, coin: {}, dungeons: {}, fortune: {}, heroes: {}, exchanges: {}, generatedCards: {}, tensionSystem: {},
  classes: [], cardTypes: [], rarities: [], userDecks: {},
  username: safeGetLocalStorage('dqr_username', ''),
  playerId: safeGetLocalStorage('dqr_player_id', ''),
  deviceId: safeGetLocalStorage('dqr_device_id', '') || safeRandomId('device'),
  selectedClass: '', selectedHeroId: '', deck: new Map(), editingDeckId: '',
  battle: { selectedDeckId: '', selectedDeck: null, matchId: '', roomId: '', game: null, unsubs: [], resultTimer: null, resultShown: false, hasMatched: false, matchLocked: false, bannerTimer: null, presenceTimer: null, lastTurnPlayerId: '', startBannerShown: false, lastActionSeq: 0, processingRemoteAction: false },
  firebase: { enabled: false, app: null, auth: null, db: null, uid: null },
  appReady: false,
  pendingEntry: false,
  eventsBound: false
};
safeSetLocalStorage('dqr_device_id', state.deviceId);

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
  safeSetLocalStorage('dqr_player_id', state.playerId);
  safeSetLocalStorage('dqr_username', state.username);
  return true;
}


const $ = id => document.getElementById(id);
const screens = ['start','user','menu','deckbuilder','battle'];
const fallbackClasses = ['共通','戦士','魔法使い','武闘家','僧侶','商人','占い師','魔剣士','盗賊'];
const DATA_VERSION = 'v158_visible_stat_cost_modifiers';

// v107 compatibility shims for rolled-back bases
function getCardText(card){
  if(!card) return '';
  return String(card.text ?? card.effect ?? card.description ?? card.desc ?? '');
}
function ensureSoloGame(){
  if(!state.battle.game){
    try{ initLocalBattleGame(); }catch(e){ console.error('ensureSoloGame init failed', e); }
  }
  if(state.battle.game){
    state.battle.game.soloTestMode = true;
    state.battle.soloTestMode = true;
  }
  return state.battle.game;
}
function makeSoloUnitFromCardSafeV107(card){
  if(typeof makeSoloUnitFromCard === 'function') return makeSoloUnitFromCard(card);
  if(typeof makeUnitFromCard === 'function') return makeUnitFromCard(card);
  return {
    id:`solo_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    cardId:card?.id || '',
    name:card?.name || 'ユニット',
    attack:Number(card?.attack ?? 0),
    hp:Number(card?.hp ?? card?.health ?? 1),
    maxHp:Number(card?.hp ?? card?.health ?? 1),
    canAttack:false,
    summoningSickness:true,
    keywords:{}
  };
}



const HERO_SKILL_DEFS = {
  '伝説の勇者': {
    levels: [
      { level:1, name:'出会いと別れの酒場', cost:0, type:'manual', target:'none', effect:{kind:'legendTavern'}, progress:{uses:2} },
      { level:2, name:'ダーマの神殿へ', cost:1, type:'manual', target:'friendlyEmptySlot', effect:{kind:'summonDharmaTemple'}, progress:{uses:1} },
      { level:3, name:'魔王討伐', cost:2, type:'manual', target:'unitAny', effect:{kind:'legendDemonKingSubjugation'}, progress:{uses:1} },
      { level:4, name:'そして伝説へ', cost:25, dynamic:{legendFinalCost:true}, type:'manual', target:'enemyLeader', effect:{kind:'legendFinal'}, progress:null }
    ]
  },
  '勇者レック': {
    levels: [
      { level:1, name:'いつか見た光景', cost:0, type:'manual', target:'none', effect:{kind:'reckMemory'}, progress:{uses:2}, onLevelUp:{draw:1} },
      { level:2, name:'呼び覚まされし記憶', cost:0, type:'auto', trigger:'proficiencyCardPlayed', effect:{kind:'gainTension', amount:1}, progress:{triggers:2} },
      { level:3, name:'未来を信じて', cost:2, type:'manual', target:'none', effect:{kind:'reckFuture'}, progress:null }
    ]
  },
  '守り人ナイン': {
    levels: [
      { level:1, name:'宝の地図', cost:0, type:'manual', target:'none', effect:{kind:'addToHand', name:'宝の地図'}, progress:{uses:1} },
      { level:2, name:'ダンジョンアタック', cost:0, type:'manual', target:'enemyAny', effect:{kind:'damage', amount:2}, progress:{uses:1}, dynamic:{usesEqualDungeonClears:true} },
      { level:3, name:'ダンジョンメンテナンス', cost:0, type:'manual', target:'friendlyDungeon', effect:{kind:'boostDungeonDurability', amount:2}, progress:null }
    ]
  },
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
      { level:3, name:'精霊王ルビスの加護', cost:0, type:'auto', trigger:'spellCost3Plus', effect:{kind:'rubissBlessing'}, progress:null }
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
  'メラリザード': { name:'メラリザード', cost:1, attack:1, hp:2, cardType:'ユニット', text:'1/2のメラリザード。', effect:null },
  'ピサロナイト': { name:'ピサロナイト', cost:2, attack:1, hp:1, cardType:'ユニット', text:'1/1のピサロナイト。', effect:null },
  'サラマンダー': { name:'サラマンダー', cost:0, attack:8, hp:8, cardType:'ユニット', text:'超貫通。ベビーサラマンダーがBET4回で変身する。', effect:null },

  '伝説の勇者': { name:'伝説の勇者', cost:2, cardType:'ヒーロー', rarity:'レジェンドレア', text:'伝説の勇者のヒーロースキルが使えるようになる。このカードは最初の手札に必ず来る。', classes:['共通'], tribes:['英雄'], tags:['ヒーロー'], deckBuildable:true, localImage:'./assets/custom_cards/伝説の勇者_デッキ編成カード.png' },
  '出会いと別れの酒場': { name:'出会いと別れの酒場', cost:0, cardType:'ヒーロースキル', rarity:'トークン', text:'自分のデッキの上7枚から冒険者カードを1枚引き、残りをデッキの下に戻す。', localImage:'./assets/custom_cards/伝説の勇者_lv1.png' },
  'ダーマの神殿へ': { name:'ダーマの神殿へ', cost:1, cardType:'ヒーロースキル', rarity:'トークン', text:'味方空きマスにダーマの神殿を出した後、自分が各職業の初期テンションスキルなら自分の職業を含む初期テンションスキル3種類から1つ選び変更する。', localImage:'./assets/custom_cards/伝説の勇者_lv2.png' },
  '魔王討伐': { name:'魔王討伐', cost:2, cardType:'ヒーロースキル', rarity:'トークン', text:'ユニット1体に1ダメージ。味方冒険者が出る度+1ダメージ。上限は+3ダメージ。', localImage:'./assets/custom_cards/伝説の勇者_lv3.png' },
  'そして伝説へ': { name:'そして伝説へ', cost:25, cardType:'ヒーロースキル', rarity:'トークン', text:'敵リーダーに25ダメージ。自分が冒険者カードを3回使う度、このカードのレベル+1、カードを1枚引き、このヒーロースキルのコスト-5。', localImage:'./assets/custom_cards/伝説の勇者_lv4.png' },
  'ダーマの神殿': { name:'ダーマの神殿', cost:1, attack:0, hp:5, cardType:'建物', rarity:'トークン', text:'味方冒険者が場に出た後それを+1/+1し耐久値-1。スキルリンク：自分が各職業の初期テンションスキルなら自分の職業を含む初期テンションスキル3種類から1つ選び変更する。', localImage:'./assets/custom_cards/伝説の勇者_ダーマ神殿.png' },

  '勇者レック': { name:'勇者レック', cost:1, cardType:'ヒーロー', rarity:'レジェンドレア', text:'勇者レックのヒーロースキルが使えるようになる。このカードは最初の手札に必ず来る。', classes:['共通'], tribes:['英雄'], tags:['ヒーロー'], deckBuildable:true, localImage:'./assets/custom_cards/レック_デッキ編成カード.png' },
  'いつか見た光景': { name:'いつか見た光景', cost:0, cardType:'ヒーロースキル', rarity:'トークン', text:'自分の手札から熟練度を持つカード1枚を選ぶ。そのカードの熟練度+1。選んだカードの熟練度が1以下の場合代わりに熟練度+2。レベル2になる時カードを1枚引く。', localImage:'./assets/custom_cards/レック_lv1.png' },
  '呼び覚まされし記憶': { name:'呼び覚まされし記憶', cost:0, cardType:'ヒーロースキル', rarity:'トークン', text:'熟練度を持つカードを自分が使用した後、味方リーダーのテンション+1。この効果は条件を満たすと自動的に発動する。', localImage:'./assets/custom_cards/レック_lv2.png' },
  '未来を信じて': { name:'未来を信じて', cost:2, cardType:'ヒーロースキル', rarity:'トークン', text:'カードを1枚引く。その後手札から熟練度を持つカードを1枚選び、そのカードの熟練度+2。', localImage:'./assets/custom_cards/レック_lv3.png' },
  '精霊王ルビスの加護': { name:'精霊王ルビスの加護', cost:0, cardType:'ヒーロースキル', rarity:'トークン', text:'自分がコスト3以上の特技を使った後、そのコストにより追加効果が発動する。コスト3以上:MP1回復。コスト5以上:テンション+1。コスト7以上:カードを1枚引く。' },
  '宝の地図': { name:'宝の地図', cost:0, cardType:'特技', rarity:'トークン', text:'味方空きマスに、対戦中踏破した回数に応じた地図ダンジョンを出す。0回:うす暗き獣の洞くつ。1回:ざわめく風の坑道。2回以上:ランダムな6種類の地図ダンジョンから1つを出す。', localImage:'./assets/custom_cards/宝の地図.png' },
  'うす暗き獣の洞くつ': { name:'うす暗き獣の洞くつ', cost:1, attack:0, hp:3, cardType:'建物', rarity:'トークン', tags:['建物','ダンジョン'], text:'ダンジョン(耐久値3で踏破) 自分のターン開始時 耐久値+1 踏破時:カードを1枚引く', localImage:'./assets/custom_cards/うす暗き獣の洞くつ.png' },
  'ざわめく風の坑道': { name:'ざわめく風の坑道', cost:2, attack:0, hp:3, cardType:'建物', rarity:'トークン', tags:['建物','ダンジョン'], text:'ダンジョン(耐久値3で踏破) 自分のターン開始時 耐久値+1 踏破時:ランダムなコスト2のユニットをこの場所に出す カードを1枚引く', localImage:'./assets/custom_cards/ざわめく風の坑道.png' },
  '見えざる魔神の道': { name:'見えざる魔神の道', cost:3, attack:0, hp:5, cardType:'建物', rarity:'トークン', tags:['建物','ダンジョン'], text:'ダンジョン(耐久値5で踏破) 自分のターン開始時 耐久値+1 踏破時:先制 メタルボディ 3/3の強敵メタルキングを2体出す', localImage:'./assets/custom_cards/見えざる魔神の道.png' },
  '放たれし大地のじごく': { name:'放たれし大地のじごく', cost:3, attack:0, hp:2, cardType:'建物', rarity:'トークン', tags:['建物','ダンジョン'], text:'ダンジョン(耐久値2で踏破) 自分のターン開始時 耐久値+1 踏破時:敵味方全体に2ダメージ', localImage:'./assets/custom_cards/放たれし大地のじごく.png' },
  '残された神々の水脈': { name:'残された神々の水脈', cost:3, attack:0, hp:3, cardType:'建物', rarity:'トークン', tags:['建物','ダンジョン'], text:'ダンジョン(耐久値3で踏破) 自分のターン開始時 耐久値+1 踏破時:味方リーダーのHPを3回復し テンション+3 カードを1枚引く', localImage:'./assets/custom_cards/残された神々の水脈.png' },
  '呪われし魂の氷河': { name:'呪われし魂の氷河', cost:3, attack:0, hp:2, cardType:'建物', rarity:'トークン', tags:['建物','ダンジョン'], text:'ダンジョン(耐久値2で踏破) 自分のターン開始時 耐久値+1 踏破時:ランダムな敵ユニット1体に5ダメージ', localImage:'./assets/custom_cards/呪われし魂の氷河.png' },
  '大魔王の間': { name:'大魔王の間', cost:3, attack:0, hp:5, cardType:'建物', rarity:'トークン', tags:['建物','ダンジョン'], text:'ダンジョン(耐久値5で踏破) 自分のターン開始時 耐久値+1 踏破時:ランダムなコスト6以上の魔王系ユニット1体を出す', localImage:'./assets/custom_cards/大魔王の間.png' },
  'あらぶる光の世界': { name:'あらぶる光の世界', cost:3, attack:0, hp:4, cardType:'建物', rarity:'トークン', tags:['建物','ダンジョン'], text:'ダンジョン(耐久値4で踏破) 自分のターン開始時 耐久値+1 踏破時:味方のユニット以外のカードをランダムに3枚手札に加え それらのコスト-1', localImage:'./assets/custom_cards/あらぶる光の世界.png' },
  '強敵メタルキング': { name:'強敵メタルキング', cost:0, attack:3, hp:3, cardType:'ユニット', rarity:'トークン', text:'先制 メタルボディ', tags:['強敵'], localImage:'./assets/custom_cards/見えざる魔神の道.png' },

  'イブールの本': { name:'イブールの本', cost:0, cardType:'特技', text:'味方リーダーに2ダメージ。敵リーダーのHPを2回復。カードを1枚引く。', effect:null, localImage:'./assets/custom_cards/イブールの本.png' },
  'イチゴ爆弾': { name:'イチゴ爆弾', cost:1, attack:0, hp:3, cardType:'ユニット', text:'攻撃できない。\n死亡時：隣接するユニットに2ダメージを与える。', effect:null, localImage:'./assets/custom_cards/strawberry_bomb.png' },
  'ホットストーン': { name:'ホットストーン', cost:0, cardType:'特技', text:'メルビンが封じられた石。後で画像差し替え予定。', effect:null },
  'うまのふん': { name:'うまのふん', cost:0, cardType:'特技', text:'特別な効果はない。', effect:null },
  'ミイラおとこ': { name:'ミイラおとこ', cost:3, attack:3, hp:3, cardType:'ユニット', text:'3/3のミイラおとこ。', effect:null },
  '道具カード': { name:'道具カード', cost:0, cardType:'特技', text:'道具カード。', effect:null },
  '武術カード': { name:'武術カード', cost:0, cardType:'特技', text:'武術カード。', effect:null }
};

// v87_boot_guard
window.__dqrAppEnter = enterFromTitle;
window.__dqrAppReady = false;
bindBootTap();
init().catch(err => {
  console.error(err);
  const msg = err?.message || String(err || 'unknown error');
  document.body.insertAdjacentHTML('afterbegin', `<div class="toast bad">初期化エラー: ${escapeHtml(msg)}</div>`);
  const tap = document.querySelector('.tap-start');
  if(tap && !tap.dataset.fallbackBound){
    tap.dataset.fallbackBound = '1';
    tap.addEventListener('click', () => {
      try{ show(hasPlayerId() ? 'menu' : 'user'); }
      catch(e){ alert('初期化エラー: ' + msg); }
    });
  }
});

async function init(){
  await loadData();
  setupFirebase(); // non-blocking dynamic Firebase load
  bindEvents();
  fillControls();
  loadLocalDecks();
  if(state.username) $('username-input').value = state.username;
  updateLoginStatus();
  state.appReady = true;
  window.__dqrAppReady = true;
  const label = $('boot-version-label');
  if(label) label.textContent = `v158 / buildable 1460 / total 1583`;
  const badge = $('html-boot-status');
  if(badge) badge.textContent = `v158 / buildable 1460 / total 1583`;
  if(state.pendingEntry){
    state.pendingEntry = false;
    show(hasPlayerId() ? 'menu' : 'user');
  }
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
  if(!state.cards.length){
    const msg = 'カードDBを読み込めませんでした。data/cards.json の配置やキャッシュを確認してください。';
    console.error(msg, cards);
    const label = $('boot-version-label');
    if(label) label.textContent = 'v91 card load failed';
    throw new Error(msg);
  }
  state.classes = (cards.classes || fallbackClasses).filter(c => c !== '共通');
  state.cardTypes = cards.cardTypes || [...new Set(state.cards.map(c => c.cardType).filter(Boolean))];
  state.rarities = [...new Set(state.cards.map(c => c.rarity).filter(Boolean))];
}

function loadFirebaseSdk(){
  if(firebaseSdkReadyPromise) return firebaseSdkReadyPromise;
  firebaseSdkReadyPromise = Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js')
  ]).then(([appMod, authMod, dbMod]) => {
    initializeApp = appMod.initializeApp;
    getAuth = authMod.getAuth;
    signInAnonymously = authMod.signInAnonymously;
    onAuthStateChanged = authMod.onAuthStateChanged;
    getDatabase = dbMod.getDatabase;
    ref = dbMod.ref;
    set = dbMod.set;
    push = dbMod.push;
    remove = dbMod.remove;
    onValue = dbMod.onValue;
    serverTimestamp = dbMod.serverTimestamp;
    get = dbMod.get;
    update = dbMod.update;
    onDisconnect = dbMod.onDisconnect;
    return true;
  });
  return firebaseSdkReadyPromise;
}

async function setupFirebase(){
  const invalid = !firebaseConfig.apiKey || firebaseConfig.apiKey.includes('PASTE_');
  if(invalid){ $('login-status').textContent = 'Firebase未設定：保存はブラウザ内バックアップになります。'; return; }
  try{
    await loadFirebaseSdk();
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
  }catch(e){
    state.firebase.enabled = false;
    console.warn('Firebase SDK load/init failed; offline/local mode continues.', e);
    const status = $('login-status');
    if(status) status.textContent = 'Firebase未接続：ローカル/ソロは利用できます。';
    toast('Firebase読込失敗：ローカル/ソロで起動します', false);
  }
}



function enterFromTitle(){
  tryLandscapeMode();
  if(!state.appReady){
    state.pendingEntry = true;
    const badge = $('html-boot-status');
    if(badge) badge.textContent = 'v92 loading cards...';
    const label = $('boot-version-label');
    if(label) label.textContent = 'v92 loading cards...';
    return;
  }
  show(hasPlayerId() ? 'menu' : 'user');
}
function bindBootTap(){
  const tap = document.querySelector('.tap-start');
  if(!tap || tap.dataset.bootBound) return;
  tap.dataset.bootBound = '1';
  const handler = (e) => { try{ enterFromTitle(); }catch(err){ console.error(err); } };
  tap.addEventListener('click', handler, true);
  tap.addEventListener('touchend', handler, true);
  tap.addEventListener('pointerup', handler, true);
  tap.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' ') handler(e); }, true);
  document.addEventListener('click', e => { if(e.target?.closest?.('.tap-start')) handler(e); }, true);
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
  if(state.eventsBound) return;
  state.eventsBound = true;
  bindBootTap();
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
    const savedSize = safeGetLocalStorage('dqr_mobile_card_size', sizeSlider.value);
    sizeSlider.value = savedSize;
    document.documentElement.style.setProperty('--mobile-card-w', `${savedSize}px`);
    sizeSlider.addEventListener('input', e => {
      const v = e.target.value;
      document.documentElement.style.setProperty('--mobile-card-w', `${v}px`);
      safeSetLocalStorage('dqr_mobile_card_size', v);
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

  const soloStartBtn = $('solo-test-start');
  if(soloStartBtn) soloStartBtn.addEventListener('click', startSoloTestMode);
  const soloToggle = $('solo-test-toggle');
  if(soloToggle) soloToggle.addEventListener('click', () => $('solo-test-panel')?.classList.toggle('hidden'));
  const soloClose = $('solo-test-close');
  if(soloClose) soloClose.addEventListener('click', () => $('solo-test-panel')?.classList.add('hidden'));
  const soloSearch = $('solo-card-search');
  if(soloSearch) soloSearch.addEventListener('input', renderSoloCardResults);
  const soloHpInf = $('solo-hp-infinite');
  if(soloHpInf) soloHpInf.addEventListener('click', soloSetEnemyHpInfinite);
  const soloHpReset = $('solo-hp-reset');
  if(soloHpReset) soloHpReset.addEventListener('click', soloSetEnemyHpNormal);
  const soloMp = $('solo-mp-max');
  if(soloMp) soloMp.addEventListener('click', soloSetMpMax);
  const soloTen = $('solo-tension-max');
  if(soloTen) soloTen.addEventListener('click', soloSetTensionMax);
  const soloDraw = $('solo-draw-card');
  if(soloDraw) soloDraw.addEventListener('click', soloDrawCard);
  const soloLog = $('solo-clear-log');
  if(soloLog) soloLog.addEventListener('click', soloClearLog);
  const soloHand = $('solo-add-hand');
  if(soloHand) soloHand.addEventListener('click', soloAddSelectedToHand);
  const soloDeck = $('solo-add-decktop');
  if(soloDeck) soloDeck.addEventListener('click', soloAddSelectedToDeckTop);
  const soloEnemy = $('solo-summon-enemy');
  if(soloEnemy) soloEnemy.addEventListener('click', () => soloSummonSelected('enemy'));
  const soloPlayer = $('solo-summon-player');
  if(soloPlayer) soloPlayer.addEventListener('click', () => soloSummonSelected('player'));
  const soloEnemyHand = $('solo-add-enemy-hand');
  if(soloEnemyHand) soloEnemyHand.addEventListener('click', soloAddSelectedToEnemyHand);
  const soloResetEnemyHandBtn = $('solo-reset-enemy-hand');
  if(soloResetEnemyHandBtn) soloResetEnemyHandBtn.addEventListener('click', soloResetEnemyHand);
  const soloShowEnemyHandBtn = $('solo-show-enemy-hand');
  if(soloShowEnemyHandBtn) soloShowEnemyHandBtn.addEventListener('click', soloShowEnemyHand);
  const soloDmg = $('solo-damage-enemy');
  if(soloDmg) soloDmg.addEventListener('click', soloDamageEnemyAll);

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
  // battle-top-exit-interceptor-v49
  const battleBackBtn = document.querySelector('#screen-battle .topbar .ghost');
  if(battleBackBtn){
    battleBackBtn.addEventListener('click', (e) => {
      const battleActive = !$('battle-arena')?.classList.contains('hidden') && $('screen-battle')?.classList.contains('active');
      if(battleActive){
        e.preventDefault();
        e.stopImmediatePropagation();
        $('battle-exit-modal').showModal();
      }
    }, true);
    battleBackBtn.textContent = '退出';
  }
  const choiceClose = $('choice-modal-close');
  if(choiceClose) choiceClose.addEventListener('click', () => $('choice-modal').close());
  const deckConfirmClose = $('deck-confirm-close');
  if(deckConfirmClose) deckConfirmClose.addEventListener('click', () => $('deck-confirm-modal').close());
  $('modal-close').addEventListener('click', () => $('card-modal').close());
}

function fillControls(){
  const classSel = $('class-select'), typeSel = $('type-filter'), costSel = $('cost-filter'), raritySel = $('rarity-filter');
  if(classSel) classSel.innerHTML = '<option value="">職業を選択</option>';
  if(typeSel) typeSel.innerHTML = '<option value="">種類すべて</option>';
  if(costSel) costSel.innerHTML = '<option value="">コストすべて</option>';
  if(raritySel) raritySel.innerHTML = '<option value="">レアリティすべて</option>';
  for(const c of state.classes) classSel?.add(new Option(c, c));
  for(const t of state.cardTypes) typeSel?.add(new Option(t, t));
  for(let i=0;i<=12;i++) costSel?.add(new Option(String(i), String(i)));
  costSel?.add(new Option('13以上', '13+'));
  for(const r of state.rarities) raritySel?.add(new Option(r, r));
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
  if(!state.appReady && name !== 'start'){
    state.pendingEntry = true;
    const badge = $('html-boot-status');
    if(badge) badge.textContent = 'v92 loading cards...';
    return;
  }
  if(['menu','deckbuilder','battle'].includes(name) && !hasPlayerId()) name = 'user';
  screens.forEach(s => $(`screen-${s}`).classList.toggle('active', s === name));
  updateLoginStatus();
  if(name === 'deckbuilder'){ renderAll(); renderDeckEditorList(); }
  if(name === 'battle'){ renderBattleDeckList(); }
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


const CUSTOM_CARD_IMAGES = {
  'イチゴ爆弾': './assets/custom_cards/strawberry_bomb.png',
  '伝説の勇者': './assets/custom_cards/伝説の勇者_デッキ編成カード.png',
  '出会いと別れの酒場': './assets/custom_cards/伝説の勇者_lv1.png',
  'ダーマの神殿へ': './assets/custom_cards/伝説の勇者_lv2.png',
  '魔王討伐': './assets/custom_cards/伝説の勇者_lv3.png',
  'そして伝説へ': './assets/custom_cards/伝説の勇者_lv4.png',
  'ダーマの神殿': './assets/custom_cards/伝説の勇者_ダーマ神殿.png',
  '勇者レック': './assets/custom_cards/レック_デッキ編成カード.png',
  'いつか見た光景': './assets/custom_cards/レック_lv1.png',
  '呼び覚まされし記憶': './assets/custom_cards/レック_lv2.png',
  '未来を信じて': './assets/custom_cards/レック_lv3.png',
  '宝の地図': './assets/custom_cards/宝の地図.png',
  'うす暗き獣の洞くつ': './assets/custom_cards/うす暗き獣の洞くつ.png',
  'ざわめく風の坑道': './assets/custom_cards/ざわめく風の坑道.png',
  '見えざる魔神の道': './assets/custom_cards/見えざる魔神の道.png',
  '放たれし大地のじごく': './assets/custom_cards/放たれし大地のじごく.png',
  '残された神々の水脈': './assets/custom_cards/残された神々の水脈.png',
  '呪われし魂の氷河': './assets/custom_cards/呪われし魂の氷河.png',
  '大魔王の間': './assets/custom_cards/大魔王の間.png',
  'あらぶる光の世界': './assets/custom_cards/あらぶる光の世界.png'
};

function getOfficialImage(card){
  if(!card) return '';
  if(CUSTOM_CARD_IMAGES[card.name]) return CUSTOM_CARD_IMAGES[card.name];
  if(card.localImage) return card.localImage;
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
      await set(ref(state.firebase.db, `players/${state.playerId}/decks/${state.editingDeckId}`), { ...payload, updatedAt: serverTimestamp(),
    lastSeenMs: Date.now() });
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

function saveLocalDeck(id, payload){ const all = JSON.parse(safeGetLocalStorage('dqr_decks', '{}')); all[id] = payload; safeSetLocalStorage('dqr_decks', JSON.stringify(all)); state.userDecks = all; }
function loadLocalDecks(){ state.userDecks = JSON.parse(safeGetLocalStorage('dqr_decks', '{}')); renderSavedDecks(); }
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
  const all = JSON.parse(safeGetLocalStorage('dqr_decks', '{}')); delete all[id]; safeSetLocalStorage('dqr_decks', JSON.stringify(all)); state.userDecks = all;
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


const SOLO_PRESET_DECK_DEFS = [
  {
    id:'solo_complex',
    deckName:'【テスト】複雑効果まとめ',
    className:'占い師',
    names:['あくまのカガミ','フォステイル','スラリンガル','タロットフォーチュン','テンプテーション','セクシービーム','デスマエストロ','グランマーズ','ロミア','分裂のツボ','家族の絆','怪獣プスゴン','フライングデス','覇海軍王ジャコラ','魔王の書']
  },
  {
    id:'solo_building',
    deckName:'【テスト】建物・ダンジョン',
    className:'僧侶',
    names:['デルカダール地下水路','墓所','占い小屋','武器屋','牢屋','修道院','塔','お告げのほこら','氷の館','ロンダルキアへの洞くつ','不思議のダンジョン','仙人のほら穴','守りのほこら','沼地の洞くつ','炎のほこら']
  },
  {
    id:'solo_hand_deck',
    deckName:'【テスト】手札・山札干渉',
    className:'盗賊',
    names:['ぬすむ','ぬすっと斬り','やみのとうぞく','怪盗ポイックリン','ラグアス王子','きめんどうし','ミレーユ','垣間見る未来','魂の写し身','やまびこの心得','残響のようじゅつし','メルビン','イブール','マヤ','グランマーズ']
  },
  {
    id:'solo_bet_coin',
    deckName:'【テスト】BET・コイン',
    className:'商人',
    names:['コイン','ぷちメタル','まかいファイター','ジラフマスター','ギガデーモン','ベホイミスライム','クラウンヘッド','クラーゴン','かっちゅうアリ','きりかぶおばけ','インプ','ミリオンゼニー','むげんの弓','福招きのそろばん','特訓の成果']
  },
  {
    id:'solo_tribe_timing',
    deckName:'【テスト】系統・期限効果',
    className:'戦士',
    names:['クイーンスライム','ワイトキング','グレイトドラゴン','キングリザード','ドラゴンソルジャー','ヒドラ','ライアン','バイキルトのツボ','バイキルトの巻物','剣豪の闘志','孤高の剣技','青い閃光','魔力かくせい','魔力解放','覇海軍王ジャコラ']
  }
];

function makeSoloPresetDeck(def){
  const ids = [];
  for(const name of def.names || []){
    const card = findCardByName(name);
    if(card) ids.push(card.id);
  }
  const fillerNames = ['スライム','メラリザード','ピサロナイト','コイン','ヒャド','こんぼう'];
  let f = 0;
  while(ids.length < 30){
    const card = findCardByName(fillerNames[f % fillerNames.length]) || state.allCards.find(c => c.cardType === 'ユニット');
    if(card) ids.push(card.id);
    f++;
    if(f > 80) break;
  }
  const grouped = [];
  for(const id of ids.slice(0,30)){
    const g = grouped.find(x => x.cardId === id);
    if(g) g.count += 1;
    else grouped.push({cardId:id, count:1});
  }
  return {
    id:def.id,
    deckName:def.deckName,
    className:def.className || '戦士',
    total:30,
    cards:grouped,
    isSoloPreset:true,
    updatedAtLocal:'solo_preset'
  };
}

function getSoloPresetDeckEntries(){
  return SOLO_PRESET_DECK_DEFS.map(def => [def.id, makeSoloPresetDeck(def)]);
}


function setupSoloEnemyHandMatchPlayerV116(){
  const game = state.battle.game;
  if(!game?.enemy || !game?.player) return;
  const targetCount = Math.max(0, (game.player.hand || []).length);
  const poolNames = ['コイン','スライム','ドラゴン','ピサロナイト','王女の愛','メラリザード','ホイミン','こんぼう','ヒャド','まほうの小ビン','バラモス','ハーゴン','りゅうおう','クイーンスライム'];
  const ids = [];
  for(const name of poolNames){
    const c = findCardByName(name);
    if(c) ids.push(c.id);
  }
  game.enemy.hand = ids.slice(0, targetCount);
  game.enemy.handCount = game.enemy.hand.length;
  game.enemy.deck = ids.slice(targetCount);
  // 足りない場合は既存デッキ候補で補う
  while(game.enemy.hand.length < targetCount && game.enemy.deck.length){
    game.enemy.hand.push(game.enemy.deck.shift());
  }
  game.enemy.handCount = game.enemy.hand.length;
  battleLog(`相手初期手札を自分と同じ${targetCount}枚に設定。`);
}

function setupSoloEnemyHand(){
  const game = state.battle.game;
  const names = ['コイン','スライム','ドラゴン','ピサロナイト','王女の愛','メラリザード','ホイミン','こんぼう','ヒャド','まほうの小ビン'];
  game.enemy.hand = [];
  for(const name of names){
    const c = findCardByName(name);
    if(c) game.enemy.hand.push(c.id);
  }
  game.enemy.handCount = game.enemy.hand.length;
  game.enemy.deck = [];
  for(const name of ['スライム','ドラゴン','グレイトドラゴン','キングリザード','コイン','王女の愛','メラリザード','ピサロナイト','ヒャド','こんぼう','まほうの小ビン','バラモス','ハーゴン','りゅうおう','クイーンスライム']){
    const c = findCardByName(name);
    if(c) game.enemy.deck.push(c.id);
  }
}

function getAllSavedDeckEntries(){
  const merged = {...(state.userDecks || {}), ...(state.firebaseDecks || {})};
  return Object.entries(merged).sort((a,b)=>String(b[1].updatedAtLocal||'').localeCompare(String(a[1].updatedAtLocal||'')));
}

function renderBattleDeckList(){
  const box = $('battle-deck-list');
  if(!box) return;
  const savedEntries = getAllSavedDeckEntries().filter(([id, deck]) => deck && Number(deck.total || 0) === 30);
  const presetEntries = getSoloPresetDeckEntries();
  const entries = [...presetEntries, ...savedEntries];
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
    row.innerHTML = `<strong>${escapeHtml(deck.deckName || '無名デッキ')}</strong><span>${escapeHtml(deck.className || '')} / ${deck.total || 0}枚${deck.isSoloPreset ? ' / プリセット' : ''}</span><small>${escapeHtml(hero)}</small>`;
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


function cleanupBattleSubscriptions(){
  for(const unsub of state.battle.unsubs || []){
    try{ if(typeof unsub === 'function') unsub(); }catch(e){}
  }
  state.battle.unsubs = [];
  clearPresenceTimer();
}

function getOpponentPlayerIdFromCache(){
  const states = state.battle.remoteStates || {};
  const st = Object.values(states).find(s => s && s.playerId && s.playerId !== state.playerId);
  if(st?.playerId) return st.playerId;
  const players = state.battle.roomPlayers || {};
  const p = Object.values(players).find(p => p && p.playerId && p.playerId !== state.playerId && p.status !== 'left' && p.status !== 'defeated');
  return p?.playerId || '';
}

function isFinalRoomStatus(status){
  return ['finished','closed','deleted','abandoned'].includes(String(status || ''));
}

function resetBattleLocalState(){
  cleanupBattleSubscriptions();
  if(state.battle.resultTimer){ clearTimeout(state.battle.resultTimer); state.battle.resultTimer = null; }
  state.battle.game = null;
  state.battle.matchId = '';
  state.battle.roomId = '';
  state.battle.selectedDeckId = '';
  state.battle.selectedDeck = null;
  state.battle.remoteStates = {};
  state.battle.roomPlayers = {};
  state.battle.resultShown = false;
  state.battle.soloTestMode = false;
  state.battle.soloSelectedCardId = '';
  $('battle-arena')?.classList.remove('solo-test-mode');
  $('solo-test-toggle')?.classList.add('hidden');
  $('solo-test-panel')?.classList.add('hidden');
  resetBattleFlowFlags();
}

async function removeBattleRoomLater(roomId, delay=3500){
  if(!state.firebase.enabled || !state.firebase.db || !roomId) return;
  setTimeout(async () => {
    try{ await remove(ref(state.firebase.db, `rooms/${roomId}`)); }
    catch(e){ console.warn('remove room failed', e); }
  }, delay);
}

async function publishBattleResult(result, reason='hp0', autoReset=false){
  const roomId = state.battle.roomId;
  const opponentId = getOpponentPlayerIdFromCache();
  const winner = result === 'win' ? state.playerId : opponentId;
  const loser = result === 'lose' ? state.playerId : opponentId;
  if(state.firebase.enabled && state.firebase.db && roomId){
    try{
      await update(ref(state.firebase.db, `rooms/${roomId}/meta`), {
        status: 'finished',
        winnerPlayerId: winner || '',
        loserPlayerId: loser || '',
        reason,
        endedBy: state.playerId,
        endedAt: serverTimestamp(),
        currentTurnPlayerId: null
      });
      await update(ref(state.firebase.db, `rooms/${roomId}/players/${state.playerId}`), {
        status: result === 'win' ? 'winner' : 'defeated',
        leftAt: serverTimestamp()
      });
      await removeBattleRoomLater(roomId, 4500);
    }catch(e){ console.warn('publishBattleResult failed', e); }
  }
  showBattleResult(result, {autoReset, reason});
}


function isBattleLocked(){
  const game = state.battle.game;
  if(isSoloTestMode()){
    return !!(!game || game.finished);
  }
  return !!(state.battle.matchLocked || !game || game.finished || !game.isMyTurn);
}

function setBattleLocked(locked){
  state.battle.matchLocked = !!locked;
  const arena = $('battle-arena');
  if(arena) arena.classList.toggle('battle-locked', !!locked);
  renderBattleArena();
}
function showBattleBanner(text, options={}){
  const el = $('battle-flow-banner');
  if(!el) return Promise.resolve();
  if(state.battle.bannerTimer){ clearTimeout(state.battle.bannerTimer); state.battle.bannerTimer = null; }
  el.textContent = text;
  el.classList.remove('hidden','hide');
  el.classList.add('show');
  if(options.lock !== false) state.battle.matchLocked = true;
  const duration = options.duration ?? 2000;
  return new Promise(resolve => {
    state.battle.bannerTimer = setTimeout(() => {
      el.classList.remove('show');
      el.classList.add('hide');
      setTimeout(() => {
        el.classList.add('hidden');
        el.classList.remove('hide');
        if(options.unlockAfter) state.battle.matchLocked = false;
        renderBattleArena();
        resolve();
      }, 260);
    }, duration);
    renderBattleArena();
  });
}
function showWaitingForOpponent(){
  state.battle.hasMatched = false;
  state.battle.matchLocked = true;
  showBattleBanner('待機中・・・', {duration: 999999, lock:true});
  $('battle-status').textContent = '待機中・・・';
}
function hideBattleBanner(){
  const el = $('battle-flow-banner');
  if(state.battle.bannerTimer){ clearTimeout(state.battle.bannerTimer); state.battle.bannerTimer = null; }
  if(el){ el.classList.add('hidden'); el.classList.remove('show','hide'); }
}
function clearPresenceTimer(){
  if(state.battle.presenceTimer){ clearInterval(state.battle.presenceTimer); state.battle.presenceTimer = null; }
}
async function markMyPresence(roomId){
  if(!state.firebase.enabled || !state.firebase.db || !roomId || !state.playerId) return;
  const playerRef = ref(state.firebase.db, `rooms/${roomId}/players/${state.playerId}`);
  try{
    await update(playerRef, {status:'active', lastSeenMs: Date.now(), updatedAt: serverTimestamp()});
    try{
      await onDisconnect(playerRef).update({status:'left', disconnectedAt: serverTimestamp(), lastSeenMs: Date.now()});
    }catch(e){ console.warn('onDisconnect failed', e); }
  }catch(e){ console.warn('presence update failed', e); }
  clearPresenceTimer();
  state.battle.presenceTimer = setInterval(async () => {
    if(!state.battle.roomId || state.battle.roomId !== roomId) return;
    try{ await update(playerRef, {status:'active', lastSeenMs: Date.now(), updatedAt: serverTimestamp()}); }
    catch(e){ console.warn('presence heartbeat failed', e); }
  }, 5000);
}
function chooseRandomFirstPlayerId(ids){
  const list = [...ids].sort((a,b)=>a.localeCompare(b,'ja'));
  return list[randomIndex(list.length, 'firstPlayer', {ids:list})] || state.playerId;
}
async function finishRoomAsWinner(reason='opponent_left'){
  const roomId = state.battle.roomId;
  if(!roomId || !state.firebase.enabled || !state.firebase.db) return;
  try{
    await update(ref(state.firebase.db, `rooms/${roomId}/meta`), {
      status:'finished',
      winnerPlayerId: state.playerId,
      loserPlayerId: getOpponentPlayerIdFromCache() || '',
      reason,
      endedBy: state.playerId,
      endedAt: serverTimestamp(),
      currentTurnPlayerId: null
    });
    await removeBattleRoomLater(roomId, 4500);
  }catch(e){ console.warn('finishRoomAsWinner failed', e); }
}
function resetBattleFlowFlags(){
  state.battle.hasMatched = false;
  state.battle.matchLocked = false;
  state.battle.lastTurnPlayerId = '';
  state.battle.lastActionSeq = 0;
  state.battle.processingRemoteAction = false;
  state.battle.appliedActionIds = {};
  state.battle.startBannerShown = false;
  hideBattleBanner();
  clearPresenceTimer();
}
function slotElementForRef(refObj){
  if(!refObj) return null;
  if(refObj.side === 'playerLeader') return document.querySelector('.player-leader');
  if(refObj.side === 'enemyLeader') return document.querySelector('.enemy-leader');
  return document.querySelector(`.unit-slot[data-side="${refObj.side}"][data-pos="${refObj.pos}"]`);
}
function animateAttackMotion(attackerRef, defenderRef){
  const attackerEl = slotElementForRef(attackerRef);
  const defenderEl = slotElementForRef(defenderRef);
  if(!attackerEl || !defenderEl) return;
  const a = attackerEl.getBoundingClientRect();
  const d = defenderEl.getBoundingClientRect();
  const dx = (d.left + d.width/2) - (a.left + a.width/2);
  const dy = (d.top + d.height/2) - (a.top + a.height/2);
  attackerEl.style.setProperty('--attack-dx', `${dx * 0.72}px`);
  attackerEl.style.setProperty('--attack-dy', `${dy * 0.72}px`);
  attackerEl.classList.remove('attack-lunge');
  void attackerEl.offsetWidth;
  attackerEl.classList.add('attack-lunge');
  setTimeout(() => attackerEl.classList.remove('attack-lunge'), 520);
}


function compactUnitRef(unit, side='player'){
  if(!unit) return null;
  const board = side === 'enemy' ? state.battle.game?.enemy?.board : state.battle.game?.player?.board;
  const pos = Array.isArray(board) ? board.indexOf(unit) : -1;
  return {id:unit.id, cardId:unit.cardId, name:unit.name, side, pos, attack:unit.attack, hp:unit.hp};
}
function makeActionPayload(type, payload={}){
  return {
    type,
    actorId: state.playerId,
    turn: state.battle.game?.turn || 0,
    payload: cloneEventPayload(payload),
    createdAt: serverTimestamp()
  };
}
async function pushBattleAction(type, payload={}){
  const game = state.battle.game;
  if(!game || state.battle.processingRemoteAction) return;
  if(!state.firebase.enabled || !state.firebase.db || !state.battle.roomId) return;
  try{
    await push(ref(state.firebase.db, `rooms/${state.battle.roomId}/actions`), makeActionPayload(type, payload));
  }catch(e){ console.warn('pushBattleAction failed', e); }
}
function subscribeBattleActions(roomId){
  if(!state.firebase.enabled || !state.firebase.db || !roomId) return;
  const actionRef = ref(state.firebase.db, `rooms/${roomId}/actions`);
  const unsub = onValue(actionRef, snap => {
    const actions = snap.val() || {};
    const entries = Object.entries(actions).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
    state.battle.appliedActionIds ||= {};
    for(let i=state.battle.lastActionSeq || 0; i<entries.length; i++){
      const [id, action] = entries[i];
      state.battle.lastActionSeq = i + 1;
      if(!action || action.actorId === state.playerId || state.battle.appliedActionIds[id]) continue;
      state.battle.appliedActionIds[id] = true;
      applyRemoteAction(action, id);
    }
  });
  state.battle.unsubs.push(unsub);
}

function remoteSide(localSide){
  if(localSide === 'player') return 'enemy';
  if(localSide === 'enemy') return 'player';
  if(localSide === 'playerLeader') return 'enemyLeader';
  if(localSide === 'enemyLeader') return 'playerLeader';
  return localSide;
}
function mirrorRef(refObj){
  if(!refObj) return null;
  return {...refObj, side:remoteSide(refObj.side)};
}
function placeRemoteUnit(card, unitData, pos, summon=false){
  const game = state.battle.game;
  if(!card || pos == null || pos < 0 || pos >= 6) return null;
  const board = game.enemy.board;
  const unit = makeUnitFromCard(card);
  if(unitData){
    unit.id = unitData.id || unit.id;
    unit.attack = Number(unitData.attack ?? unit.attack);
    unit.hp = Number(unitData.hp ?? unit.hp);
    unit.maxHp = Number(unitData.maxHp ?? unit.maxHp ?? unit.hp);
    if(unitData.statuses) unit.statuses = unitData.statuses;
    if(unitData.keywords) unit.keywords = {...unit.keywords, ...unitData.keywords};
  }
  board[pos] = unit;
  if(summon) applyBaseKeywordsOnly(unit, card);
  return unit;
}
function applyRemoteReducer(action){
  const game = state.battle.game;
  const p = action.payload || {};
  if(!game) return false;
  if(action.type === 'choiceSelected'){
    game.lastRemoteChoice = p;
    battleLog(`相手の選択を受信：${p.value || p.title || ''}`);
    return true;
  }
  if(action.type === 'targetSelected'){
    game.lastRemoteTarget = p;
    battleLog('相手の対象選択を受信しました。');
    return true;
  }
  if(action.type === 'unitSummoned'){
    const card = byId(p.card?.id) || findCardByName(p.card?.name);
    placeRemoteUnit(card, p.unit, p.pos, true);
    battleLog(`相手が${p.card?.name || 'ユニット'}を召喚しました。`);
    return true;
  }
  if(action.type === 'unitPutIntoPlay'){
    const card = byId(p.card?.id) || findCardByName(p.card?.name);
    placeRemoteUnit(card, p.unit, p.pos, false);
    battleLog(`相手の効果で${p.card?.name || 'ユニット'}が場に出ました。`);
    return true;
  }
  if(action.type === 'cardPlayed'){
    if(p.card?.cardType !== 'ユニット'){
      game.enemy.handCount = Math.max(0, Number(game.enemy.handCount || 0) - 1);
      battleLog(`相手が${p.card?.name || 'カード'}を使用しました。`);
    }
    return true;
  }
  if(action.type === 'betActivated'){
    battleLog('相手がBETを発動しました。');
    return true;
  }
  if(action.type === 'weaponEquipped'){
    const c = byId(p.card?.id) || findCardByName(p.card?.name);
    game.enemy.weapon = {
      name:p.weapon?.name || c?.name || p.card?.name || '武器',
      attack:Number(p.weapon?.attack ?? c?.attack ?? 0),
      durability:Number(p.weapon?.durability ?? c?.hp ?? 1),
      maxDurability:Number(p.weapon?.maxDurability ?? p.weapon?.durability ?? c?.hp ?? 1),
      cardText:p.weapon?.cardText || getCardText(c),
      noCounter:!!p.weapon?.noCounter,
      snipe:!!p.weapon?.snipe,
      doubleAttack:!!p.weapon?.doubleAttack,
      attacksLeft:Number(p.weapon?.attacksLeft ?? 1)
    };
    game.enemy.leaderAttack = game.enemy.weapon.attack;
    game.enemy.leaderCanAttack = game.enemy.leaderAttack > 0;
    battleLog(`相手が${game.enemy.weapon.name}を装備しました。`);
    return true;
  }
  if(action.type === 'weaponBroken'){
    game.enemy.weapon = null;
    game.enemy.leaderAttack = 0;
    game.enemy.leaderCanAttack = false;
    battleLog('相手の武器が壊れました。');
    return true;
  }
  if(action.type === 'attackDeclared'){
    battleLog('相手が攻撃しました。');
    return true;
  }
  if(action.type === 'damageApplied'){
    const target = p.targetRef || {};
    const amount = Number(p.actual ?? p.amount ?? 0);
    if(target.side === 'enemyLeader'){
      game.player.hp = Math.max(0, game.player.hp - amount);
    }else if(target.side === 'playerLeader'){
      game.enemy.hp = Math.max(0, game.enemy.hp - amount);
    }else{
      const ref = mirrorRef(target);
      const board = ref?.side === 'player' ? game.player.board : game.enemy.board;
      const u = board?.[ref?.pos];
      if(u) u.hp -= amount;
    }
    return true;
  }
  if(action.type === 'counterDamage'){
    const ref = mirrorRef(p.attackerRef || {});
    const amount = Number(p.amount || 0);
    if(ref?.side === 'playerLeader'){
      game.player.hp = Math.max(0, game.player.hp - amount);
    }else{
      const board = ref?.side === 'player' ? game.player.board : game.enemy.board;
      const u = board?.[ref?.pos];
      if(u) u.hp -= amount;
    }
    return true;
  }
  if(action.type === 'attackResolved'){
    return true;
  }
  if(action.type === 'afterAttack'){
    // v73以降、基本ダメージは damageApplied / counterDamage action で反映。
    // afterAttackはマヤ/ローシュ等の攻撃後誘発の区切りとして扱う。
    battleLog('相手の攻撃後処理を受信しました。');
    return true;
  }
  if(action.type === 'unitDeath'){
    const ref = mirrorRef({side:p.side, pos:p.pos, id:p.unit?.id, cardId:p.unit?.cardId});
    const board = ref?.side === 'player' ? game.player.board : game.enemy.board;
    if(board && Number.isInteger(ref.pos) && board[ref.pos]) board[ref.pos] = null;
    return true;
  }
  if(action.type === 'ownTurnEnd'){
    emitBattleEvent('opponentTurnEnd', {side:'enemy', remote:true});
    return true;
  }
  if(action.type === 'ownTurnStart'){
    emitBattleEvent('opponentTurnStart', {side:'enemy', remote:true});
    return true;
  }
  return false;
}

function findUnitByRemoteRef(refObj, sideHint='enemy'){
  const game = state.battle.game;
  if(!refObj) return null;
  const side = refObj.side === 'player' ? 'enemy' : refObj.side === 'enemy' ? 'player' : sideHint;
  const board = side === 'player' ? game.player.board : game.enemy.board;
  if(refObj.id){
    const found = board.find(u => u?.id === refObj.id);
    if(found) return found;
  }
  if(Number.isInteger(refObj.pos) && board[refObj.pos]) return board[refObj.pos];
  if(refObj.cardId){
    const found = board.find(u => u?.cardId === refObj.cardId);
    if(found) return found;
  }
  return null;
}
function logRemoteAction(action){
  const game = state.battle.game;
  game.remoteActions ||= [];
  game.remoteActions.push(action);
  if(game.remoteActions.length > 100) game.remoteActions.splice(0, game.remoteActions.length - 100);
}
function applyRemoteAction(action, id=''){
  const game = state.battle.game;
  if(!game) return;
  state.battle.processingRemoteAction = true;
  try{
    const a = {id, ...action};
    logRemoteAction(a);
    const p = action.payload || {};
    if(action.type === 'randomResult'){
      game.remoteRandomResults ||= [];
      game.remoteRandomResults.push(p);
      return;
    }
    const reduced = applyRemoteReducer(action);
    if(reduced){
      renderBattleArena();
      return;
    }
    battleLog(`相手actionを受信：${action.type}`);
  }finally{
    state.battle.processingRemoteAction = false;
  }
}
function nextRemoteRandom(kind, context={}){
  const game = state.battle.game;
  const q = game?.remoteRandomResults || [];
  const idx = q.findIndex(r => r && r.kind === kind && JSON.stringify(r.context || {}) === JSON.stringify(context || {}));
  if(idx >= 0) return q.splice(idx, 1)[0].result;
  const idx2 = q.findIndex(r => r && r.kind === kind);
  if(idx2 >= 0) return q.splice(idx2, 1)[0].result;
  return null;
}
function makeRandomResult(kind, result, context={}){
  const payload = {kind, result, context, turn:state.battle.game?.turn || 0};
  pushBattleAction('randomResult', payload);
  return result;
}
function randomIndex(length, kind='random', context={}){
  if(!length || length <= 0) return -1;
  const remote = state.battle.processingRemoteAction ? nextRemoteRandom(kind, context) : null;
  if(remote != null && Number(remote) >= 0 && Number(remote) < length) return Number(remote);
  const idx = Math.floor(Math.random() * length);
  makeRandomResult(kind, idx, context);
  return idx;
}
function chooseRandom(arr, kind='chooseRandom', context={}){
  if(!arr || !arr.length) return null;
  return arr[randomIndex(arr.length, kind, context)];
}
function shuffle(arr, kind='shuffle', context={}){
  for(let i=arr.length-1;i>0;i--){
    const j = randomIndex(i+1, kind, {...context, i});
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function makeRoomId(matchId){
  return normalizePlayerId(matchId).toLowerCase();
}



function renderEnemyHandListPopV102(){
  const pop = $('enemy-hand-list-pop');
  if(!pop || !state.battle.game) return;
  const hand = state.battle.game.enemy.hand || [];
  pop.innerHTML = hand.map((id, i) => {
    const card = byId(id);
    const img = getOfficialImage(card);
    return `<div class="enemy-hand-list-item">${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(card?.name || id)}" loading="lazy" referrerpolicy="no-referrer">` : '<span></span>'}<span>${i+1}. ${escapeHtml(card?.name || id)}</span></div>`;
  }).join('') || '<div class="enemy-hand-list-item"><span></span><span>なし</span></div>';
}
function renderEnemyHandVisualV102(){
  const box = $('enemy-hand-visual');
  if(!box) return;
  if(!isSoloTestMode() || !state.battle.game){
    box.classList.add('hidden');
    box.innerHTML = '';
    $('enemy-hand-list-pop')?.classList.add('hidden');
    return;
  }
  const hand = state.battle.game.enemy.hand || [];
  box.classList.remove('hidden');
  const minis = hand.slice(0, 12).map(id => {
    const card = byId(id);
    const img = getOfficialImage(card);
    return `<span class="enemy-hand-mini" title="${escapeHtml(card?.name || id)}">${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(card?.name || id)}" loading="lazy" referrerpolicy="no-referrer">` : escapeHtml(card?.name || '?')}</span>`;
  }).join('');
  box.innerHTML = `<span class="enemy-hand-count">手札${hand.length}</span>${minis}`;
  box.onclick = (e) => {
    e.stopPropagation();
    renderEnemyHandListPopV102();
    $('enemy-hand-list-pop')?.classList.toggle('hidden');
  };
  renderEnemyHandListPopV102();
}
function soloPlaceFirstEmptyV102(side, card){
  const game = ensureSoloGame(); if(!game || !card) return false;
  if(card.cardType !== 'ユニット' && card.cardType !== '建物') return toast('ユニット/建物だけ配置できます。', false), false;
  const board = side === 'enemy' ? game.enemy.board : game.player.board;
  const pos = board.findIndex(x => !x);
  if(pos < 0) return toast('空きマスがありません。', false), false;
  const unit = makeSoloUnitFromCard(card);
  board[pos] = unit;
  if(side === 'player' && unit.isBuilding){
    game.player.buildings ||= [];
    game.player.buildings.push({id:unit.id, cardId:card.id, name:card.name});
    game.player.buildingsPlayed = Number(game.player.buildingsPlayed || 0) + 1;
  }
  battleLog(`テスト：${card.name}を${side === 'enemy' ? '敵' : '味方'}盤面${pos}へ配置。`);
  renderBattleArena();
  return true;
}
function wireSoloControlsV102(){
  if(!isSoloTestMode() || !state.battle.game) return;
  const bind = (id, fn) => {
    const el = $(id); if(!el) return;
    el.onclick = (e) => { e.preventDefault(); e.stopPropagation(); fn(); };
    el.ontouchend = (e) => { e.preventDefault(); e.stopPropagation(); fn(); };
  };
  bind('solo-add-hand', () => {
    const card = getSoloSelectedCard(); if(!card) return;
    state.battle.game.player.hand.push(card.id);
    battleLog(`テスト：${card.name}を自分手札へ追加。現在${state.battle.game.player.hand.length}枚。`);
    renderBattleArena();
  });
  bind('solo-draw-card', () => {
    const before = state.battle.game.player.hand.length;
    const n = drawCard(1);
    battleLog(`テスト：${n}枚ドロー / 手札 ${before}→${state.battle.game.player.hand.length}`);
    renderBattleArena();
  });
  bind('solo-add-decktop', () => {
    const card = getSoloSelectedCard(); if(!card) return;
    state.battle.game.player.deck.unshift(card.id);
    battleLog(`テスト：${card.name}を山札トップへ追加。`);
    renderBattleArena();
  });
  bind('solo-summon-enemy', () => {
    const card = getSoloSelectedCard(); if(!card) return;
    soloPlaceFirstEmptyV102('enemy', card);
  });
  bind('solo-summon-player', () => {
    const card = getSoloSelectedCard(); if(!card) return;
    soloPlaceFirstEmptyV102('player', card);
  });
  bind('solo-add-enemy-hand', () => {
    const card = getSoloSelectedCard(); if(!card) return;
    state.battle.game.enemy.hand ||= [];
    state.battle.game.enemy.hand.push(card.id);
    state.battle.game.enemy.handCount = state.battle.game.enemy.hand.length;
    battleLog(`テスト：${card.name}を相手手札へ追加。`);
    renderBattleArena();
  });
  bind('solo-show-enemy-hand', () => {
    renderEnemyHandVisualV104();
    renderEnemyHandListPopV102();
    $('enemy-hand-list-pop')?.classList.remove('hidden');
  });
  bind('solo-reset-enemy-hand', () => {
    setupSoloEnemyHand();
    state.battle.game.enemy.handCount = state.battle.game.enemy.hand?.length || 0;
    battleLog('テスト：相手手札を初期化。');
    renderBattleArena();
  });
}
function soloWarriorTensionV106(skill){
  const game = state.battle.game;
  const className = game.className || state.battle.selectedDeck?.className || '';
  const name = skill?.skillName || '';
  if(className.includes('戦士') || name.includes('戦士') || name.includes('剣') || name.includes('稲妻')){
    game.player.leaderAttack = Math.max(Number(game.player.leaderAttack || 0), 2);
    game.player.leaderCanAttack = true;
    battleLog('テンションスキル：このターン中リーダー攻撃力+2。リーダーが攻撃できます。');
    return true;
  }
  return false;
}




// v111 BET / weapon / tribe-buff refinements
function betTargetsV111(){
  const game = state.battle.game;
  const out = [];
  const wCard = byId(game.player.weapon?.cardId);
  if(game.player.weapon && isBet(wCard)){
    out.push({type:'weapon', label:`武器：${game.player.weapon.name}`, weapon:game.player.weapon, card:wCard});
  }
  game.player.board.forEach((u,pos) => {
    if(!u || u.isBuilding) return;
    const c = byId(u.cardId);
    if(isBet(c)) out.push({type:'unit', label:`ユニット：${u.name}`, unit:u, pos, card:c});
  });
  return out;
}
function activateBetTargetV111(target){
  const game = state.battle.game;
  if(!target) return false;
  if(target.type === 'weapon'){
    applyBetEffectFromText(getCardText(target.card), null);
    emitBattleEvent('betActivated', {source:'コイン', weapon:target.weapon});
    battleLog(`コイン：${target.weapon.name}のBETを発動。`);
    return true;
  }
  if(target.type === 'unit'){
    applyTargetedBet(target.unit);
    emitBattleEvent('betActivated', {source:'コイン', unit:target.unit});
    battleLog(`コイン：${target.unit.name}のBETを発動。`);
    return true;
  }
  return false;
}
function useCoinFromHandV111(index){
  const game = state.battle.game;
  const targets = betTargetsV111();
  if(!targets.length){
    toast('BETを持つ味方ユニット/武器がありません。', false);
    return false;
  }
  const consumeAndRun = (target) => {
    game.player.hand.splice(index, 1);
    activateBetTargetV111(target);
    game.selectedHandIndex = null;
    game.pendingGenericEffect = null;
    renderBattleArena();
    syncMyBattleState();
  };
  if(targets.length === 1){
    consumeAndRun(targets[0]);
    return true;
  }
  openChoiceModal('コイン：BET対象を選択', targets.map(t=>t.label), (picked,i)=>consumeAndRun(targets[i]), {kind:'coinBetTarget'});
  battleLog('コイン：BET対象を選択してください。');
  return true;
}

// v132: strawberry bomb, queen slime, strict Akumano Kagami, recruit effects, special fortune fixes
function isRealAdventurerForKagamiV132(card){
  if(!card || card.name === 'あくまのカガミ') return false;
  if(card.cardType !== 'ユニット') return false;
  if(Number(card.cost || 0) > 5) return false;
  const tribes = Array.isArray(card.tribes) ? card.tribes.map(String) : [String(card.tribes || '')];
  return tribes.some(t => t.replace(/系$/,'') === '冒険者');
}
function applyQueenSlimeBuffV132(sourceUnit){
  const game = state.battle.game;
  let n = 0;
  for(const u of game.player.board){
    if(!u || u.isBuilding || (sourceUnit && u.id === sourceUnit.id)) continue;
    const c = byId(u.cardId);
    if(isSlimeCard(c) || String(u.name || '').includes('スライム')){
      u.attack += 1; u.hp += 1; u.maxHp += 1; n++;
    }
  }
  if(n) battleLog(`クイーンスライム：自分以外のスライム系味方ユニット${n}体を+1/+1。`);
  else battleLog('クイーンスライム：強化対象のスライム系味方ユニットはいません。');
  return n > 0;
}
function recruitEnemyUnitV132(defenderRef, unit, eff){
  const game = state.battle.game;
  if(!eff || !unit) return false;
  if(defenderRef.side !== 'enemy') return toast('敵ユニットを選んでください。', false), true;
  if(eff.maxAttack != null && Number(unit.attack || 0) > Number(eff.maxAttack || 0)) return toast('攻撃力条件を満たしていません。', false), true;
  if(eff.maxHp != null && Number(unit.hp || 0) > Number(eff.maxHp || 0)) return toast('HP条件を満たしていません。', false), true;
  if(eff.requireAdventurer && !isAdventurerCard(byId(unit.cardId))) return toast('冒険者ユニットを選んでください。', false), true;
  const ownEmpty = getEmptyBoardPositions('player');
  if(!ownEmpty.length) return toast('味方の空きマスがありません。', false), true;
  game.enemy.board[defenderRef.pos] = null;
  const pos = chooseRandom(ownEmpty, 'recruitSlotV132', {});
  if(eff.haste){
    unit.keywords ||= {};
    unit.keywords.haste = true;
    unit.canAttack = true;
    unit.summoningSickness = false;
  }
  if(eff.attackBuff){ unit.attack += Number(eff.attackBuff || 0); }
  if(eff.hpBuff){ unit.hp += Number(eff.hpBuff || 0); unit.maxHp += Number(eff.hpBuff || 0); }
  if(eff.untilTurnEnd) unit.returnToEnemyAtTurnEnd = true;
  if(eff.whileSourceAlive) unit.controlledWhileSourceAlive = eff.sourceUnitId || true;
  game.player.board[pos] = unit;
  battleLog(`${eff.source}：${unit.name}を${eff.untilTurnEnd ? 'このターン中' : ''}味方にしました。`);
  game.pendingGenericEffect = null;
  renderBattleArena(); syncMyBattleState();
  return true;
}
function applySpecialFortuneOptionV132(card, optionText, optionIndex=0){
  const game = state.battle.game;
  const name = card?.name || '';
  const opt = String(optionText || '');
  if(name === '暴将 黒竜丸'){
    if(optionIndex === 0 || opt.includes('4/4')){
      const self = game.player.board.find(u => u?.cardId === card.id || u?.name === name);
      for(const u of game.player.board){
        if(!u || u.isBuilding || (self && u.id === self.id)) continue;
        u.attack = 4; u.hp = 4; u.maxHp = 4;
      }
      battleLog('暴将 黒竜丸：他の全ての味方ユニットを4/4にしました。');
    }else{
      for(const u of game.enemy.board) if(u && !u.isBuilding) dealDamageToUnit(u, 3, name, 'enemy');
      resolveDeaths();
      battleLog('暴将 黒竜丸：全ての敵ユニットに3ダメージ。');
    }
    return true;
  }
  if(name === 'ジュリアンテ'){
    if(optionIndex === 0 || opt.includes('+2/+2')){
      const self = game.player.board.find(u => u?.cardId === card.id || u?.name === name);
      for(const u of game.player.board){
        if(!u || u.isBuilding || (self && u.id === self.id)) continue;
        u.attack += 2; u.hp += 2; u.maxHp += 2;
      }
      battleLog('ジュリアンテ：他の全ての味方ユニットを+2/+2。');
    }else{
      const targets = game.enemy.board.map((u,i)=>({u,i})).filter(x=>x.u && !x.u.isBuilding);
      shuffle(targets, 'julianteApathy', {});
      for(const t of targets.slice(0,3)){ addStatus(t.u, 'apathy', {until:'turnStart'}); t.u.canAttack = false; }
      battleLog(`ジュリアンテ：ランダムな敵${Math.min(3, targets.length)}体を次のターン攻撃不能にしました。`);
    }
    return true;
  }
  return false;
}
function applySpecialFortuneCardV132(card){
  if(!card || !['暴将 黒竜丸','ジュリアンテ'].includes(card.name)) return false;
  const game = state.battle.game;
  const options = parseChoiceOptions(getCardText(card));
  const list = options.length ? options : [getCardText(card)];
  if(game.player.nextFortuneBoth || game.player.fortuneMode === 'super'){
    game.player.nextFortuneBoth = false;
    battleLog(`${card.name}：占い効果を両方発動。`);
    list.slice(0,2).forEach((op,i)=>applySpecialFortuneOptionV132(card, op, i));
    return true;
  }
  if(game.player.fortuneMode === 'hit'){
    openChoiceModal(card.name + '：必中', list.slice(0,2), (picked, i)=>{
      applySpecialFortuneOptionV132(card, picked, i);
      renderBattleArena(); syncMyBattleState();
    }, {kind:'fortuneHitV132', card:{id:card.id, name:card.name}});
    return true;
  }
  const i = Math.floor(Math.random() * Math.min(2, list.length));
  applySpecialFortuneOptionV132(card, list[i], i);
  return true;
}

function applyTribeBuffTextV111(text, sourceUnit, sourceName='効果'){
  const game = state.battle.game;
  text = String(text || '');
  let applied = false;
  const patterns = [
    /(?:自分以外の|このユニットを除く)?(スライム|ゾンビ|ドラゴン|魔王|冒険者|英雄)系?の味方ユニット(?:全て|すべて)?を[+＋](\d+)\/[+＋](\d+)/,
    /(?:自分以外の|このユニットを除く)?味方の(スライム|ゾンビ|ドラゴン|魔王|冒険者|英雄)系?ユニット(?:全て|すべて)?を[+＋](\d+)\/[+＋](\d+)/,
    /(?:自分以外の|このユニットを除く)?(スライム|ゾンビ|ドラゴン|魔王|冒険者|英雄)系?の味方(?:全て|すべて)?を[+＋](\d+)\/[+＋](\d+)/
  ];
  for(const rx of patterns){
    const m = text.match(rx);
    if(!m) continue;
    const tribe = m[1];
    const a = Number(m[2] || 1);
    const h = Number(m[3] || 1);
    for(const u of game.player.board){
      if(!u || u.isBuilding) continue;
      if(sourceUnit && u.id === sourceUnit.id) continue;
      if(isTribeCard(byId(u.cardId), tribe)){
        u.attack += a;
        u.hp += h;
        u.maxHp += h;
        applied = true;
      }
    }
    if(applied) battleLog(`${sourceName}：自分以外の${tribe}系味方ユニットを+${a}/+${h}。`);
    return applied;
  }
  const allM = text.match(/(?:自分以外の|このユニットを除く)?味方ユニット(?:全て|すべて)?を[+＋](\d+)\/[+＋](\d+)/);
  if(allM){
    const a = Number(allM[1] || 1);
    const h = Number(allM[2] || 1);
    for(const u of game.player.board){
      if(!u || u.isBuilding) continue;
      if(sourceUnit && u.id === sourceUnit.id) continue;
      u.attack += a;
      u.hp += h;
      u.maxHp += h;
      applied = true;
    }
    if(applied) battleLog(`${sourceName}：自分以外の味方ユニットを+${a}/+${h}。`);
  }
  return applied;
}
function refreshLeaderAttackFromWeaponV111(side='player'){
  const game = state.battle.game;
  const target = side === 'enemy' ? game.enemy : game.player;
  if(side === 'player'){
    game.player.leaderAttack = target.weapon ? Number(target.weapon.attack || 0) : 0;
    game.player.leaderCanAttack = !!target.weapon && Number(target.weapon.attack || 0) > 0;
  }
}
function destroyWeaponV111(side='player', reason='破壊'){
  const game = state.battle.game;
  const target = side === 'enemy' ? game.enemy : game.player;
  const w = target.weapon;
  if(!w) return false;
  emitBattleEvent('weaponBroken', {side, weapon:w, reason});
  applyWeaponBreakEffect(w);
  battleLog(`${side === 'enemy' ? '敵' : '味方'}の${w.name}は${reason}されました。`);
  target.weapon = null;
  if(side === 'player'){
    game.player.leaderAttack = 0;
    game.player.leaderCanAttack = false;
  }
  return true;
}

// v110 official-ish solo rule helpers
function addCardIdToPlayerHandV110(id, source='カード追加'){
  const game = state.battle.game;
  if(!game?.player) return false;
  const card = byId(id);
  if((game.player.hand || []).length >= 10){
    battleLog(`${source}：${card?.name || id}は手札上限10枚のため破棄。`);
    return false;
  }
  game.player.hand.push(id);
  return true;
}
function addCardCopyToHandV110(card, opts={}, source='カード追加'){
  if(!card) return false;
  if((state.battle.game.player.hand || []).length >= 10){
    battleLog(`${source}：${card.name}は手札上限10枚のため破棄。`);
    return false;
  }
  return addCardCopyToHand(card, opts);
}
function equipWeaponToLeaderV110(card, side='player'){
  const game = state.battle.game;
  if(!card) return false;
  const target = side === 'enemy' ? game.enemy : game.player;
  if(target.weapon){
    const old = target.weapon;
    emitBattleEvent('weaponBroken', {side, weapon:old, reason:'上書き装備'});
    applyWeaponBreakEffect(old);
    battleLog(`${side === 'enemy' ? '敵' : '味方'}の装備中の${old.name}は新しい武器装備により破棄されました。`);
  }
  const durability = Math.max(1, Number(card.hp || card.durability || 1));
  target.weapon = {
    cardId: card.id,
    name: card.name,
    attack: Number(card.attack || 0),
    durability,
    maxDurability: durability,
    cardText: getCardText(card),
    attacksLeft: parseKeywordFlags(card).doubleAttack ? 2 : 1,
    doubleAttack: !!parseKeywordFlags(card).doubleAttack,
    noCounter: String(getCardText(card)).includes('反撃ダメージを受けない')
  };
  if(side === 'player'){
    game.player.leaderAttack = Math.max(Number(game.player.leaderAttack || 0), Number(target.weapon.attack || 0));
    game.player.leaderCanAttack = Number(target.weapon.attack || 0) > 0;
  }
  emitBattleEvent('weaponEquipped', {side, card, weapon:target.weapon});
  if(card.name === 'おうごんのつめ' && side === 'player') summonTokenByName('ミイラおとこ', {attack:3, hp:3}, 'enemy');
  battleLog(`${side === 'enemy' ? '敵' : '味方'}リーダーが${card.name}を装備しました。`);
  return true;
}

function renderLeaderWeaponsV110(){
  const game = state.battle.game;
  if(!game) return;
  const draw = (sel, weapon) => {
    const el = document.querySelector(sel);
    if(!el) return;
    el.querySelector('.leader-weapon-badge')?.remove();
    if(!weapon) return;
    const card = byId(weapon.cardId) || {name:weapon.name};
    const img = getOfficialImage(card);
    const b = document.createElement('div');
    b.className = 'leader-weapon-badge';
    b.innerHTML = `${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(weapon.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${escapeHtml(weapon.name)} ${weapon.attack}/${weapon.durability}</span>`;
    el.appendChild(b);
  };
  draw('.player-leader', game.player.weapon);
  draw('.enemy-leader', game.enemy.weapon);
}
function soloPlaceEnemyHandCardV110(index){
  const game = ensureSoloGame(); if(!game) return false;
  const id = game.enemy.hand?.[index];
  const card = byId(id);
  if(!card) return false;
  if(isWeapon(card)){
    game.enemy.hand.splice(index, 1);
    game.enemy.handCount = game.enemy.hand.length;
    equipWeaponToLeaderV110(card, 'enemy');
    renderBattleArena();
    return true;
  }
  if(isCoinResourceCard(card)){
    battleLog('相手手札のコインは盤面配置できません。');
    return false;
  }
  if(!isBoardPlaceableCardV112(card)){
    battleLog(`${card.name}は盤面配置カードではありません。`);
    return false;
  }
  const board = game.enemy.board;
  const pos = board.findIndex(x => !x);
  if(pos < 0) return toast('敵盤面に空きマスがありません。', false), false;
  const unit = makeSoloUnitFromCardSafeV107(card);
  board[pos] = unit;
  game.enemy.hand.splice(index, 1);
  game.enemy.handCount = game.enemy.hand.length;
  battleLog(`相手手札の${card.name}を敵盤面${pos}へ配置。`);
  renderBattleArena();
  return true;
}

function applyCoinBetToTargetV110(unit){
  if(!unit) return false;
  const card = byId(unit.cardId);
  if(!isBet(card)) return false;
  applyTargetedBet(unit);
  emitBattleEvent('betActivated', {source:'コイン', targetUnit:{id:unit.id, name:unit.name}});
  battleLog(`コイン：${unit.name}のBETを発動。`);
  return true;
}
function useCoinFromHandV110(index){
  return useCoinFromHandV111(index);
}

function applySlaringalChoiceToUnitV110(unit, choiceIndex){
  if(!unit) return false;
  if(choiceIndex === 0){
    unit.attack += 1;
    unit.hp += 1;
    unit.maxHp += 1;
    unit.keywords ||= {};
    unit.keywords.haste = true;
    unit.canAttack = true;
    unit.cannotAttackLeaderThisTurn = true;
    setUnitTempImmuneDamage(unit, 'turnEnd', 'スラリンガル');
    battleLog('スラリンガル：+1/+1、速攻、敵リーダー攻撃不可、ダメージ無効。');
  }else{
    unit.doubleStatsAtTurnEnd = true;
    battleLog('スラリンガル：ターン終了時に攻撃力とHPが2倍。');
  }
  return true;
}
function triggerGrandmazTop3V110(source='グランマーズ'){
  return triggerGrandmazTop3V117(source);
}

function triggerFostailStartV110(){
  const game = state.battle.game;
  const fortune = state.allCards.filter(c => c && hasFortuneEffect(c) && c.flags?.deckBuildable !== false);
  const card = chooseRandom(fortune, 'fostailFortune', {});
  if(card){
    addCardCopyToHandV110(card, {costDelta:-1}, 'フォステイル');
    battleLog(`フォステイル：占いカード ${card.name} を手札へ。コスト-1。`);
  }
}

function renderSoloDebugStripV103(){
  const wrap = $('solo-debug-strip');
  const handBox = $('solo-debug-hand');
  const enemyBox = $('solo-debug-enemy-hand');
  if(!wrap || !handBox || !enemyBox) return;
  const game = state.battle.game;
  if(!isSoloTestMode() || !game){
    wrap.classList.add('hidden');
    handBox.innerHTML = '';
    enemyBox.innerHTML = '';
    return;
  }
  wrap.classList.remove('hidden');
  const cardBtn = (id, index, isPlayer) => {
    const card = byId(id) || {id, name:String(id || '?'), cost:0, cardType:'不明', text:''};
    const img = getOfficialImage(card);
    const selected = isPlayer && game.selectedHandIndex === index ? ' selected' : '';
    const effectiveCostV117 = isPlayer ? getEffectiveCost(card) : Number(card.cost || 0);
    const data = isPlayer
      ? `data-solo-hand-index="${index}" onpointerdown="return recordSoloHandPointerV131(event)" onclick="return openSoloHandCardModalTapSafeV131(\'player\', ${index}, event)"`
      : `data-solo-enemy-hand-index="${index}" onpointerdown="return recordSoloHandPointerV131(event)" onclick="return openSoloHandCardModalTapSafeV131(\'enemy\', ${index}, event)"`;
    return `<button class="solo-debug-card${selected}" ${data} title="${escapeHtml(card.name)}">${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(card.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${effectiveCostV117}｜${escapeHtml(card.name)}</span></button>`;
  };
  handBox.innerHTML = (game.player.hand || []).map((id,i)=>cardBtn(id,i,true)).join('') || '<span style="color:#fff;padding:6px">0枚</span>';
  enemyBox.innerHTML = (game.enemy.hand || []).map((id,i)=>cardBtn(id,i,false)).join('') || '<span style="color:#fff;padding:6px">0枚</span>';
  installEnemyHandContainerDelegationV120();
  installSoloHandSwipeGuardV131();
  installSoloHandSwipeGuardV134();
}

function soloPlaceFirstEmptyV103(side, card){
  const game = ensureSoloGame(); if(!game || !card) return false;
  if(isCoinResourceCard(card)){
    toast('コインは盤面配置できません。手札からBET対象へ使用します。', false);
    battleLog('コインは盤面配置不可。');
    return false;
  }
  if(isWeapon(card)){
    equipWeaponToLeaderV110(card, side === 'enemy' ? 'enemy' : 'player');
    renderBattleArena();
    return true;
  }
  if(!isBoardPlaceableCardV112(card)) return toast('ユニット/建物だけ配置できます。', false), false;
  const board = side === 'enemy' ? game.enemy.board : game.player.board;
  const pos = board.findIndex(x => !x);
  if(pos < 0) return toast('空きマスがありません。', false), false;
  const unit = makeSoloUnitFromCardSafeV107(card);
  board[pos] = unit;
  if(side === 'player' && unit.isBuilding){
    game.player.buildings ||= [];
    game.player.buildings.push({id:unit.id, cardId:card.id, name:card.name});
    game.player.buildingsPlayed = Number(game.player.buildingsPlayed || 0) + 1;
  }
  if(side === 'player' && card.name === 'スラリンガル'){
    openChoiceModal('スラリンガル 選択', ['+1/+1・速攻・敵リーダー攻撃不可・ダメージ無効','ターン終了時 攻撃力とHPを2倍'], (picked,i)=>{
      applySlaringalChoiceToUnitV110(unit, i);
      renderBattleArena(); syncMyBattleState();
    }, {kind:'slaringalChoice'});
  }
  if(side === 'player' && card.name === 'グランマーズ') triggerGrandmazTop3V110('グランマーズ');
  battleLog(`テスト：${card.name}を${side === 'enemy' ? '敵' : '味方'}盤面${pos}へ配置。`);
  renderBattleArena();
  return true;
}

function soloUseTensionSkillV103(){
  const game = ensureSoloGame(); if(!game) return;
  if(game.player.tension < 3) return toast('テンションが3必要です。', false);
  if(!game.player.leaderSkill) game.player.leaderSkill = getBaseTensionSkill(game.className || state.battle.selectedDeck?.className || '戦士');
  applyTensionSkill(game.player.leaderSkill);
  triggerSkillBoostOnTensionSkill();
  triggerTensionLinks('skillUse', {skill:game.player.leaderSkill});
  soloWarriorTensionV106(game.player.leaderSkill);
  game.player.tension = 0;
  game.player.tensionUsedThisTurn = true;
  battleLog('テンションスキルを発動しました。テンション0。');
  renderBattleArena();
}

function wireSoloControlsV103(){
  if(!isSoloTestMode() || !state.battle.game) return;
  const bind = (id, label, fn) => {
    const el = $(id); if(!el) return;
    el.onclick = e => { e.preventDefault(); e.stopPropagation(); soloSafeRunV106(label, fn); };
    el.ontouchend = e => { e.preventDefault(); e.stopPropagation(); soloSafeRunV106(label, fn); };
  };

  // v113: ソロパネルはHP/MP/テンション/ログ制御だけ残す
  bind('solo-hp-infinite', '相手HP∞', soloSetEnemyHpInfinite);
  bind('solo-hp-reset', '相手HP25', soloSetEnemyHpNormal);
  bind('solo-mp-max', 'MP10', soloSetMpMax);
  bind('solo-tension-max', 'テンションMAX', soloSetTensionMax);
  bind('solo-clear-log', 'ログ消去', soloClearLog);

  const t = $('tension-button');
  if(t){
    t.onclick = e => {
      if(!isSoloTestMode()) return;
      e.preventDefault(); e.stopPropagation();
      if(state.battle.game?.player?.tension >= 3) soloSafeRunV106('テンションスキル発動', soloUseTensionSkillV103);
      else soloSafeRunV106('テンションをためる', useOrChargeTension);
    };
    t.ontouchend = e => {
      if(!isSoloTestMode()) return;
      e.preventDefault(); e.stopPropagation();
      if(state.battle.game?.player?.tension >= 3) soloSafeRunV106('テンションスキル発動', soloUseTensionSkillV103);
      else soloSafeRunV106('テンションをためる', useOrChargeTension);
    };
  }

  // 下部ストリップのカード操作は残す
  document.querySelectorAll('.solo-debug-card[data-solo-hand-index]').forEach(btn => {
    btn.onclick = e => { openSoloHandCardModalV121('player', Number(btn.dataset.soloHandIndex), e); };
    btn.ontouchend = e => { openSoloHandCardModalV121('player', Number(btn.dataset.soloHandIndex), e); };
  });
  document.querySelectorAll('.solo-debug-card[data-solo-enemy-hand-index]').forEach(btn => {
    btn.onclick = e => { openSoloHandCardModalV121('enemy', Number(btn.dataset.soloEnemyHandIndex), e); };
    btn.ontouchend = e => { openSoloHandCardModalV121('enemy', Number(btn.dataset.soloEnemyHandIndex), e); };
  });
}

function startSoloTestMode(){
  if(!state.battle.selectedDeck) return toast('先にデッキを選択してください。', false);
  cleanupBattleSubscriptions();
  state.battle.matchId = 'SOLO_TEST';
  state.battle.roomId = '';
  state.battle.resultShown = false;
  state.battle.hasMatched = true;
  state.battle.startBannerShown = true;
  state.battle.matchLocked = false;
  state.battle.soloTestMode = true;
  state.battle.soloSelectedCardId = '';
  initLocalBattleGame();
  const game = state.battle.game;
  game.isMyTurn = true;
  game.currentTurnPlayerId = state.playerId;
  game.enemy.hp = 999999;
  game.enemy.maxHp = 999999;
  setupSoloEnemyHand();
  setupSoloEnemyHandMatchPlayerV116();
  game.enemy.maxMp = 1;
  game.enemy.mp = 1;
  game.player.maxMp = 1;
  game.player.mp = 1;
  game.player.tension = 0;
  game.player.tensionUsedThisTurn = false;
  game.soloTestMode = true;
  game.soloActiveSide = 'player';
  battleLog('ソロ効果テスト部屋を開始しました。相手HPは実質∞です。');
  if($('battle-status')) $('battle-status').textContent = 'ソロ効果テスト中';
  $('battle-setup')?.classList.add('hidden');
  $('battle-arena')?.classList.remove('hidden');
  $('battle-arena')?.classList.add('solo-test-mode');
  $('solo-test-toggle')?.classList.remove('hidden');
  $('solo-test-panel')?.classList.remove('hidden');
  renderSoloCardResults();
  renderBattleArena();
}
function isSoloTestMode(){
  return !!state.battle.soloTestMode || !!state.battle.game?.soloTestMode;
}
function setSoloSelectedCard(cardId){
  state.battle.soloSelectedCardId = cardId;
  const card = byId(cardId);
  if($('solo-selected-card-label')) $('solo-selected-card-label').textContent = card ? `選択中：${card.name}` : 'カード未選択';
  renderSoloCardResults();
}
function soloCandidateCards(){
  const q = normalize($('solo-card-search')?.value || '');
  const important = ['あくまのカガミ','フォステイル','キラーマシン2','うずしおキング','グランマーズ','ロミア','フライングデス','スラリンガル','テンプテーション','分裂のツボ','覇海軍王ジャコラ','魔王の書','タロットフォーチュン','メルビン','怪獣プスゴン','墓所','デルカダール地下水路','占い小屋','武器屋','ライアン','家族の絆','冥界の霧','スラリンガル','セクシービーム','テンプテーション','デスマエストロ','フライングデス','覇海軍王ジャコラ','分裂のツボ','あくましんかん','ヒドラ'];
  let list = state.allCards.filter(c => c && c.cardType !== 'ヒーロー' && c.flags?.deckBuildable !== false);
  if(q) list = list.filter(c => normalize(`${c.name} ${c.text || ''} ${c.searchText || ''}`).includes(q));
  else list = list.filter(c => important.includes(c.name));
  return list.slice(0, 40).sort((a,b)=>(a.cost??0)-(b.cost??0)||a.name.localeCompare(b.name,'ja'));
}
function renderSoloCardResults(){
  const box = $('solo-card-results');
  if(!box) return;
  const list = soloCandidateCards();
  box.innerHTML = list.map(c => `<button data-id="${escapeHtml(c.id)}" class="${state.battle.soloSelectedCardId===c.id?'selected':''}">${escapeHtml(c.cost ?? 0)}｜${escapeHtml(c.name)}<small> ${escapeHtml(c.cardType || '')}</small></button>`).join('');
  box.querySelectorAll('button[data-id]').forEach(btn => btn.addEventListener('click', () => setSoloSelectedCard(btn.dataset.id)));
}
function getSoloSelectedCard(){
  const card = byId(state.battle.soloSelectedCardId);
  if(!card) toast('カードを選択してください。', false);
  return card;
}
function soloAddSelectedToHand(){ battleLog('v113: ソロパネルの手札追加ボタンは削除済みです。'); }

function soloAddSelectedToDeckTop(){ battleLog('v113: ソロパネルの山札トップ追加ボタンは削除済みです。'); }

function soloAddSelectedToEnemyHand(){ battleLog('v113: ソロパネルの相手手札追加ボタンは削除済みです。'); }

function soloSummonSelected(side='enemy'){ battleLog('v113: ソロパネルの盤面配置ボタンは削除済みです。下部手札ストリップを使ってください。'); }

function soloSetEnemyHpInfinite(){
  const game = state.battle.game; if(!game) return;
  game.enemy.hp = 999999; game.enemy.maxHp = 999999;
  battleLog('テスト：相手HPを∞にしました。');
  renderBattleArena();
}
function soloSetEnemyHpNormal(){
  const game = state.battle.game; if(!game) return;
  game.enemy.hp = 25; game.enemy.maxHp = 25;
  battleLog('テスト：相手HPを25に戻しました。');
  renderBattleArena();
}
function soloSetMpMax(){
  const game = state.battle.game; if(!game) return;
  game.player.maxMp = 10; game.player.mp = 10;
  battleLog('テスト：MPを10にしました。');
  renderBattleArena();
}
function soloSetTensionMax(){
  const game = state.battle.game; if(!game) return;
  game.player.tension = 0;
  battleLog('テスト：テンションMAX。');
  renderBattleArena();
}
function soloDrawCard(){ battleLog('v113: ソロパネルのドロー操作は削除済みです。'); }

function soloClearLog(){
  const game = state.battle.game; if(!game) return;
  game.log = [];
  renderBattleArena();
}

function soloResetEnemyHand(){ battleLog('v113: ソロパネルの相手手札リセットは削除済みです。'); }

function soloShowEnemyHand(){ battleLog('v113: ソロパネルの相手手札表示は削除済みです。下部ストリップを使ってください。'); }

function soloDamageEnemyAll(){ battleLog('v113: ソロパネルの敵全体ダメージは削除済みです。'); }

async function startMatch(){
  if(!state.battle.selectedDeck) return toast('先にデッキを選択してください。', false);
  const matchId = $('match-id-input').value.trim();
  if(!matchId) return toast('合言葉IDを入力してください。', false);

  const roomId = makeRoomId(matchId);
  cleanupBattleSubscriptions();
  state.battle.matchId = matchId;
  state.battle.roomId = roomId;
  state.battle.resultShown = false;
  state.battle.hasMatched = false;
  state.battle.startBannerShown = false;
  state.battle.lastTurnPlayerId = '';

  if(state.firebase.enabled && state.firebase.db){
    try{
      const roomRoot = ref(state.firebase.db, `rooms/${roomId}`);
      const metaRef = ref(state.firebase.db, `rooms/${roomId}/meta`);
      const oldMeta = (await get(metaRef)).val();
      if(isFinalRoomStatus(oldMeta?.status)){
        await remove(roomRoot);
      }

      const playersRef = ref(state.firebase.db, `rooms/${roomId}/players`);
      const playersSnap = await get(playersRef);
      const players = playersSnap.val() || {};
      const activePlayers = Object.values(players).filter(p => p && p.playerId && p.status === 'active');
      const alreadyIn = activePlayers.some(p => p.playerId === state.playerId);
      if(activePlayers.length >= 2 && !alreadyIn){
        toast('この合言葉の部屋は満員です。別のIDを使ってください。', false);
        state.battle.roomId = '';
        state.battle.matchId = '';
        return;
      }

      initLocalBattleGame();
      state.battle.game.isMyTurn = false;
      state.battle.game.currentTurnPlayerId = '';
      state.battle.matchLocked = true;

      await set(ref(state.firebase.db, `rooms/${roomId}/players/${state.playerId}`), {
        playerId: state.playerId,
        displayName: state.username || state.playerId,
        deckName: state.battle.selectedDeck.deckName,
        className: state.battle.selectedDeck.className,
        status: 'active',
        ready: true,
        joinedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastSeenMs: Date.now()
      });
      await markMyPresence(roomId);

      const joinedSnap = await get(playersRef);
      const joinedPlayers = Object.values(joinedSnap.val() || {}).filter(p => p && p.playerId && p.status === 'active');
      const ids = joinedPlayers.map(p => p.playerId).sort((a,b)=>a.localeCompare(b,'ja'));
      if(ids.length >= 2){
        const metaNow = (await get(metaRef)).val() || {};
        const firstPlayerId = metaNow.status === 'playing' && metaNow.firstPlayerId ? metaNow.firstPlayerId : chooseRandomFirstPlayerId(ids);
        await update(metaRef, {
          matchId,
          status:'playing',
          playerCount: ids.length,
          firstPlayerId,
          currentTurnPlayerId: firstPlayerId,
          startedAt: metaNow.startedAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }else{
        await update(metaRef, {
          matchId,
          status:'waiting',
          playerCount: ids.length,
          firstPlayerId: '',
          currentTurnPlayerId: '',
          updatedAt: serverTimestamp()
        });
      }

      subscribeRoomPlayers();
      await syncMyBattleState();
    }catch(e){
      console.warn(e);
      toast('マッチングに失敗しました: '+e.message, false);
      return;
    }
  }else{
    initLocalBattleGame();
  }

  $('battle-setup').classList.add('hidden');
  $('battle-arena').classList.remove('hidden');
  showWaitingForOpponent();
  renderBattleArena();
}

function subscribeRoomPlayers(){
  if(!state.firebase.enabled || !state.firebase.db || !state.battle.roomId) return;
  for(const unsub of state.battle.unsubs || []){
    try{ if(typeof unsub === 'function') unsub(); }catch(e){}
  }
  state.battle.unsubs = [];
  const roomId = state.battle.roomId;

  const playersRef = ref(state.firebase.db, `rooms/${roomId}/players`);
  const unsubPlayers = onValue(playersRef, async snap => {
    const players = snap.val() || {};
    state.battle.roomPlayers = players;
    const active = Object.values(players).filter(p => p && p.playerId && p.status === 'active');
    const others = active.filter(p => p.playerId !== state.playerId);
    if(!state.battle.game) return;

    const metaSnap = await get(ref(state.firebase.db, `rooms/${roomId}/meta`));
    const meta = metaSnap.val() || {};
    if(meta.status === 'waiting' && active.length >= 2){
      const ids = active.map(p => p.playerId).sort((a,b)=>a.localeCompare(b,'ja'));
      const firstPlayerId = chooseRandomFirstPlayerId(ids);
      await update(ref(state.firebase.db, `rooms/${roomId}/meta`), {
        status:'playing',
        playerCount: ids.length,
        firstPlayerId,
        currentTurnPlayerId: firstPlayerId,
        startedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return;
    }

    if(meta.status === 'playing' && state.battle.hasMatched && others.length === 0){
      await finishRoomAsWinner('opponent_left');
      return;
    }

    if(meta.status !== 'playing'){
      $('battle-status').textContent = '待機中・・・';
    }
    renderBattleLog();
  });
  state.battle.unsubs.push(unsubPlayers);

  const metaRef = ref(state.firebase.db, `rooms/${roomId}/meta`);
  const unsubMeta = onValue(metaRef, snap => {
    const meta = snap.val();
    if(!meta){
      if(state.battle.game && !state.battle.game.finished){
        const hadOpponent = !!getOpponentPlayerIdFromCache() || state.battle.hasMatched;
        showBattleResult(hadOpponent ? 'win' : 'lose', {
          autoReset: true,
          message: hadOpponent ? '相手が退出しました。勝利です。マッチング前に戻ります。' : '部屋が終了しました。マッチング前に戻ります。'
        });
      }
      return;
    }
    if(!state.battle.game) return;

    if(isFinalRoomStatus(meta.status)){
      const won = meta.winnerPlayerId === state.playerId || (meta.loserPlayerId && meta.loserPlayerId !== state.playerId);
      showBattleResult(won ? 'win' : 'lose', {
        autoReset: true,
        reason: meta.reason || 'finished',
        message: won ? '勝利です。マッチング前に戻ります。' : '敗北しました。マッチング前に戻ります。'
      });
      return;
    }

    if(meta.status === 'waiting'){
      state.battle.hasMatched = false;
      state.battle.matchLocked = true;
      state.battle.game.isMyTurn = false;
      $('battle-status').textContent = '待機中・・・';
      showWaitingForOpponent();
      renderBattleArena();
      return;
    }

    if(meta.status === 'playing'){
      const wasMatched = state.battle.hasMatched;
      const previousTurn = state.battle.lastTurnPlayerId;
      state.battle.hasMatched = true;
      const currentTurn = meta.currentTurnPlayerId || '';
      state.battle.game.currentTurnPlayerId = currentTurn;
      state.battle.game.isMyTurn = currentTurn === state.playerId;
      state.battle.lastTurnPlayerId = currentTurn;
      $('battle-status').textContent = state.battle.game.isMyTurn ? '自分のターン' : '相手のターン';

      if(!wasMatched || !state.battle.startBannerShown){
        state.battle.startBannerShown = true;
        const label = state.battle.game.isMyTurn ? '先攻' : '後攻';
        showBattleBanner(label, {duration:2000, lock:true, unlockAfter:state.battle.game.isMyTurn});
      }else if(previousTurn && previousTurn !== currentTurn && currentTurn === state.playerId){
        showBattleBanner('あなたのターン', {duration:2000, lock:true, unlockAfter:true});
      }else{
        state.battle.matchLocked = !state.battle.game.isMyTurn;
      }
      renderBattleArena();
    }
  });
  state.battle.unsubs.push(unsubMeta);

  const statesRef = ref(state.firebase.db, `rooms/${roomId}/states`);
  const unsubStates = onValue(statesRef, snap => {
    const states = snap.val() || {};
    state.battle.remoteStates = states;
    applyRemoteOpponentState(states);
  });
  state.battle.unsubs.push(unsubStates);
  subscribeBattleActions(roomId);
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
    handIds: game.player.hand,
    handCount: game.player.hand.length,
    deckCount: game.player.deck.length,
    lastEvent: game.events?.[game.events.length - 1] || null,
    eventCount: game.events?.length || 0,
    actionReplayReady: true,
    actionReducerReady: true,
    lastTargetSelected: game.events?.filter(e => e.type === 'targetSelected').slice(-1)[0] || null,
    lastChoiceSelected: game.events?.filter(e => e.type === 'choiceSelected').slice(-1)[0] || null,
    remoteActionCount: game.remoteActions?.length || 0,
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
  game.enemy.hand = normalizeRemoteHand(entry.handIds);
  game.enemy.handCount = entry.handCount ?? game.enemy.hand.length ?? game.enemy.handCount;
  if(!entry.actionReplayReady) game.enemy.board = normalizeRemoteBoard(entry.board);
  else game.enemy.board = mergeRemoteBoard(game.enemy.board, normalizeRemoteBoard(entry.board));
  game.enemy.actionReplayReady = !!entry.actionReplayReady;
  game.enemy.actionReducerReady = !!entry.actionReducerReady;
  game.enemy.remoteActionCount = Number(entry.remoteActionCount || 0);
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

function mergeRemoteBoard(current, remote){
  const out = Array(6).fill(null);
  for(let i=0;i<6;i++) out[i] = remote?.[i] || current?.[i] || null;
  return out;
}

function normalizeRemoteHand(handIds){
  if(Array.isArray(handIds)) return handIds.filter(Boolean);
  if(handIds && typeof handIds === 'object'){
    return Object.keys(handIds).sort((a,b)=>Number(a)-Number(b)).map(k => handIds[k]).filter(Boolean);
  }
  return [];
}

async function advanceTurnToOpponent(){
  if(!state.firebase.enabled || !state.firebase.db || !state.battle.roomId) return;
  const playersSnap = await get(ref(state.firebase.db, `rooms/${state.battle.roomId}/players`));
  const players = playersSnap.val() || {};
  const ids = Object.values(players).filter(p => p && p.playerId && p.status === 'active').map(p => p.playerId).sort((a,b)=>a.localeCompare(b,'ja'));
  if(ids.length < 2) return;
  const next = ids.find(id => id !== state.playerId) || ids[0];
  state.battle.matchLocked = true;
  showBattleBanner('ターン終了', {duration:2000, lock:true, unlockAfter:false});
  await update(ref(state.firebase.db, `rooms/${state.battle.roomId}/meta`), {
    currentTurnPlayerId: next,
    lastTurnEndedBy: state.playerId,
    updatedAt: serverTimestamp()
  });
}

function showBattleResult(result, options={}){
  const game = state.battle.game;
  if(game) game.finished = true;
  if(state.battle.resultShown && !options.force) return;
  state.battle.resultShown = true;
  const isWin = result === 'win';
  $('battle-result-title').textContent = isWin ? '勝利' : '敗北';
  $('battle-result-message').textContent = options.message || (options.autoReset ? 'まもなくマッチング前に戻ります' : 'タップしてマッチング前に戻る');
  $('battle-result-overlay').classList.toggle('lose', !isWin);
  $('battle-result-overlay').classList.remove('hidden');
  if(options.autoReset){
    if(state.battle.resultTimer) clearTimeout(state.battle.resultTimer);
    state.battle.resultTimer = setTimeout(resetAfterBattleResult, options.delay || 2400);
  }
}

function resetAfterBattleResult(){
  $('battle-result-overlay').classList.add('hidden');
  const arena = $('battle-arena');
  const setup = $('battle-setup');
  if(arena){ arena.classList.add('hidden'); arena.classList.remove('solo-test-mode'); }
  if(setup) setup.classList.remove('hidden');
  $('battle-status').textContent = '待機中';
  resetBattleLocalState();
  renderBattleDeckList();
}

async function leaveBattleAsDefeat(){
  const roomId = state.battle.roomId;
  $('battle-exit-modal').close();
  if(!roomId){
    if(isSoloTestMode()){
      $('battle-exit-modal').close();
      $('battle-arena')?.classList.add('hidden');
      $('battle-setup')?.classList.remove('hidden');
      resetBattleLocalState();
      renderBattleDeckList();
      return;
    }
    showBattleResult('lose', {autoReset:true, message:'退出しました。マッチング前に戻ります。'});
    return;
  }

  if(state.firebase.enabled && state.firebase.db){
    try{
      const playersSnap = await get(ref(state.firebase.db, `rooms/${roomId}/players`));
      const players = playersSnap.val() || {};
      state.battle.roomPlayers = players;
      const opponent = Object.values(players).find(p => p && p.playerId && p.playerId !== state.playerId && p.status === 'active');
      await update(ref(state.firebase.db, `rooms/${roomId}/players/${state.playerId}`), {
        status: 'defeated',
        leftAt: serverTimestamp()
      });
      await update(ref(state.firebase.db, `rooms/${roomId}/meta`), {
        status: 'finished',
        winnerPlayerId: opponent?.playerId || '',
        loserPlayerId: state.playerId,
        reason: 'forfeit',
        endedBy: state.playerId,
        endedAt: serverTimestamp(),
        currentTurnPlayerId: null
      });
      await removeBattleRoomLater(roomId, 4500);
    }catch(e){ console.warn(e); }
  }
  showBattleResult('lose', {autoReset:true, message:'退出しました。マッチング前に戻ります。'});
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
      buildingsPlayed: 0,
      delayedReturnUnits: [],
      turnAuras: [],
      leaderSkill: getBaseTensionSkill(className),
      heroSkill: null,
      heroLevel: 0,
      deck: deckList,
      hand,
      board: Array(6).fill(null),
      dungeonsCleared: 0,
      proficiency: {},
      fortuneMode: '',
      terrainEffectsUsed: []
    },
    terrain: Array(6).fill(null),
    enemyTerrain: Array(6).fill(null),
    enemy: {
      hp: 25,
      maxHp: 25,
      maxMp: 1,
      mp: 1,
      tension: 0,
      powerfulBadges: [],
      hand: [],
      handCount: 0,
      board: makeDummyEnemyBoard()
    },
    log: [],
    events: []
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
    id: `${card.id}_${Date.now()}_${safeRandomId('rnd').slice(0,8)}`,
    cardId: card.id,
    name: card.name,
    attack: Number(card.attack ?? 0),
    hp: Number(card.hp ?? 1),
    maxHp: Number(card.hp ?? 1),
    _baseAttack: Number(card.attack ?? 0),
    _baseHp: Number(card.hp ?? 1),
    statuses: [],
    canAttack: false,
    summoningSickness: true,
    keywords: parseKeywordFlags(card),
    _baseKeywords: parseKeywordFlags(card),
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
  card = { id, name:def.name, cost:def.cost ?? 0, attack:def.attack ?? 0, hp:def.hp ?? 0, cardType:def.cardType || '特技', rarity:def.rarity || 'トークン', text:def.text || '', classes:def.classes || ['共通'], tribes:def.tribes || [], tags:def.tags || [def.cardType || '特技'], flags:{deckBuildable:def.deckBuildable === true}, localImage:def.localImage || CUSTOM_CARD_IMAGES[def.name] || '', official:def.official || {}, virtualEffect:def.effect || null };
  state.allCards.push(card);
  return card;
}
function addCardToHandByName(name){
  const card = findCardByName(name);
  if(card) return addCardIdToPlayerHandV110(card.id, name);
  return false;
}

function isAdventurer(card){ return isAdventurerCard2(card); }
function isDemon(card){ return isDemonKingCard(card); }

function cardTribes(card){
  const out = new Set();
  if(!card) return out;
  const normalize = (value) => {
    const s = String(value || '').trim().replace(/系$/,'');
    if(!s || s === 'なし' || s === '系統なし' || s === '系統分類対象外') return '';
    if(s === '魔王系') return '魔王';
    return s;
  };
  const add = (value) => {
    const s = normalize(value);
    if(['スライム','ゾンビ','ドラゴン','魔王','冒険者','英雄'].includes(s)) out.add(s);
  };
  const raw = card.tribes;
  if(Array.isArray(raw)) raw.forEach(add);
  else add(raw);
  add(card.tribe);
  if(Array.isArray(card.tags)){
    for(const tag of card.tags){
      const s = String(tag || '').trim();
      // タグは完全一致だけを系統として扱う。効果文・検索文からの推測はしない。
      if(['スライム系','ゾンビ系','ドラゴン系','魔王系','冒険者系','英雄系','スライム','ゾンビ','ドラゴン','魔王','冒険者','英雄'].includes(s)) add(s);
    }
  }
  if(Array.isArray(card.treatedAsTribes)){
    card.treatedAsTribes.forEach(add);
  }
  return out;
}
function isTribeCard(card, tribe){
  if(!card) return false;
  const normalized = String(tribe || '').replace(/系$/,'');
  const ts = cardTribes(card);
  if(ts.has(normalized)) return true;
  if(normalized === '魔王' && ts.has('魔王系')) return true;
  return false;
}
function isSlimeCard(card){ return isTribeCard(card, 'スライム'); }
function isZombieCard(card){ return isTribeCard(card, 'ゾンビ'); }
function isDragonCard(card){ return isTribeCard(card, 'ドラゴン'); }
function isAdventurerCard2(card){ return isTribeCard(card, '冒険者'); }
function isDemonKingCard(card){ return isTribeCard(card, '魔王'); }

function countOwnBoardAndHandByTribe(tribe, excludeUnit=null, excludeCardId=''){
  const game = state.battle.game;
  let count = 0;
  for(const u of game.player.board){
    if(!u || u === excludeUnit || u.isBuilding) continue;
    if(isTribeCard(byId(u.cardId), tribe)) count++;
  }
  for(const id of game.player.hand){
    if(id === excludeCardId) continue;
    if(isTribeCard(byId(id), tribe)) count++;
  }
  return count;
}
function friendlyUnitsByTribe(tribe, excludeUnit=null){
  const game = state.battle.game;
  return game.player.board.filter(u => u && !u.isBuilding && u !== excludeUnit && isTribeCard(byId(u.cardId), tribe));
}
function tribeFromText(text){
  const m = String(text || '').match(/(スライム|ゾンビ|ドラゴン|魔王|冒険者|英雄)系?/);
  return m ? m[1] : '';
}

// v157: 系統常在効果 / パワフルバッジ基盤
// 方針：召喚時は召喚時点の場だけに直接付与、召喚時でない系統強化は場にいる間だけの継続補正、パワフルバッジはプレイヤー側の永続ステータスとして扱う。
const TRIBE_EFFECT_NAMES_V157 = ['スライム','ゾンビ','ドラゴン','冒険者','魔王'];
function sideObjV157(side='player'){
  const game = state.battle.game;
  return side === 'enemy' ? game.enemy : game.player;
}
function sideBoardV157(side='player'){
  return sideObjV157(side)?.board || [];
}
function normalizeTribeV157(t){
  const s = String(t || '').trim().replace(/系$/,'');
  if(s === '魔王系') return '魔王';
  return s;
}
function unitHasTribeV157(unit, tribe){
  if(!unit || unit.isBuilding) return false;
  return isTribeCard(byId(unit.cardId), normalizeTribeV157(tribe));
}
function modifierStoreV157(unit){
  unit._continuousModifiers ||= {};
  unit._keywordModifierGrants ||= {};
  unit._baseKeywords ||= {...(unit.keywords || {})};
  return unit._continuousModifiers;
}
function removeUnitModifierV157(unit, key){
  if(!unit?._continuousModifiers?.[key]) return false;
  const mod = unit._continuousModifiers[key];
  const a = Number(mod.attack || 0), h = Number(mod.hp || 0);
  unit.attack = Number(unit.attack || 0) - a;
  unit.maxHp = Math.max(0, Number(unit.maxHp || 0) - h);
  unit.hp = Math.min(Number(unit.hp || 0) - h, Number(unit.maxHp || 0));
  if(unit.hp < 0) unit.hp = 0;
  for(const kw of Object.keys(mod.keywords || {})){
    unit._keywordModifierGrants[kw] ||= new Set();
    unit._keywordModifierGrants[kw].delete(key);
    if(unit._keywordModifierGrants[kw].size === 0 && mod.addedKeywords?.[kw]){
      unit.keywords ||= {};
      unit.keywords[kw] = !!unit._baseKeywords?.[kw];
    }
  }
  delete unit._continuousModifiers[key];
  return true;
}
function applyUnitModifierV157(unit, key, spec={}, source='効果'){
  if(!unit || unit.isBuilding) return false;
  removeUnitModifierV157(unit, key);
  const store = modifierStoreV157(unit);
  const a = Number(spec.attack || 0), h = Number(spec.hp || 0);
  const keywords = spec.keywords || {};
  const addedKeywords = {};
  unit.attack = Number(unit.attack || 0) + a;
  unit.maxHp = Number(unit.maxHp || 0) + h;
  unit.hp = Number(unit.hp || 0) + h;
  unit.keywords ||= {};
  for(const [kw,val] of Object.entries(keywords)){
    if(!val) continue;
    unit._keywordModifierGrants ||= {};
    unit._keywordModifierGrants[kw] ||= new Set();
    if(!unit.keywords[kw]) addedKeywords[kw] = true;
    unit.keywords[kw] = true;
    unit._keywordModifierGrants[kw].add(key);
    if(kw === 'haste'){
      unit.canAttack = true;
      unit.summoningSickness = false;
    }
  }
  if(spec.spellDamageImmune) unit.spellDamageImmune = true;
  store[key] = {attack:a, hp:h, keywords, addedKeywords, source};
  return true;
}
function removeModifiersByPrefixV157(unit, prefix){
  if(!unit?._continuousModifiers) return;
  for(const key of Object.keys(unit._continuousModifiers)){
    if(key.startsWith(prefix)) removeUnitModifierV157(unit, key);
  }
}
function keywordTextToFlagsV157(text){
  const out = {};
  if(/速攻/.test(text)) out.haste = true;
  if(/超貫通/.test(text)) out.superPiercing = true;
  else if(/貫通/.test(text)) out.piercing = true;
  if(/におうだち/.test(text)) out.taunt = true;
  if(/ねらい撃ち/.test(text)) out.snipe = true;
  if(/ステルス/.test(text)) out.stealth = true;
  return out;
}
function splitEffectSentencesV157(text){
  return String(text || '').replace(/：/g, '：').split(/[。\n]/).map(s => s.trim()).filter(Boolean);
}
function isTriggeredSentenceV157(sentence){
  return /(召喚時|死亡時|攻撃時|テンションリンク|スキルリンク|れんけい|BET|GET|ターン終了時|ターン開始時|使う度|場に出る度|死亡した時|攻撃した後|この武器が壊れた時)/.test(sentence);
}
function parseContinuousTribeAuraSpecsV157(text){
  const specs = [];
  for(const sentence of splitEffectSentencesV157(text)){
    if(/パワフルバッジ/.test(sentence)) continue;
    if(isTriggeredSentenceV157(sentence)) continue;
    const excludeSelf = /(このユニットを除く|自分以外)/.test(sentence);
    let m;
    const rxAll = new RegExp(`(?:このユニットを除く|自分以外の)?(?:味方の|自分の)?(${TRIBE_EFFECT_NAMES_V157.join('|')})系?(?:の)?味方?ユニット(?:全て|すべて|全員)?を[+＋](\\d+)\\/[+＋]?(\\d+)`);
    m = sentence.match(rxAll);
    if(m){ specs.push({tribe:m[1], attack:Number(m[2]), hp:Number(m[3]), excludeSelf, text:sentence}); continue; }
    const rxAtk = new RegExp(`(?:このユニットを除く|自分以外の)?(?:味方の|自分の)?(${TRIBE_EFFECT_NAMES_V157.join('|')})系?(?:の)?味方?ユニット(?:全て|すべて|全員)?の攻撃力[+＋](\\d+)`);
    m = sentence.match(rxAtk);
    if(m){ specs.push({tribe:m[1], attack:Number(m[2]), hp:0, excludeSelf, text:sentence}); continue; }
    const rxHp = new RegExp(`(?:このユニットを除く|自分以外の)?(?:味方の|自分の)?(${TRIBE_EFFECT_NAMES_V157.join('|')})系?(?:の)?味方?ユニット(?:全て|すべて|全員)?のHP[+＋](\\d+)`);
    m = sentence.match(rxHp);
    if(m){ specs.push({tribe:m[1], attack:0, hp:Number(m[2]), excludeSelf, text:sentence}); continue; }
    const rxKw = new RegExp(`(?:このユニットを除く|自分以外の)?(?:味方の|自分の)?(${TRIBE_EFFECT_NAMES_V157.join('|')})系?(?:の)?味方?ユニット(?:全て|すべて|全員)?は(.+?)(?:を得る|を受けない|になる|$)`);
    m = sentence.match(rxKw);
    if(m){
      specs.push({tribe:m[1], attack:0, hp:0, keywords:keywordTextToFlagsV157(m[2]), spellDamageImmune:/特技ダメージを受けない/.test(sentence), excludeSelf, text:sentence});
    }
  }
  return specs;
}
function refreshContinuousTribeAurasV157(side='player'){
  const board = sideBoardV157(side);
  for(const unit of board){ if(unit) removeModifiersByPrefixV157(unit, 'aura:'); }
  for(const sourceUnit of board){
    if(!sourceUnit || sourceUnit.isBuilding || isSealed(sourceUnit)) continue;
    const sourceCard = byId(sourceUnit.cardId);
    const specs = parseContinuousTribeAuraSpecsV157(getCardText(sourceCard));
    specs.forEach((spec, idx) => {
      for(const target of board){
        if(!target || target.isBuilding) continue;
        if(spec.excludeSelf && target.id === sourceUnit.id) continue;
        if(!unitHasTribeV157(target, spec.tribe)) continue;
        applyUnitModifierV157(target, `aura:${sourceUnit.id}:${idx}`, spec, sourceCard?.name || sourceUnit.name || '常在効果');
      }
    });
  }
}
function parsePowerfulBadgeSpecV157(text){
  const raw = String(text || '');
  const body = raw.split(/パワフルバッジ[:：]/)[1] || raw;
  const tribe = normalizeTribeV157((body.match(/(スライム|ゾンビ|ドラゴン|冒険者|魔王)系?/) || [,''])[1]);
  const spec = {tribe, attack:0, hp:0, keywords:{}, triggers:[], handCostDelta:0, text:body};
  let m = body.match(/攻撃力[+＋](\d+)/); if(m) spec.attack += Number(m[1]);
  m = body.match(/HP[+＋](\d+)/); if(m) spec.hp += Number(m[1]);
  m = body.match(/[+＋](\d+)\/[+＋]?(\d+)/); if(m){ spec.attack += Number(m[1]); spec.hp += Number(m[2]); }
  spec.keywords = keywordTextToFlagsV157(body);
  if(/特技ダメージを受けない/.test(body)) spec.spellDamageImmune = true;
  m = body.match(/手札にある.*?(スライム|ゾンビ|ドラゴン|冒険者|魔王)系?.*?ユニットカードのコスト[-－−](\d+)/);
  if(m){ spec.handCostTribe = normalizeTribeV157(m[1]); spec.handCostDelta = -Number(m[2]); }
  if(/ユニットカードを使う度/.test(body)){
    if(/HPを(\d+)回復/.test(body)) spec.triggers.push({event:'cardPlayed', tribe, kind:'healLeader', amount:Number((body.match(/HPを(\d+)回復/)||[])[1]||1)});
    if(/敵リーダーに(\d+)ダメージ/.test(body)) spec.triggers.push({event:'cardPlayed', tribe, kind:'damageEnemyLeader', amount:Number((body.match(/敵リーダーに(\d+)ダメージ/)||[])[1]||1)});
    if(/テンション[+＋](\d+)/.test(body)) spec.triggers.push({event:'cardPlayed', tribe, kind:'gainTension', amount:Number((body.match(/テンション[+＋](\d+)/)||[])[1]||1)});
    if(/MPが(\d+)回復/.test(body)) spec.triggers.push({event:'cardPlayed', tribe, kind:'recoverMp', amount:Number((body.match(/MPが(\d+)回復/)||[])[1]||1)});
    if(/武器の攻撃力[-－−](\d+)/.test(body)) spec.triggers.push({event:'cardPlayed', tribe, kind:'enemyWeaponAttackMinus', amount:Number((body.match(/武器の攻撃力[-－−](\d+)/)||[])[1]||1)});
  }
  if(/ターン終了時/.test(body)){
    if(/[+＋](\d+)\/[+＋]?(\d+)/.test(body)){
      const mm = body.match(/[+＋](\d+)\/[+＋]?(\d+)/);
      spec.triggers.push({event:'turnEnd', tribe, kind:'buffBoard', attack:Number(mm[1]), hp:Number(mm[2])});
    }
  }
  return spec;
}
function registerPowerfulBadgeV157(card, unit=null, side='player'){
  const obj = sideObjV157(side);
  obj.powerfulBadges ||= [];
  const text = getCardText(card);
  const existing = obj.powerfulBadges.find(b => b.source === card.name && b.text === text);
  if(existing) return false;
  obj.powerfulBadges.push({
    id:`badge_${Date.now()}_${safeRandomId('badge').slice(0,8)}`,
    source:card.name,
    sourceCardId:card.id,
    sourceUnitId:unit?.id || '',
    text,
    spec:parsePowerfulBadgeSpecV157(text),
    active:true
  });
  battleLog(`パワフルバッジ：${card.name}の効果が付与されました。`);
  applyPowerfulBadges(side);
  return true;
}
function removePowerfulBadgesV157(side='enemy', count=1, source='効果'){
  const obj = sideObjV157(side);
  obj.powerfulBadges ||= [];
  const active = obj.powerfulBadges.filter(b => b?.active !== false);
  if(!active.length){ battleLog(`${source}：消せるパワフルバッジはありません。`); return 0; }
  let removed = 0;
  while(active.length && removed < count){
    const i = Math.floor(Math.random() * active.length);
    const [b] = active.splice(i, 1);
    b.active = false;
    removed++;
    battleLog(`${source}：${side === 'enemy' ? '相手' : '味方'}のパワフルバッジ「${b.source}」を消しました。`);
  }
  applyPowerfulBadges(side);
  return removed;
}
function applyPowerfulBadges(side='player'){
  const obj = sideObjV157(side);
  const board = sideBoardV157(side);
  for(const unit of board){ if(unit) removeModifiersByPrefixV157(unit, 'badge:'); }
  for(const badge of obj?.powerfulBadges || []){
    if(!badge || badge.active === false) continue;
    badge.spec ||= parsePowerfulBadgeSpecV157(badge.text);
    const spec = badge.spec;
    // 「使う度」「手札コスト」だけのバッジは盤面補正なし。
    if(!spec.attack && !spec.hp && !Object.values(spec.keywords || {}).some(Boolean) && !spec.spellDamageImmune) continue;
    for(const unit of board){
      if(!unit || unit.isBuilding) continue;
      if(spec.tribe && !unitHasTribeV157(unit, spec.tribe)) continue;
      applyUnitModifierV157(unit, `badge:${badge.id}`, spec, badge.source);
    }
  }
}
function getPowerfulBadgeCostDeltaV157(card, side='player'){
  const obj = sideObjV157(side);
  let delta = 0;
  for(const badge of obj?.powerfulBadges || []){
    if(!badge || badge.active === false) continue;
    badge.spec ||= parsePowerfulBadgeSpecV157(badge.text);
    const spec = badge.spec;
    if(!spec.handCostDelta) continue;
    if(card.cardType !== 'ユニット') continue;
    if(spec.handCostTribe && !isTribeCard(card, spec.handCostTribe)) continue;
    delta += Number(spec.handCostDelta || 0);
  }
  return delta;
}
function triggerPowerfulBadgeCardPlayedV157(card, side='player'){
  if(!card || card.cardType !== 'ユニット') return;
  const obj = sideObjV157(side);
  const opponent = side === 'enemy' ? 'player' : 'enemy';
  for(const badge of obj?.powerfulBadges || []){
    if(!badge || badge.active === false) continue;
    badge.spec ||= parsePowerfulBadgeSpecV157(badge.text);
    for(const tr of badge.spec.triggers || []){
      if(tr.event !== 'cardPlayed') continue;
      if(tr.tribe && !isTribeCard(card, tr.tribe)) continue;
      if(tr.kind === 'healLeader') healLeader(tr.amount);
      if(tr.kind === 'damageEnemyLeader') dealDamageToLeader(opponent, tr.amount, badge.source);
      if(tr.kind === 'gainTension') gainTension(tr.amount, badge.source);
      if(tr.kind === 'recoverMp') obj.mp = Math.min(Number(obj.maxMp || 0), Number(obj.mp || 0) + Number(tr.amount || 0));
      if(tr.kind === 'enemyWeaponAttackMinus'){
        const enemyObj = sideObjV157(opponent);
        if(enemyObj.weapon){ enemyObj.weapon.attack = Math.max(0, Number(enemyObj.weapon.attack || 0) - Number(tr.amount || 0)); }
      }
      battleLog(`パワフルバッジ：${badge.source}が発動しました。`);
    }
  }
}
function triggerPowerfulBadgeTurnEndV157(side='player'){
  const obj = sideObjV157(side);
  for(const badge of obj?.powerfulBadges || []){
    if(!badge || badge.active === false) continue;
    badge.spec ||= parsePowerfulBadgeSpecV157(badge.text);
    for(const tr of badge.spec.triggers || []){
      if(tr.event !== 'turnEnd') continue;
      let n = 0;
      for(const unit of sideBoardV157(side)){
        if(!unit || unit.isBuilding) continue;
        if(tr.tribe && !unitHasTribeV157(unit, tr.tribe)) continue;
        buffUnitV133(unit, tr.attack || 0, tr.hp || 0, badge.source);
        n++;
      }
      if(n) battleLog(`パワフルバッジ：${badge.source}で${n}体を強化しました。`);
    }
  }
}
function refreshContinuousBoardEffectsV157(side='player'){
  refreshContinuousTribeAurasV157(side);
  applyPowerfulBadges(side);
}

function isSpell(card){ return card?.cardType === '特技'; }

// v123: deck bottom correctness, robust weapon rules, single counter damage
function isWeaponV123(card){
  if(!card) return false;
  const name = String(card.name || '');
  const tagText = Array.isArray(card.tags) ? card.tags.join(' ') : String(card.tags || '');
  const reason = JSON.stringify(card.flags || {});
  if(card.cardType === '武器') return true;
  if(card.flags?.nonDeckCategory === 'generated_weapon') return true;
  if(reason.includes('generated_weapon')) return true;
  if(tagText.includes('武器')) return true;
  const weaponNames = ['こんぼう','パパスの剣','じごくのサーベル','おうごんのつめ','はがねのつるぎ','雷鳴の剣','福招きのそろばん','むげんの弓','きせきのつるぎ','はじゃのつるぎ','さんぞくのサーベル'];
  return weaponNames.includes(name);
}
function moveDeckTopToBottomOptionalV123(side='player', source='効果', opts={}){
  const game = state.battle.game;
  const obj = side === 'enemy' ? game.enemy : game.player;
  obj.deck ||= [];
  const topId = obj.deck[0];
  const top = byId(topId);
  if(!top){
    battleLog(`${source}：${side === 'enemy' ? '相手' : '自分'}山札がありません。`);
    if(opts.drawAfter) drawForSideV114(side, 1);
    return false;
  }
  openChoiceModal(`${source}：${top.name}`, ['一番下に送る','そのまま上に戻す'], (picked, i)=>{
    if(i === 0){
      const moved = obj.deck.shift();
      obj.deck.push(moved);
      battleLog(`${source}：${top.name}を${side === 'enemy' ? '相手' : '自分'}デッキの一番下へ移動しました。`);
    }else{
      battleLog(`${source}：${top.name}を${side === 'enemy' ? '相手' : '自分'}デッキの一番上に戻しました。`);
    }
    if(opts.drawAfter){
      if(side === 'player') game.skipNextDrawForOracleV123 = false;
      if(side === 'enemy') game.enemy.skipNextDrawForOracleV123 = false;
      drawForSideV114(side, 1);
    }
    renderBattleArena(); syncMyBattleState();
  }, {kind:'topDeckMoveChoiceV123', source, side});
  return true;
}
function consumeWeaponDurabilityAfterLeaderAttackV123(side='player'){
  const game = state.battle.game;
  const obj = side === 'enemy' ? game.enemy : game.player;
  const w = obj.weapon;
  if(!w) return;
  if(!(side === 'player' && game.player.leaderNoWeaponDurabilityLoss)){
    w.durability = Math.max(0, Number(w.durability || 0) - 1);
    battleLog(`${w.name}：攻撃後、耐久値-1 (${w.durability}/${w.maxDurability})。`);
  }
  w.attacksLeft = Math.max(0, Number(w.attacksLeft ?? 1) - 1);
  emitBattleEvent('weaponAfterAttack', {side, weapon:w});
  if(side === 'player') applyWeaponAfterAttack(w);
  if(w.durability <= 0){
    emitBattleEvent('weaponBroken', {side, weapon:w});
    if(side === 'player') applyWeaponBreakEffect(w);
    obj.weapon = null;
    obj.leaderAttack = 0;
    obj.leaderCanAttack = false;
    battleLog(`${side === 'enemy' ? '相手' : '自分'}の${w.name}が壊れました。`);
  }else{
    if(side === 'player') refreshLeaderAttackFromWeaponV111('player');
    else {
      obj.leaderAttack = Number(w.attack || 0);
      obj.leaderCanAttack = Number(w.attack || 0) > 0 && Number(w.attacksLeft || 0) > 0;
    }
  }
}
function applyCounterDamageV123(attacker, attackerRef, defender, defenderRef){
  if(!attacker || !defender || defender.isBuilding) return;
  const counter = Math.max(0, Number(defender.attack || 0));
  if(counter <= 0) return;
  const noCounter = !!(attacker.noCounter || attacker.keywords?.noCounter || (attackerRef.side === 'playerLeader' && state.battle.game.player.weapon?.noCounter) || (attackerRef.side === 'enemyLeader' && state.battle.game.enemy.weapon?.noCounter));
  if(noCounter) return;
  if(attackerRef.side === 'playerLeader'){
    dealDamageToLeader('player', counter, `${defender.name}の反撃`);
    battleLog(`反撃：味方リーダーが${counter}ダメージ。`);
  }else if(attackerRef.side === 'enemyLeader'){
    dealDamageToLeader('enemy', counter, `${defender.name}の反撃`);
    battleLog(`反撃：敵リーダーが${counter}ダメージ。`);
  }else{
    dealDamageToUnit(attacker, counter, `${defender.name}の反撃`, attackerRef.side);
    battleLog(`反撃：${attacker.name}が${counter}ダメージ。`);
  }
}

function isWeapon(card){ return isWeaponV123(card); }
function isBet(card){ return String(card?.text || card?.searchText || '').includes('BET'); }
function getEffectiveCost(card){
  const game = state.battle.game;
  if(!card) return 0;
  if(game?.player?.costOverrides?.[card.id] != null) return Math.max(0, game.player.costOverrides[card.id]);
  const delta = Number(game?.player?.costOverrides?.globalDelta || 0);
  const nextUnitDelta = card.cardType === 'ユニット' ? Number(game?.player?.nextUnitCostDelta || 0) : 0;
  const nextSpellDelta = isSpell(card) ? Number(game?.player?.nextSpellCostDelta || 0) : 0;
  let dynamicDelta = nextSpellDelta + (isSpell(card) ? Number(game?.player?.thisTurnSpellCostDelta || 0) : 0);
  dynamicDelta += getPowerfulBadgeCostDeltaV157(card, 'player');
  const nextDiscounts = game?.player?.nextCardDiscounts || [];
  for(const d of [...nextDiscounts]){
    let ok = true;
    if(d.cardType && card.cardType !== d.cardType) ok = false;
    if(d.tribe && !isTribeCard(card, d.tribe)) ok = false;
    if(d.minBaseCost != null && Number(card.cost || 0) < Number(d.minBaseCost)) ok = false;
    if(ok && d.until === 'turnEnd') dynamicDelta -= Number(d.amount || 0);
  }
  const text = getCardText(card);
  if(text.includes('スキルブースト') && text.includes('コスト-')){
    const m = text.match(/コスト[-－−](\d+)/);
    dynamicDelta -= Number(m?.[1] || 1) * Number(game?.player?.tensionSkillUseCount || 0);
  }
  if(text.includes('シンクロ') && text.includes('召喚コスト-') && getHeroLevel() >= 2){
    const m = text.match(/召喚コスト[-－−](\d+)/);
    dynamicDelta -= Number(m?.[1] || 2);
  }
  const tribeCost = text.match(/自分の場と手札にいる(スライム|ゾンビ|ドラゴン|魔王|冒険者|英雄)系?の数だけコストが下がる/);
  if(tribeCost) dynamicDelta -= countOwnBoardAndHandByTribe(tribeCost[1], null, card.id);
  if(text.includes('対戦中に味方リーダーが攻撃した回数分コスト-')) dynamicDelta -= Number(game?.player?.leaderAttackCount || 0);
  if(text.includes('自分が味方にさくせんを出した回数分手札のこのカードのコスト-')) dynamicDelta -= Number(game?.player?.strategyCount || 0);
  if(text.includes('このターン中に使った占いカードの枚数分デッキと手札にあるこのカードのコスト-')) dynamicDelta -= Number(game?.player?.fortuneCardsUsedThisTurn || 0);
  if(text.includes('このターン中死亡したユニットの数分手札にあるこのカードのコスト-')) dynamicDelta -= Number(game?.player?.unitsDiedThisTurn || 0);
  return Math.max(0, Number(card.cost || 0) + delta + nextUnitDelta + dynamicDelta);
}

// v158: visible modifier overlays for board cards, hand cards, and zoomed cards.
// 画像そのものは書き換えず、現在値と本来値の差分だけを上に重ねる。
function signedDeltaTextV158(value){
  const n = Number(value || 0);
  if(!n) return '';
  return `${n > 0 ? '+' : ''}${n}`;
}
function baseCardAttackV158(card, unit=null){
  if(unit?._baseAttack != null) return Number(unit._baseAttack || 0);
  return Number(card?.attack ?? 0);
}
function baseCardHpV158(card, unit=null){
  if(unit?._baseHp != null) return Number(unit._baseHp || 0);
  return Number(card?.hp ?? card?.health ?? 0);
}
function baseCardDurabilityV158(card, unit=null){
  if(unit?._baseDurability != null) return Number(unit._baseDurability || 0);
  const text = getCardText(card);
  const dungeon = text.match(/耐久値\s*(\d+)/);
  if(dungeon) return Number(dungeon[1] || 0);
  return Number(card?.hp || card?.durability || card?.attack || 0);
}
function statModifierDisplayV158(card, unit){
  if(!card || !unit) return {attackText:'', hpText:'', hpKind:'HP'};
  const attackDelta = unit.isBuilding ? 0 : Number(unit.attack || 0) - baseCardAttackV158(card, unit);
  let hpDelta = 0;
  let hpKind = 'HP';
  if(unit.isBuilding){
    hpKind = '耐久';
    const currentMax = Number(unit.maxDurability ?? unit.maxHp ?? unit.durability ?? 0);
    hpDelta = currentMax - baseCardDurabilityV158(card, unit);
  }else{
    hpDelta = Number(unit.maxHp ?? unit.hp ?? 0) - baseCardHpV158(card, unit);
  }
  return {
    attackText: signedDeltaTextV158(attackDelta),
    hpText: signedDeltaTextV158(hpDelta),
    hpKind
  };
}
function statModifierClassV158(text){
  if(!text) return '';
  return String(text).startsWith('-') ? ' negative' : ' positive';
}
function handCostModifierTextV158(card){
  if(!card) return '';
  const base = Number(card.cost || 0);
  const effective = getEffectiveCost(card);
  const delta = Number(effective || 0) - base;
  return delta < 0 ? signedDeltaTextV158(delta) : '';
}
function renderBoardModifierOverlaysV158(card, unit){
  const mod = statModifierDisplayV158(card, unit);
  const atk = mod.attackText ? `<span class="unit-stat-mod unit-atk-mod${statModifierClassV158(mod.attackText)}">${escapeHtml(mod.attackText)}</span>` : '';
  const hp = mod.hpText ? `<span class="unit-stat-mod unit-hp-mod${statModifierClassV158(mod.hpText)}" title="${escapeHtml(mod.hpKind)}補正">${escapeHtml(mod.hpText)}</span>` : '';
  return atk + hp;
}
function renderHandCostOverlayV158(card){
  const text = handCostModifierTextV158(card);
  return text ? `<span class="hand-cost-mod${statModifierClassV158(text)}">${escapeHtml(text)}</span>` : '';
}
function updateBattleCardZoomModifiersV158(card, context={}){
  const atkEl = $('battle-card-zoom-atk-mod');
  const hpEl = $('battle-card-zoom-hp-mod');
  const costEl = $('battle-card-zoom-cost-mod');
  const setText = (el, text, title='') => {
    if(!el) return;
    el.textContent = text || '';
    el.hidden = !text;
    el.classList.toggle('negative', !!text && String(text).startsWith('-'));
    el.classList.toggle('positive', !!text && !String(text).startsWith('-'));
    if(title) el.title = title;
  };
  const mod = context?.unit ? statModifierDisplayV158(card, context.unit) : {attackText:'', hpText:'', hpKind:'HP'};
  setText(atkEl, mod.attackText);
  setText(hpEl, mod.hpText, `${mod.hpKind || 'HP'}補正`);
  setText(costEl, context?.hand ? handCostModifierTextV158(card) : '');
}

function emitDamageApplied(targetRef, amount, actual, source='effect'){
  if(state.battle.processingRemoteAction) return;
  emitBattleEvent('damageApplied', {targetRef, amount, actual, source});
}
function refForUnit(unit, sideHint='player'){
  const game = state.battle.game;
  let pos = game.player.board.indexOf(unit);
  if(pos >= 0) return {side:'player', pos};
  pos = game.enemy.board.indexOf(unit);
  if(pos >= 0) return {side:'enemy', pos};
  return {side:sideHint, pos:-1};
}
function dealDamageToUnit(unit, amount, source='effect', sideHint='player'){
  const actual = damageUnit(unit, amount);
  emitDamageApplied(refForUnit(unit, sideHint), amount, actual, source);
  return actual;
}
function dealDamageToLeader(side, amount, source='effect'){
  const game = state.battle.game;
  const before = side === 'player' ? game.player.hp : game.enemy.hp;
  damageLeader(side, amount);
  const after = side === 'player' ? game.player.hp : game.enemy.hp;
  const actual = Math.max(0, before - after);
  emitDamageApplied({side: side === 'player' ? 'playerLeader' : 'enemyLeader'}, amount, actual, source);
  return actual;
}
function damageUnit(unit, amount, options={}){
  if(!unit) return 0;
  let dmg = Number(amount || 0);
  if(unit.keywords?.hardMetal && dmg <= 5) dmg = 1;
  else if(unit.keywords?.metal && dmg <= 3) dmg = 1;
  if(unit.statuses?.some(s => s.type === 'immuneDamage')) dmg = 0;
  if(unitKeywords(unit).darkRobe && dmg > 0) dmg = 0;
  if(unit.damageReduction && dmg > 0) dmg = Math.max(0, dmg - Number(unit.damageReduction || 0));
  unit.hp -= dmg;
  return dmg;
}
function damageLeader(side, amount){
  const g = state.battle.game;
  const p = side === 'player' ? g.player : g.enemy;
  let dmg = Number(amount || 0);
  const red = getLeaderDamageReduction(side);
  if(red && dmg > 0) dmg = Math.max(0, dmg - red);
  p.hp = Math.max(0, p.hp - dmg);
  if(p.hp <= 0 && !isSoloTestMode()){
    const result = side === 'enemy' ? 'win' : 'lose';
    publishBattleResult(result, 'hp0', false);
  }
}
function healUnit(unit, amount){
  if(!unit) return;
  unit.hp = Math.min(unit.maxHp, unit.hp + Number(amount || 0));
}
function healLeader(amount){
  const g=state.battle.game; g.player.hp = Math.min(g.player.maxHp, g.player.hp + Number(amount || 0));
}
function hasEnemyTargetableUnit(){
  return state.battle.game.enemy.board.some(u => isAttackableUnit(u) && canTargetEnemyUnit(u));
}



function isSpecialMove(card){
  const text = getCardText(card);
  return text.includes('必殺技') || (card?.tags || []).includes('必殺技');
}
function hasRenkei(card){
  return parseKeywordFlags(card).renkei || getCardText(card).includes('れんけい');
}
function hasSkillBoost(card){
  return parseKeywordFlags(card).skillBoost || getCardText(card).includes('スキルブースト');
}
function hasSynchro(card){
  return parseKeywordFlags(card).synchro || getCardText(card).includes('シンクロ');
}
function getHeroLevel(){
  return Number(state.battle.game?.player?.heroSkill?.level || state.battle.game?.player?.heroLevel || 0);
}
function extractAfterKeyword(text, keyword){
  const idx = String(text || '').indexOf(keyword);
  if(idx < 0) return '';
  return String(text || '').slice(idx + keyword.length);
}
function getSynchroText(card){
  const text = getCardText(card);
  const m = text.match(/シンクロ[:：]?\s*([^。\\n]+)/);
  return (m ? m[1] : extractAfterKeyword(text, 'シンクロ')).trim();
}
function applySynchroEffectText(effectText, targetUnit=null, source='シンクロ', times=1){
  const text = String(effectText || '');
  const n = Math.max(1, Number(times || 1));
  applyCommonKeywordAndBuffText(text, targetUnit, source, n);
  // 「死亡時:〜」など継続能力はフラグとして保持し、実際の死亡時に処理する
  if(targetUnit && text.includes('死亡時')){
    targetUnit.extraDeathText = [targetUnit.extraDeathText, extractAfterKeyword(text, '死亡時')].filter(Boolean).join('。');
    targetUnit.keywords.deathrattle = true;
  }
  if(targetUnit && text.includes('召喚コスト-')){
    const m = text.match(/召喚コスト[-－−](\d+)/);
    targetUnit._synchroCostReduction = Number(m?.[1] || 0);
  }
}
function parseLevelledEffectSegments(text, keyword){
  const raw = String(text || '');
  const part = (extractAfterKeyword(raw, keyword) || raw).trim();
  const matches = [...part.matchAll(/[①②③１２３123][\.、:：]?\s*([^①②③１２３123。]+)/g)];
  if(matches.length) return matches.map(m => m[1].trim()).filter(Boolean);
  return [part];
}
function applySynchroIfAny(card, targetUnit=null){
  if(!hasSynchro(card)) return;
  const lv = getHeroLevel();
  if(!lv){ battleLog('シンクロ：ヒーローがいないため発動しません。'); return; }
  const segments = parseLevelledEffectSegments(getCardText(card), 'シンクロ');
  if(segments.length > 1){
    for(let i=0; i<Math.min(lv, segments.length); i++) applySynchroEffectText(segments[i], targetUnit, card.name, 1);
    battleLog(`シンクロ：ヒーローLv.${lv}までの効果を適用しました。`);
  }else{
    applySynchroEffectText(segments[0], targetUnit, card.name, lv);
    battleLog(`シンクロ：${segments[0]} を${lv}回適用しました。`);
  }
}
function applyRenkeiIfActive(card, targetUnit=null){
  const game = state.battle.game;
  if(!hasRenkei(card)) return false;
  if(game.player.tension < 3){ battleLog('れんけい：テンションが3未満のため追加効果なし。'); return false; }
  battleLog('れんけい：追加効果を発動。');
  const name = card.name;
  const pos = targetUnit ? game.player.board.indexOf(targetUnit) : -1;

  if(name === 'コンガオンガ'){
    game.pendingGenericEffect = {kind:'renkeiVanishAtk6GiveEnemy', source:name, target:'enemyUnit'};
    battleLog('コンガオンガ：攻撃力6以上の敵ユニットを選んでください。');
    return true;
  }
  if(name === 'ウルノーガ&ウルナーガ' && targetUnit){
    if(isFrontRow('player', pos)){
      const candidates = enemySameRowUnitsForPlayerPos(pos);
      const t = chooseRandom(candidates);
      if(t?.unit){ t.unit.vanished = true; t.unit.hp = 0; resolveDeaths(); battleLog('ウルノーガ&ウルナーガ：正面の敵を消滅。'); }
    }else{
      for(const u of [...game.player.board, ...game.enemy.board]){
        if(u && u !== targetUnit && !u.isBuilding && Number(u.attack || 0) >= 6) u.hp = 0;
      }
      resolveDeaths();
      battleLog('ウルノーガ&ウルナーガ：攻撃力6以上の他ユニットを死亡。');
    }
    return true;
  }
  if(name === 'シュプリンガー' && targetUnit){
    applyStrategyToUnit(targetUnit);
    setTimeout(() => applyStrategyToUnit(targetUnit), 300);
    return true;
  }
  if(name === 'パピラス'){ addRandomClassSpellCost1to3(); return true; }
  if(name === 'ローシュ'){ applyAdventurerGlobalBuff(); return true; }
  if(name === 'あくまの書'){ chooseTwoLowCostUnitCopiesFromHand(); return true; }
  if(name === 'もりもりベス'){
    game.pendingGenericEffect = {kind:'summonSpecificToken', source:name, target:'friendlyEmptySlot', tokenName:'スライムベス', attack:2, hp:1};
    battleLog('もりもりベス：スライムベスを出す味方空きマスを選んでください。');
    return true;
  }
  if(name === '魅惑のマルティナ'){ moveAllEnemyBackToFront(); return true; }
  if(name === '決意の聖賢セーニャ'){
    let healedUnits = 0;
    healLeader(3);
    for(const u of game.player.board){
      if(u && !u.isBuilding && u.hp < u.maxHp){
        healUnit(u, 3); healedUnits++;
      }
    }
    for(let i=0;i<healedUnits;i++) damageRandomEnemy(2, true);
    resolveDeaths();
    return true;
  }
  if(name === '亡国の先王ロウ'){
    addRandomSpellCostAtLeast(1, 2);
    game.player.rowAfterSpellSummon = true;
    return true;
  }
  if(name === 'ベロベロ' && targetUnit){
    applyCommonKeywordAndBuffText('+1/+1', targetUnit, name, 1);
    copyUnitToOppositeRow(targetUnit);
    return true;
  }
  if(name === 'ヘルプラネット'){
    game.player.nextFortuneBoth = true;
    battleLog('次に使う占いカードは両方発動します。');
    return true;
  }
  if(name === 'セレン'){
    for(const u of game.player.board){
      if(u && u !== targetUnit && !u.isBuilding) grantFishDeathrattle(u);
      if(u && !u.isBuilding && Number(u.attack || 0) <= 2){ u.keywords.haste = true; u.canAttack = true; u.summoningSickness = false; }
    }
    battleLog('セレン：魚死亡時効果と速攻を付与。※カード画像差異の可能性あり。');
    return true;
  }
  if(name === 'うずしおキング'){ chooseRenkeiFromTop4(); return true; }
  if(name === 'ぬかどこスライム'){
    for(let row=0; row<3; row++){
      const p = coordToPos('enemy', row, 3);
      const u = game.enemy.board[p];
      if(u){ applyPoison(u); addStatus(u, 'apathy', {until:'turnStart'}); u.canAttack = false; }
    }
    return true;
  }
  if(name === '笑顔の伝道師シルビア'){
    summonRandomUnitCost1(); summonRandomUnitCost1();
    return true;
  }
  if(name === 'マヤ' && targetUnit){
    targetUnit.keywords.doubleAttack = true;
    targetUnit.attacksLeft = Math.max(targetUnit.attacksLeft || 1, 2);
    return true;
  }
  if(name === 'とうだいタイガー'){
    game.pendingGenericEffect = {kind:'renkeiReturnAtk3', source:name, target:'enemyUnit'};
    battleLog('とうだいタイガー：攻撃力3以下の敵ユニットを選んでください。');
    return true;
  }

  const text = extractAfterKeyword(getCardText(card), 'れんけい') || getCardText(card);
  applyCommonKeywordAndBuffText(text, targetUnit, card.name, 1);
  applyTextMiniEffect(text, card.name);
  return true;
}
function getSkillBoostText(card){
  const text = getCardText(card);
  const m = text.match(/スキルブースト[:：]?\s*([^。\\n]+)/);
  return (m ? m[1] : extractAfterKeyword(text, 'スキルブースト')).trim();
}
function applySkillBoostText(effectText, targetUnit=null, source='スキルブースト', count=1){
  const text = String(effectText || '');
  const n = Math.max(1, Number(count || 1));
  applyCommonKeywordAndBuffText(text, targetUnit, source, n);
  if(targetUnit && text.includes('コスト-')){
    const m = text.match(/コスト[-－−](\d+)/);
    targetUnit._skillBoostCostReduction = Number(m?.[1] || 1) * n;
  }
}
function triggerSkillBoostOnTensionSkill(){
  const game = state.battle.game;
  game.player.tensionSkillUseCount = Number(game.player.tensionSkillUseCount || 0) + 1;
  const boostCount = game.player.tensionSkillUseCount;

  for(const id of game.player.hand){
    const card = byId(id);
    if(card && hasSkillBoost(card)){
      game.player.skillBoosts ||= {};
      game.player.skillBoosts[id] = boostCount;
      battleLog(`スキルブースト：${card.name}のブースト値が${boostCount}になりました。`);
    }
  }
  for(const unit of game.player.board){
    if(!unit || unit.isBuilding || isSealed(unit)) continue;
    const card = byId(unit.cardId);
    if(card && hasSkillBoost(card)){
      const effectText = getSkillBoostText(card);
      if(effectText) applySkillBoostText(effectText, unit, card.name, boostCount);
      battleLog(`スキルブースト：${unit.name}が${boostCount}回分で発動。`);
    }
  }
}
function triggerSkillBoostOnHeroSkill(){
  // v56: スキルブーストの正しい発動条件は「リーダーのテンションスキル使用時」。
  // 互換用に残すが、ヒーロースキルでは何もしない。
}
function applyApathyToLeader(){
  const game = state.battle.game;
  game.player.leaderApathy = true;
  game.player.tension = 0;
  game.player.leaderAttacksLeftThisTurn = Math.max(0, Number(game.player.leaderAttacksLeftThisTurn || 1) - 1); game.player.leaderCanAttack = game.player.leaderAttacksLeftThisTurn > 0;
}
function clearDarkRobeByOrb(card){
  if(card?.name !== '光の玉' && !getCardText(card).includes('光の玉')) return false;
  const game = state.battle.game;
  let cleared = false;
  for(const unit of [...game.player.board, ...game.enemy.board]){
    if(unit && (hasStatus(unit, 'darkRobe') || unitKeywords(unit).darkRobe)){
      removeStatuses(unit, ['darkRobe']);
      if(unit.keywords) unit.keywords.darkRobe = false;
      cleared = true;
    }
  }
  if(game.enemy.darkRobe){ game.enemy.darkRobe = false; cleared = true; }
  if(game.player.darkRobe){ game.player.darkRobe = false; cleared = true; }
  if(cleared) battleLog('光の玉：闇の衣を解除しました。');
  return cleared;
}
function resolveConstrainedTerrainPositions(card, terrainName){
  const game = state.battle.game;
  const text = getCardText(card);
  const positions = [];
  if(text.includes('敵ユニットの後ろ') || text.includes('敵ユニットの背後')){
    for(let i=0;i<game.enemy.board.length;i++){
      if(game.enemy.board[i]){
        const behind = getBehindPos('enemy', i);
        if(behind >= 0) positions.push({side:'enemy', pos:behind});
      }
    }
  }
  if(text.includes('相手後列') || text.includes('敵後列')){
    for(let row=0; row<3; row++) positions.push({side:'enemy', pos:coordToPos('enemy', row, 3)});
  }
  if(text.includes('相手前列') || text.includes('敵前列')){
    for(let row=0; row<3; row++) positions.push({side:'enemy', pos:coordToPos('enemy', row, 2)});
  }
  if(text.includes('味方後列') || text.includes('自分後列')){
    for(let row=0; row<3; row++) positions.push({side:'player', pos:coordToPos('player', row, 0)});
  }
  if(text.includes('味方前列') || text.includes('自分前列')){
    for(let row=0; row<3; row++) positions.push({side:'player', pos:coordToPos('player', row, 1)});
  }
  return positions.filter(p => p && p.pos >= 0);
}
function setTerrainForSide(side, pos, type, source){
  const game = state.battle.game;
  if(side === 'enemy'){
    game.enemyTerrain ||= Array(6).fill(null);
    if(pos == null || pos < 0 || pos >= 6) pos = game.enemyTerrain.findIndex(x => !x);
    if(pos < 0) pos = 0;
    game.enemyTerrain[pos] = {type, source, owner:'player'};
  }else{
    setTerrain(pos, type, source);
    return;
  }
  battleLog(`${source}：相手側に地形「${type}」を配置しました。`);
}
function beginTerrainPlacement(card, terrainName){
  const game = state.battle.game;
  const constrained = resolveConstrainedTerrainPositions(card, terrainName);
  if(constrained.length){
    const target = constrained.find(p => !(p.side === 'enemy' ? game.enemyTerrain?.[p.pos] : game.terrain?.[p.pos])) || constrained[0];
    setTerrainForSide(target.side, target.pos, terrainName, card.name);
    return false;
  }
  game.pendingGenericEffect = {kind:'setTerrain', source:card.name, target:'friendlyEmptySlot', terrainType:terrainName};
  battleLog(`${card.name}：${terrainName}を置くマスを選んでください。`);
  return true;
}
function firstTerrainNameInText(text){
  return ['すべる床','宝箱','バリア床','刃の紋章','魔法陣','祝福の聖域','しあわせの国','天啓の神域'].find(t => String(text || '').includes(t)) || '';
}
function hasStatus(unit, type){
  return !!unit?.statuses?.some(s => s?.type === type || s === type);
}
function addStatus(unit, type, data={}){
  if(!unit) return;
  unit.statuses ||= [];
  if(!hasStatus(unit, type)) unit.statuses.push({type, ...data});
}
function removeStatuses(unit, types=[]){
  if(!unit) return;
  unit.statuses = (unit.statuses || []).filter(s => !types.includes(s?.type || s));
}
function isSealed(unit){
  return hasStatus(unit, 'sealed');
}
function unitKeywords(unit){
  return isSealed(unit) ? {} : (unit?.keywords || {});
}
function getSpellDamageBonus(){
  const game = state.battle.game;
  let bonus = 0;
  bonus += Number(game.player.turnSpellDamageBonus || 0);
  for(const u of game.player.board){
    if(!u || isSealed(u)) continue;
    const text = getCardText(byId(u.cardId));
    bonus += Number(u.spellDamageBonus || 0);
    const m = text.match(/特技ダメージ[+＋](\d+)/);
    if(m) bonus += Number(m[1] || 0);
    else if(!u.isBuilding && unitKeywords(u).spellDamagePlus) bonus += 1;
  }
  return bonus;
}
function getProficiencyLevel(cardId){
  const game = state.battle.game;
  return Number(game?.player?.proficiency?.[cardId] || 0);
}
function incrementAllProficiency(amount=1){
  const game = state.battle.game;
  game.player.proficiency ||= {};
  for(const id of game.player.hand){
    if(isProficiencyCard(byId(id))){
      game.player.proficiency[id] = Number(game.player.proficiency[id] || 0) + Number(amount || 1);
    }
  }
}
function isTerrainCard(card){
  const f = parseKeywordFlags(card);
  return f.terrainSlip || f.terrainTreasure || f.terrainBarrier || f.terrainBlade || f.terrainMagic || f.terrainBlessing || f.terrainHappy || f.terrainOracle;
}
function setTerrain(pos, type, source){
  const game = state.battle.game;
  game.terrain ||= Array(6).fill(null);
  if(pos == null || pos < 0 || pos >= 6) pos = game.terrain.findIndex(x => !x);
  if(pos < 0) pos = 0;
  game.terrain[pos] = {type, source, owner:'player'};
  battleLog(`${source}：地形「${type}」を配置しました。`);
}
function triggerTerrainOnSummon(unit, pos){
  const game = state.battle.game;
  const terrain = game.terrain?.[pos];
  if(!terrain || !unit || unit.isBuilding) return;
  if(terrain.type === '宝箱'){ drawCard(1); game.terrain[pos] = null; battleLog('宝箱：カードを1枚引きました。'); }
  if(terrain.type === 'バリア床'){ addStatus(unit, 'immuneDamage', {until:'turnStart'}); battleLog('バリア床：ダメージ無効を付与。'); }
  if(terrain.type === '刃の紋章'){ unit.attack += 1; battleLog('刃の紋章：攻撃力+1。'); }
  if(terrain.type === '魔法陣'){ unit.spellDamageBonus = Number(unit.spellDamageBonus || 0) + 1; battleLog('魔法陣：特技ダメージ+1。'); }
  if(terrain.type === '祝福の聖域'){ unit.hp += 1; unit.maxHp += 1; battleLog('祝福の聖域：HP+1。'); }
  if(terrain.type === 'しあわせの国'){ gainTension(1, 'しあわせの国'); }
  if(terrain.type === '天啓の神域'){ drawCard(1); gainTension(1, '天啓の神域'); }
  if(terrain.type === 'すべる床'){
    const to = getBehindPos('player', pos);
    if(to >= 0 && !game.player.board[to]){
      game.player.board[to] = unit;
      game.player.board[pos] = null;
      battleLog('すべる床：ユニットが後列へ移動しました。');
    }
  }
}
function applySeal(unit){
  if(!unit) return;
  addStatus(unit, 'sealed');
  unit.keywords = {};
  unit.statuses = (unit.statuses || []).filter(s => (s?.type || s) === 'sealed');
}
function applyPoison(unit){
  addStatus(unit, 'poison');
}
function applyStartOfTurnStatuses(){
  // v61: 毒は「お互いのターン終了時」に処理するため、ここでは処理しない。
}
function hasFortuneEffect(card){
  const text = getCardText(card);
  return /占い[:：]/.test(text) || text.includes('必中モード') || text.includes('超必中モード') || /占い効果/.test(text);
}

// v117: precise renkei/double attack + Grandmaz cost-copy + hard solo turn button
function hasInnateDoubleAttackV117(card){
  const text = getCardText(card);
  if(!text.includes('2回攻撃')) return false;
  // 「れんけい：2回攻撃を得る」は条件付きなので、初期キーワードにはしない。
  const renkeiDouble = /れんけい[:：]?[^。]*2回攻撃/.test(text);
  if(renkeiDouble && !/^[^。]*2回攻撃/.test(text.replace(/れんけい[:：]?[^。]*/g, ''))) return false;
  return true;
}
function addDiscountedCopyToHandV117(card, costDelta, source='効果'){
  const game = state.battle.game;
  if(!card || !game?.player) return false;
  if((game.player.hand || []).length >= 10){
    battleLog(`${source}：${card.name}は手札上限10枚のため破棄。`);
    return false;
  }
  const baseCost = Number(card.cost || 0);
  const copy = JSON.parse(JSON.stringify(card));
  copy.id = `copy_${card.id}_${Date.now()}_${safeRandomId('v117').slice(0,8)}`;
  copy.cost = Math.max(0, baseCost + Number(costDelta || 0));
  copy.originalCardId = card.id;
  copy.costDeltaApplied = Number(costDelta || 0);
  copy.flags ||= {};
  copy.flags.deckBuildable = false;
  copy.flags.generatedOrEvolved = true;
  copy.searchText = `${copy.searchText || ''} ${source} コスト変更 ${copy.cost}`.trim();
  state.allCards.push(copy);
  state.cards.push(copy);
  game.player.hand.push(copy.id);
  battleLog(`${source}：${card.name}を手札へ。コスト ${baseCost}→${copy.cost}。`);
  return true;
}
function triggerGrandmazTop3V117(source='グランマーズ'){
  const game = state.battle.game;
  if(game.grandmazChoiceOpen) return false;
  const top = (game.player.deck || []).slice(0,3).map((id,i)=>({id,i,card:byId(id)})).filter(x=>x.card);
  if(!top.length){ battleLog(`${source}：デッキがありません。`); return false; }
  game.grandmazChoiceOpen = true;
  openChoiceModal(`${source}：1枚を手札へ（コスト-2）`, top.map(x=>`${x.card.name} (${Math.max(0, Number(x.card.cost||0)-2)})`), (picked, i)=>{
    game.grandmazChoiceOpen = false;
    const item = top[i];
    if(!item?.card) return;
    // 見た3枚をデッキから抜く。選んだカードはコピーとして手札へ、残りはデッキ下。
    const seenIds = top.map(x=>x.id);
    const restIds = [];
    for(const id of seenIds){
      const idx = game.player.deck.indexOf(id);
      if(idx >= 0) game.player.deck.splice(idx,1);
      if(id !== item.id) restIds.push(id);
    }
    addDiscountedCopyToHandV117(item.card, -2, source);
    for(const id of restIds) game.player.deck.push(id);
    battleLog(`${source}：残りをデッキ下へ。`);
    renderBattleArena(); syncMyBattleState();
  }, {kind:'grandmazTop3V117'});
  return true;
}
function soloHardTurnSwitchV117(){
  const game = state.battle.game;
  if(!game || !isSoloTestMode()) return false;
  state.battle.matchLocked = false;
  $('battle-arena')?.classList.remove('battle-locked');
  const current = soloActiveSideV114();
  applyEndTurnEffectsForSideV121(current);
  processSideTurnEndV131(current);
  const next = current === 'player' ? 'enemy' : 'player';
  game.soloActiveSide = next;
  game.isMyTurn = true;
  game.turn = Number(game.turn || 1) + 1;
  clearPendingTargetsOnSoloTurnEndV119();
  game.selectedHandIndex = null;
  game.selectedAttacker = null;
  game.pendingGenericEffect = null;
  game.pendingHeroSkill = null;
  battleLog(`${soloSideNameV114(current)}ターン終了。${soloSideNameV114(next)}ターンへ。`);
  soloStartSideTurnV114(next);
  renderBattleArena();
  syncMyBattleState();
  return true;
}
function installSoloForceTurnButtonV117(){
  // v119: 中央の後付けターン切替ボタンは不要になったため表示しない
  const btn = $('solo-force-turn-btn');
  if(btn) btn.classList.add('hidden');
}


function parseKeywordFlags(card){
  const text = getCardText(card);
  return {
    taunt: text.includes('におうだち'),
    haste: text.includes('速攻'),
    support: text.includes('おうえん'),
    snipe: text.includes('ねらい撃ち'),
    poison: text.includes('毒'),
    stealth: text.includes('ステルス'),
    seal: text.includes('封印'),
    darkRobe: text.includes('闇の衣'),
    conditionGood: text.includes('絶好調'),
    synchro: text.includes('シンクロ'),
    proficiency: text.includes('熟練度'),
    spellDamagePlus: text.includes('特技ダメージ＋') || text.includes('特技ダメージ+'),
    terrainSlip: text.includes('すべる床'),
    terrainTreasure: text.includes('宝箱'),
    terrainBarrier: text.includes('バリア床'),
    terrainBlade: text.includes('刃の紋章'),
    terrainMagic: text.includes('魔法陣'),
    terrainBlessing: text.includes('祝福の聖域'),
    terrainHappy: text.includes('しあわせの国'),
    terrainOracle: text.includes('天啓の神域'),
    apathy: text.includes('無気力状態'),
    piercing: text.includes('貫通') && !text.includes('超貫通'),
    superPiercing: text.includes('超貫通'),
    metal: text.includes('メタルボディ') && !text.includes('ハードメタルボディ'),
    hardMetal: text.includes('ハードメタルボディ'),
    doubleAttack: hasInnateDoubleAttackV117(card),
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
    fortune: hasFortuneEffect(card),
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
  if(flags.poison) label.push('毒');
  if(flags.piercing) label.push('貫通');
  if(flags.superPiercing) label.push('超貫');
  if(flags.metal) label.push('金属');
  if(flags.hardMetal) label.push('硬金');
  if(flags.stealth) label.push('隠密');
  if(flags.seal) label.push('封印');
  if(flags.conditionGood) label.push('絶好');
  if(flags.synchro) label.push('同調');
  if(flags.powerBadge) label.push('バッジ');
  if(flags.building) label.push('建物');
  return label.slice(0,2).join('/');
}



function makeTargetPayload(refObj={}){
  if(!refObj) return null;
  const game = state.battle.game;
  const side = refObj.side;
  if(side === 'playerLeader' || side === 'enemyLeader') return {type:'leader', side};
  if(side === 'player' || side === 'enemy'){
    const board = side === 'player' ? game.player.board : game.enemy.board;
    const unit = board?.[refObj.pos];
    return {type:'unit', side, pos:refObj.pos, unitId:unit?.id || '', cardId:unit?.cardId || '', name:unit?.name || ''};
  }
  if(side === 'playerEmpty' || side === 'enemyEmpty') return {type:'emptySlot', side:side.replace('Empty',''), pos:refObj.pos};
  return {...refObj};
}
function makeEmptySlotTargetPayload(side, pos){
  return {type:'emptySlot', side, pos};
}
function makeEffectTargetPayload(effect, target){
  return {
    effectKind: effect?.kind || '',
    source: effect?.source || effect?.name || '',
    target: makeTargetPayload(target)
  };
}
function emitTargetSelected(kind, target, extra={}){
  emitBattleEvent('targetSelected', {kind, target:makeTargetPayload(target), ...extra});
}
function emitEmptySlotSelected(kind, side, pos, extra={}){
  emitBattleEvent('targetSelected', {kind, target:makeEmptySlotTargetPayload(side, pos), ...extra});
}


function emitChoiceSelected(kind, title, options, index, value, extra={}){
  emitBattleEvent('choiceSelected', {
    kind,
    title,
    options: Array.isArray(options) ? options.map(String) : [],
    index:Number(index),
    value:String(value ?? ''),
    ...extra
  });
}

function cloneEventPayload(payload={}){
  const out = {};
  for(const [k,v] of Object.entries(payload || {})){
    if(k === 'unit' && v) out.unit = {id:v.id, cardId:v.cardId, name:v.name, attack:v.attack, hp:v.hp, maxHp:v.maxHp, statuses:v.statuses || [], keywords:v.keywords || {}};
    else if(k === 'targetUnit' && v) out.targetUnit = {id:v.id, cardId:v.cardId, name:v.name, attack:v.attack, hp:v.hp, maxHp:v.maxHp, statuses:v.statuses || [], keywords:v.keywords || {}};
    else if(k === 'attacker' && v) out.attacker = {id:v.id, cardId:v.cardId, name:v.name, attack:v.attack, hp:v.hp, maxHp:v.maxHp, statuses:v.statuses || [], keywords:v.keywords || {}};
    else if(k === 'weapon' && v) out.weapon = {name:v.name, attack:v.attack, durability:v.durability, maxDurability:v.maxDurability, cardText:v.cardText, noCounter:v.noCounter, snipe:v.snipe, doubleAttack:v.doubleAttack, attacksLeft:v.attacksLeft};
    else if(k === 'card' && v) out.card = {id:v.id, name:v.name, cardType:v.cardType, cost:v.cost, attack:v.attack, hp:v.hp};
    else if(typeof v !== 'function') out[k] = v;
  }
  return out;
}

function emitBattleEvent(type, payload={}){
  const game = state.battle.game;
  if(!game) return;
  game.events ||= [];
  const event = {
    id:`evt_${Date.now()}_${safeRandomId('rnd').slice(0,8)}`,
    type,
    turn: game.turn,
    playerId: state.playerId,
    payload: cloneEventPayload(payload)
  };
  game.events.push(event);
  if(game.events.length > 80) game.events.splice(0, game.events.length - 80);
  if(!state.battle.processingRemoteAction && ['choiceSelected','targetSelected','attackDeclared','damageApplied','counterDamage','attackResolved','cardPlayed','spellPlayed','unitSummoned','unitPutIntoPlay','afterAttack','unitDeath','betActivated','weaponEquipped','weaponAfterAttack','weaponBroken','turnStart','turnEnd','ownTurnStart','ownTurnEnd','opponentTurnStart','opponentTurnEnd'].includes(type)){
    pushBattleAction(type, event.payload);
  }

  switch(type){
    case 'choiceSelected': return handleChoiceSelectedEvent(payload);
    case 'targetSelected': return handleTargetSelectedEvent(payload);
    case 'turnStart': return handleTurnStartEvent(payload);
    case 'ownTurnStart': return handleOwnTurnStartEvent(payload);
    case 'ownTurnEnd': return handleOwnTurnEndEvent(payload);
    case 'opponentTurnStart': return handleOpponentTurnStartEvent(payload);
    case 'opponentTurnEnd': return handleOpponentTurnEndEvent(payload);
    case 'turnEnd': return handleTurnEndEvent(payload);
    case 'cardPlayed': return handleCardPlayedEvent(payload);
    case 'spellPlayed': return handleSpellPlayedEvent(payload);
    case 'unitSummoned': return handleUnitSummonedEvent(payload);
    case 'unitPutIntoPlay': return handleUnitPutIntoPlayEvent(payload);
    case 'attackDeclared': return handleAttackDeclaredEvent(payload);
    case 'damageApplied': return handleDamageAppliedEvent(payload);
    case 'counterDamage': return handleCounterDamageEvent(payload);
    case 'attackResolved': return handleAttackResolvedEvent(payload);
    case 'afterAttack': return handleAfterAttackEvent(payload);
    case 'unitDeath': return handleUnitDeathEvent(payload);
    case 'betActivated': return handleBetActivatedEvent(payload);
    case 'weaponEquipped': return handleWeaponEquippedEvent(payload);
    case 'weaponAfterAttack': return handleWeaponAfterAttackEvent(payload);
    case 'weaponBroken': return handleWeaponBrokenEvent(payload);
  }
}

function handleChoiceSelectedEvent(payload={}){
  // v76: 選択肢はactionLog/reducer用に記録。実処理は各効果側で実行済み。
}

function handleTargetSelectedEvent(payload={}){
  // v75: 選択対象はactionLog/reducer用に記録。実処理は各効果側で実行済み。
}

function handleOwnTurnStartEvent(payload={}){
  return handleTurnStartEvent({...payload, timing:'ownTurnStart'});
}
function handleOwnTurnEndEvent(payload={}){
  return handleTurnEndEvent({...payload, timing:'ownTurnEnd'});
}
function handleOpponentTurnStartEvent(payload={}){
  const game = state.battle.game;
  for(const u of game.player.board){
    if(u){
      u.statuses = (u.statuses || []).filter(s => s.until !== 'opponentTurnStart');
    }
  }
}
function handleOpponentTurnEndEvent(payload={}){
  const game = state.battle.game;
  for(const u of game.player.board){
    if(u){
      u.statuses = (u.statuses || []).filter(s => s.until !== 'opponentTurnEnd');
      if(!u.statuses.some(s => s.type === 'damageReduction')) u.damageReduction = 0;
    }
  }
}
function handleTurnStartEvent(payload={}){
  const game = state.battle.game;
  const side = payload?.side || 'player';
  clearTurnPlayedCardTrackV124(side);
  if(side === 'player') game.player.fortuneThisTurnCount = 0;
  returnDelayedUnitsAtTurnStart();
  clearUntilOwnTurnStart();
  if(game.player.familyBondPending){ game.player.familyBondAura = true; game.player.familyBondPending = false; battleLog('家族の絆：家族の絆オーラを得ました。'); }
  if(game.player.delayedHandReturn?.length){
    const keep = [];
    for(const item of game.player.delayedHandReturn){
      if(Number(item.returnAtTurnStart || 0) > Number(game.turn || 0)){ keep.push(item); continue; }
      if(!game.player.hand.some(id => byId(id)?.name === item.name)) addCardToHandByName(item.name);
    }
    game.player.delayedHandReturn = keep;
  }
  for(const u of [...game.player.board]){ if(u?.name === 'フォステイル') triggerFostailStartV110(); if(u?.isBuilding) applyBuildingTurnStart(u); }
  applyStartOfTurnStatuses();
  for(let i=0;i<game.player.board.length;i++){
    const unit = game.player.board[i];
    if(unit){
      unit.statuses = (unit.statuses || []).filter(s => !s.until || s.until !== 'turnStart');
      if(!unit.isBuilding){
        unit.summoningSickness = false;
        const k = unitKeywords(unit);
        unit.attacksLeft = k.doubleAttack ? 2 : 1;
        unit.canAttack = !hasStatus(unit, 'apathy');
      }
    }
  }
}
function handleTurnEndEvent(payload={}){
  const game = state.battle.game;
  discardTempCopiesAtTurnEnd();
  triggerPowerfulBadgeTurnEndV157('player');
  for(const u of [...game.player.board]){
    if(!u) continue;
    if(u.temporaryDeckReturnAtTurnEnd){
      const pos = game.player.board.indexOf(u);
      if(pos >= 0) game.player.board[pos] = null;
      putUnitIntoDeckAndShuffle(u, 'player', u.name || '一時ユニット');
      continue;
    }
    if(u.isBuilding) continue;
    if(u.doubleStatsAtTurnEnd){ u.attack *= 2; u.hp *= 2; u.maxHp *= 2; u.doubleStatsAtTurnEnd = false; battleLog(`${u.name}：攻撃力とHPが2倍。`); }
    if(u.name === 'ベロベロ') copyUnitToOppositeRow(u);
    if(u.name === '笑顔の伝道師シルビア' && game.player.board.filter(x=>x && !x.isBuilding).length >= 3 && game.player.tension < 3) gainTension(1, u.name);
    if(u.name === 'ミリオンゼニー') addCardToHandByName('コイン');
    if(u.name === 'かっちゅうアリ' && !u._endTurnGetDone){ addCardToHandByName('コイン'); u._endTurnGetDone = true; }
    if(u.name === 'クラーゴン') u.kragonBetUsed = [];
    if(u.name === 'ギガデーモン') addCardToHandByName('コイン');
    u.betUsedTurn = null;
  }
  if(game.player.weapon?.name === 'むげんの弓') addCardToHandByName('コイン');
  addSpecialCoinAtTurnEndIfMadesagora();
  game.player.nextSpellCostDelta = 0;
  game.player.nextTensionCostZero = false;
  applyPoisonEndOfTurnDamage();
  for(let i=0;i<game.player.board.length;i++){
    const u = game.player.board[i];
    if(u?.returnToEnemyAtTurnEnd){
      game.player.board[i] = null;
      const ep = game.enemy.board.findIndex(x=>!x);
      if(ep >= 0){ delete u.returnToEnemyAtTurnEnd; game.enemy.board[ep] = u; }
    }
  }
  resetTurnTemporaryBuffs();
  for(const u of game.player.board){
    if(u){
      u.statuses = (u.statuses || []).filter(s => !(s.until === 'opponentTurnEnd'));
      if(!u.statuses.some(s => s.type === 'damageReduction')) u.damageReduction = 0;
    }
  }
}

// v124: per-turn last played card, fortune-teller tension, enemy placement slot fix, Akumano Kagami no haste
function clearTurnPlayedCardTrackV124(side='player'){
  const game = state.battle.game;
  const obj = side === 'enemy' ? game.enemy : game.player;
  if(obj) obj.lastPlayedCardThisTurnId = null;
}
function setTurnPlayedCardTrackV124(card, side='player'){
  const game = state.battle.game;
  const obj = side === 'enemy' ? game.enemy : game.player;
  if(obj && card?.id) obj.lastPlayedCardThisTurnId = card.id;
}
function addDiscountedCardIdToHandV124(card, delta=-1, source='効果'){
  const game = state.battle.game;
  if(!card) return false;
  if((game.player.hand || []).length >= 10){
    battleLog(`${source}：${card.name}は手札上限10枚のため破棄。`);
    return false;
  }
  const copy = JSON.parse(JSON.stringify(card));
  copy.id = `copy_${card.id}_${Date.now()}_${safeRandomId('v124').slice(0,8)}`;
  copy.originalCardId = card.originalCardId || card.id;
  copy.cost = Math.max(0, Number(card.cost || 0) + Number(delta || 0));
  copy.flags ||= {};
  copy.flags.deckBuildable = false;
  copy.flags.generatedOrEvolved = true;
  copy.searchText = `${copy.searchText || ''} ${source} コスト変更 ${copy.cost}`.trim();
  state.allCards.push(copy);
  state.cards.push(copy);
  game.player.hand.push(copy.id);
  battleLog(`${source}：${card.name}を手札へ。コスト ${card.cost ?? 0}→${copy.cost}。`);
  return true;
}
function drawFromDeckByTypeWithCostDeltaV124(cardType='特技', delta=-1, source='水晶占い'){
  const game = state.battle.game;
  const idx = (game.player.deck || []).findIndex(id => byId(id)?.cardType === cardType);
  if(idx < 0){
    battleLog(`${source}：山札に${cardType}カードがありません。`);
    return false;
  }
  const [id] = game.player.deck.splice(idx,1);
  const card = byId(id);
  return addDiscountedCardIdToHandV124(card, delta, source);
}
function splitPotCopyThisTurnV124(){
  const game = state.battle.game;
  const id = game.player.lastPlayedCardThisTurnId;
  const c = byId(id);
  if(!c){
    battleLog('分裂のツボ：このターン中、直前に使用したカードがありません。');
    return false;
  }
  addCardCopyToHand(c, {costDelta:-7, tempExpiresTurnEnd:true});
  battleLog(`分裂のツボ：このターン中直前に使用した${c.name}のコピーを手札へ。`);
  return true;
}

function handleCardPlayedEvent({card, cost, side='player'}={}){
  if(!card) return;
  const game = state.battle.game;
  const actor = side === 'enemy' ? game.enemy : game.player;
  const opponentLeaderSide = side === 'enemy' ? 'player' : 'enemy';
  if(isSpell(card) && side === 'player' && game.player.copyNextSpellToHand && card.name !== 'やまびこのさとり'){
    addCardCopyToHand(card);
    game.player.copyNextSpellToHand = false;
    battleLog(`やまびこのさとり：${card.name}のコピーを手札に加えました。`);
  }
  actor.lastPlayedCardId = card.id;
  setTurnPlayedCardTrackV124(card, side);
  triggerPowerfulBadgeCardPlayedV157(card, side);
  if(isSpell(card)){
    actor.usedSpellCardIds ||= [];
    actor.usedSpellCardIds.push(card.id);
  }
  if(actor.familyBondAura) dealDamageToLeader(opponentLeaderSide, 2, '家族の絆');
  if(side !== 'player') return;
  for(const u of game.player.board) if(u?.name === '稽古相手') { u.attack += 1; u.hp += 1; u.maxHp += 1; }
  if(String(card.searchText || card.text || card.name || '').includes('武術カード')) game.player.martialArtsUsedThisTurn = Number(game.player.martialArtsUsedThisTurn || 0) + 1;
  if(Number(cost ?? getEffectiveCost(card)) <= 1){
    for(const u of game.player.board) if(u?.watchCost1HandUseTempAttack) addTempAttack(u, 1, u.name);
  }
  if(card.cardType === '建物') game.player.nextCardDiscounts = (game.player.nextCardDiscounts || []).filter(d => !(d.cardType === '建物'));
  if(card.cardType === 'ユニット' && isDragonCard(card)) game.player.nextCardDiscounts = (game.player.nextCardDiscounts || []).filter(d => !(d.tribe === 'ドラゴン'));
  triggerCardPlayedForHero(card);
  progressDungeonsByEvent('cardUse', {card, cost});
  if(isBet(card)) triggerHeroAuto('betActivated', {card});
}
function handleSpellPlayedEvent({card, cost}={}){
  const game = state.battle.game;
  if(card && isSpell(card) && cost >= 1 && game.player.rowAfterSpellSummon && game.player.board.some(u => u?.name === '亡国の先王ロウ')){
    summonRandomUnitByCost(cost);
  }
}
function handleUnitSummonedEvent({unit, card, pos, cost, side='player'}={}){
  if(!unit || !card) return;
  applySummonKeywords(unit, card, side);
  if(hasZekkochoTextV134(card)) grantZekkochoV134(unit, card.name);
  applyStoredAdventurerBuff(unit, card);
  applyPendingDemonSummonBuff(unit, card);
  if(state.battle.game.player.nextSummonBuff){ const b=state.battle.game.player.nextSummonBuff; unit.attack += Number(b.attack||0); unit.hp += Number(b.hp||0); unit.maxHp += Number(b.hp||0); state.battle.game.player.nextSummonBuff=null; }
  applySynchroIfAny(card, unit);
  applyRenkeiIfActive(card, unit);
  refreshContinuousBoardEffectsV157(side);
  triggerHeroAuto('adventurerSummon', {card});
  progressDungeonsByEvent('summon', {card, cost});
  if(isSlimeCard(card) && state.battle.game.player.weapon?.name === 'いしのツメ'){
    state.battle.game.player.weapon.attack = Number(state.battle.game.player.weapon.attack || 0) + 1;
    state.battle.game.player.leaderAttack = Number(state.battle.game.player.leaderAttack || 0) + 1;
    state.battle.game.player.baseLeaderAttackForTurn ??= Math.max(0, Number(state.battle.game.player.leaderAttack || 0) - 1);
  }
}
function handleUnitPutIntoPlayEvent({unit, card, pos, side}={}){
  if(!unit || !card) return;
  applyBaseKeywordsOnly(unit, card);
  refreshContinuousBoardEffectsV157(side || 'player');
}

function handleAttackDeclaredEvent({attackerRef, defenderRef, targetSide}={}){
  // v73: 実処理はローカル攻撃関数側。イベントはactionLog/reducer用に記録。
}
function handleDamageAppliedEvent({targetRef, amount, actual, source}={}){
  // v73: ローカル側ではdamageUnit/damageLeader済み。remote reducer側で反映。
}
function handleCounterDamageEvent({attackerRef, amount}={}){
  // v73: ローカル側では反撃ダメージ処理済み。remote reducer側で反映。
}
function handleAttackResolvedEvent({attackerRef, defenderRef, targetSide}={}){
  // v73: 攻撃完了イベント。UI/同期の区切り用。
}
function handleAfterAttackEvent({attacker, targetRef, targetUnit, targetSide}={}){
  if(!attacker) return;
  progressDungeonsByEvent('unitAttack', {attacker, targetRef});
  if(targetSide === 'enemyLeader' && attacker.name === 'マヤ') addRandomOpponentHandCopy();
  if(targetSide === 'enemyLeader' && state.battle.game.player.board.some(u => u?.name === 'ローシュ')){
    drawAdventurerFromDeck();
    battleLog('ローシュ：冒険者カードを引きます。');
  }
}
function handleUnitDeathEvent({unit, side, pos, vanished}={}){
  if(!unit || vanished) return;
  if(side === 'player') triggerLemonKingSlimeDeath(unit);
}
function handleBetActivatedEvent({unit, weapon, source}={}){
  triggerHeroAuto('betActivated', {unit, weapon});
  if(unit || weapon || source === 'specialCoin') onFriendlyBetActivated(unit || null);
}
function handleWeaponEquippedEvent({card}={}){
  if(card?.name === '福招きのそろばん') addCardToHandByName('コイン');
}
function handleWeaponAfterAttackEvent({weapon}={}){
  // v70: 実処理は既存 applyWeaponAfterAttack 側に残し、イベントとして記録。
}
function handleWeaponBrokenEvent({weapon}={}){
  // v70: 実処理は既存 applyWeaponBreakEffect 側に残し、イベントとして記録。
}
function applyBaseKeywordsOnly(unit, card){
  const flags = parseKeywordFlags(card);
  unit.keywords = {...unit.keywords, ...flags};
  unit.attacksLeft = flags.doubleAttack ? 2 : (unit.attacksLeft || 1);
  if(flags.haste || flags.firstStrike){
    unit.canAttack = true;
    unit.summoningSickness = false;
  }
  if(flags.stealth) addStatus(unit, 'stealth');
  if(flags.poison) unit.grantsPoisonOnDamage = true;
  if(flags.darkRobe) addStatus(unit, 'darkRobe');
  if(flags.conditionGood) addStatus(unit, 'conditionGood');
  if(flags.apathy) addStatus(unit, 'apathy');
  if(flags.taunt) unit.keywords.taunt = true;
  if(flags.snipe) unit.keywords.snipe = true;
  if(flags.piercing) unit.keywords.piercing = true;
  unit._baseKeywords = {...(unit.keywords || {})};
}

function putUnitIntoPlayFromCard(card, pos, side='player', stats={}){
  const game = state.battle.game;
  const board = side === 'player' ? game.player.board : game.enemy.board;
  if(!card || pos == null || pos < 0 || pos >= board.length || board[pos]) return null;
  const unit = makeUnitFromCard(card);
  if(stats.attack != null){ unit.attack = Number(stats.attack); unit._baseAttack = Number(stats.attack); }
  if(stats.hp != null){ unit.hp = Number(stats.hp); unit.maxHp = Number(stats.hp); unit._baseHp = Number(stats.hp); }
  if(stats.keywords) unit.keywords = {...unit.keywords, ...stats.keywords};
  if(stats.canAttack || stats.haste){ unit.canAttack = true; unit.summoningSickness = false; unit.keywords.haste = true; }
  if(stats.taunt) unit.keywords.taunt = true;
  if(stats.piercing) unit.keywords.piercing = true;
  board[pos] = unit;
  emitBattleEvent('unitPutIntoPlay', {unit, card, pos, side});
  return unit;
}
function summonUnitFromHandToBoard(card, pos, cost){
  const game = state.battle.game;
  const unit = makeUnitFromCard(card);
  game.player.board[pos] = unit;
  emitBattleEvent('unitSummoned', {unit, card, pos, side:'player', cost});
  return unit;
}

function applySummonKeywords(unit, card, side='player'){
  const flags = parseKeywordFlags(card);
  unit.keywords = flags;
  unit._baseKeywords = {...flags};
  unit.attacksLeft = flags.doubleAttack ? 2 : 1;
  if(flags.haste || flags.firstStrike){
    unit.canAttack = true;
    unit.summoningSickness = false;
  }
  if(flags.support){
    gainTension(1, 'おうえん');
  }
  if(flags.stealth) addStatus(unit, 'stealth');
  if(flags.poison) unit.grantsPoisonOnDamage = true;
  if(flags.darkRobe) addStatus(unit, 'darkRobe');
  if(flags.conditionGood) addStatus(unit, 'conditionGood');
  if(flags.apathy) addStatus(unit, 'apathy');
  if(flags.powerBadge){
    registerPowerfulBadgeV157(card, unit, side);
  }
  if(flags.building){
    unit.isBuilding = true;
    const dungeon = getCardText(card).match(/耐久値\s*(\d+)/);
    unit.durability = dungeon ? 0 : (Number(card.hp || card.attack || 2) || 2);
    unit.maxDurability = dungeon ? Number(dungeon[1]) : unit.durability;
    unit._baseDurability = Number(unit.maxDurability || unit.durability || 0);
    unit.isDungeon = !!dungeon;
    unit.canAttack = false;
    unit.attack = 0;
    state.battle.game.player.buildings.push({id:unit.id, cardId:card.id, name:card.name});
    state.battle.game.player.buildingsPlayed = Number(state.battle.game.player.buildingsPlayed || 0) + 1;
    battleLog(`${card.name}を${unit.isDungeon ? 'ダンジョン' : '建物'}として設置しました。`);
  }
  if(flags.choice) applyChoiceEffect(card);
  if(flags.fortune) applyFortuneEffect(card);
  if((getCardText(card).includes('さくせん') || getCardText(card).includes('作戦')) && card.name !== 'キラーマシン2' && card.name !== 'キラーマシン２') applyStrategyToUnit(unit);
  if(flags.summon){
    applySummonTextEffect(unit, card);
  }
  applyPowerfulBadges(side);
  const pos = state.battle.game.player.board.indexOf(unit);
  if(pos >= 0) triggerTerrainOnSummon(unit, pos);
  triggerTensionLinks('summon', {unit, card});
}

function gainTension(amount=1, reason=''){
  const game = state.battle.game;
  if(game.player.leaderApathy){
    game.player.tension = 0;
    return;
  }
  const before = game.player.tension;
  game.player.tension = Math.min(3, game.player.tension + Number(amount || 0));
  if(game.player.tension !== before) battleLog(`${reason ? reason + '：' : ''}テンション+${amount}。`);
  triggerTensionLinks('tensionGain', {amount});
  progressDungeonsByEvent('tensionLink', {amount});
}

function applySummonTextEffect(unit, card){
  const game = state.battle.game;
  const text = getCardText(card);
  const pos = game.player.board.indexOf(unit);
  const tribeBuffAppliedV132 = applyTribeBuffTextV111(text, unit, card.name) || applyTribeEffectTextV134(text, unit, card.name) || applyTribeEffectTextV133(text, unit, card.name);
  if(card.name === 'クイーンスライム' && !tribeBuffAppliedV132) applyQueenSlimeBuffV132(unit);
  if(card.name === '怪盗ポイックリン') applyPoicklinSummonV119(unit, card);
  if(card.name === '残響のようじゅつし') applyZankyoYojutsuV120(unit, card);
  if(card.name === 'イブール') placeIburBookOnEnemyDeckTopV120('イブール召喚時');  if(card.name === 'デスマエストロ'){
    game.pendingGenericEffect = {kind:'takeControlUntilEnd', maxAttack:1, source:card.name, target:'enemyUnit', haste:true, untilTurnEnd:true};
    battleLog('デスマエストロ：攻撃力1以下の敵ユニットを選んでください。');
  }
  if(card.name === 'ホメロス'){
    game.pendingGenericEffect = {kind:'takeControlPermanent', maxHp:2, source:card.name, target:'enemyUnit'};
    battleLog('ホメロス：HP2以下の敵ユニットを選んでください。');
  }

  if(card.name === 'カーディナルナイト'){
    removePowerfulBadgesV157('enemy', 1, card.name);
  }
  if(card.name === 'あんこくまどう'){
    const removed = removePowerfulBadgesV157('enemy', 2, card.name);
    if(removed > 0){ unit.attack += 1; unit.hp += 1; unit.maxHp += 1; }
  }

  if(card.name === '妖魔軍王ブギー'){
    game.pendingGenericEffect = {kind:'takeControlBuffWhileSource', requireAdventurer:true, attackBuff:2, hpBuff:2, source:card.name, sourceUnitId:unit.id, target:'enemyUnit'};
    battleLog('妖魔軍王ブギー：敵の冒険者1体を選んでください。');
  }
  if(card.name === 'シャイニング' || card.name === 'スピンサタン'){
    game.player.nextFortuneHitFromHut = true;
    battleLog(`${card.name}：次に使う占いカードの効果を選べます。`);
  }
  if(card.name === '占い小屋'){
    game.player.nextFortuneHitFromHut = true;
  }


  const tribeBuffCount = text.match(/自分の場と手札にいる(スライム|ゾンビ|ドラゴン|魔王|冒険者|英雄)系?の数だけ[+＋](\d+)\/[+＋](\d+)/);
  if(tribeBuffCount){
    const n = countOwnBoardAndHandByTribe(tribeBuffCount[1], unit, card.id);
    const a = n * Number(tribeBuffCount[2] || 1);
    const h = n * Number(tribeBuffCount[3] || 1);
    unit.attack += a; unit.hp += h; unit.maxHp += h;
    battleLog(`${card.name}：${tribeBuffCount[1]}系の数だけ+${a}/+${h}。`);
  }
  const allFriendlyTribeBuff = text.match(/このユニットを除く(スライム|ゾンビ|ドラゴン|魔王|冒険者|英雄)系の味方ユニット全てを[+＋](\d+)\/[+＋](\d+)/);
  if(allFriendlyTribeBuff){
    for(const u of friendlyUnitsByTribe(allFriendlyTribeBuff[1], unit)){
      u.attack += Number(allFriendlyTribeBuff[2] || 1);
      u.hp += Number(allFriendlyTribeBuff[3] || 1);
      u.maxHp += Number(allFriendlyTribeBuff[3] || 1);
    }
    battleLog(`${card.name}：${allFriendlyTribeBuff[1]}系の味方を強化。`);
  }


  const mGet = text.match(/GET\((\d+)\)/i);
  if(mGet){
    for(let i=0;i<Number(mGet[1]);i++) addCardToHandByName('コイン');
    battleLog(`GET(${mGet[1]})：コインを手札に加えました。`);
  }










  if(card.name === 'ワイトキング' && isBackRow('player', pos)){
    for(const p of [0,1,2]){
      const u = game.player.board[p];
      if(u && isZombieCard(byId(u.cardId))){ u.attack += 1; u.hp += 1; u.maxHp += 1; }
    }
  }

  if(card.name === 'おにびドングリ'){
    if(game.player.unitDiedThisTurn) addCardToHandByName('魔力開放');
  }
  if(card.name === 'アイスコンドル'){
    const empties = getEmptyBoardPositions('enemy');
    if(empties.length) summonCardAtPos(findCardByName('氷塊') || ensureVirtualCard('氷塊'), chooseRandom(empties, 'iceCondorSlot', {}), 'enemy', {attack:0, hp:3});
  }
  if(card.name === 'アイスゴーレム'){
    const hasMera = [...game.player.hand, ...game.player.deck].some(id => String(getCardText(byId(id))).includes('メラ系') || byId(id)?.name?.includes('メラ'));
    if(!hasMera){
      for(let i=0;i<2;i++){
        const empties = getEmptyBoardPositions('enemy');
        if(!empties.length) break;
        summonCardAtPos(findCardByName('氷塊') || ensureVirtualCard('氷塊'), chooseRandom(empties, 'iceGolemSlot', {i}), 'enemy', {attack:0, hp:3});
      }
    }
  }
  if(card.name === 'とうろうへい'){
    game.player.baseLeaderAttackForTurn ??= Number(game.player.leaderAttack || 0);
    game.player.leaderAttack = Number(game.player.leaderAttack || 0) + 1;
  }
  if(card.name === 'りゅうせんし'){
    unit.cannotAttackLeaderThisTurn = true;
    unit.attackCountsAsLeaderAttack = true;
  }
  if(card.name === '運命の天使ラヴィエル'){
    const pos = game.player.board.indexOf(unit);
    if(isFrontRow('player', pos)){
      const choices = game.player.deck.map((id,i)=>({id,i,card:byId(id)})).filter(x=>x.card?.cardType === 'ユニット' && Number(x.card.cost||0) <= 1);
      const empties = getEmptyBoardPositions('player');
      if(choices.length && empties.length){
        const pick = chooseRandom(choices, 'lavielDeckUnit', {});
        const place = chooseRandom(empties, 'lavielSlot', {});
        game.player.deck.splice(pick.i,1);
        putUnitIntoPlayFromCard(pick.card, place, 'player');
      }
    }else if(isBackRow('player', pos)){
      unit.attack += 2; unit.hp += 2; unit.maxHp += 2;
      const enemyUnits = (game.enemy.hand || []).map((id,i)=>({id,i,card:byId(id)})).filter(x=>x.card?.cardType === 'ユニット');
      const empties = getEmptyBoardPositions('enemy');
      if(enemyUnits.length && empties.length){
        const pick = chooseRandom(enemyUnits, 'lavielEnemyHandUnit', {});
        const place = chooseRandom(empties, 'lavielEnemySlot', {});
        game.enemy.hand.splice(pick.i,1);
        putUnitIntoPlayFromCard(pick.card, place, 'enemy');
      }
    }
  }

  if(card.name === 'おおにわとり'){
    const buildings = game.player.board.filter(u => u?.isBuilding && Number(byId(u.cardId)?.cost || 0) <= 2);
    if(buildings.length) adjustBuildingDurability(chooseRandom(buildings, 'ooniwatoriBuilding', {}), 1, card.name);
    else addRandomFromOwnDeckToHand(c => c.cardType === '建物' && Number(c.cost || 0) <= 2);
  }
  if(card.name === 'きめんどうし'){
    const top = game.player.deck.slice(0,2).map((id,i)=>({id,i,card:byId(id)})).filter(x=>x.card);
    if(top.length === 2){
      openChoiceModal('きめんどうし：上に戻すカード', top.map(x=>x.card.name), (picked, i)=>{
        const chosen = top[i];
        const other = top[1-i];
        game.player.deck.splice(0,2, chosen.id);
        game.player.deck.push(other.id);
        battleLog(`きめんどうし：${chosen.card.name}を上、${other.card.name}を下に戻しました。`);
        renderBattleArena(); syncMyBattleState();
      }, {kind:'topDeckOrderChoice', source:card.name});
    }
  }
  if(card.name === 'むつでエビ' && Number(game.enemy.handCount || 0) <= 3){
    unit.hp += 1; unit.maxHp += 1; unit.keywords.taunt = true;
    battleLog('むつでエビ：相手の手札が3枚以下のためHP+1とにおうだち。');
  }
  if(card.name === 'やみのとうぞく'){
    addRandomOpponentDeckCopyToHand();
  }
  if(card.name === 'アデン'){
    chooseFriendlyBuilding('アデン：耐久値+1する建物', null, (b)=>{
      adjustBuildingDurability(b, 1, card.name);
      unit.attack += 2;
      renderBattleArena(); syncMyBattleState();
    });
  }
  if(card.name === 'ジゴック'){
    chooseFriendlyBuilding('ジゴック：耐久値+1する建物', null, (b)=>{
      adjustBuildingDurability(b, 1, card.name);
      unit.attack += 1;
      renderBattleArena(); syncMyBattleState();
    });
  }
  if(card.name === 'グランマーズ'){
    triggerGrandmazTop3V117('グランマーズ');
  }
  if(card.name === 'ジャミ' && Number(game.enemy.handCount || 0) >= 6){
    for(const p of [3,4,5]){
      const u = game.enemy.board[p];
      if(u){ addStatus(u, 'apathy', {until:'opponentTurnEnd'}); u.canAttack = false; }
    }
    battleLog('ジャミ：相手後列ユニットを次のターン終了時まで攻撃不能にしました。');
  }
  if(card.name === 'エビルポット'){
    unit.proficiencyLevel = Number(unit.proficiencyLevel || 0);
  }
  if(card.name === 'エンゼルスライム'){
    const removed = game.player.deck.splice(0, Math.min(3, game.player.deck.length));
    for(const id of removed){
      const c = byId(id);
      if(c && c.cardType === 'ユニット' && String(c.searchText || c.text || c.tribes || '').includes('スライム')) game.player.hand.push(id);
      else game.player.discarded ||= [], game.player.discarded.push(id);
    }
    battleLog('エンゼルスライム：上3枚を公開し、スライム系ユニットを手札へ、残りを捨てました。');
  }
  if(card.name === 'デスフラッター'){
    chooseFromOwnTopCards(4, 'デスフラッター', c => c.cardType !== 'ユニット', (chosenCard, chosenId)=>{
      game.player.hand.push(chosenId);
    }, 'bottomRandom');
  }
  if(card.name === 'ヘルズクロウ'){
    chooseFromOwnTopCards(4, 'ヘルズクロウ', c => Number(c.cost || 0) <= 1, (chosenCard, chosenId)=>{
      game.player.hand.push(chosenId);
    });
  }
  if(card.name === 'ミレーユ'){
    const top = game.player.deck.slice(0,2).map((id,i)=>({id,i,card:byId(id)})).filter(x=>x.card);
    if(top.length === 2){
      openChoiceModal('ミレーユ：手札に加えるカード', top.map(x=>x.card.name), (picked, i)=>{
        const chosen = top[i], other = top[1-i];
        game.player.deck.splice(0,2, other.id);
        game.player.hand.push(chosen.id);
        renderBattleArena(); syncMyBattleState();
      }, {kind:'topDeckChoice', source:card.name});
    }
  }
  if(card.name === 'ロミア'){
    resolveRomiaChoiceV131();
  }
  if(card.name === 'ラグアス王子'){
    const top = byId(game.enemy.deck?.[0]);
    if(top){
      openChoiceModal(`ラグアス王子：相手山札上 ${top.name}`, ['一番下に送る','そのまま'], (picked,i)=>{
        if(i === 0) game.enemy.deck.push(game.enemy.deck.shift());
        renderBattleArena(); syncMyBattleState();
      }, {kind:'opponentTopDeckMove'});
    }
  }


  if(card.name === 'あくまのカガミ'){
    summonAdventurerFromDeckTemporaryByAkumanoKagami();
  }
  if(card.name === 'スピニー'){
    unit.keywords.piercing = true;
    const empties = getEmptyBoardPositions('player');
    if(empties.length){
      const labels = empties.map(p => `マス${p+1}`);
      openChoiceModal('スピニー：メラリザードを出す場所', labels, (picked, idx)=>{
        const pos2 = empties[idx];
        const mera = findCardByName('メラリザード') || ensureVirtualCard('メラリザード') || {id:'token_メラリザード', name:'メラリザード', cost:1, attack:1, hp:2, cardType:'ユニット', text:''};
        const token = putUnitIntoPlayFromCard(mera, pos2, 'player', {attack:1, hp:2});
        if(token && topDeckCard() && Number(topDeckCard().cost || 0) >= 3){
          token.attack += 1;
          token.keywords.taunt = true;
          battleLog('スピニー：メラリザードに攻撃力+1とにおうだちを付与。');
        }
        renderBattleArena(); syncMyBattleState();
      }, {kind:'spinySlot'});
    }
  }
  if(card.name === 'キラーマシン2' || card.name === 'キラーマシン２'){
    unit.keywords.doubleAttack = true;
    unit.attacksLeft = 2;
    if(countFriendlyBuildingsPlayed() >= 3){
      applyAllStrategyEffects(unit, card.name);
      applyAllStrategyEffects(unit, card.name);
      battleLog('キラーマシン2：建物3つ以上により、2回分すべてのさくせん効果を得ました。');
    }else{
      applyStrategyToUnit(unit);
    }
  }

  if(card.name === '賢者ルシェンダ' || card.name === '黄金兵長'){
    addCardToHandByName('コイン');
  }

  if(card.name === '少女マリベル'){
    addCardToHandByName('コイン'); addCardToHandByName('コイン');
  }
  if(card.name === 'アサシンクロー' || card.name === 'カンダタこぶん' || card.name === 'カンタダこぶん' || card.name === 'ゴルゴンゾーラ' || card.name === 'きりかぶおばけ' || card.name === 'ルドマン'){
    addCardToHandByName('コイン');
  }

  if(card.name === 'ウルベア魔神兵' || card.name === 'ウルベア魔人兵'){
    unit.keywords.snipe = true;
    addCardToHandByName('コイン'); addCardToHandByName('コイン');
  }
  if(card.name === 'ファイアボール'){
    addCardToHandByName('コイン');
  }
  if(card.name === 'アイラ'){
    addCardToHandByName('コイン'); addCardToHandByName('コイン');
  }

  // v61 manual card effects
  if(card.name === '怪蟲アラグネ'){
    if(leaderHasStatus('enemy','poison')){
      game.player.enemyPoisonBonus = Math.max(Number(game.player.enemyPoisonBonus || 0), 1);
      battleLog('怪蟲アラグネ：敵側への毒ダメージが2になりました。');
    }
    applyLeaderPoison('enemy');
    battleLog('怪蟲アラグネ：敵リーダーを毒にしました。');
  }
  if(card.name === 'アイスボンバー' && hasEnemyIceBlock()){
    unit.attack += 2; unit.hp += 2; unit.maxHp += 2;
    battleLog('アイスボンバー：相手の場に氷塊があるため+2/+2。');
  }
  if(card.name === '飛翔のガーゴイル' && hasSpellInHand()){
    applyStrategyToUnit(unit);
    battleLog('飛翔のガーゴイル：手札に特技があるためさくせん。');
  }
  if(card.name === 'ルバンカ' && topDeckCostIsEven()){
    addCardToHandByName('コイン'); addCardToHandByName('コイン');
    battleLog('ルバンカ：山札トップが偶数コスト。GET(2)。');
  }
  if(card.name === 'ゴンズ' && Number(game.enemy.handCount || 0) >= 6){
    unit.attack += 2; unit.hp += 2; unit.maxHp += 2;
    battleLog('ゴンズ：相手の手札が6枚以上のため+2/+2。');
  }
  if(card.name === 'ゾンビマスター'){
    grantZombieReturnDeathrattle();
  }
  if(card.name === '卑劣などくやずきん'){
    game.pendingGenericEffect = {kind:'damage', amount:1, source:card.name, target:'enemyAny'};
    battleLog('卑劣などくやずきん：1ダメージを与える敵を選んでください。毒なら3ダメージ。');
  }

  // URL/DB個別寄せの代表処理
  if(card.name === 'ツンドラキー' && game.player.hp >= 20){
    unit.attack += 2; unit.keywords.snipe = true;
  }
  if(card.name === 'カミュ'){
    stealEnemyWeaponToHand();
  }
  if(text.includes('敵リーダーの武器を破壊する')){
    destroyEnemyWeapon();
  }
  if(card.name === 'あくまのきし' && hasDemonInHand()){
    game.pendingGenericEffect = {kind:'apathy', source:card.name, target:'enemyAny'};
    battleLog(`${card.name}：行動不能にする敵を選んでください。`);
  }
  if(card.name === 'ポイズンキッス' && hasDemonInHand()){
    applyStatusToAllUnits('poison', 'enemy');
    battleLog('ポイズンキッス：全ての敵ユニットを毒にしました。');
  }



  if(card.name === 'ドラゴンソルジャー'){
    unit.attack += Number(game.player.leaderAttackCount || 0);
  }

  if(card.name === 'マジックリップス'){
    game.player.pendingDemonSummonBuff = {combatOnlyDamageUntil:'opponentTurnEnd', source:card.name};
  }
  if(card.name === '歌姫のマポレーナ' && game.player.tension >= 3){
    game.player.nextSummonBuff = {attack:1, hp:1, source:card.name};
  }

  if(card.name === 'ニセたいこう'){
    game.player.pendingDemonSummonBuff = {taunt:true, source:card.name};
  }
  if(card.name === 'ヒドラ'){
    const n = Number(game.player.discardedCardsThisMatch || 0);
    if(n >= 2) unit.keywords.piercing = true;
    if(n >= 4){ unit.keywords.haste = true; unit.canAttack = true; unit.summoningSickness = false; }
    if(n >= 6){ unit.keywords.doubleAttack = true; unit.attacksLeft = 2; }
  }
  if(card.name === 'フライングデス'){
    if(getEmptyBoardPositions('player').length){
      chooseFriendlyUnitToDestroyThen((dead)=>{
        const cost = Number(byId(dead.cardId)?.cost || 0);
        const choices = game.player.deck.map((id,i)=>({id,i,card:byId(id)})).filter(x=>x.card?.cardType === 'ユニット' && Number(x.card.cost||0) === cost);
        const empties = getEmptyBoardPositions('player');
        if(choices.length && empties.length){
          const pick = chooseRandom(choices, 'flyingDeathDeck', {});
          game.player.deck.splice(pick.i,1);
          putUnitIntoPlayFromCard(pick.card, chooseRandom(empties, 'flyingDeathSlot', {}), 'player');
        }
      }, 'フライングデス：死亡させる味方ユニット');
    }
  }
  if(card.name === 'ライアン' && isFrontRow('player', pos)){
    const behind = getBehindPos('player', pos);
    if(behind >= 0 && !game.player.board[behind]) summonTokenAtPosition('ホイミン', behind, 'player', {attack:1, hp:3});
  }
  if(card.name === '怪獣プスゴン'){
    const empties = getEmptyBoardPositions('enemy');
    if(empties.length){
      openChoiceModal('怪獣プスゴン：イチゴ爆弾を出す敵マス', empties.map(p=>`敵マス${p+1}`), (picked,i)=>{
        summonTokenAtPosition('イチゴ爆弾', empties[i], 'enemy', {attack:0, hp:3});
        renderBattleArena(); syncMyBattleState();
      }, {kind:'enemyEmptySlotChoice'});
    }
  }
  if(card.name === '暗黒大樹の番人' && game.player.unitDiedThisTurn){
    game.pendingGenericEffect = {kind:'summonSpecificToken', tokenName:'暗黒大樹の番人', attack:Number(card.attack||3), hp:Number(card.hp||5), source:card.name, target:'friendlyEmptySlot'};
    battleLog('暗黒大樹の番人：出す味方マスを選んでください。');
  }
  if(card.name === '残響のようじゅつし'){
    // v120: handled by applyZankyoYojutsuV120 near summon start.
  }
  if(card.name === '稽古相手'){
    game.pendingGenericEffect = {kind:'summonSpecificToken', tokenName:'マッスルアニマル', attack:1, hp:1, source:card.name, target:'friendlyEmptySlot'};
    battleLog('稽古相手：マッスルアニマルを出す味方マスを選んでください。');
  }
  if(card.name === '覇海軍王ジャコラ'){
    game.player.combatDamageMultiplier = 2;
    game.enemy.combatDamageMultiplier = 2;
  }
  if(card.name === '魔王の書'){
    game.player.nextCardDiscounts ||= [];
    game.player.nextCardDiscounts.push({cardType:'ユニット', tribe:'魔王', amount:3, until:'turnEnd', source:card.name, minBaseCost:5});
  }


  if(card.name === 'Sキラーマシン'){
    unit.gainAttackOnKillThisTurn = true;
  }
  if(card.name === 'アークマージ'){
    const n = Number(game.player.tensionSkillUseCount || 0);
    unit.attack += n;
    if(unit.attack >= 5) unit.spellDamageBonus = Number(unit.spellDamageBonus || 0) + 2;
  }
  if(card.name === 'ゴールデンドラゴン'){
    const n = Number(game.player.leaderAttackCount || 0);
    unit.hp += n; unit.maxHp += n;
  }
  if(card.name === 'サタンパピー' && game.player.unitDiedThisTurn){
    game.pendingGenericEffect = {kind:'debuffStats', attack:-2, hp:-2, source:card.name, target:'enemyUnit'};
    battleLog('サタンパピー：-2/-2する敵ユニットを選んでください。');
  }
  if(card.name === 'サンディ'){
    unit.returnToHandNextOwnTurnIfAbsent = true;
  }
  if(card.name === 'シャイニング' || card.name === 'スピンサタン'){
    game.player.nextFortuneHit = true;
    battleLog(`${card.name}：次に使用する占いカードは発動効果を選べます。`);
  }
  if(card.name === 'シルバーベア' && game.player.tension >= 3){
    unit.keywords.haste = true; unit.canAttack = true; unit.summoningSickness = false; unit.cannotAttackLeaderThisTurn = true;
  }
  if(card.name === 'スラッピー' && allEnemyUnits().some(u => u.hp < u.maxHp)){
    unit.keywords.haste = true; unit.canAttack = true; unit.summoningSickness = false; unit.cannotAttackLeaderThisTurn = true;
  }
  if(card.name === 'デスマシーン'){
    unit.keywords.deathrattle = true;
  }
  if(card.name === 'デビルロード'){
    unit.cannotAttackLeaderAfterLeaderHit = true;
  }
  if(card.name === 'ドラゴビショップ'){
    drawCard(2);
    const used = Number(game.player.fortuneCardsUsedThisTurn || 0);
    unit.costReductionInHand = used;
  }
  if(card.name === 'ピサロのてさき'){
    unit.revivePissaroKnightIfGood = true;
    unit.keywords.deathrattle = true;
  }
  if(card.name === 'フォレストマスター'){
    if(game.player.heroSkill){ unit.attack += 1; unit.hp += 1; unit.maxHp += 1; }
    else { game.player.nextCardDiscounts ||= []; game.player.nextCardDiscounts.push({cardType:'英雄', amount:3, until:'turnEnd', source:card.name}); }
  }
  if(card.name === 'ホワイトパンサー'){
    unit.conditionGood = true;
  }
  if(card.name === 'マッドファルコン'){
    // コスト低下はgetEffectiveCost側の leaderAttackCount で処理
  }
  if(card.name === '高潔な王パパス'){
    grantLeaderTempAttack(2, card.name);
  }


  if(card.name === 'グリズリー'){
    game.pendingGenericEffect = {kind:'returnEnemyToHandAtkMaxFront', maxAttack:Number(game.player.tension || 0), source:card.name, target:'enemyUnit'};
    battleLog('グリズリー：前列かつ条件以下の攻撃力の敵ユニットを選んでください。');
  }
  if(card.name === 'デュラハンナイト'){
    game.pendingGenericEffect = {kind:'returnEnemyToHandAtkMax', maxAttack:Number(unit.attack || 0), source:card.name, target:'enemyUnit'};
    battleLog('デュラハンナイト：このユニット以下の攻撃力の敵ユニットを選んでください。');
  }
  if(card.name === '牢屋'){
    game.pendingGenericEffect = {kind:'returnEnemyToHandAtkMaxJail', maxAttack:3, source:card.name, target:'enemyUnit'};
    battleLog('牢屋：攻撃力3以下の敵ユニットを選んでください。');
  }
  if(card.name === '修道院'){
    game.pendingGenericEffect = {kind:'monasteryHpAndAdjacentAtk', source:card.name, target:'friendlyUnit', buildingId:unit.id};
    battleLog('修道院：HP+1する味方ユニットを選んでください。');
  }
  if(card.name === '塔'){
    const priority = [0,1,2,3,4,5];
    let made = 0;
    for(const p of priority){
      if(!game.player.board[p] && made < 2){
        summonTokenAtPosition('ピサロナイト', p, 'player', {attack:1, hp:1});
        made++;
      }
    }
    for(const u of game.player.board) if(u?.name === 'ピサロナイト'){ u.attack += 1; u.hp += 1; u.maxHp += 1; }
  }
  if(card.name === '武器屋'){
    addRandomFromOwnDeckToHand(c => c.cardType === '武器' && Number(c.cost || 0) <= 5);
    game.player.weaponDamageBonus = Number(game.player.weaponDamageBonus || 0) + 1;
  }
  if(card.name === '占い小屋'){
    game.player.fortuneMode = 'hit';
    addRandomCardGlobalToHand(c => hasFortuneEffect(c));
  }

  if(card.name === 'ダークプラネット'){
    game.pendingGenericEffect = {kind:'setEnemyBuildingDurability2', source:card.name, target:'enemyUnit'};
    battleLog('ダークプラネット：耐久値を2にする敵建物を選んでください。');
  }
  if(card.name === 'あくまのめだま'){
    game.player.nextDemonSummonBuff = {attack:1, keywords:{snipe:true}};
    battleLog('次に場に出る魔王系の味方ユニットにねらい撃ちと攻撃力+1を付与します。');
  }
  if(card.name === 'オルゴ・デミーラ：第3形態'){
    for(const u of [...game.player.board, ...game.enemy.board]){
      if(u && u !== unit && isAttackableUnit(u)) dealDamageToUnit(u, 2, unit.name);
    }
    resolveDeaths();
  }

  // 条件付き自己バフ
  if(text.includes('地形マスに召喚された場合') && pos >= 0 && game.terrain?.[pos]){
    unit.attack += 1; unit.hp += 1; unit.maxHp += 1;
    battleLog(`${card.name}：地形召喚で+1/+1。`);
  }
  if(text.includes('味方リーダーのHPが20以上') && game.player.hp >= 20){
    if(text.includes('攻撃力+2') || text.includes('攻撃力＋2')) unit.attack += 2;
    if(text.includes('ねらい撃ち')) unit.keywords.snipe = true;
    battleLog(`${card.name}：HP20以上条件を満たしました。`);
  }
  if(text.includes('味方リーダーのHPが15以下') && game.player.hp <= 15){
    if(text.includes('+2/+2') || text.includes('＋2/＋2')){ unit.attack += 2; unit.hp += 2; unit.maxHp += 2; }
    if(text.includes('貫通')) unit.keywords.piercing = true;
    battleLog(`${card.name}：HP15以下条件を満たしました。`);
  }
  const enemyCountHp = text.match(/敵ユニット[１1]体につきHP[+＋](\d+)/);
  if(enemyCountHp){
    const n = game.enemy.board.filter(Boolean).length * Number(enemyCountHp[1]);
    unit.hp += n; unit.maxHp += n;
  }

  // 汎用テキスト処理
  if(text.includes('召喚時')){
    const summonPart = extractAfterKeyword(text, '召喚時') || text;
    applyTextMiniEffect(summonPart, card.name);
  }else{
    applyTextMiniEffect(text, card.name);
  }

  // 対象選択系
  const damageMatch = text.match(/(?:敵ユニット|ユニット|敵1体|敵１体|後列にいるユニット1体|後列にいるユニット１体).*?(\d+)ダメージ/);
  if(damageMatch && text.includes('召喚時') && !text.includes('ランダム') && !text.includes('全て')){
    game.pendingGenericEffect = {kind:'damage', amount:Number(damageMatch[1]), source:card.name, target:'enemyUnit'};
    battleLog(`${card.name}：召喚時ダメージ対象を選んでください。`);
  }
  const buffMatch = text.match(/このターン中ユニット[１1]体の攻撃力[+＋](\d+)/);
  if(buffMatch){
    game.pendingGenericEffect = {kind:'buffAttack', amount:Number(buffMatch[1]), source:card.name, target:'unitAny', allowBuilding:false};
    battleLog(`${card.name}：攻撃力を上げるユニットを選んでください。`);
  }

  // 上下召喚
  const upDown = text.match(/このユニットの上下に([^を]+)を出す/);
  if(upDown){
    summonAboveBelow(unit, upDown[1].trim());
    battleLog(`${card.name}：上下に${upDown[1].trim()}を出しました。`);
  }
}
function triggerTensionLinks(reason, payload={}){
  const game = state.battle.game;
  if(reason !== 'tensionGain' && reason !== 'skillUse') return;
  for(const unit of game.player.board){
    if(!unit || unit.isBuilding || isSealed(unit)) continue;
    const flags = unitKeywords(unit);
    const text = getCardText(byId(unit.cardId));
    const shouldFire = (reason === 'tensionGain' && flags.tensionLink) || (reason === 'skillUse' && flags.skillLink);
    if(!shouldFire) continue;

    if(unit.name === '魅惑のマルティナ' && reason === 'skillUse'){ dealMartinaSkillLinkDamage(); continue; }
    if(unit.name === 'フォステイル' && reason === 'skillUse'){ vanishUnitUntilNextTurnStart(unit, 'フォステイル'); continue; }
    if(unit.name === 'メタッピー' && reason === 'tensionGain'){ grantLeaderTempDamageReduction(3, 'turnEnd', unit.name); continue; }
    if(unit.name === 'メタルキング' && reason === 'tensionGain'){
      const pos = game.player.board.indexOf(unit);
      if(pos >= 0){ game.player.board[pos] = null; game.player.hand.push(unit.cardId); battleLog('メタルキング：手札に戻りました。'); }
      continue;
    }
    if(unit.name === 'おおきづち' && reason === 'tensionGain'){ addTempAttack(unit, 2, unit.name); continue; }
    if(unit.name === 'よるのていおう' && reason === 'tensionGain'){
      const back = [3,4,5].map(p=>({p,u:game.enemy.board[p]})).filter(x=>x.u);
      const frontEmpty = [0,1,2].filter(p=>!game.enemy.board[p]);
      if(back.length && frontEmpty.length){
        const pick = chooseRandom(back, 'yoruNoTeiouBack', {});
        const to = chooseRandom(frontEmpty, 'yoruNoTeiouFront', {});
        game.enemy.board[to] = pick.u; game.enemy.board[pick.p] = null;
      }
      continue;
    }
    if(unit.name === '踊り子マーニャ' && reason === 'tensionGain'){
      const top = byId(game.player.deck?.[0]);
      if(top){
        if(top.cardType !== 'ユニット') addCardIdFromDeckToHandByIndex(game.player.deck, 0, {costDelta:-1});
        else game.player.deck.push(game.player.deck.shift());
      }
      continue;
    }
    if(unit.name === 'スウィートバッグ'){
      const pos = game.player.board.indexOf(unit);
      const fp = getFrontPos('player', pos);
      const front = fp >= 0 ? game.player.board[fp] : null;
      if(front && !front.isBuilding){
        const key = chooseRandom(['piercing','snipe','doubleAttack']);
        front.keywords[key] = true;
        battleLog(`スウィートバッグ：前の味方に${key === 'piercing' ? '貫通' : key === 'snipe' ? 'ねらい撃ち' : '2回攻撃'}を付与。`);
      }
      continue;
    }

    if(text.includes('攻撃力+1') || text.includes('攻撃力＋1')) unit.attack += 1;
    if(text.includes('HP+1') || text.includes('HP＋1')){ unit.hp += 1; unit.maxHp += 1; }
    if(text.includes('HPを1回復')) healLeader(1);
    if(text.includes('カードを1枚引く')) drawCard(1);
    if(text.includes('必中モード')) game.player.fortuneMode = 'hit';
    if(text.includes('超必中モード')) game.player.fortuneMode = 'super';
    battleLog(`${reason === 'skillUse' ? 'スキルリンク' : 'テンションリンク'}：${unit.name}が発動。`);
  }
}
// v157 applyPowerfulBadges is defined above. This stub is kept only to avoid older call-site drift.


function isBuildingUnit(unit){
  return !!unit?.isBuilding;
}
function isAttackableUnit(unit){
  return !!unit && !unit.isBuilding;
}
function canNormalTargetUnit(unit, effect=null){
  // 建物/ダンジョンは通常の攻撃対象・通常のユニット対象にならない。
  // ただし、friendlyDungeonなど専用対象では別途選べる。
  if(!unit) return false;
  if(unit.isBuilding) return effect?.allowBuilding === true || effect?.target === 'friendlyDungeon';
  return true;
}
function buildingHasEndTurnDurabilityLoss(unit){
  const text = getCardText(byId(unit.cardId));
  if(unit.isDungeon) return false;
  return /ターン終了時/.test(text) || /自分のターン終了時/.test(text);
}
function buildingHasStartTurnDurabilityGain(unit){
  const text = getCardText(byId(unit.cardId));
  return unit?.isDungeon && /自分のターン開始時/.test(text) && /耐久値[+＋]1/.test(text);
}
function buildingHasEndTurnDurabilityGain(unit){
  const text = getCardText(byId(unit.cardId));
  return unit?.isDungeon && /自分のターン終了時/.test(text) && /耐久値[+＋]1/.test(text);
}
function hasEnemyTaunt(){
  const game = state.battle.game;
  return game.enemy.board.some(u => isAttackableUnit(u) && u?.keywords?.taunt && !u?.keywords?.stealth);
}

function canTargetEnemyUnit(unit){
  const game = state.battle.game;
  if(!isAttackableUnit(unit)) return false;
  const atkRef = game.selectedAttacker;
  if(!atkRef) return true;
  const atk = atkRef.side === 'playerLeader' ? {keywords:{snipe:false}} : (atkRef.side === 'player' ? game.player.board : game.enemy.board)[atkRef.pos];
  if(atk?.keywords?.snipe) return true;
  if(unit?.keywords?.stealth) return false;
  if(hasEnemyTaunt()) return !!unit?.keywords?.taunt;
  return true;
}


// v112 resource/placement guards
function isCoinResourceCard(card){
  return card?.name === 'コイン' || card?.flags?.coinResource === true || String(card?.text || '').includes('BETを1つ選んで発動');
}
function isBoardPlaceableCardV112(card){
  if(!card) return false;
  if(isCoinResourceCard(card)) return false;
  if(isWeapon(card)) return false;
  return card.cardType === 'ユニット' || card.cardType === '建物';
}
function handleNonBoardCardFromHandV112(index, card){
  if(isPrincessLoveCardV121(card)) return usePrincessLoveV121('player', index);
  if(isCoinResourceCard(card)) return useCoinFromHandV111(index);
  if(isWeapon(card)) return useNonUnitCard(index, card);
  return useNonUnitCard(index, card);
}

function cardCanBeSummoned(card){
  return isBoardPlaceableCardV112(card);
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
    if(target === 'friendlyDungeon'){
      document.querySelectorAll('.unit-slot[data-side="player"]').forEach(slot => {
        const pos = Number(slot.dataset.pos);
        const unit = game.player.board[pos];
        if(unit?.isDungeon) slot.classList.add('targetable');
        else if(unit) slot.classList.add('blocked-target');
      });
      return;
    }
    document.querySelectorAll('.unit-slot').forEach(slot => {
      const side = slot.dataset.side;
      const pos = Number(slot.dataset.pos);
      const unit = side === 'player' ? game.player.board[pos] : game.enemy.board[pos];
      if(!unit) return;
      const sideOk = target.includes('friendly') ? side === 'player' : target.includes('enemy') ? side === 'enemy' : true;
      const targetOk = canNormalTargetUnit(unit, game.pendingGenericEffect || game.pendingHeroSkill);
      const ok = sideOk && targetOk;
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


function renderSoloDebugStripV104(){
  return renderSoloDebugStripV103 ? renderSoloDebugStripV103() : null;
}
function wireSoloControlsV104(){
  return wireSoloControlsV103 ? wireSoloControlsV103() : null;
}
function soloUseTensionSkillV104(){
  return soloUseTensionSkillV103 ? soloUseTensionSkillV103() : null;
}
function renderEnemyHandVisualV104(){
  if(typeof renderEnemyHandVisualV103 === 'function') return renderEnemyHandVisualV103();
  if(typeof renderEnemyHandVisualV102 === 'function') return renderEnemyHandVisualV102();
  return null;
}
function afterRenderSoloV105(){
  if(!isSoloTestMode()) return;
  try{
    renderEnemyHandVisualV104();
  }catch(e){
    console.error('renderEnemyHandVisualV104 failed', e);
    battleLog('ソロUI: 相手手札表示でエラー。');
  }
  try{
    renderSoloDebugStripV104();
  }catch(e){
    console.error('renderSoloDebugStripV104 failed', e);
    battleLog('ソロUI: 手札ストリップ表示でエラー。');
  }
  try{
    wireSoloControlsV104();
  }catch(e){
    console.error('wireSoloControlsV104 failed', e);
    battleLog('ソロUI: ボタン接続でエラー。');
  }
}


function renderBattleArena(){
  const game = state.battle.game;
  if(!game) return;
  $('battle-arena')?.classList.toggle('battle-locked', isSoloTestMode() ? false : !!state.battle.matchLocked);
  if($('battle-arena') && isSoloTestMode()) $('battle-arena').dataset.soloActive = soloActiveSideV114();
  $('player-hp').textContent = game.player.hp;
  $('enemy-hp').textContent = isSoloTestMode() && Number(game.enemy.hp || 0) >= 999999 ? '∞' : game.enemy.hp;
  $('player-mp').textContent = `${game.player.mp}/${game.player.maxMp}`;
  $('enemy-mp').textContent = `${game.enemy.mp}/${game.enemy.maxMp}` + (isSoloTestMode() ? ` 手札${game.enemy.handCount || game.enemy.hand?.length || 0}` : '');
  if($('battle-turn-label')) $('battle-turn-label').textContent = isSoloTestMode() ? `TURN ${game.turn} ${soloSideNameV114(soloActiveSideV114())}` : `TURN ${game.turn}`;
  const endTop = $('end-turn-top');
  if(endTop){
    if(isSoloTestMode()){
      const active = soloActiveSideV114();
      endTop.textContent = `${soloSideNameV114(active)}ターン終了`;
      endTop.disabled = false;
      endTop.removeAttribute('disabled');
      endTop.classList.toggle('opponent-turn', active === 'enemy');
      endTop.onclick = e => { e.preventDefault(); e.stopPropagation(); soloHardTurnSwitchV117(); };
      endTop.ontouchend = e => { e.preventDefault(); e.stopPropagation(); soloHardTurnSwitchV117(); };
    }else{
      const myTurn = !!game.isMyTurn;
      endTop.textContent = myTurn ? 'ターン終了' : '相手のターン';
      endTop.disabled = !myTurn || !!state.battle.matchLocked;
      endTop.classList.toggle('opponent-turn', !myTurn);
    }
  }
  renderTension();
  renderBattleBoard();
  renderBattleHand();
  renderBattleLog();
  const heroBtn = $('hero-skill-button');
  if(heroBtn){ heroBtn.classList.toggle('hidden', !game.player.heroSkill); if(game.player.heroSkill){ const s=getHeroLevelDef(game.player.heroSkill); heroBtn.textContent = s?.type === 'auto' ? `Auto Lv.${game.player.heroSkill.level}` : `Hero Lv.${game.player.heroSkill.level}`; heroBtn.classList.toggle('used', !!game.player.heroSkillUsedThisTurn); } }
  document.querySelector('.player-leader')?.classList.toggle('leader-can-attack', game.player.leaderAttack > 0 && game.player.leaderCanAttack);
  updateTargetHighlights();
  afterRenderSoloV105();
  installSoloCaptureV114();
  installSoloLeaderCaptureV114();
  renderLeaderWeaponsV110();
  installEnemyHandHardCaptureV118();
  installPlacementSlotCaptureV130();
  installSelectionRecoveryV128();
  renderSelectionClearButtonV128();
}

function renderBattleBoard(){
  const game = state.battle.game;
  document.querySelectorAll('.unit-slot').forEach(slot => {
    const side = slot.dataset.side;
    const pos = Number(slot.dataset.pos);
    const board = side === 'player' ? game.player.board : game.enemy.board;
    const unit = board[pos];
    const terrain = side === 'player' ? game.terrain?.[pos] : game.enemyTerrain?.[pos];
    slot.classList.toggle('has-terrain', !!terrain);
    slot.dataset.terrain = terrain?.type || '';
    slot.classList.toggle('has-unit', !!unit);
    slot.classList.toggle('building-slot', !!unit?.isBuilding);
    slot.classList.toggle('dungeon-slot', !!unit?.isDungeon);
    slot.classList.toggle('selected', !unit?.isBuilding && game.selectedAttacker?.side === side && game.selectedAttacker?.pos === pos);
    if(unit){
      const card = byId(unit.cardId);
      const img = getOfficialImage(card);
      const kwBase = summarizeKeywords(unitKeywords(unit) || {});
      const st = (unit.statuses || []).map(s => s?.type || s).filter(Boolean).map(s => ({poison:'毒', sealed:'封', immuneDamage:'壁', darkRobe:'衣', conditionGood:'絶', apathy:'無'}[s] || '')).filter(Boolean).join('/');
      const kw = [kwBase, st].filter(Boolean).join('/');
      const statMods = renderBoardModifierOverlaysV158(card, unit);
      slot.innerHTML = `${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(unit.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}${kw ? `<em class="unit-keyword">${escapeHtml(kw)}</em>` : ''}<span class="unit-atk">${unit.isBuilding ? '建' : unit.attack}</span><span class="unit-hp">${unit.isBuilding ? (unit.durability ?? unit.hp) : unit.hp}</span>${statMods}<span class="unit-hpbar"><i style="width:${Math.max(0, Math.min(100, Math.round(((unit.isBuilding ? (unit.durability ?? unit.hp) : unit.hp) / Math.max(1, unit.isBuilding ? (unit.maxDurability || unit.maxHp || unit.hp || 1) : unit.maxHp)) * 100)))}%"></i></span>`;
      slot.onclick = () => handleBoardClick(side, pos);
      attachLongPress(slot, () => showBattleCardZoom(card, {unit, side}));
    }else{
      slot.innerHTML = terrain ? `<span class="terrain-label">${escapeHtml(terrain.type)}</span>` : '';
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
  if(!hand || !game?.player) return;
  hand.innerHTML = '';
  const ids = game.player.hand || [];
  if(!ids.length && isSoloTestMode()){
    hand.innerHTML = '<div class="hint" style="padding:10px;color:#fff">手札0枚</div>';
    return;
  }
  ids.forEach((id, index) => {
    const realCard = byId(id);
    const card = realCard || {id, name:String(id || '?'), cost:0, cardType:'不明', text:''};
    const btn = document.createElement('button');
    btn.className = `hand-card ${game.selectedHandIndex === index ? 'selected' : ''}`;
    if(!realCard) btn.classList.add('unknown-card');
    const img = getOfficialImage(card);
    const playable = getEffectiveCost(card) <= game.player.mp;
    btn.classList.toggle('unplayable', !playable);
    btn.innerHTML = `${renderHandCostOverlayV158(card)}${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(card.name)}" loading="lazy" referrerpolicy="no-referrer">` : ''}<span>${escapeHtml(card.name)}</span>`;
    btn.draggable = true;
    btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); selectHandCard(index); });
    btn.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); selectHandCard(index); });
    btn.addEventListener('dragstart', e => {
      game.selectedHandIndex = index;
      e.dataTransfer.setData('text/plain', String(index));
      btn.classList.add('dragging');
      renderBattleLog();
    });
    btn.addEventListener('dragend', () => btn.classList.remove('dragging'));
    attachLongPress(btn, () => showBattleCardZoom(card, {hand:true, handIndex:index, side:'player'}));
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
  if(isBattleLocked()) return toast('まだ操作できません。', false);

  const game = state.battle.game;
  if(game?.finished) return;
  if(!game?.isMyTurn) return toast('相手のターンです。', false);
  const card = byId(game.player.hand[index]);
  if(!card) return;
  if(isSpecialMove(card) && game.player.tension < 3){
    toast('必殺技はテンション最大時のみ使用できます。', false);
    return;
  }
  if(getEffectiveCost(card) > game.player.mp){
    toast('MPが足りません。', false);
    return;
  }
  if(!isBoardPlaceableCardV112(card)){
    return handleNonBoardCardFromHandV112(index, card);
  }
  game.selectedHandIndex = index;
  game.selectedAttacker = null;
  battleLog(`${card.name}：召喚先を選んでください。`);
  renderBattleArena();
}

function handleEmptySlotClick(side, pos){
  if(isBattleLocked()) return toast('まだ操作できません。', false);

  const game = state.battle.game;
  if(game?.finished) return;

  // v129: placement waits must win over generic target-cancel guards.
  // Enemy hand placement: only enemy turn + enemy empty slot.
  if(game.pendingEnemyHandPlacementV121 && side === 'enemy'){
    if(soloActiveSideV114() === 'enemy') return placePendingEnemyHandCardAtV121(pos);
    game.pendingEnemyHandPlacementV121 = null;
  }

  // Player hand placement: player turn + player empty slot.
  if(side === 'player' && game.selectedHandIndex != null){
    if(!game?.isMyTurn) return toast('相手のターンです。', false);
    const card = byId(game.player.hand[game.selectedHandIndex]);
    if(!card) return clearBattleSelectionV128('手札カードなし');
    if(!isBoardPlaceableCardV112(card)) return handleNonBoardCardFromHandV112(game.selectedHandIndex, card);
    return summonSelectedCard(pos);
  }

  // Empty slots are invalid targets for damage/attack/hero target selection, but this must run AFTER placement waits.
  if(game.pendingGenericEffect || game.pendingEnemySpellV118 || game.selectedAttacker || game.pendingHeroSkill){
    invalidTargetToastV128('空マスは対象にできません。');
    clearBattleSelectionV128('空マスをタップ');
    return;
  }

  if(side !== 'player') return;
  if(game.pendingHeroSkill?.target === 'friendlyEmptySlot') return applyPendingHeroSkillToEmptySlot(pos);
  if(game.pendingGenericEffect?.target === 'friendlyEmptySlot') return applyPendingGenericEffectToEmptySlot(pos);
}


function summonSelectedCard(pos){
  const game = state.battle.game;
  if(game.player.board[pos]) return;
  const index = game.selectedHandIndex;
  const card = byId(game.player.hand[index]);
  const cost = getEffectiveCost(card);
  if(!card || cost > game.player.mp) return;
  if(!isBoardPlaceableCardV112(card)) return handleNonBoardCardFromHandV112(index, card);
  game.player.mp -= cost;
  if(card.cardType === 'ユニット') game.player.nextUnitCostDelta = 0;
  game.player.hand.splice(index, 1);
  game.selectedHandIndex = null;

  emitEmptySlotSelected('summonSlot', 'player', pos, {card:{id:card.id, name:card.name}});
  summonUnitFromHandToBoard(card, pos, cost);
  emitBattleEvent('cardPlayed', {card, cost, source:'summon'});
  battleLog(`${card.name}を召喚しました。`);

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
  return summonTokenByRuleV134(name, stats, side, '出す');
}

function addRandomCardByPredicate(predicate, fallbackName='スライム'){
  const pool = state.allCards.filter(c => predicate(c));
  if(pool.length) state.battle.game.player.hand.push(chooseRandom(pool).id);
  else addCardToHandByName(fallbackName);
}
function summonCardAtPos(card, pos, side='player', stats={}){
  return !!putUnitIntoPlayFromCard(card, pos, side, stats);
}
function summonRandomUnitAtPos(predicate, pos, side='player'){
  const pool = state.allCards.filter(c => c.cardType === 'ユニット' && predicate(c));
  if(!pool.length) return false;
  return summonCardAtPos(chooseRandom(pool), pos, side);
}
function getPlayerDungeonClearCount(){
  return Number(state.battle.game?.player?.dungeonsCleared || 0);
}
function getNineLv2RequiredUses(){
  return Math.max(1, getPlayerDungeonClearCount());
}
function parseChoiceOptions(text){
  const body = String(text || '').replace(/^.*?選択[:：]/, '');
  return body.split(/・|。・|①|②|③|④|\(1\)|\(2\)|\(3\)|\(4\)/).map(s => s.trim()).filter(Boolean).slice(0,4);
}
function openChoiceModal(title, options, callback, meta={}){
  $('choice-modal-title').textContent = title;
  const body = $('choice-modal-body');
  body.innerHTML = options.map((op,i)=>`<button class="choice-option" data-i="${i}">${escapeHtml(op)}</button>`).join('');
  body.querySelectorAll('.choice-option').forEach(btn => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.i);
    $('choice-modal').close();
    emitChoiceSelected(meta.kind || 'choiceModal', title, options, i, options[i], meta);
    callback(options[i], i);
  }));
  $('choice-modal').showModal();
}


function isDemonTribeCard(card){
  // v157: 効果文に「魔王系」と書いてあるだけのカードを魔王扱いしない。
  return isTribeCard(card, '魔王');
}
function hasDemonInHand(){
  return state.battle.game.player.hand.some(id => isDemonTribeCard(byId(id)));
}
function addEnemyHandCardByName(name){
  const game = state.battle.game;
  game.enemy.handCount = Number(game.enemy.handCount || 0) + 1;
  battleLog(`相手の手札に${name}を加えました。`);
}
function addOrgoNextForm(unit){
  const text = getCardText(byId(unit.cardId));
  if(text.includes('第3形態')) addCardToHandByName('オルゴ・デミーラ：第3形態');
  if(text.includes('第4形態')) addCardToHandByName('オルゴ・デミーラ第4形態');
}
function applyOrgoFourthSplash(attacker, defenderRef, amount){
  const game = state.battle.game;
  const card = byId(attacker?.cardId);
  if(!card || !String(card.name || '').includes('オルゴ・デミーラ第4形態')) return;
  const defBoard = defenderRef.side === 'player' ? game.player.board : game.enemy.board;
  for(const p of getAdjacentVerticalPositions(defenderRef.side, defenderRef.pos)){
    const u = defBoard[p];
    if(u && isAttackableUnit(u)){
      dealDamageToUnit(u, amount, 'オルゴ・デミーラ第4形態', defenderRef.side);
      battleLog('オルゴ・デミーラ第4形態：攻撃対象の上下にもダメージ。');
    }
  }
}
function applyPendingDemonSummonBuff(unit, card){
  const game = state.battle.game;
  if(!unit || !card || !isDemonTribeCard(card) || !game.player.nextDemonSummonBuff) return;
  const b = game.player.nextDemonSummonBuff;
  unit.attack += Number(b.attack || 0);
  unit.keywords = {...(unit.keywords || {}), ...(b.keywords || {})};
  battleLog(`次の魔王系強化：${unit.name}に攻撃力+${b.attack || 0}とキーワードを付与。`);
  game.player.nextDemonSummonBuff = null;
}
function moveEnemyUnitsVertical(delta){
  const game = state.battle.game;
  const old = [...game.enemy.board];
  const next = Array(6).fill(null);
  for(let pos=0; pos<old.length; pos++){
    const u = old[pos];
    if(!u) continue;
    const c = posToCoord('enemy', pos);
    const newRow = Math.max(0, Math.min(2, c.row + delta));
    const np = coordToPos('enemy', newRow, c.col);
    if(np >= 0 && !next[np]) next[np] = u;
    else next[pos] = u;
  }
  game.enemy.board = next;
}
function destroyEnemyWeapon(){
  const game = state.battle.game;
  if(game.enemy.weapon || game.enemy.leaderAttack > 0){
    game.enemy.weapon = null;
    game.enemy.leaderAttack = 0;
    game.enemy.leaderCanAttack = false;
    battleLog('敵リーダーの武器を破壊しました。');
  }
}
function stealEnemyWeaponToHand(){
  const game = state.battle.game;
  const stolen = game.enemy.weapon || (game.enemy.leaderAttack > 0 ? {
    name: '奪った武器',
    attack: Number(game.enemy.leaderAttack || 0),
    durability: Number(game.enemy.weapon?.durability || 1),
    maxDurability: Number(game.enemy.weapon?.maxDurability || game.enemy.weapon?.durability || 1),
    cardText: game.enemy.weapon?.cardText || ''
  } : null);

  if(stolen){
    const attack = Number(stolen.attack || game.enemy.leaderAttack || 0);
    const durability = Number(stolen.durability || 1);
    game.player.weapon = {
      name: stolen.name || '奪った武器',
      attack,
      durability,
      maxDurability: Number(stolen.maxDurability || durability),
      cardText: stolen.cardText || '',
      noCounter: !!stolen.noCounter,
      snipe: !!stolen.snipe,
      doubleAttack: !!stolen.doubleAttack,
      attacksLeft: stolen.doubleAttack ? 2 : 1
    };
    game.player.leaderAttack = attack;
    game.player.leaderCanAttack = attack > 0;
    game.player.leaderAttackedThisTurn = false;

    game.enemy.weapon = null;
    game.enemy.leaderAttack = 0;
    game.enemy.leaderCanAttack = false;
    battleLog(`カミュ：${game.player.weapon.name}を奪い、攻撃力${attack}/耐久${durability}で装備しました。`);
  }else{
    battleLog('奪える敵武器がありません。');
  }
}

function leaderObj(side='player'){
  return side === 'player' ? state.battle.game.player : state.battle.game.enemy;
}
function addLeaderStatus(side, type){
  const l = leaderObj(side);
  l.statuses ||= [];
  if(!l.statuses.some(s => (s?.type || s) === type)) l.statuses.push({type});
}
function leaderHasStatus(side, type){
  const l = leaderObj(side);
  return !!l.statuses?.some(s => (s?.type || s) === type);
}
function applyLeaderPoison(side='enemy'){
  addLeaderStatus(side, 'poison');
}
function getPoisonDamageForSide(side){
  const game = state.battle.game;
  if(side === 'enemy') return 1 + Number(game.player.enemyPoisonBonus || 0);
  return 1 + Number(game.enemy?.playerPoisonBonus || 0);
}
function applyPoisonEndOfTurnDamage(){
  const game = state.battle.game;
  for(const side of ['player','enemy']){
    const player = side === 'player' ? game.player : game.enemy;
    for(const unit of player.board){
      if(!unit || unit.isBuilding) continue;
      if(hasStatus(unit, 'poison')){
        const dmg = getPoisonDamageForSide(side);
        dealDamageToUnit(unit, dmg, '毒', side);
        battleLog(`${unit.name}：毒で${dmg}ダメージ。`);
      }
    }
    if(leaderHasStatus(side, 'poison')){
      const dmg = getPoisonDamageForSide(side);
      dealDamageToLeader(side, dmg, '毒');
      battleLog(`${side === 'enemy' ? '敵' : '味方'}リーダー：毒で${dmg}ダメージ。`);
    }
  }
  resolveDeaths();
}

function isAdventurerCard(card){
  if(!card) return false;
  if(Array.isArray(card.extraTribes) && (card.extraTribes.includes('冒険者') || card.extraTribes.includes('冒険者系'))) return true;
  if(Array.isArray(card.tribes) && (card.tribes.includes('冒険者') || card.tribes.includes('冒険者系'))) return true;
  if(card.tribe === '冒険者' || card.tribe === '冒険者系') return true;
  const text = `${card.name || ''} ${card.tags || ''} ${card.text || ''} ${card.searchText || ''}`;
  return text.includes('冒険者');
}

function addCardCopyToHand(card, opts={}){
  if(!card) return false;
  if((state.battle.game?.player?.hand || []).length >= 10){
    battleLog(`手札上限10枚：${card.name}は破棄されました。`);
    return false;
  }
  const copy = JSON.parse(JSON.stringify(card));
  copy.id = `copy_${card.id}_${Date.now()}_${safeRandomId('rnd').slice(0,8)}`;
  copy.flags ||= {};
  copy.flags.deckBuildable = false;
  if(opts.costDelta) copy.cost = Math.max(0, Number(copy.cost || 0) + Number(opts.costDelta || 0));
  if(opts.costOverride != null) copy.cost = Math.max(0, Number(opts.costOverride || 0));
  if(opts.tempExpiresTurnEnd) copy.tempExpiresTurnEnd = true;
  state.allCards.push(copy);
  state.cards.push(copy);
  state.battle.game.player.hand.push(copy.id);
  if(copy.tempExpiresTurnEnd){
    state.battle.game.player.tempCopyIds ||= [];
    state.battle.game.player.tempCopyIds.push(copy.id);
  }
  return true;
}

function addCardIdFromDeckToHandByIndex(deck, idx, opts={}){
  if(!deck || idx < 0 || idx >= deck.length) return false;
  const id = deck.splice(idx,1)[0];
  const card = byId(id);
  if(opts.copy) return addCardCopyToHand(card, opts);
  if(opts.costDelta || opts.costOverride != null) return addCardCopyToHand(card, opts);
  return addCardIdToPlayerHandV110(id, 'ドロー/サーチ');
}

function randomCardFromOpponentDeckOrPool(predicate=()=>true){
  const game = state.battle.game;
  const ids = Array.isArray(game.enemy.deck) && game.enemy.deck.length ? game.enemy.deck : [];
  const pool = ids.length ? ids.map(id=>byId(id)).filter(Boolean).filter(predicate) : state.allCards.filter(predicate);
  return chooseRandom(pool, 'opponentDeckFallbackRandom', {});
}
function addRandomOpponentDeckCopyToHand(opts={}){
  const card = randomCardFromOpponentDeckOrPool(c => !!c && c.cardType !== 'ヒーロー');
  if(card){ addCardCopyToHand(card, opts); battleLog(`相手デッキから${card.name}のコピーを手札に加えました。`); return true; }
  return false;
}
function addRandomFromOwnDeckToHand(predicate, opts={}){
  const game = state.battle.game;
  const candidates = game.player.deck.map((id,i)=>({id,i,card:byId(id)})).filter(x => x.card && predicate(x.card));
  if(!candidates.length) return false;
  const pick = chooseRandom(candidates, 'ownDeckSearch', {});
  addCardIdFromDeckToHandByIndex(game.player.deck, pick.i, opts);
  battleLog(`${pick.card.name}をデッキから手札に加えました。`);
  return true;
}
function addRandomCardGlobalToHand(predicate, opts={}){
  const card = chooseRandom(state.allCards.filter(c => c && predicate(c)), 'globalCardRandom', {});
  if(!card) return false;
  addCardCopyToHand(card, opts);
  battleLog(`${card.name}を手札に加えました。`);
  return true;
}
function buildingText(unit){ return getCardText(byId(unit?.cardId)); }
function adjustBuildingDurability(unit, amount, source='建物効果'){
  if(!unit?.isBuilding) return false;
  unit.durability = Number(unit.durability || 0) + Number(amount || 0);
  if(unit.isDungeon){
    unit.durability = Math.max(0, unit.durability);
    battleLog(`${source}：${unit.name}の耐久値${amount >= 0 ? '+' : ''}${amount} (${unit.durability}/${unit.maxDurability})`);
    if(unit.durability >= unit.maxDurability) completeDungeon(unit);
  }else{
    const max = Number(unit.maxDurability || unit.maxHp || unit.hp || 1);
    unit.durability = Math.max(0, Math.min(max, unit.durability));
    battleLog(`${source}：${unit.name}の耐久値${amount >= 0 ? '+' : ''}${amount} (${unit.durability}/${max})`);
    if(unit.durability <= 0){
      const pos = state.battle.game.player.board.indexOf(unit);
      if(pos >= 0) state.battle.game.player.board[pos] = null;
      battleLog(`${unit.name}の耐久値が0になり消えました。`);
    }
  }
  return true;
}
function chooseFriendlyBuilding(title, filter, cb){
  const game = state.battle.game;
  const candidates = game.player.board.map((u,pos)=>({u,pos})).filter(x => x.u?.isBuilding && (!filter || filter(x.u, x.pos)));
  if(!candidates.length) return false;
  if(candidates.length === 1){ cb(candidates[0].u, candidates[0].pos); return true; }
  openChoiceModal(title, candidates.map(x=>x.u.name), (picked, i)=>cb(candidates[i].u, candidates[i].pos), {kind:'buildingChoice'});
  return true;
}
function moveOwnTopToBottomOptional(source='効果'){
  return moveDeckTopToBottomOptionalV123('player', source, {});
}

function chooseFromOwnTopCards(count, title, filter, onChoose, restMode='bottom'){
  const game = state.battle.game;
  const top = game.player.deck.slice(0, count).map((id,i)=>({id,i,card:byId(id)})).filter(x=>x.card);
  const candidates = top.filter(x => !filter || filter(x.card));
  if(!candidates.length){
    if(restMode === 'bottomRandom'){
      const removed = game.player.deck.splice(0, Math.min(count, game.player.deck.length));
      shuffle(removed, 'topCardsBottomRandom', {source:title});
      game.player.deck.push(...removed);
    }
    battleLog(`${title}：対象カードがありません。`);
    return false;
  }
  const finish = (chosen) => {
    const removed = game.player.deck.splice(0, Math.min(count, game.player.deck.length));
    const idx = removed.indexOf(chosen.id);
    if(idx >= 0) removed.splice(idx,1);
    onChoose(chosen.card, chosen.id);
    if(restMode === 'topThenBottom'){
      // caller handles special ordering
    }else if(restMode === 'bottomRandom'){
      shuffle(removed, 'topCardsBottomRandom', {source:title});
      game.player.deck.push(...removed);
    }else{
      game.player.deck.push(...removed);
    }
  };
  if(candidates.length === 1){ finish(candidates[0]); return true; }
  openChoiceModal(title, candidates.map(x=>x.card.name), (picked, i)=>{ finish(candidates[i]); renderBattleArena(); syncMyBattleState(); }, {kind:'topDeckChoice', source:title});
  return true;
}
function returnEnemyUnitToOpponentHand(unit, side='enemy'){
  const game = state.battle.game;
  const board = side === 'enemy' ? game.enemy.board : game.player.board;
  const pos = board.indexOf(unit);
  if(pos < 0) return false;
  if(side === 'enemy') addEnemyHandCardByName(unit.name);
  else game.player.hand.push(unit.cardId);
  board[pos] = null;
  battleLog(`${unit.name}を手札に戻しました。`);
  return true;
}
function addTempAttack(unit, amount, source='一時攻撃力'){
  if(!unit) return;
  unit.baseAttackForTurn ??= Number(unit.attack || 0);
  unit.attack += Number(amount || 0);
  unit.tempAttackBuffs ||= [];
  unit.tempAttackBuffs.push({amount:Number(amount||0), source});
}


function grantLeaderTempDamageReduction(amount, until='turnEnd', source='効果'){
  const game = state.battle.game;
  game.player.leaderDamageReduction = Math.max(Number(game.player.leaderDamageReduction || 0), Number(amount || 0));
  game.player.leaderDamageReductionUntil = until;
  battleLog(`${source}：味方リーダー被ダメージ-${amount}。`);
}
function allFriendlyUnits(){
  return state.battle.game.player.board.filter(u => u && !u.isBuilding);
}
function allEnemyUnits(){
  return state.battle.game.enemy.board.filter(u => u && !u.isBuilding);
}
function grantTempAttackAllFriendly(amount, source='効果'){
  for(const u of allFriendlyUnits()) addTempAttack(u, amount, source);
}
function setUnitTempImmuneDamage(unit, until='turnEnd', source='効果'){
  if(!unit) return;
  addStatus(unit, 'immuneDamage', {until, source});
}
function randomFriendlyUnit(){
  const arr = allFriendlyUnits();
  return arr.length ? chooseRandom(arr, 'randomFriendlyUnit', {}) : null;
}
function randomEnemyEmptySlot(){
  const arr = getEmptyBoardPositions('enemy');
  return arr.length ? chooseRandom(arr, 'enemyEmptySlot', {}) : -1;
}

function findOwnUnitPosition(unit){
  return state.battle.game.player.board.indexOf(unit);
}
function summonTokenAtFirstEmpty(name, stats={}, side='player'){
  const game = state.battle.game;
  const board = side === 'enemy' ? game.enemy.board : game.player.board;
  const pos = board.findIndex(x=>!x);
  if(pos < 0) return false;
  return summonTokenAtPosition(name, pos, side, stats);
}
function chooseFriendlyUnitToDestroyThen(cb, title='味方ユニットを選んでください'){
  const game = state.battle.game;
  const candidates = game.player.board.map((u,pos)=>({u,pos})).filter(x=>x.u && !x.u.isBuilding);
  if(!candidates.length) return false;
  openChoiceModal(title, candidates.map(x=>x.u.name), (picked,i)=>{
    const target = candidates[i];
    target.u.hp = 0;
    resolveDeaths();
    if(cb) cb(target.u);
    renderBattleArena(); syncMyBattleState();
  }, {kind:'friendlyDestroyChoice'});
  return true;
}
function hasCardNamedInHand(name){
  return state.battle.game.player.hand.some(id => byId(id)?.name === name);
}
function addRandomUsedSpellToHand(source='効果'){
  const game = state.battle.game;
  const ids = game.player.usedSpellCardIds || [];
  const cards = ids.map(id=>byId(id)).filter(Boolean);
  const c = cards.length ? chooseRandom(cards, 'usedSpellToHand', {source}) : null;
  if(c) return addCardCopyToHand(c), true;
  return false;
}

function discardHandCardAtIndex(idx, source='捨てる'){
  const game = state.battle.game;
  if(idx < 0 || idx >= game.player.hand.length) return null;
  const [id] = game.player.hand.splice(idx,1);
  game.player.discarded ||= [];
  game.player.discarded.push(id);
  game.player.discardedThisTurn = true;
  game.player.discardedCardsThisMatch = Number(game.player.discardedCardsThisMatch || 0) + 1;
  for(const u of game.player.board) if(u?.name === 'うらぎりこぞう') addTempAttack(u, 1, u.name);
  return id;
}

function buffHandCopiesOfUsedSpellsCost(delta=-1){
  const game = state.battle.game;
  const used = new Set(game.player.usedSpellCardIds || []);
  for(const id of [...game.player.hand]){
    const c = byId(id);
    if(c && used.has(c.id)) c.cost = Math.max(0, Number(c.cost || 0) + delta);
  }
}

function addLeaderAttackCountScaling(unit, stat='attack', amount=1){
  const n = Number(state.battle.game.player.leaderAttackCount || state.battle.game.player.leaderAttacksThisMatch || 0);
  if(stat === 'hp'){ unit.hp += n*amount; unit.maxHp += n*amount; }
  else unit.attack += n*amount;
}

function grantLeaderTempAttack(amount, source='一時攻撃力'){
  const game = state.battle.game;
  game.player.baseLeaderAttackForTurn ??= Number(game.player.leaderAttack || 0);
  game.player.leaderAttack = Number(game.player.leaderAttack || 0) + Number(amount || 0);
  game.player.leaderCanAttack = game.player.leaderAttack > 0;
  game.player.leaderTempAttackBuffs ||= [];
  game.player.leaderTempAttackBuffs.push({amount:Number(amount||0), source});
}
function grantUntilOwnTurnStart(key, value=true){
  const game = state.battle.game;
  game.player.untilOwnTurnStart ||= {};
  game.player.untilOwnTurnStart[key] = value;
}
function clearUntilOwnTurnStart(){
  const game = state.battle.game;
  game.player.untilOwnTurnStart = {};
  game.player.leaderDamageReduction = 0;
  game.player.leaderDamageReductionUntil = '';
}
function resetTurnTemporaryBuffs(){
  const game = state.battle.game;
  for(const u of game.player.board){
    if(u?.doubleStatsAtTurnEnd){ u.attack *= 2; u.hp *= 2; u.maxHp *= 2; delete u.doubleStatsAtTurnEnd; }
    if(u) u.statuses = (u.statuses || []).filter(s => s.until !== 'turnEnd');
    if(u && u.baseAttackForTurn != null){
      u.attack = Number(u.baseAttackForTurn || u.attack || 0);
      delete u.baseAttackForTurn;
      delete u.tempAttackBuffs;
    }
  }
  if(game.player.baseLeaderAttackForTurn != null){
    game.player.leaderAttack = Number(game.player.baseLeaderAttackForTurn || 0);
    delete game.player.baseLeaderAttackForTurn;
  }
  game.player.turnSpellDamageBonus = 0;
  game.player.tempMpBonus = 0;
  game.player.leaderNoWeaponDurabilityLoss = false;
  game.player.leaderSuperPiercingThisTurn = false;
  game.player.leaderVerticalSplashThisTurn = false;
}

function getEmptyBoardPositions(side='player'){
  const board = side === 'enemy' ? state.battle.game.enemy.board : state.battle.game.player.board;
  const out = [];
  for(let i=0;i<board.length;i++) if(!board[i]) out.push(i);
  return out;
}
function putUnitIntoDeckAndShuffle(unit, side='player', source='効果'){
  const game = state.battle.game;
  const cardId = unit?.cardId;
  if(!cardId) return false;
  const player = side === 'enemy' ? game.enemy : game.player;
  player.deck ||= [];
  player.deck.push(cardId);
  shuffle(player.deck, 'deckShuffle', {source});
  battleLog(`${unit.name}をデッキに混ぜました。`);
  return true;
}

// v131: Akumano Kagami correct source search, Slaringal turn-end processing, face-up choice images, swipe-safe hand tap
function deckAndHandAdventurerCandidatesV131(){
  const game = state.battle.game;
  const out = [];
  (game.player.deck || []).forEach((id,i)=>{
    const card = byId(id);
    if(isRealAdventurerForKagamiV132(card)) out.push({zone:'deck', index:i, id, card});
  });
  (game.player.hand || []).forEach((id,i)=>{
    const card = byId(id);
    if(isRealAdventurerForKagamiV132(card)) out.push({zone:'hand', index:i, id, card});
  });
  return out;
}

function processSideTurnEndV131(side='player'){
  const game = state.battle.game;
  const obj = side === 'enemy' ? game.enemy : game.player;
  const board = obj.board || [];
  triggerPowerfulBadgeTurnEndV157(side);
  for(let i=0;i<board.length;i++){
    const u = board[i];
    if(!u) continue;
    if(u.temporaryDeckReturnAtTurnEnd){
      board[i] = null;
      putUnitIntoDeckAndShuffle(u, side, u.name || '一時ユニット');
      battleLog(`${u.name}：ターン終了時にデッキに戻りました。`);
      continue;
    }
    if(u.returnToEnemyAtTurnEnd && side === 'player'){
      board[i] = null;
      const ep = game.enemy.board.findIndex(x=>!x);
      if(ep >= 0){ delete u.returnToEnemyAtTurnEnd; game.enemy.board[ep] = u; battleLog(`${u.name}：ターン終了時、相手の場に戻りました。`); }
      continue;
    }
    if(u.doubleStatsAtTurnEnd){
      u.attack = Number(u.attack || 0) * 2;
      u.hp = Number(u.hp || 0) * 2;
      u.maxHp = Number(u.maxHp || 0) * 2;
      delete u.doubleStatsAtTurnEnd;
      battleLog(`${u.name}：ターン終了時、攻撃力とHPが2倍。`);
    }
    if(u.statuses){
      const before = u.statuses.length;
      u.statuses = u.statuses.filter(s => s.until !== 'turnEnd');
      if(before !== u.statuses.length && u.name === 'スラリンガル') battleLog('スラリンガル：このターン中のダメージ無効が終了しました。');
    }
    if(u.cannotAttackLeaderThisTurn) delete u.cannotAttackLeaderThisTurn;
  }
}
function recordSoloHandPointerV131(e){
  const p = e.touches?.[0] || e.changedTouches?.[0] || e;
  window.__soloHandGestureV131 = {x:Number(p.clientX || 0), y:Number(p.clientY || 0), t:Date.now(), moved:false};
  return true;
}
function installSoloHandSwipeGuardV131(){
  if(window.__soloHandSwipeGuardV131Installed) return;
  window.__soloHandSwipeGuardV131Installed = true;
  const mark = (e) => {
    const g = window.__soloHandGestureV131;
    if(!g) return;
    const p = e.touches?.[0] || e.changedTouches?.[0] || e;
    const dx = Math.abs(Number(p.clientX || 0) - g.x);
    const dy = Math.abs(Number(p.clientY || 0) - g.y);
    if(dx > 6 || dy > 10){ g.moved = true; window.__soloHandSwipeSuppressUntilV131 = Date.now() + 900; }
  };
  document.addEventListener('pointermove', mark, true);
  document.addEventListener('touchmove', mark, {capture:true, passive:true});
}
function openSoloHandCardModalTapSafeV131(side, index, ev=null){
  const g = window.__soloHandGestureV131;
  const p = ev?.changedTouches?.[0] || ev?.touches?.[0] || ev;
  let moved = !!g?.moved || Date.now() < Number(window.__soloHandSwipeSuppressUntilV131 || 0);
  if(g && p && p.clientX != null){
    const dx = Math.abs(Number(p.clientX || 0) - g.x);
    const dy = Math.abs(Number(p.clientY || 0) - g.y);
    if(dx > 6 || dy > 10) moved = true;
  }
  if(moved){
    window.__soloHandSwipeSuppressUntilV131 = Date.now() + 900;
    return true;
  }
  return openSoloHandCardModalV121(side, index, ev);
}
window.recordSoloHandPointerV131 = recordSoloHandPointerV131;
window.openSoloHandCardModalTapSafeV131 = openSoloHandCardModalTapSafeV131;
function openFaceBackChoiceModalV131(title, faceIds, backIds, cb){
  const old = document.getElementById('face-back-choice-modal-v131');
  if(old) old.remove();
  const faceCards = (faceIds || []).map(id=>byId(id)).filter(Boolean);
  const modal = document.createElement('div');
  modal.id = 'face-back-choice-modal-v131';
  modal.className = 'face-back-choice-backdrop-v131';
  const faceHtml = faceCards.map(c=>{
    const img = getOfficialImage(c);
    return `<div class="face-card-v131">${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(c.name)}" referrerpolicy="no-referrer">` : `<div class="face-card-noimg-v131">${escapeHtml(c.name)}</div>`}<span>${escapeHtml(c.name)}</span></div>`;
  }).join('');
  const backHtml = (backIds || []).map(()=>`<div class="back-card-v131"><span>?</span></div>`).join('');
  modal.innerHTML = `<div class="face-back-choice-panel-v131">
    <div class="face-back-title-v131">${escapeHtml(title)}</div>
    <button class="face-back-option-v131" data-pick="0"><div class="face-back-label-v131">表のカードを引く</div><div class="face-list-v131">${faceHtml}</div></button>
    <button class="face-back-option-v131" data-pick="1"><div class="face-back-label-v131">裏のカードを引く</div><div class="face-list-v131">${backHtml}</div></button>
    <button class="face-back-cancel-v131">戻る</button>
  </div>`;
  modal.addEventListener('click', e => { if(e.target === modal) modal.remove(); });
  modal.querySelector('.face-back-cancel-v131')?.addEventListener('click', ()=>modal.remove());
  modal.querySelectorAll('[data-pick]').forEach(btn => btn.addEventListener('click', e=>{
    const i = Number(btn.dataset.pick || 0);
    modal.remove();
    cb(i);
  }));
  document.body.appendChild(modal);
}
function resolveRomiaChoiceV131(){
  const game = state.battle.game;
  const top = game.player.deck.splice(0, Math.min(4, game.player.deck.length));
  if(!top.length) return false;
  const faceA = top.slice(0,2), faceB = top.slice(2,4);
  openFaceBackChoiceModalV131('ロミア：どちらを引きますか？', faceA, faceB, (i)=>{
    const chosen = i === 0 ? faceA : faceB;
    const discarded = i === 0 ? faceB : faceA;
    game.player.hand.push(...chosen);
    game.player.discarded ||= [];
    game.player.discarded.push(...discarded);
    battleLog(`ロミア：${i === 0 ? '表' : '裏'}の${chosen.length}枚を手札へ。残りを捨てました。`);
    renderBattleArena(); syncMyBattleState();
  });
  return true;
}

function summonAdventurerFromDeckTemporaryByAkumanoKagami(){
  const game = state.battle.game;
  const candidates = deckAndHandAdventurerCandidatesV131();
  if(!candidates.length){ battleLog('あくまのカガミ：山札・手札に5コスト以下の冒険者ユニットがありません。'); return false; }
  const pick = chooseRandom(candidates, 'akumanoKagamiAdventurer', {});
  const empty = getEmptyBoardPositions('player');
  if(!empty.length){ battleLog('あくまのカガミ：場が埋まっているため場に出せません。'); return false; }
  const pos = chooseRandom(empty, 'akumanoKagamiSlot', {});
  const unit = putUnitIntoPlayFromCard(pick.card, pos, 'player', {haste:true});
  if(unit){
    unit.temporaryDeckReturnAtTurnEnd = true;
    unit.summonedByAkumanoKagami = true;
    unit.keywords ||= {};
    unit.keywords.haste = true;
    unit.canAttack = true;
    unit.summoningSickness = false;
    addStatus(unit, 'temporaryDeckReturnAtTurnEnd', {until:'turnEnd'});
    battleLog(`あくまのカガミ：${pick.card.name}を${pick.zone === 'hand' ? '手札' : '山札'}からコピーして場に出し、速攻とターン終了時デッキに戻る効果を付与。`);
    return true;
  }
  return false;
}
function applyAllStrategyEffects(unit, source='さくせん'){
  const all = [
    'ガンガンいこうぜ',
    'いのちだいじに',
    'バッチリがんばれ',
    'ここでまってて',
    'かってにしてね',
    'とにかくにげて',
    'せんりょくうばえ',
    'いろいろやろうぜ',
    'まもりをかためろ'
  ];
  for(const name of all) applyStrategyEffect(unit, name);
  battleLog(`${source}：すべてのさくせん効果を得ました。`);
}
function countFriendlyBuildingsPlayed(){
  const game = state.battle.game;
  return Number(game.player.buildingsPlayed || 0) + game.player.board.filter(u => u?.isBuilding).length;
}
function vanishUnitUntilNextTurnStart(unit, source='フォステイル'){
  const game = state.battle.game;
  const pos = game.player.board.indexOf(unit);
  if(pos < 0) return false;
  game.player.delayedReturnUnits ||= [];
  game.player.delayedReturnUnits.push({
    source,
    returnAtTurnStart: game.turn + 1,
    preferredPos: pos,
    unit: JSON.parse(JSON.stringify(unit))
  });
  game.player.board[pos] = null;
  battleLog(`${source}：1ターン先の未来へ旅立ちました。`);
  renderBattleArena();
  syncMyBattleState();
  return true;
}
function returnDelayedUnitsAtTurnStart(){
  const game = state.battle.game;
  const list = game.player.delayedReturnUnits || [];
  if(!list.length) return;
  const keep = [];
  for(const item of list){
    if(Number(item.returnAtTurnStart || 0) > Number(game.turn || 0)){ keep.push(item); continue; }
    let pos = item.preferredPos;
    if(pos == null || game.player.board[pos]){
      battleLog(`${item.source || item.unit?.name}：元の場所が埋まっているため戻れません。`);
      continue;
    }
    const unit = item.unit;
    unit.canAttack = false;
    unit.summoningSickness = true;
    game.player.board[pos] = unit;
    battleLog(`${item.source || unit.name}が場に戻りました。`);
  }
  game.player.delayedReturnUnits = keep;
}

function topDeckCard(){
  const game = state.battle.game;
  const id = game.player.deck?.[0];
  return byId(id);
}
function topDeckCostIsEven(){
  const c = topDeckCard();
  return c && Number(c.cost || 0) % 2 === 0;
}
function hasSpellInHand(){
  return state.battle.game.player.hand.some(id => isSpell(byId(id)));
}
function hasEnemyIceBlock(){
  const game = state.battle.game;
  return game.enemy.board.some(u => u?.name === '氷塊') || game.enemyTerrain?.some(t => t?.type === '氷塊');
}
function applyTempDamageReduction(unit, amount=1){
  unit.damageReduction = Math.max(Number(unit.damageReduction || 0), amount);
  addStatus(unit, 'damageReduction', {until:'opponentTurnEnd', amount});
}
function oncePerTurnBetAllowed(unit){
  const game = state.battle.game;
  if(unit.lastBetTurn === game.turn) return false;
  unit.lastBetTurn = game.turn;
  return true;
}
function applyTargetedBet(unit){
  if(!unit) return false;
  const game = state.battle.game;
  const card = byId(unit.cardId);
  const name = unit.name;
  if(name === 'デビルパピヨン'){
    poisonRandomEnemyUnit();
    battleLog('デビルパピヨンBET：ランダムな敵ユニットを毒にしました。');
    return true;
  }


  if(name === 'ベホイミスライム'){
    if(!oncePerTurnBetAllowed(unit)) return toast('ベホイミスライムへのBETは1ターンに1回だけです。', false), true;
    healLeader(2);
    return true;
  }

  if(name === 'ぷちメタル'){
    if(!oncePerTurnBetAllowed(unit)) return toast('ぷちメタルへのBETは1ターンに1回だけです。', false), true;
    unit.attack += 1;
    unit.keywords.haste = true; unit.canAttack = true; unit.summoningSickness = false;
    battleLog('ぷちメタルBET：攻撃力+1と速攻。');
    return true;
  }
  if(name === 'まかいファイター'){
    grantLeaderTempAttack(1, name);
    unit.makaiBetCount = Number(unit.makaiBetCount || 0) + 1;
    if(unit.makaiBetCount % 4 === 0) summonTokenByName('まかいファイター', {attack:2, hp:2}, 'player');
    return true;
  }
  if(name === 'ジラフマスター'){
    const pick = chooseRandom(['atk','hp','double'], 'giraffeBet', {});
    if(pick === 'atk') unit.attack += 1;
    else if(pick === 'hp'){ unit.hp += 1; unit.maxHp += 1; }
    else { unit.keywords.doubleAttack = true; unit.attacksLeft = Math.max(Number(unit.attacksLeft||1), 2); }
    return true;
  }
  if(name === 'ギガデーモン'){
    unit.keywords.haste = true; unit.canAttack = true; unit.summoningSickness = false;
    return true;
  }

  if(name === 'クラウンヘッド'){
    if(!oncePerTurnBetAllowed(unit)) return toast('クラウンヘッドへのBETは1ターンに1回だけです。', false), true;
    unit.hp += 1; unit.maxHp += 1;
    applyTempDamageReduction(unit, 1);
    battleLog('クラウンヘッドBET：HP+1、次の相手ターン終了まで被ダメージ-1。');
    return true;
  }
  if(name === 'チャゴス王子'){
    if(!oncePerTurnBetAllowed(unit)) return toast('チャゴス王子へのBETは1ターンに1回だけです。', false), true;
    unit.keywords.haste = true; unit.canAttack = true; unit.summoningSickness = false;
    battleLog('チャゴス王子BET：速攻を得ました。');
    return true;
  }
  if(name === 'インプ'){
    if(!oncePerTurnBetAllowed(unit)) return toast('インプへのBETは1ターンに1回だけです。', false), true;
    const top = topDeckCard();
    if(top && Number(top.cost || 0) % 2 === 0){ dealDamageToLeader('enemy', 2, 'インプBET'); battleLog('インプBET：山札トップが偶数コスト。敵リーダーに2ダメージ。'); }
    else battleLog('インプBET：山札トップが偶数コストではありません。');
    return true;
  }
  if(name === 'ルバンカ'){
    unit.hp += 1; unit.maxHp += 1;
    battleLog('ルバンカBET：HP+1。');
    return true;
  }
  if(name === 'ぶちスライム'){
    unit.attack += 1;
    battleLog('ぶちスライムBET：攻撃力+1。');
    return true;
  }

  if(name === 'ミリオンゼニー'){
    if(!unit.betDeathGet2){ unit.betDeathGet2 = true; unit.keywords.deathrattle = true; }
    battleLog('ミリオンゼニーBET：死亡時GET(2)を付与しました。');
    return true;
  }
  if(name === 'かっちゅうアリ'){
    if(!oncePerTurnBetAllowed(unit)) return toast('かっちゅうアリへのBETは1ターンに1回だけです。', false), true;
    unit.attack += 1; unit.hp += 1; unit.maxHp += 1;
    battleLog('かっちゅうアリBET：+1/+1。');
    return true;
  }
  if(name === 'ウルベア魔神兵' || name === 'ウルベア魔人兵'){
    const v = 1 + randomIndex(4, 'ulubeaBet', {card:'ウルベア魔神兵'});
    unit.attack += v;
    battleLog(`ウルベア魔神兵BET：攻撃力+${v}。`);
    return true;
  }
  if(name === 'ファイアボール'){
    applyLeaderDamageReduction(5);
    return true;
  }
  if(name === 'アイラ'){
    equipRandomWeaponToLeader();
    return true;
  }
  if(name === 'レモンキング'){
    summonSlimes(2);
    battleLog('レモンキングBET：スライムを2体出しました。');
    return true;
  }


  if(name === 'クラーゴン'){
    unit.kragonBetUsed ||= [];
    const pool = [1,2,3].filter(x => !unit.kragonBetUsed.includes(x));
    const pick = chooseRandom(pool);
    if(!pick){ battleLog('クラーゴンBET：このターン中の効果は全て発動済みです。'); return true; }
    unit.kragonBetUsed.push(pick);
    if(pick === 1){
      for(const u of game.enemy.board) if(u && isAttackableUnit(u)) dealDamageToUnit(u,1,'クラーゴン', 'enemy');
      dealDamageToLeader('enemy',1,'クラーゴン');
      resolveDeaths();
      battleLog('クラーゴンBET：全ての敵に1ダメージ。');
    }else if(pick === 2){
      damageRandomEnemy(2, true);
      resolveDeaths();
      battleLog('クラーゴンBET：ランダムな敵1体に2ダメージ。');
    }else{
      dealDamageToLeader('enemy',3,'クラーゴン');
      battleLog('クラーゴンBET：敵リーダーに3ダメージ。');
    }
    return true;
  }
  if(name === '少女マリベル'){
    game.player.nextSpellCostDelta = Math.min(Number(game.player.nextSpellCostDelta || 0), -2);
    battleLog('少女マリベルBET：次に使う特技カードのコスト-2。');
    return true;
  }
  if(name === 'アサシンクロー'){
    addMartialArtsCard();
    return true;
  }
  if(name === 'カンダタこぶん' || name === 'カンタダこぶん'){
    game.player.nextTensionCostZero = true;
    battleLog('カンダタこぶんBET：次のテンションボタンのコストが0になります。');
    return true;
  }
  if(name === 'ゴルゴンゾーラ'){
    healUnit(unit, 3);
    battleLog('ゴルゴンゾーラBET：自身のHPを3回復。');
    return true;
  }
  if(name === 'きりかぶおばけ'){
    if(!oncePerTurnBetAllowed(unit)) return toast('きりかぶおばけへのBETは1ターンに1回だけです。', false), true;
    if(!buffRandomOtherFriendly(unit, 0, 2)) battleLog('きりかぶおばけBET：他の味方ユニットがいません。');
    return true;
  }
  if(name === 'ルドマン'){
    addToolCard();
    return true;
  }


  if(name === 'まだらイチョウ'){
    summonTokenByName('ブラックタヌー', {attack:1, hp:2}, 'player');
    unit.madaraBetCount = Number(unit.madaraBetCount || 0) + 1;
    if(unit.madaraBetCount % 3 === 0){
      buffAllOtherFriendly(unit, 1, 1);
      battleLog('まだらイチョウBET：3回目ごと効果で他の味方全体+1/+1。');
    }
    return true;
  }
  if(name === '賢者ルシェンダ'){
    topDeckEvenUnitToBoardOrDraw();
    return true;
  }
  if(name === '黄金兵長'){
    summonTokenByName('ピサロナイト', {attack:1, hp:1}, 'player');
    battleLog('黄金兵長BET：ピサロナイトを1体出しました。');
    return true;
  }

  return false;
}
function reviveUnitSameSlot(snapshot, side, pos){
  const game = state.battle.game;
  const board = side === 'player' ? game.player.board : game.enemy.board;
  if(board[pos]) return false;
  const revived = {...snapshot, id:`revive_${Date.now()}_${safeRandomId('rnd').slice(0,8)}`};
  revived.hp = revived.maxHp || revived.hp || 1;
  revived.canAttack = false;
  revived.summoningSickness = true;
  board[pos] = revived;
  battleLog(`${revived.name}が復活しました。`);
  applySynchroIfAny(byId(revived.cardId), revived);
  return true;
}
function grantReviveOnDeath(unit){
  if(!unit) return;
  unit.reviveOnDeath = true;
  addStatus(unit, 'revive');
}
function grantReturnSelfDeathrattle(unit){
  if(!unit) return;
  unit.returnSelfOnDeath = true;
  addStatus(unit, 'returnSelf');
}
function grantZombieReturnDeathrattle(){
  const game = state.battle.game;
  const candidates = game.player.board.filter(u => u && u.name !== 'ゾンビマスター' && !u.isBuilding && String(byId(u.cardId)?.tribes || byId(u.cardId)?.searchText || '').includes('ゾンビ'));
  const target = randomFrom(candidates);
  if(target){
    grantReturnSelfDeathrattle(target);
    battleLog(`ゾンビマスター：${target.name}に死亡時手札へ戻る効果を付与。`);
  }
}
function drawSpellCost5Plus(){
  const n = drawTopFromDeck(c => isSpell(c) && Number(c.cost || 0) >= 5, 1);
  if(n) battleLog('コスト5以上の特技カードを1枚引きました。');
}


function randomUnitCardByCost(cost){
  const pool = state.allCards.filter(c => c.cardType === 'ユニット' && Number(c.cost || 0) === Number(cost));
  return chooseRandom(pool);
}
function addRandomUnitCardToEnemyHandByCost(cost){
  const c = randomUnitCardByCost(cost);
  if(c) addEnemyHandCardByName(c.name);
}
function addRandomSpellCostAtLeast(min=1, count=1){
  for(let i=0;i<count;i++){
    const pool = state.allCards.filter(c => isSpell(c) && Number(c.cost || 0) >= min);
    const c = chooseRandom(pool);
    if(c) addCardToHandByName(c.name);
  }
}
function addRandomClassSpellCost1to3(){
  const game = state.battle.game;
  const cls = game.className || '';
  const pool = state.allCards.filter(c => isSpell(c) && Number(c.cost || 0) >= 1 && Number(c.cost || 0) <= 3 && String(c.classes || c.leader || '').includes(cls.replace(/\\(.+\\)/,'')));
  const c = chooseRandom(pool.length ? pool : state.allCards.filter(c => isSpell(c) && Number(c.cost || 0) >= 1 && Number(c.cost || 0) <= 3));
  if(c) addCardToHandByName(c.name);
}
function drawAdventurerFromDeck(){
  const game = state.battle.game;
  const idx = game.player.deck.findIndex(id => isAdventurerCard(byId(id)));
  if(idx >= 0){ game.player.hand.push(game.player.deck.splice(idx,1)[0]); battleLog('冒険者カードを1枚引きました。'); }
}
function applyAdventurerGlobalBuff(){
  const game = state.battle.game;
  game.player.adventurerBuff = Number(game.player.adventurerBuff || 0) + 1;
  for(const u of game.player.board){
    if(u && isAdventurerCard(byId(u.cardId))){
      u.attack += 1; u.hp += 1; u.maxHp += 1;
    }
  }
  battleLog('冒険者カードに+1/+1を付与しました。');
}
function applyStoredAdventurerBuff(unit, card){
  const n = Number(state.battle.game?.player?.adventurerBuff || 0);
  if(n && unit && isAdventurerCard(card)){
    unit.attack += n; unit.hp += n; unit.maxHp += n;
  }
}
function enemySameRowUnitsForPlayerPos(pos){
  const game = state.battle.game;
  const row = posToCoord('player', pos).row;
  return [coordToPos('enemy', row, 2), coordToPos('enemy', row, 3)].map(p => ({pos:p, unit:game.enemy.board[p]})).filter(x => x.unit);
}
function moveAllEnemyBackToFront(){
  const game = state.battle.game;
  for(let row=0; row<3; row++){
    const back = coordToPos('enemy', row, 3);
    const front = coordToPos('enemy', row, 2);
    if(game.enemy.board[back] && !game.enemy.board[front]){
      game.enemy.board[front] = game.enemy.board[back];
      game.enemy.board[back] = null;
    }
  }
}
function dealMartinaSkillLinkDamage(){
  const game = state.battle.game;
  for(let i=0;i<7;i++){
    const row = randomIndex(3, 'martinaSkillLinkRow', {i});
    const pos = coordToPos('enemy', row, 2);
    const u = game.enemy.board[pos];
    if(u) dealDamageToUnit(u, 1, '魅惑のマルティナ', 'enemy');
  }
  resolveDeaths();
  battleLog('魅惑のマルティナ：敵前列ランダムマスに合計7ダメージ。');
}
function summonRandomUnitByCost(cost){
  const game = state.battle.game;
  const pos = game.player.board.findIndex(x=>!x);
  if(pos < 0) return false;
  const c = randomUnitCardByCost(cost);
  if(!c) return false;
  putUnitIntoPlayFromCard(c, pos, 'player');
  battleLog(`${c.name}を場に出しました。`);
  return true;
}
function summonRandomUnitCost1(){
  return summonRandomUnitByCost(1);
}
function copyUnitToOppositeRow(unit){
  const game = state.battle.game;
  const pos = game.player.board.indexOf(unit);
  if(pos < 0) return false;
  const front = getFrontPos('player', pos);
  const behind = getBehindPos('player', pos);
  const to = front >= 0 ? front : behind;
  if(to >= 0 && !game.player.board[to]){
    const c = byId(unit.cardId);
    const copy = makeUnitFromCard(c);
    copy.attack = unit.attack; copy.hp = unit.hp; copy.maxHp = unit.maxHp;
    copy.keywords = {...unit.keywords};
    game.player.board[to] = copy;
    emitBattleEvent('unitPutIntoPlay', {unit:copy, card:c, pos:to, side:'player', source:'copy'});
    battleLog(`${unit.name}のコピーを前後に出しました。`);
    return true;
  }
  return false;
}
function grantFishDeathrattle(unit){
  if(!unit) return;
  unit.deathSummonFish = true;
  unit.keywords.deathrattle = true;
  addStatus(unit, 'fishDeathrattle');
}
function addRandomOpponentHandCopy(){
  const game = state.battle.game;
  const ids = (game.enemy.hand || []).filter(id => byId(id));
  if(!ids.length){
    battleLog('マヤ：相手手札が同期されていない/空のためコピーできません。');
    return false;
  }
  const id = chooseRandom(ids);
  const c = byId(id);
  if(c){
    addCardToHandByName(c.name);
    battleLog(`マヤ：相手の手札から${c.name}と同じカードを手札に加えました。`);
    return true;
  }
  return false;
}
function addTemporaryCopyToHand(card){
  const tempId = `temp_copy_${card.id}_${Date.now()}_${safeRandomId('rnd').slice(0,8)}`;
  const copy = JSON.parse(JSON.stringify(card));
  copy.id = tempId;
  copy.flags ||= {};
  copy.flags.deckBuildable = false;
  copy.tempExpiresTurnEnd = true;
  state.allCards.push(copy);
  state.cards.push(copy);
  state.battle.game.player.hand.push(tempId);
  state.battle.game.player.tempCopyIds ||= [];
  state.battle.game.player.tempCopyIds.push(tempId);
}
function discardTempCopiesAtTurnEnd(){
  const game = state.battle.game;
  const ids = new Set(game.player.tempCopyIds || []);
  if(!ids.size) return;
  game.player.hand = game.player.hand.filter(id => !ids.has(id));
  game.player.tempCopyIds = [];
}
function chooseTwoLowCostUnitCopiesFromHand(){
  const game = state.battle.game;
  const candidates = game.player.hand.map((id,i)=>({id,i,card:byId(id)})).filter(x => x.card && x.card.cardType === 'ユニット' && Number(x.card.cost || 0) <= 2);
  if(!candidates.length) return battleLog('あくまの書：対象カードがありません。');
  const options = candidates.map(x => x.card.name);
  openChoiceModal('あくまの書', options, (picked, idx) => {
    const chosen = candidates[idx];
    if(chosen?.card){
      addTemporaryCopyToHand(chosen.card);
      battleLog(`あくまの書：${chosen.card.name}のコピーを1枚手札に加えました。`);
    }
    renderBattleArena(); syncMyBattleState();
  }, {kind:'akumanoBookCopy'});
}
function chooseRenkeiFromTop4(){
  const game = state.battle.game;
  const topIds = game.player.deck.slice(0,4);
  const top = topIds.map((id,i)=>({id,i,card:byId(id)}));
  const candidates = top.filter(x => x.card && hasRenkei(x.card));
  if(!candidates.length) return battleLog('うずしおキング：上4枚にれんけいカードがありません。');
  openChoiceModal('うずしおキング', candidates.map(x=>x.card.name), (picked, idx) => {
    const chosen = candidates[idx];
    const chosenTopIndex = topIds.indexOf(chosen.id);
    const removedTop = game.player.deck.splice(0, Math.min(4, game.player.deck.length));
    const chosenIdx = removedTop.indexOf(chosen.id);
    if(chosenIdx >= 0) game.player.hand.push(removedTop.splice(chosenIdx,1)[0]);
    shuffle(removedTop, 'uzuReturnOrder', {card:'うずしおキング'});
    game.player.deck = [...removedTop, ...game.player.deck];
    battleLog('うずしおキング：選ばなかったカードをランダムな順で山札の上に戻しました。');
    renderBattleArena(); syncMyBattleState();
  }, {kind:'uzushioKingPick'});
}
function isBetUnit(unit){
  if(!unit || unit.isBuilding) return false;
  return getCardText(byId(unit.cardId)).includes('BET') || ['デビルパピヨン','クラウンヘッド','チャゴス王子','インプ','ルバンカ','ぶちスライム'].includes(unit.name);
}

function equipRandomWeaponToLeader(){
  const game = state.battle.game;
  const weapons = state.allCards.filter(c => c.cardType === '武器' && Number(c.attack || 0) > 0);
  const w = chooseRandom(weapons);
  if(!w){ battleLog('装備できる武器が見つかりません。'); return false; }
  const attack = Number(w.attack || 0);
  const durability = Number(w.hp || w.durability || 1);
  game.player.weapon = {
    name:w.name,
    attack,
    durability,
    maxDurability:durability,
    cardText:getCardText(w),
    noCounter:getCardText(w).includes('反撃ダメージを受けない'),
    snipe:getCardText(w).includes('ねらい撃ち'),
    doubleAttack:getCardText(w).includes('2回攻撃'),
    attacksLeft:getCardText(w).includes('2回攻撃') ? 2 : 1
  };
  game.player.leaderAttack = attack;
  game.player.leaderCanAttack = attack > 0;
  game.player.leaderAttackedThisTurn = false;
  battleLog(`アイラBET：${w.name}を装備しました。`);
  return true;
}
function applyLeaderDamageReduction(amount=5){
  const game = state.battle.game;
  game.player.leaderDamageReduction = Math.max(Number(game.player.leaderDamageReduction || 0), amount);
  game.player.leaderDamageReductionUntil = 'turnEnd';
  battleLog(`味方リーダーが受けるダメージ-${amount}。`);
}
function getLeaderDamageReduction(side){
  const game = state.battle.game;
  return side === 'player' ? Number(game.player.leaderDamageReduction || 0) : Number(game.enemy.leaderDamageReduction || 0);
}
function summonSlimes(count=2){
  for(let i=0;i<count;i++){
    if(!summonTokenByName('スライム', {attack:1, hp:1}, 'player')) break;
  }
}
function fireAllFriendlyBetOnce(){
  const game = state.battle.game;
  for(const unit of [...game.player.board]){
    if(isBetUnit(unit)){
      if(unit.name === 'スペシャルコイン') continue;
      if(!applyTargetedBet(unit)) applyBetEffectFromText(getCardText(byId(unit.cardId)), unit);
      emitBattleEvent('betActivated', {unit, source:'specialCoin'});
    }
  }
  battleLog('スペシャルコイン：味方ユニット全てのBETを発動しました。');
}
function drawRandomBetFromDeck(){
  const game = state.battle.game;
  const candidates = [];
  for(let i=0;i<game.player.deck.length;i++){
    const c = byId(game.player.deck[i]);
    if(c && getCardText(c).includes('BET')) candidates.push({i, id:game.player.deck[i]});
  }
  const pick = chooseRandom(candidates);
  if(!pick){ battleLog('BETカードが山札にありません。'); return false; }
  game.player.hand.push(game.player.deck.splice(pick.i, 1)[0]);
  battleLog('BETカードを山札から1枚手札に加えました。');
  return true;
}
function availableBetTargets(){
  const game = state.battle.game;
  const targets = game.player.board.map((u,pos)=>isBetUnit(u) ? {type:'unit', unit:u, pos, label:u.name} : null).filter(Boolean);
  if(game.player.weapon?.cardText?.includes('BET')) targets.push({type:'weapon', label:game.player.weapon.name || '装備中の武器'});
  return targets;
}


function buffAllOtherFriendly(sourceUnit, atk=1, hp=1){
  const game = state.battle.game;
  for(const u of game.player.board){
    if(u && u !== sourceUnit && !u.isBuilding){
      if(atk) u.attack += atk;
      if(hp){ u.hp += hp; u.maxHp += hp; }
    }
  }
}
function topDeckEvenUnitToBoardOrDraw(){
  const game = state.battle.game;
  const topId = game.player.deck?.[0];
  const top = byId(topId);
  if(!top) return false;
  if(top.cardType === 'ユニット' && Number(top.cost || 0) % 2 === 0){
    const pos = game.player.board.findIndex(x => !x);
    if(pos < 0){ battleLog('賢者ルシェンダBET：場が埋まっているため不発。'); return true; }
    game.player.deck.shift();
    const unit = putUnitIntoPlayFromCard(top, pos, 'player');
    battleLog(`賢者ルシェンダBET：${top.name}を場に出しました。`);
    return true;
  }
  game.player.hand.push(game.player.deck.shift());
  battleLog(`賢者ルシェンダBET：${top.name}を手札に加えました。`);
  return true;
}
function countFriendlyByName(name){
  return state.battle.game.player.board.filter(u => u?.name === name).length;
}
function addMartialArtsCard(){
  addCardToHandByName('武術カード');
  battleLog('武術カードを1枚手札に加えました。');
}
function addToolCard(){
  addCardToHandByName('道具カード');
  battleLog('道具カードを1枚手札に加えました。');
}
function buffRandomOtherFriendly(sourceUnit, atk=0, hp=0){
  const game = state.battle.game;
  const candidates = game.player.board.filter(u => u && u !== sourceUnit && !u.isBuilding);
  const target = chooseRandom(candidates);
  if(!target) return false;
  if(atk) target.attack += atk;
  if(hp){ target.hp += hp; target.maxHp += hp; }
  battleLog(`${target.name}に${atk ? '攻撃力+'+atk : ''}${hp ? ' HP+'+hp : ''}。`);
  return true;
}
function summonCost3OrLessUnitFromHandOrDeck(){
  const game = state.battle.game;
  const pos = game.player.board.findIndex(x => !x);
  if(pos < 0) return false;
  let handIdx = game.player.hand.findIndex(id => {
    const c = byId(id);
    return c && c.cardType === 'ユニット' && Number(c.cost || 0) <= 3;
  });
  if(handIdx >= 0){
    const id = game.player.hand.splice(handIdx,1)[0];
    putUnitIntoPlayFromCard(byId(id), pos, 'player');
    battleLog('ルドマン：手札からコスト3以下のユニットを場に出しました。');
    return true;
  }
  let deckIdx = game.player.deck.findIndex(id => {
    const c = byId(id);
    return c && c.cardType === 'ユニット' && Number(c.cost || 0) <= 3;
  });
  if(deckIdx >= 0){
    const id = game.player.deck.splice(deckIdx,1)[0];
    putUnitIntoPlayFromCard(byId(id), pos, 'player');
    battleLog('ルドマン：山札からコスト3以下のユニットを場に出しました。');
    return true;
  }
  return false;
}
function onFriendlyBetActivated(sourceUnit=null){
  const game = state.battle.game;
  game.player.totalFriendlyBetCount = Number(game.player.totalFriendlyBetCount || 0) + 1;
  if(game.player.totalFriendlyBetCount % 4 === 0){
    const hasLudman = game.player.board.some(u => u?.name === 'ルドマン');
    if(hasLudman) summonCost3OrLessUnitFromHandOrDeck();
  }
}
function triggerLemonKingSlimeDeath(unit){
  const game = state.battle.game;
  if(!unit || unit.name === 'レモンキング') return;
  const card = byId(unit.cardId);
  const text = `${unit.name} ${card?.tribes || ''} ${card?.tags || ''} ${card?.text || ''}`;
  if(text.includes('スライム')){
    const hasLemonKing = game.player.board.some(u => u?.name === 'レモンキング');
    if(hasLemonKing) dealDamageToLeader('enemy', 1, '効果');
  }
}
function addSpecialCoinAtTurnEndIfMadesagora(){
  const game = state.battle.game;
  const hasMadesagora = game.player.board.some(u => String(u?.name || '').includes('マデサゴーラ'));
  if(hasMadesagora) addCardToHandByName('スペシャルコイン');
}
function applyBetToTarget(target){
  const game = state.battle.game;
  if(!target) return false;
  if(target.type === 'weapon'){
    applyBetEffectFromText(game.player.weapon.cardText, null);
    emitBattleEvent('betActivated', {weapon:game.player.weapon, source:'weapon'});
    return true;
  }
  if(target.type === 'unit'){
    const unit = target.unit;
    if(!applyTargetedBet(unit)){
      applyBetEffectFromText(getCardText(byId(unit.cardId)), unit);
    }
    emitBattleEvent('betActivated', {unit, source:'unit'});
    return true;
  }
  return false;
}
function normalizeEffectText(text){
  return String(text || '').replace(/こうげき/g, '攻撃力').replace(/ＨＰ/g, 'HP');
}
function applyCommonKeywordAndBuffText(text, unit=null, source='効果', times=1){
  const game = state.battle.game;
  text = normalizeEffectText(text);
  const n = Math.max(1, Number(times || 1));
  if(unit){
    let atk = 0, hp = 0;
    const atkM = text.match(/攻撃力[+＋](\d+)/);
    const hpM = text.match(/HP[+＋](\d+)/i);
    if(atkM) atk += Number(atkM[1]) * n;
    if(hpM) hp += Number(hpM[1]) * n;
    const bothM = text.match(/[+＋](\d+)\/[+＋](\d+)/);
    if(bothM){ atk += Number(bothM[1]) * n; hp += Number(bothM[2]) * n; }
    if(atk) unit.attack += atk;
    if(hp){ unit.hp += hp; unit.maxHp += hp; }
    if(text.includes('速攻')){ unit.keywords.haste = true; unit.canAttack = true; unit.summoningSickness = false; }
    if(text.includes('におうだち')) unit.keywords.taunt = true;
    if(text.includes('ねらい撃ち')) unit.keywords.snipe = true;
    if(text.includes('貫通')) unit.keywords.piercing = true;
    if(text.includes('2回攻撃') || text.includes('２回攻撃')) unit.keywords.doubleAttack = true;
    if(text.includes('ステルス')) unit.keywords.stealth = true;
    if(text.includes('先制')){ unit.keywords.firstStrike = true; unit.canAttack = true; unit.summoningSickness = false; }
  }
  if(text.includes('カードを1枚引く') || text.includes('カードを１枚引く')) for(let i=0;i<n;i++) drawCard(1);
  if(text.includes('カードを2枚引く') || text.includes('カードを２枚引く')) for(let i=0;i<n;i++) drawCard(2);
  if(text.includes('テンション+1') || text.includes('テンション＋1')) gainTension(n, source);
  if(text.includes('テンション+2') || text.includes('テンション＋2')) gainTension(2*n, source);
  if(text.includes('コイン')) for(let i=0;i<n;i++) addCardToHandByName('コイン');
  if(text.includes('HPを6回復')) healLeader(6*n);
  else if(text.includes('HPを4回復')) healLeader(4*n);
}
function randomFrom(arr){ return chooseRandom(arr, 'randomFrom', {}); }
function enemyTargets(includeLeader=false){
  const game = state.battle.game;
  const targets = game.enemy.board.map((unit,pos)=>unit && isAttackableUnit(unit) ? {side:'enemy', pos, unit} : null).filter(Boolean);
  if(includeLeader) targets.push({side:'enemyLeader'});
  return targets;
}
function friendlyTargets(){
  const game = state.battle.game;
  return game.player.board.map((unit,pos)=>unit && isAttackableUnit(unit) ? {side:'player', pos, unit} : null).filter(Boolean);
}
function applyToTargetRef(target, fn){
  if(!target) return false;
  if(target.side === 'enemyLeader'){ fn(null, 'enemyLeader'); return true; }
  if(target.side === 'playerLeader'){ fn(null, 'playerLeader'); return true; }
  if(target.unit){ fn(target.unit, target.side); return true; }
  return false;
}
function damageRandomEnemy(amount, includeLeader=true){
  const t = randomFrom(enemyTargets(includeLeader));
  if(!t) return false;
  if(t.side === 'enemyLeader') dealDamageToLeader('enemy', amount, 'ランダムダメージ');
  else dealDamageToUnit(t.unit, amount, 'ランダムダメージ', t.side);
  return true;
}
function poisonRandomEnemyUnit(){
  const t = randomFrom(enemyTargets(false));
  if(t?.unit){ applyPoison(t.unit); return true; }
  return false;
}
function sealRandomEnemyUnit(){
  const t = randomFrom(enemyTargets(false));
  if(t?.unit){ applySeal(t.unit); return true; }
  return false;
}
function killRandomEnemyUnit(){
  const t = randomFrom(enemyTargets(false));
  if(t?.unit){ t.unit.hp = 0; return true; }
  return false;
}
function disableRandomEnemyAttack(){
  const t = randomFrom(enemyTargets(false));
  if(t?.unit){ addStatus(t.unit, 'apathy', {until:'turnStart'}); t.unit.canAttack = false; return true; }
  return false;
}
function buffRandomFriendly(atk=0, hp=0){
  const t = randomFrom(friendlyTargets());
  if(t?.unit){
    if(atk) t.unit.attack += atk;
    if(hp){ t.unit.hp += hp; t.unit.maxHp += hp; }
    return true;
  }
  return false;
}
function applyStatusToAllUnits(type, side='both'){
  const game = state.battle.game;
  const boards = side === 'enemy' ? [game.enemy.board] : side === 'player' ? [game.player.board] : [game.player.board, game.enemy.board];
  for(const board of boards) for(const u of board) if(u && isAttackableUnit(u)){
    if(type === 'poison') applyPoison(u);
    if(type === 'seal') applySeal(u);
    if(type === 'apathy'){ addStatus(u, 'apathy', {until:'turnStart'}); u.canAttack = false; }
  }
}
function getAdjacentVerticalPositions(side, pos){
  const c = posToCoord(side, pos);
  const out = [];
  for(const r of [c.row - 1, c.row + 1]){
    const p = coordToPos(side, r, c.col);
    if(p >= 0) out.push(p);
  }
  return out;
}
function summonTokenAtPosition(name, pos, side='player', stats={}){
  const card = findCardByName(name) || ensureVirtualCard(name) || {id:`token_${name}`, name, attack:stats.attack || 1, hp:stats.hp || 1, cardType:'ユニット', text:''};
  return !!putUnitIntoPlayFromCard(card, pos, side, stats);
}
function summonAboveBelow(sourceUnit, tokenName){
  const game = state.battle.game;
  const pos = game.player.board.indexOf(sourceUnit);
  if(pos < 0) return;
  for(const p of getAdjacentVerticalPositions('player', pos)) summonTokenAtPosition(tokenName, p, 'player');
}
function drawTopFromDeck(predicate, count=1){
  const game = state.battle.game;
  let drawn = 0;
  for(let i=0; i<game.player.deck.length && drawn<count; i++){
    const card = byId(game.player.deck[i]);
    if(predicate(card)){
      game.player.hand.push(game.player.deck.splice(i,1)[0]);
      i--; drawn++;
    }
  }
  return drawn;
}
function extractNumberBefore(text, keyword, fallback=1){
  const idx = String(text).indexOf(keyword);
  const sub = idx >= 0 ? String(text).slice(0, idx) : String(text);
  const m = sub.match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : fallback;
}
function applyTextMiniEffect(text, source='効果'){
  const game = state.battle.game;
  text = String(text || '');

  if(text.includes('両プレイヤー') && text.includes('カードを1枚引く')){ drawCard(1); game.enemy.handCount = Number(game.enemy.handCount || 0) + 1; }
  else{
    if(text.includes('カードを1枚引く') || text.includes('カードを１枚引く')) drawCard(1);
    if(text.includes('カードを2枚引く') || text.includes('カードを２枚引く')) drawCard(2);
    if(text.includes('カードを3枚引く') || text.includes('カードを３枚引く')) drawCard(3);
  }

  if(text.includes('テンション+2') || text.includes('テンション＋2')) gainTension(2, source);
  else if(text.includes('テンション+1') || text.includes('テンション＋1')) gainTension(1, source);

  if(text.includes('味方リーダーのHPを') || text.includes('HPを')){
    const m = text.match(/HPを(\d+)回復/); if(m) healLeader(Number(m[1]));
  }
  if(text.includes('敵リーダーに')){
    const m = text.match(/敵リーダーに(\d+)ダメージ/); if(m) dealDamageToLeader('enemy', Number(m[1]), source);
  }

  if(!applyTribeBuffTextV111(text, null, source) && !applyTribeEffectTextV134(text, null, source)) applyTribeEffectTextV133(text, null, source);

  // ランダム対象
  let mRand = text.match(/ランダムな敵(?:ユニット)?1体に(\d+)ダメージ/);
  if(mRand) damageRandomEnemy(Number(mRand[1]), !text.includes('敵ユニット'));
  if(text.includes('ランダムな敵ユニット1体を毒')) poisonRandomEnemyUnit();
  if(text.includes('ランダムな敵ユニット1体を封印')) sealRandomEnemyUnit();
  if(text.includes('ランダムな敵ユニット1体を死亡')){ killRandomEnemyUnit(); resolveDeaths(); }
  if(text.includes('ランダムな敵1体を次のターン攻撃不能') || text.includes('ランダムな敵ユニット1体を次のターン攻撃不能')) disableRandomEnemyAttack();
  const friendlyAtk = text.match(/ランダムな味方ユニット1体の攻撃力[+＋](\d+)/);
  if(friendlyAtk) buffRandomFriendly(Number(friendlyAtk[1]), 0);
  const friendlyHp = text.match(/ランダムな味方ユニット1体のHP[+＋](\d+)/i);
  if(friendlyHp) buffRandomFriendly(0, Number(friendlyHp[1]));

  // 全体
  if(text.includes('全ての敵ユニットを毒')) applyStatusToAllUnits('poison','enemy');
  if(text.includes('全てのユニットを毒') || text.includes('お互いの全てのユニットを毒')) applyStatusToAllUnits('poison','both');
  if(text.includes('全ての敵ユニットを封印')) applyStatusToAllUnits('seal','enemy');
  if(text.includes('全ての敵ユニットを') && text.includes('攻撃不能')) applyStatusToAllUnits('apathy','enemy');

  if(text.includes('全ての敵ユニットに') || text.includes('全ての敵に')){
    const m = text.match(/(\d+)ダメージ/);
    if(m){ const dmg = Number(m[1]) + getSpellDamageBonus(); for(const u of game.enemy.board) if(isAttackableUnit(u)) dealDamageToUnit(u, dmg, source, 'enemy'); if(text.includes('敵リーダー')) dealDamageToLeader('enemy', dmg, source); resolveDeaths(); }
  }
  if(text.includes('全てのユニットに')){
    const m = text.match(/(\d+)ダメージ/);
    if(m){ const dmg = Number(m[1]) + getSpellDamageBonus(); for(const u of [...game.player.board, ...game.enemy.board]) if(isAttackableUnit(u)) dealDamageToUnit(u, dmg, source); resolveDeaths(); }
  }

  // トークン生成
  if(text.includes('スライム') && text.includes('出す')){
    const count = text.includes('2体') || text.includes('２体') ? 2 : 1;
    for(let i=0;i<count;i++) summonTokenByName('スライム', {attack:1,hp:1});
  }
  if(text.includes('プリズニャン') && text.includes('出す')){
    const count = extractNumberBefore(text, '体出す', 1);
    for(let i=0;i<count;i++) summonTokenByName('プリズニャン', {attack:1,hp:1});
  }
  if(text.includes('ミイラおとこ') && text.includes('出す')){
    const count = text.includes('2体') || text.includes('２体') ? 2 : 1;
    for(let i=0;i<count;i++) summonTokenByName('ミイラおとこ', {attack:3,hp:3});
  }

  if(text.includes('無気力状態') && text.includes('リーダー')){ applyApathyToLeader(); battleLog('リーダーが無気力状態になりました。'); }
  if(text.includes('必中モード')){ game.player.fortuneMode = 'hit'; battleLog('必中モードになりました。'); }
  if(text.includes('超必中モード')){ game.player.fortuneMode = 'super'; battleLog('超必中モードになりました。'); }

  for(const t of ['すべる床','宝箱','バリア床','刃の紋章','魔法陣','祝福の聖域','しあわせの国','天啓の神域']){
    if(text.includes(t)){ setTerrain(game.player.board.findIndex(x=>!x), t, source); break; }
  }
}

// v133: broad fortune and tribe-effect engine
const TRIBE_NAMES_V133 = ['ゾンビ','スライム','ドラゴン','冒険者','魔王','なし'];

function cardTextPoolV133(card){
  if(!card) return '';
  const parts = [card.name, card.tribe, card.tribes, card.tags, card.text, card.searchText, card.cardType];
  return parts.flat ? parts.flat().filter(Boolean).join(' ') : parts.filter(Boolean).join(' ');
}
function isUnitOfTribeV133(unitOrCard, tribe){
  return isUnitOfTribeV134(unitOrCard, tribe);
}

function applyTribeEffectTextV133(text, sourceUnit=null, sourceName='効果'){
  const game = state.battle.game;
  text = String(text || '');
  let applied = false;
  const tribeRx = TRIBE_NAMES_V133.join('|');

  // Friendly tribe +X/+Y, with optional "自分以外".
  let m = text.match(new RegExp(`(?:自分以外の|このユニットを除く)?(?:味方の|自分の)?(${tribeRx})系?の?味方?ユニット(?:全て|すべて|全員)?を[+＋](\\d+)\\/[+＋]?(\\d+)`));
  if(m){
    const [, tribe, a, h] = m;
    for(const {u} of allUnitsOfSideV133('player')){
      if(sourceUnit && u.id === sourceUnit.id && /自分以外|このユニットを除く/.test(text)) continue;
      if(isUnitOfTribeV133(u, tribe)){ buffUnitV133(u, Number(a), Number(h), sourceName); applied = true; }
    }
    if(applied) battleLog(`${sourceName}：${tribe}系味方ユニットを+${a}/+${h}。`);
  }

  // Friendly tribe attack or HP only.
  m = text.match(new RegExp(`(?:味方の|自分の)?(${tribeRx})系?ユニット(?:全て|すべて|全員)?の攻撃力[+＋](\\d+)`));
  if(m){
    const [, tribe, a] = m;
    for(const {u} of allUnitsOfSideV133('player')) if(isUnitOfTribeV133(u, tribe)){ buffUnitV133(u, Number(a), 0, sourceName); applied = true; }
    if(applied) battleLog(`${sourceName}：${tribe}系味方ユニットの攻撃力+${a}。`);
  }
  m = text.match(new RegExp(`(?:味方の|自分の)?(${tribeRx})系?ユニット(?:全て|すべて|全員)?のHP[+＋](\\d+)`));
  if(m){
    const [, tribe, h] = m;
    for(const {u} of allUnitsOfSideV133('player')) if(isUnitOfTribeV133(u, tribe)){ buffUnitV133(u, 0, Number(h), sourceName); applied = true; }
    if(applied) battleLog(`${sourceName}：${tribe}系味方ユニットのHP+${h}。`);
  }

  // Tribe-wide damage.
  m = text.match(new RegExp(`(?:敵の|相手の)?(${tribeRx})系?ユニット(?:全て|すべて|全員)?に(\\d+)ダメージ`));
  if(m){
    const [, tribe, d] = m;
    for(const {u, side} of allUnitsOfSideV133(text.includes('敵') || text.includes('相手') ? 'enemy' : 'player')){
      if(isUnitOfTribeV133(u, tribe)){ dealDamageToUnit(u, Number(d), sourceName, side); applied = true; }
    }
    if(applied){ battleLog(`${sourceName}：${tribe}系ユニットに${d}ダメージ。`); resolveDeaths(); }
  }

  // Powerful badge registration. It will be applied by applyPowerfulBadges().
  if(text.includes('パワフルバッジ')){
    game.player.powerfulBadges ||= [];
    if(!game.player.powerfulBadges.some(b => b.source === sourceName)){
      game.player.powerfulBadges.push({source:sourceName, text});
      battleLog(`${sourceName}：パワフルバッジを登録しました。`);
    }
    applied = true;
  }

  return applied;
}

function applyPowerfulBadgesV133(){
  const game = state.battle.game;
  if(!game?.player?.powerfulBadges?.length) return;
  for(const unit of game.player.board){
    if(!unit || unit._badgeApplied || unit.isBuilding || isSealed(unit)) continue;
    for(const badge of game.player.powerfulBadges){
      let tribeOk = true;
      for(const tribe of TRIBE_NAMES_V133){
        if(String(badge.text).includes(`${tribe}系`)) tribeOk = isUnitOfTribeV133(unit, tribe);
      }
      if(!tribeOk) continue;
      unit.keywords ||= {};
      if(badge.text.includes('速攻')) unit.keywords.haste = true, unit.canAttack = true;
      if(badge.text.includes('貫通')) unit.keywords.piercing = true;
      let m = badge.text.match(/攻撃力[+＋](\d+)/); if(m) unit.attack += Number(m[1]);
      m = badge.text.match(/HP[+＋](\d+)/); if(m){ unit.hp += Number(m[1]); unit.maxHp += Number(m[1]); }
    }
    unit._badgeApplied = true;
  }
}

function parseFortuneOptionsV133(text){
  const body = String(text || '').replace(/^.*?占い[:：]/, '');
  let parts = body.split(/①|②|③|④|\(1\)|\(2\)|\(3\)|\(4\)/).map(s => s.trim().replace(/^[:：、。]+|[、。]+$/g,'')).filter(Boolean);
  if(parts.length <= 1) parts = parseChoiceOptions(String(text || ''));
  return parts.length ? parts.slice(0,4) : [body.trim()];
}
function selfUnitForCardV133(card){
  const game = state.battle.game;
  return game.player.board.find(u => u?.cardId === card?.id || u?.name === card?.name);
}
function summonTokenFromFortuneTextV133(text, source='占い'){
  const game = state.battle.game;
  let applied = false;
  const rx = /(?:におうだち[、, ]*)?(?:速攻[、, ]*)?(\d+)\/(\d+)の([^、。]+?)(?:を)?(?:(\d+)体)?出す/g;
  let m;
  while((m = rx.exec(text))){
    const atk = Number(m[1]), hp = Number(m[2]);
    const name = m[3].replace(/を$/,'').trim();
    const count = Number(m[4] || 1);
    for(let i=0;i<count;i++){
      const ok = summonTokenByName(name, {attack:atk, hp});
      if(ok){
        const u = state.battle.game.player.board.find(x=>x?.name === name && Number(x.attack) === atk && Number(x.hp) === hp);
        if(u && text.includes('におうだち')) u.keywords.taunt = true;
        if(u && text.includes('速攻')) u.keywords.haste = true, u.canAttack = true, u.summoningSickness = false;
      }
      applied = true;
    }
  }
  if(text.includes('スライムを2体出す') || text.includes('スライムを２体出す')){ summonTokenByName('スライム', {attack:1,hp:1}); summonTokenByName('スライム', {attack:1,hp:1}); applied = true; }
  else if(text.includes('スライムを出す')){ summonTokenByName('スライム', {attack:1,hp:1}); applied = true; }
  return applied;
}
function applyFortuneOptionTextV133(card, option, optionIndex=0){
  const game = state.battle.game;
  const text = String(option || '');
  let applied = false;

  if(applyTribeEffectTextV133(text, selfUnitForCardV133(card), card.name)) applied = true;

  let m = text.match(/カードを(\d+)枚引く|カードを([一二三１２３])枚引く/);
  if(m){
    const map = {'一':1,'二':2,'三':3,'１':1,'２':2,'３':3};
    drawCard(Number(m[1] || map[m[2]] || 1)); applied = true;
  }
  m = text.match(/HPを(\d+)回復/);
  if(m){ healLeader(Number(m[1])); applied = true; }
  m = text.match(/テンション[+＋](\d+)/);
  if(m){ gainTension(Number(m[1]), card.name); applied = true; }
  if(text.includes('味方リーダーのテンション-1')){ game.player.tension = Math.max(0, Number(game.player.tension || 0) - 1); applied = true; }

  m = text.match(/全ての敵ユニットに(\d+)ダメージ/);
  if(m){ const d=Number(m[1])+getSpellDamageBonus(); for(const u of game.enemy.board) if(u && !u.isBuilding) dealDamageToUnit(u,d,card.name,'enemy'); resolveDeaths(); applied = true; }
  m = text.match(/全てのユニットに(\d+)ダメージ/);
  if(m){ const d=Number(m[1])+getSpellDamageBonus(); for(const u of [...game.player.board,...game.enemy.board]) if(u && !u.isBuilding) dealDamageToUnit(u,d,card.name); resolveDeaths(); applied = true; }
  m = text.match(/ランダムな敵(?:ユニット)?1体に(\d+)ダメージ|ランダムな敵1体に(\d+)ダメージ/);
  if(m){ damageRandomEnemy(Number(m[1] || m[2]), !text.includes('敵ユニット')); applied = true; }

  if(summonTokenFromFortuneTextV133(text, card.name)) applied = true;

  if(text.includes('全ての敵ユニットの攻撃力を1にする')){ for(const u of game.enemy.board) if(u && !u.isBuilding) u.attack = 1; applied = true; }
  if(text.includes('全ての敵ユニットのHPを1にする')){ for(const u of game.enemy.board) if(u && !u.isBuilding){ u.hp = Math.min(u.hp,1); u.maxHp = Math.min(u.maxHp,1); } applied = true; }

  if(text.includes('敵ユニット1体の攻撃力を1にする')){ game.pendingGenericEffect = {kind:'setAttack', value:1, source:card.name, target:'enemyUnit'}; battleLog(`${card.name}：敵ユニットを選んでください。`); applied = true; }
  if(text.includes('敵ユニット1体のHPを1にする')){ game.pendingGenericEffect = {kind:'setHp', value:1, source:card.name, target:'enemyUnit'}; battleLog(`${card.name}：敵ユニットを選んでください。`); applied = true; }
  if(text.includes('ユニット1体のHPを1にする')){ game.pendingGenericEffect = {kind:'setHp', value:1, source:card.name, target:'unitAny'}; battleLog(`${card.name}：ユニットを選んでください。`); applied = true; }
  m = text.match(/ユニット1体に(\d+)ダメージ/);
  if(m){ game.pendingGenericEffect = {kind:'damage', amount:Number(m[1])+getSpellDamageBonus(), source:card.name, target:'unitAny'}; battleLog(`${card.name}：ユニットを選んでください。`); applied = true; }
  m = text.match(/ユニット1体を[+＋](\d+)\/[+＋]?(\d+)/);
  if(m){ game.pendingGenericEffect = {kind:'buffStats', attack:Number(m[1]), hp:Number(m[2]), source:card.name, target:'unitAny'}; battleLog(`${card.name}：ユニットを選んでください。`); applied = true; }
  if(text.includes('ユニット1体に速攻と貫通')){ game.pendingGenericEffect = {kind:'grantKeywords', keywords:{haste:true,piercing:true}, source:card.name, target:'unitAny'}; battleLog(`${card.name}：ユニットを選んでください。`); applied = true; }
  if(text.includes('ユニットのコピーを自分の手札に加える')){ game.pendingGenericEffect = {kind:'copyUnitToHand', source:card.name, target:'unitAny'}; battleLog(`${card.name}：コピーするユニットを選んでください。`); applied = true; }
  if(text.includes('1/1のスライムに')){ game.pendingGenericEffect = {kind:'transformToSlime', source:card.name, target:'unitAny'}; battleLog(`${card.name}：1/1スライムに変えるユニットを選んでください。`); applied = true; }

  if(text.includes('デッキの一番上のカードのコスト-3') && game.player.deck.length){
    const id = game.player.deck[0]; const c = byId(id);
    const copy = JSON.parse(JSON.stringify(c)); copy.id = `copy_${c.id}_${Date.now()}_${safeRandomId('fortune').slice(0,8)}`; copy.cost = Math.max(0, Number(c.cost||0)-3); copy.flags ||= {}; copy.flags.generatedOrEvolved = true; state.allCards.push(copy); state.cards.push(copy); game.player.deck[0] = copy.id; applied = true;
  }
  if(text.includes('デッキの一番上のカードを手札に加える')){
    if(game.player.deck.length){
      const id = game.player.deck.shift();
      game.player.hand.push(id);
      if(text.includes('コピー')) addCardCopyToHand(byId(id));
      applied = true;
    }
  }
  if(text.includes('デッキから占いカードを1枚手札に加える')){
    const idx = game.player.deck.findIndex(id => getCardText(byId(id)).includes('占い'));
    if(idx >= 0) game.player.hand.push(game.player.deck.splice(idx,1)[0]);
    applied = true;
  }

  // self-unit buffs for fortune units like デスファレーナ/エビルドライブ.
  const self = selfUnitForCardV133(card);
  if(self){
    m = text.match(/^攻撃力[+＋](\d+)/); if(m){ self.attack += Number(m[1]); applied = true; }
    m = text.match(/^HP[+＋](\d+)/); if(m){ self.hp += Number(m[1]); self.maxHp += Number(m[1]); applied = true; }
    if(text.includes('速攻を得る')){ self.keywords ||= {}; self.keywords.haste = true; self.canAttack = true; applied = true; }
    if(text.includes('貫通を得る')){ self.keywords ||= {}; self.keywords.piercing = true; applied = true; }
  }

  if(applied) battleLog(`${card.name}：占い効果「${text}」を処理しました。`);
  triggerFortuneResolvedV134(card, optionIndex, text);
  return applied;
}


// v134: official-ish "出す" rule, 絶好調, 4-tribe scope, fortune triggers, stronger hand swipe
const SUMMON_ORDER_V134 = [0,1,2,3,4,5];
const TRIBE_NAMES_V134 = ['ゾンビ','スライム','ドラゴン','冒険者','魔王','なし'];

function firstEmptySummonPosV134(side='player'){
  const game = state.battle.game;
  const board = side === 'enemy' ? game.enemy.board : game.player.board;
  for(const p of SUMMON_ORDER_V134){
    if(!board[p]) return p;
  }
  return -1;
}
function summonCardByRuleV134(card, side='player', stats={}, source='出す'){
  if(!card) return false;
  const pos = firstEmptySummonPosV134(side);
  if(pos < 0){
    battleLog(`${source}：空きマスがないため${card.name}を出せません。`);
    return false;
  }
  return !!putUnitIntoPlayFromCard(card, pos, side, stats);
}
function summonTokenByRuleV134(name, stats={}, side='player', source='出す'){
  const card = findCardByName(name) || ensureVirtualCard(name) || {id:`token_${name}`, name, attack:stats.attack ?? 1, hp:stats.hp ?? 1, cardType:'ユニット', text:''};
  return summonCardByRuleV134(card, side, stats, source);
}
function summonFromDeckOrHandByPredicateV134(predicate, count=1, side='player', source='出す'){
  const game = state.battle.game;
  const obj = side === 'enemy' ? game.enemy : game.player;
  obj.hand ||= []; obj.deck ||= [];
  let done = 0;
  for(let pass=0; pass<2 && done<count; pass++){
    const zone = pass === 0 ? obj.hand : obj.deck;
    for(let i=0; i<zone.length && done<count; i++){
      const card = byId(zone[i]);
      if(!predicate(card)) continue;
      if(firstEmptySummonPosV134(side) < 0) return done;
      const [id] = zone.splice(i,1); i--;
      if(summonCardByRuleV134(byId(id), side, {}, source)) done++;
    }
  }
  return done;
}
function hasZekkochoTextV134(card){
  return /絶好調/.test(getCardText(card)) || /絶好調/.test(String(card?.searchText || ''));
}
function grantZekkochoV134(unit, source='絶好調'){
  if(!unit) return false;
  unit.statuses ||= [];
  if(!unit.statuses.some(s => (s.type || s) === 'zekkocho')) unit.statuses.push({type:'zekkocho'});
  unit.zekkocho = true;
  battleLog(`${unit.name}：絶好調状態になりました。`);
  return true;
}
function isZekkochoV134(unit){
  return !!(unit?.zekkocho || unit?.statuses?.some(s => (s.type || s) === 'zekkocho'));
}
function removeZekkochoV134(unit, reason='攻撃'){
  if(!unit || !isZekkochoV134(unit)) return false;
  unit.zekkocho = false;
  unit.statuses = (unit.statuses || []).filter(s => (s.type || s) !== 'zekkocho');
  battleLog(`${unit.name}：${reason}により絶好調を失いました。`);
  return true;
}
function consumeZekkochoOnAttackV134(attacker, attackerRef, defenderRef){
  if(!attacker || !attackerRef) return;
  if(attackerRef.side !== 'player' && attackerRef.side !== 'enemy') return;
  // 敵ユニット・敵リーダーへの攻撃で失う。ソロ双方操作では相手側を攻撃した場合に失う。
  const attacksEnemySide = (attackerRef.side === 'player' && String(defenderRef?.side || '').startsWith('enemy')) ||
                           (attackerRef.side === 'enemy' && String(defenderRef?.side || '').startsWith('player'));
  if(attacksEnemySide) {
    triggerZekkochoAttackWatchersV134(attacker, attackerRef);
    removeZekkochoV134(attacker, '攻撃');
  }
}
function triggerZekkochoAttackWatchersV134(attacker, attackerRef){
  const game = state.battle.game;
  if(attackerRef.side !== 'player' || !isZekkochoV134(attacker)) return;
  for(const u of game.player.board){
    if(!u || u.isBuilding) continue;
    if(u.name === 'メイジバピラス'){
      drawFortuneCardFromDeckOrPoolV134('メイジバピラス');
    }
  }
}
function drawFortuneCardFromDeckOrPoolV134(source='占い'){
  const game = state.battle.game;
  const idx = game.player.deck.findIndex(id => getCardText(byId(id)).includes('占い'));
  if(idx >= 0){
    const [id] = game.player.deck.splice(idx,1);
    if(game.player.hand.length < 10) game.player.hand.push(id);
    battleLog(`${source}：山札から占いカードを1枚手札に加えました。`);
    return true;
  }
  const pool = state.allCards.filter(c => getCardText(c).includes('占い'));
  if(pool.length && game.player.hand.length < 10){
    addCardCopyToHand(chooseRandom(pool, 'fortunePoolV134', {source}), {}, source);
    battleLog(`${source}：デッキ外を含む占いカードを1枚手札に加えました。`);
    return true;
  }
  return false;
}
function addRandomFortuneTellerCardV134(source='占い'){
  const pool = state.allCards.filter(c => String(c.class || c.job || c.leader || c.searchText || '').includes('占い師'));
  if(pool.length) return addCardCopyToHand(chooseRandom(pool, 'fortuneTellerPoolV134', {source}), {}, source);
  return drawFortuneCardFromDeckOrPoolV134(source);
}
function isUnitOfTribeV134(unitOrCard, tribe){
  // v157: 系統判定は分類フィールドのみ。効果文/searchTextからは推測しない。
  if(!TRIBE_NAMES_V134.includes(tribe)) return false;
  const card = unitOrCard?.cardId ? byId(unitOrCard.cardId) : unitOrCard;
  if(!card) return false;
  if(tribe === 'なし'){
    const raw = Array.isArray(card.tribes) ? card.tribes : (card.tribe ? [card.tribe] : []);
    return raw.some(t => ['なし','系統なし'].includes(String(t || '').trim())) || cardTribes(card).size === 0;
  }
  return isTribeCard(card, tribe);
}

function applyTribeEffectTextV134(text, sourceUnit=null, sourceName='効果'){
  const game = state.battle.game;
  text = String(text || '');
  let applied = false;
  const tribeRx = TRIBE_NAMES_V134.join('|');
  const friendly = game.player.board.filter(u => u && !u.isBuilding);

  let m = text.match(new RegExp(`(?:自分以外の|このユニットを除く)?(?:味方の|自分の)?(${tribeRx})系?の?味方?ユニット(?:全て|すべて|全員)?を[+＋](\\d+)\\/[+＋]?(\\d+)`));
  if(m){
    const [, tribe, a, h] = m;
    for(const u of friendly){
      if(sourceUnit && u.id === sourceUnit.id && /自分以外|このユニットを除く/.test(text)) continue;
      if(isUnitOfTribeV134(u, tribe)){ buffUnitV133(u, Number(a), Number(h), sourceName); applied = true; }
    }
    if(applied) battleLog(`${sourceName}：${tribe}系味方ユニットを+${a}/+${h}。`);
  }
  m = text.match(new RegExp(`(?:味方の|自分の)?(${tribeRx})系?ユニット(?:全て|すべて|全員)?の攻撃力[+＋](\\d+)`));
  if(m){
    const [, tribe, a] = m;
    for(const u of friendly) if(isUnitOfTribeV134(u, tribe)){ buffUnitV133(u, Number(a), 0, sourceName); applied = true; }
  }
  m = text.match(new RegExp(`(?:味方の|自分の)?(${tribeRx})系?ユニット(?:全て|すべて|全員)?のHP[+＋](\\d+)`));
  if(m){
    const [, tribe, h] = m;
    for(const u of friendly) if(isUnitOfTribeV134(u, tribe)){ buffUnitV133(u, 0, Number(h), sourceName); applied = true; }
  }
  return applied;
}
function summonFromTextByRuleV134(text, source='占い'){
  text = String(text || '');
  let applied = false;
  const rx = /(?:におうだち[、, ]*)?(?:速攻[、, ]*)?(\d+)\/(\d+)の([^、。]+?)(?:(\d+)体)?出す/g;
  let m;
  while((m = rx.exec(text))){
    const atk = Number(m[1]), hp = Number(m[2]);
    const name = m[3].replace(/を$/,'').trim();
    const count = Number(m[4] || 1);
    for(let i=0;i<count;i++){
      const ok = summonTokenByRuleV134(name, {attack:atk, hp}, 'player', source);
      if(ok){
        const u = state.battle.game.player.board.find(x => x?.name === name && Number(x.attack) === atk && Number(x.hp) === hp);
        if(u && text.includes('におうだち')) u.keywords.taunt = true;
        if(u && text.includes('速攻')) { u.keywords.haste = true; u.canAttack = true; u.summoningSickness = false; }
      }
      applied = true;
    }
  }
  if(text.includes('スライムを2体出す') || text.includes('スライムを２体出す')){ summonTokenByRuleV134('スライム', {attack:1,hp:1}, 'player', source); summonTokenByRuleV134('スライム', {attack:1,hp:1}, 'player', source); applied = true; }
  else if(text.includes('スライムを出す')){ summonTokenByRuleV134('スライム', {attack:1,hp:1}, 'player', source); applied = true; }
  return applied;
}
function applyZekkochoFortuneTextV134(card, text){
  const game = state.battle.game;
  let applied = false;
  if(text.includes('コスト2以下の絶好調を持つユニットを2体出す')){
    const n = summonFromDeckOrHandByPredicateV134(c => c?.cardType === 'ユニット' && Number(c.cost||0) <= 2 && hasZekkochoTextV134(c), 2, 'player', card.name);
    battleLog(`${card.name}：絶好調ユニットを${n}体出しました。`);
    applied = true;
  }
  if(text.includes('絶好調を持つ全ての味方ユニット') && text.includes('+1/+1')){
    for(const u of game.player.board) if(u && !u.isBuilding && isZekkochoV134(u)) buffUnitV133(u,1,1,card.name);
    applied = true;
  }
  if(text.includes('全ての味方ユニットを絶好調状態に戻して') && text.includes('+1/+1')){
    for(const u of game.player.board) if(u && !u.isBuilding){ grantZekkochoV134(u, card.name); buffUnitV133(u,1,1,card.name); }
    applied = true;
  }
  return applied;
}
function triggerFortuneResolvedV134(card, optionIndex=0, optionText=''){
  const game = state.battle.game;
  game.player.fortuneUsedCount = Number(game.player.fortuneUsedCount || 0) + 1;
  game.player.fortuneThisTurnCount = Number(game.player.fortuneThisTurnCount || 0) + 1;

  for(const u of game.player.board){
    if(!u || u.isBuilding) continue;
    if(u.name === 'ベルフェゴル'){ buffUnitV133(u,1,1,'ベルフェゴル'); }
    if(optionIndex === 0 && u.name === 'びっくりサタン'){ drawCard(1); }
    if(optionIndex === 0 && u.name === 'ケセランパセラン'){ healLeader(2); }
    if(u.name === 'ポムポムボム'){ 
      const ok = summonTokenByRuleV134('バブリン', {attack:1,hp:1}, 'player', 'ポムポムボム');
      if(ok){ const b = game.player.board.find(x=>x?.name==='バブリン'); if(b){ b.keywords.haste = true; b.canAttack = true; b.summoningSickness = false; } }
    }
    if(u.name === 'みわくのランプ'){ addRandomFortuneTellerCardV134('みわくのランプ'); }
    if(u.name === 'のろいのランプ' && isZekkochoV134(u) && card.cardType === '特技'){
      addCardCopyToHand(card, {}, 'のろいのランプ');
      removeZekkochoV134(u, '占い特技コピー');
    }
  }
  for(const b of game.player.board){
    if(b?.name === '炎のほこら' && b.isDungeon){ b.durability = Math.min(Number(b.maxDurability || 7), Number(b.durability || 0) + 1); }
    if(b?.name === '占い小屋'){ game.player.nextFortuneHitFromHut = true; }
  }
}
function installSoloHandSwipeGuardV134(){
  if(window.__soloHandSwipeGuardV134Installed) return;
  window.__soloHandSwipeGuardV134Installed = true;
  const mark = (e) => {
    const p = e.touches?.[0] || e.changedTouches?.[0] || e;
    const card = e.target.closest?.('.solo-debug-card');
    if(e.type === 'pointerdown' || e.type === 'touchstart'){
      window.__soloHandGestureV131 = {x:Number(p.clientX || 0), y:Number(p.clientY || 0), t:Date.now(), moved:false};
      return;
    }
    const g = window.__soloHandGestureV131;
    if(!g) return;
    const dx = Math.abs(Number(p.clientX || 0) - g.x);
    const dy = Math.abs(Number(p.clientY || 0) - g.y);
    if(dx > 4 || dy > 8){
      g.moved = true;
      window.__soloHandSwipeSuppressUntilV131 = Date.now() + 1400;
    }
  };
  const blockClick = (e) => {
    if(Date.now() < Number(window.__soloHandSwipeSuppressUntilV131 || 0)){
      const card = e.target.closest?.('.solo-debug-card');
      if(card){ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); return false; }
    }
  };
  document.addEventListener('pointerdown', mark, true);
  document.addEventListener('pointermove', mark, true);
  document.addEventListener('touchstart', mark, {capture:true, passive:true});
  document.addEventListener('touchmove', mark, {capture:true, passive:true});
  document.addEventListener('click', blockClick, true);
  document.addEventListener('touchend', blockClick, true);
}

function applyFortuneEffect(card){
  if(applySpecialFortuneCardV132(card)) return;
  const game = state.battle.game;
  const options = parseFortuneOptionsV133(getCardText(card));
  const run = (op, idx=0) => {
    if(!applyFortuneOptionTextV133(card, op, idx)){
      applyTextMiniEffect(op, card.name);
      triggerFortuneResolvedV134(card, idx, op);
      battleLog(`${card.name}：占い効果を簡易処理しました。`);
    }
  };

  if((game.player.nextFortuneBoth || game.player.fortuneMode === 'super') && options.length >= 2){
    game.player.nextFortuneBoth = false;
    battleLog(`${game.player.fortuneMode === 'super' ? '超必中モード' : 'ヘルプラネット'}：占い効果を両方発動。`);
    options.slice(0,2).forEach((op,i)=>run(op,i));
    return;
  }

  if((game.player.fortuneMode === 'hit' || game.player.nextFortuneHitFromHut) && options.length >= 2){
    game.player.nextFortuneHitFromHut = false;
    battleLog('必中モード：発動する占い効果を選んでください。');
    openChoiceModal(card.name + '：必中', options.slice(0,2), (picked, idx) => {
      run(picked, idx);
      renderBattleArena(); syncMyBattleState();
    }, {kind:'fortuneHitV133', card:{id:card.id, name:card.name}});
    return;
  }

  const idx = Math.floor(Math.random() * Math.min(2, options.length));
  run(options[idx], idx);
}

function applyChoiceEffect(card){
  const game = state.battle.game;
  if(card?.name === 'スラリンガル'){
    const unit = game.player.board.find(u => u?.name === 'スラリンガル');
    if(unit){
      openChoiceModal('スラリンガル 選択', ['+1/+1・速攻・敵リーダー攻撃不可・ダメージ無効','ターン終了時 攻撃力とHPを2倍'], (picked,i)=>{
        applySlaringalChoiceToUnitV110(unit, i);
        renderBattleArena(); syncMyBattleState();
      }, {kind:'slaringalChoice'});
      return;
    }
  }
  if(card?.name === 'グランマーズ'){
    triggerGrandmazTop3V110('グランマーズ');
    return;
  }
  const text = getCardText(card);
  const options = parseChoiceOptions(text);
  if(!options.length) return;
  openChoiceModal(card.name, options, (picked) => {
    battleLog(`選択：${picked}`);
    applyTextMiniEffect(picked, card.name);
    renderBattleArena(); syncMyBattleState();
  });
}

function strategyTargetType(name){
  // v63: 現在の9種は基本的に発動したユニットへ付与。
  // 今後、相手を対象にするさくせん名がDB/手動で確定したらここへ追加する。
  const enemyTargetStrategies = new Set(['せんりょくうばえ・敵']);
  return enemyTargetStrategies.has(name) ? 'enemyUnit' : 'self';
}
function applyStrategyEffect(unit, name, targetUnit=null){
  if(!unit) return;
  const target = targetUnit || unit;
  switch(name){
    case 'ガンガンいこうぜ': target.attack += 2; break;
    case 'いのちだいじに': target.hp += 2; target.maxHp += 2; break;
    case 'バッチリがんばれ': target.attack += 1; target.hp += 1; target.maxHp += 1; break;
    case 'ここでまってて': target.keywords.taunt = true; break;
    case 'かってにしてね': addStatus(target, 'spellImmune'); break;
    case 'とにかくにげて': target.attack = Math.max(0, target.attack - 1); target.hp += 3; target.maxHp += 3; break;
    case 'せんりょくうばえ': addStatus(target, 'killDamageSource'); break;
    case 'いろいろやろうぜ': target.keywords.piercing = true; break;
    case 'まもりをかためろ': target.keywords.taunt = true; target.hp += 1; target.maxHp += 1; break;
    default: target.attack += 1; break;
  }
}
function applyStrategyToUnit(unit){
  if(!unit) return;
  const pool = [
    'ガンガンいこうぜ',
    'いのちだいじに',
    'バッチリがんばれ',
    'ここでまってて',
    'かってにしてね',
    'とにかくにげて',
    'せんりょくうばえ',
    'いろいろやろうぜ',
    'まもりをかためろ'
  ];
  const candidates = shuffle([...pool]).slice(0,3);
  openChoiceModal('さくせん', candidates, (picked) => {
    const targetType = strategyTargetType(picked);
    if(targetType === 'enemyUnit'){
      state.battle.game.pendingGenericEffect = {kind:'strategyEnemy', source:'さくせん', strategyName:picked, target:'enemyUnit', sourceUnitId:unit.id};
      battleLog(`さくせん：${picked}の対象を選んでください。`);
      renderBattleArena(); syncMyBattleState();
      return;
    }
    applyStrategyEffect(unit, picked);
    battleLog(`さくせん：${picked}を得た。`);
    renderBattleArena(); syncMyBattleState();
  });
}
function applyBetEffectFromText(text, sourceUnit=null){
  const game = state.battle.game;
  text = String(text || '');
  if(sourceUnit){ sourceUnit.betCount = Number(sourceUnit.betCount || 0) + 1; }
  // BET誘発は v69 以降 emitBattleEvent('betActivated') に集約。
  if(game.player.weapon?.name === 'むげんの弓'){
    game.player.weapon.durability = Number(game.player.weapon.durability || 0) + 1;
    game.player.weapon.maxDurability = Math.max(Number(game.player.weapon.maxDurability || 0), game.player.weapon.durability);
    battleLog('むげんの弓BET：耐久力+1。');
  }
  if(game.player.weapon?.name === '福招きのそろばん'){
    game.player.weapon.durability = Math.max(0, Number(game.player.weapon.durability || 0) - 1);
    drawCard(1);
    battleLog('福招きのそろばんBET：耐久力-1、カードを1枚引く。');
    if(game.player.weapon.durability <= 0){ addCardToHandByName('コイン'); game.player.weapon = null; game.player.leaderAttack = 0; game.player.leaderCanAttack = false; }
  }

  if(text.includes('BET') && (text.includes('攻撃力+1') || text.includes('攻撃力＋1')) && sourceUnit) sourceUnit.attack += 1;
  if(text.includes('BET') && (text.includes('HP+1') || text.includes('HP＋1')) && sourceUnit){ sourceUnit.hp += 1; sourceUnit.maxHp += 1; }
  if(text.includes('BET') && text.includes('速攻') && sourceUnit){ sourceUnit.keywords.haste = true; sourceUnit.canAttack = true; }
  if(text.includes('BET') && text.includes('におうだち') && sourceUnit) sourceUnit.keywords.taunt = true;
  if(text.includes('BET') && text.includes('カードを1枚引く')) drawCard(1);
  if(text.includes('BET') && text.includes('味方リーダーのHPを2回復')) healLeader(2);
  if(text.includes('BET') && (text.includes('テンション+1') || text.includes('テンション＋1'))) gainTension(1, 'BET');
  if(text.includes('全ての敵ユニットを1マス上') || text.includes('全ての敵ユニットを１マス上')){
    moveEnemyUnitsVertical(-1);
    battleLog('BET：全ての敵ユニットを1マス上に移動。');
  }
  if(text.includes('全てのユニットにこの武器の耐久力と同じダメージ')){
    const amount = Number(state.battle.game.player.weapon?.durability || 1);
    for(const u of [...state.battle.game.player.board, ...state.battle.game.enemy.board]) if(u && isAttackableUnit(u)) dealDamageToUnit(u, amount, source);
    if(state.battle.game.player.weapon) state.battle.game.player.weapon.durability = 0;
    resolveDeaths();
  }

  if(text.includes('BET') && text.includes('全てのユニットに1ダメージ')){
    for(const u of [...game.player.board, ...game.enemy.board]) if(u) dealDamageToUnit(u,1,'BET'); resolveDeaths();
  }
  if(text.includes('BET') && text.includes('正面') && text.includes('1ダメージ') && sourceUnit){
    const pos = game.player.board.indexOf(sourceUnit);
    const target = game.enemy.board[pos % 6];
    if(target) dealDamageToUnit(target, 1, 'BET', 'enemy');
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
  const targets = availableBetTargets();
  if(targets.length){
    openChoiceModal('BET対象', targets.map(t => t.label), (picked, i) => {
      const target = targets[i];
      applyBetToTarget(target);
      battleLog(`コインを使い、${target.label}のBETを発動しました。`);
      renderBattleArena(); syncMyBattleState();
    });
    return;
  }
  emitBattleEvent('betActivated', {source:'coinOnly'});
  battleLog('コインを使いました。BET対象はいません。');
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
  clearDarkRobeByOrb(card);




  if(card.name === '冥界の霧'){
    game.player.healInvertsForEnemiesThisTurn = true;
    battleLog('冥界の霧：このターン中敵は回復の代わりにダメージを受けます。');
    return;
  }
  if(card.name === '分裂のツボ'){
    splitPotCopyThisTurnV124();
    return;
  }
  if(card.name === '剣豪の闘志'){
    const boost = 2 + Number(game.player.tensionSkillUseCount || 0);
    grantLeaderTempAttack(boost, card.name);
    return;
  }
  if(card.name === '家族の絆'){
    game.player.familyBondPending = true;
    battleLog('家族の絆：次の自分のターン開始時に家族の絆オーラを得ます。');
    return;
  }
  if(card.name === 'セクシービーム'){
    game.pendingGenericEffect = {kind:'takeControlUntilEnd', maxAttack:2, source:card.name, target:'enemyUnit', haste:true, untilTurnEnd:true};
    battleLog('セクシービーム：攻撃力2以下の敵ユニットを選んでください。');
    return;
  }
  if(card.name === 'テンプテーション'){
    const limit = game.player.hand.some(id=>isDemonKingCard(byId(id))) ? 6 : 3;
    game.pendingGenericEffect = {kind:'takeControlUntilEnd', maxAttack:limit, source:card.name, target:'enemyUnit', haste:true, untilTurnEnd:true};
    battleLog(`テンプテーション：攻撃力${limit}以下の敵ユニットを選んでください。`);
    return;
  }
  if(card.name === 'あくましんかん'){
    openChoiceModal('あくましんかん 占い', ['死亡時：この場所に復活する','におうだち HP+1'], (picked,i)=>{
      const self = game.player.board.find(u=>u?.name === 'あくましんかん');
      if(self){
        if(i===0){ self.reviveSamePlaceOnDeath = true; self.keywords.deathrattle = true; }
        else { self.keywords.taunt = true; self.hp += 1; self.maxHp += 1; }
      }
      renderBattleArena(); syncMyBattleState();
    }, {kind:'fortuneChoice'});
    return;
  }
  if(card.name === 'スラリンガル'){
    openChoiceModal('スラリンガル 選択', ['+1/+1・速攻・敵リーダー攻撃不可・ダメージ無効','ターン終了時 攻撃力とHPを2倍'], (picked,i)=>{
      const self = game.player.board.find(u=>u?.name === 'スラリンガル');
      if(self){
        if(i===0){ self.attack += 1; self.hp += 1; self.maxHp += 1; self.keywords.haste = true; self.canAttack = true; self.cannotAttackLeaderThisTurn = true; setUnitTempImmuneDamage(self,'turnEnd','スラリンガル'); }
        else self.doubleStatsAtTurnEnd = true;
      }
      renderBattleArena(); syncMyBattleState();
    }, {kind:'choiceCard'});
    return;
  }


  if(card.name === 'スライム呼び'){
    const cols = [0,1,2,3].map(col => [0,1,2].map(row => coordToPos('player', row, col)).filter(p=>p>=0 && !game.player.board[p]));
    const choices = cols.map((ps,i)=>({label:`列${i+1}`, ps})).filter(x=>x.ps.length);
    if(choices.length){
      openChoiceModal('スライム呼び：列を選択', choices.map(x=>x.label), (picked,i)=>{
        for(const p of choices[i].ps) summonTokenAtPosition('スライム', p, 'player', {attack:1, hp:1});
        renderBattleArena(); syncMyBattleState();
      }, {kind:'columnSummon'});
    }
    return;
  }
  if(card.name === 'ゴールドシャワー'){
    const amount = 5 + countCoinsInHand() + getSpellDamageBonus();
    for(let i=0;i<amount;i++) damageRandomEnemy(1, true);
    resolveDeaths();
    return;
  }
  if(card.name === 'バイキルトの巻物'){
    const cols = [0,1,2,3].map(col => [0,1,2].map(row => coordToPos('player', row, col)).filter(p=>p>=0));
    openChoiceModal('バイキルトの巻物：列を選択', ['自後列','自前列','敵前列','敵後列'], (picked,i)=>{
      for(const p of cols[i]){
        const u = game.player.board[p];
        if(u && !u.isBuilding) addTempAttack(u, 2, card.name);
      }
      renderBattleArena(); syncMyBattleState();
    }, {kind:'columnBuff'});
    return;
  }
  if(card.name === 'ボーンプリズナー'){
    game.pendingGenericEffect = {kind:'debuffStats', attack:-3, hp:0, source:card.name, target:'enemyUnit'};
    battleLog('ボーンプリズナー：攻撃力-3する敵ユニットを選んでください。');
    return;
  }
  if(card.name === 'タロットフォーチュン'){
    game.pendingGenericEffect = {kind:'damageThenSummonToken', amount:7 + getSpellDamageBonus(), tokenName:'ダースドラゴン', attack:7, hp:7, source:card.name, target:'enemyUnit'};
    battleLog('タロットフォーチュン：敵ユニットを選んでください。');
    return;
  }
  if(card.name === '閃光烈火拳'){
    const amount = 3 + Number(game.player.flashFistBonus || 0) + getSpellDamageBonus();
    game.player.flashFistBonus = Number(game.player.flashFistBonus || 0) + 2;
    game.pendingGenericEffect = {kind:'damage', amount, source:card.name, target:'enemyAny'};
    battleLog(`閃光烈火拳：${amount}ダメージの対象を選んでください。`);
    return;
  }
  if(card.name === '大魔女バーバラ'){
    const amount = Number(game.player.usedSpellCostThisTurn || 0) + getSpellDamageBonus();
    game.pendingGenericEffect = {kind:'damage', amount, source:card.name, target:'enemyAny'};
    battleLog(`大魔女バーバラ：${amount}ダメージの対象を選んでください。`);
    return;
  }


  if(card.name === 'ぶんしん'){
    game.player.leaderAttackMaxThisTurn = 3;
    game.player.leaderAttacksLeftThisTurn = 3;
    grantLeaderTempAttack(1, card.name);
    game.player.leaderNoWeaponDurabilityLoss = true;
    battleLog('ぶんしん：このターン中3回攻撃、攻撃力+1、武器耐久力が減らない。');
    return;
  }
  if(card.name === 'ぶんしんけん'){
    grantLeaderTempAttack(1, card.name);
    game.player.leaderVerticalSplashThisTurn = true;
    battleLog('ぶんしんけん：このターン中リーダー攻撃力+1、上下にもダメージ。');
    return;
  }
  if(card.name === 'シールドアタック'){
    grantLeaderTempAttack(1, card.name);
    grantLeaderTempDamageReduction(1, 'opponentTurnEnd', card.name);
    drawCard(1);
    return;
  }
  if(card.name === 'ジゴスパーク'){
    const dmg = 3 + Number(game.player.leaderAttackCount || 0);
    for(const u of allEnemyUnits()) dealDamageToUnit(u, dmg, card.name, 'enemy');
    resolveDeaths();
    return;
  }
  if(card.name === 'スキルチャージ'){
    game.player.tensionSkillUseCount = Number(game.player.tensionSkillUseCount || 0) + 3;
    battleLog('スキルチャージ：スキルブースト回数+3。');
    return;
  }
  if(card.name === 'ドラゴンシールド'){
    const amount = 1 + Number(game.player.leaderAttackCount || 0);
    for(const u of allFriendlyUnits()) { u.damageReduction = Math.max(Number(u.damageReduction||0), amount); addStatus(u, 'damageReduction', {until:'turnStart', amount}); }
    grantLeaderTempDamageReduction(amount, 'turnStart', card.name);
    return;
  }
  if(card.name === 'バイキルトのツボ' || card.name === 'ファイトいっぱつ'){
    grantTempAttackAllFriendly(card.name === 'バイキルトのツボ' ? 2 : 1, card.name);
    if(card.name === 'ファイトいっぱつ') for(const u of allFriendlyUnits()) u.conditionGood = true;
    return;
  }
  if(card.name === 'ビッグシールド'){
    gainTension(1, 'おうえん');
    grantLeaderTempDamageReduction(2, 'turnStart', card.name);
    return;
  }
  if(card.name === 'ピオリム'){
    game.player.heroSkillExtraUseThisTurn = true;
    drawCard(1);
    battleLog('ピオリム：このターン中ヒーロースキルを2回発動可能。');
    return;
  }
  if(card.name === '救援のドラキー'){
    openChoiceModal('救援のドラキー', ['2/1のこんぼうを手札に加える','このターン中リーダー被ダメージ-3'], (picked,i)=>{
      if(i===0) addCardToHandByName('こんぼう');
      else grantLeaderTempDamageReduction(3, 'turnEnd', card.name);
      renderBattleArena(); syncMyBattleState();
    }, {kind:'rescueDrackyChoice'});
    return;
  }
  if(card.name === '早詠みの杖'){
    game.player.nextSpellCostDelta = Math.min(Number(game.player.nextSpellCostDelta || 0), -3);
    return;
  }
  if(card.name === '無念無想'){
    game.player.thisTurnSpellCostDelta = Math.min(Number(game.player.thisTurnSpellCostDelta || 0), -1);
    return;
  }
  if(card.name === '孤高の剣技'){
    grantLeaderTempAttack(3, card.name);
    grantLeaderTempDamageReduction(3, 'turnEnd', card.name);
    return;
  }
  if(card.name === '青い閃光'){
    grantLeaderTempAttack(2, card.name);
    for(const u of allFriendlyUnits()) u.conditionGood = true;
    return;
  }
  if(card.name === '魔力かくせい'){
    game.player.turnSpellDamageBonus = Number(game.player.turnSpellDamageBonus || 0) + 1;
    return;
  }
  if(card.name === '魔力解放' || card.name === '道具：大きなパン'){
    if(card.name === '道具：大きなパン' && game.player.usedBigBreadThisTurn) return;
    if(card.name === '道具：大きなパン') game.player.usedBigBreadThisTurn = true;
    game.player.mp += 1;
    game.player.tempMpBonus = Number(game.player.tempMpBonus || 0) + 1;
    return;
  }
  if(card.name === '運命の輪'){
    if(game.player.fortuneMode === 'super') gainTension(1, card.name);
    game.player.fortuneMode = 'super';
    game.player.fortuneModeUntil = 'turnEnd';
    return;
  }
  if(card.name === '闇に堕ちたチカラ'){
    const hasDemon = game.player.hand.some(id => isDemonKingCard(byId(id)));
    grantLeaderTempAttack(hasDemon ? 3 : 1, card.name);
    return;
  }
  if(card.name === 'セクシービーム' || card.name === 'テンプテーション' || card.name === 'デスマエストロ'){
    const limit = card.name === 'セクシービーム' ? 2 : (card.name === 'テンプテーション' && game.player.hand.some(id=>isDemonKingCard(byId(id))) ? 6 : 3);
    game.pendingGenericEffect = {kind:'takeControlUntilEnd', maxAttack:limit, source:card.name, target:'enemyUnit', haste:true, untilTurnEnd:true};
    battleLog(`${card.name}：一時的に味方にする敵ユニットを選んでください。`);
    return;
  }
  if(card.name === 'タロットフォーチュン'){
    game.pendingGenericEffect = {kind:'damageThenSummonToken', amount:7 + getSpellDamageBonus(), tokenName:'ダースドラゴン', attack:7, hp:7, source:card.name, target:'enemyUnit'};
    battleLog('タロットフォーチュン：7ダメージを与える敵ユニットを選んでください。');
    return;
  }
  if(card.name === 'ミラクルブレイド'){
    const amount = 3 + Number(game.player.leaderAttackCount || 0) + getSpellDamageBonus();
    game.pendingGenericEffect = {kind:'damageHealLeader', amount, source:card.name, target:'enemyUnit'};
    battleLog(`ミラクルブレイド：${amount}ダメージの対象を選んでください。`);
    return;
  }
  if(card.name === '流浪のヒューザ'){
    const amount = 1 + Number(game.player.leaderAttackCount || 0);
    game.pendingGenericEffect = {kind:'damage', amount, source:card.name, target:'enemyUnit'};
    battleLog(`流浪のヒューザ：${amount}ダメージの対象を選んでください。`);
    return;
  }
  if(card.name === '闇の加護'){
    game.pendingGenericEffect = {kind:'immuneDamageTurn', source:card.name, target:'friendlyUnit'};
    battleLog('闇の加護：このターン中ダメージを受けない味方ユニットを選んでください。');
    return;
  }


  if(card.name === 'ぬすっと斬り'){
    game.pendingGenericEffect = {kind:'damageAndOpponentDeckCopy', amount:2 + getSpellDamageBonus(), source:card.name, target:'enemyAny'};
    battleLog('ぬすっと斬り：ダメージ対象を選んでください。');
    return;
  }
  if(card.name === 'ぬすむ'){
    const pool = (Array.isArray(game.enemy.deck) && game.enemy.deck.length ? game.enemy.deck.map(id=>byId(id)).filter(Boolean) : state.allCards.filter(c=>c.cardType !== 'ヒーロー'));
    const picks = shuffle([...pool], 'stealLook3', {}).slice(0, Math.min(3, pool.length));
    if(!picks.length) return;
    openChoiceModal('ぬすむ', picks.map(c=>c.name), (picked, i)=>{
      addCardCopyToHand(picks[i]);
      renderBattleArena(); syncMyBattleState();
    }, {kind:'stealChoice'});
    return;
  }
  if(card.name === 'まほうの小ビン'){
    drawCard(1);
    addEnemyHandCardByName('まほうの小ビン');
    battleLog('まほうの小ビン：カードを1枚引き、相手の手札にまほうの小ビンを加えました。');
    return;
  }
  if(card.name === 'やまびこの心得'){
    const amount = 2 + Number(game.player.yamabikoKokoroeUsed || 0) + getSpellDamageBonus();
    damageRandomEnemy(amount, true);
    game.player.deck.push(card.id, card.id);
    shuffle(game.player.deck, 'yamabikoKokoroeShuffle', {});
    game.player.yamabikoKokoroeUsed = Number(game.player.yamabikoKokoroeUsed || 0) + 1;
    battleLog(`やまびこの心得：${amount}ダメージ、コピー2枚をデッキに混ぜました。`);
    resolveDeaths();
    return;
  }
  if(card.name === 'バシルーラの杖' || card.name === '大風の巻物'){
    game.pendingGenericEffect = {kind: card.name === '大風の巻物' ? 'returnEnemyToHandAndDraw' : 'returnEnemyToHand', source:card.name, target:'enemyUnit'};
    battleLog(`${card.name}：手札に戻す敵ユニットを選んでください。`);
    return;
  }
  if(card.name === '邪神の呪い'){
    const amount = Number(game.enemy.handCount || 0) >= 6 ? 5 : 3;
    dealDamageToLeader('enemy', amount, card.name);
    battleLog(`邪神の呪い：敵リーダーに${amount}ダメージ。`);
    return;
  }
  if(card.name === '二者択一'){
    chooseFromOwnTopCards(2, '二者択一', null, (chosenCard, chosenId)=>{ game.player.hand.push(chosenId); });
    return;
  }
  if(card.name === '垣間見る未来'){
    drawCard(1);
    const handCards = game.player.hand.map((id,i)=>({id,i,card:byId(id)})).filter(x=>x.card);
    if(handCards.length){
      openChoiceModal('垣間見る未来：山札の上に置く手札', handCards.map(x=>x.card.name), (picked,i)=>{
        const h = handCards[i];
        const [id] = game.player.hand.splice(h.i,1);
        game.player.deck.unshift(id);
        renderBattleArena(); syncMyBattleState();
      }, {kind:'handToTopDeck'});
    }
    return;
  }
  if(card.name === '魂の写し身'){
    game.pendingGenericEffect = {kind:'shuffleUnitCopiesToDeck', copies:2, source:card.name, target:'unitAny'};
    battleLog('魂の写し身：コピーするユニットを選んでください。');
    return;
  }
  if(card.name === '特訓の成果'){
    game.player.baseLeaderAttackForTurn ??= Number(game.player.leaderAttack || 0);
    game.player.leaderAttack = Number(game.player.leaderAttack || 0) + 1 + Number(game.player.trainingResultUsed || 0);
    game.player.deck.push(card.id);
    shuffle(game.player.deck, 'trainingResultShuffle', {});
    game.player.trainingResultUsed = Number(game.player.trainingResultUsed || 0) + 1;
    battleLog('特訓の成果：リーダー攻撃力をこのターン中強化し、コピーをデッキに混ぜました。');
    return;
  }
  if(card.name === 'すてみ'){
    game.pendingGenericEffect = {kind:'damageDrawIfDiscarded', amount:3 + getSpellDamageBonus(), source:card.name, target:'enemyUnit'};
    battleLog('すてみ：ダメージ対象を選んでください。');
    return;
  }
  if(card.name === 'ひしょうけん'){
    const amount = 1 + Number(game.player.martialArtsUsedThisTurn || 0) + getSpellDamageBonus();
    game.pendingGenericEffect = {kind:'damage', amount, source:card.name, target:'enemyUnit'};
    battleLog(`ひしょうけん：${amount}ダメージの対象を選んでください。`);
    return;
  }
  if(card.name === 'まもののツボ'){
    const pool = shuffle(state.allCards.filter(c=>c.cardType === 'ユニット' && Number(c.cost || 0) >= 6 && Number(c.cost || 0) <= 7), 'mamonoPot', {}).slice(0,3);
    openChoiceModal('まもののツボ', pool.map(c=>c.name), (picked,i)=>{
      addCardCopyToHand(pool[i], {costOverride:0, tempExpiresTurnEnd:true});
      renderBattleArena(); syncMyBattleState();
    }, {kind:'mamonoPotChoice'});
    return;
  }
  if(card.name === 'まもりのふえ'){
    for(const u of game.player.board) if(u && !u.isBuilding){ addStatus(u, 'damageReduction', {until:'turnEnd', amount:2}); u.damageReduction = Math.max(Number(u.damageReduction||0), 2); }
    battleLog('まもりのふえ：味方全体にこのターン中被ダメージ-2。');
    return;
  }
  if(card.name === 'やまびこのさとり'){
    game.player.copyNextSpellToHand = true;
    battleLog('やまびこのさとり：次に使う特技のコピーを手札に加えます。');
    return;
  }
  if(card.name === 'ちからの指輪' || card.name === 'たけやりへい'){
    game.pendingGenericEffect = {kind:'tempAttackBuff', amount:2, source:card.name, target:'unitAny'};
    battleLog(`${card.name}：このターン中攻撃力+2するユニットを選んでください。`);
    return;
  }

  if(card.name === 'スペシャルコイン'){ fireAllFriendlyBetOnce(); return; }
  if(card.name === 'コイン' || card.virtualEffect?.kind === 'coin'){ useCoinCard(); return; }
  if(card.name === '宝の地図'){
    game.pendingGenericEffect = {kind:'summonTreasureMapDungeon', source:card.name, target:'friendlyEmptySlot'};
    battleLog('宝の地図：配置する空きマスを選んでください。');
    return;
  }
  if(card.name === '天使の守り'){
    game.pendingGenericEffect = {kind:'grantRevive', source:card.name, target:'friendlyUnit'};
    battleLog('天使の守り：復活を付与する味方ユニットを選んでください。');
    return;
  }
  if(text.includes('交換する') && card.name.includes('交換所')){ useExchangeCard(card); return; }
  if(hasFortuneEffect(card)){ applyFortuneEffect(card); }
  if(text.includes('選択')){ applyChoiceEffect(card); }
  if(card.cardType === '武器'){
    game.player.leaderAttack = Number(card.attack || 0);
    game.player.leaderCanAttack = game.player.leaderAttack > 0;
    game.player.weapon = {name:card.name, attack:Number(card.attack || 0), durability:Number(card.hp || card.durability || 1), maxDurability:Number(card.hp || card.durability || 1), cardText:text, noCounter:text.includes('反撃ダメージを受けない') || card.name === 'むげんの弓', snipe:text.includes('ねらい撃ち'), doubleAttack:text.includes('2回攻撃'), attacksLeft:text.includes('2回攻撃') ? 2 : 1};
    emitBattleEvent('weaponEquipped', {card, weapon:game.player.weapon});
    battleLog(`${card.name}を装備しました。リーダー攻撃可能。`);
    return;
  }
  const mGet = text.match(/GET\((\d+)\)/i);
  if(mGet){
    for(let i=0;i<Number(mGet[1]);i++) addCardToHandByName('コイン');
    battleLog(`GET(${mGet[1]})：コインを手札に加えました。`);
  }
  if(text.includes('おうえん')) gainTension(1, 'おうえん');
  if(text.includes('消滅')){
    game.pendingGenericEffect = {kind:'vanish', source:card.name, target:'enemyUnit'};
    battleLog(`${card.name}：消滅させる対象を選んでください。`);
    return;
  }
  if(text.includes('封印')){
    game.pendingGenericEffect = {kind:'seal', source:card.name, target:'enemyUnit'};
    battleLog(`${card.name}：封印する対象を選んでください。`);
    return;
  }
  if(card.name === '嘆きの霧'){
    applyStatusToAllUnits('poison', 'enemy');
    game.player.enemyPoisonBonus = Number(game.player.enemyPoisonBonus || 0) + 1;
    battleLog('嘆きの霧：全ての敵ユニットを毒にし、毒ダメージ+1。');
    return;
  }
  if(text.includes('毒') && (text.includes('敵') || text.includes('ユニット'))){
    if(text.includes('全ての敵ユニット') || text.includes('全ての敵')){ applyStatusToAllUnits('poison','enemy'); return; }
    if(text.includes('全てのユニット') || text.includes('お互い')){ applyStatusToAllUnits('poison','both'); return; }
    game.pendingGenericEffect = {kind:'poison', source:card.name, target:'enemyUnit'};
    battleLog(`${card.name}：毒にする対象を選んでください。`);
    return;
  }
  const terrainName = firstTerrainNameInText(text);
  if(terrainName){
    beginTerrainPlacement(card, terrainName);
    return;
  }
  if(card.name === 'ヒャド'){
    const hasIce = (game.enemy.board || []).some(u => u?.name === '氷塊');
    const amount = (hasIce ? 3 : 1) + getSpellDamageBonus();
    game.pendingGenericEffect = {kind:'damage', amount, source:card.name, target:'enemyUnit', canLeader:false};
    battleLog(`ヒャド：敵ユニットを選んでください。${hasIce ? '氷塊があるため3ダメージ。' : '1ダメージ。'}`);
    return;
  }
  const m = text.match(/(?:敵1体|敵１体|ユニット1体|ユニット１体|敵ユニット1体|敵ユニット１体).*?(\d+)ダメージ/);
  if(m){
    game.pendingGenericEffect = {kind:'damage', amount:Number(m[1]) + (isSpell(card) ? getSpellDamageBonus() : 0), source:card.name, target:'enemyAny'};
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
  if(card?.name === 'イブールの本') return resolveIburBookV121('player', index);
  if(card?.name === 'コイン') return useCoinFromHandV110(index);
  const cost = getEffectiveCost(card);
  if(cost > game.player.mp) return;
  game.player.mp -= cost;
  if(isSpell(card)) game.player.nextSpellCostDelta = 0;
  const wasSpecialMove = isSpecialMove(card);
  if(wasSpecialMove) game.player.tension = 0;
  game.player.hand.splice(index, 1);

  if(isWeapon(card)){
    equipWeaponToLeaderV110(card, 'player');
  }else if(card.cardType === 'ヒーロー'){
    activateHeroCard(card);
  }else if(card.virtualEffect){
    applySimpleEffect(card.virtualEffect, {});
    battleLog(`${card.name}を使用しました。`);
  }else{
    applyGenericCardUseEffect(card, cost);
    battleLog(`${card.name}を使用しました。`);
  }

  emitBattleEvent('cardPlayed', {card, cost, source:'use'});
  if(isSpell(card)){
    game.player.usedSpellCostThisTurn = (game.player.usedSpellCostThisTurn || 0) + cost;
    if(cost >= 2 && !game.player.usedSpells2Plus.includes(card.id)) game.player.usedSpells2Plus.push(card.id);
    if(cost >= 1) triggerHeroAuto('spellCost1Plus', {card, cost});
    if(cost >= 2) triggerHeroAuto('spellCost2Plus', {card, cost});
    if(cost >= 3) triggerHeroAuto('spellCost3Plus', {card, cost});
    emitBattleEvent('spellPlayed', {card, cost});
  }
  renderBattleArena();
  syncMyBattleState();
}


// v128: target/attack selection recovery guard
function hasPendingSelectionV128(){
  const game = state.battle.game;
  return !!(game && (
    game.pendingGenericEffect ||
    game.pendingEnemySpellV118 ||
    game.pendingHeroSkill ||
    game.pendingEnemyHandPlacementV121 ||
    game.pendingTerrainPlacement ||
    game.pendingTarget ||
    game.selectedAttacker ||
    game.selectedHandIndex != null
  ));
}
function clearBattleSelectionV128(reason='選択解除'){
  const game = state.battle.game;
  if(!game) return false;
  const had = hasPendingSelectionV128();
  game.pendingGenericEffect = null;
  game.pendingEnemySpellV118 = null;
  game.pendingHeroSkill = null;
  game.pendingEnemyHandPlacementV121 = null;
  game.pendingTerrainPlacement = null;
  game.pendingTarget = null;
  game.selectedAttacker = null;
  game.selectedHandIndex = null;
  game.selectedHandCardId = null;
  if(had) battleLog(`${reason}：対象選択を解除しました。`);
  renderBattleArena();
  return had;
}
window.clearBattleSelectionV128 = clearBattleSelectionV128;
function installSelectionRecoveryV128(){
  if(window.__selectionRecoveryV128Installed) return;
  window.__selectionRecoveryV128Installed = true;
  const handler = (e) => {
    if(!isSoloTestMode()) return;
    const game = state.battle.game;
    if(!game || !hasPendingSelectionV128()) return;
    const clearBtn = e.target.closest?.('#solo-clear-selection-v128');
    if(clearBtn){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      clearBattleSelectionV128('選択解除');
      return;
    }
    if(e.target.closest?.('.unit-slot,.board-slot,.unit-card,.battle-unit,.player-leader,.enemy-leader,.solo-debug-card,.solo-card-preview-backdrop,.choice-modal,.choice-backdrop,#end-turn-top,#solo-test-panel')) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
    clearBattleSelectionV128('無効な場所をタップ');
  };
  document.addEventListener('pointerdown', handler, true);
  document.addEventListener('click', handler, true);
  document.addEventListener('touchend', handler, true);
}
function renderSelectionClearButtonV128(){
  const strip = document.querySelector('.solo-debug-strip');
  if(!strip) return;
  let btn = document.getElementById('solo-clear-selection-v128');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'solo-clear-selection-v128';
    btn.className = 'solo-clear-selection-v128';
    btn.type = 'button';
    btn.textContent = '選択解除';
    btn.onclick = e => { e.preventDefault(); e.stopPropagation(); clearBattleSelectionV128('選択解除'); };
    btn.ontouchend = e => { e.preventDefault(); e.stopPropagation(); clearBattleSelectionV128('選択解除'); };
    strip.appendChild(btn);
  }
  btn.classList.toggle('hidden', !hasPendingSelectionV128());
}
function invalidTargetToastV128(message='対象を選べません。選択解除できます。'){
  toast(message, false);
  renderSelectionClearButtonV128();
}


// v130: direct slot placement capture before global selection recovery
function installPlacementSlotCaptureV130(){
  if(window.__placementSlotCaptureV130Installed) return;
  window.__placementSlotCaptureV130Installed = true;
  const h = (e) => {
    if(!isSoloTestMode()) return;
    const slot = e.target.closest?.('.unit-slot');
    if(!slot) return;
    const game = state.battle.game;
    if(!game) return;
    const side = slot.dataset.side;
    const pos = Number(slot.dataset.pos);
    const board = side === 'player' ? game.player.board : game.enemy.board;
    const isEmpty = !board?.[pos];

    if(isEmpty && side === 'player' && game.selectedHandIndex != null && soloActiveSideV114() === 'player'){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      handleEmptySlotClick(side, pos);
      return;
    }
    if(isEmpty && side === 'enemy' && game.pendingEnemyHandPlacementV121 && soloActiveSideV114() === 'enemy'){
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
      handleEmptySlotClick(side, pos);
      return;
    }
  };
  document.addEventListener('pointerdown', h, true);
  document.addEventListener('click', h, true);
  document.addEventListener('touchend', h, true);
}

function handleBoardClick(side, pos){
  if(isBattleLocked()) return toast('まだ操作できません。', false);

  const game = state.battle.game;
  // v128: Resolve pending effects/attacks before any stale placement wait.
  if(game.pendingGenericEffect && side === 'enemy') return applyPendingGenericEffect(side, pos);
  if(game.pendingEnemySpellV118 && side === 'player') return applyPendingEnemySpellV118({side, pos});
  if(game.selectedAttacker){
    const attacker = game.selectedAttacker;
    if((attacker.side === 'player' || attacker.side === 'playerLeader') && side === 'enemy') return attackUnit(attacker, {side, pos});
    if((attacker.side === 'enemy' || attacker.side === 'enemyLeader') && side === 'player') return attackUnit(attacker, {side, pos});
    invalidTargetToastV128('その対象は攻撃できません。');
    return;
  }
  if(game.pendingEnemySpellV118 && side === 'player') return applyPendingEnemySpellV118({side, pos});
  if(handleEnemyBoardClickV114(side, pos)) return;
  if(game?.finished) return;
  if(!game?.isMyTurn && side === 'player') return toast('相手のターンです。', false);
  const board = side === 'player' ? game.player.board : game.enemy.board;
  const unit = board[pos];
  if(!unit) return;
  if(game.pendingHeroSkill){ return applyPendingHeroSkillToUnit(side, pos); }
  if(game.pendingGenericEffect?.kind === 'coinBet'){
    if(side !== 'player') return toast('コインBETは味方ユニットを選んでください。', false);
    const targets = betTargetsV111().filter(t => t.type === 'unit' && t.unit?.id === unit.id);
    if(targets.length){
      if(game.selectedHandIndex != null) game.player.hand.splice(game.selectedHandIndex, 1);
      activateBetTargetV111(targets[0]);
      game.selectedHandIndex = null;
      game.pendingGenericEffect = null;
      renderBattleArena(); syncMyBattleState();
    }
    return;
  }
  if(game.pendingGenericEffect){ return applyPendingGenericEffectToUnit({side, pos}); }
  if(unit.isBuilding){
    battleLog(`${unit.name}は建物なので攻撃できず、通常対象にも選べません。`);
    return;
  }
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
  if(isBattleLocked()) return toast('まだ操作できません。', false);

  const game = state.battle.game;
  if(!game?.isMyTurn || game.finished) return;
  if(game.player.leaderApathy){ return toast('無気力状態のためリーダーは攻撃できません。', false); }
  if(game.player.leaderAttack > 0 && game.player.leaderCanAttack){
    game.selectedAttacker = {side:'playerLeader'};
    game.selectedHandIndex = null;
    battleLog('味方リーダー：攻撃対象を選んでください。');
    renderBattleArena();
  }
}

function posToCoord(side, pos){
  // Official-like board:
  // rows: 0=上, 1=真ん中, 2=下
  // cols: 0=自後列, 1=自前列, 2=相手前列, 3=相手後列
  // stored positions are row-major within each side:
  // player pos 0/1/2 = 自前列 上/中/下, pos 3/4/5 = 自後列 上/中/下
  // enemy  pos 0/1/2 = 相手前列 上/中/下, pos 3/4/5 = 相手後列 上/中/下
  const row = pos % 3;
  if(side === 'player') return { row, col: pos < 3 ? 1 : 0 };
  return { row, col: pos < 3 ? 2 : 3 };
}
function coordToPos(side, row, col){
  if(side === 'player'){
    if(col === 1) return row;
    if(col === 0) return row + 3;
  }else{
    if(col === 2) return row;
    if(col === 3) return row + 3;
  }
  return -1;
}
function getBehindPos(side, pos){
  const c = posToCoord(side, pos);
  if(side === 'player'){
    // 相手から見て、自分前列の後ろは自分後列
    return c.col === 1 ? coordToPos('player', c.row, 0) : -1;
  }
  // 自分から見て、相手前列の後ろは相手後列
  return c.col === 2 ? coordToPos('enemy', c.row, 3) : -1;
}
function getFrontPos(side, pos){
  const c = posToCoord(side, pos);
  if(side === 'player') return c.col === 0 ? coordToPos('player', c.row, 1) : -1;
  return c.col === 3 ? coordToPos('enemy', c.row, 2) : -1;
}
function isFrontRow(side, pos){
  const c = posToCoord(side, pos);
  return side === 'player' ? c.col === 1 : c.col === 2;
}
function isBackRow(side, pos){
  const c = posToCoord(side, pos);
  return side === 'player' ? c.col === 0 : c.col === 3;
}
function adjacentBoardPositions(side, pos){
  const c = posToCoord(side, pos);
  const out = [];
  for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]){
    const row = c.row + dr;
    const col = c.col + dc;
    if(row < 0 || row > 2) continue;
    const p = coordToPos(side, row, col);
    if(p >= 0) out.push(p);
  }
  return out;
}
function getSameRowPositions(row){
  return {
    playerBack: coordToPos('player', row, 0),
    playerFront: coordToPos('player', row, 1),
    enemyFront: coordToPos('enemy', row, 2),
    enemyBack: coordToPos('enemy', row, 3)
  };
}

function applyPiercingDamage(attacker, defenderRef, amount){
  const game = state.battle.game;
  if(!attacker?.keywords?.piercing && !attacker?.keywords?.superPiercing) return;
  const defBoard = defenderRef.side === 'player' ? game.player.board : game.enemy.board;
  const behind = getBehindPos(defenderRef.side, defenderRef.pos);
  if(behind >= 0 && behind !== defenderRef.pos && defBoard[behind]){
    dealDamageToUnit(defBoard[behind], amount, '貫通', defenderRef.side);
    battleLog(`${attacker.keywords.superPiercing ? '超貫通' : '貫通'}：後ろのユニットにも${amount}ダメージ。`);
  }
  if(attacker.keywords.superPiercing){
    dealDamageToLeader(defenderRef.side, amount, '超貫通');
    battleLog(`超貫通：リーダーにも${amount}ダメージ。`);
  }
}


function consumeWeaponDurabilityAfterLeaderAttack(){
  return consumeWeaponDurabilityAfterLeaderAttackV123('player');
}


function applyWeaponAfterAttack(w){
  const text = String(w?.cardText || '');
  if(w?.name === 'キャットクロー'){
    const u = randomFriendlyUnit();
    if(u) addTempAttack(u, 1, w.name);
  }
  if(text.includes('攻撃した後') || text.includes('攻撃をした後') || text.includes('攻撃で')){
    if(text.includes('カードを1枚引く')) drawCard(1);
    if(text.includes('味方リーダーのテンション+1')) gainTension(1, w.name);
    if(text.includes('全ての味方ユニットのHPを1回復')){
      for(const u of state.battle.game.player.board) if(u) healUnit(u,1);
    }
    const m = text.match(/ランダムな敵.*?(\d+)ダメージ/);
    if(m){
      const targets = state.battle.game.enemy.board.filter(Boolean);
      if(targets.length) dealDamageToUnit(chooseRandom(targets), Number(m[1]), w.name || '武器');
      else dealDamageToLeader('enemy', Number(m[1]), w.name || '武器');
    }
  }
}
function applyWeaponBreakEffect(w){
  const text = String(w?.cardText || '');
  if(text.includes('壊れた時') || text.includes('破壊')){
    if(text.includes('GET(1)')) addCardToHandByName('コイン');
    if(text.includes('全ての敵ユニットに2ダメージ')){
      for(const u of state.battle.game.enemy.board) if(u) dealDamageToUnit(u,2,'武器破壊');
      resolveDeaths();
    }
    if(text.includes('道具カード')) addRandomCardByPredicate(c => String(c.text||'').includes('道具'), 'ちからのたね');
  }
}


function applyAttackTextEffects(atk, def, defenderRef){
  if(!atk || isSealed(atk)) return;
  const game = state.battle.game;
  const text = getCardText(byId(atk.cardId));
  if(atk.name === 'レモンキング'){ addCardToHandByName('コイン'); battleLog('レモンキング：攻撃時GET(1)。'); }
  if(atk.name === '黄金兵長'){ const dmg=countFriendlyByName('ピサロナイト'); if(dmg>0){ dealDamageToLeader('enemy', dmg, '黄金兵長'); battleLog(`黄金兵長：敵リーダーに${dmg}ダメージ。`); } }
  if(atk.name === 'カンダタ'){
    const hasCoin = Number(game.enemy.handCount || 0) > 0;
    if(hasCoin){ addCardToHandByName('コイン'); game.enemy.handCount = Math.max(0, Number(game.enemy.handCount || 0)-1); }
    else atk.attack += 1;
    atk.attack += countCoinsInHand();
    battleLog('カンダタ：攻撃時効果を処理しました。');
  }
  if(atk.name === 'イブール'){
    placeIburBookOnEnemyDeckTopV120('イブール攻撃時');
  }
  if(atk.name === 'グランマーズ'){
    triggerGrandmazTop3V117('グランマーズ攻撃時');
  }
  if(atk.name === 'ラグアス王子'){
    const top = byId(game.enemy.deck?.[0]);
    if(top){
      openChoiceModal(`ラグアス王子：相手山札上 ${top.name}`, ['一番下に送る','そのまま'], (picked,i)=>{
        if(i === 0) game.enemy.deck.push(game.enemy.deck.shift());
        renderBattleArena(); syncMyBattleState();
      }, {kind:'opponentTopDeckMove'});
    }
  }
  if(atk.name === 'マヒャドフライ' && defenderRef?.side === 'enemyLeader') addEnemyHandCardByName('うまのふん');
  if(atk.attackCountsAsLeaderAttack){
    triggerHeroAuto('leaderAttack', {});
    progressDungeonsByEvent('leaderAttack');
  }

  if((atk.conditionGood || atk.hp === atk.maxHp) && game.player.board.some(u => u?.name === 'おおありくい' || u?.name === 'ウパソルジャー')){
    grantLeaderTempAttack(1, '絶好調攻撃誘発');
  }
  if(atk.name === 'Sキラーマシン') atk.gainAttackOnKillThisTurn = true;
  if(atk.name === 'イエローシックル'){
    const ap = game.player.board.indexOf(atk);
    if(defenderRef?.side === 'enemy' && ap >= 0){
      const ac = posToCoord('player', ap), dc = posToCoord('enemy', defenderRef.pos);
      if(ac.row === dc.row) addTempAttack(atk, 2, atk.name);
    }
  }
  if(atk.name === 'バイキングソウル'){
    const ap = game.player.board.indexOf(atk);
    if(defenderRef?.side === 'enemy' && ap >= 0){
      const ac = posToCoord('player', ap), dc = posToCoord('enemy', defenderRef.pos);
      if(ac.row === dc.row) addTempAttack(atk, 3, atk.name);
    }
  }
  if(atk.name === 'バトルレックス' && game.player.weapon){
    game.player.weapon.attack = Number(game.player.weapon.attack || 0) + 2;
    game.player.leaderAttack = Number(game.player.leaderAttack || 0) + 2;
  }
  if(atk.name === 'ホイップゴースト') addTempAttack(atk, 3, atk.name);
  if(atk.name === 'ホワイトパンサー' && (atk.conditionGood || atk.hp === atk.maxHp)) setUnitTempImmuneDamage(atk, 'turnEnd', atk.name);
  if(atk.name === 'デビルロード' && defenderRef?.side === 'enemyLeader') atk.cannotAttackLeaderThisTurn = true;

  if(atk.name === 'さまようたましい') addTempAttack(atk, 3, atk.name);
  if(atk.name === 'アイアンアント') addTempAttack(atk, 1, atk.name);
  if(atk.name === 'アトラス') addTempAttack(atk, Number(game.player.leaderAttack || 0), atk.name);
  if(atk.name === 'アルケミストン'){ game.player.mp += 1; game.player.tempMpBonus = Number(game.player.tempMpBonus || 0) + 1; }
  if(atk.name === 'ギガンテス') addTempAttack(atk, 3, atk.name);
  if(atk.name === 'まどうし'){ game.player.turnSpellDamageBonus = Number(game.player.turnSpellDamageBonus || 0) + 1; }
  if(atk.name === '踊り子マーニャ'){
    const top = byId(game.player.deck?.[0]);
    if(top){
      if(top.cardType !== 'ユニット') addCardIdFromDeckToHandByIndex(game.player.deck, 0, {costDelta:-1});
      else game.player.deck.push(game.player.deck.shift());
    }
  }
  if(!text.includes('攻撃時')) return;
  if(text.includes('カードを1枚引く')) drawCard(1);
  if(text.includes('テンション+1') || text.includes('テンション＋1')) gainTension(1, atk.name);
  const m = text.match(/攻撃時.*?(\d+)ダメージ/);
  if(m && def) dealDamageToUnit(def, Number(m[1]), atk.name);
  if(text.includes('封印') && def) applySeal(def);
  if(text.includes('毒') && def) applyPoison(def);
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
  if(def.name === 'チャゴス王子'){
    if(defenderRef.side === 'player') addCardToHandByName(def.name);
    defBoard[defenderRef.pos] = null;
    battleLog('チャゴス王子：攻撃対象に選択されたため手札に戻りました。');
    game.selectedAttacker = null;
    renderBattleArena(); syncMyBattleState();
    return;
  }
  if(def.isBuilding) return toast('建物/ダンジョンは攻撃対象にできません。', false);
  emitTargetSelected('attackUnit', defenderRef, {attackerRef});
  emitBattleEvent('attackDeclared', {attackerRef, defenderRef, attacker:atk, defender:def});
  animateAttackMotion(attackerRef, defenderRef);
  const kAtk = unitKeywords(atk);
  if(kAtk.poison || atk.grantsPoisonOnDamage) applyPoison(def);
  const combatMult = Number(game.player.combatDamageMultiplier || 1);
  const dealtToDef = damageUnit(def, atk.attack * combatMult);
  emitDamageApplied(defenderRef, atk.attack * combatMult, dealtToDef, atk.name);
  applyCounterDamageV123(atk, attackerRef, def, defenderRef);
  applyOrgoFourthSplash(atk, defenderRef, atk.attack);
  if(game.player.leaderVerticalSplashThisTurn && attackerRef.side === 'playerLeader'){
    const c = posToCoord(defenderRef.side, defenderRef.pos);
    for(const row of [c.row-1, c.row+1]){
      if(row < 0 || row > 2) continue;
      const p = coordToPos(defenderRef.side, row, c.col);
      const u = defBoard[p];
      if(u) dealDamageToUnit(u, atk.attack, 'ぶんしんけん', defenderRef.side);
    }
  }
  if(kAtk.seal) applySeal(def);
  if(kAtk.conditionGood && atk.hp === atk.maxHp){ atk.attack += 1; battleLog('絶好調：攻撃力+1。'); }
  applyAttackTextEffects(atk, def, defenderRef);
  applyPiercingDamage(atk, defenderRef, atk.attack);
  if(atk.gainAttackOnKillThisTurn && def.hp <= 0){
    atk.attack += 1;
    atk.attacksLeft = Math.max(Number(atk.attacksLeft || 0), 1);
    atk.canAttack = true;
  }
  emitBattleEvent('afterAttack', {attacker:atk, targetRef:defenderRef, targetUnit:def, targetSide:defenderRef.side, damage:atk.attack});
  if(game.selectedAttacker.side === 'playerLeader'){
    consumeWeaponDurabilityAfterLeaderAttackV123('player');
    game.player.leaderCanAttack = game.player.weapon?.attacksLeft > 0;
    game.player.leaderAttackedThisTurn = true;
    triggerHeroAuto('leaderAttack', {});
    progressDungeonsByEvent('leaderAttack');
  }else{
    atk.attacksLeft = Math.max(0, (atk.attacksLeft ?? 1) - 1);
    atk.canAttack = atk.attacksLeft > 0;
  }
  emitBattleEvent('attackResolved', {attackerRef, defenderRef, attacker:atk, defender:def});
  battleLog(`${atk.name}が${def.name}を攻撃。`);
  resolveDeaths();
  game.selectedAttacker = null;
  renderBattleArena();
  syncMyBattleState();
}

function attackLeader(targetSide){
  if(isBattleLocked()) return toast('まだ操作できません。', false);

  const game = state.battle.game;
  // enemy leader attack v114
  if(game.pendingHeroSkill && targetSide === 'enemy') return applyPendingHeroSkillToLeader();
  if(game.pendingGenericEffect && targetSide === 'enemy') return applyPendingGenericEffectToLeader();
  if(targetSide === 'enemy' && hasEnemyTaunt()) return toast('におうだちを持つユニットを先に攻撃してください。', false);
  if(!game.selectedAttacker) return;
  let atk;
  if(game.selectedAttacker.side === 'playerLeader') atk = { name:'味方リーダー', attack: game.player.leaderAttack, canAttack: game.player.leaderCanAttack, keywords:{} };
  else { const atkBoard = game.selectedAttacker.side === 'player' ? game.player.board : game.enemy.board; atk = atkBoard[game.selectedAttacker.pos]; }
  if(!atk || !atk.canAttack) return;
  if(atk.name === 'どくろあらい' && targetSide === 'enemy') addTempAttack(atk, 2, atk.name);
  if(targetSide === 'enemy' && atk.cannotAttackLeaderThisTurn) return toast('このターン中、敵リーダーを攻撃できません。', false);
  const leaderTargetRef = {side: targetSide === 'enemy' ? 'enemyLeader' : 'playerLeader'};
  emitTargetSelected('attackLeader', leaderTargetRef, {attackerRef:game.selectedAttacker});
  emitBattleEvent('attackDeclared', {attackerRef:game.selectedAttacker, defenderRef:leaderTargetRef, attacker:atk, targetSide:leaderTargetRef.side});
  animateAttackMotion(game.selectedAttacker, leaderTargetRef);
  applyAttackTextEffects(atk, null, {side:'enemyLeader'});
  consumeZekkochoOnAttackV134(atk, game.selectedAttacker, leaderTargetRef);
  const beforeHp = targetSide === 'enemy' ? game.enemy.hp : game.player.hp;
  damageLeader(targetSide, atk.attack);
  const afterHp = targetSide === 'enemy' ? game.enemy.hp : game.player.hp;
  emitDamageApplied(leaderTargetRef, atk.attack, Math.max(0, beforeHp - afterHp), atk.name);
  emitBattleEvent('afterAttack', {attacker:atk, targetRef:{side: targetSide === 'enemy' ? 'enemyLeader' : 'playerLeader'}, targetSide: targetSide === 'enemy' ? 'enemyLeader' : 'playerLeader', damage:atk.attack});
  if(game.selectedAttacker.side === 'playerLeader'){
    consumeWeaponDurabilityAfterLeaderAttackV123('player');
    game.player.leaderCanAttack = game.player.weapon?.attacksLeft > 0;
    game.player.leaderAttackedThisTurn = true;
    triggerHeroAuto('leaderAttack', {});
    progressDungeonsByEvent('leaderAttack');
  } else {
    atk.attacksLeft = Math.max(0, (atk.attacksLeft ?? 1) - 1);
    atk.canAttack = atk.attacksLeft > 0;
  }
  emitBattleEvent('attackResolved', {attackerRef:game.selectedAttacker, defenderRef:{side: targetSide === 'enemy' ? 'enemyLeader' : 'playerLeader'}, attacker:atk});
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
        unit.lastBoardPos = i;
        const snapshot = JSON.parse(JSON.stringify(unit));
        emitBattleEvent('unitDeath', {unit, side, pos:i, vanished:!!unit.vanished});
        if(!unit.vanished){
          applyDeathrattle(unit, side);
          if(side === 'player'){ game.player.deaths.push({cardId:unit.cardId, name:unit.name, attack:unit.attack, hp:unit.maxHp}); progressDungeonsByEvent('unitDeath'); }
        }
        battleLog(`${unit.name}は${unit.vanished ? '消滅' : '死亡'}しました。`);
        player.board[i] = null;
        if(!unit.vanished && unit.reviveOnDeath){
          reviveUnitSameSlot(snapshot, side, i);
        }else if(!unit.vanished && unit.returnSelfOnDeath && side === 'player'){
          addCardToHandByName(unit.name);
        }
      }
    });
  }
  refreshContinuousBoardEffectsV157('player');
  refreshContinuousBoardEffectsV157('enemy');
}
function applyDeathrattle(unit, side){
  if(!unit?.keywords?.deathrattle && !getCardText(byId(unit.cardId)).includes('死亡時')) return;
  const game = state.battle.game;
  const text = getCardText(byId(unit.cardId));
  const deathText = [extractAfterKeyword(text, '死亡時') || text, unit.extraDeathText || ''].filter(Boolean).join('。');

  if(unit.name === 'ドラゴン' || unit.name === '立ち塞がるドラゴン' || deathText.includes('相手の手札に王女の愛')){
    addCardToOpponentHandRelativeV121(side, '王女の愛', unit.name);
    return;
  }

  applyTextMiniEffect(deathText, unit.name);

  if(unit.deathSummonFish){ summonTokenByName('魚', {attack:2, hp:2}, side); }
  if(unit.betDeathGet2){ addCardToHandByName('コイン'); addCardToHandByName('コイン'); }
  if(unit.name === 'ぶちスライム'){
    const count = Math.min(6, Math.max(0, Number(unit.attack || 0)));
    for(let i=0;i<count;i++){
      if(!summonTokenByName('スライム', {attack:1, hp:1}, side)) break;
    }
  }
  if(unit.name === 'メイジポンポコ'){
    drawSpellCost5Plus();
  }
  if(unit.name === 'プチプリースト'){
    healLeader(4);
  }

  if(String(unit.name || '').includes('オルゴ・デミーラ')) addOrgoNextForm(unit);


  if(unit.name === 'バラモス'){
    game.player.nextUnitCostDelta = -4;
  }
  if(unit.name === 'ベホイミスライム'){
    addCardToHandByName('コイン');
  }
  if(unit.name === '怪獣プスゴン'){
    const pos = unit.lastBoardPos ?? -1;
    if(pos >= 0){
      const c = posToCoord('player', pos);
      const enemyPos = coordToPos('enemy', c.row, 2);
      if(enemyPos >= 0 && !game.enemy.board[enemyPos]) summonTokenAtPosition('イチゴ爆弾', enemyPos, 'enemy', {attack:0, hp:3});
      else {
        const p = randomEnemyEmptySlot();
        if(p >= 0) summonTokenAtPosition('イチゴ爆弾', p, 'enemy', {attack:0, hp:3});
      }
    }
  }
  if(unit.reviveSamePlaceOnDeath){
    const pos = unit.lastBoardPos ?? -1;
    if(pos >= 0 && !game.player.board[pos]){
      const card = byId(unit.cardId);
      if(card) game.player.board[pos] = makeUnitFromCard(card);
    }
  }

  if(unit.name === 'スノーモン'){
    const p = randomEnemyEmptySlot();
    if(p >= 0) summonCardAtPos(findCardByName('氷塊') || ensureVirtualCard('氷塊'), p, 'enemy', {attack:0, hp:3});
  }
  if(unit.name === 'デスマシーン') dealDamageToLeader('enemy', 3, unit.name);
  if(unit.name === 'ピサロのてさき' && (unit.conditionGood || unit.hp === unit.maxHp)){
    const pos = unit.lastBoardPos ?? game.player.board.indexOf(unit);
    if(pos >= 0 && !game.player.board[pos]) summonTokenAtPosition('ピサロナイト', pos, side, {attack:1, hp:1});
    else summonTokenByName('ピサロナイト', {attack:1, hp:1}, side);
  }
  if(unit.name === 'サンディ' || unit.returnToHandNextOwnTurnIfAbsent){
    game.player.delayedHandReturn ||= [];
    game.player.delayedHandReturn.push({name:'サンディ', returnAtTurnStart:Number(game.turn || 0)+1});
  }

  if(unit.name === 'メルビン'){
    const hot = findCardByName('ホットストーン') || ensureVirtualCard('ホットストーン');
    if(hot){
      const idx = Math.min(2, game.player.deck.length);
      game.player.deck.splice(idx, 0, hot.id);
      battleLog('メルビン：ホットストーンをデッキの上から3番目に置きました。');
    }
  }


  if(deathText.includes('相手はカードを引く')) game.enemy.handCount = Number(game.enemy.handCount || 0) + 1;
  if(deathText.includes('手札に加える')){
    const m = deathText.match(/([^、。]+)を?1枚を?手札に加える/);
    if(m) addCardToHandByName(m[1].replace(/^コスト\d+の/, '').trim());
    else if(deathText.includes('このカード') || deathText.includes(unit.name)) addCardToHandByName(unit.name);
  }
  if(deathText.includes('次に召喚するユニットのコスト-')){
    const m = deathText.match(/コスト-(\d+)/);
    game.player.nextUnitCostDelta = -Number(m?.[1] || 1);
  }
  if(deathText.includes('ランダムな味方のダンジョン') && deathText.includes('耐久値+1')){
    const d = randomFrom(game.player.board.filter(u => u?.isDungeon));
    if(d){ d.durability = Math.min(d.maxDurability, d.durability + 1); }
  }
  if(unit.name === 'イチゴ爆弾'){
    const deathBoard = side === 'enemy' ? game.enemy.board : game.player.board;
    const deathPos = Number.isInteger(unit.lastBoardPos) ? unit.lastBoardPos : deathBoard.indexOf(unit);
    if(deathPos >= 0){
      for(const p of adjacentBoardPositions(side, deathPos)){
        const target = deathBoard[p];
        if(target && !target.isBuilding && target.id !== unit.id){
          dealDamageToUnit(target, 2, unit.name, side);
        }
      }
      battleLog('イチゴ爆弾：隣接するユニットに2ダメージ。');
    }
  }
  battleLog(`死亡時：${unit.name}の効果を処理しました。`);
}
function applyPendingGenericEffectToUnit(defenderRef){
  const game = state.battle.game;
  const eff = game.pendingGenericEffect;
  const board = defenderRef.side === 'player' ? game.player.board : game.enemy.board;
  const unit = board[defenderRef.pos];
  if(!eff || !unit) return;
  if(eff.kind === 'setEnemyBuildingDurability2'){
    if(defenderRef.side !== 'enemy' || !unit.isBuilding || unit.isDungeon) return toast('ダンジョンではない敵建物を選んでください。', false);
    unit.durability = 2;
    battleLog(`${eff.source}：${unit.name}の耐久値を2にしました。`);
    game.pendingGenericEffect = null;
    renderBattleArena(); syncMyBattleState();
    return;
  }
  if(eff.target?.includes('friendly') && defenderRef.side !== 'player') return toast('味方ユニットを選んでください。', false);
  if(eff.target?.includes('enemy') && defenderRef.side !== 'enemy') return toast('敵ユニットを選んでください。', false);
  if(eff.target === 'unitAny' && defenderRef.side !== 'player' && defenderRef.side !== 'enemy') return toast('ユニットを選んでください。', false);
  if(!canNormalTargetUnit(unit, eff)){
    toast('建物/ダンジョンはこの効果の対象にできません。', false);
    return;
  }
  emitTargetSelected('genericEffectUnit', defenderRef, {effect: makeEffectTargetPayload(eff, defenderRef)});
  if(eff.kind === 'setAttack'){ unit.attack = Number(eff.value || 0); }
  if(eff.kind === 'setHp'){ unit.hp = Math.min(Number(unit.hp || 0), Number(eff.value || 0)); unit.maxHp = Math.min(Number(unit.maxHp || 0), Number(eff.value || 0)); }
  if(eff.kind === 'buffStats'){ unit.attack += Number(eff.attack || 0); unit.hp += Number(eff.hp || 0); unit.maxHp += Number(eff.hp || 0); }
  if(eff.kind === 'grantKeywords'){ unit.keywords ||= {}; Object.assign(unit.keywords, eff.keywords || {}); if(eff.keywords?.haste){ unit.canAttack = true; unit.summoningSickness = false; } }
  if(eff.kind === 'copyUnitToHand'){ addCardCopyToHand(byId(unit.cardId)); }
  if(eff.kind === 'transformToSlime'){ const slime = findCardByName('スライム') || ensureVirtualCard('スライム'); unit.cardId = slime.id; unit.name = 'スライム'; unit.attack = 1; unit.hp = 1; unit.maxHp = 1; unit.keywords = {}; }
  if(eff.kind === 'damage'){
    const amount = (eff.source === '卑劣などくやずきん' && (hasStatus(unit,'poison') || leaderHasStatus(defenderRef.side,'poison'))) ? 3 : eff.amount;
    dealDamageToUnit(unit, amount, eff.source || '効果', defenderRef.side);
  }
  if(eff.kind === 'damageAndOpponentDeckCopy'){
    dealDamageToUnit(unit, eff.amount, eff.source || '効果', defenderRef.side);
    addRandomOpponentDeckCopyToHand({costDelta:-1});
  }
  if(eff.kind === 'returnEnemyToHand' || eff.kind === 'returnEnemyToHandAndDraw'){
    returnEnemyUnitToOpponentHand(unit, defenderRef.side);
    if(eff.kind === 'returnEnemyToHandAndDraw') drawCard(1);
  }
  if(eff.kind === 'returnEnemyToHandAtkMax' || eff.kind === 'returnEnemyToHandAtkMaxFront' || eff.kind === 'returnEnemyToHandAtkMaxJail'){
    if(Number(unit.attack || 0) > Number(eff.maxAttack || 0)) return toast('攻撃力条件を満たしていません。', false);
    if(eff.kind === 'returnEnemyToHandAtkMaxFront' && !isFrontRow(defenderRef.side, defenderRef.pos)) return toast('前列の敵ユニットを選んでください。', false);
    if(eff.kind === 'returnEnemyToHandAtkMaxJail') unit.jailedBy = eff.source;
    returnEnemyUnitToOpponentHand(unit, defenderRef.side);
  }
  if(eff.kind === 'monasteryHpAndAdjacentAtk'){
    unit.hp += 1; unit.maxHp += 1;
    const pos = game.player.board.indexOf(unit);
    for(const p of adjacentBoardPositions('player', pos)){
      const u = game.player.board[p];
      if(u && !u.isBuilding) u.attack = Number(u.hp || 0);
    }
  }
  if(eff.kind === 'shuffleUnitCopiesToDeck'){
    for(let i=0;i<Number(eff.copies || 1);i++) game.player.deck.push(unit.cardId);
    shuffle(game.player.deck, 'unitCopiesToDeck', {source:eff.source});
  }
  if(eff.kind === 'tempAttackBuff'){
    addTempAttack(unit, eff.amount, eff.source);
  }
  if(eff.kind === 'tempAttackBuffNoLeader'){
    addTempAttack(unit, eff.amount, eff.source);
    unit.cannotAttackLeaderThisTurn = true;
  }
  if(eff.kind === 'damageDrawIfDiscarded'){
    dealDamageToUnit(unit, eff.amount, eff.source || '効果', defenderRef.side);
    if(game.player.discardedThisTurn) drawCard(1);
  }
  if(eff.kind === 'takeControlUntilEnd') return recruitEnemyUnitV132(defenderRef, unit, {...eff, haste:true, untilTurnEnd:true});
  if(eff.kind === 'takeControlPermanent') return recruitEnemyUnitV132(defenderRef, unit, eff);
  if(eff.kind === 'takeControlBuffWhileSource') return recruitEnemyUnitV132(defenderRef, unit, eff);
  if(eff.kind === 'damageThenSummonToken'){

    dealDamageToUnit(unit, eff.amount, eff.source || '効果', defenderRef.side);
    summonTokenByName(eff.tokenName, {attack:eff.attack, hp:eff.hp}, 'player');
  }
  if(eff.kind === 'damageHealLeader'){
    const actual = dealDamageToUnit(unit, eff.amount, eff.source || '効果', defenderRef.side);
    healLeader(actual);
  }
  if(eff.kind === 'immuneDamageTurn'){
    setUnitTempImmuneDamage(unit, 'turnEnd', eff.source);
  }
  if(eff.kind === 'debuffStats'){
    unit.attack += Number(eff.attack || 0);
    unit.hp += Number(eff.hp || 0);
    unit.maxHp += Number(eff.hp || 0);
  }
  if(eff.kind === 'controlAndHaste') return recruitEnemyUnitV132(defenderRef, unit, {...eff, haste:true, untilTurnEnd:true});
  if(eff.kind === 'renkeiVanishAtk6GiveEnemy'){

    if(Number(unit.attack || 0) < 6) return toast('攻撃力6以上の敵ユニットを選んでください。', false);
    const cost = Number(byId(unit.cardId)?.cost || 0);
    unit.vanished = true; unit.hp = 0;
    addRandomUnitCardToEnemyHandByCost(cost);
  }
  if(eff.kind === 'renkeiReturnAtk3'){
    if(Number(unit.attack || 0) > 3) return toast('攻撃力3以下の敵ユニットを選んでください。', false);
    addEnemyHandCardByName(unit.name);
    unit.vanished = true; unit.hp = 0;
  }
  if(eff.kind === 'grantRevive') grantReviveOnDeath(unit);
  if(eff.kind === 'strategyEnemy') applyStrategyEffect(unit, eff.strategyName, unit);
  if(eff.kind === 'buffAttack'){ unit.attack += Number(eff.amount || 0); }
  if(eff.kind === 'poison') applyPoison(unit);
  if(eff.kind === 'seal') applySeal(unit);
  if(eff.kind === 'apathy'){ addStatus(unit, 'apathy', {until:'turnStart'}); unit.canAttack = false; }
  if(eff.kind === 'vanish'){ unit.vanished = true; unit.hp = 0; }
  battleLog(`${eff.source}：${unit.name}に${eff.kind === 'buffAttack' ? '攻撃力+'+eff.amount : (eff.amount ?? '') + (eff.kind === 'damage' ? 'ダメージ' : eff.kind === 'poison' ? '毒' : eff.kind === 'seal' ? '封印' : '消滅')}。`);
  game.pendingGenericEffect = null;
  resolveDeaths();
  renderBattleArena();
  syncMyBattleState();
}

function applyPendingGenericEffectToLeader(){
  const game = state.battle.game;
  const eff = game.pendingGenericEffect;
  if(!eff) return;
  if(eff.target === 'enemyUnit') return toast('敵ユニットを選んでください。', false);
  if(eff.canLeader === false) return toast('敵リーダーは対象にできません。', false);
  emitTargetSelected('genericEffectLeader', {side:'enemyLeader'}, {effect: makeEffectTargetPayload(eff, {side:'enemyLeader'})});
  if(eff.kind === 'damage'){
    const amount = (eff.source === '卑劣などくやずきん' && leaderHasStatus('enemy','poison')) ? 3 : eff.amount;
    dealDamageToLeader('enemy', amount, eff.source || '効果');
    battleLog(`${eff.source}：敵リーダーに${amount}ダメージ。`);
  }else if(eff.kind === 'damageAndOpponentDeckCopy'){
    dealDamageToLeader('enemy', eff.amount, eff.source || '効果');
    addRandomOpponentDeckCopyToHand({costDelta:-1});
  }else{
    battleLog(`${eff.source}：敵リーダーに${eff.amount ?? ''}。`);
  }
  game.pendingGenericEffect = null;
  renderBattleArena();
  syncMyBattleState();
}
function applyPendingGenericEffectToEmptySlot(pos){
  const game = state.battle.game;
  const eff = game.pendingGenericEffect;
  if(!eff || eff.target !== 'friendlyEmptySlot') return;
  if(game.player.board[pos]) return toast('空きマスを選んでください。', false);
  emitEmptySlotSelected('genericEffectEmptySlot', 'player', pos, {effect: makeEffectTargetPayload(eff, {side:'playerEmpty', pos})});
  if(eff.kind === 'setTerrain'){
    setTerrain(pos, eff.terrainType, eff.source);
  }else if(eff.kind === 'summonSpecificToken'){
    summonTokenAtPosition(eff.tokenName, pos, 'player', {attack:eff.attack, hp:eff.hp});
  }else if(eff.kind === 'summonTreasureMapDungeon'){
    const cleared = Number(game.player.dungeonsCleared || 0);
    let name = 'うす暗き獣の洞くつ';
    if(cleared === 1) name = 'ざわめく風の坑道';
    else if(cleared >= 2) name = chooseRandom(['見えざる魔神の道','放たれし大地のじごく','残された神々の水脈','呪われし魂の氷河','大魔王の間','あらぶる光の世界']);
    const card = findCardByName(name);
    if(card){
      game.player.board[pos] = makeUnitFromCard(card);
      battleLog(`宝の地図：${name}を配置しました。`);
    }
  }
  game.pendingGenericEffect = null;
  renderBattleArena();
  syncMyBattleState();
}

function useOrChargeTension(){
  const game = state.battle.game;
  if(isBattleLocked()) return toast('まだ操作できません。', false);
  if(game?.finished) return;
  if(!game?.isMyTurn) return toast('相手のターンです。', false);
  if(!game) return;
  if(game.player.leaderApathy){
    game.player.tension = 0;
    game.player.leaderCanAttack = false;
    return toast('無気力状態のためテンションを使えません。', false);
  }
  if(game.player.tension >= 3){
    if(isSoloTestMode()) return soloUseTensionSkillV103();
    if(!game.player.leaderSkill) game.player.leaderSkill = getBaseTensionSkill(game.className || state.battle.selectedDeck?.className || '戦士');
    applyTensionSkill(game.player.leaderSkill);
    triggerSkillBoostOnTensionSkill();
    triggerTensionLinks('skillUse', {skill:game.player.leaderSkill});
    game.player.tension = 0;
    game.player.tensionUsedThisTurn = true;
  }else{
    const tensionCost = game.player.nextTensionCostZero ? 0 : 1;
    if(game.player.mp < tensionCost) return toast('MPが足りません。', false);
    if(game.player.tensionUsedThisTurn) return toast('このターンは既にテンション操作済みです。', false);
    game.player.mp -= tensionCost;
    game.player.nextTensionCostZero = false;
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
  const hs = game?.player?.heroSkill;
  if(hs?.heroCardName === '勇者レック') {
    game.player.reckTensionSkillUses = Number(game.player.reckTensionSkillUses || 0) + 1;
    incrementAllProficiency(1);
    battleLog('勇者レック：熟練度+1。');
  }
  if(!effect){ if(isSoloTestMode()) soloWarriorTensionV106(skill); return; }
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
  }else if(effect.type === 'drawFromDeckByType'){
    drawFromDeckByTypeWithCostDeltaV124(effect.cardType || '特技', Number(effect.costChange ?? -1), name);
  }else if(effect.type === 'multi'){
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
  let drawn = 0;
  const drawnNames = [];
  for(let i=0;i<count;i++){
    if(game.player.deck.length){
      const id = game.player.deck.shift();
      const card = byId(id);
      if((game.player.hand || []).length >= 10){
        battleLog(`ドロー：${card?.name || id}は手札上限10枚のため破棄。`);
      }else{
        game.player.hand.push(id);
        drawn++;
        drawnNames.push(card?.name || id);
      }
    }else{
      game.player.hp = Math.max(0, game.player.hp - 1);
      battleLog('デッキ切れで1ダメージ。');
    }
  }
  if(isSoloTestMode() && drawnNames.length) battleLog(`ドロー：${drawnNames.join(' / ')}`);
  return drawn;
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



function applyBuildingTurnStart(unit){
  const game = state.battle.game;
  const text = getCardText(byId(unit.cardId));
  if(!unit?.isBuilding) return;
  if(unit.name === 'お告げのほこら'){
    game.skipNextDrawForOracleV123 = true;
    moveDeckTopToBottomOptionalV123('player', unit.name, {drawAfter:true});
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
  if(unit.name === '氷の館'){
    const hasMera = [...game.player.hand, ...game.player.deck].some(id => String(getCardText(byId(id))).includes('メラ系') || byId(id)?.name?.includes('メラ'));
    if(!hasMera) addCardToHandByName('ヒャド');
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
}

function applyBuildingTurnEnd(unit){
  const game = state.battle.game;
  const text = getCardText(byId(unit.cardId));

  if(unit.name === '墓所'){
    unit.triggersThisTurn = 0;
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }

  if(unit.name === '武器屋'){
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
  if(unit.name === '占い小屋'){
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
  if(unit.name === '塔'){
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
  if(unit.name === '牢屋'){
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }

  if(unit.name === 'まほう研究所'){
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
  if(unit.name === 'アジト'){
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
  if(unit.name === '図書館'){
    drawCard(1);
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
  if(unit.name === '道具屋'){
    addToolCard();
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
  if(unit.name === '特訓場'){
    gainTension(1, unit.name);
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
  if(unit.name === '丸太小屋'){
    const pos = game.player.board.indexOf(unit);
    const fp = isFrontRow('player', pos) ? getBehindPos('player', pos) : getFrontPos('player', pos);
    const target = fp >= 0 ? game.player.board[fp] : null;
    if(target && !target.isBuilding){ target.attack += 1; target.hp += 1; target.maxHp += 1; }
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
  if(unit.name === '宿屋'){
    let healed = false;
    const pos = game.player.board.indexOf(unit);
    for(const p of adjacentBoardPositions('player', pos)){
      const u = game.player.board[p];
      if(u && !u.isBuilding && u.hp < u.maxHp){ healUnit(u,1); healed = true; }
    }
    if(healed) drawCard(1);
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }
  if(unit.name === '美容院'){
    const pos = game.player.board.indexOf(unit);
    const fp = isFrontRow('player', pos) ? getBehindPos('player', pos) : getFrontPos('player', pos);
    const old = fp >= 0 ? game.player.board[fp] : null;
    if(old && !old.isBuilding && old.hp >= 1){
      const oldCost = Number(byId(old.cardId)?.cost || 0);
      const pool = state.allCards.filter(c => c.cardType === 'ユニット' && Number(c.cost || 0) === oldCost + 1);
      const card = chooseRandom(pool, 'beautySalonTransform', {oldCost});
      if(card) game.player.board[fp] = makeUnitFromCard(card);
    }
    adjustBuildingDurability(unit, -1, unit.name);
    return;
  }

  // 建物は攻撃不可。通常建物は説明に「ターン終了時」系の記載があるものだけ耐久値を減らす。
  if(!unit.isDungeon){
    if(text.includes('自分のターン終了時') || text.includes('ターン終了時')){
      if(text.includes('カードを1枚引く')) drawCard(1);
      if(text.includes('テンション+1') || text.includes('テンション＋1')) gainTension(1, unit.name);
      if(text.includes('道具カード')) addRandomCardByPredicate(c => String(c.text||'').includes('道具'), 'ちからのたね');
      if(text.includes('隣接') && text.includes('HPを1回復')){
        for(const u of state.battle.game.player.board) if(u && !u.isBuilding) healUnit(u, 1);
      }
      if(text.includes('+1/+1') || text.includes('＋1/＋1')){
        for(const u of state.battle.game.player.board) if(u && !u.isBuilding){ u.attack += 1; u.hp += 1; u.maxHp += 1; }
      }
      if(buildingHasEndTurnDurabilityLoss(unit)){
        unit.durability = Math.max(0, (unit.durability ?? 1) - 1);
        battleLog(`${unit.name}：耐久値${unit.durability}/${unit.maxDurability || unit.maxHp || 1}`);
      }
    }
    return;
  }

  // ダンジョンは基本的に「耐久値が条件で増えて、規定値で踏破」。
  // ターン終了時に減るわけではない。説明欄に開始/終了時+1などがある場合だけ増やす。
  const before = unit.durability || 0;
  if(buildingHasStartTurnDurabilityGain(unit) || buildingHasEndTurnDurabilityGain(unit)){
    unit.durability += 1;
  }
  if(unit.durability !== before) battleLog(`${unit.name}：耐久値${unit.durability}/${unit.maxDurability}`);
  if(unit.durability >= unit.maxDurability) completeDungeon(unit);
}
function completeDungeon(unit){
  const game = state.battle.game;
  const text = getCardText(byId(unit.cardId));
  const pos = game.player.board.indexOf(unit);
  if(pos >= 0) game.player.board[pos] = null;
  game.player.dungeonsCleared = Number(game.player.dungeonsCleared || 0) + 1;
  battleLog(`${unit.name}を踏破しました。`);
  if(text.includes('カードを3枚引く')){ drawCard(3); battleLog(`${unit.name}踏破報酬：カードを3枚引きました。`); }
  if(text.includes('カードを1枚引く') || text.includes('カードを１枚引く')){ drawCard(1); battleLog(`${unit.name}踏破報酬：カードを1枚引きました。`); }
  if(text.includes('王女の愛')) addCardToHandByName('王女の愛');
  if(text.includes('ドルマドン')) addCardToHandByName('ドルマドン');
  if(text.includes('しあわせの箱')) addCardToHandByName('しあわせの箱');
  if(text.includes('おうごんのつめ')) addCardToHandByName('おうごんのつめ');

  const addNamed = text.match(/(?:踏破時|踏破した時)[:：]?([^。]+)/);
  if(addNamed) battleLog(`${unit.name}踏破報酬：${addNamed[1]}を処理しました。`);

  if(unit.name === '守りのほこら'){
    if(pos >= 0){
      const ok = summonRandomUnitAtPos(c => Number(c.cost || 0) === 4, pos, 'player');
      const u = game.player.board[pos];
      if(u) u.keywords.taunt = true;
    }
  }else if(unit.name === 'ピラミッド'){
    for(let i=0;i<2;i++) summonTokenByName('ミイラおとこ', {attack:3, hp:3}, 'player');
  }else if(unit.name === 'ロンダルキアへの洞くつ'){
    for(let i=0;i<3;i++) summonRandomUnitAtPos(c => Number(c.cost || 0) === 2, game.player.board.findIndex(x=>!x), 'player');
    for(const u of game.player.board) if(u && !u.isBuilding){ u.keywords.haste = true; u.canAttack = true; u.summoningSickness = false; }
  }
  if(unit.name === 'ざわめく風の坑道'){
    if(pos >= 0) summonRandomUnitAtPos(c => Number(c.cost || 0) === 2, pos, 'player');
  }else if(unit.name === '見えざる魔神の道'){
    if(pos >= 0) summonCardAtPos(findCardByName('強敵メタルキング'), pos, 'player', {keywords:{firstStrike:true, metal:true}});
    summonTokenByName('強敵メタルキング', {attack:3, hp:3}, 'player');
  }else if(unit.name === '放たれし大地のじごく'){
    for(const u of [...game.player.board, ...game.enemy.board]) if(u && u !== unit) dealDamageToUnit(u, 2, unit.name);
    dealDamageToLeader('player', 2, unit.name); dealDamageToLeader('enemy', 2, unit.name);
    resolveDeaths();
  }else if(unit.name === '残された神々の水脈'){
    healLeader(3); gainTension(3, unit.name);
  }else if(unit.name === '呪われし魂の氷河'){
    const targets = game.enemy.board.filter(Boolean);
    if(targets.length) dealDamageToUnit(chooseRandom(targets), 5, unit.name, 'enemy');
    resolveDeaths();
  }else if(unit.name === '大魔王の間'){
    if(pos >= 0){
      summonRandomUnitAtPos(c => (c.tribes || []).includes('魔王系') && Number(c.cost || 0) >= 6, pos, 'player');
      const u = game.player.board[pos];
      if(u) u.keywords = {...(u.keywords||{}), firstStrike:true};
    }
  }else if(unit.name === 'あらぶる光の世界'){
    const pool = state.allCards.filter(c => c.cardType !== 'ユニット' && c.name !== unit.name);
    const picks = [];
    while(pool.length && picks.length < 3){ const idx=randomIndex(pool.length, 'heroCostOverridePick', {i:picks.length}); picks.push(pool.splice(idx,1)[0]); }
    game.player.costOverrides ||= {};
    for(const c of picks){ if(addCardIdToPlayerHandV110(c.id, unit.name)){ game.player.costOverrides[c.id] = Math.max(0, Number(c.cost || 0) - 1); } } battleLog(`${unit.name}踏破報酬：ユニット以外3枚を手札へ。コスト-1。`);
  }
}
function progressDungeonsByEvent(eventName, payload={}){
  const game = state.battle.game;
  if(!game?.player?.board) return;
  for(const b of [...game.player.board]){
    if(!b?.isDungeon) continue;
    const text = getCardText(byId(b.cardId));
    let add = 0;

    if(eventName === 'summon' && text.includes('味方ユニットが場に出る')) add += 1;
    if(eventName === 'leaderAttack' && (text.includes('味方リーダーが攻撃した後') || text.includes('味方が攻撃した後'))) add += 1;
    if(eventName === 'unitAttack' && text.includes('味方が攻撃した後')) add += 1;
    if(eventName === 'unitDeath' && text.includes('味方ユニットが死亡する度')){
      if(b.name === '墓所'){
        b.triggersThisTurn = Number(b.triggersThisTurn || 0);
        if(b.triggersThisTurn < 6){ gainTension(1, b.name); b.triggersThisTurn += 1; }
      }else add += game.player.maxMp >= 8 ? 2 : 1;
    }
    if(eventName === 'tensionLink' && text.includes('テンションリンク')) add += 1;

    if(eventName === 'cardUse'){
      const card = payload.card;
      const cost = Number(payload.cost ?? getEffectiveCost(card));
      const cardText = getCardText(card);
      if(text.includes('コスト1〜8') && isSpell(card) && cost >= 1 && cost <= 8){
        game.player.dungeonSpellCostsUsed ||= {};
        game.player.dungeonSpellCostsUsed[b.id] ||= [];
        if(!game.player.dungeonSpellCostsUsed[b.id].includes(cost)){
          game.player.dungeonSpellCostsUsed[b.id].push(cost);
          add += 2;
        }
      }
      if(text.includes('自分が武闘家のカードを使う度')){
        const joined = `${card?.classes || ''} ${card?.leader || ''} ${cardText}`;
        if(joined.includes('武闘家') || joined.includes('アリーナ')) add += 1;
      }
    }

    if(add){
      b.durability = Number(b.durability || 0) + add;
      battleLog(`${b.name}：耐久値+${add} (${b.durability}/${b.maxDurability})`);
    }
    if(b.durability >= b.maxDurability) completeDungeon(b);
  }
}

async 
// v114: solo two-player turn controller
function soloActiveSideV114(){
  const game = state.battle.game;
  if(!game) return 'player';
  game.soloActiveSide ||= 'player';
  return game.soloActiveSide;
}
function soloSideNameV114(side){
  return side === 'enemy' ? '相手' : '自分';
}
function soloPlayerObjV114(side){
  const game = state.battle.game;
  return side === 'enemy' ? game.enemy : game.player;
}
function drawForSideV114(side, count=1){
  const game = state.battle.game;
  const obj = soloPlayerObjV114(side);
  obj.hand ||= [];
  obj.deck ||= [];
  let drawn = 0;
  for(let i=0;i<count;i++){
    if(!obj.deck.length){
      if(side === 'player') game.player.hp = Math.max(0, game.player.hp - 1);
      else game.enemy.hp = Math.max(0, game.enemy.hp - 1);
      battleLog(`${soloSideNameV114(side)}：デッキ切れで1ダメージ。`);
      continue;
    }
    const id = obj.deck.shift();
    const card = byId(id);
    if(obj.hand.length >= 10){
      battleLog(`${soloSideNameV114(side)}ドロー：${card?.name || id}は手札上限10枚のため破棄。`);
      continue;
    }
    obj.hand.push(id);
    drawn++;
    battleLog(`${soloSideNameV114(side)}ドロー：${card?.name || id}`);
  }
  if(side === 'enemy') obj.handCount = obj.hand.length;
  return drawn;
}
function refreshUnitsForSideTurnV114(side){
  const game = state.battle.game;
  const board = side === 'enemy' ? game.enemy.board : game.player.board;
  for(const u of board){
    if(!u || u.isBuilding) continue;
    if(u.summoningSickness){
      u.summoningSickness = false;
      u.canAttack = !!Number(u.attack || 0);
    }else{
      u.canAttack = !!Number(u.attack || 0);
    }
    u.attacksLeft = Math.max(Number(u.attacksLeft || 1), u.keywords?.doubleAttack ? 2 : 1);
  }
}
function soloStartSideTurnV114(side){
  const game = state.battle.game;
  clearTurnPlayedCardTrackV124(side);
  const obj = soloPlayerObjV114(side);
  obj.maxMp = Math.min(10, Number(obj.maxMp || 0) + 1);
  obj.mp = obj.maxMp;
  obj.hand ||= [];
  obj.deck ||= [];
  obj.board ||= Array(6).fill(null);
  if(side === 'player'){
    game.isMyTurn = true;
    game.player.tensionUsedThisTurn = false;
    game.player.heroSkillUsedThisTurn = false;
    game.player.usedSpellCostThisTurn = 0;
    game.player.leaderAttackedThisTurn = false;
    game.player.leaderCanAttack = !!game.player.weapon && Number(game.player.weapon.attack || 0) > 0;
    emitBattleEvent('ownTurnStart', {side:'player'});
  }else{
    game.isMyTurn = false;
    game.enemy.tensionUsedThisTurn = false;
    game.enemy.leaderCanAttack = !!game.enemy.weapon && Number(game.enemy.weapon.attack || 0) > 0;
  }
  refreshUnitsForSideTurnV114(side);
  const skipOracleDraw = side === 'player' && game.skipNextDrawForOracleV123;
  if(skipOracleDraw){
    battleLog('お告げのほこら：選択後にドローします。');
  }else{
    drawForSideV114(side, 1);
  }
  battleLog(`${soloSideNameV114(side)}ターン開始：MP ${obj.mp}/${obj.maxMp}`);
}
function soloEndTurnV114(){
  return soloHardTurnSwitchV117();
}


// v118: robust enemy-hand play / enemy spell use
function enemyEffectiveCostV118(card){
  return Math.max(0, Number(card?.cost || 0));
}
function extractDamageAmountV118(text){
  text = String(text || '');
  const m = text.match(/(\d+)\s*ダメージ/);
  return Number(m?.[1] || 0);
}
function enemyUseSpellV118(index, card, active){
  const game = state.battle.game;
  if(card?.name === 'イブールの本') return resolveIburBookV121('enemy', index);
  const cost = enemyEffectiveCostV118(card);
  if(active === 'enemy' && Number(game.enemy.mp || 0) < cost){
    toast('相手MPが足りません。', false);
    return false;
  }
  if(active === 'enemy') game.enemy.mp -= cost;
  game.enemy.hand.splice(index, 1);
  game.enemy.handCount = game.enemy.hand.length;

  const text = getCardText(card);
  const dmg = extractDamageAmountV118(text);
  const needsTarget = /敵(?:ユニット|1体|１体|一体|リーダー|すべて|全て)|ユニット1体|ユニット１体|1体|１体/.test(text);

  emitBattleEvent('cardPlayed', {side:'enemy', card, cost, source:'enemyUse'});
  battleLog(`相手：${card.name}を使用しました。`);

  if(dmg > 0 && (text.includes('敵リーダー') || text.includes('リーダーに')) && !text.includes('ユニット')){
    dealDamageToLeader('player', dmg, card.name);
    battleLog(`相手${card.name}：自分リーダーに${dmg}ダメージ。`);
    renderBattleArena();
    return true;
  }

  if(dmg > 0 && (text.includes('全て') || text.includes('すべて') || text.includes('全体'))){
    for(const u of game.player.board){
      if(u && !u.isBuilding) dealDamageToUnit(u, dmg, card.name, 'player');
    }
    if(text.includes('リーダー')) dealDamageToLeader('player', dmg, card.name);
    resolveDeaths();
    battleLog(`相手${card.name}：自分側全体に${dmg}ダメージ。`);
    renderBattleArena();
    return true;
  }

  if(dmg > 0 && needsTarget){
    const canLeader = !(text.includes('敵ユニット') || text.includes('ユニットのみ') || card.name === 'ヒャド');
    game.pendingEnemySpellV118 = {cardId:card.id, name:card.name, damage:dmg, canLeader};
    battleLog(`相手${card.name}：対象を選んでください。${canLeader ? '自分ユニットまたは自分リーダー' : '自分ユニット'}をクリック。`);
    renderBattleArena();
    return true;
  }

  // 最低限の汎用処理。対象不要のドロー/回復系などはログ中心。
  if(text.includes('カードを1枚引く') || text.includes('カードを１枚引く')){
    drawForSideV114('enemy', 1);
  }
  if(text.includes('カードを2枚引く') || text.includes('カードを２枚引く')){
    drawForSideV114('enemy', 2);
  }
  battleLog(`相手${card.name}：効果を簡易処理しました。`);
  renderBattleArena();
  return true;
}
function applyPendingEnemySpellV118(target){
  const game = state.battle.game;
  const eff = game.pendingEnemySpellV118;
  if(!eff) return false;
  if(target.side === 'playerLeader'){
    if(!eff.canLeader) return toast('リーダーは対象にできません。', false), true;
    dealDamageToLeader('player', eff.damage, eff.name);
    battleLog(`相手${eff.name}：自分リーダーに${eff.damage}ダメージ。`);
  }else if(target.side === 'player'){
    const unit = game.player.board[target.pos];
    if(!unit) return false;
    dealDamageToUnit(unit, eff.damage, eff.name, 'player');
    battleLog(`相手${eff.name}：${unit.name}に${eff.damage}ダメージ。`);
    resolveDeaths();
  }else{
    return false;
  }
  game.pendingEnemySpellV118 = null;
  renderBattleArena();
  return true;
}

// v119: direct enemy hand click + Poicklin + pending target cleanup

// v120: enemy-hand container delegation / Ibur book / Zankyo cost discount / layout tweaks

// v121: hand confirm modal, enemy placement target, dragon death ownership, counter damage, Hoimi, Ibur Book
function isPrincessLoveCardV121(card){
  return card?.name === '王女の愛';
}
function isNonBoardActionCardV121(card){
  return isCoinResourceCard(card) || isWeapon(card) || isSpell(card) || isPrincessLoveCardV121(card);
}
function addCardToHandByNameForSideV121(side, name, source='効果'){
  const game = state.battle.game;
  const card = findCardByName(name) || ensureVirtualCard(name);
  if(!card) return false;
  const obj = side === 'enemy' ? game.enemy : game.player;
  obj.hand ||= [];
  if(obj.hand.length >= 10){
    battleLog(`${source}：${side === 'enemy' ? '相手' : '自分'}手札上限のため${name}は破棄。`);
    return false;
  }
  obj.hand.push(card.id);
  if(side === 'enemy') obj.handCount = obj.hand.length;
  battleLog(`${source}：${side === 'enemy' ? '相手' : '自分'}の手札に${name}を加えました。`);
  return true;
}
function addCardToOpponentHandRelativeV121(ownerSide, name, source='効果'){
  return addCardToHandByNameForSideV121(ownerSide === 'player' ? 'enemy' : 'player', name, source);
}
function usePrincessLoveV121(side='player', handIndex=null){
  const game = state.battle.game;
  const p = side === 'enemy' ? game.enemy : game.player;
  p.tension = Math.min(3, Number(p.tension || 0) + 3);
  if(handIndex != null && p.hand) p.hand.splice(handIndex,1);
  if(side === 'enemy') p.handCount = p.hand.length;
  battleLog(`${side === 'enemy' ? '相手' : '自分'}：王女の愛でテンション+3。`);
  renderBattleArena();
  return true;
}
function clearSoloHandPreviewV121(){
  const old = document.getElementById('solo-card-preview-modal');
  if(old) old.remove();
}
function openSoloHandCardModalV121(side, index, ev=null){
  if(ev){ ev.preventDefault?.(); ev.stopPropagation?.(); ev.stopImmediatePropagation?.(); }
  const game = state.battle.game;
  if(!game || !isSoloTestMode()) return false;
  clearBattleSelectionV128('手札選択');
  const hand = side === 'enemy' ? game.enemy.hand : game.player.hand;
  const id = hand?.[index];
  const card = byId(id);
  if(!card) return false;
  clearSoloHandPreviewV121();
  const img = getOfficialImage(card);
  const modal = document.createElement('div');
  modal.id = 'solo-card-preview-modal';
  modal.className = 'solo-card-preview-backdrop';
  modal.innerHTML = `
    <div class="solo-card-preview-card">
      <button class="solo-card-preview-close" type="button">×</button>
      <div class="solo-card-preview-title">${escapeHtml(card.name)}</div>
      <div class="solo-card-preview-image">${img ? `<img src="${escapeHtml(img)}" alt="${escapeHtml(card.name)}" referrerpolicy="no-referrer">` : `<div class="solo-card-preview-noimg">${escapeHtml(card.name)}</div>`}</div>
      <div class="solo-card-preview-text">${escapeHtml(getCardText(card) || '')}</div>
      <div class="solo-card-preview-actions">
        <button class="primary" type="button" data-action="use">使用</button>
        <button type="button" data-action="cancel">戻る</button>
      </div>
    </div>`;
  const close = () => clearSoloHandPreviewV121();
  modal.addEventListener('click', e => {
    if(e.target === modal) close();
  });
  modal.querySelector('.solo-card-preview-close')?.addEventListener('click', close);
  modal.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
  modal.querySelector('[data-action="use"]')?.addEventListener('click', e => {
    e.preventDefault(); e.stopPropagation();
    if(side === 'player') usePlayerHandFromModalV121(index);
    else useEnemyHandFromModalV121(index);
  });
  document.body.appendChild(modal);
  return false;
}
window.openSoloHandCardModalV121 = openSoloHandCardModalV121;

function usePlayerHandFromModalV121(index){
  const game = state.battle.game;
  if(soloActiveSideV114() !== 'player') return toast('自分ターン中だけ自分手札を使用できます。', false);
  clearSoloHandPreviewV121();
  const card = byId(game.player.hand?.[index]);
  game.pendingEnemyHandPlacementV121 = null;
  if(isPrincessLoveCardV121(card)) return usePrincessLoveV121('player', index);
  if(isWeapon(card)) return handleNonBoardCardFromHandV112(index, card);
  // v129 placement selected
  return selectHandCard(index);
}
function useEnemyHandFromModalV121(index){
  const game = state.battle.game;
  if(soloActiveSideV114() !== 'enemy') return toast('相手ターン中だけ相手手札を使用できます。', false);
  const card = byId(game.enemy.hand?.[index]);
  if(!card) return false;
  clearSoloHandPreviewV121();
  if(isPrincessLoveCardV121(card)) return usePrincessLoveV121('enemy', index);
  if(isWeapon(card)) return soloEnemyPlayCardV119(index, true);
  if(isBoardPlaceableCardV112(card) && !isNonBoardActionCardV121(card)){
    game.pendingEnemyHandPlacementV121 = {index, cardId:card.id};
    battleLog(`相手${card.name}：配置先を選んでください。`);
    renderBattleArena();
    return true;
  }
  return soloEnemyPlayCardV119(index, true);
}
function placePendingEnemyHandCardAtV121(pos){
  const game = state.battle.game;
  const pending = game.pendingEnemyHandPlacementV121;
  if(!pending) return false;
  if(soloActiveSideV114() !== 'enemy') return toast('相手ターン中だけ配置できます。', false), true;
  const idx = pending.index;
  const id = game.enemy.hand?.[idx];
  const card = byId(id);
  if(!card || id !== pending.cardId){
    game.pendingEnemyHandPlacementV121 = null;
    return false;
  }
  if(!isBoardPlaceableCardV112(card) || isNonBoardActionCardV121(card)){
    game.pendingEnemyHandPlacementV121 = null;
    return soloEnemyPlayCardV119(idx, true);
  }
  if(game.enemy.board[pos]) return toast('そのマスには配置できません。', false), true;
  const cost = enemyEffectiveCostV118(card);
  if(Number(game.enemy.mp || 0) < cost) return toast('相手MPが足りません。', false), true;
  game.enemy.mp -= cost;
  const unit = makeSoloUnitFromCardSafeV107(card);
  game.enemy.board[pos] = unit;
  game.enemy.hand.splice(idx,1);
  game.enemy.handCount = game.enemy.hand.length;
  game.pendingEnemyHandPlacementV121 = null;
  battleLog(`相手：${card.name}を指定マスへ配置。`);
  renderBattleArena();
  return true;
}
function applyCounterDamageV121(attacker, attackerRef, defender, defenderRef){
  const game = state.battle.game;
  if(!attacker || !defender || defender.isBuilding) return;
  const counter = Math.max(0, Number(defender.attack || 0));
  if(counter <= 0) return;
  if(attacker.noCounter || attacker.keywords?.noCounter || unitKeywords(attacker).noCounter) return;
  if(attackerRef.side === 'playerLeader'){
    dealDamageToLeader('player', counter, `${defender.name}の反撃`);
    battleLog(`反撃：味方リーダーが${counter}ダメージ。`);
  }else if(attackerRef.side === 'enemyLeader'){
    dealDamageToLeader('enemy', counter, `${defender.name}の反撃`);
    battleLog(`反撃：敵リーダーが${counter}ダメージ。`);
  }else{
    dealDamageToUnit(attacker, counter, `${defender.name}の反撃`, attackerRef.side);
    battleLog(`反撃：${attacker.name}が${counter}ダメージ。`);
  }
}
function applyEndTurnEffectsForSideV121(side){
  const game = state.battle.game;
  const board = side === 'enemy' ? game.enemy.board : game.player.board;
  for(const u of board){
    if(!u || u.isBuilding) continue;
    const healAmount = u.name === 'ホイミン' ? 3 : (u.name === 'ホイミスライム' ? 2 : 0);
    if(healAmount > 0){
      const damaged = board.filter(x => x && x !== u && !x.isBuilding && Number(x.hp || 0) < Number(x.maxHp || 0));
      if(damaged.length){
        const target = chooseRandom(damaged, 'hoiminEndTurn', {side, source:u.name});
        healUnit(target, healAmount);
        battleLog(`${side === 'enemy' ? '相手' : '自分'}${u.name}：${target.name}のHPを${healAmount}回復。`);
      }
    }
  }
}
function resolveIburBookV121(side='player', handIndex=null){
  const game = state.battle.game;
  const p = side === 'enemy' ? game.enemy : game.player;
  const enemySide = side === 'enemy' ? 'player' : 'enemy';
  p.hp = Math.max(0, Number(p.hp || 0) - 2);
  const enemy = enemySide === 'enemy' ? game.enemy : game.player;
  enemy.hp = Math.min(Number(enemy.maxHp || enemy.hp || 25), Number(enemy.hp || 0) + 2);
  drawForSideV114(side, 1);
  if(handIndex != null && p.hand) p.hand.splice(handIndex,1);
  if(side === 'enemy') p.handCount = p.hand.length;
  battleLog(`${side === 'enemy' ? '相手' : '自分'}：イブールの本を使用。自リーダー2ダメージ、敵リーダー2回復、1枚ドロー。`);
  renderBattleArena();
  return true;
}

function playEnemyHandIndexV120(index, ev=null){
  try{
    if(ev){ ev.preventDefault?.(); ev.stopPropagation?.(); ev.stopImmediatePropagation?.(); }
    return soloEnemyPlayCardV119(Number(index), true);
  }catch(e){
    console.error('playEnemyHandIndexV120 failed', e);
    battleLog(`相手手札クリックエラー：${e?.message || e}`);
    return false;
  }
}
window.playEnemyHandIndexV120 = playEnemyHandIndexV120;

function installEnemyHandContainerDelegationV120(){
  const box = $('solo-debug-enemy-hand');
  if(!box || box.dataset.v120Bound === '1') return;
  box.dataset.v120Bound = '1';
  const h = (e) => {
    const btn = e.target.closest?.('[data-solo-enemy-hand-index]');
    if(!btn) return;
    openSoloHandCardModalV121('enemy', Number(btn.dataset.soloEnemyHandIndex), e);
  };
  box.addEventListener('pointerdown', h, true);
  box.addEventListener('pointerup', h, true);
  box.addEventListener('click', h, true);
  box.addEventListener('touchend', h, true);
}

function placeIburBookOnEnemyDeckTopV120(source='イブール'){
  const game = state.battle.game;
  const book = findCardByName('イブールの本') || ensureVirtualCard('イブールの本');
  if(!book?.id){ battleLog(`${source}：イブールの本が見つかりません。`); return false; }
  game.enemy.deck ||= [];
  game.enemy.deck.unshift(book.id);
  battleLog(`${source}：相手デッキの一番上にイブールの本を置きました。`);
  return true;
}

function makeDiscountedSpellCopyV120(card, delta=-1, source='残響のようじゅつし'){
  if(!card) return null;
  const copy = JSON.parse(JSON.stringify(card));
  copy.id = `copy_${card.id}_${Date.now()}_${safeRandomId('zankyo').slice(0,8)}`;
  copy.originalCardId = card.originalCardId || card.id;
  copy.cost = Math.max(0, Number(card.cost || 0) + Number(delta || 0));
  copy.flags ||= {};
  copy.flags.deckBuildable = false;
  copy.flags.generatedOrEvolved = true;
  copy.searchText = `${copy.searchText || ''} ${source} コスト変更 ${copy.cost}`.trim();
  state.allCards.push(copy);
  state.cards.push(copy);
  return copy;
}

function replaceHandDeckSpellByDiscountedCopiesV120(name, delta=-1, source='残響のようじゅつし'){
  const game = state.battle.game;
  if(!name) return 0;
  let changed = 0;
  for(let i=0;i<(game.player.hand || []).length;i++){
    const c = byId(game.player.hand[i]);
    if(c && isSpell(c) && c.name === name){
      const cp = makeDiscountedSpellCopyV120(c, delta, source);
      if(cp){ game.player.hand[i] = cp.id; changed++; }
    }
  }
  for(let i=0;i<(game.player.deck || []).length;i++){
    const c = byId(game.player.deck[i]);
    if(c && isSpell(c) && c.name === name){
      const cp = makeDiscountedSpellCopyV120(c, delta, source);
      if(cp){ game.player.deck[i] = cp.id; changed++; }
    }
  }
  return changed;
}

function applyZankyoYojutsuV120(unit, card){
  const game = state.battle.game;
  if(card?.name !== '残響のようじゅつし') return false;
  const usedIds = game.player.usedSpellCardIds || [];
  const usedCards = usedIds.map(id => byId(id)).filter(c => c && isSpell(c));
  if(!usedCards.length){
    battleLog('残響のようじゅつし：対戦中に使用した特技がありません。');
    return true;
  }
  const picked = chooseRandom(usedCards, 'zankyoUsedSpell', {});
  const added = addCardCopyToHandV110(picked, {}, '残響のようじゅつし');
  const changed = replaceHandDeckSpellByDiscountedCopiesV120(picked.name, -1, '残響のようじゅつし');
  battleLog(`残響のようじゅつし：${picked.name}を手札へ。同名特技${changed}枚をコスト-1。`);
  return true;
}

function playEnemyHandFromInlineV119(index, ev){
  try{
    if(ev){ ev.preventDefault?.(); ev.stopPropagation?.(); ev.stopImmediatePropagation?.(); }
    soloSafeRunV106('相手手札を直接使用', () => soloEnemyPlayCardV119(Number(index), true));
  }catch(e){
    console.error('playEnemyHandFromInlineV119 failed', e);
    battleLog(`相手手札クリックエラー：${e?.message || e}`);
  }
  return false;
}
window.playEnemyHandFromInlineV119 = playEnemyHandFromInlineV119;

function soloEnemyPlayCardV119(index, force=true){
  const game = ensureSoloGame(); if(!game) return false;
  game.enemy.hand ||= [];
  const id = game.enemy.hand[index];
  const card = byId(id);
  if(!card){ battleLog(`相手手札${index+1}番目のカードが見つかりません。`); return false; }

  const active = soloActiveSideV114();
  const cost = enemyEffectiveCostV118(card);
  const consumeMp = active === 'enemy';
  battleLog(`相手手札使用：${card.name} / 現在${soloSideNameV114(active)}ターン`);

  if(consumeMp && Number(game.enemy.mp || 0) < cost){
    toast('相手MPが足りません。', false);
    return false;
  }

  if(isWeapon(card)){
    if(consumeMp) game.enemy.mp -= cost;
    game.enemy.hand.splice(index,1);
    game.enemy.handCount = game.enemy.hand.length;
    equipWeaponToLeaderV110(card, 'enemy');
    renderBattleArena();
    return true;
  }

  if(isCoinResourceCard(card)){
    battleLog('相手手札のコインは盤面配置できません。');
    return false;
  }

  if(isSpell(card) || card.cardType === '特技'){
    return enemyUseSpellV118(index, card, active);
  }

  if(card.cardType === 'ヒーロー'){
    battleLog(`相手${card.name}：ヒーロー使用は敵側ではまだ簡易未対応です。`);
    return false;
  }

  if(!isBoardPlaceableCardV112(card)){
    battleLog(`${card.name}は相手が使用/配置できないカードです。`);
    return false;
  }

  const pos = game.enemy.board.findIndex(x => !x);
  if(pos < 0) return toast('敵盤面に空きマスがありません。', false), false;
  if(consumeMp) game.enemy.mp -= cost;
  const unit = makeSoloUnitFromCardSafeV107(card);
  game.enemy.board[pos] = unit;
  game.enemy.hand.splice(index,1);
  game.enemy.handCount = game.enemy.hand.length;
  battleLog(`相手：${card.name}を敵盤面${pos}へ配置。`);
  renderBattleArena();
  return true;
}
function applyPoicklinSummonV119(unit, card){
  const game = state.battle.game;
  if(card?.name !== '怪盗ポイックリン') return false;
  const enemyHand = (game.enemy.hand || []).map(id => byId(id)).filter(Boolean);
  if(enemyHand.length){
    const picked = chooseRandom(enemyHand, 'poicklinEnemyHandCopy', {});
    addCardCopyToHandV110(picked, {}, '怪盗ポイックリン');
    battleLog(`怪盗ポイックリン：相手手札の${picked.name}と同じカードを手札に加えました。`);
  }else{
    battleLog('怪盗ポイックリン：相手の手札がないためコピーなし。');
  }
  const own = game.player.hand || [];
  if(own.length){
    const options = own.map((id,i)=>`${i+1}. ${byId(id)?.name || id}`);
    openChoiceModal('怪盗ポイックリン：捨てる手札を選択', options, (pickedLabel, i)=>{
      const id = game.player.hand[i];
      const c = byId(id);
      if(id != null){
        game.player.hand.splice(i,1);
        battleLog(`怪盗ポイックリン：${c?.name || id}を捨てました。`);
      }
      renderBattleArena(); syncMyBattleState();
    }, {kind:'poicklinDiscard'});
  }else{
    battleLog('怪盗ポイックリン：捨てる手札がありません。');
  }
  return true;
}
function clearPendingTargetsOnSoloTurnEndV119(){
  const game = state.battle.game;
  if(!game) return;
  if(game.pendingEnemySpellV118){
    battleLog(`対象未選択の相手特技 ${game.pendingEnemySpellV118.name || ''} を解除しました。`);
  }
  if(game.pendingGenericEffect){
    battleLog('対象未選択の効果を解除しました。');
  }
  game.pendingEnemySpellV118 = null;
  game.pendingGenericEffect = null;
  game.pendingHeroSkill = null;
}

function soloEnemyPlayCardV118(index, force=true){
  return soloEnemyPlayCardV119(index, true);
}

function installEnemyHandHardCaptureV118(){
  if(window.__enemyHandHardCaptureV118Installed) return;
  window.__enemyHandHardCaptureV118Installed = true;
  const h = (e) => {
    if(!isSoloTestMode()) return;
    const enemyBtn = e.target.closest?.('[data-solo-enemy-hand-index]');
    if(enemyBtn){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      const idx = Number(enemyBtn.dataset.soloEnemyHandIndex);
      soloSafeRunV106('相手手札を使用', () => soloEnemyPlayCardV118(idx, true));
      return;
    }
    if(e.target.closest?.('.player-leader') && state.battle.game?.pendingEnemySpellV118){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      applyPendingEnemySpellV118({side:'playerLeader'});
    }
  };
  document.addEventListener('pointerdown', h, true);
  document.addEventListener('click', h, true);
  document.addEventListener('touchend', h, true);
}

function soloEnemyPlayCardV114(index, force=false){
  return soloEnemyPlayCardV119(index, true);
}

function installSoloCaptureV114(){
  if(window.__soloCaptureV114Installed) return;
  window.__soloCaptureV114Installed = true;
  const handler = (e) => {
    if(!isSoloTestMode()) return;
    const endBtn = e.target.closest?.('#end-turn-top');
    if(endBtn){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      soloHardTurnSwitchV117();
      return;
    }
    const enemyBtn = e.target.closest?.('.solo-debug-card[data-solo-enemy-hand-index]');
    if(enemyBtn){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      soloSafeRunV106('相手手札を使用/配置', () => playEnemyHandIndexV120(Number(enemyBtn.dataset.soloEnemyHandIndex), e));
      return;
    }
    const playerBtn = e.target.closest?.('.solo-debug-card[data-solo-hand-index]');
    if(playerBtn && soloActiveSideV114() !== 'player'){
      e.preventDefault();
      e.stopPropagation();
      battleLog('現在は相手ターンです。自分手札は自分ターンに使用します。');
    }
  };
  document.addEventListener('click', handler, true);
  document.addEventListener('touchend', handler, true);
}

function installSoloLeaderCaptureV114(){
  if(window.__soloLeaderCaptureV114Installed) return;
  window.__soloLeaderCaptureV114Installed = true;
  const h = (e) => {
    if(!isSoloTestMode()) return;
    if(e.target.closest?.('.player-leader') && soloActiveSideV114() === 'enemy' && state.battle.game?.selectedAttacker?.side === 'enemy'){
      e.preventDefault(); e.stopPropagation();
      attackLeader('player');
    }
    if(e.target.closest?.('.enemy-leader') && soloActiveSideV114() === 'player' && state.battle.game?.selectedAttacker){
      // normal handler may also catch; keep as backup
    }
  };
  document.addEventListener('click', h, true);
  document.addEventListener('touchend', h, true);
}

function handleEnemyBoardClickV114(side, pos){
  const game = state.battle.game;
  if(!isSoloTestMode() || soloActiveSideV114() !== 'enemy') return false;
  if(side === 'enemy'){
    const u = game.enemy.board[pos];
    if(!u) return false;
    if(u.canAttack){
      game.selectedAttacker = {side:'enemy', pos};
      battleLog(`${u.name}：攻撃対象を選んでください。`);
      renderBattleArena();
    }else{
      battleLog(`${u.name}はまだ攻撃できません。`);
    }
    return true;
  }
  if(side === 'player' && game.selectedAttacker?.side === 'enemy'){
    attackUnit(game.selectedAttacker, {side:'player', pos});
    return true;
  }
  return false;
}
function handleEnemyLeaderAttackV114(){
  const game = state.battle.game;
  if(!isSoloTestMode() || soloActiveSideV114() !== 'enemy') return false;
  if(game.selectedAttacker?.side === 'enemy'){
    attackLeader('player');
    return true;
  }
  return false;
}

function endTurn(){
  if(isSoloTestMode()) return soloEndTurnV114();
  if(isBattleLocked()) return toast('まだ操作できません。', false);

  const game = state.battle.game;
  if(game?.finished) return;
  if(!game?.isMyTurn) return toast('相手のターンです。', false);
  if(!game) return;
  applyEndTurnEffectsForSideV121('player');

  emitBattleEvent('ownTurnEnd', {side:'player'});

  game.turn += 1;
  game.player.maxMp = Math.min(10, game.player.maxMp + 1);
  game.player.mp = game.player.maxMp;
  game.player.tensionUsedThisTurn = false;
  game.player.heroSkillUsedThisTurn = false;
  game.player.usedSpellCostThisTurn = 0;
  game.player.martialArtsUsedThisTurn = 0;
  game.player.copyNextSpellToHand = false;
  game.player.thisTurnSpellCostDelta = 0;
  game.player.usedBigBreadThisTurn = false;
  game.player.flashFistBonus = 0;
  game.player.healInvertsForEnemiesThisTurn = false;
  game.player.combatDamageMultiplier = 1;
  game.enemy.combatDamageMultiplier = 1;
  if(game.player.fortuneModeUntil === 'turnEnd'){ game.player.fortuneMode = ''; game.player.fortuneModeUntil = ''; }
  game.player.nextCardDiscounts = [];
  game.player.unitDiedThisTurn = false;
  game.player.leaderAttack = 0;
  game.player.leaderCanAttack = false;
  game.player.leaderDamageReduction = 0;
  game.player.leaderDamageReductionUntil = '';
  if(game.player.leaderApathy) game.player.tension = 0;
  game.player.leaderAttackedThisTurn = false;

  for(let i=0;i<game.player.board.length;i++){
    const unit = game.player.board[i];
    if(unit?.isBuilding){
      applyBuildingTurnEnd(unit);
      if(!unit.isDungeon && unit.durability <= 0){ unit.hp = 0; battleLog(`${unit.name}の耐久値が0になりました。`); }
    }
  }

  emitBattleEvent('ownTurnStart', {side:'player'});

  resolveDeaths();
  drawCard(1);
  battleLog(`ターン${game.turn}: MPが${game.player.mp}になりました。`);
  renderBattleArena();
  syncMyBattleState();
  advanceTurnToOpponent();
}


function getHeroDef(heroName){
  if(heroName === 'サルマトリアの王子') heroName = 'サマルトリアの王子';
  if(heroName === 'レック') heroName = '勇者レック';
  return HERO_SKILL_DEFS[heroName];
}
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
  const def = getHeroDef(heroName);
  return def?.levels?.find(l => l.level === level)?.name || `レベル${level}ヒーロースキル`;
}
function getHeroSkillCost(skill){
  const game = state.battle.game;
  let cost = Number(skill?.cost || 0);
  if(skill?.dynamicCost === 'noSpellsInDeckMinus1' && !game.player.deck.some(id => isSpell(byId(id)))) cost -= 1;
  if(skill?.dynamicCost === 'spellCostThisTurnDiscount') cost -= Number(game.player.usedSpellCostThisTurn || 0);
  if(skill?.dynamic?.costPlusPerUse) cost += Number(game.player.heroSkill?.lv2UseCount || 0);
  if(skill?.dynamic?.legendFinalCost) cost = Math.max(0, Number(skill.cost || 25) - Number(game.player.heroSkill?.legendFinalDiscount || 0));
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
  if(skill.dynamic?.usesEqualDungeonClears){
    const remain = getNineLv2RequiredUses() - Number(game.player.heroSkill?.progressCount || 0);
    if(remain <= 0) return {ok:false, reason:'既に条件を満たしています'};
  }
  if(skill.condition === 'noAnnihilatorZoma'){
    const exists = game.player.hand.some(id => byId(id)?.name === '全てを滅ぼす者ゾーマ') || game.player.board.some(u => u?.name === '全てを滅ぼす者ゾーマ');
    if(exists) return {ok:false, reason:'既に全てを滅ぼす者ゾーマが存在します'};
  }
  return {ok:true, cost};
}
function openHeroSkillModal(){
  if(isBattleLocked()) return toast('まだ操作できません。', false);
  if(isSoloTestMode()) return soloEndTurnV114();

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
  if(['enemyAny','enemyUnit','enemyAnyBlockedByUnits','unitAny','friendlyUnit','friendlyEmptySlot','friendlyDungeon'].includes(skill.target)){
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
  if(skill.name === 'この手に切り札を') drawRandomBetFromDeck();
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
  if(skill.target === 'friendlyDungeon' && (side !== 'player' || !unit.isDungeon)) return toast('味方のダンジョンを選んでください。', false);
  if(skill.target !== 'friendlyDungeon' && !canNormalTargetUnit(unit, skill)) return toast('建物/ダンジョンはこの効果の対象にできません。', false);
  emitTargetSelected('heroSkillUnit', {side, pos}, {skillName:skill.name, skillTarget:skill.target});
  useHeroSkillCard(skill, {side, pos, unit});
}
function applyPendingHeroSkillToLeader(){
  const game = state.battle.game;
  const skill = game.pendingHeroSkill;
  if(!skill) return;
  if(skill.target === 'enemyUnit' || skill.target === 'friendlyUnit' || skill.target === 'unitAny' || skill.target === 'friendlyDungeon') return toast('対象を選んでください。', false);
  if(skill.target === 'enemyAnyBlockedByUnits' && hasEnemyTargetableUnit()) return toast('対象にできる敵ユニットがいる間、敵リーダーを対象にできません。', false);
  emitTargetSelected('heroSkillLeader', {side:'enemyLeader'}, {skillName:skill.name, skillTarget:skill.target});
  useHeroSkillCard(skill, {side:'enemyLeader'});
}

function applyPendingHeroSkillToEmptySlot(pos){
  const game = state.battle.game;
  const skill = game.pendingHeroSkill;
  if(!skill || skill.target !== 'friendlyEmptySlot') return;
  if(game.player.board[pos]) return toast('空きマスを選んでください。', false);
  emitEmptySlotSelected('heroSkillEmptySlot', 'player', pos, {skillName:skill.name, skillTarget:skill.target});
  useHeroSkillCard(skill, {side:'player', pos});
}

function applySimpleEffect(effect, target){
  const game = state.battle.game;
  if(!effect){ if(isSoloTestMode()) soloWarriorTensionV106(skill); return; }
  if(effect.kind === 'healLeader') healLeader(effect.amount);
  if(effect.kind === 'restoreMp') game.player.mp = Math.min(game.player.maxMp, game.player.mp + Number(effect.amount || 0));
  if(effect.kind === 'boostDungeonDurability' && target?.unit?.isDungeon){ target.unit.durability = Math.min(target.unit.maxDurability, Number(target.unit.durability || 0) + Number(effect.amount || 0)); }
}

function getHeroSkillDamage(skill){
  const game = state.battle.game;
  let amount = Number(skill?.effect?.amount || 0);
  if(skill?.dynamic?.damagePlusPerUse) amount += Number(game.player.heroSkill?.lv2UseCount || 0);
  if(skill?.dynamic?.loreLv3Damage) amount = Number(game.player.heroSkill?.loreLv3Damage || 1);
  return amount;
}


function isProficiencyCard(card){
  return String(card?.text || card?.searchText || '').includes('熟練度') || (card?.tags || []).includes('熟練度');
}
function markCardProficiencyInHand(cardId, amount=1){
  const game = state.battle.game;
  game.player.proficiency ||= {};
  game.player.proficiency[cardId] = Number(game.player.proficiency[cardId] || 0) + Number(amount || 1);
}
function pickProficiencyCardInHand(amount=1, fallbackDraw=false){
  const game = state.battle.game;
  const id = game.player.hand.find(id => isProficiencyCard(byId(id)));
  if(id){
    const current = Number(game.player.proficiency?.[id] || 0);
    markCardProficiencyInHand(id, current <= 1 ? Math.max(amount, 2) : amount);
    battleLog(`${byId(id).name}の熟練度+${current <= 1 ? Math.max(amount, 2) : amount}。`);
  }else{
    if(fallbackDraw) drawCard(1);
    battleLog('熟練度を持つ手札がありません。');
  }
}
function drawAdventurerFromTop7(){
  const game = state.battle.game;
  const top = game.player.deck.splice(0, 7);
  const idx = top.findIndex(id => isAdventurer(byId(id)));
  if(idx >= 0){
    const picked = top.splice(idx, 1)[0];
    game.player.hand.push(picked);
    game.player.deck.push(...top);
    battleLog(`${byId(picked).name}を手札に加え、残りをデッキ下へ戻しました。`);
  }else{
    game.player.deck.push(...top);
    battleLog('上7枚に冒険者カードがありませんでした。');
  }
}
function buffLastSummonedAdventurer(card){
  const game = state.battle.game;
  if(!isAdventurer(card)) return;
  for(const unit of game.player.board){
    if(unit && unit.cardId === card.id && !unit._dharmaBuffed){
      unit.attack += 1; unit.hp += 1; unit.maxHp += 1;
      unit._dharmaBuffed = true;
      const dharma = game.player.board.find(u => u?.name === 'ダーマの神殿');
      if(dharma?.isBuilding){
        dharma.durability = Math.max(0, (dharma.durability ?? 1) - 1);
        if(dharma.durability <= 0) dharma.hp = 0;
      }
      battleLog('ダーマの神殿：冒険者を+1/+1。');
      break;
    }
  }
}

function triggerCardPlayedForHero(card){
  const game = state.battle.game;
  for(const aura of game?.player?.permanentAuras || []){
    if(aura.kind === 'damageEnemyLeaderOnCardPlayed'){
      dealDamageToLeader('enemy', aura.amount, aura.source);
      battleLog(`${aura.source}：敵リーダーに${aura.amount}ダメージ。`);
    }
  }
  const hs = game?.player?.heroSkill;
  if(!hs) return;
  if(hs.heroCardName === 'ローレシアの王子' && hs.level === 3 && !isSpell(card)){
    hs.loreLv3Damage = Number(hs.loreLv3Damage || 1) + 1;
    battleLog('ローレシアLv3：破壊神との決戦のダメージ+1。');
  }
  if((hs.heroCardName === '伝説の勇者') && isAdventurer(card)){
    hs.legendAdventurerUses = Number(hs.legendAdventurerUses || 0) + 1;
    if(hs.level === 3){
      hs.legendDemonDamage = Math.min(4, Number(hs.legendDemonDamage || 1) + 1);
      battleLog('魔王討伐：ダメージ+1。');
    }
    if(hs.level === 4 && hs.legendAdventurerUses % 3 === 0){
      hs.legendFinalDiscount = Number(hs.legendFinalDiscount || 0) + 5;
      drawCard(1);
      battleLog('そして伝説へ：コスト-5、カードを1枚引く。');
    }
    buffLastSummonedAdventurer(card);
  }
  if((hs.heroCardName === '勇者レック' || hs.heroCardName === 'レック') && isProficiencyCard(card)){
    triggerHeroAuto('proficiencyCardPlayed', {card});
  }
}

function applyHeroSkillEffect(skill, target){
  const game = state.battle.game;
  const e = skill.effect || {};
  if(e.kind === 'damage'){
    const amount = getHeroSkillDamage(skill);
    if(target.side === 'enemyLeader') dealDamageToLeader('enemy', amount, eff.source || '効果');
    else if(target.unit) dealDamageToUnit(target.unit, amount, skill.name, target.side);
    if(e.resetAfterUse) game.player.heroSkill.loreLv3Damage = 1;
  }else if(e.kind === 'damageAndDraw'){
    if(target.unit) dealDamageToUnit(target.unit, e.amount, skill.name, target.side);
    drawCard(e.draw || 1);
  }else if(e.kind === 'damageLeader'){
    dealDamageToLeader('enemy', Number(e.amount || 0), skill.name);
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
    dealDamageToLeader('enemy', Number(e.amount || 0), skill.name);
    for(const u of game.enemy.board) if(u) dealDamageToUnit(u, e.amount, skill.name, 'enemy');
    resolveDeaths();
  }else if(e.kind === 'silenceAndDamageEnemyUnits'){
    for(const u of game.enemy.board) if(u){ u.keywords = {}; u.statuses = []; dealDamageToUnit(u, e.amount, skill.name, 'enemy'); }
    resolveDeaths();
  }else if(e.kind === 'addToHand'){
    addCardToHandByName(e.name);
  }else if(e.kind === 'addUsedSpells2PlusDiscountUnique'){
    game.player.costOverrides ||= {};
    for(const id of game.player.usedSpells2Plus || []){ game.player.hand.push(id); const c=byId(id); game.player.costOverrides[id]=Math.max(0, Number(c?.cost || 0) - Number(e.discount || 0)); }
  }else if(e.kind === 'randomEnemyDamage'){
    const amount = game.player.leaderAttackedThisTurn ? e.ifLeaderAttackedAmount : e.amount;
    const targets = game.enemy.board.map((u,i)=>u?{unit:u,pos:i}:null).filter(Boolean);
    if(targets.length && randomIndex(100, 'enemyAiTargetLeaderOrUnit', {amount}) < 65) dealDamageToUnit(chooseRandom(targets, 'enemyAiDamageTarget', {amount}).unit, amount, skill.name, 'enemy');
    else dealDamageToLeader('enemy', amount, skill.name);
    resolveDeaths();
  }else if(e.kind === 'damageAllUnits'){
    for(const u of [...game.player.board, ...game.enemy.board]) if(u) dealDamageToUnit(u, e.amount, skill.name);
    resolveDeaths();
  }else if(e.kind === 'rubissBlessing'){
    // handled in triggerHeroAuto with spell cost
  }else if(e.kind === 'randomCoins'){
    const roll = randomIndex(100, 'randomCoins', {hero:'デボラ'});
    const r = roll / 100;
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
  }else if(e.kind === 'legendTavern'){
    drawAdventurerFromTop7();
  }else if(e.kind === 'summonDharmaTemple'){
    const pos = target?.pos;
    if(pos == null || game.player.board[pos]) return toast('空きマスを選んでください。', false);
    const card = findCardByName('ダーマの神殿');
    const unit = makeUnitFromCard(card);
    unit.isBuilding = true;
    unit.durability = 5;
    unit.maxDurability = 5;
    unit.attack = 0;
    unit.canAttack = false;
    game.player.board[pos] = unit;
    battleLog('ダーマの神殿を出しました。');
  }else if(e.kind === 'legendDemonKingSubjugation'){
    const amount = Number(game.player.heroSkill?.legendDemonDamage || 1);
    if(target?.unit) dealDamageToUnit(target.unit, amount, skill.name, target.side);
    battleLog(`魔王討伐：${amount}ダメージ。`);
  }else if(e.kind === 'legendFinal'){
    dealDamageToLeader('enemy', 25, skill.name);
    battleLog('そして伝説へ：敵リーダーに25ダメージ。');
  }else if(e.kind === 'reckMemory'){
    pickProficiencyCardInHand(1, true);
  }else if(e.kind === 'reckFuture'){
    drawCard(1);
    pickProficiencyCardInHand(2, false);
  }else if(e.kind === 'boostDungeonDurability'){
    if(target?.unit?.isDungeon){
      target.unit.durability = Math.min(Number(target.unit.maxDurability || 0), Number(target.unit.durability || 0) + Number(e.amount || 0));
      battleLog(`${target.unit.name}の耐久値+${e.amount || 0}。`);
      if(target.unit.durability >= target.unit.maxDurability) completeDungeon(target.unit);
    }
  }else if(e.kind === 'samaltoriaRandomLv3'){
    if(e.variant === 'begirama'){
      dealDamageToLeader('enemy', 2, skill.name);
      for(const u of game.enemy.board) if(u) dealDamageToUnit(u, 2, skill.name, 'enemy');
      resolveDeaths();
    }else if(e.variant === 'life'){
      dealDamageToLeader('enemy', 3, skill.name);
      for(const u of game.enemy.board) if(u) dealDamageToUnit(u, 3, skill.name, 'enemy');
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
  let need = skill.progress[key];
  if(skill.dynamic?.usesEqualDungeonClears) need = getNineLv2RequiredUses();
  const maxLevel = Math.max(...(getHeroDef(hs.heroCardName)?.levels || []).map(l => l.level));
  if(need && hs.progressCount >= need && hs.level < maxLevel){
    if(skill.onLevelUp?.addToHand) addCardToHandByName(skill.onLevelUp.addToHand);
    if(skill.onLevelUp?.draw) drawCard(skill.onLevelUp.draw);
    hs.level += 1;
    hs.progressCount = 0;
    hs.lv2UseCount = 0;
    hs.loreLv3Damage = 1;
    if(hs.heroCardName === '伝説の勇者' && hs.level === 3) hs.legendDemonDamage = 1;
    if(hs.heroCardName === '伝説の勇者' && hs.level === 4) hs.legendFinalDiscount = 0;
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

function showBattleCardZoom(card, context={}){
  const img = getOfficialImage(card);
  if(!img) return;
  $('battle-card-zoom-img').src = img;
  $('battle-card-zoom-img').alt = card.name;
  updateBattleCardZoomModifiersV158(card, context || {});
  $('battle-card-zoom').classList.remove('hidden');
}

function closeBattleCardZoom(){
  $('battle-card-zoom').classList.add('hidden');
  $('battle-card-zoom-img').src = '';
  updateBattleCardZoomModifiersV158(null, {});
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

function toast(msg, ok=true){ const div = document.createElement('div'); div.className = `toast ${ok?'ok':'bad'}`; div.textContent = msg; if(!ok){ div.style.left='16px'; div.style.top='72px'; div.style.right='auto'; div.style.bottom='auto'; } document.body.appendChild(div); setTimeout(()=>div.remove(), 2800); }
function escapeHtml(s){ return String(s ?? '').replace(/[&<>\"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }


// v57-task-kill-presence
window.addEventListener('pagehide', () => {
  const roomId = state.battle.roomId;
  if(state.firebase.enabled && state.firebase.db && roomId && state.playerId){
    try{
      update(ref(state.firebase.db, `rooms/${roomId}/players/${state.playerId}`), {
        status:'left',
        leftAt: serverTimestamp(),
        lastSeenMs: Date.now()
      });
    }catch(e){}
  }
});
window.addEventListener('beforeunload', () => {
  const roomId = state.battle.roomId;
  if(state.firebase.enabled && state.firebase.db && roomId && state.playerId){
    try{
      update(ref(state.firebase.db, `rooms/${roomId}/players/${state.playerId}`), {
        status:'left',
        leftAt: serverTimestamp(),
        lastSeenMs: Date.now()
      });
    }catch(e){}
  }
});

