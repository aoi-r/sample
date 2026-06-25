import json, os, subprocess, time, tempfile, urllib.request, sys, socket, re
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORTS=[9266,9267]
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
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'PASTE_DISABLED_FOR_INLINE_V256_EMULATOR' };")
    names=['cards.json','systems.json','strategies.json','choices.json','coin.json','dungeons.json','fortune.json','heroes.json','exchanges.json','generated_cards.json','tension_system.json']
    data={}
    for n in names:
        data[f'./data/{n}']=json.loads((ROOT/'data'/n).read_text(encoding='utf-8'))
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

def launch(port, html):
    profile=tempfile.mkdtemp(prefix=f'dqr_v256_chrome_{port}_')
    log_path=tempfile.NamedTemporaryFile('w+',delete=False).name
    log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={port}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'],stdout=log,stderr=log)
    version=wait_json(f'http://127.0.0.1:{port}/json/version')
    pages=wait_json(f'http://127.0.0.1:{port}/json/list')
    page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], port); c.call('Runtime.enable'); c.call('Page.enable')
    frame_id=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame_id,'html':html}, timeout=180)
    for _ in range(180):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.boardSnapshotV256', timeout=2): return proc,c,version,log_path
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError('app not ready')

def js(x): return json.dumps(x, ensure_ascii=False)
def test(results,name,func):
    try:
        d=func(); ok=bool(d.get('ok') if isinstance(d,dict) and 'ok' in d else d); results.append({'name':name,'ok':ok,'detail':d})
    except Exception as e: results.append({'name':name,'ok':False,'error':str(e)})
def setup(c, pid='A', turn=True): c.eval(f"window.__DQR_TEST__.setupPvpTest({js(pid)}, {str(turn).lower()})", timeout=20)
def bridge(src,dst,label='bridge'):
    actions=src.eval('window.__DQR_TEST__.drainOutbox()', timeout=10) or []
    for i,a in enumerate(actions): dst.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js(label+'_'+str(i))})", timeout=20)
    return actions

def main():
    html=build_inline_html(); procs=[]; clients=[]; versions=[]; logs=[]
    try:
        for p in PORTS:
            proc,c,ver,log=launch(p,html); procs.append(proc); clients.append(c); versions.append(ver.get('Browser')); logs.append(log)
        A,B=clients; results=[]
        test(results,'boot: v256 hooks loaded', lambda:{'ok': A.eval('!!window.__DQR_TEST__.boardSnapshotV256') and B.eval('!!window.__DQR_TEST__.boardSnapshotV256'), 'cards':A.eval('window.__DQR_TEST__.state.allCards.length')})

        setup(A,'A',True)
        move=A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game;
  T.setBoardByNames('enemy',[null,null,null,null,'ドラキー',null]);
  const before=T.boardSnapshotV256();
  T.applyCardUseV166(T.state.allCards.find(c=>c.name==='モリーもりもり'),2);
  const after=T.boardSnapshotV256();
  return {before, after, log:T.getLog().slice(-8)};
})()
""", timeout=30)
        test(results,'マイユ移動カウント: 自分が発動した移動効果で移動回数が永続加算される', lambda:{'ok': move['after']['maiyuMoveCount']>=1 and move['after']['maiyuMoveBonus']>=1, 'detail':move})

        maiyu=A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game;
  const bonus=T.boardSnapshotV256().maiyuMoveCount;
  T.setBoardByNames('enemy',['シールドオーガ']);
  const c=T.state.allCards.find(x=>x.name==='マイユ');
  const u=T.makeUnitFromCard(c); T.applyPriorityQueueSummonEffectsV250(u,c);
  return {bonus, snap:T.boardSnapshotV256(), log:T.getLog().slice(-10)};
})()
""", timeout=30)
        test(results,'マイユ召喚時: 移動カウント分だけランダム割り振りダメージが増える', lambda:{'ok': maiyu['bonus']>=1 and maiyu['snap']['enemyHp'] <= 25 and (maiyu['snap']['enemy'][0] is None or maiyu['snap']['enemy'][0]['hp'] <= 4), 'detail':maiyu})

        setup(A,'A',True)
        slime=A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game;
  T.applyCardUseV166(T.state.allCards.find(c=>c.name==='スライムフィーバー'),0);
  const before=T.boardSnapshotV256();
  T.v254AddCardToSideHandByName('player','イオナズン','テスト追加');
  g.player.deck=[T.findCardByName('メラ').id, T.findCardByName('スライム').id];
  T.drawCard(2);
  const after=T.boardSnapshotV256();
  return {before, after, hand:after.hand, costs:after.handCosts, log:T.getLog().slice(-10)};
})()
""", timeout=30)
        def slime_ok():
            hand=slime['hand']
            # イオナズン and メラ should not remain; both incoming spells should be replaced by slime units. The existing slime unit draw stays.
            return {'ok': 'イオナズン' not in hand and 'メラ' not in hand and len(hand)>=3 and slime['after']['slimePoolSize']>10, 'detail':slime}
        test(results,'スライムフィーバー: 手札に入る特技を破棄し、全スライム系プールからランダムなユニットへ入れ替える', slime_ok)

        setup(A,'A',True); setup(B,'B',False)
        A.eval("""
(()=>{ const T=window.__DQR_TEST__;
  T.setBoardByNames('player',['スライム',null,null,'ドラキー']);
  T.setBoardByNames('enemy',['シールドオーガ',null,null,'メラゴースト']);
  T.applyCardUseV166(T.state.allCards.find(c=>c.name==='無鉄砲な作戦'),2);
})()
""", timeout=30)
        actions=bridge(A,B,'move_board')
        remote=B.eval('window.__DQR_TEST__.boardSnapshotV256()', timeout=20)
        test(results,'無鉄砲な作戦: 盤面移動がaction replayで相手クライアントにも同期される', lambda:{'ok': any(a.get('type')=='unitMovedBoardV256' for a in actions) and sum(1 for x in remote['enemy'] if x)==2 and sum(1 for x in remote['player'] if x)==2, 'actions':[a.get('type') for a in actions], 'remote':remote})

        exceptions=[]
        for c in clients:
            for e in c.events:
                if e.get('method')=='Runtime.exceptionThrown': exceptions.append(e.get('params',{}))
        summary={'mode':'v256 Maiyu move counter + Slime Fever replacement + PvP movement sync','browsers':versions,'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'exceptions':exceptions[:10],'chromeLogs':logs}
        (ROOT/'data'/'v256_maiyu_slimefever_pvp_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2), encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        for p in procs:
            try: p.terminate(); p.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
