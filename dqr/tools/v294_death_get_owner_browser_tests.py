import json, socket, subprocess, tempfile, time, urllib.request, shutil, os, sys
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]; APP_PORT=9394; CDP_PORT=9494
class CDP:
    def __init__(self, ws_url): self.ws=websocket.create_connection(ws_url,timeout=5,origin=f'http://127.0.0.1:{CDP_PORT}'); self.i=0
    def call(self,m,p=None,timeout=30):
        self.i+=1; msg={'id':self.i,'method':m};
        if p is not None: msg['params']=p
        self.ws.send(json.dumps(msg)); deadline=time.time()+timeout; old=self.ws.gettimeout(); self.ws.settimeout(.5)
        try:
            while time.time()<deadline:
                try: d=json.loads(self.ws.recv())
                except (socket.timeout, TimeoutError, websocket.WebSocketTimeoutException): continue
                if d.get('id')==self.i:
                    if 'error' in d: raise RuntimeError(d['error'])
                    return d.get('result',{})
        finally: self.ws.settimeout(old)
        raise TimeoutError(m)
    def eval(self,e,timeout=20):
        r=self.call('Runtime.evaluate',{'expression':e,'awaitPromise':True,'returnByValue':True,'userGesture':True},timeout)
        if 'exceptionDetails' in r: raise RuntimeError(json.dumps(r['exceptionDetails'],ensure_ascii=False)[:4000])
        return r.get('result',{}).get('value')
def wait_url(url, tries=100):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url,timeout=1) as r: return r.read()
        except Exception: time.sleep(.1)
    raise RuntimeError('not ready '+url)
def wait_json(url): return json.loads(wait_url(url).decode())
def main():
    server=subprocess.Popen([sys.executable,'-m','http.server',str(APP_PORT),'--bind','127.0.0.1'],cwd=str(ROOT),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    exe=shutil.which('chromium') or shutil.which('chromium-browser') or '/usr/bin/chromium'
    chrome=subprocess.Popen([exe,'--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={CDP_PORT}',f'--user-data-dir={tempfile.mkdtemp(prefix="dqr_v294_http_")}', '--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*',f'http://127.0.0.1:{APP_PORT}/index.html'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        wait_url(f'http://127.0.0.1:{APP_PORT}/index.html')
        pages=wait_json(f'http://127.0.0.1:{CDP_PORT}/json/list'); page=next(p for p in pages if p.get('type')=='page')
        c=CDP(page['webSocketDebuggerUrl']); c.call('Runtime.enable'); c.call('Page.enable')
        for _ in range(300):
            try:
                if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.v294 && !!window.__DQR_TEST__?.findCardByName("ベホイミスライム")',2): break
            except Exception: pass
            time.sleep(.1)
        else: raise RuntimeError('app not ready')
        cases=[
            ('player side Behoimi grants exactly one coin to owner','window.__DQR_TEST__.v294.simulateDeathGetV294("ベホイミスライム","player")',lambda v:v['playerCoinCount']==1 and v['enemyHandCount']==0),
            ('enemy side Behoimi increments enemy handCount once only','window.__DQR_TEST__.v294.simulateDeathGetV294("ベホイミスライム","enemy")',lambda v:v['playerCoinCount']==0 and v['enemyHandCount']==1 and not v['enemyExactHand']),
            ('player side Daiou Ika grants exactly two coins once','window.__DQR_TEST__.v294.simulateDeathGetV294("だいおうイカ","player")',lambda v:v['playerCoinCount']==2 and v['enemyHandCount']==0),
            ('enemy side Daiou Ika increments enemy handCount by two only','window.__DQR_TEST__.v294.simulateDeathGetV294("だいおうイカ","enemy")',lambda v:v['playerCoinCount']==0 and v['enemyHandCount']==2 and not v['enemyExactHand']),
        ]
        tests=[]
        for name,expr,pred in cases:
            val=c.eval(expr,20); tests.append({'name':name,'ok':bool(pred(val)),'value':val})
        out={'passed':sum(t['ok'] for t in tests),'failed':sum(not t['ok'] for t in tests),'tests':tests}
        (ROOT/'data/v294_death_get_owner_browser_tests.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(out,ensure_ascii=False,indent=2))
        return 0 if out['failed']==0 else 1
    finally:
        chrome.terminate(); server.terminate()
        try: chrome.wait(timeout=3)
        except Exception: chrome.kill()
        try: server.wait(timeout=3)
        except Exception: server.kill()
if __name__=='__main__': sys.exit(main())
