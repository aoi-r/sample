import json, os, subprocess, time, tempfile, urllib.request, sys, socket, re
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORTS=[9256,9257]
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
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'PASTE_DISABLED_FOR_INLINE_V255_EMULATOR' };")
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
    profile=tempfile.mkdtemp(prefix=f'dqr_v255_chrome_{port}_')
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
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.boardSnapshotV255', timeout=2): return proc,c,version,log_path
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError('app not ready')

def js(x): return json.dumps(x, ensure_ascii=False)
def test(results,name,func):
    try:
        d=func(); ok=bool(d.get('ok') if isinstance(d,dict) and 'ok' in d else d); results.append({'name':name,'ok':ok,'detail':d})
    except Exception as e: results.append({'name':name,'ok':False,'error':str(e)})
def setup(c, pid='A', turn=True):
    c.eval(f"window.__DQR_TEST__.setupPvpTest({js(pid)}, {str(turn).lower()})", timeout=20)
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
        test(results,'boot: v255 hooks loaded', lambda:{'ok': A.eval('!!window.__DQR_TEST__.boardSnapshotV255') and B.eval('!!window.__DQR_TEST__.boardSnapshotV255'), 'cards':A.eval('window.__DQR_TEST__.state.allCards.length')})

        # Unit attacking a leader with attack receives counter; defender weapon durability is not consumed.
        setup(A,'A',True)
        A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['シールドオーガ']); const u=g.player.board[0]; u.canAttack=true; u.attacksLeft=1; u.summoningSickness=false; g.enemy.leaderAttack=3; g.enemy.leaderCanAttack=true; g.enemy.weapon={name:'敵テスト武器',attack:3,durability:2,maxDurability:2,attacksLeft:1}; g.selectedAttacker={side:'player',pos:0}; T.attackLeader('enemy'); return T.boardSnapshotV255(); })()
""", timeout=30)
        test(results,'リーダー反撃: 攻撃力を持つ敵リーダーを攻撃したユニットに反撃し、敵武器耐久は減らない', lambda:{'ok': A.eval('window.__DQR_TEST__.boardSnapshotV255().player[0].hp')==1 and A.eval('window.__DQR_TEST__.boardSnapshotV255().enemyWeapon.durability')==2, 'snap':A.eval('window.__DQR_TEST__.boardSnapshotV255()')})

        # Leader vs leader counter; only attacking weapon loses durability.
        setup(A,'A',True)
        A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; g.player.weapon={name:'味方テスト武器',attack:3,durability:2,maxDurability:2,attacksLeft:1}; g.player.leaderAttack=3; g.player.leaderCanAttack=true; g.enemy.weapon={name:'敵テスト武器',attack:2,durability:2,maxDurability:2,attacksLeft:1}; g.enemy.leaderAttack=2; g.enemy.leaderCanAttack=true; g.selectedAttacker={side:'playerLeader'}; T.attackLeader('enemy'); return T.boardSnapshotV255(); })()
""", timeout=30)
        test(results,'リーダー反撃: リーダー同士でも反撃し、防御側武器耐久は減らない', lambda:{'ok': A.eval('window.__DQR_TEST__.boardSnapshotV255().playerHp')==23 and A.eval('window.__DQR_TEST__.boardSnapshotV255().enemyHp')==22 and A.eval('window.__DQR_TEST__.boardSnapshotV255().playerWeapon.durability')==1 and A.eval('window.__DQR_TEST__.boardSnapshotV255().enemyWeapon.durability')==2, 'snap':A.eval('window.__DQR_TEST__.boardSnapshotV255()')})

        # Kabau blocks unit attacks and allows leader attack.
        setup(A,'A',True)
        A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['シールドオーガ']); T.setBoardByNames('enemy',['スライム']); g.player.board[0].canAttack=true; g.player.board[0].attacksLeft=1; g.enemy.kabauActiveV254=true; T.attackUnit({side:'player',pos:0},{side:'enemy',pos:0}); const afterBlock=T.boardSnapshotV255(); g.player.board[0].canAttack=true; g.selectedAttacker={side:'player',pos:0}; T.attackLeader('enemy'); return {afterBlock, afterLeader:T.boardSnapshotV255()}; })()
""", timeout=30)
        test(results,'かばう: 有効中はユニットを攻撃できず、リーダー攻撃だけ通る', lambda:{'ok': A.eval('window.__DQR_TEST__.boardSnapshotV255().enemyHp')==21 and A.eval('window.__DQR_TEST__.boardSnapshotV255().enemy[0].hp')==1, 'snap':A.eval('window.__DQR_TEST__.boardSnapshotV255()')})

        # Kabau no kokoroe reduces leader damage while Kabau active.
        setup(A,'A',True)
        A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('enemy',['シールドオーガ']); const u=g.enemy.board[0]; u.canAttack=true; u.attacksLeft=1; u.summoningSickness=false; g.player.kabauActiveV254=true; g.player.kabauDamageReductionV254=true; g.selectedAttacker={side:'enemy',pos:0}; T.attackLeader('player'); return T.boardSnapshotV255(); })()
""", timeout=30)
        test(results,'かばうの心得: かばう中にリーダーが受けるダメージを1減らす', lambda:{'ok': A.eval('window.__DQR_TEST__.boardSnapshotV255().playerHp')==22, 'snap':A.eval('window.__DQR_TEST__.boardSnapshotV255()')})

        # Blade body deals 1 counter damage when leader is attacked.
        setup(A,'A',True)
        A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('enemy',['シールドオーガ']); const u=g.enemy.board[0]; u.canAttack=true; u.attacksLeft=1; u.summoningSickness=false; g.player.bladeBodyAuraV254=true; g.selectedAttacker={side:'enemy',pos:0}; T.attackLeader('player'); return T.boardSnapshotV255(); })()
""", timeout=30)
        test(results,'やいばのボディ: 味方リーダーが攻撃された時、攻撃側に1ダメージ反撃', lambda:{'ok': A.eval('window.__DQR_TEST__.boardSnapshotV255().enemy[0].hp')==3, 'snap':A.eval('window.__DQR_TEST__.boardSnapshotV255()')})

        # Dolmages local duration.
        setup(A,'A',True)
        A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setPlayerHandByNames(['イオナズン']); const before=T.boardSnapshotV255().handCosts[0].cost; const c=T.state.allCards.find(x=>x.name==='魔性の道化師ドルマゲス'); T.summonUnitFromHandToBoard(c,0,10); const after=T.boardSnapshotV255().handCosts[0].cost; T.handleOpponentTurnEndEvent({side:'enemy'}); const cleared=T.boardSnapshotV255().handCosts[0].cost; return {before,after,cleared,snap:T.boardSnapshotV255()}; })()
""", timeout=30)
        test(results,'魔性の道化師ドルマゲス: 自分召喚時、特技コスト-5は相手ターン終了時に戻る', lambda:{'ok': (lambda r: r['before']>=5 and r['after']==max(0,r['before']-5) and r['cleared']==r['before'])(A.eval("(()=>{ const T=window.__DQR_TEST__; return {before:7, after:T.boardSnapshotV255().handCosts[0].cost, cleared:T.boardSnapshotV255().handCosts[0].cost}; })()")), 'snap':A.eval('window.__DQR_TEST__.boardSnapshotV255()')})
        # re-run exact local Dolmages with returned values, because previous lambda cannot see temporary result after clear. Keep a simpler direct deterministic check.
        setup(A,'A',True)
        dol=A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setPlayerHandByNames(['イオナズン']); const before=T.boardSnapshotV255().handCosts[0].cost; const c=T.state.allCards.find(x=>x.name==='魔性の道化師ドルマゲス'); T.summonUnitFromHandToBoard(c,0,10); const after=T.boardSnapshotV255().handCosts[0].cost; T.handleOpponentTurnEndEvent({side:'enemy'}); const cleared=T.boardSnapshotV255().handCosts[0].cost; return {before,after,cleared}; })()
""", timeout=30)
        results[-1]={'name':'魔性の道化師ドルマゲス: 自分召喚時、特技コスト-5は相手ターン終了時に戻る','ok': dol['after']==max(0,dol['before']-5) and dol['cleared']==dol['before'],'detail':dol}

        # Dolmages remote action replay applies local hand discount and clears on own turn end.
        setup(A,'A',True); setup(B,'B',False)
        B.eval("window.__DQR_TEST__.setPlayerHandByNames(['イオナズン']);", timeout=20)
        A.eval("(()=>{ const T=window.__DQR_TEST__; const c=T.state.allCards.find(x=>x.name==='魔性の道化師ドルマゲス'); T.summonUnitFromHandToBoard(c,0,10); })()", timeout=20)
        actions=bridge(A,B,'dolmages_remote')
        remote_before=B.eval('window.__DQR_TEST__.boardSnapshotV255().handCosts[0].cost')
        B.eval('window.__DQR_TEST__.handleOwnTurnEndEvent({side:"player"})', timeout=20)
        remote_after=B.eval('window.__DQR_TEST__.boardSnapshotV255().handCosts[0].cost')
        test(results,'魔性の道化師ドルマゲス: action replayで相手側にも特技コスト-5が入り、自分ターン終了時に戻る', lambda:{'ok': remote_before==2 and remote_after==7 and any(a.get('type')=='unitSummoned' for a in actions), 'actions':[a.get('type') for a in actions], 'before':remote_before, 'after':remote_after})

        # Remote Kabau cardPlayed enforces attack restriction on opponent client.
        setup(A,'A',True); setup(B,'B',False)
        B.eval("window.__DQR_TEST__.setBoardByNames('player',['シールドオーガ']); window.__DQR_TEST__.setBoardByNames('enemy',['シールドオーガ']);", timeout=20)
        A.eval("(async()=>{ const T=window.__DQR_TEST__; const c=T.state.allCards.find(x=>x.name==='かばう'); await T.pushBattleAction('cardPlayed',{card:c,cost:1,side:'player'}); })()", timeout=20)
        actions=bridge(A,B,'kabau_remote')
        B.eval("(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; const u=g.player.board[0]; u.canAttack=true; u.attacksLeft=1; u.summoningSickness=false; T.attackUnit({side:'player',pos:0},{side:'enemy',pos:0}); })()", timeout=20)
        test(results,'かばう: cardPlayed action replay後、相手クライアントでもユニット攻撃を止める', lambda:{'ok': B.eval('window.__DQR_TEST__.boardSnapshotV255().enemy[0].hp')==4 and B.eval('window.__DQR_TEST__.boardSnapshotV255().flags.enemyKabau')==True, 'actions':[a.get('type') for a in actions], 'snap':B.eval('window.__DQR_TEST__.boardSnapshotV255()')})

        # Martial cards smoke tests.
        setup(A,'A',True)
        martial=A.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game;
  T.setBoardByNames('enemy',['シールドオーガ']);
  T.applyCardUseV166(T.state.allCards.find(c=>c.name==='タイガークロー'),2); T.applyPendingGenericEffectToUnit({side:'enemy',pos:0});
  const tiger=T.boardSnapshotV255().enemy[0].hp;
  T.applyCardUseV166(T.state.allCards.find(c=>c.name==='武術稽古'),2); const hand=T.boardSnapshotV255().hand;
  T.setBoardByNames('enemy',['シールドオーガ']); g.enemy.board[0].hp=4; T.applyCardUseV166(T.state.allCards.find(c=>c.name==='せいけん突き'),2); T.applyPendingGenericEffectToUnit({side:'enemy',pos:0}); const seiken=T.boardSnapshotV255().enemy[0];
  return {tiger, hand, seiken}; })()
""", timeout=30)
        test(results,'武闘家パス: タイガークロー/武術稽古/せいけん突きの基礎挙動', lambda:{'ok': martial['tiger']==1 and len(martial['hand'])>=2 and martial['seiken'] is None, 'detail':martial})

        exceptions=[]
        for c in clients:
            for e in c.events:
                if e.get('method')=='Runtime.exceptionThrown': exceptions.append(e.get('params',{}))
        summary={'mode':'v255 combat + Dolmages + Kabau PvP emulator','browsers':versions,'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'exceptions':exceptions[:10],'chromeLogs':logs}
        (ROOT/'data'/'v255_combat_dolmages_pvp_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2), encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        for p in procs:
            try: p.terminate(); p.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
