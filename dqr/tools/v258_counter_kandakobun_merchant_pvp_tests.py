import json, subprocess, time, tempfile, urllib.request, socket, re, sys
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORTS=[9281,9282]
class CDP:
    def __init__(self, ws_url, port):
        self.ws=websocket.create_connection(ws_url, timeout=5, origin=f'http://127.0.0.1:{port}'); self.i=0; self.events=[]
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
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'PASTE_DISABLED_FOR_INLINE_V258_EMULATOR' };")
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
    profile=tempfile.mkdtemp(prefix=f'dqr_v258_chrome_{port}_'); log_path=tempfile.NamedTemporaryFile('w+',delete=False).name; log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={port}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'],stdout=log,stderr=log)
    ver=wait_json(f'http://127.0.0.1:{port}/json/version'); pages=wait_json(f'http://127.0.0.1:{port}/json/list'); page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], port); c.call('Runtime.enable'); c.call('Page.enable'); frame=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame,'html':html}, timeout=180)
    for _ in range(180):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.v258', timeout=2): return proc,c,ver,log_path
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError('app not ready')
def test(results,name,func):
    try:
        d=func(); ok=bool(d.get('ok') if isinstance(d,dict) and 'ok' in d else d); results.append({'name':name,'ok':ok,'detail':d})
    except Exception as e: results.append({'name':name,'ok':False,'error':str(e)})
def setup(c, pid='A', turn=True):
    c.eval(f"window.__DQR_TEST__.setupPvpTest({json.dumps(pid)}, {str(turn).lower()})", timeout=20)
def bridge(src,dst,label='bridge'):
    actions=src.eval('window.__DQR_TEST__.drainOutbox()', timeout=10) or []
    for i,a in enumerate(actions): dst.eval(f"window.__DQR_TEST__.applyRemoteAction({json.dumps(a,ensure_ascii=False)}, {json.dumps(label+'_'+str(i))})", timeout=20)
    return actions
def main():
    html=build_inline_html(); procs=[]; clients=[]; versions=[]; logs=[]
    try:
        for p in PORTS:
            proc,c,ver,log=launch(p,html); procs.append(proc); clients.append(c); versions.append(ver.get('Browser')); logs.append(log)
        A,B=clients; results=[]
        test(results,'boot: v258 hooks loaded', lambda:{'ok': A.eval('!!window.__DQR_TEST__.v258') and B.eval('!!window.__DQR_TEST__.v258'), 'cards':A.eval('window.__DQR_TEST__.state.allCards.length')})
        setup(A,'A',True)
        test(results,'カンダタこぶんBET: テンションをためる1コストだけ0になり、その場で消費される', lambda: A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; g.turn=3; g.player.mp=5; g.player.tension=0; g.player.tensionUsedThisTurn=false; const unit={name:'カンダタこぶん',cardId:T.state.allCards.find(c=>c.name==='カンダタこぶん')?.id,lastBetTurn:null}; T.v258.applyKandakobunBet(unit); const before={mp:g.player.mp,t:g.player.tension,flag:g.player.nextTensionChargeCostZeroV258}; T.useOrChargeTension(); const after={mp:g.player.mp,t:g.player.tension,flag:g.player.nextTensionChargeCostZeroV258,next:g.player.nextTensionCostZero}; return {ok:before.mp===5 && after.mp===5 && after.t===1 && after.flag===false && after.next===false,before,after}; })()
""", timeout=30))
        setup(A,'A',True)
        test(results,'カンダタこぶんBET: 未使用ならターン終了で0コスト権が消える', lambda: A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; g.turn=4; g.player.mp=5; g.player.tension=0; T.v258.applyKandakobunBet({name:'カンダタこぶん'}); T.v258.turnEnd('player'); g.player.tensionUsedThisTurn=false; T.useOrChargeTension(); return {ok:g.player.mp===4 && g.player.tension===1 && !g.player.nextTensionChargeCostZeroV258, mp:g.player.mp, tension:g.player.tension, flag:g.player.nextTensionChargeCostZeroV258}; })()
""", timeout=30))
        setup(A,'A',True)
        test(results,'ブオーン: 攻撃後に攻撃対象以外の敵と敵リーダーへ同時ダメージ', lambda: A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; const card=T.state.allCards.find(c=>c.name==='ブオーン'); const bu=T.makeUnitFromCard(card); g.player.board[0]=bu; T.setBoardByNames('enemy',['スライム','ドラキー']); const before=T.boardSnapshotV255(); T.v257.applyBuornSplash({attacker:bu,attackerRef:{side:'player',pos:0},defenderRef:{side:'enemy',pos:0,unit:g.enemy.board[0]}}); const after=T.boardSnapshotV255(); return {ok:after.enemyHp<before.enemyHp && (!after.enemy[1] || after.enemy[1].hp<before.enemy[1].hp), before, after}; })()
""", timeout=30))
        setup(A,'A',True)
        test(results,'魔道士ウルノーガ: 前列にいる間、敵の回復がダメージ化する', lambda: A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['魔道士ウルノーガ']); g.enemy.hp=20; g.enemy.maxHp=25; const before=g.enemy.hp; T.applyCardUseV166(T.state.allCards.find(c=>c.name==='いやしの雨'),2); return {ok:g.enemy.hp<before, before, after:g.enemy.hp, snap:T.boardSnapshotV255()}; })()
""", timeout=30))
        setup(A,'A',True)
        test(results,'転生の祈り: 敵死亡プールからコイン枚数以下で最大コストのユニットを復活', lambda: A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; const slime=T.state.allCards.find(c=>c.name==='スライム'); g.enemy.deaths=[{cardId:slime.id,name:slime.name}]; g.player.hand=[]; T.applyCardUseV166(T.state.allCards.find(c=>c.name==='転生の祈り'),2); const snap=T.boardSnapshotV255(); return {ok:snap.player.some(u=>u&&u.name==='スライム'), snap, hand:snap.hand}; })()
""", timeout=30))
        setup(A,'A',True)
        test(results,'アクバー: 他の味方死亡時に復活し、次の死亡は消滅フラグ付き', lambda: A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; const ak=T.makeUnitFromCard(T.state.allCards.find(c=>c.name==='アクバー')); const sl=T.makeUnitFromCard(T.state.allCards.find(c=>c.name==='スライム')); g.player.board[0]=ak; g.player.board[1]=sl; sl.lastBoardPos=1; sl.hp=0; T.applyDeathrattle(sl,'player'); const u=g.player.board.find(x=>x&&x.name==='スライム'); const revived=g.player.board.filter(x=>x&&x.name==='スライム'&&x.vanishOnDeathV257===true); return {ok:revived.length>0, snap:T.boardSnapshotV255(), flags:g.player.board.map(x=>x&&x.vanishOnDeathV257)}; })()
""", timeout=30))
        setup(A,'A',True)
        test(results,'商人PENDING: しあわせの巻物は+1/+1後に道具を追加', lambda: A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['スライム']); g.player.hand=[]; const before=T.boardSnapshotV255(); T.v258.useMerchantCard(T.state.allCards.find(c=>c.name==='しあわせの巻物'),2); T.v258.pending({side:'player',pos:0}); const after=T.boardSnapshotV255(); return {ok:after.player[0].attack===before.player[0].attack+1 && after.player[0].hp===before.player[0].hp+1 && after.hand.length>=1, before, after}; })()
""", timeout=30))
        setup(A,'A',True)
        test(results,'商人PENDING: かなしばりの杖は敵縦一列を攻撃不能にする', lambda: A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('enemy',['スライム','ドラキー']); T.v258.useMerchantCard(T.state.allCards.find(c=>c.name==='かなしばりの杖'),0); T.v258.pending({side:'enemy',pos:0}); return {ok:g.enemy.board[0].cannotAttackUntilV258 && g.enemy.board[0].canAttack===false, snap:T.boardSnapshotV255(), unit:g.enemy.board[0]}; })()
""", timeout=30))
        setup(A,'A',True); setup(B,'B',False)
        test(results,'対戦action replay: ブオーンを場に出すactionは相手クライアントへ反映される', lambda: (lambda d: {'ok':d['ok'], 'detail':d})(A.eval("""
(()=>{ const T=window.__DQR_TEST__; const c=T.state.allCards.find(x=>x.name==='ブオーン'); T.summonUnitFromHandToBoard(c,0,6); return {ok:T.boardSnapshotV255().player.some(u=>u&&u.name==='ブオーン'), actions:T.drainOutbox().map(a=>a.type)}; })()
""", timeout=30)))
        # Re-run bridge properly because the previous test drained outbox for detail only; perform a clean bridge now.
        setup(A,'A',True); setup(B,'B',False)
        A.eval("(()=>{ const T=window.__DQR_TEST__; const c=T.state.allCards.find(x=>x.name==='ブオーン'); T.summonUnitFromHandToBoard(c,0,6); })()", timeout=30)
        actions=bridge(A,B,'v258_buorn')
        remote_snap=B.eval('window.__DQR_TEST__.boardSnapshotV255()', timeout=20)
        results[-1]={'name':'対戦action replay: ブオーンを場に出すactionは相手クライアントへ反映される','ok': any(a.get('type')=='unitSummoned' for a in actions) and any(u and u.get('name')=='ブオーン' for u in remote_snap.get('enemy',[])), 'detail':{'actions':[a.get('type') for a in actions], 'remote':remote_snap}}
        exceptions=[]
        for c in clients:
            exceptions += [e.get('params',{}) for e in c.events if e.get('method')=='Runtime.exceptionThrown']
        summary={'mode':'v258 Kandakobun + prior 4 behavior + merchant PvP/browser tests','browsers':versions,'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'exceptions':exceptions[:10],'chromeLogs':logs}
        (ROOT/'data'/'v258_counter_kandakobun_merchant_pvp_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2), encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        for p in procs:
            try: p.terminate(); p.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
