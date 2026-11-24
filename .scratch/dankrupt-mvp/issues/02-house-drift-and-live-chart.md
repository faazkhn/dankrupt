# 02: House drift and live chart

**What to build:** The meme's price moves on its own. Every 2 seconds the house centre drifts toward its target with a 6-hour half-life, plus seeded noise. Until signals exist, the target is a fixed fair value from the seed file. The meme page shows a live mid-price candle chart pushed over websockets by the gateway, which reads from Redis.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Ticks are applied on a 2-second grid from event timestamps and never stored. Replay reproduces the price path exactly.
- [ ] The drift follows PRD §6.3: T = F^0.7 · V^0.3, where V is the 24-hour VWAP of all fills, or F if there were none. Noise is σ_n = 0.3% per √hour × clip(H, 0.2, 5), from a seeded per-meme generator.
- [ ] The spread follows s = min(s₀ + s₁·σ̂1h, s_max), where σ̂1h is the 1-hour realised volatility of 1-minute mid returns.
- [ ] 1-minute candles are built from mid, with volume from fills.
- [ ] Price changes go from the sequencer to Redis to the gateway to the browser, at least once a second. The chart updates live and loads history on page open.
- [ ] Params (τ, ω, s₀, s₁, s_max, σ_n) live in a versioned params set. Params changes are events.
- [ ] Tests: the drift halves a gap to target in 6 hours (±1%). The same seed gives the same price path.
