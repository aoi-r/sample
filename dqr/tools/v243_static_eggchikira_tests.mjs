import fs from 'fs';
const src = fs.readFileSync('js/app.js','utf8');
const checks = [
  ['pending action exists', /eggChikiraPending/.test(src)],
  ['guess action exists', /eggChikiraGuess/.test(src)],
  ['resolved action exists', /eggChikiraResolved/.test(src)],
  ['remote reducer hook exists', /_v243_orig_applyRemoteReducer/.test(src)],
  ['own turn modal guard exists', /v243MaybePromptEggraGuessOnOwnTurn/.test(src)],
  ['side aware effect exists', /v243ApplyEggChickenEffect\(choice, sourceSide/.test(src)],
  ['summon override exists', /function v242EggraChikiraSummon\(unit\)/.test(src)],
  ['render hook exists', /_v243_orig_renderBattleArena/.test(src)]
];
const results = checks.map(([name, ok]) => ({name, ok}));
const failed = results.filter(x=>!x.ok);
fs.writeFileSync('data/v243_static_eggchikira_tests.json', JSON.stringify({passed:results.length-failed.length, failed:failed.length, results}, null, 2));
if(failed.length){ console.error(failed); process.exit(1); }
console.log(`${results.length} passed / 0 failed`);
