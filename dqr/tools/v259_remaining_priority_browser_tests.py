import json, subprocess, time, tempfile, urllib.request, socket, re, sys
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORT=9291
class CDP:
    def __init__(self, ws_url, port):
        self.ws=websocket.create_connection(ws_url, timeout=5, origin=f'http://127.0.0.1:{port}'); self.i=0; self.events=[]
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
    def eval(self, expr, timeout=20):
        res=self.call('Runtime.evaluate', {'expression':expr,'awaitPromise':True,'returnByValue':True,'userGesture':True}, timeout=timeout)
        if 'exceptionDetails' in res: raise RuntimeError(json.dumps(res['exceptionDetails'],ensure_ascii=False)[:5000])
        return res.get('result',{}).get('value')
def wait_json(url, tries=120):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=1) as r: return json.loads(r.read().decode())
        except Exception: time.sleep(0.1)
    raise RuntimeError('not ready '+url)
def build_inline_html():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<script type="module" src="\.\/js\/app\.js"><\/script>','',html)
    app=(ROOT/'js'/'app.js').read_text(encoding='utf-8')
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'PASTE_DISABLED_FOR_INLINE_V259_EMULATOR' };")
    names=['cards.json','systems.json','strategies.json','choices.json','coin.json','dungeons.json','fortune.json','heroes.json','exchanges.json','generated_cards.json','tension_system.json']
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
    profile=tempfile.mkdtemp(prefix='dqr_v259_chrome_'); log_path=tempfile.NamedTemporaryFile('w+',delete=False).name; log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={PORT}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'],stdout=log,stderr=log)
    ver=wait_json(f'http://127.0.0.1:{PORT}/json/version'); pages=wait_json(f'http://127.0.0.1:{PORT}/json/list'); page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], PORT); c.call('Runtime.enable'); c.call('Page.enable'); frame=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame,'html':html}, timeout=180)
    for _ in range(180):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.v259', timeout=2): return proc,c,ver,log_path
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError('app not ready')
def test(results,name,func):
    try:
        d=func(); ok=bool(d.get('ok') if isinstance(d,dict) and 'ok' in d else d); results.append({'name':name,'ok':ok,'detail':d})
    except Exception as e: results.append({'name':name,'ok':False,'error':str(e)})
def setup(c):
    c.eval("window.__DQR_TEST__.setupPvpTest('V259', true)", timeout=20)
def main():
    proc=None
    try:
        html=build_inline_html(); proc,c,ver,log=launch(html); results=[]
        test(results,'boot: v259 hook loaded', lambda:{'ok':c.eval('!!window.__DQR_TEST__.v259'), 'cards':c.eval('window.__DQR_TEST__.state.allCards.length')})
        setup(c)
        test(results,'トーマ王子: 虚無の剣で正面敵を封印し2ダメージ', lambda:c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; const card=T.state.allCards.find(x=>x.name==='トーマ王子'); const u=T.makeUnitFromCard(card); g.player.board[0]=u; T.setBoardByNames('enemy',['スライム']); const before=T.boardSnapshotV255(); T.v259.applyTohmaChoice(u,0); const after=T.boardSnapshotV255(); return {ok:after.enemy[0] && after.enemy[0].hp<=before.enemy[0].hp-2 && g.enemy.board[0].silenced===true, before, after, raw:g.enemy.board[0]}; })()
""", timeout=30))
        setup(c)
        test(results,'さんぞくのカシラ: 4種トークンを出す', lambda:c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.v259.summonBandits('player'); const names=g.player.board.filter(Boolean).map(u=>u.name).sort(); return {ok:['さんぞく','さんぞくマージ','さんぞく兵','エテポンゲ'].every(n=>names.includes(n)), names}; })()
""", timeout=30))
        setup(c)
        test(results,'不思議のダンジョン: 味方ユニットが出るたび耐久が進み、踏破でしあわせの箱を得る', lambda:c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; const d=T.v259.putByName('player','不思議のダンジョン'); g.player.hand=[]; for(let i=0;i<9;i++) T.v259.progressDungeon('player',1,'test'); const hand=g.player.hand.map(x=>x.name||x); return {ok:hand.includes('しあわせの箱'), hand, board:T.boardSnapshotV255().player}; })()
""", timeout=30))
        setup(c)
        test(results,'しあわせの箱: 味方ユニットへ+1/+1オーラ', lambda:c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.v259.putByName('player','しあわせの箱'); const sl=T.v259.putByName('player','スライム'); T.v259.applyShiawaseBoxAura('player'); return {ok:sl.attack>=2 && sl.hp>=2, sl, snap:T.boardSnapshotV255()}; })()
""", timeout=30))
        setup(c)
        test(results,'二刀の心得・壱: 2ダメージ後、二刀の心得・弐を手札に加える', lambda:c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('enemy',['スライム']); g.player.hand=[]; T.v259.useCard(T.state.allCards.find(x=>x.name==='二刀の心得・壱'),2); T.v259.applyPending({side:'enemy',pos:0,unit:g.enemy.board[0]}); const hand=g.player.hand.map(x=>x.name||T.findCardByName(x)?.name); return {ok:g.enemy.board[0].hp<=0 && hand.includes('二刀の心得・弐'), hand, enemy:g.enemy.board[0]}; })()
""", timeout=30))
        setup(c)
        test(results,'竜の胎動: ドラゴン系ユニット2枚を手札に加える', lambda:c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; g.player.hand=[]; T.v259.useCard(T.state.allCards.find(x=>x.name==='竜の胎動'),2); const hand=g.player.hand.map(x=>x.name||x); return {ok:hand.length===2, hand}; })()
""", timeout=30))
        setup(c)
        test(results,'メタルのそろばん: 自分ターン中3以下のリーダーダメージを1にする', lambda:c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; g.isMyTurn=true; g.player.weapon={name:'メタルのそろばん',attack:1,hp:2}; const before=g.player.hp; T.dealDamageToLeader('player',3,'test'); return {ok:g.player.hp===before-1, before, after:g.player.hp}; })()
""", timeout=30))
        setup(c)
        test(results,'心眼一閃/ヘルクラッシャー: デッキ外から手札追加した数だけコスト低下', lambda:c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.v259.addGeneratedCard('player','コイン'); T.v259.addGeneratedCard('player','コイン'); const c=T.state.allCards.find(x=>x.name==='心眼一閃'); const base=c.cost; const cost=T.getEffectiveCost ? T.getEffectiveCost(c) : 999; return {ok:cost<=base-2, base, cost, counter:g.player.nonDeckCardsAddedToHandV259}; })()
""", timeout=30))
        setup(c)
        test(results,'デスストーカー: 自ターン中の味方被ダメでランダム敵へ2ダメージ', lambda:c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; g.isMyTurn=true; T.setBoardByNames('player',['デスストーカー','スライム']); T.setBoardByNames('enemy',['ドラキー']); const before=T.boardSnapshotV255(); T.dealDamageToUnit(g.player.board[1],1,'test','player'); const after=T.boardSnapshotV255(); return {ok:after.enemyHp<before.enemyHp || !after.enemy[0] || after.enemy[0].hp<before.enemy[0].hp, before, after}; })()
""", timeout=30))
        setup(c)
        test(results,'メタルキングの剣: 自分ターン中5以下のリーダーダメージを1にする', lambda:c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; g.isMyTurn=true; g.player.weapon={name:'メタルキングの剣',attack:4,hp:3}; const before=g.player.hp; T.dealDamageToLeader('player',5,'test'); return {ok:g.player.hp===before-1, before, after:g.player.hp}; })()
""", timeout=30))
        exceptions=[e.get('params',{}) for e in c.events if e.get('method')=='Runtime.exceptionThrown']
        summary={'mode':'v259 remaining priority browser/emulator tests','browser':ver.get('Browser'),'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'exceptions':exceptions[:10],'chromeLog':log}
        (ROOT/'data'/'v259_remaining_priority_browser_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2), encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        if proc:
            try: proc.terminate(); proc.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
