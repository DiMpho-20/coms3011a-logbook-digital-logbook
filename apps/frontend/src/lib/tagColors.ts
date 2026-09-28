export interface TagColor {
  background: string;
  foreground: string;
  border: string;
  solid: string;
}

// Intentionally excludes red: tags should be visually distinct from errors,
// overdue states, and destructive actions throughout the app.
const TAG_COLORS: TagColor[] = [
  { background: "#dbeafe", foreground: "#1d4ed8", border: "#93c5fd", solid: "#2563eb" },
  { background: "#cffafe", foreground: "#0e7490", border: "#67e8f9", solid: "#0891b2" },
  { background: "#d1fae5", foreground: "#047857", border: "#6ee7b7", solid: "#059669" },
  { background: "#ede9fe", foreground: "#6d28d9", border: "#c4b5fd", solid: "#7c3aed" },
  { background: "#fef3c7", foreground: "#92400e", border: "#fcd34d", solid: "#d97706" },
  { background: "#ffedd5", foreground: "#9a3412", border: "#fdba74", solid: "#ea580c" },
  { background: "#ecfccb", foreground: "#3f6212", border: "#bef264", solid: "#65a30d" },
  { background: "#e0e7ff", foreground: "#3730a3", border: "#a5b4fc", solid: "#4f46e5" },
];

const STORAGE_KEY = "logbook-tag-colors";
let assignments: Record<string, number> | null = null;

function tagKey(name: string) {
  return name.trim().toLocaleLowerCase();
}

function loadAssignments(): Record<string, number> {
  if (assignments) return assignments;
  if (typeof window === "undefined") return {};

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    const loaded = Object.entries(saved).reduce<Record<string, number>>(
      (validAssignments, [key, value]) => {
        if (typeof value === "number" && value >= 0 && value < TAG_COLORS.length) {
          validAssignments[key] = value;
        }
        return validAssignments;
      },
      {},
    );
    assignments = loaded;
    return loaded;
  } catch {
    assignments = {};
  }
  return {};
}

function saveAssignments() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  } catch {
    // Colour choices are a visual preference, so private-mode storage failures
    // should never prevent someone from using tags.
  }
}

/**
 * Gives a tag a random non-red colour, then remembers that choice so the same
 * tag keeps its colour across lists, forms, and future visits.
 */
export function getTagColor(name: string): TagColor {
  const savedAssignments = loadAssignments();
  const key = tagKey(name);
  const existing = savedAssignments[key];
  if (existing !== undefined) return TAG_COLORS[existing];

  // Use every colour once before repeating one, keeping a user's tags varied.
  const used = new Set(Object.values(savedAssignments));
  const choices = TAG_COLORS.map((_, index) => index).filter(
    (index) => !used.has(index),
  );
  const pool = choices.length > 0 ? choices : TAG_COLORS.map((_, index) => index);
  const choice = pool[Math.floor(Math.random() * pool.length)];

  savedAssignments[key] = choice;
  assignments = savedAssignments;
  saveAssignments();
  return TAG_COLORS[choice];
}
