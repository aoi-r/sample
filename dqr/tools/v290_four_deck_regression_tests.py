import json, os, subprocess, time, tempfile, urllib.request, sys, socket, re
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORT=9290
class CDP:
    def __init__(self, ws_url, port):
        self.port=port; self.ws=websocket.create_connection(ws_url, timeout=5, origin=f'http://127.0.0.1:{port}'); self.i=0; self.events=[]
    def call(self, method, params=None, timeout=30):
        self.i+=1; msg={'id':self.i,'method':method}
        if params is not None: msg['params']=params
        self.ws.send(json.dumps(msg)); deadline=time.time()+timeout; old=self.ws.gettimeout(); self.ws.settimeout(0.5)
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
    def eval(self, expr, timeout=60):
        res=self.call('Runtime.evaluate', {'expression':expr,'awaitPromise':True,'returnByValue':True,'userGesture':True}, timeout=timeout)
        if 'exceptionDetails' in res: raise RuntimeError(json.dumps(res['exceptionDetails'],ensure_ascii=False)[:5000])
        return res.get('result',{}).get('value')

def wait_json(url, tries=160):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=1) as r: return json.loads(r.read().decode())
        except Exception: time.sleep(0.1)
    raise RuntimeError('not ready '+url)

def build_inline_html():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<script type="module" src="\.\/js\/app\.js\?[^\"]*"><\/script>','',html)
    app=(ROOT/'js'/'app.js').read_text(encoding='utf-8')
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'DISABLED_FOR_V290_REGRESSION' };")
    names=['cards.json','systems.json','strategies.json','choices.json','coin.json','dungeons.json','fortune.json','heroes.json','exchanges.json','generated_cards.json','tension_system.json','hero_generated_cards.json','hero_skill_cards.json']
    data={}
    for n in names:
        p=ROOT/'data'/n
        if p.exists():
            data[f'./data/{n}']=json.loads(p.read_text(encoding='utf-8'))
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
    profile=tempfile.mkdtemp(prefix='dqr_v290_chrome_')
    log_path=tempfile.NamedTemporaryFile('w+',delete=False).name
    log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={PORT}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'],stdout=log,stderr=log)
    wait_json(f'http://127.0.0.1:{PORT}/json/version')
    pages=wait_json(f'http://127.0.0.1:{PORT}/json/list')
    page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], PORT); c.call('Runtime.enable'); c.call('Page.enable')
    frame=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame,'html':html}, timeout=180)
    for _ in range(240):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.v289', timeout=2): return proc,c,log_path
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError('app not ready')

TEST_JS = r'''
(async function(){
const T=window.__DQR_TEST__;
const decks={
  'イレブンテリー': [['しっぷう突き',2],['とげぼうず',2],['勇者イレブン',1],['アルゴリザード',2],['トンネラー',2],['かくれんぼう',2],['ナイトキング',2],['わたぼう',1],['ブラッドレディ',2],['シーゴーレム',2],['ラプソーン',1],['最後の砦の英雄グレイグ',1],['コンガオンガ',1],['フェイスボール',1],['メルビン',1],['ギュメイ将軍',1],['シュプリンガー',1],['グレイトマムー',2],['いなずまのけん',2],['ウルノーガ&ウルナーガ',1]],
  'ドラゴンタバサミネア': [['魂の写し身',1],['タバサ',1],['風の導き',2],['銀のタロット',2],['クロウズ',1],['バルーンコール',2],['かみかぜ',2],['バルンバ',2],['太陽のタロット',2],['サイコロン',2],['キースドラゴン',2],['死神のタロット',2],['イブール',1],['ゾディアックコード',2],['逆転への兆し',2],['召竜の儀式',2],['しんりゅう',1],['タロットフォーチュン',1]],
  'イルルカドラゴンゼシカ': [['メラ',2],['パピラス',2],['イル＆ルカ',1],['メラミ',2],['とさかヘビ',2],['リザードキッズ',2],['デンタザウルス',2],['乙女の気まぐれ',2],['氷竜への祈り',2],['アルゴングレート',2],['サウルスロード',2],['メラゾーマ',2],['ギガントドラゴン',2],['ガメゴンロード',2],['竜将ドラゴンガイア',1],['ドラゴンブッシュ',2]],
  'デボラトルネコ': [['商人の交換所',2],['コインのたね',1],['とげぼうず',2],['プチファイター',2],['ケダモン',2],['ぷちメタル',2],['くらやみハーピー',1],['ベホイミスライム',2],['天空の花嫁デボラ',1],['ルドマン',1],['怪獣プスゴン',1],['ラプソーン',1],['黄金兵',2],['痛みわけの杖',1],['ブラバニクイーン',2],['福招きのそろばん',1],['マデサゴーラ',1],['ハンフリー',1],['レッドプレデター',2],['ゴールデンタイタス',2]]
};
function card(name){ return T.findCardByName(name); }
function side(side){ return side==='enemy' ? T.state.battle.game.enemy : T.state.battle.game.player; }
function validIds(ids){ return (ids||[]).every(id=>!!T.byId(id)); }
function setup(deckName, opts={}){
  T.setupPvpTest(deckName.replace(/[^A-Z0-9]/g,'P'), true);
  const g=T.state.battle.game;
  T.state.battle.selectedDeck={deckName, className: opts.className || '戦士', cards:[]};
  g.player.mp=99; g.player.maxMp=99; g.player.tension=opts.tension ?? 3; g.enemy.tension=0; g.isMyTurn=true; T.state.battle.matchLocked=false;
  g.player.deck=['スライム','ドラキー','メラ','メラミ','コイン','スライム','ドラキー','メラゾーマ'].map(n=>card(n)?.id).filter(Boolean);
  g.enemy.deck=['スライム','ドラキー','メラ','メラミ','コイン','スライム'].map(n=>card(n)?.id).filter(Boolean);
  T.setBoardByNames('enemy',['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ']);
  T.setBoardByNames('player',[null,null,null,null,null,null]);
  if(opts.hero === 'eleven') g.player.heroSkill={heroCardName:'勇者イレブン', level:2, elevenBondActive:true, usedThisTurn:false, usesThisTurn:0};
  if(opts.hero === 'tabasa') g.player.heroSkill={heroCardName:'タバサ', level:2, usedThisTurn:false, usesThisTurn:0};
  if(opts.hero === 'ilLuca') g.player.heroSkill={heroCardName:'イル＆ルカ', level:2, usedThisTurn:false, usesThisTurn:0};
  if(opts.hero === 'deborah') g.player.heroSkill={heroCardName:'天空の花嫁デボラ', level:2, deborahBetTension:true, usedThisTurn:false, usesThisTurn:0};
  return g;
}
function closeAnyDialog(){ const d=document.getElementById('choice-modal'); if(d?.open){ try{ d.close(); }catch(e){} } }
function resolveModalFirst(){ const d=document.getElementById('choice-modal'); if(d?.open){ const btn=document.querySelector('#choice-modal-body .choice-option:not([disabled]), #choice-modal-body .choice-all-banner'); if(btn){ btn.click(); return true; } try{d.close();}catch(e){} } return false; }
function resolvePending(){
  const g=T.state.battle.game; let count=0;
  for(let k=0;k<8;k++){
    if(resolveModalFirst()){ count++; continue; }
    if(g.pendingGenericEffect){
      const tgt=g.pendingGenericEffect.target || '';
      if(tgt.includes('enemy') || tgt==='unitAny') { T.applyPendingGenericEffectToUnit?.('enemy',0); if(g.pendingGenericEffect) T.dealDamageToUnit(g.enemy.board.find(Boolean),0,'noop','enemy'); count++; continue; }
      if(tgt.includes('friendly')){ T.handleEmptySlotClick('player', firstEmpty('player')); count++; continue; }
    }
    if(g.pendingHeroSkill){ T.applyPendingHeroSkillToTarget?.('enemy',0); count++; continue; }
    break;
  }
  try{ T.state.battle.game && T.applyDeathrattle && T.state.battle.game.player.board.forEach(()=>{}); }catch(e){}
  return count;
}
function firstEmpty(s='player'){ const b=side(s).board; const i=b.findIndex(x=>!x); return i<0?0:i; }
function invariant(label){
  const g=T.state.battle.game; let bad=[];
  for(const s of ['player','enemy']){
    const b=side(s).board||[];
    b.forEach((u,i)=>{ if(u && !u.isBuilding && Number(u.hp)<=0) bad.push(`${s}[${i}] hp<=0 ${u.name}`); });
  }
  if(g.isMyTurn && T.state.battle.matchLocked) bad.push('my turn locked');
  if(!validIds(g.player.hand)) bad.push('invalid player hand id');
  if(!validIds(g.player.deck)) bad.push('invalid player deck id');
  return {ok:bad.length===0, bad, label, snap:T.boardSnapshot()};
}
function playCardOnce(deckName, name){
  const c=card(name); const type=c?.cardType||''; const text=String(c?.text||c?.effect||'');
  const opts={className:'戦士', tension:3};
  if(deckName.includes('イレブン')) {opts.hero='eleven'; opts.tension=0;}
  if(deckName.includes('タバサ')) {opts.hero='tabasa';}
  if(deckName.includes('イルルカ')) {opts.hero='ilLuca'; opts.className='魔法使い';}
  if(deckName.includes('デボラ')) {opts.hero='deborah'; opts.className='商人';}
  const g=setup(deckName, opts);
  if(!c) return {ok:false, error:'card missing', name};
  g.player.hand=[c.id];
  let threw=null, result=null;
  try{
    if(type==='ユニット'){
      T.selectHandCard(0);
      T.handleEmptySlotClick('player', firstEmpty('player'));
    }else{
      T.applyNonUnitEffect?.(0,c);
    }
    resolvePending();
    try{ T.applyDeathrattle && T.state.battle.game.player.board.forEach((u,i)=>{ if(u && Number(u.hp)<=0) T.applyDeathrattle(u,'player'); }); }catch(e){}
    result=invariant(`${deckName}:${name}`);
  }catch(e){ threw=String(e && (e.stack||e.message)||e); result=invariant(`${deckName}:${name}:exception`); }
  return {ok:!threw && result.ok, deckName, name, type, text, threw, invariant:result, hand:g.player.hand.map(id=>T.byId(id)?.name||id), log:T.getLog().slice(-8)};
}
function deathTarotHitTest(){
  const g=setup('ドラゴンタバサミネア',{hero:'tabasa',className:'占い師'});
  g.player.fortuneMode='hit'; g.player.hand=[card('死神のタロット').id];
  const before=T.boardSnapshot();
  T.applyNonUnitEffect(0, card('死神のタロット'));
  const labels=T.choiceLabels();
  T.clickChoiceByText('全てのユニット');
  resolvePending();
  const after=T.boardSnapshot(); const inv=invariant('deathTarotHit');
  const damaged=after.enemy.filter(Boolean).every((u,i)=>!before.enemy[i] || u.hp===before.enemy[i].hp-3 || u.name!==before.enemy[i].name);
  return {ok:damaged && inv.ok, labels, before, after, inv, log:T.getLog().slice(-10)};
}
function elevenKakurenbouTest(){
  const g=setup('イレブンテリー',{hero:'eleven',tension:0});
  g.player.deck=[card('スライム').id,card('ドラキー').id].filter(Boolean);
  const c=card('かくれんぼう'); g.player.hand=[c.id];
  T.selectHandCard(0); T.handleEmptySlotClick('player',0); resolvePending();
  const snap=T.boardSnapshot(); const inv=invariant('elevenKakurenbou');
  return {ok:inv.ok && g.player.hand.length>=1, snap, inv, log:T.getLog().slice(-12)};
}
function tabasaLv2DrawTest(){
  const g=setup('ドラゴンタバサミネア',{hero:'tabasa',className:'占い師'});
  const c=card('風の導き') || card('メラミ'); g.player.hand=[c.id]; g.player.deck=[card('スライム').id,card('ドラキー').id].filter(Boolean);
  const before=g.player.hand.length; T.applyNonUnitEffect(0,c); resolvePending();
  const after=g.player.hand.length; const inv=invariant('tabasaLv2Draw');
  return {ok:inv.ok && after>=before, before, after, card:c.name, inv, log:T.getLog().slice(-12)};
}
function doubleApplyGuardTest(name){
  const g=setup('double',{tension:3}); const c=card(name); if(!c) return {ok:false, missing:name};
  g.player.hand=[c.id]; const before={hand:g.player.hand.length, deck:g.player.deck.length, tension:g.player.tension, hp:g.player.hp};
  if(c.cardType==='ユニット'){ T.selectHandCard(0); T.handleEmptySlotClick('player',0); }
  else T.applyNonUnitEffect(0,c);
  resolvePending(); const mid=T.boardSnapshot(); const handAfter=g.player.hand.length;
  // Re-run remote-like death/turn hooks to catch obvious duplicate guard instability.
  try{ T.handleTurnEndEvent?.({side:'player'}); }catch(e){}
  const inv=invariant('doubleApply '+name);
  return {ok:inv.ok, before, handAfter, mid, inv, log:T.getLog().slice(-12)};
}
const results=[];
function add(name, fn){ try{ const r=fn(); results.push({name, ok:!!r.ok, detail:r}); }catch(e){ results.push({name, ok:false, error:String(e && (e.stack||e.message)||e)}); } }
add('reported: 死神のタロット 必中 全ユニット3ダメージ', deathTarotHitTest);
add('reported: イレブンLv2 + テンション0 + かくれんぼう', elevenKakurenbouTest);
add('reported: タバサLv2 元コスト2以上特技でドロー', tabasaLv2DrawTest);
for(const [deckName, arr] of Object.entries(decks)){
  const seen=[...new Set(arr.map(x=>x[0]))];
  for(const n of seen) add(`card-use: ${deckName} / ${n}`, ()=>playCardOnce(deckName,n));
}
for(const n of ['ぷちメタル','ベホイミスライム','ルドマン','かくれんぼう','死神のタロット','氷竜への祈り','ギガントドラゴン','福招きのそろばん']) add(`duplicate-guard: ${n}`, ()=>doubleApplyGuardTest(n));
return {version:T.state?.appReady && T.state?.allCards?.length, total:results.length, passed:results.filter(r=>r.ok).length, failed:results.filter(r=>!r.ok).length, results, exceptions:[]};
})()
'''

def main():
    proc=None
    try:
        proc,c,log=launch(build_inline_html())
        summary=c.eval(TEST_JS, timeout=240)
        exceptions=[]
        for e in c.events:
            if e.get('method')=='Runtime.exceptionThrown': exceptions.append(e.get('params',{}))
        summary['exceptions']=exceptions[:20]
        out=ROOT/'data'/'v290_four_deck_regression_tests.json'
        out.write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({k:summary[k] for k in ['total','passed','failed']}, ensure_ascii=False))
        if summary['failed']:
            print('\nFAILED:')
            for r in summary['results']:
                if not r.get('ok'):
                    print('-', r.get('name'), json.dumps(r.get('detail') or r.get('error'), ensure_ascii=False)[:800])
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        if proc:
            try: proc.terminate(); proc.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
