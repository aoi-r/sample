# v306 Eleven Lv2 all-renkei force fix

## Bug
With 勇者イレブン Lv2 一心同体 active and tension 0/1/2, v289 only applied the actual fallback effect for かくれんぼう. Other renkei cards could hit the fallback path that logged “renkei is available” but returned true without applying the card's actual renkei effect.

Reported case:
- tension = 1
- Hero skill: 勇者イレブン Lv2 一心同体 used
- Summon: ウルノーガ&ウルナーガ
- Expected: renkei effect resolves
- Actual before v306: effect did not resolve

## Fix
v306 intercepts applyRenkeiIfActive before old wrappers when:
- card has renkei
- tension < 3
- Eleven bond is active

It then applies the actual renkei effect once, including:
- later patch helpers such as v226/v232/v233/v242 where present
- applyRenkeiV166
- the main custom renkei cases from the base implementation, including ウルノーガ&ウルナーガ
- generic text fallback

It also treats 一心同体 as persistent “以後” once used, so the flag is not lost just because the hero level later advances.

## Checks
- node --check js/app.js: see data/v306_checks.json
- static checks: see data/v306_static_checks.json
- runtime API: window.__DQR_TEST__.v306.simulateElevenLv2UlnoogaRenkeiV306()
