import fs from 'fs';
const src = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const tests = [
  ['sessionId is tracked in battle state', /sessionId: ''/.test(src)],
  ['fresh active helper exists', /function isFreshActivePlayerV244/.test(src)],
  ['session state filter exists', /function filterSessionStatesV244/.test(src)],
  ['waiting race guard exists', /showWaitingForOpponent\(\);\n\s*}\n\s*renderBattleArena\(\);\n}\n\nfunction subscribeRoomPlayers/.test(src)],
  ['remote board authoritative comment exists', /Remote board snapshots are authoritative|リモートstateは盤面全体/.test(src)],
  ['public state carries sessionId', /sessionId: state\.battle\.sessionId/.test(src)],
  ['states subscription filters session states', /filterSessionStatesV244\(snap\.val\(\) \|\| \{\}\)/.test(src)],
  ['stale rooms are removed before join', /freshActive\.length === 0[\s\S]*await remove\(roomRoot\)/.test(src)]
];
let failed = 0;
for(const [name, ok] of tests){
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if(!ok) failed++;
}
if(failed) process.exit(1);
