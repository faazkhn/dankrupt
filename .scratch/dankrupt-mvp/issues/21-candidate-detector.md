# 21: Candidate detector (post-alpha)

**What to build:** Every day the detector scores Wikipedia's top-viewed articles and YouTube's most-popular chart by attention acceleration, using score = (a − median(a)) / MAD(a) + 0.5·z. It puts the top 20 into the operator's listing queue.

**Blocked by:** 12, 20

**Status:** ready-for-agent

- [ ] It ingests Wikipedia's daily top-viewed list within the research doc's limits. YouTube's mostPopular chart joins the scoring only once ticket 09b is approved and done; until then YouTube isn't used for detection.
- [ ] It backfills enough history per candidate to compute a and z.
- [ ] The top 20 per day land in the listing queue with their score and the source that flagged them. Already-listed and rejected items are skipped.
- [ ] Tests: scoring on hand-made series, and deduplication against existing memes.
