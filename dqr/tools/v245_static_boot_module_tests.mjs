import fs from 'fs';
const src = fs.readFileSync('js/app.js','utf8');
const fail=[];
function check(name, ok, detail=''){ if(!ok) fail.push({name, detail}); else console.log('PASS', name); }
function linesOf(pattern){ const out=[]; let m; const r=new RegExp(pattern,'g'); while((m=r.exec(src))) out.push(src.slice(0,m.index).split('\n').length); return out; }
check('no duplicate v242EggraChikiraSummon declarations', linesOf('function\\s+v242EggraChikiraSummon\\s*\\(').length===1, String(linesOf('function\\s+v242EggraChikiraSummon\\s*\\(')));
check('no duplicate v242ResolveEggraChikiraGuesses declarations', linesOf('function\\s+v242ResolveEggraChikiraGuesses\\s*\\(').length===1, String(linesOf('function\\s+v242ResolveEggraChikiraGuesses\\s*\\(')));
check('no standalone async token before solo controller', !/^async\s*$/m.test(src), 'standalone async token found');
check('v243 remote Eggra path remains canonical', src.includes('v243QueueRemoteEggraGuess') && src.includes('eggChikiraPending') && src.includes('eggChikiraGuess'));
check('v245 report exists', fs.existsSync('data/v245_boot_module_fix_report.md'));
if(fail.length){ console.error(JSON.stringify({passed:5-fail.length,failed:fail.length,fail},null,2)); process.exit(1); }
console.log('v245_static_boot_module_tests: 5 passed / 0 failed');
