import json, re, subprocess, tempfile, time, urllib.request, socket, sys
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORT=9281
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
    css=(ROOT/'css/style.css').read_text(encoding='utf-8')
    html=html.replace('<link rel="stylesheet" href="./css/style.css?v=v281_pvp_authoritative_sync_hand_layout_fix">', '<style>'+css+'</style>')
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

def launch(width=844,height=390):
    profile=tempfile.mkdtemp(prefix='dqr_v281_chrome_')
    log_path=tempfile.NamedTemporaryFile('w+',delete=False).name
    log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={PORT}',f'--user-data-dir={profile}',f'--window-size={width},{height}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'], stdout=log, stderr=log)
    version=wait_json(f'http://127.0.0.1:{PORT}/json/version')
    pages=wait_json(f'http://127.0.0.1:{PORT}/json/list')
    page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], PORT)
    c.call('Runtime.enable'); c.call('Page.enable')
    c.call('Emulation.setDeviceMetricsOverride', {'width':width,'height':height,'deviceScaleFactor':2,'mobile':True})
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
        add('boot with v281 hook', c.eval("window.__DQR_TEST__?.v281?.version === 'v281_pvp_authoritative_sync_hand_layout_fix'"))
        r=c.eval("""
(()=>{
 const T=window.__DQR_TEST__, S=T.state;
 T.setupPvpTest('B', false);
 const g=S.battle.game;
 const pf=T.findCardByName('プチファイター');
 const u=T.makeUnitFromCard(pf); u.hp=0; u.maxHp=2;
 g.enemy.board[0]=u;
 const stale={v270Snapshot:true,stateSeq:99,playerId:'A',sessionId:S.battle.sessionId,hp:25,mp:10,maxMp:10,tension:0,handCount:4,deckCount:20,board:[u,null,null,null,null,null]};
 T.applyRemoteAction({type:'unitDeath', actorId:'A', payload:{side:'player', pos:0, unit:{id:u.id, cardId:u.cardId, name:u.name}, stateSnapshotV270:stale}, stateSnapshotV270:stale}, 'act_death_1');
 return {ok:g.enemy.board[0]===null, enemy:T.boardSnapshotV255().enemy, log:g.log.slice(-6)};
})()
""", timeout=30)
        add('unitDeath stale snapshot cannot revive HP0 unit', r.get('ok'), r)
        r2=c.eval("""
(()=>{
 const T=window.__DQR_TEST__, S=T.state;
 T.setupPvpTest('B', false);
 const g=S.battle.game;
 const slime=T.findCardByName('スライム');
 const u=T.makeUnitFromCard(slime);
 const stale={v270Snapshot:true,stateSeq:100,playerId:'A',sessionId:S.battle.sessionId,hp:25,mp:9,maxMp:10,tension:1,handCount:3,deckCount:22,board:[u,null,null,null,null,null]};
 T.applyRemoteAction({type:'unitSummoned', actorId:'A', payload:{side:'player', pos:0, card:{id:slime.id,name:slime.name}, unit:u, stateSnapshotV270:stale}, stateSnapshotV270:stale}, 'act_summon_1');
 return {ok:g.enemy.board[0]?.name==='スライム' && g.enemy.hand.length===0 && g.enemy.handCount===3, enemy:T.boardSnapshotV255().enemy, hand:g.enemy.hand, handCount:g.enemy.handCount};
})()
""", timeout=30)
        add('remote summon visible and exact opponent hand remains hidden', r2.get('ok'), r2)
        r3=c.eval("""
(()=>{
 const T=window.__DQR_TEST__, S=T.state;
 T.setupPvpTest('B', false);
 const g=S.battle.game;
 const coin=T.findCardByName('コイン') || {id:'coin'};
 const states={A:{playerId:'A',sessionId:S.battle.sessionId,v270Snapshot:true,stateSeq:111,clientUpdatedAt:Date.now(),hp:25,mp:5,maxMp:5,tension:0,handIds:[coin.id],handCount:1,deckCount:25,board:[null,null,null,null,null,null]}};
 T.applyRemoteOpponentState(states);
 return {ok:g.enemy.hand.length===0 && g.player.hand.length===0 && g.enemy.handCount===1, enemyHand:g.enemy.hand, playerHand:g.player.hand, enemyHandCount:g.enemy.handCount};
})()
""", timeout=30)
        add('remote public handIds are ignored so coin cannot enter wrong hand', r3.get('ok'), r3)
        r4=c.eval("""
(()=>{
 const T=window.__DQR_TEST__, S=T.state;
 T.setupPvpTest('P1', true);
 document.querySelector('#screen-title')?.classList.remove('active');
 document.querySelector('#screen-battle')?.classList.add('active');
 document.querySelector('#battle-arena')?.classList.remove('hidden');
 T.setPlayerHandByNames(['スライム','スライム','スライム','スライム','スライム','スライム']);
 T.renderBattleArena?.();
 const hand=document.querySelector('#player-hand').getBoundingClientRect();
 const slots=[...document.querySelectorAll('.unit-slot[data-side="player"]')].map(el=>({pos:el.dataset.pos, r:el.getBoundingClientRect()}));
 const lower=slots.filter(x=>['3','4','5'].includes(x.pos));
 const lowerBottom=Math.max(...lower.map(x=>x.r.bottom));
 return {ok: lowerBottom + 4 <= hand.top, handTop:hand.top, lowerBottom, gap:hand.top-lowerBottom, hand:{top:hand.top,bottom:hand.bottom,height:hand.height}, lower:lower.map(x=>({pos:x.pos, top:x.r.top,bottom:x.r.bottom,height:x.r.height}))};
})()
""", timeout=30)
        add('landscape own hand does not overlap lower player board row', r4.get('ok'), r4)
        exceptions=[e.get('params',{}) for e in c.events if e.get('method')=='Runtime.exceptionThrown']
        summary={'browser':browser,'passed':sum(1 for x in results if x['passed']),'failed':sum(1 for x in results if not x['passed']),'results':results,'exceptions':exceptions[:5],'chromeLog':log_path}
        (ROOT/'data/v281_pvp_sync_hand_layout_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        if proc:
            try: proc.terminate(); proc.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
