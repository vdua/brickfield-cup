// Validation and SQL shared by the question editor, bulk import and worksheet upload.
export const KINDS = ["practice", "before", "after", "puzzle", "diagnostic", "mock", "worksheet"];
export const INSERT_Q = "INSERT INTO questions(week, kind, topic, difficulty, prompt, answer, options, method, worksheet_id) VALUES (?,?,?,?,?,?,?,?,?)";

// Accepts the long or the short (w, k, t, d, q, a, o, m) key names.
export const normImport = (q) => ({
  week: q.week ?? q.w, kind: q.kind ?? q.k, topic: q.topic ?? q.t, difficulty: q.difficulty ?? q.d,
  prompt: q.prompt ?? q.q, answer: q.answer ?? q.a, options: q.options ?? q.o, method: q.method ?? q.m,
});

// Returns the bind values for INSERT_Q (worksheetId is null for ordinary questions). Throws on bad input.
export function cleanQ(b, worksheetId = null) {
  const kind = KINDS.includes(b.kind) ? b.kind : "practice";
  const opts = Array.isArray(b.options) && b.options.filter((o) => String(o).trim()).length >= 2 ? b.options.map(String) : null;
  if (!String(b.prompt || "").trim() || String(b.answer ?? "").trim() === "") throw new Error("Prompt and answer are required");
  if (opts && !(Number(b.answer) >= 0 && Number(b.answer) < opts.length)) throw new Error("For multiple choice, answer is the option number starting at 0");
  return [Number(b.week) || 0, kind, String(b.topic || "General").trim(), [1, 2, 3].includes(Number(b.difficulty)) ? Number(b.difficulty) : 2,
    String(b.prompt).trim(), String(b.answer).trim(), opts ? JSON.stringify(opts) : null, String(b.method || "").trim() || null, worksheetId];
}
