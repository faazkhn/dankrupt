import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { context, createServer, getServerPort, reddit } from "@devvit/web/server";
import type { UiResponse } from "@devvit/web/shared";
import { api } from "./api.ts";
import { ensureSeeded, postMarketDay } from "./daily.ts";
import { tick } from "./jobs.ts";
import { stageDemoTrade } from "./stage.ts";

const app = new Hono();
const internal = new Hono();

internal.post("/menu/post-create", async (c) => {
  try {
    await ensureSeeded();
    const post = await postMarketDay(Date.now(), null);
    return c.json<UiResponse>({ navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post?.id}` });
  } catch (e) {
    console.error("post create failed", e);
    return c.json<UiResponse>({ showToast: "Couldn't create the Market Day post" }, 400);
  }
});

// TEMPORARY: moderator-only screenshot staging; remove with stage.ts before the hackathon upload.
internal.post("/menu/stage-demo", async (c) => {
  try {
    const name = (context.username ?? (await reddit.getCurrentUsername()))?.toLowerCase();
    if (!name) return c.json<UiResponse>({ showToast: "Log in first" }, 400);
    await ensureSeeded();
    const avg = await stageDemoTrade(name);
    return c.json<UiResponse>({ showToast: `Staged: 1000 Tung Tung Tung Sahur bought at 50, sold at avg ${avg.toFixed(2)}` });
  } catch (e) {
    console.error("stage failed", e);
    return c.json<UiResponse>({ showToast: "Staging failed, see the log" }, 400);
  }
});

internal.post("/triggers/on-app-install", async (c) => {
  await ensureSeeded();
  await postMarketDay(Date.now(), null).catch((e) => console.error("install post failed", e));
  return c.json({ status: "success" });
});

internal.post("/scheduler/tick", async (c) => {
  await tick();
  return c.json({ status: "ok" });
});

app.route("/api", api);
app.route("/internal", internal);

serve({ fetch: app.fetch, createServer, port: getServerPort() });

