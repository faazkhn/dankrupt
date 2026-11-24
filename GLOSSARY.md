# Dankrupt Exchange

A free, paper-money exchange where the listed assets are internet memes, priced by real-world attention and player trading.

## Money and accounts

**Coin**:
The in-game currency. It can never be bought, sold or cashed out.
_Avoid_: credit, token, dollar

**Micro-coin (µc)**:
One millionth of a coin; the unit every balance is stored in.

**Player**:
A signed-up person who trades. Has a public **Handle**.
_Avoid_: user, trader, account (when meaning the person)

**Operator**:
The person who runs the exchange (lists memes, maps sources, tunes params).
_Avoid_: admin, moderator

**Equity**:
A player's cash plus their positions valued at mark price.

**Free cash**:
Cash a player can spend on buys: cash minus short proceeds and initial margin held as collateral, minus cash reserved by resting buy orders.

**Reset**:
A free top-up back to the starting 100,000 coins, allowed when equity is below 1,000 coins (including negative) and the player has no open positions. Counted on the profile.

**Cash event**:
A change to a player's cash that is not a trading result (today only a reset). TWR chains break at cash events.

**Journal**:
The double-entry record of every movement of coins and shares; balances are sums of it.

**Sink**:
The journal account that receives fees and destroys those coins.

**Coin supply**:
Total player equity across all players.

## Memes and lifecycle

**Meme**:
A listed asset. Moves through Candidate, Pre-open, Active, Dormant and Halted.
_Avoid_: stock, ticker, coin

**Candidate**:
A meme proposed for listing, waiting for the operator's content screen.

**Content screen**:
The operator's manual check that rejects hateful, sexual, tragic, minor-related, private-person or real-money-token memes.

**Pre-open**:
The 30 minutes after approval when players can trade with each other through the book but the house is closed.

**IPO**:
The moment the house opens on a meme at 100 coins.

**Dormant**:
A meme whose heat stayed below 0.3 for 7 days. Still tradable, shown in the **Graveyard**, and its fair value decays.
_Avoid_: dead, delisted

**Revival**:
A dormant meme becoming active again when attention spikes.
_Avoid_: comeback (that is the banner's name only)

**Halted**:
A meme pulled for content reasons; positions settle at the last mark. The only way a meme leaves the market.
_Avoid_: delisted

## Attention and pricing

**Source**:
A feed of attention counts for a meme: Wikipedia pageviews, YouTube views, Google Trends or in-game attention.

**Signal map**:
The operator's mapping from a meme to its source identifiers (article titles, video ids, terms).

**Attention index (A)**:
A meme's blended, normalised attention across its fresh sources.

**Heat (H)**:
How hot a meme is relative to its own last 30 days. Always positive.

**Fair value (F)**:
The price a meme deserves from attention alone.
_Avoid_: target (target is a different blend), intrinsic value

**Target (T)**:
The price the house drifts toward: a blend of fair value and the 24-hour VWAP of all fills.

**Params**:
The versioned set of tunable numbers (κ, λ, ω, τ, Y₀, fees, baselines) the operator can change live.

## Exchange

**House**:
The always-on market maker the exchange runs for every meme, quoting off a virtual constant-product curve.
_Avoid_: AMM, bot, pool

**Centre price (p)**:
The house curve's current price, before spread.

**Depth (Y)**:
How many coins it takes to move the house price; set by heat.
_Avoid_: liquidity (too vague)

**Book**:
The players' resting limit orders for one meme, in price-time priority.
_Avoid_: order book (fine in UI copy), orderbook

**Router**:
The rule that fills an order step by step from whichever of book and house is cheaper; players win ties.

**No-cross rule**:
After anything moves the house, any resting order that crosses the house quote fills against the house at once.

**Fill**:
One execution of some quantity at one price, against the book or the house.
_Avoid_: trade (a trade is a round trip, below), execution

**Maker / Taker**:
The resting side of a fill pays no fee; the side that fills immediately pays 0.1%.

**Mid**:
The midpoint of the best bid and best ask across book and house. Charts and stop triggers follow it.

**Last**:
The price of the latest fill.

**Mark price (M)**:
median(mid, 5-minute EMA of last, fair value). Drives equity, margin and liquidation.

**Tick**:
The 2-second step on which the house drifts toward target.
_Avoid_: using "tick" for the 0.01 price increment; call that the **price step**

## Shorting

**Short**:
A negative position, opened by selling shares the player does not hold.

**Initial margin (IM)** / **Maintenance requirement (MR)**:
50% and 30% of short value at mark. Opening a short needs equity ≥ IM; equity below MR triggers liquidation.

**Liquidation**:
The engine buying back a player's shorts, worst losses first, until equity ≥ IM, with a 1% fee.

**Borrow fee**:
The fee for holding a short, accrued per minute and rising with utilisation.

**Utilisation (U)**:
Short open interest divided by long open interest plus the house's virtual shares.

## Competition

**Trade**:
One round trip in a meme, from no position back to no position. Its **holding time** runs from the first opening fill to the last closing fill.
_Avoid_: using "trade" for a single fill

**TWR**:
Time-weighted return: equity returns chained between cash events. Boards rank by it.

**Style**:
A player's class by median trade holding time: Scalper (< 1 hour), Swing (1 hour to 3 days), Trend-spotter (> 3 days).

**Share card**:
The "I called it" image a player shares when a trade pays off.

## Engine

**Sequencer**:
The single process that applies every event for every meme in one strict order.

**Event log**:
The append-only, sequence-numbered record of every input to the sequencer; state is rebuilt by replaying it.
