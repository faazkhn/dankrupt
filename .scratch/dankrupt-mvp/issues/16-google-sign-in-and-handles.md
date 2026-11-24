# 16: Google sign-in and handles

**What to build:** Players sign in with Google and pick a unique public handle at first sign-in, replacing the dev login. Sessions are shared between the web app and the API.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Google is the only sign-in method. The dev login is disabled outside development.
- [ ] Handle rules: unique, length and character limits, a reserved-word list. A handle can't be changed more than once a month.
- [ ] Sign-up grants 100,000 coins once per account.
- [ ] The API validates the session on every request. The operator flag is set by the operator, never by the client.
- [ ] The privacy notice from ticket 00 is extended to cover Google account data.
