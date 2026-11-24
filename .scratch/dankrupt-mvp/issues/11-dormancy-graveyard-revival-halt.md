# 11: Dormancy, Graveyard, revival and halt

**What to build:** The rest of the meme lifecycle. A meme whose heat stays below 0.3 for 7 days goes dormant. It moves to the Graveyard tab and its fair value decays with a 7-day half-life. New shorts are blocked once utilisation passes 0.5, and the borrow fee is 5×. A dormant meme revives when z > 2 and a > a_rev: decay resets, it gets a "Comeback" banner, and it is pushed to the trending feed. The operator can halt any meme, which settles every position at the last mark.

**Blocked by:** 07, 10

**Status:** done: heat < 0.3 for 7 days → dormant (fair value halves every 7 days, floor 1; borrow 5×; new shorts blocked above U 0.5), revival on z > 2 and acceleration > a_rev (param, default 0.05) with a Comeback banner and trending boost, operator halt settles every position at the mark. Graveyard tab.

- [ ] The Active → Dormant trigger is every features update over a rolling 7 days below H = 0.3.
- [ ] D = 2^(−t_d / 7 days) while dormant, and 1 when active. F stays ≥ 1. Dormant memes stay tradable.
- [ ] The dormant short block (U > 0.5) and the 5× borrow multiplier are enforced.
- [ ] Revival follows the thresholds, with a_rev in params. The Comeback banner and trending boost appear.
- [ ] A halt settles longs at q·M and shorts at |q|·M against the house, cancels orders, and removes the meme from trading. It is recorded in the log.
- [ ] Tests run each transition on synthetic feature series, and replay reproduces each one.
