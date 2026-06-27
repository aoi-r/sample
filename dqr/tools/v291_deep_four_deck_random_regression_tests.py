import json, os, subprocess, time, tempfile, urllib.request, sys, socket, re, random
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORT=random.randint(9301, 9799)
class CDP:
    def __init__(self, ws_url, port):
        self.ws=websocket.create_connection(ws_url, timeout=8, origin=f'http://127.0.0.1:{port}')
        self.i=0; self.events=[]
    def call(self, method, params=None, timeout=60):
        self.i+=1; msg={'id':self.i,'method':method}
        if params is not None: msg['params']=params
        self.ws.send(json.dumps(msg)); deadline=time.time()+timeout; old=self.ws.gettimeout(); self.ws.settimeout(.5)
        try:
            while time.time()<deadline:
                try: data=json.loads(self.ws.recv())
                except (socket.timeout, TimeoutError, websocket.WebSocketTimeoutException): continue
                if data.get('id')==self.i:
                    if 'error' in data: raise RuntimeError(f"CDP {method}: {data['error']}")
                    return data.get('result',{})
                self.events.append(data)
        finally: self.ws.settimeout(old)
        raise TimeoutError(method)
    def eval(self, expr, timeout=120):
        res=self.call('Runtime.evaluate', {'expression':expr,'awaitPromise':True,'returnByValue':True,'userGesture':True}, timeout=timeout)
        if 'exceptionDetails' in res: raise RuntimeError(json.dumps(res['exceptionDetails'],ensure_ascii=False)[:6000])
        return res.get('result',{}).get('value')
def wait_json(url, tries=240):
    last=None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=1) as r: return json.loads(r.read().decode())
        except Exception as e: last=e; time.sleep(.1)
    raise RuntimeError(f'not ready {url}: {last}')
def build_inline_html():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<script type="module" src="\.\/js\/app\.js\?[^\"]*"><\/script>','',html)
    app=(ROOT/'js'/'app.js').read_text(encoding='utf-8')
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'DISABLED_FOR_V291_DEEP_REGRESSION' };")
    names=['cards.json','systems.json','strategies.json','choices.json','coin.json','dungeons.json','fortune.json','heroes.json','exchanges.json','generated_cards.json','tension_system.json','hero_generated_cards.json','hero_skill_cards.json','hero_starters.json','deck_rules.json']
    data={}
    for n in names:
        fp=ROOT/'data'/n
        if fp.exists():
            data[f'./data/{n}']=json.loads(fp.read_text(encoding='utf-8'))
            data[f'data/{n}']=data[f'./data/{n}']
    boot="""
<script>
window.__DQR_INLINE_DATA__ = __DATA__;
const __nativeFetch = window.fetch.bind(window);
window.fetch = async function(url, opts){
  const raw = String(url || '');
  let key = raw.split('?')[0];
  key = key.replace(/^https?:\/\/[^/]+\//, './');
  if(!key.startsWith('./') && key.startsWith('data/')) key = './' + key;
  if(window.__DQR_INLINE_DATA__[key]) return new Response(JSON.stringify(window.__DQR_INLINE_DATA__[key]), {status:200, headers:{'Content-Type':'application/json'}});
  return __nativeFetch(url, opts);
};
</script>
""".replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',',':')))
    return html.replace('</body>', boot+'<script type="module">\n'+app+'\n</script></body>')
def launch(html):
    profile=tempfile.mkdtemp(prefix='dqr_v291_chrome_')
    log_path=tempfile.NamedTemporaryFile('w+',delete=False).name
    log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--single-process','--disable-gpu','--disable-software-rasterizer','--disable-gpu-compositing','--disable-dev-shm-usage',f'--remote-debugging-port={PORT}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'],stdout=log,stderr=log)
    wait_json(f'http://127.0.0.1:{PORT}/json/version')
    pages=[]
    for _ in range(120):
        try:
            pages=wait_json(f'http://127.0.0.1:{PORT}/json/list', tries=1)
            if pages: break
        except Exception: time.sleep(.1)
    if not pages: raise RuntimeError('no chromium pages')
    page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], PORT); c.call('Runtime.enable'); c.call('Page.enable')
    frame=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame,'html':html}, timeout=180)
    for _ in range(300):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.findCardByName("スライム")', timeout=2): return proc,c,log_path
        except Exception: pass
        time.sleep(.2)
    raise RuntimeError('app not ready')
TEST_JS = r'''
(async function(){
const T=window.__DQR_TEST__;
const state=T.state;
const decks={
  'イレブンテリー': ['しっぷう突き','とげぼうず','勇者イレブン','アルゴリザード','トンネラー','かくれんぼう','ナイトキング','わたぼう','ブラッドレディ','シーゴーレム','ラプソーン','最後の砦の英雄グレイグ','コンガオンガ','フェイスボール','メルビン','ギュメイ将軍','シュプリンガー','グレイトマムー','いなずまのけん','ウルノーガ&ウルナーガ'],
  'ドラゴンタバサミネア':['魂の写し身','タバサ','風の導き','銀のタロット','クロウズ','バルーンコール','かみかぜ','バルンバ','太陽のタロット','サイコロン','キースドラゴン','死神のタロット','イブール','ゾディアックコード','逆転への兆し','召竜の儀式','しんりゅう','タロットフォーチュン'],
  'イルルカドラゴンゼシカ':['メラ','パピラス','イル＆ルカ','メラミ','とさかヘビ','リザードキッズ','デンタザウルス','乙女の気まぐれ','氷竜への祈り','アルゴングレート','サウルスロード','メラゾーマ','ギガントドラゴン','ガメゴンロード','竜将ドラゴンガイア','ドラゴンブッシュ'],
  'デボラトルネコ':['商人の交換所','コインのたね','とげぼうず','プチファイター','ケダモン','ぷちメタル','くらやみハーピー','ベホイミスライム','天空の花嫁デボラ','ルドマン','怪獣プスゴン','ラプソーン','黄金兵','痛みわけの杖','ブラバニクイーン','福招きのそろばん','マデサゴーラ','ハンフリー','レッドプレデター','ゴールデンタイタス']
};
const randomCards = ['かみかぜ','サイコロン','死神のタロット','逆転への兆し','召竜の儀式','しんりゅう','パピラス','ギガントドラゴン','竜将ドラゴンガイア','コンガオンガ','シュプリンガー','ラプソーン','怪獣プスゴン','ルドマン','福招きのそろばん','マデサゴーラ','商人の交換所','氷竜への祈り','バルーンコール','太陽のタロット','キースドラゴン'];
function card(name){ return T.findCardByName(name); }
function ctext(c){ return String(c?.text||c?.effect||''); }
function side(s){ return s==='enemy' ? state.battle.game.enemy : state.battle.game.player; }
function validIds(ids){ return (ids||[]).every(id=>!!T.byId(id)); }
function seedRandom(seed, fn){ const old=Math.random; let x=seed>>>0; Math.random=function(){ x=(1664525*x+1013904223)>>>0; return x/4294967296; }; try{return fn();} finally{ Math.random=old; } }
function setup(deckName='test', opts={}){
  T.setupPvpTest(deckName.replace(/[^A-Z0-9]/g,'P') || 'P1', true);
  const g=state.battle.game;
  state.battle.selectedDeck={deckName, className: opts.className || '戦士', cards:[]};
  state.battle.matchLocked=false; state.battle.processingRemoteAction=false;
  g.player.mp=99; g.player.maxMp=99; g.enemy.mp=99; g.enemy.maxMp=99;
  g.player.tension=opts.tension ?? 3; g.enemy.tension=0; g.isMyTurn=true; g.currentTurnPlayerId=state.playerId;
  g.player.hp=25; g.enemy.hp=25;
  const baseDeck=['スライム','ドラキー','メラ','メラミ','メラゾーマ','コイン','スライム','ドラキー','プチファイター','パピラス','とさかヘビ','キースドラゴン','福招きのそろばん'];
  g.player.deck=baseDeck.map(n=>card(n)?.id).filter(Boolean);
  g.enemy.deck=baseDeck.map(n=>card(n)?.id).filter(Boolean);
  g.player.hand=[]; g.enemy.hand=[];
  T.setBoardByNames('enemy',['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ']);
  T.setBoardByNames('player',[null,null,null,null,null,null]);
  if(opts.playerBoard) T.setBoardByNames('player', opts.playerBoard);
  if(opts.enemyBoard) T.setBoardByNames('enemy', opts.enemyBoard);
  if(opts.hero === 'eleven') g.player.heroSkill={heroCardName:'勇者イレブン', level:2, elevenBondActive:true, usedThisTurn:false, usesThisTurn:0};
  if(opts.hero === 'tabasa') g.player.heroSkill={heroCardName:'タバサ', level:2, usedThisTurn:false, usesThisTurn:0};
  if(opts.hero === 'ilLuca') g.player.heroSkill={heroCardName:'イル＆ルカ', level:2, usedThisTurn:false, usesThisTurn:0};
  if(opts.hero === 'deborah') g.player.heroSkill={heroCardName:'天空の花嫁デボラ', level:2, deborahBetTension:true, usedThisTurn:false, usesThisTurn:0};
  if(opts.fortune) g.player.fortuneMode=opts.fortune;
  return g;
}
function chooseHeroForDeck(deckName){
  if(deckName.includes('イレブン')) return {hero:'eleven', tension:0, className:'戦士'};
  if(deckName.includes('タバサ')) return {hero:'tabasa', className:'占い師'};
  if(deckName.includes('イルルカ')) return {hero:'ilLuca', className:'魔法使い'};
  if(deckName.includes('デボラ')) return {hero:'deborah', className:'商人'};
  return {};
}
function closeDialog(){ const d=document.getElementById('choice-modal'); if(d?.open){ try{d.close();}catch(e){} } }
function resolveOne(preferText=''){
  const d=document.getElementById('choice-modal');
  if(d?.open){
    let btn=null;
    const opts=[...document.querySelectorAll('#choice-modal-body .choice-option:not([disabled])')];
    if(preferText) btn=opts.find(b=>String(b.textContent||'').includes(preferText));
    btn = btn || document.querySelector('#choice-modal-body .choice-all-banner') || opts[0];
    if(btn){ btn.click(); return true; }
    try{d.close();}catch(e){}
    return true;
  }
  const g=state.battle.game;
  if(g.pendingGenericEffect){
    const eff=g.pendingGenericEffect;
    if(String(eff.target||'').includes('Leader') || eff.target==='enemyAny'){
      try{ T.applyPendingGenericEffectToLeader?.(); return true; }catch(e){}
    }
    if(String(eff.target||'').includes('enemy') || eff.target==='unitAny'){
      try{ T.applyPendingGenericEffectToUnit?.({side:'enemy', pos:0}); return true; }catch(e){}
    }
    if(String(eff.target||'').includes('friendly')){
      try{ T.applyPendingGenericEffectToUnit?.({side:'player', pos:0}); return true; }catch(e){}
    }
    g.pendingGenericEffect=null; return true;
  }
  if(g.pendingHeroSkill){ g.pendingHeroSkill=null; return true; }
  return false;
}
function resolveAll(preferText=''){
  let n=0;
  for(let i=0;i<16;i++){ if(resolveOne(preferText)){ n++; continue; } break; }
  return n;
}
function invariant(label, extra={}){
  const g=state.battle.game; let bad=[];
  for(const s of ['player','enemy']){
    const obj=side(s);
    if(!Array.isArray(obj.board) || obj.board.length!==6) bad.push(`${s}.board length`);
    (obj.board||[]).forEach((u,i)=>{
      if(!u) return;
      if(!u.name) bad.push(`${s}[${i}] unit missing name`);
      if(!u.isBuilding && Number(u.hp)<=0) bad.push(`${s}[${i}] hp<=0 ${u.name}:${u.hp}`);
      if(Number.isNaN(Number(u.attack))) bad.push(`${s}[${i}] attack NaN`);
      if(Number.isNaN(Number(u.hp))) bad.push(`${s}[${i}] hp NaN`);
    });
    if(!validIds(obj.hand||[])) bad.push(`${s} invalid hand id`);
    if(!validIds(obj.deck||[])) bad.push(`${s} invalid deck id`);
  }
  if(g.isMyTurn && state.battle.matchLocked) bad.push('own turn locked');
  const d=document.getElementById('choice-modal');
  if(d?.open && !extra.allowOpenModal) bad.push('choice modal left open');
  if(g.player.hand.length>20) bad.push('player hand unexpectedly >20');
  if(g.enemy.hand.length>20) bad.push('enemy hand unexpectedly >20');
  return {ok:bad.length===0,bad,label,snap:T.boardSnapshot(), hand:g.player.hand.map(id=>T.byId(id)?.name||id), enemyHand:g.enemy.hand.map(id=>T.byId(id)?.name||id), log:T.getLog().slice(-10)};
}
function playCard(deckName, name, opts={}){
  const c=card(name); if(!c) return {ok:false,bad:['missing card '+name]};
  const setupOpts=Object.assign({}, chooseHeroForDeck(deckName), opts.setup||{});
  const g=setup(deckName, setupOpts);
  g.player.hand=[c.id].concat((opts.extraHand||[]).map(n=>card(n)?.id).filter(Boolean));
  const before={hand:g.player.hand.length, deck:g.player.deck.length, enemyHp:g.enemy.hp, playerHp:g.player.hp, board:T.boardSnapshot()};
  try{
    if(c.cardType==='ユニット' || c.cardType==='ヒーロー'){
      T.selectHandCard(0);
      if(c.cardType==='ユニット') T.handleEmptySlotClick('player', opts.pos ?? 0);
      else resolveAll(opts.choice||'');
    }else{
      T.applyNonUnitEffect?.(0,c);
    }
    resolveAll(opts.choice||'');
    const inv=invariant(`${deckName}/${name}`, opts);
    return {ok:inv.ok, name, deckName, type:c.cardType, before, after:inv, text:ctext(c)};
  }catch(e){
    const inv=invariant(`${deckName}/${name}:exception`, opts);
    return {ok:false, name, deckName, type:c.cardType, error:String(e&&e.stack||e), after:inv, text:ctext(c)};
  }
}
function addResult(arr, name, fn){ try{ const r=fn(); arr.push({name, ok:!!r.ok, detail:r}); } catch(e){ arr.push({name, ok:false, error:String(e&&e.stack||e)}); } }
const results=[];
addResult(results,'reported death tarot hit all units should damage and unlock', ()=>{
  const g=setup('ドラゴンタバサミネア',{hero:'tabasa',className:'占い師',fortune:'hit'});
  g.player.hand=[card('死神のタロット').id];
  const before=T.boardSnapshot();
  T.applyNonUnitEffect(0,card('死神のタロット'));
  const labels=T.choiceLabels();
  resolveAll('全てのユニット');
  const inv=invariant('deathTarotHitAll');
  const after=T.boardSnapshot();
  const anyDamaged=after.enemy.some((u,i)=>u && before.enemy[i] && u.hp < before.enemy[i].hp) || after.player.some((u,i)=>u && before.player[i] && u.hp < before.player[i].hp);
  return {ok:inv.ok && anyDamaged, labels, before, after, inv};
});
addResult(results,'reported eleven lv2 kakurenbou at tension0 draws', ()=>{
  const g=setup('イレブンテリー',{hero:'eleven',tension:0});
  g.player.deck=[card('スライム').id,card('ドラキー').id].filter(Boolean);
  g.player.hand=[card('かくれんぼう').id];
  T.selectHandCard(0); T.handleEmptySlotClick('player',0); resolveAll();
  const inv=invariant('elevenKakurenbou');
  return {ok:inv.ok && g.player.hand.length>=1, inv};
});
for(const n of ['風の導き','銀のタロット','バルーンコール','かみかぜ','太陽のタロット','死神のタロット','ゾディアックコード','逆転への兆し']){
  addResult(results,`tabasa lv2 draw once: ${n}`, ()=>{
    const g=setup('ドラゴンタバサミネア',{hero:'tabasa',className:'占い師'});
    const c=card(n); g.player.hand=[c.id]; g.player.deck=[card('スライム').id,card('ドラキー').id,card('メラ').id].filter(Boolean);
    const before={hand:g.player.hand.length, deck:g.player.deck.length};
    T.applyNonUnitEffect(0,c); resolveAll();
    const after={hand:g.player.hand.length, deck:g.player.deck.length};
    const inv=invariant('tabasa '+n);
    return {ok:inv.ok && (after.hand>=before.hand || after.deck<before.deck), before, after, inv};
  });
}
for(const [deckName,names] of Object.entries(decks)){
  for(const n of [...new Set(names)]){
    addResult(results, `single-use ${deckName} / ${n}`, ()=>playCard(deckName,n));
  }
}
for(const [deckName,names] of Object.entries(decks)){
  for(const n of [...new Set(names)]){
    const c=card(n); if(!c) continue;
    if(!/選択|占い|願い|さくせん|交換|BET/i.test(ctext(c))) continue;
    const probe=playCard(deckName,n,{allowOpenModal:true});
    const choices=Array.from(new Set((document.querySelector('#choice-modal')?.open ? T.choiceLabels() : [])));
    closeDialog();
    let branchChoices=choices.length?choices:[''];
    for(const ch of branchChoices.slice(0,6)){
      addResult(results, `choice-branch ${deckName} / ${n} / ${ch||'default'}`, ()=>playCard(deckName,n,{choice:ch}));
    }
  }
}
for(const n of randomCards){
  for(let seed=1; seed<=8; seed++){
    addResult(results, `random-stress ${n} seed${seed}`, ()=>seedRandom(0xC0FFEE+seed*97+n.length, ()=>playCard('randomStress', n, {setup:{hero:n==='かくれんぼう'?'eleven':'tabasa', className:'占い師', fortune:seed%3===0?'hit':''}, choice:seed%2?'全て':'', extraHand:['コイン','コイン','コイン','メラミ','キースドラゴン'], pos:seed%6})));
  }
}
for(const n of ['ぷちメタル','ベホイミスライム','ルドマン','マデサゴーラ','福招きのそろばん','死神のタロット','かくれんぼう','パピラス','氷竜への祈り','ギガントドラゴン']){
  addResult(results, `duplicate-stability ${n}`, ()=>{
    const r=playCard('duplicate', n, {setup:{hero:'deborah', className:'商人'}, extraHand:['コイン','コイン','コイン','メラミ']});
    const g=state.battle.game;
    const before={hand:g.player.hand.length, deck:g.player.deck.length, tension:g.player.tension};
    try{ T.handleTurnEndEvent?.({side:'player'}); }catch(e){}
    try{ T.handleTurnEndEvent?.({side:'player'}); }catch(e){}
    resolveAll();
    const after={hand:g.player.hand.length, deck:g.player.deck.length, tension:g.player.tension};
    const inv=invariant('duplicate '+n);
    const hugeJump=(after.hand-before.hand)>4;
    return {ok:r.ok && inv.ok && !hugeJump, first:r, before, after, inv};
  });
}
addResult(results, 'remote public state board applies without player hand mixing', ()=>{
  setup('sync',{});
  const g=state.battle.game;
  T.applyRemoteOpponentState({OTHER:{playerId:'OTHER',sessionId:state.battle.sessionId,hp:17,maxMp:6,mp:4,tension:2,board:[T.makeUnitFromCard(card('スライム')),null,T.makeUnitFromCard(card('ドラキー')),null,null,null],handIds:[card('コイン').id],handCount:1,deckCount:20,actionReplayReady:false}});
  const inv=invariant('remote state',{});
  const enemyNames=g.enemy.board.map(u=>u?.name||null);
  return {ok:inv.ok && enemyNames[0]==='スライム' && enemyNames[2]==='ドラキー' && g.player.hand.length===0, enemyNames, playerHand:g.player.hand, enemyHand:g.enemy.hand, inv};
});
const failed=results.filter(r=>!r.ok);
return {total:results.length, passed:results.length-failed.length, failed:failed.length, failures:failed.slice(0,80), results};
})()
'''
def main():
    proc=None
    try:
        proc,c,log=launch(build_inline_html())
        print('launched; running deep regression...', flush=True)
        c.eval('window.__DQR_TEST__.state.firebase.enabled=false; true', timeout=5)
        summary=c.eval(TEST_JS, timeout=360)
        exceptions=[e.get('params',{}) for e in c.events if e.get('method')=='Runtime.exceptionThrown']
        summary['runtimeExceptions']=exceptions[:30]
        out=ROOT/'data'/'v291_deep_four_deck_random_regression_tests.json'
        out.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({k:summary[k] for k in ['total','passed','failed']}, ensure_ascii=False), flush=True)
        if summary['failed']:
            for r in summary['failures'][:40]: print('FAIL', r.get('name'), json.dumps(r.get('detail') or r.get('error'), ensure_ascii=False)[:1200], flush=True)
        if exceptions: print('RUNTIME EXCEPTIONS', len(exceptions), flush=True)
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        if proc:
            try: proc.terminate(); proc.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
