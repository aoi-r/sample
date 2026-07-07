# v315 Random put-into-play and static aura audit

## Why

Cards/effects that say 「場に出す」 are not normal summons. Their summon/battlecry effects must not fire.
However, a unit that is on the board must still have printed keywords, synchro/static abilities, and continuous auras.

## Added guard

- Mark put-into-play units as not summoned: `_v315NoSummonEffects` / `putIntoPlayNotSummonedV315`.
- Block summon-effect interpreters if they accidentally receive a put-into-play unit.
- Apply printed non-summon field effects:
  - base keywords such as におうだち/速攻/貫通
  - シンクロ/同調 as board static ability
  - printed 特技ダメージ+N before 召喚時
  - printed attack scaling based on spells used
  - 攻撃できない static restrictions
- Refresh continuous effects for both sides after local and remote put-into-play.
- Filter random put-into-play pools to exclude generated/non-deck/hero-skill/token noise.

## Four-deck audit

Rows with put-play/static risk: 36
Incomplete rows: 0

See:
- `data/v315_random_putplay_static_aura_manifest.json`
- `data/v315_static_random_putplay_checks.json`
- `tools/v315_random_putplay_static_aura_audit.py`
