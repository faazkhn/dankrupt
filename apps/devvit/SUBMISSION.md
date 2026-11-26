# Devpost submission: Reddit's Game of the Day

Paste each section into the matching Devpost field. Fill in the two links marked TODO.

---

## Project name

Dankrupt Exchange

## Tagline

A daily stock market where the companies are memes. Fresh 100,000 coins every morning, prices that follow real internet attention, and a closing bell at midnight UTC.

## Category

Best Ported Daily Game. Dankrupt Exchange is my own web game, started November 24, 2026, ported to Devvit Web and rebuilt around a daily round for Reddit during the hackathon.

## Links

- App listing: https://developers.reddit.com/apps/dankrupt-exchange
- Demo subreddit: https://www.reddit.com/r/dankrupt
- Demo post: TODO (today's Market Day post)
- Code: https://github.com/faazkhn/dankrupt/tree/devvit/apps/devvit
- Video: TODO (optional, under one minute)

---

## Inspiration

Meme culture already talks like a market. Things "moon", formats "die", someone always "called it". I wanted a place where that's literal: you buy the memes you think are about to blow up, short the ones going stale, and the price is set by what the internet is paying attention to, not by a random number generator.

## What it does

Every day is a Market Day. Each player gets 100,000 play coins and trades a set of memes: Skibidi Toilet, Chill Guy, Moo Deng, Grimace Shake, Italian brainrot and more.

- **Prices follow attention.** Each meme has a fair value built from Wikipedia pageviews for its article plus in-game attention (views and stars from players). The house market maker drifts toward it, so a meme the internet is talking about rises and a forgotten one sinks.
- **It's a real exchange.** It has market, limit and stop orders, a live order book, short selling with margin, live charts and an exact preview of every fill before you place it.
- **The bell rings at 00:00 UTC.** Every open position settles at the mark, everyone is ranked by return, and the top three get subreddit flair (🥇 Day 12 top trader) until the next close.
- **Fresh content daily.** Each Market Day lists one new meme with a two-hour opening auction, and the app posts a new Market Day thread for the day's arguments.
- **Players come back.** A result card shows your rank and return the next time you open the game, streaks count consecutive days played, and a fresh wallet means a bad day never locks you out.
- **Sharing is native.** Any closed trade can be posted to the subreddit as the player. The post is a trade card showing the call, the % return (a "LESSON LEARNED" stamp on a loss) and how long it was held, with a "Trade it yourself" button. It never shows balances.

Coins have no money value and can never be bought or cashed out.

## How I built it

- **Devvit Web**, with a React, Tailwind and Vite client and a Hono server.
- **The matching engine is shared with the web version.** It's deterministic and event-driven: price-time order book, a liquidity curve for the house, margin and liquidation, borrow fees and opening auctions.
- **No outside server.** The market lives in Devvit Redis. Each request loads it, advances the house clock to the current moment, applies the order and commits in one optimistic transaction, so two requests can never spend the same coins.
- **A minute-by-minute scheduler job** moves the market between requests, quotes two dealer desks per meme, ingests Wikipedia pageviews and runs the midnight rollover (rank, settle, flair, new listing, new thread).
- **Realtime** pushes quotes to every open post. The last few 100 ms ticks are replayed on the client, so the market index moves smoothly.
- **The web interface is reused** through Vite aliases, so Reddit and the web share one set of screens.

## Challenges I ran into

- **No long-running process.** The original engine ticked every 100 ms in one process. On Devvit, time advances lazily: any request or scheduler run catches the market up to the current moment, a minute at a time.
- **Concurrency.** Many players hitting one shared market from stateless requests meant a transaction-and-retry loop around the whole market state.
- **Daily rounds on a continuous market.** Ending a round needed a new engine event that settles an account's positions at the mark and closes it, without disturbing anyone else's market.

## Accomplishments that I'm proud of

- A complete exchange running entirely inside Reddit, with no external backend.
- Prices that respond to the real internet, not to a script.
- A daily loop that fits Reddit: one thread per day, flair for the winners, and trade cards posted by players.

## What I learned

How far Devvit's Redis transactions, scheduler and realtime can stretch: far enough to run a live order book.

## What's next

- Subreddit-themed markets.
- Weekly seasons on top of the daily rounds.
- More attention sources once their data terms allow.
- Community-nominated listings.

## Built with

devvit, devvit-web, react, typescript, tailwindcss, vite, hono, redis, wikimedia-api

---

## Testing notes for judges

1. Open the pinned Market Day post on r/dankrupt and tap **Start trading**.
2. Pick any meme, buy a few shares at market, then sell them. Your rank and return appear in the bar at the bottom.
3. Open **Standings** (trophy button) to see today's board and your streak.
4. On your profile (the coin balance button), any closed trade has a **Share** button that posts it to the subreddit after you confirm.
5. Rounds close at 00:00 UTC. Come back after that to see your result card and the next Market Day.
