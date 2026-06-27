#!/usr/bin/env python3
import argparse, contextlib, http.server, json, os, random, re, shutil, signal, socket, socketserver, subprocess, sys, tempfile, threading, time, urllib.request
from pathlib import Path
import websocket

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PORT_BASE = 9393

DECKS = {
  'イレブンテリー': ['しっぷう突き','とげぼうず','勇者イレブン','アルゴリザード','トンネラー','かくれんぼう','ナイトキング','わたぼう','ブラッドレディ','シーゴーレム','ラプソーン','最後の砦の英雄グレイグ','コンガオンガ','フェイスボール','メルビン','ギュメイ将軍','シュプリンガー','グレイトマムー','いなずまのけん','ウルノーガ&ウルナーガ'],
  'ドラゴンタバサミネア': ['魂の写し身','タバサ','風の導き','銀のタロット','クロウズ','バルーンコール','かみかぜ','バルンバ','太陽のタロット','サイコロン','キースドラゴン','死神のタロット','イブール','ゾディアックコード','逆転への兆し','召竜の儀式','しんりゅう','タロットフォーチュン'],
  'イルルカドラゴンゼシカ': ['メラ','パピラス','イル＆ルカ','メラミ','とさかヘビ','リザードキッズ','デンタザウルス','乙女の気まぐれ','氷竜への祈り','アルゴングレート','サウルスロード','メラゾーマ','ギガントドラゴン','ガメゴンロード','竜将ドラゴンガイア','ドラゴンブッシュ'],
  'デボラトルネコ': ['商人の交換所','コインのたね','とげぼうず','プチファイター','ケダモン','ぷちメタル','くらやみハーピー','ベホイミスライム','天空の花嫁デボラ','ルドマン','怪獣プスゴン','ラプソーン','黄金兵','痛みわけの杖','ブラバニクイーン','福招きのそろばん','マデサゴーラ','ハンフリー','レッドプレデター','ゴールデンタイタス']
}
CLASS = {'イレブンテリー':'戦士','ドラゴンタバサミネア':'占い師','イルルカドラゴンゼシカ':'魔法使い','デボラトルネコ':'商人'}
HERO = {'イレブンテリー':'eleven','ドラゴンタバサミネア':'tabasa','イルルカドラゴンゼシカ':'ilLuca','デボラトルネコ':'deborah'}
HIGH_RISK = ['かくれんぼう','死神のタロット','太陽のタロット','バルーンコール','キースドラゴン','氷竜への祈り','パピラス','ギガントドラゴン','竜将ドラゴンガイア','商人の交換所','福招きのそろばん','ぷちメタル','ルドマン','マデサゴーラ','ラプソーン','コンガオンガ','シュプリンガー','怪獣プスゴン']

class CDP:
    def __init__(self, ws_url, label):
        self.label = label
        self.ws = websocket.create_connection(ws_url, timeout=10, origin='http://127.0.0.1')
        self.i = 0
        self.events = []
    def call(self, method, params=None, timeout=30):
        self.i += 1
        msg={'id':self.i,'method':method}
        if params is not None: msg['params']=params
        self.ws.send(json.dumps(msg))
        deadline=time.time()+timeout
        old=self.ws.gettimeout(); self.ws.settimeout(0.5)
        try:
            while time.time()<deadline:
                try: data=json.loads(self.ws.recv())
                except (socket.timeout, TimeoutError, websocket.WebSocketTimeoutException): continue
                if data.get('id')==self.i:
                    if 'error' in data: raise RuntimeError(f'{self.label} CDP {method}: {data["error"]}')
                    return data.get('result',{})
                self.events.append(data)
        finally:
            self.ws.settimeout(old)
        raise TimeoutError(f'{self.label} {method}')
    def eval(self, expr, timeout=30):
        res=self.call('Runtime.evaluate', {'expression':expr,'awaitPromise':True,'returnByValue':True,'userGesture':True}, timeout=timeout)
        if 'exceptionDetails' in res:
            raise RuntimeError(json.dumps(res['exceptionDetails'], ensure_ascii=False)[:5000])
        return res.get('result',{}).get('value')

def js(x): return json.dumps(x, ensure_ascii=False)

def wait_json(url, tries=200, interval=0.1):
    last=None
    for _ in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=1) as r: return json.loads(r.read().decode())
        except Exception as e:
            last=e; time.sleep(interval)
    raise RuntimeError(f'not ready {url}: {last}')

def find_free_port(start):
    for port in range(start, start+100):
        with contextlib.closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    raise RuntimeError('no free port')

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass

def serve(root, port):
    handler=lambda *a, **kw: QuietHandler(*a, directory=str(root), **kw)
    httpd=socketserver.TCPServer(('127.0.0.1', port), handler)
    th=threading.Thread(target=httpd.serve_forever, daemon=True); th.start()
    return httpd

def launch(port, url, label):
    profile=tempfile.mkdtemp(prefix=f'dqr_v293_{label}_')
    log_path=tempfile.NamedTemporaryFile('w+', delete=False, prefix=f'dqr_v293_{label}_', suffix='.log').name
    log=open(log_path,'w+')
    exe=shutil.which('chromium') or shutil.which('chromium-browser') or '/usr/bin/chromium'
    args=[exe,'--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',f'--remote-debugging-port={port}',f'--user-data-dir={profile}',
          '--remote-allow-origins=*','--no-first-run','--no-default-browser-check',url]
    proc=subprocess.Popen(args, stdout=log, stderr=log)
    ver=wait_json(f'http://127.0.0.1:{port}/json/version', tries=240)
    pages=wait_json(f'http://127.0.0.1:{port}/json/list', tries=80)
    page=next((p for p in pages if p.get('type')=='page'), pages[0])
    c=CDP(page['webSocketDebuggerUrl'], label); c.call('Runtime.enable'); c.call('Page.enable')
    return proc,c,ver,log_path,profile

def same_unit(a,b):
    if a is None or b is None: return a is None and b is None
    return a.get('name')==b.get('name') and int(a.get('hp') or 0)==int(b.get('hp') or 0) and int(a.get('attack') or 0)==int(b.get('attack') or 0)

def same_board(a,b): return len(a)==len(b)==6 and all(same_unit(x,y) for x,y in zip(a,b))

def mirror_ok(sa,sb):
    return same_board(sa['player'], sb['enemy']) and same_board(sa['enemy'], sb['player']) and sa['playerHp']==sb['enemyHp'] and sa['enemyHp']==sb['playerHp']

def wait_cond(client, expr, timeout=90, interval=0.35):
    deadline=time.time()+timeout; last=None
    while time.time()<deadline:
        try:
            val=client.eval(expr, timeout=5)
            if val: return val
            last=val
        except Exception as e:
            last=str(e)
        time.sleep(interval)
    return last

def wait_two_mirror(A,B, timeout=25):
    deadline=time.time()+timeout; last=None
    while time.time()<deadline:
        sa=A.eval('window.__DQR_TEST__.v293Firebase.snapshot()', timeout=10)
        sb=B.eval('window.__DQR_TEST__.v293Firebase.snapshot()', timeout=10)
        last=(sa,sb)
        if mirror_ok(sa,sb): return True,sa,sb
        time.sleep(0.4)
    return False,last[0],last[1]

def start_pair(A,B, match, deckA, deckB, timeout=180):
    cfgA={'playerId':'A_'+match[-8:],'displayName':'A','matchId':match,'deckName':deckA,'className':CLASS[deckA],'cardNames':DECKS[deckA],'matchTimeoutMs':timeout*1000,'firebaseTimeoutMs':timeout*1000}
    cfgB={'playerId':'B_'+match[-8:],'displayName':'B','matchId':match,'deckName':deckB,'className':CLASS[deckB],'cardNames':DECKS[deckB],'matchTimeoutMs':timeout*1000,'firebaseTimeoutMs':timeout*1000}
    # Clear first. If this fails, Firebase is unavailable.
    clear=A.eval(f'window.__DQR_TEST__.v293Firebase.clearRoom({js(match)})', timeout=timeout)
    if not clear.get('ok'):
        return False, {'stage':'clearRoom','A':clear}
    a=A.eval(f'window.__DQR_TEST__.v293Firebase.startMatchDirect({js(cfgA)})', timeout=timeout)
    b=B.eval(f'window.__DQR_TEST__.v293Firebase.startMatchDirect({js(cfgB)})', timeout=timeout)
    if not a.get('ok') or not b.get('ok'):
        return False, {'stage':'startMatch','A':a,'B':b}
    return True, {'A':a,'B':b}

def setup_state(A,B, actorDeck, defenderDeck, cardName, actor='A'):
    # Make A active by default. For B actor, swap calls.
    if actor=='A':
        active, passive = A, B; dA, dB = actorDeck, defenderDeck
    else:
        active, passive = B, A; dA, dB = actorDeck, defenderDeck
    hero=HERO.get(actorDeck,'')
    fortune='hit' if cardName in ('死神のタロット','太陽のタロット') else ''
    tension=0 if (actorDeck=='イレブンテリー' and cardName=='かくれんぼう') else 3
    baseEnemy=['スライム','ドラキー','シールドオーガ','スライム','ドラキー','シールドオーガ']
    basePlayer=[None,None,None,None,None,None]
    active.eval(f"window.__DQR_TEST__.v293Firebase.setControlledState({js({'handNames':[cardName], 'enemyBoard':baseEnemy, 'playerBoard':basePlayer, 'hero':hero, 'fortune':fortune, 'tension':tension, 'mp':10, 'maxMp':10})})", timeout=30)
    passive.eval(f"window.__DQR_TEST__.v293Firebase.setControlledState({js({'handNames':[], 'playerBoard':baseEnemy, 'enemyBoard':basePlayer, 'hero':HERO.get(defenderDeck,''), 'tension':0, 'mp':10, 'maxMp':10})})", timeout=30)
    meta={'status':'playing','currentTurnPlayerId': active.eval('window.__DQR_TEST__.state.playerId', timeout=5)}
    active.eval(f"window.__DQR_TEST__.v288?.applyTurnFromMeta({js(meta)}, 'v293setup')", timeout=10)
    passive.eval(f"window.__DQR_TEST__.v288?.applyTurnFromMeta({js(meta)}, 'v293setup')", timeout=10)
    return active, passive

def run_card_case(A,B, case_id, actorDeck, defenderDeck, cardName, actor='A'):
    active, passive = setup_state(A,B,actorDeck,defenderDeck,cardName,actor)
    prefer='全てのユニット' if cardName=='死神のタロット' else ''
    detail=active.eval(f"window.__DQR_TEST__.v293Firebase.useCardByName({js(cardName)}, {js({'prefer':prefer, 'pos':0})})", timeout=60)
    ok_m, sa, sb = wait_two_mirror(A,B, timeout=35)
    invA=active.eval('window.__DQR_TEST__.v293Firebase.invariants()', timeout=10)
    invB=passive.eval('window.__DQR_TEST__.v293Firebase.invariants()', timeout=10)
    ok=bool(detail.get('ok')) and ok_m and not invA and not invB
    return {'case':case_id,'type':'card','actor':actor,'actorDeck':actorDeck,'defenderDeck':defenderDeck,'card':cardName,'ok':ok,'detail':detail if not ok else {'snapshot':detail.get('snapshot')},'mirrorOk':ok_m,'invariantsActive':invA,'invariantsPassive':invB,'activeSnap':sa if not ok else None,'passiveSnap':sb if not ok else None}

def run_turn_case(A,B, case_id):
    # Whichever client has turn, end it and wait the other side to unlock.
    sa=A.eval('window.__DQR_TEST__.v293Firebase.snapshot()', timeout=10)
    active=A if sa.get('isMyTurn') else B
    passive=B if active is A else A
    beforeA=A.eval('window.__DQR_TEST__.v293Firebase.snapshot()', timeout=10)
    beforeB=B.eval('window.__DQR_TEST__.v293Firebase.snapshot()', timeout=10)
    res=active.eval('window.__DQR_TEST__.v293Firebase.endTurnDirect()', timeout=30)
    deadline=time.time()+45; ok=False; last=(beforeA,beforeB)
    while time.time()<deadline:
        a=A.eval('window.__DQR_TEST__.v293Firebase.snapshot()', timeout=10)
        b=B.eval('window.__DQR_TEST__.v293Firebase.snapshot()', timeout=10)
        last=(a,b)
        if (a.get('isMyTurn') != beforeA.get('isMyTurn')) and (b.get('isMyTurn') != beforeB.get('isMyTurn')) and not (a.get('isMyTurn') and a.get('lock')) and not (b.get('isMyTurn') and b.get('lock')):
            ok=True; break
        time.sleep(.4)
    return {'case':case_id,'type':'turn','ok':ok and bool(res.get('ok')),'endTurnResult':res,'beforeA':beforeA,'beforeB':beforeB,'afterA':last[0],'afterB':last[1]}

def connectivity_probe(timeout=30):
    url='https://dqr-sample-default-rtdb.firebaseio.com/.json?shallow=true'
    start=time.time(); tries=0; last=''
    while time.time()-start<timeout:
        tries+=1
        try:
            with urllib.request.urlopen(url, timeout=8) as r:
                return {'ok':True,'status':r.status,'tries':tries,'sample':r.read(200).decode(errors='replace')}
        except Exception as e:
            last=f'{type(e).__name__}: {e}'
            time.sleep(min(5, 0.5*tries))
    return {'ok':False,'tries':tries,'error':last}

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--connect-timeout', type=int, default=60, help='seconds for initial REST connectivity probe')
    ap.add_argument('--firebase-timeout', type=int, default=180, help='seconds for browser Firebase readiness/match waits')
    ap.add_argument('--max-cases', type=int, default=48)
    ap.add_argument('--match-prefix', default='v293auto')
    ap.add_argument('--port-base', type=int, default=DEFAULT_PORT_BASE)
    args=ap.parse_args()

    report={'version':'v293_real_firebase_two_access_harness','mode':'real Firebase Realtime Database + two headless Chromium clients','startedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'connectivityProbe':None,'results':[], 'exceptions':[], 'notes':[]}
    probe=connectivity_probe(args.connect_timeout)
    report['connectivityProbe']=probe
    if not probe.get('ok'):
        report['notes'].append('Container could not resolve/connect to Firebase; browser test was not attempted here. Run this same script in a networked environment to execute the real Firebase tests.')
        (ROOT/'data'/'v293_real_firebase_two_access_regression_tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2), encoding='utf-8')
        print(json.dumps(report,ensure_ascii=False,indent=2))
        return 2

    http_port=find_free_port(args.port_base)
    httpd=serve(ROOT, http_port)
    url=f'http://127.0.0.1:{http_port}/index.html'
    ports=[find_free_port(args.port_base+10), find_free_port(args.port_base+20)]
    procs=[]; clients=[]; logs=[]; profiles=[]
    try:
        for label,port in [('A',ports[0]),('B',ports[1])]:
            proc,c,ver,log,profile=launch(port,url,label); procs.append(proc); clients.append(c); logs.append(log); profiles.append(profile)
            report.setdefault('browsers',[]).append(ver.get('Browser'))
        A,B=clients
        for c in clients:
            ready=wait_cond(c, '!!window.__DQR_TEST__?.v293Firebase && !!window.__DQR_TEST__?.state?.appReady', timeout=120)
            report['results'].append({'name':f'{c.label} app boot', 'ok':bool(ready), 'detail':ready})
            fready=c.eval(f'window.__DQR_TEST__.v293Firebase.waitFirebaseReady({args.firebase_timeout*1000})', timeout=args.firebase_timeout+20)
            report['results'].append({'name':f'{c.label} Firebase SDK/auth ready', 'ok':bool(fready.get('ok')), 'detail':fready})
            if not fready.get('ok'):
                raise RuntimeError(f'{c.label} Firebase not ready: {fready}')
        cases=[]; failures=[]; total=0
        decks=list(DECKS.keys())
        case_cards=[]
        for d in decks:
            for n in DECKS[d]:
                if n in HIGH_RISK or len(case_cards)<40:
                    case_cards.append((d,n))
        # deck-pair + representative and high-risk cards, actor A/B alternated
        for actor_i,(actorDeck,cardName) in enumerate(case_cards):
            defenderDeck=decks[(actor_i+1)%len(decks)]
            for actor in ['A','B']:
                if total>=args.max_cases: break
                match=f'{args.match_prefix}_{int(time.time())}_{total}_{random.randint(1000,9999)}'
                ok_start, start_detail=start_pair(A,B,match,actorDeck,defenderDeck,timeout=args.firebase_timeout)
                if not ok_start:
                    rec={'case':total,'type':'startPair','ok':False,'match':match,'detail':start_detail}
                    cases.append(rec); failures.append(rec); break
                rec=run_card_case(A,B,total,actorDeck,defenderDeck,cardName,actor=actor)
                rec['match']=match
                cases.append(rec); total+=1
                if not rec['ok']:
                    failures.append(rec)
                    if len(failures)>=12: break
                # Also check turn handoff after some cases.
                if total % 4 == 0:
                    tcase=run_turn_case(A,B,f'turn_{total}')
                    tcase['match']=match
                    cases.append(tcase)
                    if not tcase['ok']:
                        failures.append(tcase)
                        if len(failures)>=12: break
            if total>=args.max_cases or len(failures)>=12: break
        report['results'].append({'name':'real Firebase card/effect/sync/turn cases','ok':not failures,'totalCases':total,'failures':failures[:12]})
        report['caseTail']=cases[-20:]
        for c in clients:
            for e in c.events:
                if e.get('method')=='Runtime.exceptionThrown': report['exceptions'].append({'client':c.label,'event':e.get('params',{})})
        report['chromeLogs']=logs
        (ROOT/'data'/'v293_real_firebase_two_access_regression_tests.json').write_text(json.dumps(report,ensure_ascii=False,indent=2), encoding='utf-8')
        print(json.dumps(report,ensure_ascii=False,indent=2))
        return 0 if all(r.get('ok') for r in report['results']) and not report['exceptions'] else 1
    finally:
        try: httpd.shutdown()
        except Exception: pass
        for p in procs:
            try: p.terminate(); p.wait(timeout=5)
            except Exception: pass

if __name__=='__main__':
    sys.exit(main())
