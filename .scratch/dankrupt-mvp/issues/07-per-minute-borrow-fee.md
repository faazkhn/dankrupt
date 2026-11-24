# 07: Per-minute borrow fee

**What to build:** Shorts pay a borrow fee for every started minute they are held. The rate is r = r₀ + r₁·U, where U = short OI / (long OI + house virtual shares x). Fees accrue against equity immediately and are booked to the sink hourly and whenever a short is reduced.

**Blocked by:** 06a

**Status:** done (see commit "Shorting, margin, liquidation, borrow fees, resets, round trips").

- [ ] Each started minute charges |q|·M·r/60, using that minute's U and M. A 20-second short pays one minute.
- [ ] Accrued, unbooked fees count in equity and margin.
- [ ] Booking writes balanced journal lines hourly and when the short is reduced or closed.
- [ ] Defaults: r₀ = 0.005%/h and r₁ = 0.05%/h. A dormant-meme multiplier param exists (default 5×); ticket 11 applies it.
- [ ] The UI shows the current borrow rate per meme and the fees each position has accrued.
- [ ] Tests: a crowded short at U = 1 pays about 1.32% a day. Replay reproduces the fees exactly.
