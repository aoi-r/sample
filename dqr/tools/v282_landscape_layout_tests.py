import json, re, subprocess, tempfile, time, urllib.request, socket, sys, base64
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORT=9282
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
        p=ROOT/'data'/n
        if p.exists():
            data[f'./data/{n}']=json.loads(p.read_text(encoding='utf-8'))
            data[f'data/{n}']=data[f'./data/{n}']
    css=(ROOT/'css/style.css').read_text(encoding='utf-8')
    html=re.sub(r'<link rel="stylesheet" href="\.\/css\/style\.css[^\"]*"\s*/?>','<style>'+css+'</style>',html)
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

def launch(width=844,height=390, port=PORT):
    profile=tempfile.mkdtemp(prefix='dqr_v282_chrome_')
    log_path=tempfile.NamedTemporaryFile('w+',delete=False).name
    log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={port}',f'--user-data-dir={profile}',f'--window-size={width},{height}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'], stdout=log, stderr=log)
    version=wait_json(f'http://127.0.0.1:{port}/json/version')
    pages=wait_json(f'http://127.0.0.1:{port}/json/list')
    page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], port)
    c.call('Runtime.enable'); c.call('Page.enable')
    c.call('Emulation.setDeviceMetricsOverride', {'width':width,'height':height,'deviceScaleFactor':2,'mobile':True, 'screenOrientation': {'type':'landscapePrimary','angle':90}})
    frame_id=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame_id,'html':build_inline_html()}, timeout=180)
    for _ in range(250):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady', timeout=2): return proc,c,version.get('Browser'),log_path
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError('app not ready '+log_path)

def setup_scene(c):
    return c.eval("""
(()=>{
 const T=window.__DQR_TEST__, S=T.state;
 T.setupPvpTest('P1', true);
 document.querySelectorAll('.screen').forEach(el=>el.classList.remove('active'));
 document.querySelector('#screen-battle')?.classList.add('active');
 document.querySelector('#battle-setup')?.classList.add('hidden');
 document.querySelector('#battle-arena')?.classList.remove('hidden');
 T.setPlayerHandByNames(['スライム','スライム','スライム','スライム','スライム','スライム']);
 S.battle.game.player.tension=2; S.battle.game.enemy.tension=1;
 T.renderBattleArena?.();
 return true;
})()
""", timeout=30)

def geom(c):
    return c.eval("""
(()=>{
 const q=s=>document.querySelector(s);
 const rect=el=>{ if(!el) return null; const r=el.getBoundingClientRect(); return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2}; };
 const slots=[...document.querySelectorAll('.unit-slot')].map(el=>({side:el.dataset.side,pos:el.dataset.pos,...rect(el)}));
 const row2=slots.filter(s=>((s.side==='player' && ['4','1'].includes(s.pos)) || (s.side==='enemy' && ['1','4'].includes(s.pos))));
 return {
  vw:innerWidth,vh:innerHeight,
  arena:rect(q('#battle-arena')),
  hand:rect(q('#player-hand')),
  hud:rect(q('.player-hud')),
  enemyHud:rect(q('.enemy-hud')),
  playerLeader:rect(q('.player-leader')),
  enemyLeader:rect(q('.enemy-leader')),
  slots,
  row2,
  topbar:rect(q('#screen-battle .topbar')),
  log:rect(q('.battle-log'))
 };
})()
""", timeout=20)

def check_layout(g):
    ok=[]
    def add(name, cond, detail=None): ok.append({'name':name,'passed':bool(cond),'detail':detail})
    arena=g['arena']; hand=g['hand']; hud=g['hud']; pl=g['playerLeader']; el=g['enemyLeader']; slots=g['slots']
    add('hand is horizontally centered and inside viewport', abs(hand['cx'] - g['vw']/2) < 20 and hand['left'] >= 0 and hand['right'] <= g['vw'], hand)
    add('player HUD content pill is compact, not stretched across field', hud['width'] < min(330, g['vw']*0.42) and hud['left'] < 40, hud)
    add('leaders share nearly same vertical center', abs(pl['cy'] - el['cy']) <= 6, {'player':pl, 'enemy':el, 'delta':abs(pl['cy']-el['cy'])})
    # middle summon row should align with leader y (within one half-slot)
    middle=[s for s in slots if ((s['side']=='player' and s['pos'] in ['4','1']) or (s['side']=='enemy' and s['pos'] in ['1','4']))]
    mid_y=sum(s['cy'] for s in middle)/len(middle)
    add('middle summon row aligns with leader icons', abs(mid_y - pl['cy']) <= 18, {'middleY':mid_y, 'leaderY':pl['cy'], 'delta':abs(mid_y-pl['cy']), 'middle':middle})
    top_slots=[s for s in slots if s['pos'] in ['3','0'] and s['side'] in ['player','enemy']]
    bottom_slots=[s for s in slots if s['pos'] in ['5','2'] and s['side'] in ['player','enemy']]
    add('top row is visible below topbar/turn controls', min(s['top'] for s in top_slots) >= arena['top'] + 8, {'minTop':min(s['top'] for s in top_slots), 'arenaTop':arena['top']})
    add('bottom row stays above HUD and hand', max(s['bottom'] for s in bottom_slots) + 6 <= min(hud['top'], hand['top']), {'bottomRowBottom':max(s['bottom'] for s in bottom_slots), 'hudTop':hud['top'], 'handTop':hand['top']})
    add('no slot overlaps hand', max(s['bottom'] for s in slots) + 6 <= hand['top'], {'slotBottom':max(s['bottom'] for s in slots), 'handTop':hand['top']})
    return ok

def run_case(width,height,idx):
    port=PORT+idx
    proc=None
    try:
        proc,c,browser,log=launch(width,height,port)
        setup_scene(c)
        time.sleep(.3)
        g=geom(c)
        png=base64.b64decode(c.call('Page.captureScreenshot', {'format':'png','captureBeyondViewport':False}, timeout=20)['data'])
        ss=ROOT/f'data/v282_layout_{width}x{height}.png'
        ss.write_bytes(png)
        return {'viewport':f'{width}x{height}','geometry':g,'results':check_layout(g),'screenshot':str(ss)}
    finally:
        if proc:
            try: proc.terminate(); proc.wait(timeout=3)
            except Exception: pass

def main():
    cases=[run_case(844,390,0), run_case(667,375,1)]
    flat=[]
    for c in cases: flat += [{'case':c['viewport'], **r} for r in c['results']]
    summary={'version':'v282_landscape_field_hud_align','passed':sum(1 for r in flat if r['passed']),'failed':sum(1 for r in flat if not r['passed']),'cases':cases}
    (ROOT/'data/v282_landscape_layout_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2), encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    return 0 if summary['failed']==0 else 1
if __name__=='__main__': sys.exit(main())
