/** Local preview only: stands in for `@devvit/web/client`. */
export const context = { postId: "t3_preview", username: "preview_user" };
export const navigateTo = (url: string) => console.log("navigateTo", url);
export const requestExpandedMode = () => { window.location.href = "/game.html"; };
export const showToast = (t: string) => console.log("toast", t);
export function connectRealtime() { return { disconnect() {} }; }
