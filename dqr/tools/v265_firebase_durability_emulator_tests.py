import json, os, subprocess, time, tempfile, urllib.request, sys, socket, re
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORTS=[9565,9566]

def firebase_connectivity_probe():
    out=[]
    for url in ['https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js','https://dqr-sample-default-rtdb.firebaseio.com/.json']:
        t=time.time()
        try:
            with urllib.request.urlopen(url, timeout=8) as r:
                out.append({'url':url,'ok':True,'status':getattr(r,'status',None),'bytesRead':len(r.read(200)),'seconds':round(time.time()-t,3)})
        except Exception as e:
            out.append({'url':url,'ok':False,'error':type(e).__name__+': '+str(e),'seconds':round(time.time()-t,3)})
    return out

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
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<script type="module" src="\.\/js\/app\.js"><\/script>','',html)
    app=(ROOT/'js'/'app.js').read_text(encoding='utf-8')
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'INLINE_DISABLED_V265' };")
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
  const raw = String(url || ''); let key = raw.split('?')[0];
  key = key.replace(/^https?:\\/\\/[^/]+\\//, './');
  if(!key.startsWith('./') && key.startsWith('data/')) key = './' + key;
  if(window.__DQR_INLINE_DATA__[key]) return new Response(JSON.stringify(window.__DQR_INLINE_DATA__[key]), {status:200, headers:{'Content-Type':'application/json'}});
  return __nativeFetch(url, opts);
};
</script>
""".replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',',':')))
    return html.replace('</body>', boot+'<script type="module">\n'+app+'\n</script></body>')

def launch(port, html):
    profile=tempfile.mkdtemp(prefix=f'dqr_v265_chrome_{port}_')
    log_path=tempfile.NamedTemporaryFile('w+',delete=False).name
    log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={port}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'],stdout=log,stderr=log)
    version=wait_json(f'http://127.0.0.1:{port}/json/version')
    page=wait_json(f'http://127.0.0.1:{port}/json/list')[0]
    c=CDP(page['webSocketDebuggerUrl'], port); c.call('Runtime.enable'); c.call('Page.enable')
    c.call('Emulation.setDeviceMetricsOverride', {'width':844,'height':390,'deviceScaleFactor':3,'mobile':True}, timeout=10)
    frame_id=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame_id,'html':html}, timeout=180)
    for _ in range(220):
        try:
            ready=c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.v265 && !!window.__DQR_TEST__?.v264 && !!window.__DQR_TEST__?.v263', timeout=2)
            if ready: return proc,c,version,log_path
        except Exception: pass
        time.sleep(0.15)
    raise RuntimeError('app not ready')

def js(x): return json.dumps(x, ensure_ascii=False)

def test(results,name,func):
    try:
        d=func(); ok=bool(d.get('ok') if isinstance(d,dict) and 'ok' in d else d); results.append({'name':name,'ok':ok,'detail':d})
        print(('PASS' if ok else 'FAIL'), name, flush=True)
    except Exception as e:
        results.append({'name':name,'ok':False,'error':str(e)})
        print('ERROR', name, e, flush=True)

def setup_pair(A,B):
    A.eval("window.__DQR_TEST__.setupPvpTest('A', true)", timeout=20)
    B.eval("window.__DQR_TEST__.setupPvpTest('B', false)", timeout=20)
    for c in (A,B):
        c.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; g.player.hp=25; g.enemy.hp=25; g.player.mp=10; g.enemy.mp=10; g.player.maxMp=10; g.enemy.maxMp=10; g.player.hand=[]; g.enemy.hand=[]; g.player.deck=[]; g.enemy.deck=[]; g.player.board=[null,null,null,null,null,null]; g.enemy.board=[null,null,null,null,null,null]; g.player.weapon=null; g.enemy.weapon=null; g.player.tension=0; g.enemy.tension=0; g._v264AppliedRemoteActionIds=Object.create(null); return true;})()", timeout=20)

def bridge(src,dst,label='bridge', duplicate_first=False):
    actions=src.eval('window.__DQR_TEST__.drainOutbox()', timeout=10) or []
    for i,a in enumerate(actions):
        action_id=f'{label}_{i}'
        dst.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js(action_id)})", timeout=40)
        if duplicate_first:
            dst.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js(action_id)})", timeout=40)
    return actions

SNAP_JS="""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game;
 const unit=u=>u?{name:u.name,hp:Number(u.hp||0),maxHp:Number(u.maxHp||0),attack:Number(u.attack||0),keywords:u.keywords||{},statuses:u.statuses||[],isDungeon:!!(u.isDungeon||u.isDungeonV259),building:!!u.isBuilding}:null;
 return {playerHp:g.player.hp, enemyHp:g.enemy.hp, player:g.player.board.map(unit), enemy:g.enemy.board.map(unit), hand:g.player.hand.map(id=>T.byId(id)?.name||id), enemyHand:g.enemy.hand?.map(id=>T.byId(id)?.name||id)||[], enemyHandCount:g.enemy.handCount, seq:T.v265.seq(), watermarks:T.v265.watermarks(), ui:T.v264.enemyHandUiState()}; })()
"""
def snap(c): return c.eval(SNAP_JS, timeout=10)
def mirror_ok(a,b): return a['playerHp']==b['enemyHp'] and a['enemyHp']==b['playerHp'] and a['player']==b['enemy'] and a['enemy']==b['player']
def mirror_detail(A,B):
    a=snap(A); b=snap(B); return {'ok':mirror_ok(a,b),'A':a,'B':b}

def main():
    html=build_inline_html(); procs=[]; clients=[]; versions=[]; logs=[]; results=[]; soak_steps=[]
    connectivity=firebase_connectivity_probe()
    print('connectivity', json.dumps(connectivity,ensure_ascii=False), flush=True)
    try:
        for p in PORTS:
            proc,c,ver,log=launch(p,html); procs.append(proc); clients.append(c); versions.append(ver.get('Browser')); logs.append(log)
        A,B=clients
        test(results,'boot: v265 hooks are present on two mobile Chromium clients', lambda:{'ok':A.eval('!!window.__DQR_TEST__.v265 && !!window.__DQR_TEST__.v264 && !!window.__DQR_TEST__.v263') and B.eval('!!window.__DQR_TEST__.v265'), 'cards':A.eval('window.__DQR_TEST__.state.allCards.length')})

        def public_state_redacts_hand_ids():
            setup_pair(A,B)
            detail=A.eval("""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setPlayerHandByNames(['メラ','シーゴーレム','妖精サンディ']); return {hand:T.state.battle.game.player.hand.map(id=>T.byId(id)?.name), publicHandIds:T.v265.visibleHandIdsForPublicState(), seqBefore:T.v265.seq(), stateSeq:T.v265.nextStateSeq(), seqAfter:T.v265.seq()}; })()""", timeout=20)
            return {'ok':detail['hand']==['メラ','シーゴーレム','妖精サンディ'] and detail['publicHandIds']==[] and detail['seqAfter']==detail['seqBefore']+1, **detail}
        test(results,'public state privacy: PvP handIds are redacted while handCount can remain', public_state_redacts_hand_ids)

        def leaked_old_client_hand_ids_are_ignored():
            setup_pair(A,B)
            detail=A.eval("""(()=>{ const T=window.__DQR_TEST__; const slime=T.findCardByName('スライム'); const mel=T.findCardByName('メラ'); const sea=T.findCardByName('シーゴーレム'); const unit=T.makeUnitFromCard ? T.makeUnitFromCard(slime) : {name:'スライム',cardId:slime.id,attack:1,hp:1,maxHp:1}; T.applyRemoteOpponentState({B:{playerId:'B',sessionId:T.state.battle.sessionId, hp:21, maxMp:2, mp:1, tension:2, board:[unit,null,null,null,null,null], handIds:[mel.id,sea.id], handCount:2, stateSeq:3, clientUpdatedAt:3000, actionReplayReady:true, actionReducerReady:true}}); return {snap:T.boardSnapshotV255?T.boardSnapshotV255():T.boardSnapshot(), hand:T.state.battle.game.enemy.hand.map(id=>T.byId(id)?.name||id), handCount:T.state.battle.game.enemy.handCount, wm:T.v265.watermarks()}; })()""", timeout=30)
            ok=detail['hand']==[] and detail['handCount']==2 and detail['snap']['enemy'][0]['name']=='スライム' and detail['wm']['B']['seq']==3
            return {'ok':ok, **detail}
        test(results,'remote public state: old-client leaked handIds are ignored by v265 receiver', leaked_old_client_hand_ids_are_ignored)

        def stale_firebase_snapshot_rejected():
            setup_pair(A,B)
            detail=A.eval("""(()=>{ const T=window.__DQR_TEST__; const slime=T.findCardByName('スライム'); const sea=T.findCardByName('シーゴーレム'); const u1=T.makeUnitFromCard(slime); const u2=T.makeUnitFromCard(sea); T.applyRemoteOpponentState({B:{playerId:'B',sessionId:T.state.battle.sessionId,hp:22,board:[u1,null,null,null,null,null],handCount:1,stateSeq:5,clientUpdatedAt:5000,actionReplayReady:true,actionReducerReady:true}}); const afterNew=T.boardSnapshotV255?T.boardSnapshotV255():T.boardSnapshot(); T.applyRemoteOpponentState({B:{playerId:'B',sessionId:T.state.battle.sessionId,hp:10,board:[null,null,null,null,null,null],handCount:9,stateSeq:4,clientUpdatedAt:4000,actionReplayReady:true,actionReducerReady:true}}); const afterOld=T.boardSnapshotV255?T.boardSnapshotV255():T.boardSnapshot(); T.applyRemoteOpponentState({B:{playerId:'B',sessionId:T.state.battle.sessionId,hp:18,board:[u2,null,null,null,null,null],handCount:2,stateSeq:6,clientUpdatedAt:6000,actionReplayReady:true,actionReducerReady:true}}); const afterNewest=T.boardSnapshotV255?T.boardSnapshotV255():T.boardSnapshot(); return {afterNew, afterOld, afterNewest, wm:T.v265.watermarks(), log:T.getLog().slice(-8)}; })()""", timeout=40)
            ok=detail['afterNew']['enemy'][0]['name']=='スライム' and detail['afterOld']['enemy'][0]['name']=='スライム' and detail['afterOld']['enemyHp']==22 and detail['afterNewest']['enemy'][0]['name']=='シーゴーレム' and detail['afterNewest']['enemyHp']==18 and detail['wm']['B']['seq']==6
            return {'ok':ok, **detail}
        test(results,'Firebase snapshot ordering: stale lower stateSeq is rejected after reconnect/resubscribe', stale_firebase_snapshot_rejected)

        def duplicate_action_and_snapshot_mix_stays_once():
            setup_pair(A,B)
            A.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; g.player.heroSkill={name:'testHero'}; T.setPlayerHandByNames(['シーゴーレム']); T.selectHandCard(0); T.summonSelectedCard(0); return true;})()", timeout=40)
            actions=bridge(A,B,'v265_seagolem',duplicate_first=True)
            # Inject an older Firebase public state that would have deleted the replayed enemy board on older versions.
            stale=B.eval("(()=>{const T=window.__DQR_TEST__; T.applyRemoteOpponentState({A:{playerId:'A',sessionId:T.state.battle.sessionId,hp:25,board:[null,null,null,null,null,null],handCount:0,stateSeq:1,clientUpdatedAt:1000,actionReplayReady:true,actionReducerReady:true}}); return T.boardSnapshotV255?T.boardSnapshotV255():T.boardSnapshot();})()", timeout=30)
            b=snap(B)
            sea=b['enemy'][0]
            return {'ok':sea and sea['name']=='シーゴーレム' and sea['maxHp']>=6 and sea['keywords'].get('taunt')==True, 'actions':[a.get('type') for a in actions], 'staleSnap':stale, 'B':b}
        test(results,'Firebase mix: duplicated summon action + stale empty state does not delete シーゴーレム or lose HP+2/taunt', duplicate_action_and_snapshot_mix_stays_once)

        failures=[]
        unit_names=['シーゴーレム','スライム','ドラキー','バブルスライム','シールドオーガ','メラゴースト','リリパット']
        for match in range(8):
            setup_pair(A,B)
            A.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['シールドオーガ']); T.setBoardByNames('enemy',['シールドオーガ']); for(const u of [...g.player.board,...g.enemy.board]) if(u){u.hp=40;u.maxHp=40;} return true;})()", timeout=20)
            B.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['シールドオーガ']); T.setBoardByNames('enemy',['シールドオーガ']); for(const u of [...g.player.board,...g.enemy.board]) if(u){u.hp=40;u.maxHp=40;} return true;})()", timeout=20)
            for step in range(45):
                actor,other=(A,B) if step%2==0 else (B,A)
                label='A' if step%2==0 else 'B'
                actor.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.state.battle.matchLocked=false; g.isMyTurn=true; g.currentTurnPlayerId=T.state.playerId; g.player.mp=10; g.player.maxMp=10; return true;})()", timeout=10)
                other.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.state.battle.matchLocked=true; g.isMyTurn=false; return true;})()", timeout=10)
                op=step%6
                if op==0:
                    nm=unit_names[(match*7+step)%len(unit_names)]
                    code=f"(()=>{{ const T=window.__DQR_TEST__, g=T.state.battle.game; const pos=g.player.board.findIndex(x=>!x); const c=T.findCardByName({js(nm)}); if(c && pos>=0) T.summonUnitFromHandToBoard(c,pos,Number(c.cost||0)); return {{op:'summon', name:{js(nm)}, pos}}; }})()"
                elif op==1:
                    code="(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; if(g.enemy.board[0]){ g.pendingGenericEffect={kind:'damage',amount:1,source:'soakPing',target:'enemyUnit'}; T.applyPendingGenericEffectToUnit({side:'enemy',pos:0}); } return {op:'damage'}; })()"
                elif op==2:
                    code="(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; if(g.enemy.board[0]){ g.pendingGenericEffect={kind:'debuffStats',attack:-1,hp:0,source:'soakDebuff',target:'enemyUnit'}; T.applyPendingGenericEffectToUnit({side:'enemy',pos:0}); } return {op:'debuff'}; })()"
                elif op==3:
                    code="(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; let p=g.player.board.findIndex(u=>u&&!u.isBuilding); if(p>=0){ const u=g.player.board[p]; u.canAttack=true; u.attacksLeft=1; u.summoningSickness=false; g.selectedAttacker={side:'player',pos:p}; T.attackLeader('enemy'); } return {op:'attackLeader'}; })()"
                elif op==4:
                    code="(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.emitBattleEvent('ownTurnEnd',{side:'player'}); T.emitBattleEvent('ownTurnStart',{side:'player'}); return {op:'turn'}; })()"
                else:
                    # Simulate Firebase resubscribe receiving stale lower seq for actor.
                    code="(()=>{ const T=window.__DQR_TEST__; T.applyRemoteOpponentState({STALE:{playerId:'STALE',sessionId:'wrong',hp:1,board:[],handCount:9,stateSeq:0,clientUpdatedAt:1,actionReplayReady:true,actionReducerReady:true}}); return {op:'staleNoop'}; })()"
                detail=actor.eval(code, timeout=35)
                actions=bridge(actor, other, f'v265_soak_{match}_{step}_{label}', duplicate_first=True)
                md=mirror_detail(A,B)
                soak_steps.append({'match':match,'step':step,'actor':label,'op':detail.get('op') if isinstance(detail,dict) else None,'actions':[a.get('type') for a in actions], 'mirrorOk':md['ok']})
                if not md['ok']:
                    failures.append({'match':match,'step':step,'mirror':md,'detail':detail,'actions':[a.get('type') for a in actions]}); break
            if failures: break
        test(results,'Firebase-like long durability: duplicate actions + stale snapshots + turn churn stay mirrored', lambda:{'ok':len(failures)==0 and len(soak_steps)==360, 'steps':len(soak_steps), 'last':soak_steps[-5:], 'failures':failures[:1]})

        exceptions=[]
        for c in clients:
            for e in c.events:
                if e.get('method')=='Runtime.exceptionThrown': exceptions.append(e.get('params',{}))
        summary={'mode':'v265 firebase durability emulator','connectivityProbe':connectivity,'browserVersions':versions,'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'soakSteps':len(soak_steps),'exceptions':exceptions[:10],'chromeLogs':logs}
        (ROOT/'data'/'v265_firebase_durability_emulator_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        for p in procs:
            try: p.terminate(); p.wait(timeout=3)
            except Exception: pass

if __name__=='__main__': sys.exit(main())
