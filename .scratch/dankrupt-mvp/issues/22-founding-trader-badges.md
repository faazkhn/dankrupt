# 22: Founding Trader badges (post-alpha)

**What to build:** Every player who played during the closed alpha gets a permanent Founding Trader badge. It shows next to their handle on their profile, the leaderboards and share cards.

**Blocked by:** 20

**Status:** ready-for-agent

- [ ] "Played during the alpha" means the player had at least one fill between alpha open and public launch. The operator sets both dates in params.
- [ ] Badges are granted by a recorded, repeatable operator action, and never by the client.
- [ ] The badge is cosmetic only: no coins and no trading advantage (PRD §10.2).
- [ ] Tests: a player with a fill inside the window gets the badge, one with a fill only outside it doesn't, and granting twice changes nothing.
