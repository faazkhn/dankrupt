# 14: Leaderboards

**What to build:** Daily, weekly and all-time boards ranked by time-weighted return, plus Scalper, Swing and Trend-spotter style boards. Daily and weekly windows are IST calendar days, with weeks starting Monday. A player must have at least 5 closed trades in a window to rank on it.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] TWR chains equity returns between cash events (resets). The all-time board compounds across resets, so a wipeout's −100% stays on the record.
- [ ] A trade is a flat-to-flat round trip. Style is the median holding time of the window's trades: under 1 hour, 1 hour to 3 days, or over 3 days.
- [ ] Each board shows rank, handle, TWR, style and reset count. A player can find their own rank even when it's off the page.
- [ ] Tests: TWR with a reset mid-window, the eligibility cut-off, the style boundaries, and the IST day and week edges.
