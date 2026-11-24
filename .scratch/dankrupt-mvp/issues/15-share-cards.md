# 15: "I called it" share cards

**What to build:** When a trade closes in profit, the player can share an "I called it" card. It's an image and a link showing the meme, entry and exit price, % return, holding time, handle and date. The link preview shows the card on social apps.

**Blocked by:** 14

**Status:** done: server-rendered 1200×630 cards (Satori, cardboard style, percentages only), public /c/ page with OG and Twitter metadata, Share button on every closed trade (native sheet or copy link). Loss cards say LESSON LEARNED.

- [ ] Cards are generated as images on the server, with the link page's preview metadata pointing to the image.
- [ ] Players can share from the closed-trades list and the trade-closed notice: copy link, download image, or the native share sheet on phones.
- [ ] Cards contain no re-hosted meme images: name and description only (PRD §10.3).
- [ ] A card can only be made for the player's own trades. The link is public, but nothing private appears on it.
