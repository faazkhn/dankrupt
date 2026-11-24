# 03a: Order book, limit orders and router

**What to build:** Players can post limit orders that rest in a price-time book. Every order goes through the router, which fills step by step from whichever of book and house is cheaper, with players winning ties. After any house move, the no-cross rule fills resting orders that cross the house quote. Makers pay no fee.

**Blocked by:** 02

**Status:** done: price-time book, limit orders, router (players win ties, PRD §6.7 golden test), no-cross rule on every price move, cause-keyed journal so tick fills replay idempotently.

- [ ] Limit prices sit on the 0.01 price step. Quantities are whole shares, and the router rounds each house chunk down.
- [ ] The router matches PRD §6.4. A golden test reproduces the corrected §6.7 example: 21 / 100 / 179 shares, total 30,964.6 coins, average 103.22, fee 31.
- [ ] The no-cross rule holds after every event: best book bid < a_h and best book ask > b_h. A resting order filled by the house counts as maker and gets the curve price when it beats the limit.
- [ ] The quote shows best bid = max(book, b_h) and best ask = min(book, a_h). Mid falls back to the house quote when a book side is empty.
- [ ] Property tests cover best execution, priority (equal-price book volume fills before the house), no-cross, conservation and determinism.
- [ ] Minimal UI: a limit price field in the order ticket.
