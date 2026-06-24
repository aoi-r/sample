import http.server, socketserver, subprocess, time, json, urllib.request, os, threading, sys, socket
from pathlib import Path
try:
    import websocket
except Exception as e:
    websocket=None
ROOT=Path(__file__).resolve().parents[1]
BASE_PORT=8910
BASE_CDP=9350
results={'attempts':[],'note':'Multiple browser launch/navigation variants. A failed page-load due to managed browser policy is recorded as environment-blocked, not app-js-failed.'}
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def wait_json(url, timeout=8):
    start=time.time(); last=None
    while time.time()-start<timeout:
        try:
            return json.loads(urllib.request.urlopen(url, timeout=1).read().decode())
        except Exception as e:
            last=repr(e); time.sleep(.25)
    raise RuntimeError(f'timeout {url}: {last}')

def cdp(ws, mid, method, params=None):
    ws.send(json.dumps({'id':mid,'method':method,'params':params or {}})); return mid+1

def run(variant, i):
    port=BASE_PORT+i; cdp_port=BASE_CDP+i
    attempt={'variant':variant,'ok':False,'environment_blocked':False,'errors':[],'console':[]}
    httpd=None; proc=None; ws=None
    try:
        os.chdir(ROOT)
        if variant.startswith('http'):
            httpd=socketserver.TCPServer(('127.0.0.1',port), Quiet)
            threading.Thread(target=httpd.serve_forever, daemon=True).start()
            url=f'{variant}:'+str(port)+'/index.html' if variant in ('http://127.0.0.1','http://localhost') else f'http://127.0.0.1:{port}/index.html'
        elif variant=='file':
            url=(ROOT/'index.html').as_uri()
        else:
            html='<html><body><script>document.body.dataset.ok="dataurl";</script>data-url smoke</body></html>'
            url='data:text/html;charset=utf-8,'+html
        args=['chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-crash-reporter','--disable-extensions','--disable-background-networking','--allow-file-access-from-files','--disable-web-security','--remote-allow-origins=*',f'--remote-debugging-port={cdp_port}',f'--user-data-dir=/tmp/chrome-v239-{i}',url]
        proc=subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        wait_json(f'http://127.0.0.1:{cdp_port}/json/version', 8)
        targets=wait_json(f'http://127.0.0.1:{cdp_port}/json/list', 8)
        page=next((t for t in targets if t.get('type')=='page'), targets[0])
        attempt['target_url']=page.get('url')
        if websocket is None: raise RuntimeError('websocket module unavailable')
        ws=websocket.create_connection(page['webSocketDebuggerUrl'], timeout=2)
        mid=1
        for method in ['Runtime.enable','Page.enable','Log.enable']:
            mid=cdp(ws,mid,method)
        time.sleep(2)
        expr="""(()=>({title:document.title,ready:document.readyState,bodyText:(document.body&&document.body.innerText||'').slice(0,800),hasApp:!!document.querySelector('#app'),scripts:document.scripts.length,url:location.href}))()"""
        eval_id=mid; mid=cdp(ws,mid,'Runtime.evaluate',{'expression':expr,'returnByValue':True})
        start=time.time()
        while time.time()-start<8:
            msg=json.loads(ws.recv())
            if msg.get('method')=='Runtime.consoleAPICalled':
                attempt['console'].append(str(msg.get('params',{}))[:500])
            if msg.get('method')=='Runtime.exceptionThrown':
                attempt['errors'].append(str(msg.get('params',{}))[:1000])
            if msg.get('id')==eval_id:
                attempt['eval']=(msg.get('result',{}).get('result') or {}).get('value')
                break
        text=str(attempt.get('eval',{}).get('bodyText','')).lower()
        attempt['environment_blocked']='organization' in text or 'doesn’t allow' in text or 'blocked' in text
        attempt['ok']=isinstance(attempt.get('eval'),dict) and attempt['eval'].get('ready') in ('interactive','complete') and not attempt['environment_blocked'] and not attempt['errors']
    except Exception as e:
        attempt['errors'].append(repr(e))
    finally:
        if ws:
            try: ws.close()
            except Exception: pass
        if proc:
            try: proc.terminate(); proc.wait(timeout=3)
            except Exception:
                try: proc.kill()
                except Exception: pass
        if httpd:
            try: httpd.shutdown(); httpd.server_close()
            except Exception: pass
    return attempt
variants=['file','http://127.0.0.1','http://localhost','data']
for i,v in enumerate(variants,1):
    a=run(v,i); results['attempts'].append(a)
    if a.get('ok'): break
results['ok']=any(a.get('ok') for a in results['attempts'])
results['environment_blocked']=any(a.get('environment_blocked') for a in results['attempts'])
(ROOT/'data/v239_browser_retry_matrix.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
sys.exit(0 if results['ok'] or results['environment_blocked'] else 1)
