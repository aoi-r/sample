import json, os, subprocess, time, tempfile, urllib.request, sys, socket, re
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORTS=[9254,9255]
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
        if 'exceptionDetails' in res: raise RuntimeError(json.dumps(res['exceptionDetails'],ensure_ascii=False)[:4000])
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
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'PASTE_DISABLED_FOR_INLINE_SHIDO_EMULATOR' };")
    names=['cards.json','systems.json','strategies.json','choices.json','coin.json','dungeons.json','fortune.json','heroes.json','exchanges.json','generated_cards.json','tension_system.json']
    data={}
    for n in names:
        data[f'./data/{n}']=json.loads((ROOT/'data'/n).read_text())
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
    profile=tempfile.mkdtemp(prefix=f'dqr_v254_chrome_{port}_')
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
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.setHeroSkillV254', timeout=2): return proc,c,version,log_path
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError('app not ready')

def js(x): return json.dumps(x, ensure_ascii=False)
def test(results,name,func):
    try:
        d=func(); ok=bool(d.get('ok') if isinstance(d,dict) and 'ok' in d else d); results.append({'name':name,'ok':ok,'detail':d})
    except Exception as e: results.append({'name':name,'ok':False,'error':str(e)})
def setup(A,B,turnA=True):
    A.eval(f"window.__DQR_TEST__.setupPvpTest('A', {str(turnA).lower()})", timeout=20)
    B.eval(f"window.__DQR_TEST__.setupPvpTest('B', {str((not turnA)).lower()})", timeout=20)

def bridge(src,dst,label='bridge'):
    actions=src.eval('window.__DQR_TEST__.drainOutbox()', timeout=10) or []
    for i,a in enumerate(actions):
        dst.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js(label+'_'+str(i))})", timeout=20)
    return actions

def mirror_public(A,B):
    entry=A.eval('window.__DQR_TEST__.publicStateForTestV254()', timeout=10)
    B.eval(f"window.__DQR_TEST__.applyOpponentPublicStateV254({js(entry)})", timeout=20)
    return entry

def use_pending_unit(cdp, side='enemy', pos=0):
    return cdp.eval(f"""
(()=>{{
  const T=window.__DQR_TEST__, g=T.state.battle.game;
  const skill=T.getHeroLevelDef(g.player.heroSkill);
  g.pendingHeroSkill=skill;
  T.applyPendingHeroSkillToUnit({js(side)}, {int(pos)});
  return T.boardSnapshotV254();
}})()
""", timeout=30)

def use_pending_empty(cdp, pos=0):
    return cdp.eval(f"""
(()=>{{
  const T=window.__DQR_TEST__, g=T.state.battle.game;
  const skill=T.getHeroLevelDef(g.player.heroSkill);
  g.pendingHeroSkill=skill;
  T.applyPendingHeroSkillToEmptySlot({int(pos)});
  return T.boardSnapshotV254();
}})()
""", timeout=30)

def main():
    html=build_inline_html(); procs=[]; clients=[]; versions=[]; logs=[]
    try:
        for p in PORTS:
            proc,c,ver,log=launch(p,html); procs.append(proc); clients.append(c); versions.append(ver.get('Browser')); logs.append(log)
        A,B=clients; results=[]
        test(results,'boot: v254 hook loaded in two clients', lambda:{'ok': A.eval('!!window.__DQR_TEST__.setHeroSkillV254') and B.eval('!!window.__DQR_TEST__.setHeroSkillV254'), 'cardsA':A.eval('window.__DQR_TEST__.state.allCards.length'), 'cardsB':B.eval('window.__DQR_TEST__.state.allCards.length')})

        # Lv1 no building: 1 damage and action replay mirror.
        setup(A,B,True)
        A.eval("window.__DQR_TEST__.setHeroSkillV254('少年シドー',1); window.__DQR_TEST__.setBoardByNames('enemy',['シールドオーガ']); window.__DQR_TEST__.state.battle.game.player.mp=10;", timeout=20)
        B.eval("window.__DQR_TEST__.setBoardByNames('player',['シールドオーガ']);", timeout=20)
        use_pending_unit(A,'enemy',0)
        actions=bridge(A,B,'lv1_no_building')
        test(results,'少年シドーLv1: 建物なしなら敵1体に1ダメージしてaction replayでも反映', lambda:{'ok': A.eval('window.__DQR_TEST__.boardSnapshotV254().enemy[0].hp')==3 and B.eval('window.__DQR_TEST__.boardSnapshotV254().player[0].hp')==3 and any(a.get('type')=='damageApplied' for a in actions), 'actions':[a.get('type') for a in actions], 'A':A.eval('window.__DQR_TEST__.boardSnapshotV254()'), 'B':B.eval('window.__DQR_TEST__.boardSnapshotV254()')})

        # Lv1 with building: 3 damage + building durability decrease. The action bridge verifies the opponent's damaged unit.
        setup(A,B,True)
        A.eval("window.__DQR_TEST__.setHeroSkillV254('少年シドー',1); window.__DQR_TEST__.setBoardByNames('enemy',['シールドオーガ']); window.__DQR_TEST__.state.battle.game.player.board[0]={id:'test_theater',name:'劇場',hp:3,maxHp:3,attack:0,isBuilding:true,durability:3,maxDurability:3,keywords:{}}; window.__DQR_TEST__.state.battle.game.player.mp=10;", timeout=20)
        B.eval("window.__DQR_TEST__.setBoardByNames('player',['シールドオーガ']);", timeout=20)
        use_pending_unit(A,'enemy',0)
        actions=bridge(A,B,'lv1_building')
        test(results,'少年シドーLv1: 味方建物ありなら3ダメージ+建物耐久-1', lambda:{'ok': A.eval('window.__DQR_TEST__.boardSnapshotV254().enemy[0].hp')==1 and A.eval('window.__DQR_TEST__.boardSnapshotV254().player[0].durability')==2 and B.eval('window.__DQR_TEST__.boardSnapshotV254().player[0].hp')==1 and any(a.get('type')=='damageApplied' for a in actions), 'actions':[a.get('type') for a in actions], 'A':A.eval('window.__DQR_TEST__.boardSnapshotV254()'), 'B':B.eval('window.__DQR_TEST__.boardSnapshotV254()')})

        # Lv2 summon Berserk Shido and action replay mirror.
        setup(A,B,True)
        A.eval("window.__DQR_TEST__.setHeroSkillV254('少年シドー',2); window.__DQR_TEST__.state.battle.game.player.mp=10;", timeout=20)
        use_pending_empty(A,2)
        actions=bridge(A,B,'lv2_summon')
        test(results,'少年シドーLv2: 暴走するシドーを空きマスに出しLv3へ進行/action replayで相手画面にも出る', lambda:{'ok': A.eval('window.__DQR_TEST__.boardSnapshotV254().player[2].name')=='暴走するシドー' and A.eval('window.__DQR_TEST__.boardSnapshotV254().hero.level')==3 and B.eval('window.__DQR_TEST__.boardSnapshotV254().enemy[2].name')=='暴走するシドー' and any(a.get('type')=='unitPutIntoPlay' for a in actions), 'actions':[a.get('type') for a in actions], 'A':A.eval('window.__DQR_TEST__.boardSnapshotV254()'), 'B':B.eval('window.__DQR_TEST__.boardSnapshotV254()')})

        # Berserk Shido opponent turn start damage.
        A.eval("window.__DQR_TEST__.setBoardByNames('player',['暴走するシドー','スライム']); window.__DQR_TEST__.setBoardByNames('enemy',['スライム']); window.__DQR_TEST__.handleTurnStartEvent({side:'enemy'});", timeout=20)
        test(results,'暴走するシドー: 相手ターン開始時に自身以外の全ユニットへ2ダメージ', lambda:{'ok': A.eval('window.__DQR_TEST__.boardSnapshotV254().player[1]') is None and A.eval('window.__DQR_TEST__.boardSnapshotV254().enemy[0]') is None and A.eval('window.__DQR_TEST__.boardSnapshotV254().player[0].hp')==5, 'A':A.eval('window.__DQR_TEST__.boardSnapshotV254()')})

        # Lv3 special move, theater draw and action replay damage.
        setup(A,B,True)
        A.eval("window.__DQR_TEST__.setHeroSkillV254('少年シドー',3); window.__DQR_TEST__.state.battle.game.player.board[0]={id:'test_theater',name:'劇場',hp:3,maxHp:3,attack:0,isBuilding:true,durability:3,maxDurability:3,keywords:{}}; window.__DQR_TEST__.setBoardByNames('enemy',['シールドオーガ']); window.__DQR_TEST__.setDeckByNamesV254(['スライム']); window.__DQR_TEST__.state.battle.game.player.tension=3; window.__DQR_TEST__.state.battle.game.player.mp=10;", timeout=20)
        B.eval("window.__DQR_TEST__.setBoardByNames('player',['シールドオーガ']);", timeout=20)
        use_pending_unit(A,'enemy',0)
        actions=bridge(A,B,'lv3_theater')
        mirror_public(A,B)
        test(results,'少年シドーLv3: 必殺技3ダメージ/テンション消費/劇場1ドロー/action replayで相手ユニットも減る', lambda:{'ok': A.eval('window.__DQR_TEST__.boardSnapshotV254().enemy[0].hp')==1 and A.eval('window.__DQR_TEST__.boardSnapshotV254().tension')==0 and A.eval('window.__DQR_TEST__.boardSnapshotV254().hand.length')==1 and B.eval('window.__DQR_TEST__.boardSnapshotV254().player[0].hp')==1 and B.eval('window.__DQR_TEST__.boardSnapshotV254().enemy[0].name')=='劇場', 'actions':[a.get('type') for a in actions], 'A':A.eval('window.__DQR_TEST__.boardSnapshotV254()'), 'B':B.eval('window.__DQR_TEST__.boardSnapshotV254()')})

        exceptions=[]
        for c in clients:
            for e in c.events:
                if e.get('method')=='Runtime.exceptionThrown': exceptions.append(e.get('params',{}))
        summary={'mode':'v254 少年シドー two Chromium clients + action replay + public state mirror','browsers':versions,'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'exceptions':exceptions[:10],'chromeLogs':logs}
        (ROOT/'data'/'v254_shido_pvp_emulator_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        for p in procs:
            try: p.terminate(); p.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
