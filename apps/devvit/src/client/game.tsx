import "./index.css";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import MePage from "@/app/me/page";
import Markets from "@/app/trade/page";
import { MemeView } from "@/components/MemeView";
import { useDay } from "@/lib/market";
import { Board, DailyBar, ResultCard, Welcome } from "./daily.tsx";
import { captureExternalLinks, usePath } from "./router.ts";

function App() {
  const path = usePath();
  const day = useDay();
  const [dismissed, setDismissed] = useState(false);
  const meme = path.match(/^\/m\/([a-z0-9_-]+)$/)?.[1];
  const page =
    meme ? <MemeView memeId={meme} /> :
    path === "/me" ? <MePage /> :
    path === "/leaderboard" ? <Board day={day} /> :
    <Markets />;
  const showResult = !dismissed && !!day?.yesterday.unseen && !!day.yesterday.mine;
  const showWelcome = !dismissed && !showResult && !!day?.me && day.me.days === 0 && !day.me.played;
  return (
    <div className="cardboard isolate flex min-h-screen flex-col pb-12">
      {page}
      <DailyBar day={day} />
      {showResult && <ResultCard day={day!} onClose={() => setDismissed(true)} />}
      {showWelcome && <Welcome day={day!} onClose={() => setDismissed(true)} />}
    </div>
  );
}

captureExternalLinks();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
