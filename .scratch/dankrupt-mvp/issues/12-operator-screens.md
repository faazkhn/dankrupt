# 12: Operator screens

**What to build:** The operator can manage listings from the browser instead of the seed file. They can add a meme with name, description and links, map its sources (Wikipedia titles, YouTube video ids), review candidates against the content screen, and approve or reject them. They can also change params live, with no redeploy. Until ticket 10 lands, approval lists the meme straight away at p = 100. After that, approval starts pre-open.

**Blocked by:** 04

**Status:** done: /admin operator desk (OPERATORS env in production; any dev login locally). Add candidates with Wikipedia titles resolved live (redirects followed), approve (lists at 100 until ticket 10) or reject with a content-screen reason, meme descriptions and https links, live params via params.set events with bounds, and an audit log.

- [ ] Only accounts with the operator flag can reach operator screens and endpoints. This is checked on the server.
- [ ] Add and edit meme. The signal map editor checks that Wikipedia titles resolve before saving.
- [ ] The listing queue shows candidates, with approve and reject. Reject records the content-screen reason.
- [ ] Approving needs at least one mapped source.
- [ ] The params editor shows the current values. Each change is a versioned event in the log, so replay stays exact, with a change history.
- [ ] Every operator action is recorded with who did it and when.
