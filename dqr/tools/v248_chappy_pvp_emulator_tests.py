import json, os, subprocess, time, tempfile, urllib.request, sys, socket, re
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORTS=[9248,9249]
class CDP:
    def __init__(self, ws_url, port):
        self.port=port
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
        if 'exceptionDetails' in res: raise RuntimeError(json.dumps(res['exceptionDetails'],ensure_ascii=False)[:5000])
        return res.get('result',{}).get('value')

def wait_json(url, tries=120):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=1) as r: return json.loads(r.read().decode())
        except Exception: time.sleep(0.1)
    raise RuntimeError('not ready '+url)

def build_inline_html():
    html=(ROOT/'index.html').read_text()
    html=re.sub(r'<script type="module" src="\.\/js\/app\.js"><\/script>','',html)
    app=(ROOT/'js'/'app.js').read_text()
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'PASTE_DISABLED_FOR_INLINE_PVP_EMULATOR' };")
    names=['cards.json','systems.json','strategies.json','choices.json','coin.json','dungeons.json','fortune.json','heroes.json','exchanges.json','generated_cards.json','tension_system.json']
    data={}
    for n in names:
        data[f'./data/{n}']=json.loads((ROOT/'data'/n).read_text())
        data[f'data/{n}']=data[f'./data/{n}']
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
    inline = boot + '<script type="module">\n' + app + '\n</script>'
    return html.replace('</body>', inline+'</body>')

def launch(port, html):
    profile=tempfile.mkdtemp(prefix=f'dqr_v248_chrome_{port}_')
    log_path=tempfile.NamedTemporaryFile('w+',delete=False).name
    log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={port}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'],stdout=log,stderr=log)
    version=wait_json(f'http://127.0.0.1:{port}/json/version')
    pages=wait_json(f'http://127.0.0.1:{port}/json/list')
    page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], port)
    c.call('Runtime.enable'); c.call('Page.enable')
    frame_id=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame_id,'html':html}, timeout=180)
    for _ in range(160):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady', timeout=2):
                return proc,c,version,log_path
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError('app not ready')

def js(obj): return json.dumps(obj, ensure_ascii=False)

def bridge(src, dst, label, results):
    q=src.eval('window.__DQR_TEST__.drainOutbox()', timeout=10) or []
    for idx,a in enumerate(q):
        dst.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js(label+'_'+str(idx))})", timeout=20)
    results.append({'name':f'bridge {label}', 'ok':True, 'count':len(q), 'types':[a.get('type') for a in q]})
    return q

def test(results, name, func):
    try:
        detail=func()
        ok=bool(detail.get('ok') if isinstance(detail,dict) and 'ok' in detail else detail)
        results.append({'name':name,'ok':ok,'detail':detail})
    except Exception as e:
        results.append({'name':name,'ok':False,'error':str(e)})

def setup_pair(A,B, turnA=True):
    A.eval(f"window.__DQR_TEST__.setupPvpTest('A', {str(turnA).lower()})", timeout=20)
    B.eval(f"window.__DQR_TEST__.setupPvpTest('B', {str((not turnA)).lower()})", timeout=20)

def main():
    html=build_inline_html()
    procs=[]; clients=[]; log_paths=[]; versions=[]
    try:
        for port in PORTS:
            proc,c,ver,log=launch(port, html)
            procs.append(proc); clients.append(c); versions.append(ver.get('Browser')); log_paths.append(log)
        A,B=clients
        results=[]
        test(results,'two clients booted with test hook', lambda:{'ok': A.eval('!!window.__DQR_TEST__') and B.eval('!!window.__DQR_TEST__'), 'cardsA':A.eval('window.__DQR_TEST__.state.allCards.length'), 'cardsB':B.eval('window.__DQR_TEST__.state.allCards.length')})
        # Locked client cannot act.
        setup_pair(A,B,turnA=False)
        A.eval("window.__DQR_TEST__.setPlayerHandByNames(['あらくれチャッピー'])")
        test(results,'チャッピー: 非ターン側は召喚できない', lambda: (A.eval("(()=>{window.__DQR_TEST__.selectHandCard(0); window.__DQR_TEST__.handleEmptySlotClick('player',1); return {ok:!window.__DQR_TEST__.boardSnapshot().player.some(x=>x&&x.name==='あらくれチャッピー') && window.__DQR_TEST__.drainOutbox().length===0, snap:window.__DQR_TEST__.boardSnapshot()};})()", timeout=20)))
        # Enemy target test: A summons Chappy and targets B/player-side Shield Ogre mirrored as enemy.
        setup_pair(A,B,turnA=True)
        A.eval("window.__DQR_TEST__.setPlayerHandByNames(['あらくれチャッピー']); window.__DQR_TEST__.setBoardByNames('enemy',['シールドオーガ']);")
        B.eval("window.__DQR_TEST__.setBoardByNames('player',['シールドオーガ']);")
        A.eval("window.__DQR_TEST__.selectHandCard(0); window.__DQR_TEST__.handleEmptySlotClick('player',1);", timeout=20)
        q1=bridge(A,B,'summon_enemy_target_prechoice',results)
        labels=A.eval("window.__DQR_TEST__.choiceLabels()", timeout=10)
        test(results,'チャッピー: 対象モーダルはユニットのみ/リーダーなし', lambda:{'ok': any('敵1:シールドオーガ' in x for x in labels) and not any('リーダー' in x for x in labels), 'labels':labels})
        A.eval("window.__DQR_TEST__.clickChoiceByText('敵1:シールドオーガ')", timeout=20)
        q2=bridge(A,B,'summon_enemy_target_afterchoice',results)
        snapA=A.eval('window.__DQR_TEST__.boardSnapshot()', timeout=10)
        snapB=B.eval('window.__DQR_TEST__.boardSnapshot()', timeout=10)
        test(results,'チャッピー: 敵ユニットへ2ダメージが双方で1回だけ反映', lambda:{'ok': snapA['enemy'][0]['hp']==2 and snapB['player'][0]['hp']==2 and snapA['player'][1]['name']=='あらくれチャッピー' and snapB['enemy'][1]['name']=='あらくれチャッピー', 'A':snapA, 'B':snapB, 'actions':q1+q2})
        # Friendly target test: A targets own Shield Ogre; B sees enemy Shield Ogre damaged.
        setup_pair(A,B,turnA=True)
        A.eval("window.__DQR_TEST__.setPlayerHandByNames(['あらくれチャッピー']); window.__DQR_TEST__.setBoardByNames('player',['シールドオーガ']);")
        B.eval("window.__DQR_TEST__.setBoardByNames('enemy',['シールドオーガ']);")
        A.eval("window.__DQR_TEST__.selectHandCard(0); window.__DQR_TEST__.handleEmptySlotClick('player',1);", timeout=20)
        bridge(A,B,'summon_friendly_target_prechoice',results)
        labels2=A.eval("window.__DQR_TEST__.choiceLabels()", timeout=10)
        test(results,'チャッピー: 味方ユニットも対象にできる', lambda:{'ok': any('味方1:シールドオーガ' in x for x in labels2), 'labels':labels2})
        A.eval("window.__DQR_TEST__.clickChoiceByText('味方1:シールドオーガ')", timeout=20)
        bridge(A,B,'summon_friendly_target_afterchoice',results)
        snapA2=A.eval('window.__DQR_TEST__.boardSnapshot()', timeout=10)
        snapB2=B.eval('window.__DQR_TEST__.boardSnapshot()', timeout=10)
        test(results,'チャッピー: 味方対象ダメージも相手画面へ正しくミラー', lambda:{'ok': snapA2['player'][0]['hp']==2 and snapB2['enemy'][0]['hp']==2, 'A':snapA2, 'B':snapB2})
        # Death/removal test using Slime hp1: damage should kill and mirror removal.
        setup_pair(A,B,turnA=True)
        A.eval("window.__DQR_TEST__.setPlayerHandByNames(['あらくれチャッピー']); window.__DQR_TEST__.setBoardByNames('enemy',['スライム']);")
        B.eval("window.__DQR_TEST__.setBoardByNames('player',['スライム']);")
        A.eval("window.__DQR_TEST__.selectHandCard(0); window.__DQR_TEST__.handleEmptySlotClick('player',1);", timeout=20)
        bridge(A,B,'summon_enemy_death_prechoice',results)
        A.eval("window.__DQR_TEST__.clickChoiceByText('敵1:スライム')", timeout=20)
        bridge(A,B,'summon_enemy_death_afterchoice',results)
        snapA3=A.eval('window.__DQR_TEST__.boardSnapshot()', timeout=10)
        snapB3=B.eval('window.__DQR_TEST__.boardSnapshot()', timeout=10)
        test(results,'チャッピー: 対象死亡時も双方で盤面から消える', lambda:{'ok': snapA3['enemy'][0] is None and snapB3['player'][0] is None, 'A':snapA3, 'B':snapB3})
        # Put into play should not trigger summon modal/effect.
        setup_pair(A,B,turnA=True)
        A.eval("window.__DQR_TEST__.setBoardByNames('enemy',['シールドオーガ']);")
        test(results,'チャッピー: 場に出すでは召喚時モーダル/ダメージは出ない', lambda: A.eval("(()=>{const T=window.__DQR_TEST__; const c=T.findCardByName('あらくれチャッピー'); T.putUnitIntoPlayFromCard(c,1,'player'); const labels=T.choiceLabels(); const q=T.drainOutbox(); const s=T.boardSnapshot(); return {ok:s.enemy[0].hp===4 && !labels.some(x=>x.includes('あらくれチャッピー')) && q.some(a=>a.type==='unitPutIntoPlay') && !q.some(a=>a.type==='damageApplied'), labels, actions:q.map(a=>a.type), snap:s};})()", timeout=20))
        exceptions=[]
        for c in clients:
            for e in c.events:
                if e.get('method')=='Runtime.exceptionThrown': exceptions.append(e.get('params',{}))
        summary={'mode':'two isolated Chromium clients + action bridge','browsers':versions,'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'exceptions':exceptions[:10],'chromeLogs':log_paths}
        out=ROOT/'data'/'v248_chappy_pvp_emulator_tests.json'; out.write_text(json.dumps(summary,ensure_ascii=False,indent=2))
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 else 1
    finally:
        for p in procs:
            try: p.terminate(); p.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
