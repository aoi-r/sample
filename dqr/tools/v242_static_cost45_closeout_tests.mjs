import fs from 'fs';
const app=fs.readFileSync('js/app.js','utf8');
const checks=[
  ['v242 marker', /function v242CompletionMarker\(\)/.test(app)],
  ['うごくせきぞう attack guard', /v242MovingStatueCanAttack/.test(app)&&/canAttackLeaderV173=function/.test(app)],
  ['デボラ rarity upgrade', /v242DeboraSkillLink/.test(app)&&/v242RarityUpgrade/.test(app)],
  ['トロデ positive spell copy', /v242TriggerTrodeCopies/.test(app)&&/applyPendingGenericEffectToUnit=function/.test(app)],
  ['four fortune units implemented', ['エビルドライブ','おばけトマト','メタルドラゴン','リゼロッタ&ルコリア'].every(n=>app.includes(n))&&/v242FortuneSummon/.test(app)],
  ['セニカ renkei', /v242Renkei/.test(app)&&/セニカれんけい/.test(app)],
  ['まおうのつかい damage watcher', /まおうのつかい/.test(app)&&/v242OnDamageApplied/.test(app)],
  ['じごくのざりがに put/summon watcher', /じごくのざりがに/.test(app)&&/v242OnUnitAppeared/.test(app)],
  ['地獄の帝王エスターク aura and splash', /v242EstarkAfterAttack/.test(app)&&/v242EstarkSplashAllEnemies/.test(app)],
  ['エッグラ&チキーラ choice/effect', /v242EggraChikiraSummon/.test(app)&&/v242ApplyEggChickenEffect/.test(app)],
  ['マリンフェアリー/フォレスドン three-choice revive', /v242MarineFairySummon/.test(app)&&/v242ForesdonSummon/.test(app)&&/v242ChooseReviveFromDeadPool/.test(app)],
  ['追撃のキラーマシン strategy ping', /v242StrategyPing/.test(app)&&/applyStrategyEffect=function/.test(app)],
  ['draw wrappers for デザートゴースト and ゲマ', /v242OnDeckDraw/.test(app)&&/デザートゴースト/.test(app)&&/ゲマ/.test(app)],
];
const failed=checks.filter(([,ok])=>!ok);
const out={passed:checks.length-failed.length, failed:failed.length, checks:checks.map(([name,ok])=>({name,ok}))};
fs.writeFileSync('data/v242_static_cost45_closeout_tests.json', JSON.stringify(out,null,2));
if(failed.length){ console.error(JSON.stringify(out,null,2)); process.exit(1); }
console.log(`${out.passed} passed / ${out.failed} failed`);
