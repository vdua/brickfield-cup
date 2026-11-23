import { api, esc } from "/js/common.js";
import { main } from "./parent/state.js";
import { overview } from "./parent/overview.js";
import { activity, sessions, errors } from "./parent/history.js";
import { plan } from "./parent/plan.js";
import { questions } from "./parent/questions.js";
import { family, settings } from "./parent/family.js";

// ---------------- routing ----------------
async function route() {
  const [name, arg] = (location.hash.slice(1) || "overview").split("/");
  main.innerHTML = `<p class="empty">Loading…</p>`;
  try {
    if (name === "activity") await activity();
    else if (name === "sessions") await sessions(arg);
    else if (name === "errors") await errors();
    else if (name === "plan") await plan(arg);
    else if (name === "questions") await questions();
    else if (name === "family") await family();
    else if (name === "settings") await settings();
    else await overview();
  } catch (e) { main.innerHTML = `<p class="empty">${esc(e.message)}</p>`; }
}
addEventListener("hashchange", route);
document.getElementById("refresh").onclick = route;
document.getElementById("logout").onclick = async () => { await api("/logout", { body: {} }).catch(() => {}); location.href = "/parent-login"; };
api("/me").then((r) => { if (r.role !== "parent") location.href = "/kid"; else route(); });
