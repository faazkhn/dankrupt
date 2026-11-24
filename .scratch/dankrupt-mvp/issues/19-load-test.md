# 19: Load test

**What to build:** A repeatable load test proving the engine sustains 2,000 orders a second across 20 memes with p99 fill latency under 50 ms, while the gateway sends prices at least once a second to 10,000 websocket clients. If the target is missed, fix the bottleneck (most likely event-log group commit or fan-out).

**Blocked by:** 03b

**Status:** ready-for-agent

- [ ] A scripted load generator with a realistic mix of market, limit and cancel orders across 20 memes.
- [ ] It measures fill latency from API receipt to fill output (p50/p99) and websocket delivery intervals.
- [ ] It passes on hardware matching the chosen VM size. The result and VM size are recorded.
- [ ] It can be re-run with one command before the alpha deploy.
