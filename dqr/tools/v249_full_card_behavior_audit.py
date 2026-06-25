#!/usr/bin/env python3
import json, re, csv, os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
APP=(ROOT/'js/app.js').read_text(encoding='utf-8')
cards_obj=json.loads((DATA/'cards.json').read_text(encoding='utf-8'))
cards=cards_obj['cards']
keywords=set(['速攻','におうだち','貫通','ステルス','ねらい撃ち','絶好調','おうえん','2回攻撃','超貫通','反撃ダメージ無効'])
trigger_words=['召喚時','死亡時','攻撃時','攻撃した後','攻撃する時','テンションリンク','スキルリンク','れんけい','BET','GET','占い','選択','パワフルバッジ','手札から捨てた時','自分のターン開始時','自分のターン終了時','相手のターン開始時','相手のターン終了時','味方が','敵が','場に出る','場に出した','場にいる間','前列にいる場合','後列にいる場合','このユニットが','特技を使う','カードを引く','カードを1枚引く','手札に加える','場に出す','復活','変身','毒','封印','消滅','ダメージ','回復','コスト','ランダム']
complex_words=['ランダム','全て','選択','占い','れんけい','BET','GET','パワフルバッジ','場に出す','復活','変身','封印','消滅','死亡時','召喚時','攻撃時','テンションリンク','スキルリンク','特技','手札から捨てた時','山札','デッキ','コスト','この対戦中','このターン','次の相手のターン終了時']
plain_keywords_re=re.compile(r'^(?:\s*(?:速攻|におうだち|貫通|ステルス|ねらい撃ち|絶好調|おうえん|2回攻撃|超貫通|反撃ダメージ無効)[、,。\s]*)+$')

def norm(s): return (s or '').strip()

def in_app(name):
    return name and name in APP

def occur(name):
    return APP.count(name) if name else 0

def has_generic_coverage(text, card):
    k=set(card.get('keywords') or [])
    t=text or ''
    if not t: return 'no_text'
    if plain_keywords_re.match(t) or (k and all(w in keywords for w in k) and not any(w in t for w in complex_words)):
        return 'basic_keyword_generic'
    # broad generic engines known in this project
    generic=[]
    for w,label in [('速攻','keyword'),('におうだち','keyword'),('貫通','keyword'),('ステルス','keyword'),('ねらい撃ち','keyword'),('GET','get_engine'),('BET','bet_engine'),('占い','fortune_engine'),('れんけい','renkei_engine'),('選択','choice_engine'),('パワフルバッジ','badge_engine')]:
        if w in t: generic.append(label)
    return '+'.join(sorted(set(generic))) if generic else ''

rows=[]
for c in cards:
    name=c.get('name','')
    text=norm(c.get('text',''))
    cardtype=c.get('cardType','') or c.get('type','')
    cost=c.get('cost','')
    app_hits=occur(name)
    triggers=[w for w in trigger_words if w in text]
    generic=has_generic_coverage(text,c)
    simple=(not text) or generic in ('no_text','basic_keyword_generic')
    complex_score=sum(1 for w in complex_words if w in text)
    if simple:
        risk='LOW_NO_EFFECT_OR_BASIC'
    elif app_hits>0:
        risk='MEDIUM_IMPLEMENTED_NAME_PRESENT'
        if complex_score>=5: risk='MEDIUM_COMPLEX_IMPLEMENTED_RECHECK'
    elif generic:
        risk='MEDIUM_GENERIC_ENGINE_ONLY'
    else:
        risk='HIGH_NO_NAME_NO_GENERIC'
    # high risk if specific trigger/pool without explicit name
    if app_hits==0 and any(w in text for w in ['ランダム','手札から捨てた時','この対戦中','場に出す','復活','変身','封印','消滅','選択']):
        risk='HIGH_COMPLEX_NO_EXPLICIT_NAME'
    rows.append({
        'id':c.get('id',''), 'name':name, 'cost':cost, 'cardType':cardtype,
        'classes':'/'.join(c.get('classes') or []), 'tribes':'/'.join(c.get('tribes') or ([] if not c.get('tribe') else [c.get('tribe')])),
        'deckBuildable':c.get('flags',{}).get('deckBuildable',''),
        'text':text.replace('\n',' '), 'triggers':'|'.join(triggers),
        'appNameOccurrences':app_hits, 'genericCoverage':generic,
        'complexScore':complex_score, 'risk':risk,
        'officialUrl':(c.get('official') or {}).get('detailUrl','')
    })

# Aggregate
from collections import Counter
risk_counts=Counter(r['risk'] for r in rows)
type_counts=Counter(r['cardType'] for r in rows)
trigger_counts=Counter()
for r in rows:
    for t in filter(None,r['triggers'].split('|')): trigger_counts[t]+=1

# write csv/json
(DATA/'v249_full_card_behavior_audit.csv').write_text('',encoding='utf-8')
with open(DATA/'v249_full_card_behavior_audit.csv','w',encoding='utf-8',newline='') as f:
    writer=csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader(); writer.writerows(rows)
priority=[r for r in rows if r['risk'].startswith('HIGH') or r['risk']=='MEDIUM_COMPLEX_IMPLEMENTED_RECHECK']
with open(DATA/'v249_full_card_behavior_priority_queue.csv','w',encoding='utf-8',newline='') as f:
    writer=csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader(); writer.writerows(priority)
(DATA/'v249_full_card_behavior_audit.json').write_text(json.dumps({'summary':{'total':len(rows),'riskCounts':risk_counts,'typeCounts':type_counts,'triggerCounts':trigger_counts,'priorityCount':len(priority)},'rows':rows},ensure_ascii=False,indent=2),encoding='utf-8')
# duplicate function declarations
funcs=re.findall(r'function\s+([A-Za-z0-9_$]+)\s*\(', APP)
fc=Counter(funcs)
dup_funcs=[{'function':k,'count':v} for k,v in sorted(fc.items()) if v>1]
(DATA/'v249_duplicate_function_declarations.json').write_text(json.dumps(dup_funcs,ensure_ascii=False,indent=2),encoding='utf-8')
# cards with many hits
many=[r for r in rows if isinstance(r['appNameOccurrences'],int) and r['appNameOccurrences']>=8 and r['text']]
with open(DATA/'v249_many_app_occurrences.csv','w',encoding='utf-8',newline='') as f:
    writer=csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    writer.writeheader(); writer.writerows(many)
# report
report=[]
report.append('# v249 全カード挙動監査 pass1\n')
report.append('## 目的\n全1607カードを対象に、効果文・既存app.js内の名前出現・汎用エンジン対象を横断して、未接続/再確認優先候補を抽出した。\n')
report.append('## 集計\n')
report.append(f'- 総カード数: {len(rows)}\n')
for k,v in risk_counts.most_common(): report.append(f'- {k}: {v}\n')
report.append(f'\n優先確認キュー: {len(priority)}件\n')
report.append('\n## 種別\n')
for k,v in type_counts.most_common(): report.append(f'- {k}: {v}\n')
report.append('\n## 注意\nこのpass1は「全カードの完全実機確認」ではなく、全カードを機械的に棚卸しして危険箇所を明確にする段階。次passで priority queue を上から公式DB/効果文ベースで個別修正する。\n')
report.append('\n## 生成ファイル\n- v249_full_card_behavior_audit.csv/json\n- v249_full_card_behavior_priority_queue.csv\n- v249_duplicate_function_declarations.json\n- v249_many_app_occurrences.csv\n')
(DATA/'v249_full_card_behavior_audit_report.md').write_text(''.join(report),encoding='utf-8')
print(json.dumps({'total':len(rows),'riskCounts':risk_counts,'priorityCount':len(priority),'duplicateFunctions':len(dup_funcs)},ensure_ascii=False,indent=2))
