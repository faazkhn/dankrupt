# 03b: Held funds, cancel, expiry and book UI

**What to build:** Resting orders become safe and visible. Each resting order holds back the cash or shares it needs. Players can cancel orders or give a limit order an expiry, and the meme page shows the order book and the player's open orders and fills.

**Blocked by:** 03a

**Status:** ready-for-agent

- [ ] A resting buy holds back its limit cost plus the taker fee. A resting sell holds back its shares. Orders that can't be covered are rejected at entry.
- [ ] Free cash, shown in the UI, excludes held-back funds. A fill can never leave a player overdrawn: there's a property test for this.
- [ ] Cancel releases the held funds. An expired order is cancelled at the first tick after its expiry time, and replay reproduces this exactly.
- [ ] The meme page shows book depth (book and house quote distinguished), open orders with a cancel button, recent fills, and position with average cost.
- [ ] Everything works at phone width.
