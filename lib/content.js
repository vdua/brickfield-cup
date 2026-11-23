// Shared content: the 19-week SASMO roadmap, badges and stadium stages.
// Edit freely — the API reads these on every request.

export const ROADMAP = [
  { week: 1,  start: "2026-11-23", phase: "Build",   topic: "Diagnostic + number sense",          match: "Season opener" },
  { week: 2,  start: "2026-11-30", phase: "Build",   topic: "Fractions & decimals",               match: "Fraction Fixture" },
  { week: 3,  start: "2026-12-07", phase: "Build",   topic: "Bar-model word problems",            match: "Model Method Match" },
  { week: 4,  start: "2026-12-14", phase: "Build",   topic: "Number patterns & sequences",        match: "Pattern Powerplay" },
  { week: 5,  start: "2026-12-21", phase: "Build",   topic: "Factors, multiples & divisibility",  match: "Divisibility Derby" },
  { week: 6,  start: "2026-12-28", phase: "Build",   topic: "Mock 1 + review",                    match: "Mock Test Match 1" },
  { week: 7,  start: "2027-01-04", phase: "Stretch", topic: "Percentage",                         match: "Percentage Pursuit" },
  { week: 8,  start: "2027-01-11", phase: "Stretch", topic: "Ratio (before–after)",               match: "Ratio Rivalry" },
  { week: 9,  start: "2027-01-18", phase: "Stretch", topic: "Speed, distance & time",             match: "Speed Showdown" },
  { week: 10, start: "2027-01-25", phase: "Stretch", topic: "Logic & cryptarithms",               match: "Logic League" },
  { week: 11, start: "2027-02-01", phase: "Stretch", topic: "Counting techniques",                match: "Counting Classic" },
  { week: 12, start: "2027-02-08", phase: "Stretch", topic: "Mock 2 + review",                    match: "Mock Test Match 2" },
  { week: 13, start: "2027-02-15", phase: "Stretch", topic: "Geometry: angles & areas",           match: "Geometry Grand Prix" },
  { week: 14, start: "2027-02-22", phase: "Perform", topic: "Mensuration & spatial",              match: "Cube Cup" },
  { week: 15, start: "2027-03-01", phase: "Perform", topic: "Heuristics: backwards & assumption", match: "Heuristics Hustle" },
  { week: 16, start: "2027-03-08", phase: "Perform", topic: "Mock 3 (exam conditions)",           match: "Mock Test Match 3" },
  { week: 17, start: "2027-03-15", phase: "Perform", topic: "SASMO past paper A",                 match: "Semi-final 1" },
  { week: 18, start: "2027-03-22", phase: "Perform", topic: "SASMO past paper B",                 match: "Semi-final 2" },
  { week: 19, start: "2027-03-29", phase: "Perform", topic: "Final mock + rest",                  match: "The Final" },
];

export const BADGES = [
  { code: "first_innings", name: "First Innings",    desc: "Finish your first session",                     color: "#e63946" },
  { code: "fifty",         name: "Half-Century",     desc: "Score 50 runs in one session",                  color: "#f4a261" },
  { code: "perfect_over",  name: "Perfect Over",     desc: "6 correct answers in a row",                    color: "#2a9d8f" },
  { code: "clean_sheet",   name: "Clean Sheet",      desc: "5+ questions and not a single wicket",          color: "#264653" },
  { code: "streak3",       name: "Partnership 3",    desc: "Play 3 days in a row",                          color: "#e9c46a" },
  { code: "streak7",       name: "Partnership 7",    desc: "Play 7 days in a row",                          color: "#f77f00" },
  { code: "streak14",      name: "Iron Partnership", desc: "Play 14 days in a row",                         color: "#d62828" },
  { code: "big_gain",      name: "Big Improver",     desc: "After-check beats Before-check by 2+",          color: "#6a4c93" },
  { code: "topic_master",  name: "Topic Master",     desc: "Score 6/6 in an After-check",                   color: "#1d3557" },
  { code: "comeback",      name: "Comeback King",    desc: "4+ correct in a Replay of old mistakes",        color: "#06d6a0" },
  { code: "all_rounder",   name: "All-Rounder",      desc: "Correct answers in 6 different topics",         color: "#118ab2" },
  { code: "full_match",    name: "Full Match",       desc: "Finish every mission of a week on its own day", color: "#c92a2a" },
  { code: "early_bird",    name: "Early Bird",       desc: "Answer every question of a session before 8 am", color: "#ffb703" },
  { code: "honest_review", name: "Honest Review",    desc: "Tag the reason for 10 missed questions",        color: "#8338ec" },
];

// Stadium grows with total runs (spending runs in the shop never shrinks it).
export const STADIUM = [
  { runs: 0,    name: "Empty field",      desc: "Just grass and a dream." },
  { runs: 120,  name: "The pitch",        desc: "A proper 22-yard strip with stumps." },
  { runs: 350,  name: "Pavilion",         desc: "A brick pavilion for the team." },
  { runs: 700,  name: "Grand stands",     desc: "Seats for the crowd." },
  { runs: 1200, name: "Floodlights",      desc: "Day-night matches unlocked." },
  { runs: 1900, name: "Giant scoreboard", desc: "Your runs in lights." },
  { runs: 2800, name: "Trophy room",      desc: "Ready for SASMO. Champion stadium!" },
];

export const RUNS_FOR = { 1: 2, 2: 4, 3: 6 }; // difficulty -> runs for a correct answer
export const MISTAKES = ["careless", "method", "misread", "guess"];
export const EVENT_TYPES = ["app_open", "page_hidden", "page_visible", "session_quit", "reaction", "sound_toggle", "view"];
