import http.server, socketserver, subprocess, time, json, urllib.request, os, threading, sys
import websocket
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE_PORT=8898
BASE_CDP=9338
results={'attempts':[]}
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass

def get_json(url, timeout=1):
    return json.loads(urllib.request.urlopen(url, timeout=timeout).read().decode())

def wait_json(url, timeout=10):
    start=time.time(); last=None
    while time.time()-start<timeout:
        try: return get_json(url)
        except Exception as e: last=e; time.sleep(.25)
    raise RuntimeError(f'timeout waiting {url}: {last}')

def cdp(ws, mid, method, params=None):
    ws.send(json.dumps({'id':mid,'method':method,'params':params or {}}))

def run_attempt(i, budget=20):
    port=BASE_PORT+i; cdp_port=BASE_CDP+i
    attempt={'attempt':i,'ok':False,'console':[],'errors':[]}
    httpd=proc=ws=None
    try:
        os.chdir(ROOT)
        httpd=socketserver.TCPServer(('127.0.0.1',port), Quiet)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        url=(ROOT/'index.html').as_uri()
        proc=subprocess.Popen(['chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-crash-reporter','--disable-extensions','--disable-background-networking','--allow-file-access-from-files','--disable-web-security','--remote-allow-origins=*',f'--remote-debugging-port={cdp_port}',f'--user-data-dir=/tmp/chrome-v238-{i}',url], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        wait_json(f'http://127.0.0.1:{cdp_port}/json/version', 8)
        targets=wait_json(f'http://127.0.0.1:{cdp_port}/json/list', 8)
        page=next((t for t in targets if t.get('type')=='page'), targets[0])
        attempt['target_url']=page.get('url')
        ws=websocket.create_connection(page['webSocketDebuggerUrl'], timeout=2)
        mid=1
        for method in ['Runtime.enable','Page.enable','Log.enable']:
            cdp(ws, mid, method); mid+=1
        loaded=False; start=time.time()
        while time.time()-start<budget:
            try: msg=json.loads(ws.recv())
            except Exception: break
            m=msg.get('method')
            if m=='Runtime.consoleAPICalled':
                text=' '.join(str(a.get('value',a.get('description',''))) for a in msg.get('params',{}).get('args',[]))
                attempt['console'].append(text[:500])
            elif m=='Runtime.exceptionThrown':
                attempt['errors'].append(str(msg.get('params',{}).get('exceptionDetails',{}))[:1000])
            elif m=='Page.loadEventFired':
                loaded=True; break
        expr="""(()=>({title:document.title,ready:document.readyState,app:!!document.querySelector('#app'),main:!!document.querySelector('.app-root,.start-screen,.screen'),bodyText:(document.body.innerText||'').slice(0,500),scriptCount:document.scripts.length}))()"""
        cdp(ws, mid, 'Runtime.evaluate', {'expression':expr,'returnByValue':True}); eval_id=mid; mid+=1
        start=time.time()
        while time.time()-start<8:
            try: msg=json.loads(ws.recv())
            except Exception: break
            if msg.get('id')==eval_id:
                attempt['eval_raw']=msg.get('result')
                attempt['eval']=(msg.get('result',{}).get('result') or {}).get('value')
                break
        attempt['loaded']=loaded
        attempt['ok']=isinstance(attempt.get('eval'),dict) and attempt['eval'].get('ready') in ('interactive','complete') and 'blocked' not in str(attempt['eval'].get('bodyText','')).lower() and not attempt['errors']
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

for i in range(1,4):
    a=run_attempt(i); results['attempts'].append(a)
    if a['ok']: break
results['ok']=any(a['ok'] for a in results['attempts'])
out=ROOT/'data'/'v238_browser_smoke_test.json'
out.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(results,ensure_ascii=False,indent=2))
sys.exit(0 if results['ok'] else 1)
