# Dankrupt — Product Requirements Document

Nov 24, 2026 · @Faaz

**Dankrupt** (full brand: **Dankrupt Exchange**) is a free, paper-money stock exchange where the listed assets are internet memes. Prices move from two forces at once: real-world attention data and player trading. The two-word brand keeps search engines from "correcting" Dankrupt to "bankrupt" and sets it apart from a small band of the same name.

## 1. Problem and vision

People who live online can feel when a meme is about to blow up or die, but there is no place to prove it and get ranked for it. Every earlier attempt at a meme market is dead or abandoned (checked by Faaz, 2026-11-24): r/MemeEconomy, MemeBroker, Meme Exchange (2019), Oshitock, Lykely and TikPredict.

Why they likely failed (our read, not verified):

- **No credible price.** Prices were votes or upvotes, so they felt arbitrary and were easy to game.
- **No live market.** Prices updated slowly, so there was nothing to do between updates and no reason to come back.
- **Drift to crypto.** The survivors became meme-coin casinos, which pushed out the trend-spotting audience.

Vision: the place where calling the next meme is a real, ranked skill. It should feel like a real exchange (charts, order book, shorting, scalping) that is anchored to what the internet is actually paying attention to.

Success looks like:

- Players come back daily because prices move all day.
- A player who reads trends early beats a random trader, measurably (section 11 tests this).
- "I called it" share cards spread the game for free.

## 2. Solution overview

Each listed meme trades like a stock, 24/7, in virtual coins. A **hybrid exchange** fills every order from the better of two sources: other players' limit orders, or an always-on house market maker whose price is pulled toward a data-driven fair value.

Core loop:

1. Spot a meme rising (or dying) before others do.
2. Buy it, short it, or scalp its swings.
3. Watch the price react to both the internet and other traders.
4. Climb the leaderboards and share the call.

### Decisions locked (Faaz)

| Area | Decision |
| --- | --- |
| Money | Paper money only, never real money |
| Trading | Buy and sell like stocks; scalping allowed |
| Pricing | Hybrid: real trend data sets fair value, player trades move price around it |
| Listing | Hybrid: algorithm detects, players nominate, a screen decides |
| Dead memes | Never delisted; they go dormant and holders keep them, because memes come back |
| Anti-manipulation | None. Big players can move prices, as in real markets |
| Seasons | Not for now |
| Matching | Hybrid: player order book and house market maker working together |
| Platform | Web app first |

### Proposals (mine, open to veto)

| Area | Proposal |
| --- | --- |
| Starting cash | 100,000 coins |
| Listing price | 100 coins at IPO |
| Fees | 0.1% taker, 0% maker |
| Going broke | Free reset, shown on the profile |
| Stack | TypeScript, Postgres, Redis |

## 3. User stories

Players:

1. As a new player, I sign up and get 100,000 coins, so I can start trading right away.
2. As a trend-spotter, I buy a meme early and profit when its real-world attention grows.
3. As a skeptic, I short a meme at its peak and profit as it fades.
4. As a scalper, I trade fast swings with market, limit and stop orders, and get instant fills at any hour.
5. As a market maker, I post limit orders on both sides and earn the spread when others trade with me.
6. As a whale, I place a big order and see it move the price, as it would in a real market.
7. As a holder of a dead meme, I keep my shares in the Graveyard and cash in if the meme revives.
8. As a player, I see a live chart, the order book, fair value and an attention graph for every meme.
9. As a competitive player, I see my rank on daily, weekly and all-time boards, and in my style's board.
10. As a player who went broke, I take a free reset, and my profile shows how many resets I've used.
11. As a player, I share an "I called it" card when a call pays off.
12. As a player (post-MVP), I nominate a meme and earn a founder bonus if it gets listed and takes off.

Operator (Faaz):

13. I review listing candidates and approve or reject them against the content screen.
14. I map each meme to its data sources, such as Wikipedia articles and YouTube videos.
15. I watch coin supply, house profit and loss, and engine health on an admin dashboard.
16. I tune pricing parameters without a redeploy.

## 4. Economy

Every account starts with 100,000 coins. Coins exist only inside the game: they can never be bought, sold or cashed out (see section 10).

### Accounting units

All money is stored as integer **micro-coins** (1 coin = 10^6 µc) in 64-bit integers, so rounding never creates or destroys coins. Prices use a tick of 0.01 coins and share quantities are whole numbers.

### Fees

| Fee | Rate | Paid when |
| --- | --- | --- |
| Taker fee | 0.10% of notional | An order fills immediately, against the book or the house |
| Maker fee | 0% | A resting limit order is filled |
| Borrow fee | Section 7 | Hourly, on open shorts |
| Liquidation fee | 1% of closed notional | A short is force-closed |

The zero maker fee is deliberate: it rewards players for adding liquidity to the order book.

### Coin supply

The house is the counterparty for every fill it makes, so it creates coins when it loses and destroys them when it wins. Total player coins S(t) is tracked live:

```latex
S(t) = \sum_{u} \left( C_u(t) + \sum_i q_{u,i}(t)\, M_i(t) \right)
```

Here C\_u is a player's cash, q\_{u,i} the shares held in meme i (negative when short), and M\_i the mark price. Supply changes only through these flows:

```latex
\frac{dS}{dt} = -\,\Pi_{\text{house}}'(t) \;-\; \text{fees}'(t) \;+\; \text{resets}'(t) \;+\; \text{bonuses}'(t)
```

Target: supply grows no faster than about 2% a week per active player, beyond new sign-ups. If it runs hotter, widen the house spread or raise the taker fee. Those are the two dials.

### Going broke

If a player's equity falls below 1,000 coins with no open positions, they can take a free reset back to 100,000. Each reset is counted and shown on their profile, and the leaderboard uses the return measure below so resets don't help ranking.

### Leaderboards

Rank by **time-weighted return** (TWR). It chains returns between cash events, so a reset starts a new chain instead of erasing losses:

```latex
\text{TWR}_{[t_0,t_n]} = \prod_{j=1}^{n} \frac{E(t_j^-)}{E(t_{j-1}^+)} \;-\; 1
```

E(t\_j^-) is equity just before a cash event and E(t\_{j-1}^+) is equity just after the previous one. The all-time board compounds across resets, so a reset after a wipeout keeps the −100% in the record.

- **Boards:** daily, weekly and all-time, each by TWR over its window.
- **Style boards:** a player is classed by the median holding time of their closed trades. Scalper is under 1 hour, Swing is 1 hour to 3 days, and Trend-spotter is over 3 days.
- **Eligibility:** at least 5 closed trades in the window, so one lucky trade can't top a board.

## 5. Heat score and fair value

Fair value F\_i is the price a meme "deserves" from real-world attention. Doubling attention lifts fair value about 1.52×, and rising momentum adds up to +28%. It updates every 5 to 15 minutes, while the traded price moves every tick. Section 6 explains how fair value and player trading combine.

### Step 1: normalize each signal

For meme i and source k, s\_{i,k}(t) is the raw count per hour, such as page views or video views gained. Take logs, then centre each source on its median across all listed memes, so a source with huge numbers doesn't drown out the rest:

```latex
x_{i,k}(t) = \ln\!\big(1 + s_{i,k}(t)\big) \;-\; \operatorname{median}_{j}\, \ln\!\big(1 + s_{j,k}(t)\big)
```

### Step 2: blend into one attention index

K\_i(t) is the set of sources with fresh data for meme i. A source is stale after 2 missed updates and drops out until it recovers:

```latex
A_i(t) = \frac{\sum_{k \in K_i(t)} w_k\, x_{i,k}(t)}{\sum_{k \in K_i(t)} w_k}
```

| Source k | Weight w\_k | Notes |
| --- | --- | --- |
| Wikipedia pageviews | 0.40 | Free and open; daily per-article counts |
| YouTube views on mapped videos | 0.35 | Cheap videos.list calls |
| Google Trends | 0.25 | Only once alpha access is granted, otherwise 0 |
| In-game attention (page views, watchlists) | 0.10 | Reflexive by design: the market is part of the meme |

If every source is stale, A\_i freezes and the meme shows a "data delayed" badge.

### Step 3: smooth, and measure momentum

Use exponentially weighted averages with half-life h, where Δ is the time since the last update:

```latex
\bar A^{(h)}_i(t) = \bar A^{(h)}_i(t-\Delta) + \big(1 - 2^{-\Delta/h}\big)\big(A_i(t) - \bar A^{(h)}_i(t-\Delta)\big)
```

```latex
v_i(t) = \bar A^{(6\text{h})}_i(t) - \bar A^{(72\text{h})}_i(t), \qquad a_i(t) = v_i(t) - v_i(t - 24\text{h})
```

v is momentum (short-term average above long-term average means rising), and a is acceleration, the earliest sign that a meme is taking off.

### Step 4: heat

Heat compares a meme to its own last 30 days, so a small meme spiking counts as much as a big one holding steady. μ\_i and σ\_i are the 30-day mean and standard deviation of the 24-hour average:

```latex
z_i = \frac{\bar A^{(24\text{h})}_i - \mu_i}{\sigma_i + \varepsilon}, \qquad H_i = \ln\!\big(1 + e^{\,z_i + \beta v_i}\big), \quad \beta = 2
```

Heat is always positive. It sets house depth (section 6), drives the trending feed, and feeds the listing and revival detectors (section 8).

### Step 5: fair value

```latex
\ln F_i(t) = \ln P_{\text{IPO}} + \kappa\big(\bar A^{(24\text{h})}_i(t) - \bar A^{(24\text{h})}_i(t_{\text{IPO}})\big) + \lambda\,\operatorname{clip}\big(v_i(t), -1, 1\big) + \ln D_i(t)
```

```latex
F_i(t) \leftarrow \max\big(F_i(t),\, F_{\min}\big), \qquad F_{\min} = 1 \text{ coin}
```

| Parameter | Default | Effect |
| --- | --- | --- |
| P\_IPO | 100 coins | Every meme lists at the same price |
| κ (elasticity) | 0.6 | 2× attention gives 1.52× price; 10× gives 3.98× |
| λ (momentum premium) | 0.25 | Momentum moves price by at most ±28% (e^0.25) |
| D\_i (dormancy decay) | 1 while active | Section 8: decays with a 7-day half-life while dormant |

Why log-linear: attention spans orders of magnitude, and percentage moves feel right to traders. κ below 1 keeps a viral 100× spike at about 16× the price instead of 100×, so the chart stays readable.

Public signals like Wikipedia pageviews are visible to anyone. A player who watches them and trades before the next fair-value update is using real skill, and that is intended.

## 6. Hybrid exchange

Every order goes through one router that fills it step by step from whichever is cheaper: the player order book or the house curve. Players win ties. The house curve is a virtual constant-product market maker whose centre drifts toward a blend of fair value and recent player prices. This is the same pattern Manifold uses for play money ([Manifold](https://manifold.markets/jack/poll-would-you-use-limit-orders)) and IDEX uses on a real exchange ([IDEX](https://idexexchange.gitbook.io/overview/how-idex-works/automated-market-makers)).

### 6.1 House curve

Per meme the house holds a centre price p and a depth L. Its virtual reserves are x shares and y coins:

```latex
x = \frac{L}{\sqrt{p}}, \qquad y = L\sqrt{p}, \qquad x\,y = L^2, \qquad p = \frac{y}{x}
```

Moving the house price from p to p\* trades this many shares, for this many coins before spread:

```latex
\Delta q(p \to p^*) = L\left(\frac{1}{\sqrt{p}} - \frac{1}{\sqrt{p^*}}\right), \qquad \Delta c(p \to p^*) = L\left(\sqrt{p^*} - \sqrt{p}\right)
```

For a buy of d shares, the new price comes from x' = x − d:

```latex
p' = \left(\frac{L}{x - d}\right)^{2}
```

The house quotes around p with half-spread s/2. Buyers pay the curve cost × (1 + s/2) and sellers receive it × (1 − s/2):

```latex
a_h = p\,(1 + s/2), \qquad b_h = p\,(1 - s/2), \qquad s = \min\!\big(s_0 + s_1\,\hat\sigma_{1\text{h}},\; s_{\max}\big)
```

Here σ̂1h is realized volatility over the last hour, with defaults s\_0 = 0.30%, s\_1 = 0.5 and s\_max = 3%. Players can quote inside the house spread and take the flow.

### 6.2 Depth

Depth is set in coins, Y\_i = L\_i√p\_i, and scales with heat:

```latex
Y_i = Y_0 \cdot \operatorname{clip}(H_i,\, 0.2,\, 5), \qquad Y_0 = 500{,}000 \text{ coins}
```

Spending c coins against the house multiplies its price by (1 + c/Y)². At Y = 500,000, 10,000 coins move price about +4%, and a full 100,000-coin bankroll moves it about +44%. Hot memes are 5× harder to move, and cold ones 5× easier. When heat changes, L is rescaled with p held fixed. This is a virtual change, not a trade.

### 6.3 Drift toward target

The house centre drifts toward a target that blends data fair value F (section 5) with the 24-hour player VWAP V. This makes player demand part of the price, not just noise around it:

```latex
T_i = F_i^{\,1-\omega}\; V_i^{\,\omega}, \qquad \omega = 0.3 \quad (V_i = F_i \text{ if there were no trades})
```

The original exchange uses a two-second tick and a six-hour half-life. Once Dank opens, the live exchange runs this model every 100 ms and adds the common log return defined below.

```latex
\ln p \;\leftarrow\; \ln p + \big(1 - 2^{-\Delta t/\tau}\big)\big(\ln T_i - \ln p\big) + \sigma_n \sqrt{\Delta t}\,\epsilon, \qquad \epsilon \sim \mathcal{N}(0,1)
```

This is an Ornstein–Uhlenbeck pull in log price. A whale can push a meme 40% above target, and the push decays by half every 6 hours unless others keep buying. That decay is what scalpers trade. σ\_n is optional chart noise (default 0.3% per √hour, scaled by heat), drawn from a seeded generator so every run can be replayed exactly.

#### The Dank Index and live quotes

Dank is a synthetic exchange benchmark. It opens at 1,000 points. Each tick generates one market-wide return before individual memes move. With elapsed time h in hours and an independent seeded standard normal Z, the engine computes

```
rDank = (1 − 2^(−h/24)) × ln(1000 / Dank) + 0.025 × √h × Z
Dank  = Dank × exp(rDank)
```

Every open house curve adds rDank to its own log-price update. The initial sensitivity is 1 across memes. The existing fair-value pull, heat-scaled noise, player orders and available depth can still make their quoted midpoints diverge. The 2.5% hourly volatility coefficient is an initial gameplay tuning choice. A journaled opening event preserves the old model for historical replay.

The Markets page shows Dank in points with a rolling minute of engine quotes, restored on entry and after delivery gaps of three seconds or more. Meme pages show the live midpoint on the same timescale, followed by minute candles. The quote shows the midpoint, bid and ask. The socket targets ten updates per second and polling samples every two seconds during fallback.

Market Buy Max uses a matching-engine preview including fees, player liquidity and house price impact. Limit Buy Max uses the configured per-share reserve. Stop Buy Max estimates at current quotes. Sell Max uses available owned shares. A book price selects Limit, preserves the chosen side and quantity, and focuses the price for review. Submission is a separate action.

### 6.4 Router

For a buy of Q shares with limit ℓ (ℓ = ∞ for a market order). Sells mirror it with bids and b\_h:

```
remaining = Q
while remaining > 0:
    a_b, n_b = best book ask and its size   (a_b = inf if the book is empty)
    a_h      = p * (1 + s/2)
    if min(a_b, a_h) > l: break               # nothing left inside the limit
    if a_b <= a_h:                            # players win ties
        fill min(remaining, n_b) at a_b against the book
    else:
        p_stop = min(a_b, l) / (1 + s/2)      # house price where it stops being cheaper
        d = min(remaining, L * (1/sqrt(p) - 1/sqrt(p_stop)))
        fill d against the house; p = (L / (x - d))^2
    remaining -= filled
if remaining > 0 and order is a limit: rest it on the book
```

Guarantee: every fill is at a price no worse than the best single source would have given at that moment.

### 6.5 Keeping the two in sync

The sync rule is a no-cross invariant, checked after every event that moves p (a tick, a fair-value update or a trade):

```latex
\text{best book bid} < a_h \quad\text{and}\quad \text{best book ask} > b_h
```

If the house drifts through a resting order, the engine fills it against the house right away, until the invariant holds again. The resting player counts as maker (no fee) and gets the house's curve price when that is better than their limit. So limit orders fill against both sources, and no player can arbitrage the house against the book for free. This avoids the arbitrage drain that hybrid exchange designs warn about ([Chainscore Labs](https://www.chainscorelabs.com/guides/cryptocurrency-trading-and-investment/on-chain-trading-infrastructure/how-to-architect-a-hybrid-order-book-amm-trading-system)).

### 6.6 Prices shown

| Price | Definition | Used for |
| --- | --- | --- |
| Last | Price of the latest fill | Chart, candles, stop triggers |
| Quote | Best bid = max(book bid, b\_h); best ask = min(book ask, a\_h) | Order ticket |
| Mark | median(mid, 5-minute EMA of last, F\_i) | Equity, margin, liquidation (section 7) |
| Fair value | F\_i from section 5 | Shown beside the chart as a dotted line |

### 6.7 Worked example

The house has p = 100 and Y = 500,000, so L = 50,000 and x = 5,000 shares, with s = 0.3%. The book holds one ask: 100 shares at 101. A market buy for 300 shares fills like this:

| Step | Source | Shares | Price path | Coins incl. spread |
| --- | --- | --- | --- | --- |
| 1 | House | 21.08 | 100 to 100.85 (house ask reaches 101) | 2,120 |
| 2 | Book | 100 | 101.00 flat | 10,100 |
| 3 | House | 178.92 | 100.85 to 108.51 | 18,753 |
| Total | Both | 300 | Average 103.24 | 30,973, plus a 31-coin taker fee |

The house price then decays from 108.51 back toward target, with a 6-hour half-life.

### 6.8 Order types (MVP)

- **Market:** fills now through the router.
- **Limit:** good-till-cancelled, or with an expiry the player picks. An expiry protects a resting order from going stale when a meme suddenly moves ([Manifold on stale orders](https://manifold.markets/post/making-limit-orders-safe-from-break)).
- **Stop-market:** becomes a market order when the last price crosses the stop.

## 7. Shorting, margin and liquidation

Any player can short any active meme by posting 50% collateral and paying an hourly borrow fee. A short is force-closed when equity falls below 30% of the shorts' value. Long positions are paid for in cash, with no leverage in the MVP.

### 7.1 Equity and requirements

Short-sale proceeds go into cash C\_u but stay locked as collateral. With mark price M\_i (section 6.6) and q\_{u,i} < 0 for a short:

```latex
E_u = C_u + \sum_i q_{u,i}\, M_i
```

```latex
\text{IM}_u = m_I \sum_{q_{u,i}<0} |q_{u,i}|\, M_i, \qquad \text{MR}_u = m_M \sum_{q_{u,i}<0} |q_{u,i}|\, M_i, \qquad m_I = 0.5,\; m_M = 0.3
```

- **Opening or adding to a short:** allowed only if E\_u − IM\_u ≥ 0 after the order.
- **Buying shares:** must be paid from free cash, which is cash minus locked collateral.
- **Liquidation:** triggered when E\_u < MR\_u, checked on every mark-price change.

### 7.2 Liquidation

1. The engine buys back the shorts with the largest losses first, through the router as market orders.
2. It stops once E\_u ≥ IM\_u, so the player isn't left on the edge.
3. A 1% fee on the closed notional goes to the sink (section 4).
4. The player gets a notification and the event shows in their history.

Mark price, not last price, drives liquidation, so one odd print can't wipe a player out.

### 7.3 Borrow fee

Charged hourly on |q| × M. It rises with utilization U\_i, which is short open interest over shares available to borrow, counting the house's virtual shares x\_i:

```latex
r_i = r_0 + r_1\,U_i, \qquad U_i = \frac{\text{short OI}_i}{\text{long OI}_i + x_i}, \qquad r_0 = 0.005\%/\text{h},\; r_1 = 0.05\%/\text{h}
```

At zero utilization that is about 0.12% a day. A crowded short at U = 1 costs about 1.3% a day, which squeezes shorts on popular targets.

### 7.4 Dormant memes

New shorts on a dormant meme are blocked once U\_i > 0.5, and the borrow fee there is 5×. Price already decays toward the 1-coin floor, so this stops players farming a near-certain fall. This rule came from the dormancy decision, not anti-manipulation.

### 7.5 Worked example

A fresh account (100,000 cash) shorts 500 shares at 100. Cash becomes 150,000, with IM 25,000 and MR = 150 × M.

```latex
E(M) = 150{,}000 - 500M < 150M \;\Longrightarrow\; M > 230.77
```

The short survives until the mark price is about 2.3× the entry. The most it can earn is just under 50,000, because the price floor is 0.01.

## 8. Meme lifecycle

A meme moves through five states: candidate, pre-open, active, dormant, and back to active on revival. Nothing is ever delisted, except a meme pulled by the content screen.

### 8.1 States and transitions

| From | To | Trigger |
| --- | --- | --- |
| (none) | Candidate | The detector flags a spike, a player nominates it (post-MVP), or the operator adds it |
| Candidate | Pre-open | Passes the content screen and has at least one mapped data source |
| Candidate | Rejected | Fails the content screen |
| Pre-open | Active | 30 minutes pass; the house opens at 100 |
| Active | Dormant | Heat H\_i < 0.3 for 7 days in a row |
| Dormant | Active | Revival: z\_i > 2 and a\_i > a\_rev |
| Any | Halted | Operator pulls it for content reasons; positions settle at the last mark |

### 8.2 Detection

A candidate score ranks memes that aren't listed yet by how fast attention is accelerating. Acceleration is the earliest signal that something is about to blow up:

```latex
\text{score}_j = \frac{a_j - \operatorname{median}(a)}{\operatorname{MAD}(a)} \;+\; 0.5\, z_j
```

Discovery feeds for the MVP:

- Wikipedia's daily top-viewed articles, which return up to 1,000 articles a day per project.
- YouTube's most-popular video chart.
- Operator picks.

The top 20 candidates each day go into the review queue.

### 8.3 Content screen

Reject: hate symbols or slurs, sexual content, real private individuals, tragedies or violent events, anything involving minors, and real-money tokens. The operator reviews by hand in the MVP, and automated pre-filtering comes later.

### 8.4 Pre-open and IPO

- **Pre-open:** for 30 minutes the meme page, attention graph and fair value are visible, and players can place limit orders.
- **Open:** the house starts at p = 100. Resting orders that cross 100 fill immediately under the no-cross rule (section 6.5), so the opening price comes from real demand.

### 8.5 Dormancy and revival

While dormant, fair value carries an extra decay with a 7-day half-life, counted over t\_d, the time spent dormant:

```latex
D_i(t) = 2^{-t_d/7\,\text{days}} \qquad (D_i = 1 \text{ while active})
```

Dormant memes move to the Graveyard tab. They stay tradable, holders keep their shares, and the price never goes below 1 coin.

On revival D\_i resets to 1 and fair value jumps, while the house price climbs toward it with a 6-hour half-life (section 6.3). Holders and early buyers get the comeback, and the meme gets a "Comeback" banner and a push to the trending feed. The threshold a\_rev is tuned in simulation (section 11).

## 9. System architecture

One single-threaded sequencer per meme handles every order, house tick, fair-value update and margin check in a strict order, so the book and the house curve can never disagree. Everything else feeds it or reads from it.

&#91;embedded content: system architecture · 8 components\]

Signals flow along the top row into fair value, and orders flow along the middle row. The sequencer writes every event to Postgres and fans out prices through Redis.

### 9.1 Engine rules

- **Event-sourced:** every input is appended to the event log with a sequence number before it is applied. State is rebuilt by replaying the log from the last snapshot, taken every 10,000 events.
- **Deterministic:** integer micro-coin math, and noise from a per-meme seeded generator. Replaying the log reproduces every price exactly, which makes bugs reproducible and simulations trustworthy.
- **Double-entry ledger:** each fill writes balanced journal lines (player cash, player shares, house, fee sink), and balances are sums of the journal, never edited.
- **Scale:** one Node process runs all MVP memes as separate sequencers. Later, memes are sharded across processes by meme id, since memes never share state.
- **Margin:** a risk loop inside each sequencer re-checks the players short that meme on every mark change, using an index of shorts by meme.

### 9.2 Stack (my call)

TypeScript end to end: Next.js web client, a Node API gateway with websockets, Node sequencers, Postgres for the event log and ledger, and Redis for live prices and pub/sub. Host in one region near India for the first players.

### 9.3 Data model

| Table | Holds |
| --- | --- |
| users | Account, reset count, style class |
| memes | Name, state, IPO time, house state (p, L), signal map |
| meme\_signal\_map | Wikipedia titles, YouTube video ids, Trends terms per meme |
| signal\_raw | meme, source, timestamp, raw count |
| signal\_features | A, smoothed values, v, a, z, H, F per update |
| orders | Type, side, limit, stop, expiry, status |
| events | Append-only engine log with sequence numbers |
| journal | Double-entry lines per fill, fee, borrow charge, reset |
| positions | Cached shares and average cost, rebuilt from the journal |
| candles\_1m | OHLCV per meme per minute |
| params | Versioned tunables (κ, λ, ω, τ, Y\_0, fees), changed live by the operator |
| nominations | Post-MVP: who nominated what, outcome, bonus paid |

## 10. Data sources and legal constraints

Launch on Wikipedia pageviews and YouTube, both free and allowed. Apply for Google Trends now, and leave Reddit out until there is a commercial agreement. Legally the game must stay strictly non-monetary in India: coins can never be bought or cashed out.

### 10.1 Data sources

| Source | Access | Limits and terms | MVP? |
| --- | --- | --- | --- |
| [Wikipedia pageviews (Wikimedia REST API)](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/getting-started.html) | Open, no key; send a descriptive User-Agent | Per-article daily counts and daily top-viewed lists; rate-limited per IP | Yes |
| [YouTube Data API v3](https://developers.google.com/youtube/v3/determine_quota_cost) | Free key | 10,000 units a day by default; videos.list costs 1 unit, search is expensive, so map video ids at listing and avoid search | Yes |
| [Google Trends API](https://developers.google.com/search/apis/trends) | Alpha, by application only | Consistently scaled data, 5-year rolling window; still limited access as of 2026 | Apply now; add when granted |
| [Reddit Data API](https://data365.co/blog/reddit-api-pricing) | Free tier for non-commercial use only | Commercial use needs Reddit's written approval and a contract, with no published price | No |
| In-game attention | Ours | None | Yes |

Action: never scrape a source in breach of its terms. If the game makes money later, a commercial data source counts as commercial use from day one.

### 10.2 India: online gaming law

India's Promotion and Regulation of Online Gaming Act, 2025 bans online money games, whether skill or chance, and its Rules came into force on 1 May 2026 ([Nishith Desai](https://nishithdesai.com/research-and-articles/hotline/gaming-law-wrap/setting-the-rules-of-the-game-indias-online-gaming-law-comes-into-force-15586)). Free-to-play games without money are handled on a light-touch, respond-to-complaints basis ([Gala Law](https://blog.galalaw.com/post/102mqs2/indias-online-gaming-rulebook-has-arrived-but-the-game-is-far-from-over)).

Hard rules for this product:

- No deposits, no buying coins, no cash-out, no prizes with money value tied to rank.
- Any future money (ads, cosmetics, a subscription) must give no trading advantage and no extra coins.
- Get a lawyer's review before adding any paid feature. I'm not a lawyer.

### 10.3 Content and IP

Meme images are usually someone else's copyright. The MVP shows the meme's name, a short description and links or official platform embeds, not re-hosted images. Respond to takedown requests within 48 hours.

Idea and brand protection were covered earlier: the idea can't be protected, but code and videos are copyrighted automatically, and the name and logo should be trademarked.

## 11. Testing and simulation

Before launch, the engine must pass invariant tests on every commit, and the pricing must pass a bot-market simulation on real historical attention data. That simulation is where every default in this document gets tuned.

### 11.1 Invariant tests (property-based)

| Invariant | Check |
| --- | --- |
| Conservation | Sum of all journal lines is zero after every event |
| Curve | x·y = L² after every house fill, to integer rounding |
| No-cross | Book bid < a\_h and book ask > b\_h after every event |
| Best execution | Router fill cost ≤ the cost from the book alone and from the house alone |
| Priority | At equal price, book volume fills before house volume |
| Determinism | Replaying the event log reproduces state byte for byte |
| Margin | No account has E < MR after a liquidation pass |
| Floors | No price below 0.01 and no fair value below 1 |

### 11.2 Bot-market simulation

Replay 60 to 180 days of real Wikipedia pageviews for 30 or more past memes with known rise-and-fall shapes, at 100× speed, against a population of bots:

- **Random traders:** the baseline that every strategy is measured against.
- **Trend-spotters:** read the raw signals and buy rising acceleration early.
- **Fair-value traders:** buy below F and sell above it.
- **Momentum scalpers:** chase short price moves.
- **Market makers:** quote both sides of the book.
- **Whales:** move 50,000 to 100,000 coins at once.
- **Short sellers:** short memes as they peak.

### 11.3 Pass criteria

| Metric | Target |
| --- | --- |
| Trend-spotter edge | Median TWR beats random traders over 30 days, in at least 80% of runs |
| Price tracks attention | Correlation of daily log price with log attention ≥ 0.6 |
| Liveliness | Median meme moves 3% to 15% a day; no meme sits flat for over an hour |
| Coin supply | Grows ≤ 2% a week per active player (section 4) |
| Whale recovery | A 100,000-coin push halves within 4 to 8 hours |
| Revival | At least half the simulated comebacks trigger revival within 24 hours |

### 11.4 Load test

2,000 orders a second across 20 memes with a p99 fill latency under 50 ms, plus 10,000 websocket clients receiving prices at least once a second.

## 12. MVP scope, milestones and open questions

The MVP is a web app with about 20 hand-picked memes, the full hybrid exchange, shorting, dormancy and leaderboards. Nominations, mobile, Discord and seasons come later.

### 12.1 In the MVP

- Sign-up, 100,000 coins, free resets with a counter.
- About 20 memes, mapped to Wikipedia and YouTube sources by the operator.
- Heat, fair value, house curve, order book and router, exactly as in sections 5 and 6.
- Market, limit (with optional expiry) and stop-market orders.
- Shorting with margin, borrow fees and liquidation.
- Lifecycle: pre-open, active, dormant (Graveyard) and revival.
- Meme page with a live chart, fair-value line, attention graph and order book.
- Daily, weekly, all-time and style leaderboards; "I called it" share cards.
- Admin: listing queue, signal mapping, live parameter tuning, coin-supply and house dashboard.

### 12.2 Out of scope

- Real money in any form: buying coins, cash-out or money prizes.
- Anti-manipulation limits (Faaz's decision).
- Seasons.
- Player nominations and founder bonus (next release).
- Native mobile app and push notifications.
- Discord bot.
- Margin buying (leveraged longs), options and meme index funds.
- Reddit and TikTok data.

### 12.3 Milestones

1. **Engine core:** house curve, book, router, ledger and event log, with the invariant tests in 11.1 passing.
2. **Signals:** Wikipedia and YouTube ingest, heat and fair value.
3. **Simulator:** bot market on historical data; tune the parameters until 11.3 passes.
4. **Web client:** trading screens, charts, websockets, leaderboards.
5. **Closed alpha:** 50 to 100 friends and followers from the progress videos, with live tuning.
6. **Public launch:** nominations follow soon after.

### 12.4 Open questions

- [ ] Name decided: Dankrupt. Still to do: domain (e.g. dankrupt.gg), @playdankrupt handles, and a trademark filing in class 9 and class 41.
- [ ] Are the default numbers right (100,000 start, Y\_0 = 500,000 depth, κ = 0.6)? Settled by the simulator.
- [ ] How to show memes without re-hosting images: embeds, links or creator permission?
- [ ] Long-term business model, given that coins can never be sold.
- [ ] Founder bonus size for nominations (proposal: 5,000 coins if fair value doubles within 14 days).
- [ ] Whether to add a player-vs-player-only mode once there are enough players.

### Sources

- [Manifold poll on combining an AMM with limit orders](https://manifold.markets/jack/poll-would-you-use-limit-orders)
- [Manifold: making limit orders safe from breaking news](https://manifold.markets/post/making-limit-orders-safe-from-break)
- [IDEX hybrid liquidity](https://idexexchange.gitbook.io/overview/how-idex-works/automated-market-makers)
- [Chainscore Labs: architecting a hybrid order book AMM](https://www.chainscorelabs.com/guides/cryptocurrency-trading-and-investment/on-chain-trading-infrastructure/how-to-architect-a-hybrid-order-book-amm-trading-system)
- [Manifold: ManiPerp, a pool-based AMM for perpetuals (Feb 2026)](https://manifold.markets/maniperp.pdf)
- [Wikimedia Analytics API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/getting-started.html)
- [YouTube Data API quota costs](https://developers.google.com/youtube/v3/determine_quota_cost)
- [Google Trends API alpha](https://developers.google.com/search/apis/trends)
- [Reddit Data API pricing and approval rules](https://data365.co/blog/reddit-api-pricing)
- [Nishith Desai: India's online gaming law comes into force](https://nishithdesai.com/research-and-articles/hotline/gaming-law-wrap/setting-the-rules-of-the-game-indias-online-gaming-law-comes-into-force-15586)
- [Gala Law: India's online gaming rulebook](https://blog.galalaw.com/post/102mqs2/indias-online-gaming-rulebook-has-arrived-but-the-game-is-far-from-over)

Market display clarification (§6.3): Markets rows and meme headlines show the live midpoint. The live line has a labeled price axis. Minute candles default to 30 minutes with a 90-minute option and scale to their visible highs and lows. An off-scale fair value stays in the readout.
