import json, os, subprocess, time, tempfile, urllib.request, sys, socket, re
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
CDP_PORT=int(os.environ.get('DQR_CDP_PORT','9234'))
class CDP:
    def __init__(self, ws_url):
        self.ws=websocket.create_connection(ws_url, timeout=3, origin=f'http://127.0.0.1:{CDP_PORT}')
        self.i=0; self.events=[]
    def call(self, method, params=None, timeout=30):
        self.i+=1; msg={'id':self.i,'method':method}
        if params is not None: msg['params']=params
        self.ws.send(json.dumps(msg)); deadline=time.time()+timeout
        old=self.ws.gettimeout(); self.ws.settimeout(0.5)
        try:
            while time.time()<deadline:
                try: data=json.loads(self.ws.recv())
                except (socket.timeout, TimeoutError): continue
                if data.get('id')==self.i:
                    if 'error' in data: raise RuntimeError(f"CDP {method}: {data['error']}")
                    return data.get('result',{})
                self.events.append(data)
        finally: self.ws.settimeout(old)
        raise TimeoutError(method)
    def eval(self, expr, timeout=20):
        res=self.call('Runtime.evaluate', {'expression':expr,'awaitPromise':True,'returnByValue':True,'userGesture':True}, timeout=timeout)
        if 'exceptionDetails' in res: raise RuntimeError(json.dumps(res['exceptionDetails'],ensure_ascii=False)[:3000])
        return res.get('result',{}).get('value')
def wait_json(url, tries=100):
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=1) as r: return json.loads(r.read().decode())
        except Exception: time.sleep(0.1)
    raise RuntimeError('not ready '+url)

def build_inline_html():
    html=(ROOT/'index.html').read_text()
    html=re.sub(r'<script type="module" src="\.\/js\/app\.js"><\/script>','',html)
    app=(ROOT/'js'/'app.js').read_text()
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'PASTE_DISABLED_FOR_INLINE_EMULATOR' };")
    # data files used by loadData
    names=['cards.json','systems.json','strategies.json','choices.json','coin.json','dungeons.json','fortune.json','heroes.json','exchanges.json','generated_cards.json','tension_system.json']
    data={}
    for n in names:
        data[f'./data/{n}']=json.loads((ROOT/'data'/n).read_text())
        data[f'data/{n}']=data[f'./data/{n}']
    boot = """
<script>
window.__DQR_INLINE_DATA__ = __DATA__;
const __nativeFetch = window.fetch.bind(window);
window.fetch = async function(url, opts){
  const raw = String(url || '');
  let key = raw.split('?')[0];
  key = key.replace(/^https?:\/\/[^/]+\//, './');
  if(!key.startsWith('./') && key.startsWith('data/')) key = './' + key;
  if(window.__DQR_INLINE_DATA__[key]){
    return new Response(JSON.stringify(window.__DQR_INLINE_DATA__[key]), {status:200, headers:{'Content-Type':'application/json'}});
  }
  return __nativeFetch(url, opts);
};
</script>
""".replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',',':')))
    inline = boot + '<script type="module">\n' + app + '\n</script>'
    return html.replace('</body>', inline+'</body>')

def main():
    print('building inline page', flush=True)
    inline_html=build_inline_html()
    print('inline bytes', len(inline_html), flush=True)
    profile=tempfile.mkdtemp(prefix='dqr_v247_inline_chrome_')
    chrome_log_path=tempfile.NamedTemporaryFile('w+',delete=False).name
    chrome_log=open(chrome_log_path,'w+')
    chrome=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={CDP_PORT}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'],stdout=chrome_log,stderr=chrome_log)
    try:
        version=wait_json(f'http://127.0.0.1:{CDP_PORT}/json/version')
        pages=wait_json(f'http://127.0.0.1:{CDP_PORT}/json/list')
        page=next((p for p in pages if p.get('type')=='page'), pages[0])
        c=CDP(page['webSocketDebuggerUrl'])
        c.call('Runtime.enable'); c.call('Page.enable')
        ft=c.call('Page.getFrameTree')
        frame_id=ft['frameTree']['frame']['id']
        c.call('Page.setDocumentContent', {'frameId':frame_id, 'html':inline_html}, timeout=60)
        ready=False
        for i in range(120):
            try:
                ready=bool(c.eval('!!window.__DQR_TEST__?.state?.appReady', timeout=2))
                if ready: break
            except Exception: pass
            time.sleep(0.25)
        results=[]
        def test(name, expr):
            print('test', name, flush=True)
            try:
                val=c.eval(expr, timeout=20)
                ok=bool(val.get('ok') if isinstance(val,dict) and 'ok' in val else val)
                results.append({'name':name,'ok':ok,'detail':val})
            except Exception as e:
                results.append({'name':name,'ok':False,'error':str(e)})
        test('inline boot appReady', "({ok:!!window.__DQR_TEST__?.state?.appReady, ready:window.__DQR_TEST__?.state?.appReady, cards:window.__DQR_TEST__?.state?.allCards?.length, active:[...document.querySelectorAll('.screen.active')].map(e=>e.id)})")
        test('title tap advances', "(async()=>{document.querySelector('.tap-start')?.click(); await new Promise(r=>setTimeout(r,200)); return {ok:[...document.querySelectorAll('.screen.active')].some(e=>['screen-user','screen-menu'].includes(e.id)), active:[...document.querySelectorAll('.screen.active')].map(e=>e.id)};})()")
        test('legit repeated same spell cardPlayed', "(()=>{const T=window.__DQR_TEST__; T.resetBattleForTest(); const c=T.findCardByName('魔力の息吹'); T.emitBattleEvent('cardPlayed',{card:c,cost:3,side:'player'}); T.emitBattleEvent('cardPlayed',{card:c,cost:3,side:'player'}); return {ok:T.state.battle.game.player.spellsUsedThisGame===2,spells:T.state.battle.game.player.spellsUsedThisGame};})()")
        test('same event id cardPlayed is swallowed once', "(()=>{const T=window.__DQR_TEST__; T.resetBattleForTest(); const c=T.findCardByName('魔力の息吹'); const p={card:c,cost:3,side:'player',_eventId:'same-event'}; T.handleCardPlayedEvent(p); T.handleCardPlayedEvent(p); return {ok:T.state.battle.game.player.spellsUsedThisGame===1,spells:T.state.battle.game.player.spellsUsedThisGame};})()")
        test('direct damage applies twice', "(()=>{const T=window.__DQR_TEST__; T.resetBattleForTest(); T.dealDamageToLeader('enemy',2,'test'); T.dealDamageToLeader('enemy',2,'test'); return {ok:T.state.battle.game.enemy.hp===21,hp:T.state.battle.game.enemy.hp};})()")
        test('direct heal applies twice', "(()=>{const T=window.__DQR_TEST__; T.resetBattleForTest(); T.state.battle.game.player.hp=10; T.healLeader(4); T.healLeader(4); return {ok:T.state.battle.game.player.hp===18,hp:T.state.battle.game.player.hp};})()")
        test('direct draw exact count', "(()=>{const T=window.__DQR_TEST__; T.resetBattleForTest(); const slime=T.findCardByName('スライム'); T.state.battle.game.player.deck=[slime.id,slime.id,slime.id,slime.id,slime.id]; T.drawCard(2); T.drawCard(2); return {ok:T.state.battle.game.player.hand.length===4&&T.state.battle.game.player.deck.length===1,hand:T.state.battle.game.player.hand.length,deck:T.state.battle.game.player.deck.length};})()")
        test('turn end duplicate same id once', "(()=>{const T=window.__DQR_TEST__; T.resetBattleForTest(); const p={side:'player',_eventId:'turn-end-1'}; T.handleTurnEndEvent(p); const log1=T.getLog().length; T.handleTurnEndEvent(p); const log2=T.getLog().length; return {ok:log2===log1,log1,log2};})()")
        test('かいぞくウーパー death does not draw', "(()=>{const T=window.__DQR_TEST__; T.resetBattleForTest(); const c=T.findCardByName('かいぞくウーパー'); const u=T.makeUnitFromCard(c); T.state.battle.game.player.board[0]=u; const before=T.state.battle.game.player.hand.length; T.emitBattleEvent('unitDeath',{unit:u,side:'player',pos:0}); const after=T.state.battle.game.player.hand.length; return {ok:after===before,before,after};})()")
        test('unit put into play keeps keywords but no summon event', "(()=>{const T=window.__DQR_TEST__; T.resetBattleForTest(); const c=T.findCardByName('いっかくうさぎ'); const before=T.state.battle.game.events?.length||0; T.putUnitIntoPlayFromCard(c,0,'player'); const u=T.state.battle.game.player.board[0]; const events=(T.state.battle.game.events||[]).slice(before).map(e=>e.type); return {ok:!!u && !!u.keywords?.haste && events.includes('unitPutIntoPlay') && !events.includes('unitSummoned'), unit:u.name, events};})()")
        exceptions=[]; console_errors=[]
        for e in c.events:
            if e.get('method')=='Runtime.exceptionThrown': exceptions.append(e.get('params',{}))
            if e.get('method')=='Runtime.consoleAPICalled' and e.get('params',{}).get('type') in ('error','assert'):
                console_errors.append(e.get('params',{}))
        summary={'browser':version.get('Browser'),'mode':'inline Page.setDocumentContent','ready':ready,'passed':sum(1 for r in results if r.get('ok')),'failed':sum(1 for r in results if not r.get('ok')),'results':results,'exceptions':exceptions[:20],'consoleErrors':console_errors[:20],'chromeLog':chrome_log_path}
        out=ROOT/'data'/'v247_inline_chromium_emulator_tests.json'; out.parent.mkdir(exist_ok=True); out.write_text(json.dumps(summary,ensure_ascii=False,indent=2))
        print(json.dumps(summary,ensure_ascii=False,indent=2), flush=True)
        return 0 if summary['failed']==0 else 1
    finally:
        try: chrome.terminate(); chrome.wait(timeout=3)
        except Exception: pass
if __name__=='__main__': sys.exit(main())
