import json, os, subprocess, time, tempfile, urllib.request, sys, socket, re, random
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORTS=[9363,9364]
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
        if 'exceptionDetails' in res: raise RuntimeError(json.dumps(res['exceptionDetails'],ensure_ascii=False)[:6000])
        return res.get('result',{}).get('value')

def wait_json(url, tries=160):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=1) as r: return json.loads(r.read().decode())
        except Exception: time.sleep(0.1)
    raise RuntimeError('not ready '+url)

def build_inline_html():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<script type="module" src="\.\/js\/app\.js"><\/script>','',html)
    app=(ROOT/'js'/'app.js').read_text(encoding='utf-8')
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'INLINE_DISABLED_V263_SOAK' };")
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
  key = key.replace(/^https?:\/\/[^/]+\//, './');
  if(!key.startsWith('./') && key.startsWith('data/')) key = './' + key;
  if(window.__DQR_INLINE_DATA__[key]) return new Response(JSON.stringify(window.__DQR_INLINE_DATA__[key]), {status:200, headers:{'Content-Type':'application/json'}});
  return __nativeFetch(url, opts);
};
</script>
""".replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',',':')))
    return html.replace('</body>', boot+'<script type="module">\n'+app+'\n</script></body>')

def launch(port, html):
    profile=tempfile.mkdtemp(prefix=f'dqr_v263_chrome_{port}_')
    log_path=tempfile.NamedTemporaryFile('w+',delete=False).name
    log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={port}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'],stdout=log,stderr=log)
    version=wait_json(f'http://127.0.0.1:{port}/json/version')
    pages=wait_json(f'http://127.0.0.1:{port}/json/list')
    page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], port); c.call('Runtime.enable'); c.call('Page.enable')
    frame_id=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame_id,'html':html}, timeout=180)
    for _ in range(220):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.v263 && !!window.__DQR_TEST__?.boardSnapshotV255', timeout=2):
                return proc,c,version,log_path
        except Exception: pass
        time.sleep(0.15)
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
        c.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; g.player.hp=25; g.enemy.hp=25; g.player.mp=10; g.enemy.mp=10; g.player.maxMp=10; g.enemy.maxMp=10; g.player.hand=[]; g.enemy.hand=[]; g.player.deck=[]; g.enemy.deck=[]; g.player.board=[null,null,null,null,null,null]; g.enemy.board=[null,null,null,null,null,null]; g.player.weapon=null; g.enemy.weapon=null; g.player.tension=0; g.enemy.tension=0; g.player.heroSkill=null; g.player.heroLevel=0; g.enemy._v263ProtectedSlots={}; return true;})()", timeout=20)

def set_turn(c, active=True):
    c.eval(f"(()=>{{const T=window.__DQR_TEST__, g=T.state.battle.game; T.state.battle.matchLocked={str((not active)).lower()}; g.isMyTurn={str(active).lower()}; g.currentTurnPlayerId=T.state.playerId; g.player.mp=10; g.player.maxMp=10; return true;}})()", timeout=10)

def bridge(src,dst,label='bridge'):
    actions=src.eval('window.__DQR_TEST__.drainOutbox()', timeout=10) or []
    for i,a in enumerate(actions):
        dst.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js(label+'_'+str(i))})", timeout=40)
    return actions

SNAP_JS="""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game;
 const unit=u=>u?{name:u.name,hp:Number(u.hp||0),maxHp:Number(u.maxHp||0),attack:Number(u.attack||0),id:u.id||'',taunt:!!(u.keywords&&u.keywords.taunt),building:!!u.isBuilding,durability:Number(u.durability||0)}:null;
 const weap=w=>w?{name:w.name,attack:Number(w.attack||0),durability:Number(w.durability||0)}:null;
 return {playerHp:g.player.hp, enemyHp:g.enemy.hp, player:g.player.board.map(unit), enemy:g.enemy.board.map(unit), playerWeapon:weap(g.player.weapon), enemyWeapon:weap(g.enemy.weapon), tension:g.player.tension, enemyTension:g.enemy.tension, protected:T.v263.protectedSlots(), log:(g.log||[]).slice(-4)}; })()
"""

def snap(c): return c.eval(SNAP_JS, timeout=10)
def mirror_ok(a,b):
    return a['playerHp']==b['enemyHp'] and a['enemyHp']==b['playerHp'] and a['player']==b['enemy'] and a['enemy']==b['player'] and a['playerWeapon']==b['enemyWeapon'] and a['enemyWeapon']==b['playerWeapon'] and a['tension']==b['enemyTension'] and a['enemyTension']==b['tension']
def mirror_detail(A,B):
    a=snap(A); b=snap(B); return {'ok':mirror_ok(a,b),'A':a,'B':b}

def main():
    html=build_inline_html(); procs=[]; clients=[]; versions=[]; logs=[]; results=[]; soak_logs=[]
    try:
        for p in PORTS:
            proc,c,ver,log=launch(p,html); procs.append(proc); clients.append(c); versions.append(ver.get('Browser')); logs.append(log)
        A,B=clients
        test(results,'boot: two Chromium clients with v263 hooks', lambda:{'ok':A.eval('!!window.__DQR_TEST__.v263') and B.eval('!!window.__DQR_TEST__.v263'), 'cards':A.eval('window.__DQR_TEST__.state.allCards.length')})

        def seagolem_case():
            setup_pair(A,B)
            stale=A.eval('window.__DQR_TEST__.publicStateForTestV254()', timeout=10)
            A.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; g.player.heroSkill={heroCardName:'勇者エイト',level:1,currentCardName:'小さな相棒'}; g.player.heroLevel=1; const c=T.findCardByName('シーゴーレム'); const u=T.summonUnitFromHandToBoard(c,0,3); return {name:u.name,hp:u.hp,maxHp:u.maxHp,taunt:!!u.keywords.taunt};})()", timeout=30)
            actions=bridge(A,B,'v263_seagolem')
            after_action=snap(B)
            B.eval(f"window.__DQR_TEST__.applyOpponentPublicStateV254({js(stale)})", timeout=20)
            after_stale=snap(B)
            A.eval("window.__DQR_TEST__.emitBattleEvent('ownTurnEnd',{side:'player'})", timeout=20)
            more=bridge(A,B,'v263_seagolem_turn')
            after_turn=snap(B)
            unit=after_turn['enemy'][0]
            return {'ok': unit and unit['name']=='シーゴーレム' and unit['hp']==6 and unit['maxHp']==6 and unit['taunt'], 'actions':[a['type'] for a in actions], 'turnActions':[a['type'] for a in more], 'afterAction':after_action, 'afterStaleSnapshot':after_stale, 'afterTurn':after_turn}
        test(results,'repro fix: シーゴーレム keeps hero HP+2/taunt remotely and survives stale state + turn change', seagolem_case)

        # Soak: many small matches with summons, attacks, weapon, turn events, and occasional stale snapshots.
        unit_names=['シーゴーレム','スライム','ドラキー','いたずらもぐら','おばけキャンドル','バブルスライム','シールドオーガ','メラゴースト','おおくちばし','リリパット','ヘルゴースト']
        failures=[]; total_steps=0
        for match in range(18):
            setup_pair(A,B)
            staleA=A.eval('window.__DQR_TEST__.publicStateForTestV254()', timeout=10)
            staleB=B.eval('window.__DQR_TEST__.publicStateForTestV254()', timeout=10)
            for step in range(55):
                actor,other=(A,B) if step%2==0 else (B,A)
                actorLabel='A' if step%2==0 else 'B'
                set_turn(actor, True); set_turn(other, False)
                op=step%10
                if op in (0,1,2,3):
                    nm=unit_names[(match*7+step)%len(unit_names)]
                    hero = "g.player.heroSkill={heroCardName:'勇者エイト',level:1,currentCardName:'小さな相棒'}; g.player.heroLevel=1;" if nm=='シーゴーレム' else ""
                    detail=actor.eval(f"(()=>{{const T=window.__DQR_TEST__, g=T.state.battle.game; {hero} let pos=g.player.board.findIndex(x=>!x); if(pos<0){{g.player.board[{step%6}]=null; pos={step%6};}} const c=T.findCardByName({js(nm)}); const u=T.summonUnitFromHandToBoard(c,pos,Number(c.cost||0)); return {{op:'summon',name:{js(nm)},pos,hp:u.hp,maxHp:u.maxHp}};}})()", timeout=40)
                elif op==4:
                    detail=actor.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; const p=g.player.board.findIndex(u=>u&&!u.isBuilding); if(p<0)return {op:'attackSkip'}; const u=g.player.board[p]; u.canAttack=true; u.attacksLeft=1; u.summoningSickness=false; g.selectedAttacker={side:'player',pos:p}; T.attackLeader('enemy'); return {op:'attackLeader',pos:p};})()", timeout=40)
                elif op==5:
                    detail=actor.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; const p=g.player.board.findIndex(u=>u&&!u.isBuilding); const q=g.enemy.board.findIndex(u=>u&&!u.isBuilding); if(p<0||q<0)return {op:'unitAttackSkip'}; const u=g.player.board[p]; u.canAttack=true; u.attacksLeft=1; u.summoningSickness=false; g.selectedAttacker={side:'player',pos:p}; T.attackUnit({side:'player',pos:p},{side:'enemy',pos:q}); return {op:'unitAttackUnit', p, q};})()", timeout=40)
                elif op==6:
                    detail=actor.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.emitBattleEvent('ownTurnEnd',{side:'player'}); T.emitBattleEvent('ownTurnStart',{side:'player'}); return {op:'turnEvents'};})()", timeout=30)
                elif op==7:
                    # intentionally apply an older public state after action replay protection has existed
                    detail={'op':'staleSnapshot'}
                    target = other
                    stale = staleA if actorLabel=='B' else staleB
                    target.eval(f"window.__DQR_TEST__.applyOpponentPublicStateV254({js(stale)})", timeout=20)
                elif op==8:
                    detail=actor.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.setPlayerHandByNames(['妖精サンディ']); T.discardHandCardAtIndex(0,'soak'); return {op:'discardSandy', board:T.boardSnapshotV255().player};})()", timeout=40)
                else:
                    detail=actor.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; if(g.player.board[0]){ T.dealDamageToUnit(g.player.board[0],1,'soak','player'); } return {op:'selfDamage'};})()", timeout=30)
                actions=bridge(actor,other,f'v263_soak_{match}_{step}_{actorLabel}')
                md=mirror_detail(A,B)
                total_steps+=1
                rec={'match':match,'step':step,'actor':actorLabel,'op':detail.get('op') if isinstance(detail,dict) else None,'actions':[a.get('type') for a in actions],'ok':md['ok']}
                soak_logs.append(rec)
                if not md['ok']:
                    rec['mirror']=md; failures.append(rec); break
            if failures: break
        test(results,'soak: 18 matches x 55 steps with two-client action replay stay mirrored', lambda:{'ok':not failures and total_steps==18*55, 'steps':total_steps, 'sample':soak_logs[:10], 'last':soak_logs[-10:], 'failures':failures[:1]})

        exceptions=[]
        for c in clients:
            for e in c.events:
                if e.get('method')=='Runtime.exceptionThrown': exceptions.append(e.get('params',{}))
        summary={'mode':'v263 two-client soak and summon-state verification','browserVersions':versions,'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'soakLogSample':soak_logs[:30],'soakLogTail':soak_logs[-30:],'exceptions':exceptions[:12],'chromeLogs':logs}
        (ROOT/'data'/'v263_soak_pvp_summon_state_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2), encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        for p in procs:
            try: p.terminate(); p.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
