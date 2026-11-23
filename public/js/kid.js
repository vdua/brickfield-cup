import { logEvent } from "/js/common.js";
import { ctx } from "./kid/state.js";
import { home } from "./kid/home.js";
import { play } from "./kid/play.js";

// ---------- focus tracking (shown to the parent as "looked away") ----------
document.addEventListener("visibilitychange", () => {
  if (!ctx.I) return;
  if (document.hidden) { ctx.I.hiddenAt = Date.now(); logEvent("page_hidden", `ball ${ctx.I.i + 1}`, ctx.I.id); }
  else if (ctx.I.hiddenAt) {
    const secs = (Date.now() - ctx.I.hiddenAt) / 1000; ctx.I.away += secs; ctx.I.awayCount++; ctx.I.hiddenAt = null;
    ctx.I.t0 += secs * 1000; // don't count time away against the ball
    logEvent("page_visible", `away ${Math.round(secs)}s`, ctx.I.id);
  }
});

// ---------- routing ----------
function route() {
  document.querySelectorAll(".overlay").forEach((o) => o.remove());
  const [name, arg] = (location.hash.slice(1) || "home").split("/");
  if (name === "play" && arg) {
    if (ctx.I && ctx.I.kind === arg) return; // already batting
    play(arg);
  } else home();
}
addEventListener("hashchange", route);
logEvent("app_open", navigator.userAgent.includes("Mobile") ? "mobile" : "desktop");
route();
