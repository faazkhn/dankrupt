# Integer money, whole shares, float curve state

Every balance, fee and fill cost is an integer number of micro-coins, and share quantities are whole numbers, so the journal always balances exactly. The house curve's centre price and depth, and the attention maths, are IEEE doubles: they need sqrt, exp and ln, and doubles are reproducible for a pinned Node version, which makes replay deterministic. Each fill's cost is computed in floats and rounded once to micro-coins in the house's favour (buyers round up, sellers round down). Noise comes from a seeded per-meme generator. The Node version is pinned because a V8 change to Math.exp or Math.log would change replayed prices.

## Considered Options

- Fixed-point maths for the curve too: rejected, because it needs hand-written sqrt and ln for no gain over a pinned runtime.
- Fractional shares (the PRD's worked example showed 21.08 shares): rejected, to keep the books and the UI simple. The router rounds house fills down to whole shares.
