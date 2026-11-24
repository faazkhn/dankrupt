# 01: Minimal playable version (walking skeleton)

**What to build:** A player can open a bare meme page for one seeded meme, see the house price and buy or sell whole shares at market against the house. Cash and position update, and everything survives a server restart because state is rebuilt by replaying the event log. Login is a dev-only stub. This ticket lays the path every later ticket thickens: the engine library, the sequencer host writing the event log, the API, and the web page. The house sits still in this ticket, with no drift yet.

**Blocked by:** None (can start immediately)

**Status:** done: engine, sequencer with event log and replay, API, and a dev-login trading page. The engine library holds all the exchange rules; events are persisted before they are applied.

- [ ] Memes are seeded from a file; this one has a single meme at p = 100 and Y = 500,000.
- [ ] A market buy or sell fills against the house curve with the spread at s₀ and a 0.1% taker fee. Fill costs are integer micro-coins, rounded in the house's favour (ADR-0002).
- [ ] New players get 100,000 coins from the mint. A market buy fills as far as free cash goes and cancels the rest. A sell is limited to shares held, since shorting comes later.
- [ ] Every fill writes balanced journal lines (player, house, sink, mint). Balances and positions are projections of the journal.
- [ ] Every input gets a global sequence number and is persisted before it is applied (ADR-0001). The server rebuilds by replaying the log on restart.
- [ ] Engine property tests pass: conservation, curve x·y = L² to rounding, and determinism (replaying gives byte-identical state).
- [ ] An integration test against a real Postgres places an order, restarts, and checks the state is identical.
- [ ] The Node version is pinned.
