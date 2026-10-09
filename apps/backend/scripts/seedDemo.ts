/**
 * Builds a demo account with realistic data, for presentations and markers.
 *
 *   DEMO_API_URL=https://digital-logbook-backend-latest.onrender.com/api \
 *   DATABASE_URL=<the same database that API uses> \
 *   npm run seed:demo --workspace=apps/backend
 *
 * Everything is created through the real API, so the app's own rules apply —
 * entry formats and their versions, validation, reminder rules. The database
 * is touched once, only to mark the new account's email as verified, since a
 * demo account has no inbox to click the link in.
 *
 * It never changes an existing account: if the email is taken it stops. Use
 * DEMO_EMAIL to make another. Optional: DEMO_PASSWORD, DEMO_NAME.
 */
import prisma from "../src/prisma.js";

const API = (process.env.DEMO_API_URL ?? "http://localhost:3000/api").replace(/\/$/, "");
const EMAIL = process.env.DEMO_EMAIL ?? "demo@digital-logbook.app";
const PASSWORD = process.env.DEMO_PASSWORD ?? "DemoLogbook2026!";
const NAME = process.env.DEMO_NAME ?? "Demo Student";

let token = "";

async function call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} answered ${res.status}: ${text.slice(0, 300)}`);
  }
  return data as T;
}

/** A calendar day `daysAgo` before today, at a working hour, as ISO. */
function day(daysAgo: number, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

/** "YYYY-MM-DD", `daysFromNow` ahead (negative for the past). */
function dateKey(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

type Field = { id: string; name: string };

/**
 * A logged piece of past work. Entries start out open in this app (anything
 * can carry a due date), so finished history is marked done, leaving Open
 * Work holding only what is genuinely still to do.
 */
async function logDone(projectId: string, entry: Record<string, unknown>) {
  const created = await call<{ id: string }>("POST", `/projects/${projectId}/entries`, entry);
  await call("PATCH", `/entries/${created.id}/status`, { status: "DONE" });
}

async function project(name: string, description: string, tags: string[], fields: { name: string; type: string }[]) {
  const created = await call<{ id: string }>("POST", "/projects", { name, description, status: "ACTIVE", tags });
  const made: Field[] = [];
  for (const field of fields) {
    made.push(await call<Field>("POST", `/projects/${created.id}/entry-fields`, { ...field, required: true }));
  }
  return { id: created.id, field: (fieldName: string) => made.find((f) => f.name === fieldName)!.id };
}

async function main() {
  console.log(`Seeding a demo account at ${API} for ${EMAIL}…`);

  // ── The account ──
  const register = await fetch(`${API}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullName: NAME, email: EMAIL, password: PASSWORD }),
  });
  if (register.status === 409) {
    throw new Error(`${EMAIL} already has an account. Nothing was changed; set DEMO_EMAIL to make another.`);
  }
  if (!register.ok) throw new Error(`Registering answered ${register.status}: ${await register.text()}`);

  await prisma.user.update({
    where: { email: EMAIL },
    data: { isEmailVerified: true, emailVerificationToken: null, emailVerificationExpiry: null },
  });

  token = (await call<{ token: string }>("POST", "/auth/login", { email: EMAIL, password: PASSWORD })).token;
  await call("PATCH", "/me", {
    fullName: NAME,
    bio: "Third-year CS student keeping my projects and modules in one logbook.",
    degree: "BSc Computer Science",
    yearOfStudy: "3rd Year",
    studentNumber: "1234567",
  });

  // ── Projects, each with its own entry format ──
  const sdp = await project(
    "Digital Logbook (SDP)",
    "Group software design project: a digital logbook for students.",
    ["coursework", "team"],
    [{ name: "Summary", type: "TEXT" }, { name: "Focus", type: "NUMBER" }, { name: "Area", type: "TAGS" }],
  );
  const portfolio = await project(
    "Personal portfolio site",
    "A small site to show my projects to employers.",
    ["personal"],
    [{ name: "Summary", type: "TEXT" }, { name: "Shipped", type: "BOOLEAN" }],
  );
  const theory = await project(
    "Theory notes",
    "Reading and summarising for Formal Languages and Automata.",
    ["study"],
    [{ name: "Summary", type: "TEXT" }, { name: "Pages", type: "NUMBER" }],
  );

  // ── About seven weeks of entries, heaviest on the group project ──
  const sdpWork = [
    ["Sprint planning and issue triage", "planning"], ["Entry form validation", "frontend"],
    ["API tests for entries", "testing"], ["Statistics endpoint", "backend"], ["Calendar view layout", "frontend"],
    ["Fix timezone bug in due dates", "backend"], ["Client meeting notes", "planning"], ["Offline sync queue", "frontend"],
    ["Reminder rules", "backend"], ["Dashboard panels", "frontend"], ["Coverage report in CI", "testing"],
    ["Accessibility pass", "frontend"], ["Database ERD for the docs", "docs"], ["Sprint 3 reflection", "docs"],
  ];
  let n = 0;
  for (let daysAgo = 48; daysAgo >= 0; daysAgo -= daysAgo > 14 ? 3 : 2) {
    const [summary, area] = sdpWork[n % sdpWork.length];
    await logDone(sdp.id, {
      durationMinutes: 45 + ((n * 37) % 120),
      entryDate: day(daysAgo, 9 + (n % 6)),
      values: { [sdp.field("Summary")]: summary, [sdp.field("Focus")]: 3 + (n % 3), [sdp.field("Area")]: [area] },
      tags: [area],
    });
    n++;
  }

  const portfolioWork = ["Hero section and nav layout", "Project cards", "Contact form + validation", "Deploy to Pages"];
  for (let i = 0; i < portfolioWork.length; i++) {
    await logDone(portfolio.id, {
      durationMinutes: 60 + i * 25,
      entryDate: day(30 - i * 6, 19),
      values: { [portfolio.field("Summary")]: portfolioWork[i], [portfolio.field("Shipped")]: i < 2 },
      tags: ["frontend", "design"],
    });
  }

  for (let i = 0; i < 6; i++) {
    await logDone(theory.id, {
      durationMinutes: 40 + i * 10,
      entryDate: day(40 - i * 6, 14),
      values: { [theory.field("Summary")]: `Chapter ${i + 1} summary`, [theory.field("Pages")]: 12 + i * 3 },
      tags: ["reading"],
    });
  }

  // ── Open work: some coming up, one overdue, one undated; one finished ──
  const openWork: [string, number | null][] = [
    ["Record demo video for sprint review", -3],
    ["Write README testing docs", 2],
    ["Final presentation slides", 9],
    ["Refactor the entry format editor", null],
  ];
  for (const [summary, due] of openWork) {
    await call("POST", `/projects/${sdp.id}/entries`, {
      durationMinutes: 30,
      entryDate: day(1, 16),
      ...(due === null ? {} : { dueDate: dateKey(due) }),
      values: { [sdp.field("Summary")]: summary, [sdp.field("Focus")]: 4, [sdp.field("Area")]: ["docs"] },
      tags: ["docs"],
    });
  }
  await logDone(sdp.id, {
    durationMinutes: 50,
    entryDate: day(5, 11),
    dueDate: dateKey(-2),
    values: { [sdp.field("Summary")]: "Sprint 3 user feedback round", [sdp.field("Focus")]: 5, [sdp.field("Area")]: ["testing"] },
    tags: ["testing"],
  });

  // ── A saved statistic, and the dashboard showing it ──
  await call("POST", `/projects/${sdp.id}/custom-statistics`, { name: "Average focus", expression: "AVG({Focus})" });

  // ── My Grades: two modules, weighted assessments, one coming up ──
  const year = new Date().getFullYear();
  const coms = await call<{ id: string }>("POST", "/grades/modules", {
    code: "COMS3011A", name: "Software Design", academicYear: year, type: "SEMESTER", semester: 2, targetMark: 75,
  });
  for (const a of [
    { name: "Sprint 1", weight: 15, markPercent: 82 },
    { name: "Sprint 2", weight: 15, markPercent: 76 },
    { name: "Sprint 3", weight: 20, markObtained: 34, markMax: 40 },
    { name: "Final submission", weight: 30, date: dateKey(4), dateKind: "DUE" },
    { name: "Presentation", weight: 20, date: dateKey(12), dateKind: "TEST" },
  ]) {
    await call("POST", `/grades/modules/${coms.id}/assessments`, a);
  }
  const math = await call<{ id: string }>("POST", "/grades/modules", {
    code: "MATH2015", name: "Discrete Mathematics", academicYear: year, type: "SEMESTER", semester: 2, targetMark: 65,
  });
  for (const a of [
    { name: "Tutorial Test 1", weight: 10, markObtained: 14, markMax: 20 },
    { name: "Tutorial Test 2", weight: 10, date: dateKey(6), dateKind: "TEST" },
    { name: "Assignment", weight: 20, markPercent: 58 },
    { name: "Exam", weight: 60, date: dateKey(30), dateKind: "TEST" },
  ]) {
    await call("POST", `/grades/modules/${math.id}/assessments`, a);
  }

  // ── A reminder the student set themselves ──
  await call("POST", "/reminders", { title: "Book a study room for the exam", remindAt: day(-3, 9) });

  console.log("Done. Sign in with:");
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
