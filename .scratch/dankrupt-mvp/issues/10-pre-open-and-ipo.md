# 10: Pre-open and IPO

**What to build:** Approving a candidate starts a 30-minute pre-open. During pre-open, players see the meme page, attention graph and fair value, and can trade with each other through the book with limit orders only, while the house stays closed. At IPO the house opens at p = 100, and the no-cross rule fills every resting order that crosses it.

**Blocked by:** 03b, 12

**Status:** ready-for-agent

- [ ] The lifecycle state machine has Candidate → Pre-open → Active and Candidate → Rejected. Operator approval in ticket 12 now starts pre-open instead of listing straight away.
- [ ] Pre-open rejects market and stop orders. Book orders match each other normally.
- [ ] During pre-open, mid falls back to F when the book isn't two-sided.
- [ ] At IPO, the no-cross pass fills crossing orders as maker. A test opens with stacked bids above 100 and checks the open price comes from them.
- [ ] A countdown to open shows on the meme page.
