# 13: Operator dashboard

**What to build:** A dashboard where the operator sees whether the economy is running hot and whether the engine is healthy. It shows coin supply S(t) and its weekly growth per active player against the 2% target, house P&L (realised and mark-to-market) per meme, fees and borrow collected, resets granted, and engine health.

**Blocked by:** 08, 12

**Status:** done: coin supply and weekly growth per active player vs 2% (net of sign-ups and resets), house P&L per meme (engine tracks house cash), fees, minted coins, engine health (events, tick lag, order p50/p99, websocket clients, stale attention). Supply identity tested.

- [ ] Coin supply and house P&L are derived from the journal. A check confirms dS = −ΔΠ_house − fees + resets.
- [ ] Weekly supply growth per active player is shown against the 2% target and flagged when above it.
- [ ] Engine health: event-log lag, order latency p50/p99, tick lag, last features update per source, websocket client count.
- [ ] Operator-only access, readable at phone width.
