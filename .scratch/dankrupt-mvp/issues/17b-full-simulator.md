# 17b: Full simulator

**What to build:** Extend the simulator to the full bot population and every §11.3 pass criterion. The bots are random traders, trend-spotters, fair-value traders, momentum scalpers, market makers, whales and short sellers. It adds shorting, borrow fees, resets, dormancy and revival.

**Blocked by:** 07, 08, 11, 17a

**Status:** ready-for-agent

- [ ] All seven bot types from PRD §11.2, each with its own seeded behaviour.
- [ ] It reports every §11.3 metric: trend-spotter edge, price tracking attention, liveliness, coin supply growth ≤ 2% a week per active player, whale recovery (a 100,000-coin push halves within 4 to 8 hours), and revival (≥ half of comebacks trigger within 24 hours).
- [ ] It can sweep params across seeds and rank the settings that pass.
