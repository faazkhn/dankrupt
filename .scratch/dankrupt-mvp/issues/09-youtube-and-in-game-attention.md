# 09: In-game attention, watchlist and YouTube embeds

**What to build:** In-game attention joins the blend, made of meme page views and watchlist stars counted per 1,000 active players. Players can star memes into a watchlist. Meme pages show official YouTube embeds of mapped videos with the required attribution. YouTube views do **not** enter the blend: YouTube's default policies ban derived metrics (see `docs/research/data-source-terms.md`), and ticket 09b adds them only if YouTube approves.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Page views and stars are counted per meme per 5 minutes and normalised per 1,000 active players.
- [ ] In-game attention goes stale after 2 missed 5-minute updates.
- [ ] Weights are Wikipedia 0.40, in-game 0.10, YouTube 0 and Google Trends 0. They are params.
- [ ] The watchlist star works, shows on a Watchlist tab and counts toward in-game attention.
- [ ] YouTube embeds use the official player only, with attribution and policy links as the research doc lists. No YouTube statistics are fetched or stored.
- [ ] Features table tests cover a source going stale and recovering mid-series.
