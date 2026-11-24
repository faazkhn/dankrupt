# 04: Wikipedia data drives fair value

**What to build:** Each meme's fair value now comes from its Wikipedia pageviews. Ingest pulls daily per-article counts for each meme's mapped titles and backfills at least 30 days at listing. The features pipeline computes heat and fair value (PRD §5, with the fixed per-source baseline from the spec). Features updates enter the engine as events that move the house target and rescale depth from heat. The meme page shows the fair-value line and an attention graph.

**Blocked by:** 02; and the data-source terms research in `docs/research/data-source-terms.md`, whose constraints this ticket must follow.

**Status:** done: Wikipedia daily ingest (rate-limited, 429 backoff, 60-day backfill), pure features module (fixed baselines, EWMAs, momentum, heat, fair value, staleness), meme.features events drive the drift target, heat-scaled depth and noise; fair-value line, attention card, trending sort. Before launch, set WIKI_USER_AGENT with a contact URL or email (Wikimedia policy).

- [ ] The signal map comes from the seed file. Ingest sends a descriptive User-Agent, makes calls one at a time with about 1 second between them (well within 200 a minute and 3 at once), and stores raw counts.
- [ ] Day D counts as missing only if it still hasn't loaded by 00:00 UTC on D+2, so the normal next-day lag never marks Wikipedia stale. Before that cutoff, a 404 means "not loaded yet". After it, a missing day counts as zero views, because the API leaves zero days out.
- [ ] The features module is pure: previous features + raw batch + params → x, A, the EWMAs (6h/24h/72h), v, a, μ, σ, z, H and F. It uses a fixed per-source baseline.
- [ ] Table tests: 2× attention gives F × 1.52. Momentum is clipped at ±28%. F never goes below 1. A stale source drops out after 2 missed updates at its own cadence. All sources stale freezes A and shows "data delayed".
- [ ] Features updates are engine events. Replay never re-fetches data.
- [ ] Depth is Y = 500,000 × clip(H, 0.2, 5). L is rescaled with p fixed when heat changes.
- [ ] The trending feed is sorted by heat.
- [ ] The chart shows F as a dotted line. The attention graph shows the raw source series and heat.
