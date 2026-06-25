import json, os, subprocess, time, tempfile, urllib.request, sys, socket, re
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORTS=[9464,9465]
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

def wait_json(url, tries=180):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=1) as r: return json.loads(r.read().decode())
        except Exception: time.sleep(0.1)
    raise RuntimeError('not ready '+url)

def build_inline_html():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    html=re.sub(r'<script type="module" src="\.\/js\/app\.js"><\/script>','',html)
    app=(ROOT/'js'/'app.js').read_text(encoding='utf-8')
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'INLINE_DISABLED_V264' };")
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
    profile=tempfile.mkdtemp(prefix=f'dqr_v264_chrome_{port}_')
    log_path=tempfile.NamedTemporaryFile('w+',delete=False).name
    log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={port}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'],stdout=log,stderr=log)
    version=wait_json(f'http://127.0.0.1:{port}/json/version')
    pages=wait_json(f'http://127.0.0.1:{port}/json/list')
    page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], port); c.call('Runtime.enable'); c.call('Page.enable'); c.call('Emulation.setDeviceMetricsOverride', {'width':844,'height':390,'deviceScaleFactor':3,'mobile':True}, timeout=10)
    frame_id=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame_id,'html':html}, timeout=180)
    for _ in range(260):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.v264 && !!window.__DQR_TEST__?.v264b && !!window.__DQR_TEST__?.boardSnapshotV255', timeout=2):
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
        c.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; g.player.hp=25; g.enemy.hp=25; g.player.mp=10; g.enemy.mp=10; g.player.maxMp=10; g.enemy.maxMp=10; g.player.hand=[]; g.enemy.hand=[]; g.player.deck=[]; g.enemy.deck=[]; g.player.board=[null,null,null,null,null,null]; g.enemy.board=[null,null,null,null,null,null]; g.player.weapon=null; g.enemy.weapon=null; g.player.tension=0; g.enemy.tension=0; g.player.heroSkill=null; g.player.heroLevel=0; g._v246EffectGuards=Object.create(null); g._v264AppliedRemoteActionIds=Object.create(null); T.v264.forceHideOpponentHandInPvp(); return true;})()", timeout=20)

def bridge(src,dst,label='bridge', duplicate_first=False):
    actions=src.eval('window.__DQR_TEST__.drainOutbox()', timeout=10) or []
    for i,a in enumerate(actions):
        action_id=f'{label}_{i}'
        dst.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js(action_id)})", timeout=40)
        if duplicate_first and i==0:
            dst.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js(action_id)})", timeout=40)
    return actions

SNAP_JS="""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game;
 const unit=u=>u?{name:u.name,hp:Number(u.hp||0),maxHp:Number(u.maxHp||0),attack:Number(u.attack||0),statuses:(u.statuses||[]).map(s=>s.type||s),kw:u.keywords||{},durability:Number(u.durability||0),building:!!u.isBuilding}:null;
 const weap=w=>w?{name:w.name,attack:Number(w.attack||0),durability:Number(w.durability||0)}:null;
 return {playerHp:g.player.hp, enemyHp:g.enemy.hp, player:g.player.board.map(unit), enemy:g.enemy.board.map(unit), playerWeapon:weap(g.player.weapon), enemyWeapon:weap(g.enemy.weapon), tension:g.player.tension, enemyTension:g.enemy.tension, hand:g.player.hand.map(id=>T.byId(id)?.name||id), enemyHand:g.enemy.hand?.map(id=>T.byId(id)?.name||id)||[], ui:T.v264.enemyHandUiState(), guard:T.v264.appliedRemoteActionIds(), log:(g.log||[]).slice(-6)}; })()
"""
def snap(c): return c.eval(SNAP_JS, timeout=10)
def mirror_ok(a,b):
    return a['playerHp']==b['enemyHp'] and a['enemyHp']==b['playerHp'] and a['player']==b['enemy'] and a['enemy']==b['player'] and a['playerWeapon']==b['enemyWeapon'] and a['enemyWeapon']==b['playerWeapon'] and a['tension']==b['enemyTension'] and a['enemyTension']==b['tension']
def mirror_detail(A,B):
    a=snap(A); b=snap(B); return {'ok':mirror_ok(a,b),'A':a,'B':b}

def main():
    html=build_inline_html(); procs=[]; clients=[]; versions=[]; logs=[]; results=[]; soak_steps=[]
    try:
        for p in PORTS:
            proc,c,ver,log=launch(p,html); procs.append(proc); clients.append(c); versions.append(ver.get('Browser')); logs.append(log)
        A,B=clients
        test(results,'boot: two mobile-sized Chromium clients with v264/v264b hooks', lambda:{'ok':A.eval('!!window.__DQR_TEST__.v264 && !!window.__DQR_TEST__.v264b') and B.eval('!!window.__DQR_TEST__.v264 && !!window.__DQR_TEST__.v264b'), 'cards':A.eval('window.__DQR_TEST__.state.allCards.length')})

        def pvp_hand_leak_guard():
            setup_pair(A,B)
            detail=A.eval("""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game;
              T.state.battle.soloTestMode=false; g.soloTestMode=false;
              g.enemy.hand=[T.findCardByName('メラ')?.id,T.findCardByName('シーゴーレム')?.id].filter(Boolean); g.enemy.handCount=g.enemy.hand.length;
              const ids=['enemy-hand-visual','enemy-hand-list-pop','solo-debug-strip','solo-debug-hand','solo-debug-enemy-hand','solo-test-panel','solo-test-toggle'];
              for(const id of ids){ const el=document.getElementById(id); if(el){ el.classList.remove('hidden'); }}
              const ev=document.getElementById('enemy-hand-visual'); if(ev) ev.innerHTML='<img class="leak" src="x"><span>LEAK</span>';
              const ep=document.getElementById('enemy-hand-list-pop'); if(ep) ep.innerHTML='<img class="leak" src="x"><span>LEAK</span>';
              const sh=document.getElementById('solo-debug-hand'); if(sh) sh.innerHTML='<img class="leak" src="x"><span>LEAK</span>';
              const seh=document.getElementById('solo-debug-enemy-hand'); if(seh) seh.innerHTML='<img class="leak" src="x"><span>LEAK</span>';
              const arena=document.getElementById('battle-arena'); arena?.classList.add('solo-test-mode'); if(arena) arena.dataset.soloActive='enemy';
              T.renderBattleArena();
              return T.v264.enemyHandUiState(); })()""", timeout=20)
            ok=detail['enemy-hand-visual']['hidden'] and detail['enemy-hand-visual']['html']=='' and detail['enemy-hand-list-pop']['hidden'] and (detail['solo-debug-strip'] is None or detail['solo-debug-strip']['hidden']) and (detail['solo-debug-enemy-hand'] is None or detail['solo-debug-enemy-hand']['html']=='') and not detail['battle-arena']['solo']
            return {'ok':ok,'ui':detail}
        test(results,'mobile PvP: solo/opponent hand UI is forcibly hidden and emptied', pvp_hand_leak_guard)

        def duplicate_remote_damage_guard():
            setup_pair(A,B)
            B.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['シールドオーガ']); g.player.board[0].hp=10; g.player.board[0].maxHp=10; return true;})()", timeout=20)
            action={'type':'damageApplied','actorId':'A','payload':{'targetRef':{'side':'enemy','pos':0},'amount':3,'actual':3,'source':'メラミ'}}
            B.eval(f"window.__DQR_TEST__.applyRemoteAction({js(action)}, 'dup_damage_same')", timeout=20)
            B.eval(f"window.__DQR_TEST__.applyRemoteAction({js(action)}, 'dup_damage_same')", timeout=20)
            hp_once=B.eval('window.__DQR_TEST__.state.battle.game.player.board[0].hp', timeout=10)
            B.eval(f"window.__DQR_TEST__.applyRemoteAction({js(action)}, 'dup_damage_new')", timeout=20)
            hp_twice=B.eval('window.__DQR_TEST__.state.battle.game.player.board[0].hp', timeout=10)
            return {'ok':hp_once==7 and hp_twice==4, 'hpAfterSameIdTwice':hp_once, 'hpAfterNewId':hp_twice, 'guard':B.eval('window.__DQR_TEST__.v264.appliedRemoteActionIds()', timeout=10)}
        test(results,'PvP action replay: duplicated damage action id is not applied twice', duplicate_remote_damage_guard)

        def duplicate_summon_buff_debuff_guard():
            setup_pair(A,B)
            detail=A.eval("""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game;
              T.setBoardByNames('player',['ゼルドラド','スライム']); T.setBoardByNames('enemy',['スライム','ドラキー']);
              const unit=g.player.board[0], card=T.findCardByName('ゼルドラド');
              T.handleUnitSummonedEvent({unit, card, pos:0, side:'player', _eventId:'same_zelderado_v264'});
              T.handleUnitSummonedEvent({unit, card, pos:0, side:'player', _eventId:'same_zelderado_v264'});
              return T.boardSnapshotV255(); })()""", timeout=30)
            # Slime 1/1 receives +2 attack once => 3. Enemies receive -2 once and clamp at 0.
            ok=detail['player'][1]['attack']==3 and detail['enemy'][0]['attack']==0 and detail['enemy'][1]['attack']==0
            return {'ok':ok,'snapshot':detail}
        test(results,'local event guard: summon-wide buff/debuff does not fire twice for same event id', duplicate_summon_buff_debuff_guard)

        def pending_debuff_once_and_remote_patch():
            setup_pair(A,B)
            A.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('enemy',['シールドオーガ']); g.enemy.board[0].attack=5; g.enemy.board[0].hp=8; g.enemy.board[0].maxHp=8; return true;})()", timeout=20)
            B.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['シールドオーガ']); g.player.board[0].attack=5; g.player.board[0].hp=8; g.player.board[0].maxHp=8; return true;})()", timeout=20)
            detail=A.eval("""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game;
              g.pendingGenericEffect={kind:'debuffStats',attack:-1,hp:0,source:'ブラックマンティス',target:'enemyUnit'};
              T.applyPendingGenericEffectToUnit({side:'enemy',pos:0});
              T.applyPendingGenericEffectToUnit({side:'enemy',pos:0});
              return {attack:g.enemy.board[0].attack, outbox:T.drainOutbox().map(a=>({type:a.type,payload:a.payload}))}; })()""", timeout=30)
            for i,a in enumerate(detail['outbox']):
                B.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js('debuff_patch_'+str(i))})", timeout=30)
                B.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js('debuff_patch_'+str(i))})", timeout=30)
            bAtk=B.eval('window.__DQR_TEST__.state.battle.game.player.board[0].attack', timeout=10)
            return {'ok':detail['attack']==4 and bAtk==4, 'A':detail, 'Battack':bAtk, 'Bguard':B.eval('window.__DQR_TEST__.v264.appliedRemoteActionIds()', timeout=10)}
        test(results,'targeted debuff: local double tap and duplicated remote patch do not stack twice', pending_debuff_once_and_remote_patch)

        def spell_damage_bonus_once_and_remote_synced():
            setup_pair(A,B)
            A.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['ブラックルーン']); T.setBoardByNames('enemy',['シールドオーガ']); g.enemy.board[0].hp=10; g.enemy.board[0].maxHp=10; return true;})()", timeout=20)
            B.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('enemy',['ブラックルーン']); T.setBoardByNames('player',['シールドオーガ']); g.player.board[0].hp=10; g.player.board[0].maxHp=10; return true;})()", timeout=20)
            detail=A.eval("""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; const c=T.findCardByName('メラミ');
              const bonusBefore=T.getSpellDamageBonus ? T.getSpellDamageBonus() : null;
              T.applyGenericCardUseEffect(c, 2);
              const pending={...(g.pendingGenericEffect||{})};
              T.applyPendingGenericEffectToUnit({side:'enemy',pos:0});
              return {bonusBefore, pending, hp:g.enemy.board[0].hp, outbox:T.drainOutbox().map(a=>({type:a.type,payload:a.payload}))}; })()""", timeout=40)
            for i,a in enumerate(detail['outbox']):
                B.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js('spell_bonus_'+str(i))})", timeout=30)
                if i==0: B.eval(f"window.__DQR_TEST__.applyRemoteAction({js(a)}, {js('spell_bonus_'+str(i))})", timeout=30)
            bHp=B.eval('window.__DQR_TEST__.state.battle.game.player.board[0].hp', timeout=10)
            return {'ok':detail['bonusBefore']==2 and detail['pending'].get('amount')==5 and detail['hp']==5 and bHp==5, 'A':detail, 'Bhp':bHp, 'BoutboxGuard':B.eval('window.__DQR_TEST__.v264.appliedRemoteActionIds()', timeout=10)}
        test(results,'spell damage bonus: ブラックルーン + メラミ is +2 once, synced once in PvP', spell_damage_bonus_once_and_remote_synced)


        # Soak with duplicate injection: repeated remote ids, targeted patches, damage, summons, and turn events.
        failures=[]
        unit_names=['シーゴーレム','スライム','ドラキー','いたずらもぐら','おばけキャンドル','バブルスライム','シールドオーガ','メラゴースト','おおくちばし','リリパット']
        for match in range(12):
            setup_pair(A,B)
            # Start each match from a mirrored stable board with high HP so repeated damage/debuffs do not create removal noise.
            A.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['シールドオーガ','スライム']); T.setBoardByNames('enemy',['シールドオーガ','ドラキー']); for(const u of [...g.player.board,...g.enemy.board]) if(u){u.hp=50;u.maxHp=50;} return true;})()", timeout=20)
            B.eval("(()=>{const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['シールドオーガ','ドラキー']); T.setBoardByNames('enemy',['シールドオーガ','スライム']); for(const u of [...g.player.board,...g.enemy.board]) if(u){u.hp=50;u.maxHp=50;} return true;})()", timeout=20)
            for step in range(80):
                actor,other=(A,B) if step%2==0 else (B,A)
                label='A' if step%2==0 else 'B'
                actor.eval(f"(()=>{{const T=window.__DQR_TEST__, g=T.state.battle.game; T.state.battle.matchLocked=false; g.isMyTurn=true; g.currentTurnPlayerId=T.state.playerId; g.player.mp=10; g.player.maxMp=10; return true;}})()", timeout=10)
                other.eval(f"(()=>{{const T=window.__DQR_TEST__, g=T.state.battle.game; T.state.battle.matchLocked=true; g.isMyTurn=false; return true;}})()", timeout=10)
                op=step%8
                if op in (0,1):
                    nm=unit_names[(match*11+step)%len(unit_names)]
                    code=f"""(()=>{{ const T=window.__DQR_TEST__, g=T.state.battle.game; const pos=g.player.board.findIndex(x=>!x); const c=T.findCardByName({js(nm)}); if(c && pos>=0) T.summonUnitFromHandToBoard(c,pos,Number(c.cost||0)); return {{op:'summon', name:{js(nm)}, pos}}; }})()"""
                elif op==2:
                    code="""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; if(g.enemy.board[0]){ g.pendingGenericEffect={kind:'debuffStats',attack:-1,hp:0,source:'soakDebuff',target:'enemyUnit'}; T.applyPendingGenericEffectToUnit({side:'enemy',pos:0}); } return {op:'debuff'}; })()"""
                elif op==3:
                    code="""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; if(g.enemy.board[0]){ g.pendingGenericEffect={kind:'damage',amount:1,source:'soakPing',target:'enemyUnit'}; T.applyPendingGenericEffectToUnit({side:'enemy',pos:0}); } return {op:'spellDamage'}; })()"""
                elif op==4:
                    code="""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; let p=g.player.board.findIndex(u=>u&&!u.isBuilding); if(p<0){ const c=T.findCardByName('スライム'); g.player.board[0]=T.makeUnitFromCard(c); p=0; } const u=g.player.board[p]; u.canAttack=true; u.attacksLeft=1; u.summoningSickness=false; g.selectedAttacker={side:'player',pos:p}; T.attackLeader('enemy'); return {op:'attackLeader'}; })()"""
                elif op==5:
                    code="""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.emitBattleEvent('ownTurnEnd',{side:'player'}); T.emitBattleEvent('ownTurnStart',{side:'player'}); return {op:'turn'}; })()"""
                elif op==6:
                    code="""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setPlayerHandByNames(['妖精サンディ']); T.discardHandCardAtIndex(0,'soak'); return {op:'discardSandy'}; })()"""
                else:
                    code="""(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.emitBattleEvent('turnEnd',{side:'player'}); return {op:'guardedTurnEnd'}; })()"""
                detail=actor.eval(code, timeout=40)
                actions=bridge(actor, other, f'v264_soak_{match}_{step}_{label}', duplicate_first=True)
                md=mirror_detail(A,B)
                step_info={'match':match,'step':step,'actor':label,'op':detail.get('op') if isinstance(detail,dict) else None,'actions':[a.get('type') for a in actions], 'mirrorOk':md['ok']}
                soak_steps.append(step_info)
                if not md['ok']:
                    step_info['mirror']=md; failures.append(step_info); break
            if failures: break
        test(results,'long PvP soak with duplicate action injection: 12 matches x 80 steps stay mirrored', lambda:{'ok':len(failures)==0 and len(soak_steps)==960, 'steps':len(soak_steps), 'last':soak_steps[-5:], 'failures':failures[:1]})

        exceptions=[]
        for c in clients:
            for e in c.events:
                if e.get('method')=='Runtime.exceptionThrown': exceptions.append(e.get('params',{}))
        summary={'mode':'v264 duplicate effect + hand leak + long PvP soak','browserVersions':versions,'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'soakSteps':len(soak_steps),'exceptions':exceptions[:10],'chromeLogs':logs}
        (ROOT/'data'/'v264_duplicate_effect_soak_and_hand_leak_tests.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2), encoding='utf-8')
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0 if summary['failed']==0 and not exceptions else 1
    finally:
        for p in procs:
            try: p.terminate(); p.wait(timeout=3)
            except Exception: pass
if __name__=='__main__': sys.exit(main())
