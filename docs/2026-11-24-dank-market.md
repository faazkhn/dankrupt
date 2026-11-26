# November 24, 2026 · Dank goes live

| On camera | What changed for developers |
| --- | --- |
| Open Markets and watch the Dank Index for a few seconds. | The sequencer records one dank.open event after catching up. It starts a 1,000-point benchmark with its own replayable random stream. Older events retain the original tick and pricing rules. Replay and startup catch-up after activation process long gaps in minute-sized batches. |
| Open Doge. Watch the large midpoint, then compare the last trade, bid and ask. | Each 100 ms tick applies the Dank log return to open house curves. Individual fair value, volatility and player trades still contribute. The WebSocket sends the latest quotes up to ten times a second. HTTP fallback samples every two seconds. |
| Move across the live line to inspect a quote. Scroll down to compare minute candles. | Both charts use timestamped quotes observed since the screen opened, up to 60 seconds. The older candlestick view still loads server history. The live line leaves gaps across interruptions of three seconds or more. |
| Choose Buy → Market → Max. Read the quantity, estimated average price and fee together. | Max previews the largest permitted request through the existing matching engine. Limit buys use the engine’s reservation rule and configured fees. Stop buys estimate at current prices. A later execution can change as quotes move. The preview clears when the ticket changes. |
| Choose Sell → Max, then tap a house price twice, switching back to Market between taps. | Sell Max uses unreserved owned shares. Both player and house prices switch the ticket to Limit and focus the price field, even for a repeated selection. The side and quantity stay selected. A separate click submits the order. |

The model and player-facing rules are in PRD §6.3. For a short progress video, start with the old 792-versus-721 screenshot, demonstrate Max on the same screen, then pull back to show the shared market movement behind the quote.

### Follow-up · Gaps in the Dank line

The chart used to leave a blank whenever the browser missed three seconds of quotes. The engine now passes every intermediate Dank tick to the feed, including ticks calculated together after a delayed clock. The feed retains 600 samples. Opening Markets or receiving a quote after a three-second gap fetches that history and merges it by timestamp. A closed socket also starts fallback polling during reconnection. For the progress video, reload Markets after the engine has run for a minute and inspect the line immediately.

### Follow-up · Readable Doge candles and a consistent quote

The candle axis now fits the visible highs and lows with 5% padding and a one-cent minimum on each side. Fair value appears in the readout when it falls outside that range. The Markets list now uses the same midpoint as the meme detail headline. For the recording, open Doge from Markets and compare the moving headline with the separately labeled last fill.

### Follow-up · Quote-only headlines and chart ranges

The quote cards now show the midpoint without the last fill or a trade-count message. The live chart has three labeled price levels. Candles open on the latest 30 minutes for wider bodies, with a 90-minute context button. Each range fits its own highs and lows. For the recording, switch between the two ranges on Doge.

### Follow-up · Filled order still appeared open

A Doge limit filled on the engine while the browser continued to show all ten shares open. Account views now request the latest account snapshot every two seconds after the previous request finishes. The remaining quantity, position and available cash update together. An older request cannot replace a newer submission or cancellation response. For a demo, keep the ticket open through a resting fill and watch the remaining quantity drop without reloading.

### November 25 · Exchange rules and seven-day devlog

The account view rebuilds receipts from journaled events and shows the latest 50 orders per account. Each receipt includes executed quantity, fees and individual fills. The chart can show the executable quote, resting limits and recent fills. An amendment replaces the old limit at the back of the queue. A rejected replacement preserves the original reservation and queue entry. An immediate-or-cancel limit discards its unfilled remainder.

The shared market move still drives prices. The displayed Dank Index now compounds the equal-weighted midpoint returns of active memes. The order book shows cumulative quantities, float and remaining borrow. Two inventory-limited desks submit ordinary, journaled orders. The ticket previews 10, 50 or 100 shares through the matching engine.

Pre-open limits can cross in a single-price auction. A 10% move from the minute reference triggers a one-minute reopening auction. The continuous book cancels a trader's own crossing resting order before matching against it.

The seven portrait devlogs use recorded local screens, code inserts and the founder's cloned narration. Day 7 announces that signup is open. Publish that episode only after a test signup succeeds on the public domain.

### November 25 · Revised seven-day cut

Each episode opens with its original hook, then introduces the day. The recording cuts to the problem, two implementation changes, and the result. The closing card adds two timed impacts for “COMING SOON” and the episode number. The revised Day 7 describes the locally verified form ahead of public launch.

The seven editable HyperFrames projects are in `media/seven-days/edits`. The spoken scripts are in `media/seven-days/episodes.json`. Qwen3-TTS used the first twelve seconds of the supplied `clone.mp3` with its transcript as the voice reference. The reusable reference and final delivery WAVs are in `~/Documents/clonedvoice/dankrupt-series`.

### November 25 · Thirty-second live-screen edits

All seven episodes now use a continuous 1080 × 1920 recording of the running local game in a separate demo database. The chart, ticket and receipts refresh through the demo engine while the edit notes appear over the interface. The brand card and its two impact stamps also appear over the game. Day 7 includes the local signup form as a picture-in-picture insert.

The new narration keeps the Qwen3-TTS voice reference. Pitch contours vary by phrase, pauses separate sentences, and each voice track ends at about 26 seconds. “Happy Beats / Business Moves Vol. 10” by Ende.app plays beneath the narration, ducks while the voice is present, and fades under the closing card. Each editable episode has its own game capture and stereo mix.
