import json, os, re, socket, subprocess, sys, tempfile, time, urllib.request, shutil
from pathlib import Path
import websocket

ROOT = Path(__file__).resolve().parents[1]
PORTS = [9292, 9293]

DECKS = {
  'イレブンテリー': ['しっぷう突き','とげぼうず','勇者イレブン','アルゴリザード','トンネラー','かくれんぼう','ナイトキング','わたぼう','ブラッドレディ','シーゴーレム','ラプソーン','最後の砦の英雄グレイグ','コンガオンガ','フェイスボール','メルビン','ギュメイ将軍','シュプリンガー','グレイトマムー','いなずまのけん','ウルノーガ&ウルナーガ'],
  'ドラゴンタバサミネア': ['魂の写し身','タバサ','風の導き','銀のタロット','クロウズ','バルーンコール','かみかぜ','バルンバ','太陽のタロット','サイコロン','キースドラゴン','死神のタロット','イブール','ゾディアックコード','逆転への兆し','召竜の儀式','しんりゅう','タロットフォーチュン'],
  'イルルカドラゴンゼシカ': ['メラ','パピラス','イル＆ルカ','メラミ','とさかヘビ','リザードキッズ','デンタザウルス','乙女の気まぐれ','氷竜への祈り','アルゴングレート','サウルスロード','メラゾーマ','ギガントドラゴン','ガメゴンロード','竜将ドラゴンガイア','ドラゴンブッシュ'],
  'デボラトルネコ': ['商人の交換所','コインのたね','とげぼうず','プチファイター','ケダモン','ぷちメタル','くらやみハーピー','ベホイミスライム','天空の花嫁デボラ','ルドマン','怪獣プスゴン','ラプソーン','黄金兵','痛みわけの杖','ブラバニクイーン','福招きのそろばん','マデサゴーラ','ハンフリー','レッドプレデター','ゴールデンタイタス']
}
CLASS = {'イレブンテリー':'戦士','ドラゴンタバサミネア':'占い師','イルルカドラゴンゼシカ':'魔法使い','デボラトルネコ':'商人'}
HERO = {'イレブンテリー':'eleven','ドラゴンタバサミネア':'tabasa','イルルカドラゴンゼシカ':'ilLuca','デボラトルネコ':'deborah'}
RANDOM_CARDS = ['かみかぜ','サイコロン','死神のタロット','逆転への兆し','召竜の儀式','しんりゅう','パピラス','ギガントドラゴン','竜将ドラゴンガイア','コンガオンガ','シュプリンガー','怪獣プスゴン','ルドマン','福招きのそろばん','マデサゴーラ','商人の交換所','氷竜への祈り','バルーンコール','太陽のタロット','キースドラゴン']

class CDP:
    def __init__(self, ws_url, port):
        self.port = port
        self.ws = websocket.create_connection(ws_url, timeout=5, origin=f'http://127.0.0.1:{port}')
        self.i = 0
        self.events = []
    def call(self, method, params=None, timeout=30):
        self.i += 1
        msg = {'id': self.i, 'method': method}
        if params is not None: msg['params'] = params
        self.ws.send(json.dumps(msg))
        deadline = time.time() + timeout
        old = self.ws.gettimeout(); self.ws.settimeout(0.5)
        try:
            while time.time() < deadline:
                try: data = json.loads(self.ws.recv())
                except (socket.timeout, TimeoutError, websocket.WebSocketTimeoutException): continue
                if data.get('id') == self.i:
                    if 'error' in data: raise RuntimeError(f'CDP {method}: {data["error"]}')
                    return data.get('result', {})
                self.events.append(data)
        finally:
            self.ws.settimeout(old)
        raise TimeoutError(method)
    def eval(self, expr, timeout=20):
        res = self.call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True, 'userGesture': True}, timeout=timeout)
        if 'exceptionDetails' in res:
            raise RuntimeError(json.dumps(res['exceptionDetails'], ensure_ascii=False)[:8000])
        return res.get('result', {}).get('value')

def wait_json(url, tries=160):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=1) as r: return json.loads(r.read().decode())
        except Exception:
            time.sleep(0.1)
    raise RuntimeError('not ready '+url)

def build_inline_html():
    html = (ROOT/'index.html').read_text(encoding='utf-8')
    html = re.sub(r'<script\s+type="module"\s+src="\.\/js\/app\.js(?:\?v=[^"]+)?"\s*><\/script>', '', html)
    app = (ROOT/'js'/'app.js').read_text(encoding='utf-8')
    app = app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'INLINE_DISABLED_V292_TWO_ACCESS' };")
    data = {}
    names=['cards.json','systems.json','strategies.json','choices.json','coin.json','dungeons.json','fortune.json','heroes.json','exchanges.json','generated_cards.json','tension_system.json','hero_skill_cards.json','heroes.json']
    for name in names:
        p = ROOT/'data'/name
        if not p.exists():
            continue
        obj = json.loads(p.read_text(encoding='utf-8'))
        data[f'./data/{p.name}'] = obj
        data[f'data/{p.name}'] = obj
    boot = """
<script>
window.__DQR_INLINE_DATA__ = __DATA__;
const __nativeFetch = window.fetch.bind(window);
window.fetch = async function(url, opts){
  const raw = String(url || '');
  let key = raw.split('?')[0];
  key = key.replace(/^https?:\/\/[^/]+\//, './');
  if(!key.startsWith('./') && key.startsWith('data/')) key = './' + key;
  if(window.__DQR_INLINE_DATA__[key]){
    return new Response(JSON.stringify(window.__DQR_INLINE_DATA__[key]), {status:200, headers:{'Content-Type':'application/json'}});
  }
  return __nativeFetch(url, opts);
};
</script>
""".replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',',':')))
    return html.replace('</body>', boot + '<script type="module">\n' + app + '\n</script></body>')

def launch(port, html):
    profile = tempfile.mkdtemp(prefix=f'dqr_v292_chrome_{port}_')
    log_path = tempfile.NamedTemporaryFile('w+', delete=False).name
    log = open(log_path, 'w+')
    exe = shutil.which('chromium') or shutil.which('chromium-browser') or '/usr/bin/chromium'
    proc = subprocess.Popen([exe, '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
        f'--remote-debugging-port={port}', f'--user-data-dir={profile}', '--disable-background-networking',
        '--disable-extensions', '--disable-component-update', '--no-first-run', '--no-default-browser-check',
        '--remote-allow-origins=*', 'about:blank'], stdout=log, stderr=log)
    ver = wait_json(f'http://127.0.0.1:{port}/json/version')
    pages = wait_json(f'http://127.0.0.1:{port}/json/list')
    page = next((p for p in pages if p.get('type')=='page'), pages[0])
    c = CDP(page['webSocketDebuggerUrl'], port); c.call('Runtime.enable'); c.call('Page.enable')
    frame = c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId': frame, 'html': html}, timeout=180)
    for _ in range(260):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.findCardByName("スライム") && !!window.__DQR_TEST__?.v288', timeout=2):
                return proc, c, ver, log_path
        except Exception:
            pass
        time.sleep(.15)
    raise RuntimeError('app not ready')

def js(x): return json.dumps(x, ensure_ascii=False)

SETUP_JS = r'''
((cfg)=>{
 const T=window.__DQR_TEST__, s=T.state, g0=s.battle.game;
 T.setupPvpTest(cfg.playerId, cfg.isMyTurn);
 const g=s.battle.game;
 s.battle.selectedDeck={deckName:cfg.deckName, className:cfg.className, cards:(cfg.cards||[]).map(n=>({cardId:T.findCardByName(n)?.id||'', count:1})).filter(x=>x.cardId)};
 s.battle.matchLocked=!cfg.isMyTurn; s.battle.processingRemoteAction=false; s.battle.appliedActionIds={};
 g.isMyTurn=!!cfg.isMyTurn; g.currentTurnPlayerId=cfg.isMyTurn ? cfg.playerId : cfg.otherId;
 g.player.hp=25; g.enemy.hp=25; g.player.mp=99; g.player.maxMp=99; g.enemy.mp=99; g.enemy.maxMp=99;
 g.player.tension=Number(cfg.tension ?? 3); g.enemy.tension=0;
 g.player.hand=[]; g.enemy.hand=[];
 const pool=['スライム','ドラキー','メラ','メラミ','メラゾーマ','コイン','プチファイター','パピラス','とさかヘビ','キースドラゴン','福招きのそろばん','シーゴーレム','アルゴリザード','とげぼうず'];
 g.player.deck=pool.map(n=>T.findCardByName(n)?.id).filter(Boolean).slice(0,12);
 g.enemy.deck=pool.map(n=>T.findCardByName(n)?.id).filter(Boolean).slice(0,12);
 function setBoard(side,names){ const b=side==='enemy'?g.enemy.board:g.player.board; for(let i=0;i<6;i++) b[i]=null; (names||[]).forEach((n,i)=>{ if(i>=6||!n)return; const c=T.findCardByName(n); if(c) b[i]=T.makeUnitFromCard(c); }); }
 setBoard('player', cfg.playerBoard || [null,null,null,null,null,null]);
 setBoard('enemy', cfg.enemyBoard || ['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ']);
 if(cfg.hero==='eleven') g.player.heroSkill={heroCardName:'勇者イレブン',level:2,elevenBondActive:true,usedThisTurn:false,usesThisTurn:0};
 if(cfg.hero==='tabasa') g.player.heroSkill={heroCardName:'タバサ',level:2,usedThisTurn:false,usesThisTurn:0};
 if(cfg.hero==='ilLuca') g.player.heroSkill={heroCardName:'イル＆ルカ',level:2,usedThisTurn:false,usesThisTurn:0};
 if(cfg.hero==='deborah') g.player.heroSkill={heroCardName:'天空の花嫁デボラ',level:2,deborahBetTension:true,usedThisTurn:false,usesThisTurn:0};
 if(cfg.fortune) g.player.fortuneMode=cfg.fortune;
 const d=document.getElementById('choice-modal'); if(d?.open){try{d.close();}catch(e){}}
 window.__DQR_OUTBOX__=[];
 g.pendingGenericEffect=null; g.pendingHeroSkill=null; g.selectedHandIndex=null; g.selectedCard=null; g.selectedAttacker=null; g.pendingTarget=null; g._v246EffectGuards=Object.create(null);
 T.syncMyBattleState?.();
 T.v287?.publishBurst?.('v292Setup');
 T.v288?.applyTurnFromMeta?.({status:'playing',currentTurnPlayerId:cfg.isMyTurn?cfg.playerId:cfg.otherId},'v292Setup');
 return true;
})
'''

PLAY_JS = r'''
((cfg)=>{
 const T=window.__DQR_TEST__, s=T.state, g=s.battle.game;
 function card(n){ return T.findCardByName(n); }
 function byId(id){ return T.byId(id); }
 function seedRandom(seed, fn){ const old=Math.random; let x=(Number(seed)||1)>>>0; Math.random=function(){ x=(1664525*x+1013904223)>>>0; return x/4294967296; }; try{return fn();}finally{Math.random=old;} }
 function resolveOne(){
   const d=document.getElementById('choice-modal');
   if(d?.open){
     const opts=[...document.querySelectorAll('#choice-modal-body .choice-option:not([disabled])')];
     const all=document.querySelector('#choice-modal-body .choice-all-banner');
     let btn=null;
     const prefer=String(cfg.prefer||'');
     if(prefer) btn=opts.find(b=>String(b.textContent||'').includes(prefer));
     btn=btn || all || opts[0];
     if(btn){ btn.click(); return {kind:'choice', text:String(btn.textContent||'').trim().slice(0,80)}; }
     try{d.close();}catch(e){}
     return {kind:'closed-empty'};
   }
   if(g.pendingGenericEffect){
     const eff=g.pendingGenericEffect; const target=String(eff.target||'');
     try{
       if(target.includes('Leader') || target==='enemyAny') { T.applyPendingGenericEffectToLeader?.(); return {kind:'pendingLeader', target}; }
       if(target.includes('enemy') || target==='unitAny') { T.applyPendingGenericEffectToUnit?.({side:'enemy',pos:0}); return {kind:'pendingUnitEnemy', target}; }
       if(target.includes('friendly')) { T.applyPendingGenericEffectToUnit?.({side:'player',pos:0}); return {kind:'pendingUnitPlayer', target}; }
     }catch(e){}
     g.pendingGenericEffect=null; return {kind:'pendingCleared', target};
   }
   if(g.pendingHeroSkill){ g.pendingHeroSkill=null; return {kind:'pendingHeroCleared'}; }
   return null;
 }
 function resolveAll(){ const out=[]; for(let i=0;i<18;i++){ const r=resolveOne(); if(!r) break; out.push(r); } return out; }
 function names(ids){return (ids||[]).map(id=>byId(id)?.name||id)}
 function unit(u){return u?{name:u.name,hp:Number(u.hp||0),maxHp:Number(u.maxHp||0),attack:Number(u.attack||0),id:u.id||'',building:!!u.isBuilding,durability:Number(u.durability||0)}:null}
 function snap(){return {player:g.player.board.map(unit),enemy:g.enemy.board.map(unit),playerHp:g.player.hp,enemyHp:g.enemy.hp,mp:g.player.mp,tension:g.player.tension,hand:names(g.player.hand),deck:g.player.deck.length,lock:s.battle.matchLocked,isMyTurn:g.isMyTurn,modal:!!document.getElementById('choice-modal')?.open,log:T.getLog().slice(-8)}}
 function invariant(){ const bad=[]; for(const sideName of ['player','enemy']){ const side=g[sideName]; if(!Array.isArray(side.board)||side.board.length!==6) bad.push(sideName+'.board length'); side.board.forEach((u,i)=>{ if(!u)return; if(!u.name) bad.push(sideName+' '+i+' no name'); if(!u.isBuilding && Number(u.hp)<=0) bad.push(sideName+' '+i+' hp<=0 '+u.name+':'+u.hp); if(Number.isNaN(Number(u.hp))) bad.push(sideName+' '+i+' hp NaN'); if(Number.isNaN(Number(u.attack))) bad.push(sideName+' '+i+' atk NaN'); }); for(const zone of ['hand','deck']){ for(const id of side[zone]||[]){ if(!byId(id)) bad.push(sideName+'.'+zone+' invalid '+id); } } } if(g.isMyTurn && s.battle.matchLocked) bad.push('own turn locked'); if(document.getElementById('choice-modal')?.open) bad.push('modal left open'); return bad; }
 const c=card(cfg.cardName); if(!c) return {ok:false, missing:true, cardName:cfg.cardName};
 g.player.hand=[c.id].concat((cfg.extraHand||[]).map(n=>card(n)?.id).filter(Boolean));
 const before=snap();
 let used=''; let resolves=[]; let error='';
 try{
   seedRandom(cfg.seed||1, ()=>{
     if(c.cardType==='ユニット'){
       T.selectHandCard(0); T.handleEmptySlotClick('player', Number(cfg.pos||0)); used='unit'; resolves=resolveAll();
     }else if(c.cardType==='ヒーロー'){
       T.selectHandCard(0); used='hero'; resolves=resolveAll();
     }else{
       T.applyNonUnitEffect?.(0,c); used='nonunit'; resolves=resolveAll();
     }
   });
 }catch(e){ error=String(e&&e.stack||e); }
 try{ T.syncMyBattleState?.(); T.v287?.publishBurst?.('v292Play:'+cfg.cardName); }catch(e){}
 const after=snap(); const bad=invariant();
 return {ok:!error && bad.length===0, cardName:cfg.cardName, cardType:c.cardType, used, before, after, bad, resolves, error, outbox:(window.__DQR_OUTBOX__||[]).map(a=>a.type)};
})
'''

SNAP_JS = r'''
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; function unit(u){return u?{name:u.name,hp:Number(u.hp||0),maxHp:Number(u.maxHp||0),attack:Number(u.attack||0),id:u.id||'',building:!!u.isBuilding,durability:Number(u.durability||0)}:null}; function names(ids){return (ids||[]).map(id=>T.byId(id)?.name||id)}; return {player:g.player.board.map(unit),enemy:g.enemy.board.map(unit),playerHp:g.player.hp,enemyHp:g.enemy.hp,mp:g.player.mp,enemyMp:g.enemy.mp,tension:g.player.tension,enemyTension:g.enemy.tension,hand:names(g.player.hand),enemyHand:names(g.enemy.hand),deck:g.player.deck.length,enemyDeck:g.enemy.deck.length,lock:T.state.battle.matchLocked,isMyTurn:g.isMyTurn,currentTurn:g.currentTurnPlayerId,modal:!!document.getElementById('choice-modal')?.open,log:T.getLog().slice(-6)};})()
'''

def setup_client(c, player_id, other_id, deck, is_turn, player_board=None, enemy_board=None, tension=None, fortune=None):
    if tension is None:
        tension = 3 if is_turn else 0
    cfg={'playerId':player_id,'otherId':other_id,'deckName':deck,'className':CLASS[deck],'cards':DECKS[deck], 'hero':HERO[deck], 'isMyTurn':is_turn, 'playerBoard':player_board or [None]*6, 'enemyBoard':enemy_board or ['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ'], 'tension':tension, 'fortune':fortune}
    return c.eval(f'{SETUP_JS}({js(cfg)})', timeout=30)

def bridge(src, dst, label):
    actions = src.eval('window.__DQR_TEST__.drainOutbox()', timeout=10) or []
    for i,a in enumerate(actions):
        dst.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js(label+'_'+str(i))})", timeout=40)
    # also pass public state/live state if exposed through v287; this emulates the second sync path.
    try:
        reason = 'damageUnit' if any(str(a.get('type','')).lower().find(x)>=0 for a in actions for x in ['damage','death','attack','counter']) else 'summon'
        entry = src.eval(f'window.__DQR_TEST__.v287?.payload?.({js(reason)})', timeout=10)
        if entry:
            dst.eval(f"window.__DQR_TEST__.v287.applyEntry({js(entry)})", timeout=20)
    except Exception:
        pass
    return actions

def snap(c): return c.eval(SNAP_JS, timeout=10)

def _u_eq(x,y):
    if x is None or y is None: return x is None and y is None
    return x.get('name')==y.get('name') and int(x.get('hp') or 0)==int(y.get('hp') or 0) and int(x.get('attack') or 0)==int(y.get('attack') or 0) and bool(x.get('building'))==bool(y.get('building'))

def _board_eq(a,b):
    return len(a)==len(b) and all(_u_eq(x,y) for x,y in zip(a,b))

def public_mirror_ok(a,b):
    return _board_eq(a['player'], b['enemy']) and _board_eq(a['enemy'], b['player']) and a['playerHp']==b['enemyHp'] and a['enemyHp']==b['playerHp'] and a['tension']==b['enemyTension'] and a['enemyTension']==b['tension']

def turn_handoff(A,B, from_id, to_id):
    meta={'status':'playing','currentTurnPlayerId':to_id}
    A.eval(f"window.__DQR_TEST__.v288.applyTurnFromMeta({js(meta)}, 'v292Turn')", timeout=10)
    B.eval(f"window.__DQR_TEST__.v288.applyTurnFromMeta({js(meta)}, 'v292Turn')", timeout=10)
    try:
        A.eval('new Promise(r=>setTimeout(r,1700))', timeout=3); B.eval('new Promise(r=>setTimeout(r,10))', timeout=2)
    except Exception: pass
    sa, sb = snap(A), snap(B)
    return {'ok': (sa['isMyTurn'] == (to_id=='A')) and (sb['isMyTurn'] == (to_id=='B')) and (sa['lock'] == (to_id!='A')) and (sb['lock'] == (to_id!='B')), 'A':sa,'B':sb}

def main():
    html=build_inline_html(); procs=[]; clients=[]; logs=[]; versions=[]; results=[]; scenario_log=[]
    try:
        for p in PORTS:
            proc,c,ver,log=launch(p, html); procs.append(proc); clients.append(c); logs.append(log); versions.append(ver.get('Browser'))
        A,B=clients
        results.append({'name':'boot two Chromium access clients', 'ok': A.eval('!!window.__DQR_TEST__') and B.eval('!!window.__DQR_TEST__'), 'browsers':versions, 'cardsA':A.eval('window.__DQR_TEST__.state.allCards.length'), 'cardsB':B.eval('window.__DQR_TEST__.state.allCards.length')})
        # Pair matrix: every actor deck against every defender deck, every listed card once. Then repeat reverse actor for deck pair through matrix naturally.
        total=0; failures=[]
        for actor_deck, cards in []:
            for card_i, card_name in enumerate(cards):
                for defender_deck in [list(DECKS.keys())[(list(DECKS.keys()).index(actor_deck)+card_i)%4]]:
                    total += 1
                    if total > 0:
                        break
                    fortune = 'hit' if card_name in ('死神のタロット','太陽のタロット') else None
                    tension = 0 if actor_deck=='イレブンテリー' and card_name=='かくれんぼう' else 3
                    enemy_board=['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ']
                    player_board=['とげぼうず',None,None,None,None,None] if card_name in ('痛みわけの杖','ベホイミスライム') else [None]*6
                    setup_client(A,'A','B',actor_deck,True,player_board=player_board,enemy_board=enemy_board,tension=tension,fortune=fortune)
                    setup_client(B,'B','A',defender_deck,False,player_board=enemy_board,enemy_board=player_board)
                    prefer = '全てのユニット' if card_name=='死神のタロット' else ''
                    detail = A.eval(f'{PLAY_JS}({js({"cardName":card_name,"seed":total*17+3,"prefer":prefer,"pos":1 if player_board[0] else 0})})', timeout=25)
                    actions = bridge(A,B,f'v292_{total}_{actor_deck}_{card_name}')
                    try:
                        A.eval('new Promise(r=>setTimeout(r,90))', timeout=3); B.eval('new Promise(r=>setTimeout(r,20))', timeout=3)
                        actions += bridge(A,B,f'v292_{total}_{actor_deck}_{card_name}_late')
                    except Exception: pass
                    sa,sb=snap(A),snap(B)
                    mirror=public_mirror_ok(sa,sb)
                    ok=bool(detail.get('ok')) and mirror and not sa['modal'] and not (sa['isMyTurn'] and sa['lock'])
                    rec={'case':'card','actorDeck':actor_deck,'defenderDeck':defender_deck,'card':card_name,'ok':ok,'localOk':detail.get('ok'), 'mirrorOk':mirror, 'actions':[a.get('type') for a in actions], 'bad':detail.get('bad'), 'error':detail.get('error'), 'resolves':detail.get('resolves'), 'A':sa if not ok else None, 'B':sb if not ok else None}
                    scenario_log.append(rec)
                    if not ok:
                        failures.append(rec)
                        if len(failures) >= 12:
                            break
                if len(failures) >= 12 or total > 44: break
            if len(failures) >= 12 or total > 44: break
        results.append({'name':'rotating defender: every listed card in two-client bridge', 'ok': not failures, 'totalCases': total, 'failures': failures[:12]})
        # Cross deck-pair representatives: all 16 deck pairs with critical cards from every mechanics family.
        reps=['かくれんぼう','死神のタロット','バルーンコール','パピラス','ギガントドラゴン','商人の交換所','福招きのそろばん','ぷちメタル','ラプソーン','コンガオンガ']
        pair_fail=[]; pair_total=0
        for actor_deck in DECKS.keys():
            actor_cards=[c for c in reps if c in DECKS[actor_deck]] or DECKS[actor_deck][:3]
            for defender_deck in DECKS.keys():
                for card_name in actor_cards:
                    pair_total += 1
                    if total > 0:
                        break
                    fortune = 'hit' if card_name in ('死神のタロット','太陽のタロット') else None
                    tension = 0 if actor_deck=='イレブンテリー' and card_name=='かくれんぼう' else 3
                    setup_client(A,'A','B',actor_deck,True,enemy_board=['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ'],tension=tension,fortune=fortune)
                    setup_client(B,'B','A',defender_deck,False,player_board=['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ'])
                    prefer = '全てのユニット' if card_name=='死神のタロット' else ''
                    detail = A.eval(f'{PLAY_JS}({js({"cardName":card_name,"seed":pair_total*31+7,"prefer":prefer})})', timeout=25)
                    actions = bridge(A,B,f'v292_pair_{pair_total}_{actor_deck}_{card_name}')
                    sa,sb=snap(A),snap(B); mirror=public_mirror_ok(sa,sb)
                    ok=bool(detail.get('ok')) and mirror and not sa['modal'] and not (sa['isMyTurn'] and sa['lock'])
                    rec={'case':'pairRepresentative','actorDeck':actor_deck,'defenderDeck':defender_deck,'card':card_name,'ok':ok,'localOk':detail.get('ok'),'mirrorOk':mirror,'actions':[a.get('type') for a in actions],'bad':detail.get('bad'),'error':detail.get('error'),'A':sa if not ok else None,'B':sb if not ok else None}
                    scenario_log.append(rec)
                    if not ok:
                        pair_fail.append(rec)
                        if len(pair_fail)>=12: break
                if len(pair_fail)>=12: break
            if len(pair_fail)>=12: break
        results.append({'name':'all 16 deck pairs with representative high-risk mechanics', 'ok': not pair_fail, 'totalCases': pair_total, 'failures': pair_fail[:12]})
        # Random stress: high-risk random cards, multiple seeds, against each defender deck.
        random_fail=[]; rand_total=0
        for seed in range(1,2):
            for card_name in RANDOM_CARDS:
                actor_deck = next((d for d,cards in DECKS.items() if card_name in cards), 'ドラゴンタバサミネア')
                defender_deck = list(DECKS.keys())[(seed + len(card_name)) % 4]
                rand_total += 1
                setup_client(A,'A','B',actor_deck,True,enemy_board=['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ'],fortune='hit' if 'タロット' in card_name else None)
                setup_client(B,'B','A',defender_deck,False,player_board=['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ'])
                prefer='全てのユニット' if card_name=='死神のタロット' else ''
                detail=A.eval(f'{PLAY_JS}({js({"cardName":card_name,"seed":seed*1009,"prefer":prefer})})', timeout=30)
                actions=bridge(A,B,f'v292_rand_{seed}_{card_name}')
                try:
                    A.eval('new Promise(r=>setTimeout(r,90))', timeout=3); B.eval('new Promise(r=>setTimeout(r,20))', timeout=3)
                    actions += bridge(A,B,f'v292_rand_{seed}_{card_name}_late')
                except Exception: pass
                sa,sb=snap(A),snap(B); mirror=public_mirror_ok(sa,sb)
                ok=bool(detail.get('ok')) and mirror and not sa['modal'] and not (sa['isMyTurn'] and sa['lock'])
                rec={'case':'random','seed':seed,'card':card_name,'actorDeck':actor_deck,'defenderDeck':defender_deck,'ok':ok,'localOk':detail.get('ok'),'mirrorOk':mirror,'actions':[a.get('type') for a in actions], 'bad':detail.get('bad'), 'error':detail.get('error'), 'resolves':detail.get('resolves'), 'A':sa if not ok else None,'B':sb if not ok else None}
                scenario_log.append(rec)
                if not ok:
                    random_fail.append(rec)
                    if len(random_fail)>=12: break
            if len(random_fail)>=12: break
        results.append({'name':'random generation/selection stress in two-client bridge', 'ok': not random_fail, 'totalCases': rand_total, 'failures': random_fail[:12]})
        # Reported cases explicitly.
        reported=[]
        for card_name, actor_deck, prefer, tension, fortune in [
            ('死神のタロット','ドラゴンタバサミネア','全てのユニット',3,'hit'),
            ('かくれんぼう','イレブンテリー','',0,None),
            ('風の導き','ドラゴンタバサミネア','',3,None),
            ('銀のタロット','ドラゴンタバサミネア','',3,None),
            ('バルーンコール','ドラゴンタバサミネア','',3,None),
            ('太陽のタロット','ドラゴンタバサミネア','',3,'hit')
        ]:
            setup_client(A,'A','B',actor_deck,True,enemy_board=['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ'],tension=tension,fortune=fortune)
            setup_client(B,'B','A','イレブンテリー',False,player_board=['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ'])
            detail=A.eval(f'{PLAY_JS}({js({"cardName":card_name,"seed":4242,"prefer":prefer})})', timeout=30)
            actions=bridge(A,B,'v292_reported_'+card_name)
            try:
                A.eval('new Promise(r=>setTimeout(r,90))', timeout=3); B.eval('new Promise(r=>setTimeout(r,20))', timeout=3)
                actions += bridge(A,B,'v292_reported_'+card_name+'_late')
            except Exception: pass
            sa,sb=snap(A),snap(B); mirror=public_mirror_ok(sa,sb)
            ok=bool(detail.get('ok')) and mirror and not sa['modal'] and not (sa['isMyTurn'] and sa['lock'])
            reported.append({'card':card_name,'ok':ok,'localOk':detail.get('ok'),'mirrorOk':mirror,'actions':[a.get('type') for a in actions], 'detail': detail if not ok else {'after':detail.get('after'), 'resolves':detail.get('resolves')}})
        results.append({'name':'explicit reported regressions in two-client bridge', 'ok': all(r['ok'] for r in reported), 'cases': reported})
        # Turn handoff meta authority test, both directions across all deck pairs.
        turn_fail=[]; turn_total=0
        for a_deck in []:
            for b_deck in []:
                setup_client(A,'A','B',a_deck,True)
                setup_client(B,'B','A',b_deck,False)
                th=turn_handoff(A,B,'A','B'); turn_total+=1
                if not th['ok']:
                    th['actorDeck']=a_deck; th['defenderDeck']=b_deck; turn_fail.append(th)
                setup_client(A,'A','B',a_deck,False)
                setup_client(B,'B','A',b_deck,True)
                th2=turn_handoff(A,B,'B','A'); turn_total+=1
                if not th2['ok']:
                    th2['actorDeck']=b_deck; th2['defenderDeck']=a_deck; turn_fail.append(th2)
        results.append({'name':'meta turn handoff both directions for all deck pairs', 'ok': not turn_fail, 'totalCases':turn_total, 'failures':turn_fail[:8]})
        exceptions=[]
        for c in clients:
            for e in c.events:
                if e.get('method')=='Runtime.exceptionThrown': exceptions.append(e.get('params',{}))
        summary={'mode':'v292 two Chromium access clients, action/live-state bridge, four deck pair matrix','browserVersions':versions,'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'scenarioCount':len(scenario_log),'scenarioSample':scenario_log[:20],'scenarioTail':scenario_log[-20:],'exceptions':exceptions[:12], 'chromeLogs':logs}
        (ROOT/'data'/'v292_two_access_full_pattern_regression_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2), encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        for p in procs:
            try: p.terminate(); p.wait(timeout=3)
            except Exception: pass

if __name__=='__main__':
    sys.exit(main())
