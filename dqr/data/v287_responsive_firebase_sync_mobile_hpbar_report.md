# v287 responsive Firebase sync + mobile HP bar

- Added `syncV287/{clientInstanceId}` compact public state channel.
- Publishes immediately and with short retry echoes after real mutations; does not publish on render.
- Receiver applies remote `self` as enemy board and accepts `opponentView` for own side only during combat/damage/death/turn or when the remote side is turn owner.
- Wrapped turn advance with more robust opponent lookup using room players and v287 states as fallback.
- Added smartphone landscape HP bar inside placed unit slots.
