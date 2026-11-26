# Dankrupt Exchange

**A daily stock market where the companies are memes.** Every day you get 100,000 play coins. Buy the memes you think are about to blow up, short the ones going stale, and see where you rank when the bell rings at 00:00 UTC.

Prices aren't random. Each meme has a fair value that follows real internet attention: Wikipedia pageviews for its article plus what players on Reddit are looking at and starring. A meme the internet is talking about drifts up. One the internet has forgotten drifts down. You're trading on your read of the culture.

Play coins have no money value. They can never be bought, sold or cashed out.

## How to play

1. **Open today's Market Day post** and tap **Start trading**.
2. **Pick a meme.** Each one shows its live price, a candle chart, the order book and how much attention it's getting.
3. **Trade.** Buy with a market order, or set a limit price and wait for it to fill. Sell what you hold, or sell what you don't hold to go short. Stop orders protect you on the way down.
4. **Watch the bar at the bottom.** It shows the time left in the round, your return, your rank and your streak.
5. **At 00:00 UTC the round closes.** Every open position settles at the mark price. The best return wins the day.

There's no trade limit. Trade as much or as little as you like.

## The daily loop

- **A fresh wallet every day.** Everyone starts each round with the same 100,000 coins, so a bad day never locks you out of the next one.
- **A new listing every day.** Each Market Day lists one new meme with a two-hour opening auction. Bid early to set its first price.
- **A result card.** The next time you open the game after a round closes, you see your rank, your return and your streak, with a shortcut to the day's thread.
- **Streaks.** Trade on consecutive days to build your streak.
- **Flair.** The top three traders of each round get user flair in the subreddit (🥇 Day 12 top trader) until the next round crowns new ones.
- **One thread per day.** The app posts a new Market Day thread at every open, so each day's trades and arguments have their own home.

## For moderators

- Installing the app opens the market and posts the first Market Day thread.
- **Post today's Market Day** (subreddit menu) creates a Market Day post by hand.
- Moderators get an **Operator desk** button at the bottom of the Standings screen. It lets them queue and approve new meme listings, halt a meme (every position settles at the mark), and tune market parameters within safe bounds. Every operator action is logged.

## Fetch domains

The app requests these domains:

- `wikimedia.org`: daily per-article pageview counts from the [Wikimedia REST API](https://wikimedia.org/api/rest_v1/), one input to each meme's fair value. The app fetches each listed meme once a day.
- `en.wikipedia.org`: resolves a Wikipedia article title (following redirects) when a moderator proposes a new listing, through the public MediaWiki API.

Both are public, documented APIs. Only aggregate view counts are stored.

## How it works

The game is a port of the Dankrupt Exchange web app, rebuilt to run entirely on Reddit's Developer Platform:

- **Engine.** The deterministic matching engine is shared with the web app: price-time order book, house market maker, shorting with margin and liquidation, borrow fees, opening auctions and volatility halts. Its state lives in Redis and changes only inside an optimistic transaction, so two requests can never spend the same coins.
- **Clock.** A minute cron advances the house prices, quotes the dealer desks, ingests attention and runs the midnight rollover. Between cron runs, any viewer's poll advances the clock, and Devvit Realtime pushes quotes to every open post.
- **Client.** The interface is built in React, Tailwind and Vite. The interactive post opens as a feed card, and tapping it opens the full trading floor.

## Development

```sh
pnpm install
pnpm --filter dankrupt-exchange test        # API tests against an in-memory Devvit fake
pnpm --filter dankrupt-exchange typecheck
cd apps/devvit && npx devvit login && npx devvit playtest <your-test-subreddit>
npx devvit settings set wikiContact   # contact for the Wikimedia User-Agent
```

To preview the UI locally with the real server code on a fake Redis, run `npx vite --config preview/vite.config.ts` in `apps/devvit`.

[Terms](TERMS.md) · [Privacy](PRIVACY.md) · Source: https://github.com/faazkhn/dankrupt
