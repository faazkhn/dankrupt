# Spec: Dankrupt MVP

Status: ready-for-agent

Source: `PRD.md` (Nov 24, 2026) plus the grilling round of Nov 24, 2026. Where this spec and the PRD differ, this spec wins. Vocabulary follows `GLOSSARY.md`; architecture decisions are in `docs/adr/`.

## Problem Statement

People who live online can feel when a meme is about to blow up or die, but there is nowhere to prove it and be ranked for it. Every earlier meme market died: prices were votes that felt arbitrary, nothing moved between slow updates, and the survivors turned into crypto casinos.

## Solution

A free web exchange where each meme trades like a stock, 24/7, in coins that can never be bought or cashed out. Every order is filled from the better of two sources: other players' limit orders, or a house market maker whose price drifts toward a fair value computed from real attention data (Wikipedia pageviews, YouTube views, in-game attention). Players can buy, short and scalp, and are ranked by time-weighted return on daily, weekly, all-time and style boards. The operator lists memes by hand, maps their data sources and tunes pricing live. A bot-market simulation on historical attention data must pass before the closed alpha.

## User Stories

### Getting started

1. As a new player, I want to sign in with Google, so that I can start without making a password.
2. As a new player, I want to pick a public handle, so that I appear by name on boards and share cards.
3. As a new player, I want to receive 100,000 coins on sign-up, so that I can trade right away.
4. As a player on a phone, I want every screen to work at phone width, so that I can trade from anywhere.

### Browsing

5. As a player, I want a trending feed sorted by heat, so that I can see what is moving.
6. As a player, I want a meme page with name, short description, links and official YouTube embeds, so that I know what the meme is without re-hosted images.
7. As a player, I want a live chart that follows the mid quote, so that I see the price move even when nobody trades.
8. As a player, I want the fair value shown as a dotted line on the chart, so that I can see where the data says the price belongs.
9. As a player, I want an attention graph per source, so that I can read the raw signals myself.
10. As a player, I want to see the order book and the house quote, so that I know what I will pay.
11. As a player, I want a "data delayed" badge when every source is stale, so that I know fair value is frozen.
12. As a player, I want to star memes into a watchlist, so that I can find them again.
13. As a player, I want a Graveyard tab of dormant memes, so that I can bet on comebacks.
14. As a player, I want a "Comeback" banner on revived memes, so that I notice revivals.

### Trading

15. As a scalper, I want market orders that fill instantly at any hour, so that I can trade fast swings.
16. As a player, I want limit orders that rest until cancelled or until an expiry I pick, so that stale orders don't fill after big news.
17. As a player, I want stop-market orders that fire when the mid crosses my stop, so that I can cap losses.
18. As a player, I want every fill to be at least as good as the book alone or the house alone would give, so that the router never costs me.
19. As a market maker, I want to quote inside the house spread and pay no maker fee, so that I earn the spread.
20. As a whale, I want a large order to move the price along the house curve, so that size matters like a real market.
21. As a player, I want resting orders to hold back the cash or shares they need, so that a fill never leaves me overdrawn.
22. As a player, I want a market buy to fill as far as my free cash goes, so that an oversized order still does something sensible.
23. As a player, I want to see my open orders, fills and positions with average cost, so that I know where I stand.
24. As a player, I want to cancel resting orders, so that I can change my mind.

### Shorting

25. As a skeptic, I want to short any active meme by posting 50% collateral, so that I profit when it fades.
26. As a short seller, I want to see my equity, initial margin and maintenance requirement, so that I know how close liquidation is.
27. As a short seller, I want liquidation driven by mark price, not last price, so that one odd print can't wipe me out.
28. As a short seller, I want liquidation to buy back my worst shorts first and stop once equity is back above initial margin, so that I'm not left on the edge.
29. As a short seller, I want an in-app notice and a history entry when I'm liquidated, so that I know what happened.
30. As a short seller, I want the borrow fee to accrue per minute held, so that I pay for exactly what I use.
31. As a short seller, I want new shorts on a dormant meme blocked once utilisation passes 0.5, so that nobody farms its decay for free.

### Going broke

32. As a player who went broke, I want a free reset back to 100,000 coins when my equity is below 1,000 and I hold nothing, so that I can keep playing.
33. As a player whose liquidation left negative equity, I want to be allowed to reset, so that a deficit doesn't lock me out.
34. As a player, I want my reset count on my profile, so that others see my history honestly.

### Lifecycle

35. As a player, I want to trade with other players during a meme's 30-minute pre-open, so that the opening price comes from real demand.
36. As a player, I want resting orders that cross the house at IPO to fill at once, so that pre-open interest sets the open.
37. As a holder of a dormant meme, I want to keep my shares and still trade them, so that I can cash in if it revives.
38. As a holder of a halted meme, I want my position settled at the last mark, so that a content pull is fair.

### Competition

39. As a competitive player, I want daily, weekly and all-time boards ranked by TWR, so that resets can't help my rank.
40. As a competitive player, I want daily and weekly boards on IST calendar days, weeks starting Monday, so that every player races the same window.
41. As a player, I want to appear on my style's board (Scalper, Swing, Trend-spotter), so that I compete with people who play like me.
42. As a player, I want a board to require 5 closed trades in its window, so that one lucky trade can't top it.
43. As a player, I want an "I called it" share card for a trade that paid off, so that I can show it off.

### Operator

44. As the operator, I want to add a meme with a description and its signal map, so that it can list.
45. As the operator, I want to approve or reject candidates against the content screen, so that nothing harmful lists.
46. As the operator, I want approval to start a 30-minute pre-open, so that listing is one click.
47. As the operator, I want to halt a meme for content reasons, so that I can respond to takedowns within 48 hours.
48. As the operator, I want to change params live without a redeploy, and have every change recorded in the event log, so that replays stay exact.
49. As the operator, I want a dashboard of coin supply, house P&L, fees and engine health, so that I can see if the economy runs hot.
50. As the operator (after the alpha opens), I want a daily queue of the top 20 detected candidates, so that listing scales beyond my own picks.

### Pre-launch

51. As the operator, I want a simulator that replays historical Wikipedia attention against bots and reports the §11.3 pass criteria, so that I can tune defaults before real players arrive.
52. As the operator, I want a load test proving 2,000 orders a second at p99 under 50 ms and 10,000 websocket clients, so that launch day doesn't fall over.

## Implementation Decisions

### Resolved in grilling (deviations from the PRD)

- **One sequencer, one event log** for all memes (ADR-0001). PRD §9's per-meme sequencers are dropped.
- **Whole shares** (ADR-0002). The router rounds each house chunk down to whole shares. The §6.7 example becomes 21 / 100 / 179 shares. Its correct total is **30,964.6 coins** (average 103.22, taker fee 31). The PRD's 18,753 / 30,973 / 103.24 are arithmetic slips.
- **Chart candles and stop triggers follow the mid quote**, not last. Volume comes from fills. Mark price is unchanged: median(mid, 5-minute EMA of last, F).
- **Pre-open is book-only trading.** The house is off and only limit orders are accepted. At IPO the house opens at p = 100 and the no-cross rule fills whatever crosses it. There is no opening auction.
- **Sign-in is Google only**, with a public handle chosen at sign-up.
- **The candidate detector is built after the closed alpha opens.** Until then the operator adds memes by hand. Revival detection is built early.
- **Hosting is one VM in India** (AWS Lightsail Mumbai or DigitalOcean Bangalore). It runs Docker Compose with web, engine, gateway, Postgres and Redis, plus nightly off-box Postgres backups.
- **Normalisation uses a fixed per-source baseline** stored in params, instead of the live cross-meme median in PRD §5 step 1. A meme's fair value then depends only on its own attention. In-game attention is counted per 1,000 active players, so player growth doesn't lift every price.
- **A waitlist landing page ships first**, for marketing. It has an email sign-up with a privacy notice and a Discord invite link, and it is deployed on the India VM that the alpha later reuses. A Discord *link* is in scope; a Discord *bot* is not.
- **Attention sources:**
  - Wikipedia and in-game attention are in from the start.
  - YouTube is embeds only, until YouTube approves derived metrics (ticket 09b).
  - Reddit is added, gated on Reddit approving the Data API request (ticket 09c).
  - Dankrupt is non-commercial. Any future monetisation (ads, cosmetics, subscription) counts as commercial use for Reddit and YouTube, and needs their written approval first.
- **Post-alpha additions:** Founding Trader badges, and a daily "Market Close" video rendered from engine data.
- **Build order is vertical slices** (see tickets). It replaces the horizontal §12.3 milestones. The simulator must pass §11.3 before the closed alpha.

### Smaller calls (accepted, one amended)

1. The trading price floor is 0.01 coins and the fair-value floor is 1 coin. The house refuses to buy below 0.01.
2. The VWAP V in the target covers all fills over 24 hours, house and book. V = F if there were none.
3. A source is stale after 2 missed updates at its own cadence: Wikipedia daily, YouTube every 15 minutes, in-game every 5 minutes. Stale sources drop out of the blend until they recover.
4. A new listing backfills at least 30 days of Wikipedia daily history, so EWMAs and heat start warm. YouTube history starts at listing.
5. A resting buy reserves its limit cost plus the taker fee. A resting sell reserves shares, or margin for the short part. A market buy fills as far as free cash goes and the rest is cancelled.
6. **(Amended)** The borrow fee accrues **per started minute** a short is held, at that minute's rate and mark. Even a 20-second short pays one minute. Accrued fees count against equity at once. They are booked to the journal (to the sink) hourly and whenever the short is reduced.
7. A liquidation may leave equity below zero. The §11.1 margin invariant becomes: after a liquidation pass, every account has E ≥ IM or no shorts left.
8. **Reset rule:** a player may reset when equity < 1,000 coins (negative included) and they hold no positions. Resting orders are cancelled. Cash is set to 100,000 whatever it was, so a negative balance is written off. A reset is a cash event.
9. A trade is one round trip in a meme, from flat back to flat. Holding time runs from the first opening fill to the last closing fill.
10. Daily and weekly boards use IST calendar days, with weeks starting Monday. All-time compounds across resets.
11. The watchlist is a star on the meme page. Stars and page views feed in-game attention.
12. The simulator runs in virtual time as fast as the CPU allows.
13. The web layout is responsive and phone-first.
14. The operator approves the simulator's list of 30+ past memes, which I draft. Wikipedia pageview data starts July 2015.

### Interpretations made while writing this spec

- Realised volatility σ̂1h, used for the house spread, is the standard deviation of 1-minute log returns of mid over the last hour, scaled to one hour.
- "Heat below 0.3 for 7 days" means every features update in a rolling 7-day window is below 0.3.
- Noise σ_n scales with clip(H, 0.2, 5), the same clip used for depth.
- When heat changes depth, L is rescaled with p held fixed, applied on the next tick after a features update.
- Free cash = cash − Σ over shorts of |q|·M·(1 + m_I) − cash reserved by resting buys.
- Mid falls back to the house quote when one side of the book is empty. In pre-open it falls back to F when there is no two-sided book.
- Halted memes settle every position at the last mark: longs receive q·M and shorts pay |q|·M, against the house.

### Modules

- **Engine** (pure library, no I/O). This is the deep module. Interface: create state from a snapshot, apply one event, get back the outputs (fills, journal lines, order updates, notices, price updates), and serialise a snapshot. It contains:
  - the house curve (centre price, depth, spread, drift, noise)
  - the book and the router
  - the no-cross pass
  - order types, expiries and stop triggers
  - reservations, margin, the mark price and liquidation
  - borrow accrual
  - the meme lifecycle state machine
  - resets
  - params

  Time only enters through event timestamps. Before applying an event at time t, the engine applies every 2-second tick on the grid up to t, so ticks are implied and never stored. Minute and hour accruals work the same way. Both the server and the simulator call this module. It is the only place exchange rules live.
- **Features** (pure library). Takes the previous features, one new batch of raw source counts and params. Returns the new features: x, A, the EWMAs, v, a, μ, σ, z, H, D and F. Features updates enter the engine as events, so a replay never re-fetches data.
- **Ingest** (server jobs). These are adapters that turn Wikipedia REST, YouTube videos.list and in-game counters into raw-count batches. Wikipedia sends a descriptive User-Agent. YouTube batches up to 50 video ids per call and never uses search.
- **Sequencer host** (server process). It owns the only engine instance. Each input is assigned a sequence number and timestamp, written to the event log in Postgres with group commit (batches every few ms), and only then applied. It takes snapshots every 10,000 events and rebuilds from the latest snapshot plus the log tail on boot. It writes projections (journal, positions, orders, candles, equity snapshots) from the engine's outputs, and publishes price and account updates to Redis.
- **API** (inside the sequencer host). Handles HTTP order entry and queries, with sessions validated against the web app's auth. Operator endpoints require the operator flag.
- **Gateway** (separate process). Subscribes to Redis and fans prices out to websocket clients at least once a second, plus per-player account updates. It is kept apart from the sequencer so websocket fan-out can't stall order latency.
- **Web** (Next.js). Player screens, operator screens, Google auth and share-card images.
- **Simulator** (CLI). Drives the engine and features in virtual time with historical Wikipedia series and bot populations. It writes a pass/fail report against §11.3, and can sweep params across seeds.

### Data model

PRD §9.3 tables apply, with these changes:
- `events` uses one global sequence.
- `params` changes are themselves events.
- `signal_features` stores the fixed baselines' version.
- Add `watchlist`, `equity_snapshots` (per player, every 5 minutes and at cash events, for TWR), `trades` (closed round trips, for styles and share cards), `notices` and `snapshots`.
- `candles_1m` is built from mid, with volume from fills.
- `nominations` is not built.

### Accounting

The journal has two commodities, coins (µc) and shares per meme. Each one sums to zero. It has these account kinds:
- player cash
- player shares
- house cash
- house shares
- sink, for fees, borrow and liquidation fees
- mint, for sign-up grants and resets

Positions and balances are projections of the journal. Coin supply S(t) and house P&L (realised plus mark-to-market) are derived from it.

## Testing Decisions

- Good tests drive a module through its public interface only, and assert on outputs and observable state, never on internals.
- **Engine seam:** most behaviour is tested here: event in, outputs and state out.
  - Property-based tests (fast-check) on random event streams cover every §11.1 invariant: conservation, curve, no-cross, best execution, priority, determinism (replay gives byte-identical snapshots), margin (as amended) and floors.
  - Golden tests replay the corrected §6.7 fill and the §7.5 short. In §7.5, liquidation starts above mark 230.77, ignoring the 50-coin taker fee on entry. Recompute it with the fee included.
- **Features seam:** table tests on hand-made series:
  - doubling attention gives 1.52× F
  - momentum is clipped at ±28%
  - stale sources drop out, and "data delayed" appears when all are stale
  - dormancy decay has a 7-day half-life
- **Server seam:** a few integration tests against a real Postgres:
  - an order goes through the API, is persisted, and replays identically after a restart
  - group commit doesn't reorder events
- **Web:** one Playwright smoke path: sign in with a test login → buy → see the position → see the chart move.
- **Simulator:** its §11.3 report is the acceptance test for the pricing defaults.
- **Load:** a scripted load test (k6 or a Node script) against the deployed shape.
- There is no prior art; this repo is greenfield. Vitest and fast-check throughout.

## Out of Scope

- From PRD §12.2:
  - real money in any form
  - anti-manipulation limits
  - seasons
  - player nominations and the founder bonus
  - native mobile and push notifications
  - a Discord bot
  - margin longs, options and index funds
  - TikTok data

  Reddit data is no longer out of scope; see ticket 09c.
- Google Trends until alpha access is granted. Its weight stays 0, and the source adapter is not built until then.
- Sharding across processes, and any account service beyond the single sequencer.
- Email sign-in.
- Re-hosted meme images.

## Further Notes

- **Human tasks (ready-for-human, not tickets):**
  - apply for the Google Trends API alpha
  - get a YouTube Data API key
  - apply for YouTube's derived-metrics policy through the Audit and Quota Extension form, choosing "Analytics & Reporting" (gates ticket 09b)
  - submit a Reddit Data API access request under the Responsible Builder Policy, describing Dankrupt as non-commercial (gates ticket 09c). Reviews reportedly take 2 to 4 weeks.
  - buy the domain and register the @playdankrupt handles
  - file the trademark in classes 9 and 41
  - get a lawyer's review before any paid feature
  - write a privacy notice for Google sign-in data under India's DPDP Act
- **To research before building the YouTube source:**
  - YouTube API Developer Policies on how long statistics can be stored. This affects the 30-day heat window, which may need to keep only derived features beyond 30 days.
  - Wikimedia rate limits and the publication lag of daily per-article counts.
- **Risks:**
  - The p99 < 50 ms target depends on group commit to Postgres. The load-test ticket comes before the alpha, not at launch.
  - The Node version must be pinned for replay determinism (ADR-0002).
