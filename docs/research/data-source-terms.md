# Data-source terms: Wikimedia pageviews and YouTube Data API v3

Researched 2026-11-24 against primary sources only (Wikimedia docs, policy wikitext, OpenAPI spec; YouTube developer terms and docs). Quotes are exact. Anything I could not confirm on a primary page is listed under "Not verified".

## Summary

- **Wikipedia is safe to build on.** The pageview data is CC0. The API has no key, and its access policy places no limits on commercial or game use. The rules are etiquette: a descriptive User-Agent with contact details, at most 3 concurrent requests, honouring `Retry-After`, and roughly 200 req/min for a User-Agent-only client. Per-article counts are **daily or monthly only, never hourly** through the API. Day D loads after 00:00 UTC on D+1 and is "usually done within a few hours, but can take 24 hours or more". Hourly per-article counts exist only in the bulk dumps (about 35–53 MB gzipped per hour).
- **YouTube, as ticket 09 is written, conflicts with the default Developer Policies.** Under the policies that apply by default, the game may not (a) store unauthenticated `viewCount` snapshots for more than 30 days, (b) "create new or derived data or metrics" from API Data, which includes "a score that factors in ... total views", or (c) aggregate or combine API Data with other sources. A heat score and fair value blended from YouTube views plus Wikipedia does all three. Storing only derived features does not get around this, because creating derived metrics is itself what's banned.
- **The one route YouTube offers** is the "Additional policies for derived metrics and data storage" (live since 2026-06-01). It is open only to *audited* developers with an *analytics use case* who apply through the quota-extension form. If accepted, the project may create derived metrics, including "Gamification and Leaderboards" and custom scores, and may store statistics for up to 36 months. Whether a meme-trading game counts as "an analytics use case on YouTube" is YouTube's call and is unverified.
- **Quota is not the bottleneck.** The default is 10,000 units a day and `videos.list` costs 1 unit, including `chart=mostPopular`. Polling every 15 minutes is 96 polls a day, so up to about 104 calls per poll (about 5,200 video ids at 50 per call) fit in the default quota.

---

## 1. Wikimedia pageviews (Analytics API / AQS)

### 1.1 Endpoints and granularity

Source: the OpenAPI spec that the reference page renders, [`api-spec.json`](https://wikimedia.org/api/rest_v1/metrics/pageviews/api-spec.json), embedded in the [Page views reference](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html).

| Endpoint | Path | Granularity |
| --- | --- | --- |
| Per-article | `/pageviews/per-article/{project}/{access}/{agent}/{article}/{granularity}/{start}/{end}` | enum `daily`, `monthly`. **No `hourly`.** |
| Top | `/pageviews/top/{project}/{access}/{year}/{month}/{day}` | one day, or `day` = `all-days` for a month. The spec says it "Lists the 1000 most-viewed pages on a Wikimedia project." |
| Aggregate (project-wide) | `/pageviews/aggregate/...` | `hourly`, `daily`, `monthly`. Not per page. |

- `start` and `end` are `YYYYMMDDHH`. `agent` takes `all-agents`, `user`, `spider` or `automated`, and `access` takes `all-access`, `desktop`, `mobile-app` or `mobile-web` ([spec](https://wikimedia.org/api/rest_v1/metrics/pageviews/api-spec.json)). Use `agent=user` to exclude detected bots ([Page views concept](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/concepts/page-views.html)).
- **History:** "These endpoints serve data starting on July 1, 2015." ([reference](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html)). I also checked this live: `per-article/.../Rickrolling/daily/2015070100/...` returned data.
- **Redirects:** "Redirects, particularly redirects based on alternate spellings of a page title, aren't counted as views of the actual page." ([concept](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/concepts/page-views.html)). Map the canonical title, and add redirect titles to the signal map if they get real traffic.

### 1.2 Publication lag

From the [Troubleshooting page](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/troubleshooting.html):

> "Data is loaded at the end of the time span in question. For example: Data for 2015-12-01 was loaded on 2015-12-02 00:00:00 UTC."
> "This process is usually done within a few hours, but can take 24 hours or more if there are problems."

Two traps on the same page:

> "404 not found responses from the API can mean that there are 0 page views ... This error may also occur if your client requests data that hasn't been loaded ... the API can't distinguish between actual zeros and data that hasn't been loaded"
> "zero values are omitted from API responses ... there may be gaps in the time series in the response."

Observed, not documented: at 12:26 UTC on 2026-11-24, the 2026-11-23 daily point was present. Responses carry `cache-control: s-maxage=14400, max-age=14400`, so a cached answer can be up to 4 hours old.

### 1.3 Rate limits and User-Agent

- The [Access policy](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html) says: "The API requires an HTTP User-Agent header for all requests ... Clients making requests without a User-Agent header may be blocked without notice." Preferred format: `<client name>/<version> (<contact information>) <library/framework name>/<version>`. For pacing it says: "To stay within a safe request rate, wait for each request to finish before sending another request."
- The [User-Agent policy](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy) gives the example `CoolBot/0.0 (https://example.org/coolbot/; coolbot@example.org) generic-library/0.0`. It also says "Do not use generic agents such as "curl", "lwp", "Python-urllib"", that defaults like `python-requests/x` "may also be blocked", and recommends including the string "bot".
- [Wikimedia APIs/Rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits) is new in 2026: "subject to experimentation and change". The limits are per minute:
  - Unidentified (IP only): **10 req/min**
  - "Unauthenticated bot requests with a compliant User-Agent header": **200 req/min**
  - Authenticated established editors: 2,000. Flagged bots and WMCS: exempt.

  Best practices on that page: "limit the number of concurrent requests to 3 or fewer" and "respect the Retry-After header". Without the header: "wait at least five seconds, or implement exponential back-off."
- The [Troubleshooting page](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/troubleshooting.html) explains AQS 429s: "Throttling is enforced at the storage layer ... if you request data available in cache ... there is no throttling."
- The [Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy) says to use gzip (`Accept-Encoding: gzip`) and honour 429s. It gives unauthenticated REST API clients "concurrency of your requests to 3 at a time, and below 5 requests per second overall". It also has a stricter rule for "other wikimedia.org services" ("concurrency of at most 1 ... delay between requests of at least 1 second"). It is unclear which rule covers `wikimedia.org/api/rest_v1/metrics`, so follow the stricter one.
- The [API Usage Guidelines](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_API_Usage_Guidelines) say an operator "must not ... Spread Wikimedia API requests over multiple user agents to hide excessive use". They also forbid white-labelling that "obscures the identity of the ultimate service provider". Contact for exceptions: legal@wikimedia.org. For bot traffic: bot-traffic@wikimedia.org ([Rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits)).

### 1.4 Licence and terms

- "Data provided by the API is available under the CC0 1.0 license" ([Access policy](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html); the same line is in the spec's `info.description`). Dumps: "All Analytics datasets are available under the Creative Commons CC0 dedication" ([dumps readme](https://dumps.wikimedia.org/other/pageviews/readme.html)).
- Terms: "By using the API, you agree to Wikimedia's terms of use and privacy policy" ([Access policy](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html)). No document I read restricts non-monetary or game use of pageview data, and CC0 needs no attribution. The future-commercial angle is about volume, not licence: "If you require high-volume, commercial access", Wikimedia points to [Wikimedia Enterprise](https://enterprise.wikimedia.com/) ([Rate limits](https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits); [Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy)). Our volume (one request per meme per day plus backfills) is nowhere near "high-volume".
- Using the word "Wikipedia": the [Trademark Policy §3.6](https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_Trademark_Policy) allows the plain wordmark "to describe ... A Wikimedia site" in text. "Source: Wikipedia pageviews" is fine. Do not use the Wikipedia logo as branding.

### 1.5 Hourly dumps (dumps.wikimedia.org/other/pageviews)

- **Permitted.** The data is CC0, and the [Robot policy](https://wikitech.wikimedia.org/wiki/Robot_policy) tells clients to "Consider if dumps are more efficient than live requests". The dataset has "per-article and per-project view counts for all Wikimedia Foundation projects since May 2015" ([Wikitech: Pageviews](https://wikitech.wikimedia.org/wiki/Data_Platform/Data_Lake/Traffic/Pageviews)). It is the only public source of **hourly per-article** counts.
- **Etiquette** ([dumps.wikimedia.org](https://dumps.wikimedia.org/)): "we are now enforcing the Wikimedia Foundation User-Agent Policy for dumps downloads. Downloads are also rate limited and capped at 3 connections per-IP." No numeric rate is published.
- **Size (observed in the [directory listing](https://dumps.wikimedia.org/other/pageviews/2026/2026-11/))**: about 35–53 MB gzipped per hourly file, so about 1 GB a day for all projects. The daily [pageview_complete](https://dumps.wikimedia.org/other/pageview_complete/readme.html) `-user` file is about 530 MB bz2 and encodes hourly counts in each row. It appeared at about 03:00 UTC on D+1.
- **Lag (observed)**: hourly files are posted about 2–3.5 hours after their hour. At 12:26 UTC the newest file was `pageviews-20261124-080000.gz`, posted at 11:29.
- **Naming**: Wikitech says "the date in the file name refers to the *end* of the capturing period, not the beginning". I did not verify this against the data (see the end of this doc).

---

## 2. YouTube Data API v3

Governing documents: the [API Services Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service) and the [Developer Policies](https://developers.google.com/youtube/terms/developer-policies), both "Last updated 2026-11-06". Regional ToS variants exist: [APAC](https://developers.google.com/youtube/terms/api-services-terms-of-service-apac), EMEA and Russia. Section numbers below follow the rendered order of the Developer Policies; I inferred the letters (e.g. III.E.4.h) from that order and from the [revision history](https://developers.google.com/youtube/terms/revision-history).

### 2.1 Definitions that decide storage

From [Developer Policies §IV](https://developers.google.com/youtube/terms/developer-policies):

> "**Authorized Data** means API Data that an active user expressly authorizes an API Client to access or otherwise use through User Credentials."
> "**Non-Authorized Data** means API Data accessible by an API Client without User Credentials."

Ticket 09 calls `videos.list` with an API key on other people's videos. **All of it is Non-Authorized Data.**

### 2.2 Storage of statistics (III.E.4)

[Developer Policies, "Refreshing, Storing, and Displaying API Data"](https://developers.google.com/youtube/terms/developer-policies):

- The long-retention allowance for statistics applies only to Authorized Data: "API Clients may store the following types of Authorized Data for as long as is necessary ... statistics provided through other YouTube API services, such as the number of views for a video ... an API Client may store view counts for a video for more than 30 days, but it must still verify every 30 days that its authorization to access the video uploader's data has not been revoked."
- **The rule that binds us:** "To be clear, an API Client must not store statistics retrieved as Non-Authorized Data for more than 30 days."
- "API Clients may temporarily store limited amounts of Non-Authorized Data for as long as is necessary for the purposes of the API Client but not longer than 30 calendar days. ... after 30 calendar days, the API Client must either delete or refresh the stored data."
- Freshness and display: "API Clients should reflect metadata changes and viewcount updates as quickly as possible. API Clients must display the most updated API Data available in their user-facing presentations ... although API Clients may display historical API Data provided that it is presented accurately in context of time."
- The 2026 exception: [Additional policies for derived metrics and data storage](https://developers.google.com/youtube/terms/derived-metrics-policy) says "If your use case is accepted for additional derived metrics ... Policy III E.4.b, E.4.c, and E.4.d are amended to allow accepted API Clients to store metrics (e.g., views, likes, subs count, comment counts) from statistical endpoints for up to 36 calendar months. Derived metrics ... may also be stored for up to 36 calendar months. Other data (such as video titles, creator names, descriptions, and comment text) must still follow the 30-day refresh and deletion policy".

### 2.3 Derived metrics, aggregation and combining (the main blocker)

[Developer Policies III.E.4 (likely .h)](https://developers.google.com/youtube/terms/developer-policies):

> "Your API Clients must not (i) replace API Data with similar, independently calculated data, or (ii) access or use API Data to create new or derived data or metrics."
> "... you are not permitted to use the number of likes returned in the API Data to calculate other metrics, such as the percentage of total likes that were made through your API Client or a score that factors in likes, total views, or any other API Data."

[Developer Policies III.E.1, Data Aggregation](https://developers.google.com/youtube/terms/developer-policies):

> "Do not aggregate API Data except that you may only aggregate API Data relating to YouTube channels that are under the same content owner ... Such aggregated API Data must only be viewable by that content owner."

The [Complying with the YouTube Developer Policies](https://developers.google.com/youtube/terms/developer-policies-guide) guide says it is guidance, not law, but that it shows "how YouTube enforces". Its "Don't" list includes:

> "Combine data from YouTube's API with data from other sources." / "Merge or combine YouTube API data with any other data." / "Gamify channel performance by ranking or tracking views between different channels, or generally stoking creator rivalries." / "Calculate and assign custom "scores" to channels based on independently calculated averages or ratios"

The same guide does allow some metrics: "Acceptable metrics are those that use only YouTube API data and combine them via simple mathematical calculations (combine them via addition, subtraction, averages, multiplication, division). These metrics must not incorporate any other external data sources." Its examples are "Average daily views in a month", "Total views in a group of videos/channels", and "Graphs visualizing raw metrics, e.g: increase in views". It also says: "If you have not applied for this permission and/or your use case has not been approved, don't create derived metrics and/or store data beyond what is permitted in the developer policies."

Applied to PRD §5: log transform, baseline-centring, a weighted blend with Wikipedia and in-game signals, EWMAs, z-score, softplus heat, and a price. That is a derived score, it combines YouTube with other sources, and it ranks memes (the trending feed). Each of those is barred by default.

**The opt-in amendment** ([derived-metrics-policy](https://developers.google.com/youtube/terms/derived-metrics-policy); [Developer Policies III.L](https://developers.google.com/youtube/terms/developer-policies); the [revision history](https://developers.google.com/youtube/terms/revision-history) dates it 2026-05-04 and 2026-06-01):

- Who it covers: "only applicable to audited developers with analytics use cases that have explicitly applied for permission to create additional metrics, store statistical data, or both, through the standard quota extension request from (starting June 01, 2026)". To apply: select "Section 5: Use Cases, API Integration, and Feature Implementation" then "Analytics & Reporting".
- What it allows: "Custom Channel Scores and Ratios" (e.g. a "Creator Influence Score" from a "weighted formula"), and "Gamification and Leaderboards: You may rank channel performance or track views between different channels for the purpose of comparison or historical analysis" (e.g. "Top YouTuber by View Growth" leaderboard).
- What it still requires: "Your API Service must reflect an analytics use case on YouTube." "You must distinguish these metrics from metrics sourced from API Data." "Do not: Present data in a way that fosters harassment or brigading (e.g. framing comparisons as a "war," "battle," or real-time rivalry". "Violating these policies may result in API quota reduction or termination of your API access."
- What it does not say: anything explicit about blending YouTube with non-YouTube sources such as Wikipedia.

### 2.4 Rules that bite a game that prices assets from views

- **Incentives to view (III.F, Playback Integrity):** "API Clients must not offer or provide incentives, rewards, or other compensation to users for engaging with YouTube Applications (directly or indirectly) by performing actions like viewing content". A player who holds a meme and watches (or bot-views) its mapped video lifts the price and gains coins. That is plausibly an *indirect* reward for viewing. III.I also forbids enabling others to "automate or trigger views ... without the user's prior specific and express consent".
- **Gambling (III.I):** "engage in, promote or facilitate unlawful online gambling". Coins can never be bought or cashed out, which keeps us outside this, provided that stays true.
- **Commercial use (III.G):** apps may be sold or ad-supported. However, you may not "sell advertising, sponsorships, or promotions on any page or screen that contains YouTube API Data unless other data, content, or material not obtained from YouTube appears on the same page and offers enough independent value".
- **No substitute for YouTube (III.I):** do not "recreate the browse experience ... without adding significant independent value".

### 2.5 Display, branding, privacy and deletion

- **ToS link (III.A.1):** "API Clients must display a link to YouTube's Terms of Service (https://www.youtube.com/t/terms), and they must also state in their own terms of use that, by using those API Clients, users are agreeing to be bound by the YouTube Terms of Service." ([Developer Policies](https://developers.google.com/youtube/terms/developer-policies))
- **Privacy policy (III.A.2):** users must agree to it before using the app. It must "be prominently displayed and easily accessible to users at all times, notify users that the API Client uses YouTube API Services, reference and link to the Google Privacy Policy at http://www.google.com/policies/privacy". It must also disclose cookies, any third-party ads, and data use. The ToS §7 also requires "a published privacy policy" ([ToS](https://developers.google.com/youtube/terms/api-services-terms-of-service)).
- **Branding (III.F):** "Any API Client page or feature that displays YouTube content ... must make clear to the viewer that YouTube is the source ... by displaying YouTube Brand Features in accordance with ... the YouTube Branding Guidelines". The [Branding Guidelines](https://developers.google.com/youtube/terms/branding-guidelines) add: "any YouTube logo used within an application must link back to YouTube content"; never use "YouTube", "YT" or variants "in conjunction with the overall name of your application". For mixed sources, use the "YouTube Icon" next to each YouTube element.
- **Labelling our own numbers (III.E.4):** "To the extent your API Clients display any information, data or metrics not based on API Data alongside API Data, your API Clients must include a clear and prominent disclosure there that such information, data and metrics are not from YouTube".
- **Deletion:** the 7-day user-deletion rules (III.E.4) apply to "API Clients that access or use user data". We use API keys only and no YouTube user data, so they would not apply, but that changes if Google sign-in ever requests YouTube scopes. For every embed, the client "must look up the Made For Kids status of each YouTube video that it embeds" and turn off tracking for MFK videos (III.E.4, MFK).
- **One project per client (III.D):** "you must create exactly one (1) API Project for that API Client". Separate dev and prod keys are allowed ([compliance guide](https://developers.google.com/youtube/terms/developer-policies-guide)). Do not embed the key in open-source code (III.D). A project "inactive for 90 consecutive days" may lose quota.

### 2.6 Quota

- "Projects that enable the YouTube Data API have a default quota allocation of 100 search.list calls, 100 videos.insert calls, and 10,000 units per day combined for all other endpoints." "Daily quotas reset at midnight Pacific Time (PT)." "All API requests, including invalid requests, incur a quota cost of at least one point." ([Quota costs](https://developers.google.com/youtube/v3/determine_quota_cost))
- `videos.list` costs 1 unit ([Quota costs](https://developers.google.com/youtube/v3/determine_quota_cost); [videos.list](https://developers.google.com/youtube/v3/docs/videos/list): "A call to this method has a quota cost of 1 unit"). `chart=mostPopular` is a filter on the same method, so it also costs 1 unit. Its `maxResults` runs from 1 to 50, and `regionCode` can be used with it.
- Extensions: "If you would like to request additional quota beyond the default allocation, you must first complete an audit to show that your project is in compliance" ([Quota and Compliance Audits](https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits)). The [revision history (2021-07-01)](https://developers.google.com/youtube/terms/revision-history) says "All developers ... must complete an API Compliance Audit in order to be granted more than the default quota allocation of 10,000 units". From Developer Policies III.D: quota granted "only for the approved use case", a use-case change needs re-audit, and YouTube may "survey, monitor, or audit" (III.H), including asking for accounts to review the production app.

---

## 3. Not verified

- **Whether YouTube would accept Dankrupt under the derived-metrics amendment.** The policy requires "an analytics use case on YouTube", and its examples are creator or brand analytics. No primary source says whether a paper-money meme market qualifies, or whether blending with Wikipedia is allowed under the amendment. Only a filed application can answer this.
- **Whether a price that responds to views counts as an "indirect" incentive to view** under III.F. This is my reading. No example in the policies covers it.
- **The 50-id cap per `videos.list` call.** The reference page does not state a maximum for the `id` parameter; the 1–50 range it gives is for `maxResults`, which "is not supported for use in conjunction with the id parameter". Treat 50 as the working assumption and handle errors.
- **Exact load time of daily per-article data.** The docs say only "usually done within a few hours" after 00:00 UTC. My one live check proves only that it was present by 12:26 UTC.
- **Which Robot policy section covers `wikimedia.org/api/rest_v1/metrics`** ("REST API" at 3 concurrent and under 5 rps, or "other wikimedia.org services" at 1 concurrent and 1 s delay).
- **Dump file naming (start or end of hour).** Wikitech says end. I did not check this against the data.
- **Differences between the regional YouTube ToS variants.** The APAC page appeared to match the main ToS, including California governing law, but I did not diff them line by line.
- **The Wikimedia Terms of Use full text.** I relied on the Access policy and the API Usage Guidelines that sit under it. Nothing I read restricts CC0 pageview reuse.

---

## 4. What this means for tickets 04 and 09

### Ticket 04: Wikipedia daily ingest, 30-day backfill, fair value

Go ahead. There are no licence or retention limits: CC0, so raw counts can be stored indefinitely and the simulator can use the full history from 2015-07-01.

1. **User-Agent:** `Dankrupt-ingest-bot/<ver> (<project URL>; <contact email>) <http lib>/<ver>`, set once in the adapter. Never fall back to a library default. Send `Accept-Encoding: gzip`.
2. **Pacing:** send one request at a time, sequentially, with at least 1 s between requests. That satisfies the strictest reading and is far below 200 req/min. On 429 or 503, honour `Retry-After`, or wait at least 5 s with exponential back-off when there is none.
3. **Requests:** `per-article/en.wikipedia.org/all-access/user/{title}/daily/{start}/{end}`. Each listing's backfill is a single request covering 30 or more days (the range is free). Use `agent=user`.
4. **Schedule:** poll for day D from about 02:00 UTC on D+1, then hourly until it appears. The 4-hour cache max-age means an early poll can stay stale. A missing D means "not loaded yet", **not zero**, until a cutoff (for example D+2 00:00 UTC). After the cutoff, treat a missing point inside the range as 0, because zeros are omitted from responses. The staleness rule ("2 missed updates") should count a day as missed only after that cutoff, or a normal 1-day lag will flag sources stale.
5. **Granularity:** the API has no hourly per-article data, so the Wikipedia input steps once a day. The 6h EWMA and v = EWMA6h − EWMA72h will jump once a day at about 02:00–06:00 UTC, and players can see the new value on Wikimedia first (PRD §5 says this is intended). If sub-daily Wikipedia attention becomes necessary, the only source is the hourly dumps: about 1 GB a day, 3 connections per IP at most, UA policy enforced, posted about 2–3.5 hours after each hour. That is out of MVP scope.
6. **Titles:** map canonical article titles, URL-encoded. Redirect views are not counted under the target title, so list important redirect titles separately in the seed signal map.
7. **UI:** show "Source: Wikipedia pageviews" in text, with no Wikipedia logo. No attribution is legally required (CC0), but it is good practice.

### Ticket 09: YouTube videos.list every 15 min, view deltas, 30-day heat window

**Do not ship ticket 09 as written on the default policies.** The issue is not retention: "keep only derived features beyond 30 days" does not help, because III.E.4 forbids creating derived metrics from API Data at all, and III.E.1 and the compliance guide forbid aggregating or combining it with other data. Options, best first:

- **A. Apply for the derived-metrics amendment before building the YouTube part of the blend.** Submit the Audit and Quota Extension form, choosing "Analytics & Reporting". Describe the use honestly: a free, non-monetary game whose attention score uses public view growth, with no cash value. If YouTube approves, the 30-day cap is lifted (stats up to 36 months, derived features up to 36 months). Every price and heat chart must then be labelled as Dankrupt's own metric, not YouTube data, and ranking must not be framed as a "war" or "battle". Keep the approval email with the project.
- **B. Until approved, set YouTube weight w = 0 in the blend.** YouTube stays a display-only source: official embeds and, optionally, the live `viewCount` with YouTube attribution. The PRD already handles a zero-weight source (Google Trends works this way). The blend renormalises over the sources it has.
- **C. Do not** compute heat or fair value from YouTube views on the default terms, even with a 30-day rolling window. The rolling window solves storage and nothing else.

If and when YouTube is in the blend (after A):

1. **Retention:** without approval, delete every raw `viewCount` snapshot older than 30 calendar days with a daily purge job. The heat window must fit inside that, so 30-day μ/σ of a 24h average needs data up to 31 days old: use **29 days or less for YouTube**, or wait for approval. With approval, keep stats for at most 36 months and purge after that. Titles and other metadata must be refreshed or deleted within 30 days in either case.
2. **Deletions:** a video that disappears from a `videos.list` response (deleted or private) must drop out of the blend, and its stored statistics should be purged. Treat it like a stale source.
3. **Quota:** each poll needs `ceil(mapped_videos / 50)` calls × 96 polls a day. At or below about 5,200 mapped videos this stays inside 10,000 units. Log units per poll. Budget against midnight PT. Never call `search.list`, and resolve ids at listing time by hand. Keep one Cloud project for prod plus a separate dev key, and keep the key out of the repo and the client.
4. **Display (needed for embeds and any YouTube number, even under option B):**
   - A link to https://www.youtube.com/t/terms, and a line in Dankrupt's terms that users agree to be bound by the YouTube Terms of Service.
   - A privacy policy, accepted before use and reachable at all times, that says the app uses YouTube API Services and links to http://www.google.com/policies/privacy, with cookie and ad disclosures.
   - YouTube attribution next to each YouTube element, following the Branding Guidelines (logo or icon linking back to YouTube). Never put "YouTube" in the product name.
   - Any shown `viewCount` must be the latest value, or clearly time-stamped if historical.
   - A "not from YouTube" disclosure beside heat and price wherever they sit next to YouTube numbers.
   - Look up Made-for-Kids status before embedding, and disable tracking for MFK videos.
5. **Manipulation and incentives:** to limit the III.F "indirect incentive to view" risk and plain view-botting, keep YouTube's weight below Wikipedia's. Cap the per-poll delta it can contribute. Never tell players "watch the video to pump the price". Show no in-game reward linked to watching.
6. **Monetisation later:** if ads arrive, the page carrying YouTube data must have enough independent value without it (III.G). The meme page and order book satisfy that. A YouTube-embeds-only page would not.

## 5. Reddit Data API (added 2026-11-24, by the main session, without subagents)

The Reddit Data API Terms and Developer Terms live on redditinc.com, which our search tool couldn't reach. Everything below comes from Reddit's help centre. Ticket 09c must read the full terms before building.

- **Approval before any access.** Under the Responsible Builder Policy, accessing Reddit data through the API needs an explicit request and approval first. Registering an app alone does not grant access. Source: [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy).
- **How to apply.** Requests go through Reddit's support ticket form. Source: [Reddit Data API Wiki](https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki).
- **Commercial use** needs separate written approval. Using Reddit data to train ML or AI models is prohibited without approval. Source: [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy).
- **Academic research** has its own route, the Reddit for Researchers programme. It doesn't apply to Dankrupt. Source: [Developer Platform & Accessing Reddit Data](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data).
- **Migration deadline.** A 2026 programme requires eligible Data API apps to migrate to the Developer Platform by December 31, 2026 and pass App Review. Whether this affects a new external ingest app is unverified. Source: [App Migration Program 2026 Terms](https://support.reddithelp.com/hc/en-us/articles/47822311698452-Reddit-Developer-Platform-App-Migration-Program-2026-Terms).
- **Rate limit.** 100 queries a minute per OAuth client id, from Reddit's 2023 announcement as reported second-hand. Unverified against a primary source.

**Not verified:**
- whether the Data API Terms allow derived scores or limit how long counts can be stored
- the current rate limit
- whether small non-commercial projects get approved (third-party blogs say they're often rejected)
- what the December 2026 migration means for new apps
