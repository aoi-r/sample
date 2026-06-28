import json, re, socket, subprocess, tempfile, time, urllib.request, shutil, os, sys
from pathlib import Path
import websocket
ROOT = Path(__file__).resolve().parents[1]
PORT = 9294
class CDP:
    def __init__(self, ws_url):
        self.ws=websocket.create_connection(ws_url, timeout=5, origin=f'http://127.0.0.1:{PORT}')
        self.i=0
    def call(self, method, params=None, timeout=30):
        self.i+=1; msg={'id':self.i,'method':method}
        if params is not None: msg['params']=params
        self.ws.send(json.dumps(msg)); deadline=time.time()+timeout; old=self.ws.gettimeout(); self.ws.settimeout(.5)
        try:
            while time.time()<deadline:
                try: data=json.loads(self.ws.recv())
                except (socket.timeout, TimeoutError, websocket.WebSocketTimeoutException): continue
                if data.get('id')==self.i:
                    if 'error' in data: raise RuntimeError(data['error'])
                    return data.get('result',{})
        finally: self.ws.settimeout(old)
        raise TimeoutError(method)
    def eval(self, expr, timeout=20):
        res=self.call('Runtime.evaluate', {'expression':expr,'awaitPromise':True,'returnByValue':True,'userGesture':True}, timeout)
        if 'exceptionDetails' in res: raise RuntimeError(json.dumps(res['exceptionDetails'], ensure_ascii=False)[:4000])
        return res.get('result',{}).get('value')

def wait_json(url):
    for _ in range(160):
        try:
            with urllib.request.urlopen(url, timeout=1) as r: return json.loads(r.read().decode())
        except Exception: time.sleep(.1)
    raise RuntimeError('not ready')

def html_inline():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<script\s+type="module"\s+src="\.\/js\/app\.js(?:\?v=[^"]+)?"\s*><\/script>', '', html)
    app=(ROOT/'js/app.js').read_text(encoding='utf-8').replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig={apiKey:'TEST'};")
    data={}
    names=['cards.json','systems.json','strategies.json','choices.json','coin.json','dungeons.json','fortune.json','heroes.json','exchanges.json','generated_cards.json','tension_system.json','hero_skill_cards.json']
    for name in names:
        p=ROOT/'data'/name
        if p.exists():
            try:
                obj=json.loads(p.read_text(encoding='utf-8'))
                data[f'./data/{p.name}']=obj; data[f'data/{p.name}']=obj
            except Exception: pass
    boot=f"""<script>
window.__DQR_INLINE_DATA__={json.dumps(data, ensure_ascii=False, separators=(',',':'))};
const __nativeFetch=window.fetch.bind(window);
window.fetch=async function(url,opts){{
 let key=String(url||'').split('?')[0].replace(/^https?:\\/\\/[^/]+\\//,'./');
 if(!key.startsWith('./') && key.startsWith('data/')) key='./'+key;
 if(window.__DQR_INLINE_DATA__[key]) return new Response(JSON.stringify(window.__DQR_INLINE_DATA__[key]), {{status:200,headers:{{'Content-Type':'application/json'}}}});
 return __nativeFetch(url,opts);
}};
</script>"""
    return html.replace('</body>', boot+'<script type="module">\n'+app+'\n</script></body>')

def main():
    exe=shutil.which('chromium') or shutil.which('chromium-browser') or '/usr/bin/chromium'
    proc=subprocess.Popen([exe,'--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={PORT}',f'--user-data-dir={tempfile.mkdtemp(prefix="dqr_v294_")}', '--remote-allow-origins=*','about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        page=wait_json(f'http://127.0.0.1:{PORT}/json/list')[0]
        c=CDP(page['webSocketDebuggerUrl']); c.call('Runtime.enable'); c.call('Page.enable')
        frame=c.call('Page.getFrameTree')['frameTree']['frame']['id']
        c.call('Page.setDocumentContent', {'frameId':frame, 'html':html_inline()}, timeout=180)
        for _ in range(260):
            try:
                if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.v294 && !!window.__DQR_TEST__?.findCardByName("ベホイミスライム")',2): break
            except Exception: pass
            time.sleep(.1)
        tests=[]
        def chk(name, expr, pred):
            val=c.eval(expr, timeout=20); ok=bool(pred(val)); tests.append({'name':name,'ok':ok,'value':val}); return ok
        chk('player side Behoimi grants exactly one coin to owner', 'window.__DQR_TEST__.v294.simulateDeathGetV294("ベホイミスライム","player")', lambda v: v['playerCoinCount']==1 and v['enemyHandCount']==0)
        chk('enemy side Behoimi does not add coin to local player and increments enemy handCount once', 'window.__DQR_TEST__.v294.simulateDeathGetV294("ベホイミスライム","enemy")', lambda v: v['playerCoinCount']==0 and v['enemyHandCount']==1 and not v['enemyExactHand'])
        chk('player side Daiou Ika grants exactly two coins once despite double path', 'window.__DQR_TEST__.v294.simulateDeathGetV294("だいおうイカ","player")', lambda v: v['playerCoinCount']==2 and v['enemyHandCount']==0)
        chk('enemy side Daiou Ika only increments enemy handCount by two', 'window.__DQR_TEST__.v294.simulateDeathGetV294("だいおうイカ","enemy")', lambda v: v['playerCoinCount']==0 and v['enemyHandCount']==2 and not v['enemyExactHand'])
        out={'passed':sum(1 for t in tests if t['ok']),'failed':sum(1 for t in tests if not t['ok']),'tests':tests}
        (ROOT/'data/v294_death_get_owner_tests.json').write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
        if out['failed']:
            print(json.dumps(out, ensure_ascii=False, indent=2)); return 1
        print(json.dumps(out, ensure_ascii=False, indent=2)); return 0
    finally:
        proc.terminate()
        try: proc.wait(timeout=3)
        except Exception: proc.kill()
if __name__=='__main__': sys.exit(main())
