# v303 effect context total dedupe guard

## Why this exists

v301 fixed Ludman specifically. v302 added event-entry guards. v303 broadens the guard so high-risk sub-entry interpreters inside an event also become once-per-event+arguments.

This is meant to catch the class of bugs where the same summon/death/BET/fortune/hero/turn/attack/card-use path is reached through both an older generic parser and a newer specific handler.

## Guard policy

- Event handlers establish a current effect context.
- High-risk effect interpreters are deduped by `(event id, handler type, turn, function name, arguments)`.
- Low-level mutators are **not** globally deduped, because that would break legitimate effects such as GET(2), multiple-target damage, split damage, draw multiple cards, or repeated buffs from distinct cards.

## Static effect scope from cards.json

```json
{
  "summon": 467,
  "death": 121,
  "bet": 48,
  "get": 51,
  "renkei": 40,
  "fortune": 66,
  "turn": 128,
  "attack": 33,
  "draw_generate": 155,
  "damage": 372,
  "buff_debuff": 729,
  "random": 217
}
```

## Honesty

This does not prove every possible hand order/random/board/Firebase timing is mathematically impossible to break. It adds a broader architectural guard and audit surface. Real Firebase/cloud two-device exhaustive testing still needs a network-capable environment.
