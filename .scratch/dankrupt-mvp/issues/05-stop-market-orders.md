# 05: Stop-market orders

**What to build:** Players can place a stop-market order that turns into a market order when the mid crosses the stop price, in either direction (a stop-loss on a long, or a stop on a short).

**Blocked by:** 03b

**Status:** done: stop-market orders fire on the mid (ticks or fills), cascade safely, cancel like any order; Stop option in the ticket with a fire-at-today's-prices preview.

- [ ] A stop triggers on the first event or tick where the mid crosses it, then routes as a market order.
- [ ] Stops are indexed by trigger price, so ticks stay cheap with many stops.
- [ ] Stops can be cancelled and appear among open orders. Replay reproduces trigger timing exactly.
- [ ] Tests cover a buy stop and a sell stop triggered by house drift alone, with no trades.
