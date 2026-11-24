# 06a: Opening shorts, collateral and mark price

**What to build:** A player can sell shares they don't hold to open or add to a short on any active meme. They need equity ≥ initial margin after the order. Short proceeds and initial margin are locked out of free cash. The mark price (median of mid, 5-minute EMA of last, and F) values every position. The account panel shows equity, IM and MR.

**Blocked by:** 03b, 04

**Status:** ready-for-agent

- [ ] Equity = cash + Σ q·M. IM = 0.5 × short value and MR = 0.3 × short value, both at mark.
- [ ] A short or add-to-short is rejected if E − IM < 0 after the order. Resting short sells hold back margin.
- [ ] Free cash = cash − Σ over shorts of |q|·M·(1 + m_I) − held-back buy cash. Buys must come from free cash.
- [ ] The mark price follows the spec, with a property test that a single odd fill can't move it past the median of the other two inputs.
- [ ] A golden test reproduces the PRD §7.5 numbers, recomputed to include the entry taker fee.
- [ ] The UI shows equity, IM, MR and distance to liquidation, at phone width.
