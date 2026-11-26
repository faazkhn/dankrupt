# Devpost form answers (copy-paste, in form order)

Reddit's developer settings are in `../reddit-developer-settings/`. Deadline: December 8, 6 pm Pacific (December 9, 7:30 am IST).

---

## Project Story

### About the project

## Inspiration

It's 11:58 pm UTC. You're holding 400 shares of Skibidi Toilet. It's up 31% on the day, and there are two minutes until the bell. Do you sell and lock it in, or do you believe the internet isn't done with it yet?

That feeling is the whole game.

The internet already talks like a stock market. Formats *moon*. Templates *die*. Somebody in the comments always *called it*. There's a whole subreddit, r/MemeEconomy, that has been joking about investing in memes for years. I wanted to stop joking. I wanted a real exchange, with an order book, short selling and a closing bell, where the companies are memes and the price is set by what the internet is actually paying attention to.

Not by a random number generator. If Moo Deng is having a moment on Wikipedia, Moo Deng goes up. If nobody has looked up Dat Boi in a month, Dat Boi sinks. You're not gambling on noise. You're trading on your read of the culture.

## What it does

Every day is a **Market Day**. You open the post, tap **Start trading**, and get 100,000 play coins. The same for everyone, every day.

- **Prices follow attention.** Each meme has a fair value built from its Wikipedia pageviews plus in-game attention (how often players open and star it). A house market maker drifts toward that value, so the market moves with the internet, not with a script.
- **It's a real exchange.** Market, limit and stop orders. A live order book you can tap to set a price. Short selling with margin. Live candles. And before you place anything, an exact preview: how many shares fill, at what average price, and what it costs.
- **The bell rings at 00:00 UTC.** Every open position settles, everyone is ranked by return, and the top three get subreddit flair (🥇 Day 12 top trader) that stays until the next bell crowns someone else.
- **Something new every day.** Each Market Day lists one new meme with a two-hour opening auction. Get your bid in early and you set its first price. The app posts a fresh Market Day thread at every bell for the day's arguments.
- **A reason to come back.** The next time you open the game after a close, a result card shows your rank, your return and your streak. A fresh wallet every day means a bad call never locks you out of tomorrow.
- **Brag, or confess.** Any closed trade can be posted to the subreddit as your own post: the call, the % return, how long you held. Losses get a "LESSON LEARNED" stamp. Balances are never shown. Anyone who sees it can tap **Trade it yourself**.

Coins have no money value. They can never be bought, sold or cashed out.

## How I built it

Dankrupt Exchange started on November 24, 2026 as a web game: a matching engine, an attention model and a cardboard-and-tape interface I'm still a little in love with. It ran on one always-on server that ticked every 100 milliseconds.

Devvit doesn't have an always-on server. That's the whole story of the port.

- **The market lives in Redis.** Every request loads the market, catches the clock up to the current moment, applies your order, and saves everything back in one optimistic transaction. If two players trade at the same instant, one commit wins and the other quietly retries from scratch, so nobody can ever spend the same coins twice.
- **Time moves lazily.** A scheduler job runs every minute to keep the market moving, quote two dealer desks per meme, fetch Wikipedia pageviews and run the midnight rollover. Between runs, any viewer's request catches the market up. An hour of missed ticks replays in about 116 ms.
- **Realtime keeps it alive.** Every commit pushes quotes to every open post. The last few 100 ms ticks ride along and are replayed on the phone, so the Dank Index line moves smoothly instead of jumping once a second.
- **One engine, two homes.** The deterministic engine is shared, unchanged, with the web version, and so is the interface: Vite aliases swap in Devvit-shaped pieces under the same screens. Ending a daily round needed exactly one new engine event: settle an account at the mark and close it.
- **Built on:** Devvit Web, React, Tailwind, Vite, Hono, Devvit Redis, Scheduler and Realtime, plus Wikipedia's pageview API. 61 engine tests, plus end-to-end tests that run the real API against an in-memory fake of Devvit.

The settlement price is the one number I fussed over most. A single big order shouldn't be able to swing everyone's result at the bell, so positions settle at a **mark** that is the median of three prices:

$$\text{mark} = \operatorname{median}\left(\text{mid},\ \text{EMA}_{5\,\text{min}}(\text{last trade}),\ \text{fair value}\right)$$

To move the mark you'd have to move two of the three, and one of them is Wikipedia.

## Challenges I ran into

- **No long-running process.** My engine assumed a clock ticking ten times a second. On Devvit nothing runs between requests, so I turned time inside out: the market doesn't tick, it *catches up*, a minute at a time, whenever anyone looks.
- **"The string did not match the expected pattern."** My first sell order on Reddit failed with a Safari JSON error. The order had actually gone through; the reply just never made it back in one piece. Now the app tells you plainly when Reddit couldn't confirm in time, and every slow or failed request lands in the log.
- **I clicked "Stage demo trade" and got "Halt a meme".** Devvit matches menu items by position. I'd inserted a new item in the middle, so every stale menu fired the wrong action. The new item goes at the end now, always.
- **A chart that only drew dots.** The live index chart I reused from the web asked for its history at the web app's address, which doesn't exist on Reddit. Every request 404'd, so the line broke into pieces. The fix was one route on the server.
- **Waiting on a domain approval.** Wikipedia's pageview API lives on a domain that was still pending review. A different domain, `en.wikipedia.org`, was already approved, and it turns out Wikipedia's own API serves the same 60 days of daily views, so the app switched to it instead of waiting.
- **A blank box in the feed.** The first version of the feed card loaded the whole game just to show three movers. It now shows the logo before any script runs, makes one read-only request, and ships a little over half the code.

## Accomplishments that I'm proud of

- A complete exchange, order book, shorting and all, running entirely inside Reddit with no outside server.
- Prices that answer to the real internet, not to a script.
- A daily loop that belongs on Reddit: one thread per day, flair for the winners, and trade cards that players post as themselves.

## What I learned

That a daily game needs a closing bell more than it needs features. The moment rounds started ending, with a rank, a flair and a fresh wallet the next morning, the market stopped feeling like a tool and started feeling like something you check before breakfast. (Where I live, the bell rings at 5:30 am. I check it before breakfast.)

## What's next for Dankrupt Exchange

Subreddit-themed markets, where a community lists its own in-jokes. Weekly seasons on top of the daily rounds. Community-nominated listings. And more attention signals, once their terms allow it.

---

### Built with (tags)

devvit, devvit-web, reddit, react, typescript, vite, tailwindcss, hono, redis, devvit-realtime, devvit-scheduler, wikipedia-api, node.js, vitest, pnpm

### "Try it out" links

- https://www.reddit.com/r/dankrupt (paste the pinned Market Day post link here too)
- https://developers.reddit.com/apps/dankrupt-exchange
- https://github.com/faazkhn/dankrupt/tree/devvit/apps/devvit

### Image gallery (3:2, in this order)

`gallery/01.png` logo · `02.png` the feed card · `03.png` a meme's live price and candles · `04.png` the order ticket with its fill preview · `05.png` today's standings · `06.png` a shared trade card

### Video demo link

Optional. Upload `../reddit-developer-settings/featuring-1500x1000.mp4` to YouTube (unlisted is fine) and paste the link, or record a short gameplay clip.

---

## Additional info (plain text, no formatting)

Reddit username:
faazkhn

developers.reddit.com app page:
https://developers.reddit.com/apps/dankrupt-exchange

Link to test post:
(paste the pinned Market Day post on r/dankrupt; the subreddit must be public)

Nominate a most helpful user:
(leave blank)

Is this submission a ported game?
Yes

If this app is a port, please link your original game:
https://github.com/faazkhn/dankrupt — the original Dankrupt Exchange web game (apps/web and the shared engine in packages/engine), which I built starting November 24, 2026. The Reddit version shares its engine and interface and adds the daily round, which was built for Devvit.
