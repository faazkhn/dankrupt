import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { fetchCardTrade, held } from "@/lib/card";

const fonts = Promise.all([
  readFile(join(process.cwd(), "assets/fonts/LilitaOne.ttf")),
  readFile(join(process.cwd(), "assets/fonts/Nunito.ttf")),
  readFile(join(process.cwd(), "src/app/apple-icon.png")),
]);

/** The "I called it" share image: 1200×630, cardboard and paper, percentages only. */
export async function GET(_req: Request, { params }: { params: Promise<{ account: string; memeId: string; closedAt: string }> }) {
  const { account, memeId, closedAt } = await params;
  const t = await fetchCardTrade(account, memeId, closedAt);
  const [lilita, nunito, icon] = await fonts;
  if (!t) return new Response("Not found", { status: 404 });
  const up = t.returnPct >= 0;
  const iconSrc = `data:image/png;base64,${icon.toString("base64")}`;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#c8955b", alignItems: "center", justifyContent: "center", fontFamily: "Nunito" }}>
        <div style={{ position: "absolute", top: 70, left: 0, right: 0, height: 4, background: "rgba(58,36,18,0.25)" }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 1040,
            height: 500,
            background: "#fffaf0",
            border: "8px solid #3a2412",
            borderRadius: 40,
            boxShadow: "0 16px 0 #3a2412",
            padding: "44px 56px",
            transform: "rotate(-1.5deg)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", fontFamily: "Lilita One", fontSize: 92, color: "#3a2412", lineHeight: 1 }}>{up ? "I CALLED IT" : "LESSON LEARNED"}</div>
            {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img> only */}
            <img src={iconSrc} width={110} height={110} alt="" />
          </div>
          <div style={{ display: "flex", fontFamily: "Lilita One", fontSize: 60, color: "#3a2412", marginTop: 14, lineHeight: 1.1 }}>
            {`${t.side === "short" ? "Shorted" : "Bought"} ${t.name}`}
          </div>
          <div style={{ display: "flex", alignItems: "center", marginTop: 26 }}>
            <div style={{ fontFamily: "Lilita One", fontSize: 120, color: up ? "#1d8a4a" : "#d8342c", lineHeight: 1 }}>
              {`${up ? "+" : ""}${t.returnPct.toFixed(1)}%`}
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginLeft: 36, fontSize: 32, color: "#5c3d22", fontWeight: 800 }}>
              <div>{`in ${t.avgIn.toFixed(2)} → out ${t.avgOut.toFixed(2)}`}</div>
              <div>{`held ${held(t.closedAt - t.openedAt)}`}</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "auto", fontSize: 30, fontWeight: 800, color: "#3a2412" }}>
            <div>{`@${t.account}`}</div>
            <div>{`${new Date(t.closedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Dankrupt Exchange`}</div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Lilita One", data: lilita, weight: 400, style: "normal" },
        { name: "Nunito", data: nunito, weight: 800, style: "normal" },
      ],
      headers: { "cache-control": "public, max-age=3600" },
    },
  );
}
