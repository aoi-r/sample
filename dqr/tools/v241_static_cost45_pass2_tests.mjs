import fs from 'fs';
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const checks = [
  ['v241 marker', /function v241CompletionMarker\(\)/],
  ['summon wrapper', /applySummonV166=function\(unit,card,pos\).*v241ApplySummon/s],
  ['death wrapper', /applyDeathrattle=function\(unit,side='player'\).*v241ApplyDeath/s],
  ['annlucia target', /case 'アンルシア'.*攻撃力5以上/s],
  ['silvia tension both', /case 'シルビア'.*gainTensionForSideV222\('player',3.*gainTensionForSideV222\('enemy',3/s],
  ['king slime tension', /name==='キングスライム'.*スライム/s],
  ['hueza turn end', /u\.name==='ヒューザ'.*v241RandomEnemyAny/s],
  ['maribel spell discount', /case 'マリベル'.*nextSpellCostDelta/s],
  ['roxanne packs', /v241RoxannePackChoice/],
  ['dragon heavy no move', /noMoveNoReturnV241/],
  ['cost aura night fox', /spellCostAuraV241NightFox/],
  ['damage cap greig', /damageCapOneUntilOpponentTurnEndV241/],
  ['meda road enemy spell heal', /u\.name==='メーダロード'|name==='メーダロード'/],
  ['slime borg discard hook', /card\?\.name==='スライムボーグ'/],
  ['queen momo leader aura', /leaderAttackAuraV241Queen/],
  ['v241b entry passives', /function v241ApplyEntryPassives/],
  ['v241c skill link connected', /reason==='skillUse'.*v241SkillLink/s]
];
const results = checks.map(([name,re])=>({name, ok:re.test(app)}));
const failed = results.filter(x=>!x.ok);
fs.writeFileSync(new URL('../data/v241_static_cost45_pass2_tests.json', import.meta.url), JSON.stringify({passed:results.length-failed.length, failed:failed.length, results}, null, 2));
if(failed.length){ console.error(failed); process.exit(1); }
console.log(`${results.length} passed / 0 failed`);
