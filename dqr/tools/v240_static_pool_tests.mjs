import fs from 'node:fs';
const js = fs.readFileSync('js/app.js','utf8');
const cards = JSON.parse(fs.readFileSync('data/cards.json','utf8')).cards;
const mustContain = [
  'function v240ApplyCost45Summon',
  "case 'エビルトレント'",
  "case 'バアルゼブブ'",
  "case 'サイレス'",
  "case 'メッサーラ'",
  "case 'ベロニカ'",
  "case 'セラフィ'",
  'v240RefreshAuras',
  'v240_cardType_corrected'
];
let passed=0, failed=0; const details=[];
function check(name, ok){ if(ok){passed++; details.push({name,ok:true});} else {failed++; details.push({name,ok:false});} }
for(const s of mustContain) check(`contains ${s}`, js.includes(s) || JSON.stringify(cards).includes(s));
const ebiru = cards.find(c=>c.name==='エビルトレント');
check('エビルトレント is corrected to unit', ebiru && ebiru.cardType==='ユニット' && Number(ebiru.cost)===6);
const audit = fs.existsSync('data/v240_cost45_unit_and_spell_pass1_audit.csv') ? fs.readFileSync('data/v240_cost45_unit_and_spell_pass1_audit.csv','utf8') : '';
check('audit has v240 additions', (audit.match(/v240_added_or_reinforced/g)||[]).length >= 100);
check('spell pool still audited', audit.includes('cost4_5_6_spell'));
console.log(JSON.stringify({passed, failed, details}, null, 2));
if(failed) process.exit(1);
