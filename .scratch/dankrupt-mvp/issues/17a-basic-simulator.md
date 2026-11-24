# 17a: Basic simulator

**What to build:** A command-line simulator that replays historical Wikipedia pageviews for past memes in virtual time. It runs them through the real engine and features modules against random traders, trend-spotters and a house, then reports liveliness and whether trend-spotters beat random traders. It gives early feedback on the pricing model before shorting and lifecycle exist.

**Blocked by:** 04

**Status:** ready-for-agent

**Needs from Faaz:** approve the list of 30+ past memes, which the agent drafts first. They must be post-July 2015 and pass the content screen.

- [ ] It uses the same engine and features code as the server, with no copies, and runs as fast as the CPU allows.
- [ ] It takes a seed, a params set and a meme list. The same inputs produce the same report.
- [ ] It reports: median daily move per meme (target 3% to 15%), longest flat stretch (target ≤ 1 hour), correlation of daily log price with log attention (target ≥ 0.6), and trend-spotter vs random median TWR over 30 days across N seeds (target: beat random in ≥ 80% of runs).
- [ ] The report is written as a readable file, plus machine-readable output for sweeps.
