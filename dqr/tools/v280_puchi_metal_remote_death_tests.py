import json, re, subprocess, tempfile, time, urllib.request, socket, sys
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORT=9280
class CDP:
    def __init__(self, ws_url, port):
        self.ws=websocket.create_connection(ws_url, timeout=5, origin=f'http://127.0.0.1:{port}')
        self.i=0; self.events=[]
    def call(self, method, params=None, timeout=30):
        self.i+=1; msg={'id':self.i,'method':method}
        if params is not None: msg['params']=params
        self.ws.send(json.dumps(msg)); deadline=time.time()+timeout
        old=self.ws.gettimeout(); self.ws.settimeout(0.5)
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
        if 'exceptionDetails' in res: raise RuntimeError(json.dumps(res['exceptionDetails'],ensure_ascii=False)[:4000])
        return res.get('result',{}).get('value')

def wait_json(url, tries=120):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=1) as r: return json.loads(r.read().decode())
        except Exception: time.sleep(0.1)
    raise RuntimeError('not ready '+url)

def build_inline_html():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<script type="module" src="\.\/js\/app\.js[^\"]*"><\/script>','',html)
    app=(ROOT/'js/app.js').read_text(encoding='utf-8')
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'DISABLED_INLINE_TEST' };")
    names=['cards.json','systems.json','strategies.json','choices.json','coin.json','dungeons.json','fortune.json','heroes.json','exchanges.json','generated_cards.json','tension_system.json']
    data={}
    for n in names:
        if (ROOT/'data'/n).exists():
            data[f'./data/{n}']=json.loads((ROOT/'data'/n).read_text(encoding='utf-8'))
            data[f'data/{n}']=data[f'./data/{n}']
    boot="""
<script>
window.__DQR_INLINE_DATA__ = __DATA__;
const __nativeFetch = window.fetch.bind(window);
window.fetch = async function(url, opts){
  const raw = String(url || '');
  let key = raw.split('?')[0].replace(/^https?:\/\/[^/]+\//, './');
  if(!key.startsWith('./') && key.startsWith('data/')) key = './' + key;
  if(window.__DQR_INLINE_DATA__[key]) return new Response(JSON.stringify(window.__DQR_INLINE_DATA__[key]), {status:200, headers:{'Content-Type':'application/json'}});
  return __nativeFetch(url, opts);
};
</script>
""".replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',',':')))
    return html.replace('</body>', boot + '<script type="module">\n' + app + '\n</script></body>')

def launch():
    profile=tempfile.mkdtemp(prefix='dqr_v280_chrome_')
    log_path=tempfile.NamedTemporaryFile('w+',delete=False).name
    log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={PORT}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'], stdout=log, stderr=log)
    version=wait_json(f'http://127.0.0.1:{PORT}/json/version')
    pages=wait_json(f'http://127.0.0.1:{PORT}/json/list')
    page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], PORT)
    c.call('Runtime.enable'); c.call('Page.enable')
    frame_id=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame_id,'html':build_inline_html()}, timeout=180)
    for _ in range(200):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady', timeout=2): return proc,c,version.get('Browser'),log_path
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError('app not ready '+log_path)

def main():
    proc=None; results=[]
    def add(name, ok, detail=None): results.append({'name':name,'passed':bool(ok),'detail':detail})
    try:
        proc,c,browser,log_path=launch()
        add('boot with v280 test hook', c.eval("window.__DQR_TEST__?.v280?.version === 'v280_puchi_metal_turnstart_remote_death_fix'"))
        # ぷちメタル: endTurn should only add coin; normal draw waits until next own turn.
        r=c.eval("""
(()=>{
 const T=window.__DQR_TEST__, S=T.state;
 T.setupPvpTest('P1', true);
 const g=S.battle.game;
 const puchi=T.findCardByName('ぷちメタル');
 const slime=T.findCardByName('スライム');
 g.player.board[0]=T.makeUnitFromCard(puchi);
 g.player.hand=[]; g.player.deck=[slime.id]; g.player.mp=10; g.player.maxMp=10; g.isMyTurn=true; S.battle.matchLocked=false;
 T.endTurn();
 const afterEnd={hand:g.player.hand.map(id=>T.byId(id)?.name), deck:g.player.deck.map(id=>T.byId(id)?.name), turn:g.turn, mp:g.player.mp, isMyTurn:g.isMyTurn};
 const prepared=T.prepareOwnTurnStartV280('testReturn');
 const afterStart={hand:g.player.hand.map(id=>T.byId(id)?.name), deck:g.player.deck.map(id=>T.byId(id)?.name), turn:g.turn, mp:g.player.mp, prepared};
 return {ok: afterEnd.hand.length===1 && afterEnd.hand[0]==='コイン' && afterEnd.deck[0]==='スライム' && afterStart.hand.length===2 && afterStart.hand[0]==='コイン' && afterStart.hand[1]==='スライム' && afterStart.deck.length===0, afterEnd, afterStart, log:g.log.slice(-8)};
})()
""", timeout=30)
        add('ぷちメタル endTurn GET only / draw waits for own turn start', r.get('ok'), r)
        # ぷちメタル once-only GET: second end turn same unit should not add another coin.
        r2=c.eval("""
(()=>{
 const T=window.__DQR_TEST__, S=T.state;
 T.setupPvpTest('P1', true);
 const g=S.battle.game;
 const puchi=T.findCardByName('ぷちメタル');
 g.player.board[0]=T.makeUnitFromCard(puchi); g.player.hand=[]; g.player.deck=[]; g.isMyTurn=true; S.battle.matchLocked=false;
 T.endTurn(); const h1=g.player.hand.map(id=>T.byId(id)?.name);
 g.isMyTurn=true; S.battle.matchLocked=false;
 T.endTurn(); const h2=g.player.hand.map(id=>T.byId(id)?.name);
 return {ok:h1.length===1 && h2.length===1 && h2[0]==='コイン', h1,h2, unit:g.player.board[0]};
})()
""", timeout=30)
        add('ぷちメタル GET once only across turns', r2.get('ok'), r2)
        # Remote damage cleanup: Puchi Fighter hp0 must disappear on defender-side screen even if unitDeath action is missed/delayed.
        r3=c.eval("""
(()=>{
 const T=window.__DQR_TEST__, S=T.state;
 T.setupPvpTest('B', false);
 const g=S.battle.game;
 const pf=T.findCardByName('プチファイター');
 g.player.board[0]=T.makeUnitFromCard(pf);
 g.player.board[0].hp=2; g.player.board[0].maxHp=2;
 T.applyRemoteReducer({type:'damageApplied', payload:{targetRef:{side:'enemy',pos:0}, amount:2, actual:2, source:'remote attack'}});
 return {ok:g.player.board[0]===null, board:T.boardSnapshotV255 ? T.boardSnapshotV255().player : T.boardSnapshot().player, log:g.log.slice(-6)};
})()
""", timeout=30)
        add('remote damage cleanup removes HP0 プチファイター', r3.get('ok'), r3)
        # Selection auto cancel disabled: static/runtime source should not contain old 12s auto解除 message active.
        r4=c.eval("""
(()=>{
 const hasText = [...document.scripts].some(s=>String(s.textContent||'').includes('選択待ちが長すぎるため自動解除しました'));
 return {ok: !hasText, hasText};
})()
""", timeout=10)
        add('v270 12秒自動選択解除 is disabled', r4.get('ok'), r4)
        exceptions=[e.get('params',{}) for e in c.events if e.get('method')=='Runtime.exceptionThrown']
        summary={'browser':browser,'passed':sum(1 for x in results if x['passed']),'failed':sum(1 for x in results if not x['passed']),'results':results,'exceptions':exceptions[:5],'chromeLog':log_path}
        (ROOT/'data/v280_puchi_metal_remote_death_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        if proc:
            try: proc.terminate(); proc.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
