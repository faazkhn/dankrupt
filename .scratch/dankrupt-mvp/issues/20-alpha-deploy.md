# 20: Alpha deploy

**What to build:** The full game runs on the India VM for the closed alpha of 50 to 100 players: web, sequencer host, gateway, Postgres and Redis under Docker Compose, with HTTPS, nightly off-box backups and a tested restore. The waitlist from ticket 00 gets alpha invites.

**Blocked by:** 00, 09, 11, 13, 14, 15, 16, 18, 19

**Status:** ready-for-agent

- [ ] One command deploys. Restarts rebuild engine state from snapshot plus log.
- [ ] A backup is restored to a scratch database and replays to identical state.
- [ ] Alpha access is gated to invited emails.
- [ ] The privacy notice and terms are live. They state that coins have no money value and can't be bought or cashed out.
- [ ] Basic alerts reach Faaz when the engine is down, the event log lags, or a data source is stale.
- [ ] A smoke test passes against production: sign in, buy, see the position, see the chart move.
