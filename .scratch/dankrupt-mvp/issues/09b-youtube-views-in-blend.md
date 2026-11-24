# 09b: YouTube views in the attention blend

**What to build:** Views on each meme's mapped YouTube videos join the attention blend, polled every 15 minutes. This only goes ahead once YouTube approves Dankrupt under its derived-metrics policy. If YouTube refuses, close this ticket as wontfix: Wikipedia plus in-game attention is then the design.

**Blocked by:** 09; and YouTube's written approval of the derived-metrics application (a human task for Faaz, see the spec). Keep the approval email with the project.

**Status:** ready-for-agent once approval exists

**Needs from Faaz:** a YouTube Data API key and the approval email.

- [ ] Ingest uses videos.list only, never search, with as many ids per call as the API accepts. Check the batch limit against the reference before relying on 50. Quota use is logged.
- [ ] View deltas become per-hour rates. Weight is 0.35, and a param caps how far one poll can move the attention index, so bot views can't swing a price on their own.
- [ ] Retention follows the approval terms: statistics are kept at most 36 months, then purged. Titles and other metadata are refreshed or deleted within 30 days.
- [ ] Charts label heat and fair value as Dankrupt's own metrics, not YouTube data. No copy invites players to go and watch videos to move prices.
- [ ] YouTube staleness is 2 missed 15-minute polls.
- [ ] Features table tests cover YouTube joining an existing series without a jump in fair value.
