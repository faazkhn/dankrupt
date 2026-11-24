# 06b: Liquidation and notices

**What to build:** When a player's equity falls below MR, the engine buys back their shorts, largest losses first, through the router as market orders, until equity ≥ IM. It charges a 1% fee on the closed notional and sends an in-app notice. Mark changes in any meme re-check every account that has shorts and holds that meme.

**Blocked by:** 06a

**Status:** ready-for-agent

- [ ] Liquidation is checked on every mark change, using an index of accounts that have shorts, keyed by every meme they hold.
- [ ] The buy-back stops once E ≥ IM. The 1% fee goes to the sink.
- [ ] Equity may end below zero.
- [ ] The amended invariant holds as a property test: after a pass, every account has E ≥ IM or no shorts left.
- [ ] A cross-meme test: a falling long in meme A liquidates a short in meme B.
- [ ] Players get an in-app notice and a history entry. An unread-notice badge shows in the header.
