import json, os, subprocess, time, tempfile, urllib.request, sys, socket, re, copy
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORTS=[9262,9263]
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
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'PASTE_DISABLED_FOR_INLINE_V262_LONG_EMULATOR' };")
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
    profile=tempfile.mkdtemp(prefix=f'dqr_v262_chrome_{port}_')
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
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.boardSnapshotV255 && !!window.__DQR_TEST__?.v260', timeout=2): return proc,c,version,log_path
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError('app not ready')

def js(x): return json.dumps(x, ensure_ascii=False)

def test(results,name,func):
    try:
        d=func(); ok=bool(d.get('ok') if isinstance(d,dict) and 'ok' in d else d); results.append({'name':name,'ok':ok,'detail':d})
    except Exception as e: results.append({'name':name,'ok':False,'error':str(e)})

def setup_pair(A,B):
    A.eval("window.__DQR_TEST__.setupPvpTest('A', true)", timeout=20)
    B.eval("window.__DQR_TEST__.setupPvpTest('B', false)", timeout=20)
    for c in (A,B):
        c.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; g.player.hp=25; g.enemy.hp=25; g.player.mp=10; g.enemy.mp=10; g.player.maxMp=10; g.enemy.maxMp=10; g.player.hand=[]; g.enemy.hand=[]; g.player.deck=[]; g.enemy.deck=[]; g.player.board=[null,null,null,null,null,null]; g.enemy.board=[null,null,null,null,null,null]; g.player.weapon=null; g.enemy.weapon=null; g.player.tension=0; g.enemy.tension=0; return true;})()", timeout=20)

def set_turn(c, active=True):
    c.eval(f"(()=>{{const T=window.__DQR_TEST__, g=T.state.battle.game; T.state.battle.matchLocked={str((not active)).lower()}; g.isMyTurn={str(active).lower()}; g.currentTurnPlayerId=T.state.playerId; g.player.mp=10; g.player.maxMp=10; return true;}})()", timeout=10)

def bridge(src,dst,label='bridge'):
    actions=src.eval('window.__DQR_TEST__.drainOutbox()', timeout=10) or []
    for i,a in enumerate(actions):
        dst.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js(label+'_'+str(i))})", timeout=30)
    return actions

COMPACT_JS = """
(()=>{ const T=window.__DQR_TEST__; const s=T.boardSnapshotV255 ? T.boardSnapshotV255() : T.boardSnapshot(); const terr=T.v260?.terrainSnapshot?.() || {player:[], enemy:[]};
 const unit=u=>u?{name:u.name,hp:Number(u.hp||0),attack:Number(u.attack||0)}:null;
 const weap=w=>w?{name:w.name,attack:Number(w.attack||0),durability:Number(w.durability||0)}:null;
 return {playerHp:s.playerHp, enemyHp:s.enemyHp, player:s.player.map(unit), enemy:s.enemy.map(unit), playerWeapon:weap(s.playerWeapon), enemyWeapon:weap(s.enemyWeapon), tension:s.tension||0, enemyTension:s.enemyTension||0, terrainPlayer:(terr.player||[]).map(t=>t?{type:t.type||t.name||'',durability:t.durability||null}:null), terrainEnemy:(terr.enemy||[]).map(t=>t?{type:t.type||t.name||'',durability:t.durability||null}:null), hand:s.hand||[], log:(T.state.battle.game.log||[]).slice(-5)}; })()
"""

def snap(c): return c.eval(COMPACT_JS, timeout=10)

def mirror_ok(A_snap,B_snap):
    return (A_snap['playerHp']==B_snap['enemyHp'] and A_snap['enemyHp']==B_snap['playerHp'] and A_snap['player']==B_snap['enemy'] and A_snap['enemy']==B_snap['player'] and A_snap['playerWeapon']==B_snap['enemyWeapon'] and A_snap['enemyWeapon']==B_snap['playerWeapon'] and A_snap['terrainPlayer']==B_snap['terrainEnemy'] and A_snap['terrainEnemy']==B_snap['terrainPlayer'])

def mirror_detail(A,B):
    a=snap(A); b=snap(B); return {'ok':mirror_ok(a,b), 'A':a, 'B':b}

def main():
    html=build_inline_html(); procs=[]; clients=[]; versions=[]; logs=[]; results=[]; step_log=[]
    try:
        for p in PORTS:
            proc,c,ver,log=launch(p,html); procs.append(proc); clients.append(c); versions.append(ver.get('Browser')); logs.append(log)
        A,B=clients
        test(results,'boot: 2 Chromium clients + v260/v261 hooks', lambda:{'ok':A.eval('!!window.__DQR_TEST__.v260') and B.eval('!!window.__DQR_TEST__.v260'), 'cards':A.eval('window.__DQR_TEST__.state.allCards.length'), 'pendingUnresolved':A.eval("(()=>{try{ return window.__DQR_TEST__.state.allCards.filter(c=>false).length }catch(e){return -1}})()")})
        setup_pair(A,B)
        test(results,'initial mirror after pair setup', lambda:mirror_detail(A,B))

        # Long rolling match: 48 deterministic actions across both clients.
        unit_names=['スライム','ドラキー','いたずらもぐら','おばけキャンドル','バブルスライム','シールドオーガ','メラゴースト','おおくちばし']
        failures=[]
        for i in range(48):
            actor,other=(A,B) if i%2==0 else (B,A)
            label_actor='A' if i%2==0 else 'B'
            set_turn(actor, True); set_turn(other, False)
            op=i%8
            if op in (0,1,2):
                nm=unit_names[(i+op)%len(unit_names)]
                code=f"""(()=>{{ const T=window.__DQR_TEST__, g=T.state.battle.game; const empty=g.player.board.findIndex(x=>!x); if(empty<0){{ g.player.board[0]=null; }} const pos=g.player.board.findIndex(x=>!x); T.setPlayerHandByNames([{js(nm)}]); T.selectHandCard(0); T.handleEmptySlotClick('player', pos); return {{op:'summon', name:{js(nm)}, pos, snap:T.boardSnapshotV255()}}; }})()"""
            elif op==3:
                code="""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; let p=g.player.board.findIndex(u=>u&&!u.isBuilding); if(p<0){ const c=T.findCardByName('シールドオーガ'); g.player.board[0]=T.makeUnitFromCard(c); p=0; } const u=g.player.board[p]; u.canAttack=true; u.attacksLeft=1; u.summoningSickness=false; g.selectedAttacker={side:'player',pos:p}; T.attackLeader('enemy'); return {op:'unitAttackLeader', pos:p, snap:T.boardSnapshotV255()}; })()"""
            elif op==4:
                code="""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; if(!g.enemy.board[0]) return {op:'bloodKnifeSkipNoTarget', snap:T.boardSnapshotV255()}; g.player.weapon={name:'ブラッドナイフ',attack:2,durability:3,maxDurability:3,counterDamageReduction:1}; g.player.leaderAttack=2; g.player.leaderCanAttack=true; g.selectedAttacker={side:'playerLeader'}; T.attackUnit({side:'playerLeader'},{side:'enemy',pos:0}); return {op:'bloodKnifeAttackUnit', snap:T.boardSnapshotV255()}; })()"""
            elif op==5:
                code="""(()=>{ const T=window.__DQR_TEST__; T.v260.chooseTerrain('天啓の神域','運命の分岐点'); const labels=T.choiceLabels(); if(labels[0]) T.clickChoiceByText(labels[0]); return {op:'terrainChoice', labels, terrain:T.v260.terrainSnapshot()}; })()"""
            elif op==6:
                code="""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setPlayerHandByNames(['妖精サンディ']); T.discardHandCardAtIndex(0,'長期戦テスト'); return {op:'discardSandy', snap:T.boardSnapshotV255()}; })()"""
            else:
                code="""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.emitBattleEvent('ownTurnEnd',{side:'player'}); T.emitBattleEvent('ownTurnStart',{side:'player'}); return {op:'turnEndStartEvents', turn:g.turn, snap:T.boardSnapshotV255()}; })()"""
            detail=actor.eval(code, timeout=40)
            actions=bridge(actor,other,f'long_{i}_{label_actor}')
            md=mirror_detail(A,B)
            step={'step':i,'actor':label_actor,'op':detail.get('op') if isinstance(detail,dict) else None,'actions':[a.get('type') for a in actions], 'mirrorOk':md['ok']}
            if not md['ok']:
                step['mirror']=md; failures.append(step)
                break
            step_log.append(step)
        test(results,'long rolling PvP kernel: 48 consecutive cross-client actions stay mirrored', lambda:{'ok':len(failures)==0 and len(step_log)==48, 'steps':len(step_log), 'sample':step_log[:8], 'last':step_log[-5:], 'failures':failures[:1]})

        # Heavy effect core scenarios in same two clients, with pair reset per block but same browsers.
        def reset_and_pair():
            setup_pair(A,B)
        # Dolmages duration + remote
        reset_and_pair(); B.eval("window.__DQR_TEST__.setPlayerHandByNames(['イオナズン']);", timeout=20); A.eval("(()=>{ const T=window.__DQR_TEST__; const c=T.findCardByName('魔性の道化師ドルマゲス'); T.summonUnitFromHandToBoard(c,0,10); })()", timeout=30); acts=bridge(A,B,'v262_dolmages')
        before=B.eval('window.__DQR_TEST__.boardSnapshotV255().handCosts[0].cost', timeout=10); B.eval('window.__DQR_TEST__.handleOwnTurnEndEvent({side:"player"})', timeout=20); after=B.eval('window.__DQR_TEST__.boardSnapshotV255().handCosts[0].cost', timeout=10)
        test(results,'heavy core: ドルマゲス cost -5 is remote-applied and expires at affected player turn end', lambda:{'ok':before==2 and after==7, 'before':before, 'after':after, 'actions':[a.get('type') for a in acts]})
        # Kandata kobun next tension cost this turn only
        reset_and_pair(); k=A.eval("""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; g.player.mp=10; g.player.tension=0; T.v258.applyKandakobunBet(); const before=g.player.mp; T.useOrChargeTension(); const after=g.player.mp; T.emitBattleEvent('ownTurnEnd',{side:'player'}); const flag=!!g.player.nextTensionCostZero; return {before,after,tension:g.player.tension,flag}; })()""", timeout=30)
        test(results,'heavy core: カンダタこぶん is next charge-cost zero and resets across turn', lambda:{'ok':k['before']==10 and k['after']==10 and k['tension']>=1 and not k['flag'], 'detail':k})
        # Buorn immunity + splash smoke
        reset_and_pair(); bu=A.eval("""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; const c=T.findCardByName('ブオーン'); const u=T.summonUnitFromHandToBoard(c,0,10); T.setBoardByNames('enemy',['スライム','ドラキー']); if(g.player.board[0]){ g.player.board[0].canAttack=true; g.player.board[0].attacksLeft=1; g.player.board[0].summoningSickness=false; g.selectedAttacker={side:'player',pos:0}; T.attackUnit({side:'player',pos:0},{side:'enemy',pos:0}); } return T.boardSnapshotV255(); })()""", timeout=40); bridge(A,B,'v262_buorn')
        test(results,'heavy core: ブオーン attack/splash path survives PvP action replay', lambda:{'ok': mirror_detail(A,B)['ok'], 'A':snap(A), 'B':snap(B)})
        # Sandy dungeon-only retained after reset
        reset_and_pair(); A.eval("""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; const dungeon=T.makeUnitFromCard(T.findCardByName('不思議のダンジョン')); dungeon.isBuilding=true; dungeon.isDungeonV259=true; dungeon.durability=2; const building={id:'plain_building',name:'ただの建物',isBuilding:true,durability:2,hp:4,maxHp:4}; const sandy=T.makeUnitFromCard(T.findCardByName('妖精サンディ')); sandy.sandyDeathDungeonBuffV259=true; g.player.board[0]=dungeon; g.player.board[1]=building; g.player.board[2]=sandy; T.applyDeathrattle(sandy,'player'); return true; })()""", timeout=30); acts=bridge(A,B,'v262_sandy_dungeon')
        sandy=A.eval("(()=>{const b=window.__DQR_TEST__.state.battle.game.player.board; return {d:b[0]?.durability, plain:b[1]?.durability, reward:b[0]?.sandyRewardV259===true};})()", timeout=10)
        test(results,'heavy core: 妖精サンディ death buff remains dungeon-only', lambda:{'ok':sandy['d']==3 and sandy['plain']==2 and sandy['reward'], 'detail':sandy, 'actions':[a.get('type') for a in acts]})

        exceptions=[]
        for c in clients:
            for e in c.events:
                if e.get('method')=='Runtime.exceptionThrown': exceptions.append(e.get('params',{}))
        summary={'mode':'v262 long two-client PvP kernel verification','browserVersions':versions,'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'longStepLog':step_log,'exceptions':exceptions[:10],'chromeLogs':logs}
        (ROOT/'data'/'v262_long_pvp_kernel_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2), encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        for p in procs:
            try: p.terminate(); p.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
