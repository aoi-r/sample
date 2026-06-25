import fs from 'fs';
const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const checks = [];
function ok(name, cond, detail=''){ checks.push({name, ok:!!cond, detail}); }
ok('v246EventGuard helper exists', /function v246EventGuard\(/.test(app));
ok('final duplicate guards installed after historical wrappers', /installV246FinalDuplicateGuards/.test(app));
ok('cardPlayed final handler guarded', /wrap\('handleCardPlayedEvent', 'cardPlayed'\)/.test(app));
ok('spellPlayed final handler guarded', /wrap\('handleSpellPlayedEvent', 'spellPlayed'\)/.test(app));
ok('unitSummoned final handler guarded', /wrap\('handleUnitSummonedEvent', 'unitSummoned'\)/.test(app));
ok('unitDeath final handler guarded', /wrap\('handleUnitDeathEvent', 'unitDeath'\)/.test(app));
ok('damageApplied final handler guarded', /wrap\('handleDamageAppliedEvent', 'damageApplied'\)/.test(app));
ok('turn-end core guarded', /v166ApplyEndTurn = function\(side='player'\)/.test(app) && /powerfulBadgeTurnEnd/.test(app));
ok('choice and fortune card use returns before generic parser', /if\(hasFortuneEffect\(card\)\)\{ applyFortuneEffect\(card\); return; \}\n  if\(text\.includes\('選択'\)\)\{ applyChoiceEffect\(card\); return; \}/.test(app));
ok('summon choice/fortune does not fall through into summon text parser', /specialChoiceOrFortuneHandledV246/.test(app) && /flags\.summon && !specialChoiceOrFortuneHandledV246/.test(app));
ok('explicit summon handlers skip broad generic text parser', /v246ShouldSkipGenericSummonText\(card\)\) return;/.test(app));
ok('summon GET has per-unit duplicate guard', /_v246SummonGetApplied/.test(app));
const failed = checks.filter(c=>!c.ok);
const result = {passed:checks.length-failed.length, failed:failed.length, failures:failed, checks};
fs.writeFileSync(new URL('../data/v246_duplicate_trigger_audit_tests.json', import.meta.url), JSON.stringify(result,null,2));
console.log(`${result.passed} passed / ${result.failed} failed`);
if(failed.length){ console.error(JSON.stringify(failed,null,2)); process.exit(1); }
