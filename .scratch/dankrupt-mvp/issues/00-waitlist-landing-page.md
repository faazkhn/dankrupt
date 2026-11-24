# 00: Waitlist landing page

**What to build:** A public landing page for Dankrupt Exchange where a visitor can leave their email for the waitlist and join the Discord through a link. It goes live on the India VM now for marketing, before any trading exists. Whichever of this ticket and 01 lands first creates the workspace and the web app; the other builds on it.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Needs from Faaz:** the Discord invite URL, and a domain or temporary subdomain for HTTPS.

- [ ] The landing page explains the game in one screen at phone width: memes trade like stocks, paper money only, "I called it".
- [ ] The page states plainly that coins can never be bought or cashed out.
- [ ] The email form validates input on the server and stores each address once, with time, consent and an optional referral source.
- [ ] Repeat sign-ups show the same success message, so the form doesn't reveal who is already on the list.
- [ ] Bot sign-ups are blocked by a honeypot field and per-IP rate limiting.
- [ ] A Discord button opens the invite link.
- [ ] A privacy notice page covers what is collected, why, how long it is kept, and how to ask for deletion. A consent line sits next to the form.
- [ ] The operator can export the waitlist as CSV with one command.
- [ ] It is deployed on the India VM with HTTPS, Postgres and nightly backups. Ticket 20 reuses this VM.
- [ ] A test covers sign-up: valid email, duplicate email and invalid email.
