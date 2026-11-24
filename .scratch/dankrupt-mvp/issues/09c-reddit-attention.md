# 09c: Reddit attention in the blend

**What to build:** Reddit activity becomes an attention source. Each meme's signal map gains subreddits and search terms. Ingest counts new posts and comment activity per hour for those mappings through the official Reddit Data API, never by scraping. Reddit only goes ahead once Reddit approves Dankrupt's access request under its Responsible Builder Policy. If Reddit refuses, close this ticket as wontfix.

**Blocked by:** 09; and Reddit's written approval of the Data API access request (a human task for Faaz, see the spec). Keep the approval with the project.

**Status:** ready-for-agent once approval exists

**Needs from Faaz:** the approved OAuth client credentials, and a decision on Reddit's blend weight. Suggested default: 0.25, as a param.

- [ ] Before building, read the Reddit Data API Terms and Developer Terms in full, since the research couldn't fetch them. Check whether a derived attention score and stored counts are allowed, and for how long, then record the answer in `docs/research/data-source-terms.md`.
- [ ] Ingest uses OAuth with a descriptive User-Agent and stays under the approved rate limit. The free-tier figure is 100 queries a minute per client id, which is unverified. Quota use is logged.
- [ ] The signal map editor (ticket 12) accepts subreddits and search terms per meme.
- [ ] Raw Reddit content (post titles, bodies, usernames) is not stored or shown. Only counts are kept, within whatever retention the terms allow.
- [ ] Reddit staleness is 2 missed polls at its own cadence.
- [ ] Features table tests cover Reddit joining an existing series without a jump in fair value.
