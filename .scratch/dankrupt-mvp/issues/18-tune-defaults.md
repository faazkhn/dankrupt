# 18: Tune the defaults until §11.3 passes

**What to build:** Use the full simulator to tune the pricing defaults until every §11.3 criterion passes. These are κ, λ, ω, τ, Y₀, s₀, s₁, σ_n, a_rev, the fees and the fixed source baselines. Record the chosen values as the launch params set, with the report that justifies them.

**Blocked by:** 17b

**Status:** ready-for-agent

- [ ] One params set passes every §11.3 criterion across the agreed number of seeds.
- [ ] The report and the sweep that produced it are saved in the repo.
- [ ] Any default that moved far from the PRD is called out for Faaz's sign-off, including starting cash, Y₀ and κ.
- [ ] The launch params set is loaded as the server's initial params.
