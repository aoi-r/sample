import json, os, subprocess, time, tempfile, urllib.request, socket, re
from pathlib import Path
import websocket
ROOT=Path(__file__).resolve().parents[1]
PORT=9277
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
        if 'exceptionDetails' in res: raise RuntimeError(json.dumps(res['exceptionDetails'],ensure_ascii=False)[:3000])
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
    app=app.replace("import { firebaseConfig } from './firebase-config.js';", "const firebaseConfig = { apiKey: 'PASTE_DISABLED_FOR_INLINE_V257_EMULATOR' };")
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
  key = key.replace(/^https?:\\/\\/[^/]+\\//, './');
  if(!key.startsWith('./') && key.startsWith('data/')) key = './' + key;
  if(window.__DQR_INLINE_DATA__[key]) return new Response(JSON.stringify(window.__DQR_INLINE_DATA__[key]), {status:200, headers:{'Content-Type':'application/json'}});
  return __nativeFetch(url, opts);
};
</script>
""".replace('__DATA__', json.dumps(data, ensure_ascii=False, separators=(',',':')))
    return html.replace('</body>', boot+'<script type="module">\n'+app+'\n</script></body>')
def launch(html):
    profile=tempfile.mkdtemp(prefix='dqr_v257_chrome_'); log_path=tempfile.NamedTemporaryFile('w+',delete=False).name; log=open(log_path,'w+')
    proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={PORT}',f'--user-data-dir={profile}','--disable-background-networking','--disable-extensions','--disable-component-update','--no-first-run','--no-default-browser-check','--remote-allow-origins=*','about:blank'],stdout=log,stderr=log)
    ver=wait_json(f'http://127.0.0.1:{PORT}/json/version'); pages=wait_json(f'http://127.0.0.1:{PORT}/json/list'); page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], PORT); c.call('Runtime.enable'); c.call('Page.enable'); frame=c.call('Page.getFrameTree')['frameTree']['frame']['id']
    c.call('Page.setDocumentContent', {'frameId':frame,'html':html}, timeout=180)
    for _ in range(180):
        try:
            if c.eval('!!window.__DQR_TEST__?.state?.appReady && !!window.__DQR_TEST__?.v257', timeout=2): return proc,c,ver,log_path
        except Exception: pass
        time.sleep(0.2)
    raise RuntimeError('app not ready')
def test(results,name,func):
    try:
        d=func(); ok=bool(d.get('ok') if isinstance(d,dict) and 'ok' in d else d); results.append({'name':name,'ok':ok,'detail':d})
    except Exception as e: results.append({'name':name,'ok':False,'error':str(e)})
def main():
    proc=None
    try:
        proc,c,ver,log=launch(build_inline_html()); results=[]
        test(results,'boot: v257 hooks loaded', lambda:{'ok': c.eval('!!window.__DQR_TEST__.v257'), 'cards':c.eval('window.__DQR_TEST__.state.allCards.length')})
        c.eval("window.__DQR_TEST__.setupPvpTest('A', true)")
        test(results,'パワースナイプ: pending target damage is installed', lambda: c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('enemy',['スライム']); const card=T.state.allCards.find(c=>c.name==='パワースナイプ'); T.applyCardUseV166(card,1); const pending=g.pendingGenericEffect; T.applyPendingGenericEffectToUnit({side:'enemy',pos:0}); const s=T.boardSnapshotV255(); return {ok:!s.enemy[0] || s.enemy[0].hp<=-1 || s.enemy[0].hp===0, pending, snap:s}; })()
""", timeout=30))
        c.eval("window.__DQR_TEST__.setupPvpTest('A', true)")
        test(results,'魔道士ウルノーガ: 前列にいる間、敵の回復がダメージ化する', lambda: c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; T.setBoardByNames('player',['魔道士ウルノーガ']); g.enemy.hp=20; g.enemy.maxHp=25; const before=g.enemy.hp; const card=T.state.allCards.find(c=>c.name==='いやしの雨'); T.applyCardUseV166(card,1); return {ok:g.enemy.hp < before, before, after:g.enemy.hp, log:T.getLog().slice(-10)}; })()
""", timeout=30))
        c.eval("window.__DQR_TEST__.setupPvpTest('A', true)")
        test(results,'スライムジェネラル: 将軍の秘技にテンションスキル変更', lambda: c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; const card=T.state.allCards.find(c=>c.name==='スライムジェネラル'); const u=T.makeUnitFromCard(card); T.v257.applySummon(u,card); return {ok:g.player.tensionSkillName==='将軍の秘技', skill:g.player.tensionSkillName, tension:g.player.tension}; })()
""", timeout=30))
        c.eval("window.__DQR_TEST__.setupPvpTest('A', true)")
        test(results,'ブオーン: 攻撃後に他の全敵へ同時ダメージ', lambda: c.eval("""
(()=>{ const T=window.__DQR_TEST__, g=T.state.battle.game; const card=T.state.allCards.find(c=>c.name==='ブオーン'); const bu=T.makeUnitFromCard(card); g.player.board[0]=bu; T.setBoardByNames('enemy',['スライム','ドラキー']); const before=T.boardSnapshotV255(); T.v257.applyBuornSplash({attacker:bu,attackerRef:{side:'player',pos:0},defenderRef:{side:'enemy',pos:0,unit:g.enemy.board[0]}}); const after=T.boardSnapshotV255(); return {ok:after.enemyHp<before.enemyHp && (!after.enemy[1] || after.enemy[1].hp < before.enemy[1].hp), before, after}; })()
""", timeout=30))
        failed=[r for r in results if not r['ok']]
        out={'mode':'v257 priest/martial priority browser tests','browser':ver.get('Browser'), 'passed':len(results)-len(failed), 'failed':len(failed), 'results':results, 'chromeLog':log}
        print(json.dumps(out,ensure_ascii=False,indent=2));
        if failed: raise SystemExit(1)
    finally:
        if proc: proc.terminate()
if __name__=='__main__': main()
