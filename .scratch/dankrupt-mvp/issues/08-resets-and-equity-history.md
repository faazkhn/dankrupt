# 08: Resets and equity history

**What to build:** A player who has gone broke (equity below 1,000 coins, negative included, with no open positions) can take a free reset back to 100,000 coins. Their profile shows how many resets they've used. Equity is snapshotted regularly and at cash events, ready for TWR.

**Blocked by:** 06b

**Status:** done (see commit "Shorting, margin, liquidation, borrow fees, resets, round trips").

- [ ] Reset is offered only when E < 1,000 and the player has no positions. It cancels resting orders and sets cash to 100,000 through the mint, which writes off any negative balance.
- [ ] A reset is a cash event. Equity is recorded just before and just after it.
- [ ] Equity snapshots are taken every 5 minutes and at every cash event.
- [ ] The profile shows the handle, reset count, equity history chart, and closed trades as flat-to-flat round trips with holding time.
- [ ] Tests: a reset is allowed after a liquidation leaves negative equity, and refused while any position is open.
