// Shared kid-app state. Mutate via ctx.* so every module sees the same values.
export const app = document.getElementById("app");
export const bar = document.getElementById("bar");
export const ctx = { S: null, I: null, nav: 0 }; // S: /api/state, I: current innings, nav: guards slow loads
export const KIND = {
  diagnostic: { name: "Big Toss · Diagnostic", c: "var(--red)" },
  before: { name: "Toss · Before-check", c: "var(--red)" },
  practice: { name: "Nets practice", c: "var(--blue)" },
  puzzle: { name: "Spin puzzles", c: "var(--orange)" },
  revision: { name: "Replay · fix old mistakes", c: "var(--grass)" },
  after: { name: "Super over · After-check", c: "#ae3ec9" },
  worksheet: { name: "Match · Worksheet", c: "#2b8a3e" },
  mock: { name: "Mock Test Match", c: "#14213d" },
};
export const TASK_COLORS = { diagnostic: "var(--red)", before: "var(--red)", practice: "var(--blue)", puzzle: "var(--orange)", revision: "var(--grass)", after: "#7a5aa6", worksheet: "#2b8a3e" };
export const PACE = { 1: ["Spin", "2 runs"], 2: ["Medium pace", "4 runs"], 3: ["Fast bowler", "6 runs"] };
export const TIPS = [
  "Underline what the question asks for before you start. “How many MORE” is a different question from “how many”!",
  "Write the units in your answer: cm, ₹, hours. It saves silly slips.",
  "Stuck for 5 minutes? Star it, move on, come back. Even great batsmen leave some balls.",
  "Before you play the shot: is your answer sensible? Can a share be bigger than the total?",
  "For word problems, draw the bar model first. Then the numbers are easy.",
  "Check by working backwards. Put your answer back into the question.",
];
