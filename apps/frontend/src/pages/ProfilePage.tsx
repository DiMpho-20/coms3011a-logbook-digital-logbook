import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Camera, Edit2, Check, X, Hash, Mail, CalendarDays,
  Trash2, Loader2, AlertCircle, ArrowRight,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import Skeleton from "../components/Skeleton";
import Stat from "../components/Stat";
import { api } from "../api/client";
import { button } from "../lib/ui";
import { countdownLabel, daysUntil } from "../lib/gradeDisplay";
import { localDateKey } from "../lib/utils";
import {
  summariseActivity, buildHeatmap, topTags, projectActivity, formatDuration,
  type ActivityEntry, type HeatmapCell,
} from "../lib/profileActivity";

// ── Types ───────────────────────────────────────────────────────────────

interface Profile {
  id: string;
  email: string;
  fullName: string;
  bio: string | null;
  avatar: string | null;
  studentNumber: string | null;
  degree: string | null;
  yearOfStudy: string | null;
  memberSince: string;
}

/** Only the fields the student may change — name and email belong to auth. */
type EditableProfile = Pick<Profile, "bio" | "avatar" | "studentNumber" | "degree" | "yearOfStudy">;

const YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year", "Postgraduate"];

/**
 * The activity window.
 *
 * The listing endpoint caps a page at 500 entries, so the profile asks for a
 * year and says so rather than implying it has counted everything ever
 * written. Six months of squares is what the grid shows.
 */
const ACTIVITY_DAYS = 365;
/**
 * Twelve weeks, not the half year it started as.
 *
 * The grid holds the same entries either way — a shorter window simply stops
 * a term's work being spread so thin that a real week of logging reads as
 * noise. Widen it once a logbook has a year in it.
 */
const HEATMAP_WEEKS = 12;
const ENTRY_LIMIT = 500;

// ── Avatar ──────────────────────────────────────────────────────────────

/** Bigger than it renders, so it stays sharp on a high-density screen. */
const AVATAR_PX = 256;

/**
 * Shrink a chosen photo to a square before it ever leaves the browser.
 *
 * A phone photo is several megabytes and would be stored, sent and re-sent on
 * every page load. Downscaling to 256px and re-encoding as JPEG brings it to
 * a few tens of kilobytes, which is why the column can hold a data URL at all.
 */
function downscaleToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("That file is not an image we can read."));
      image.onload = () => {
        const side = Math.min(image.width, image.height);
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_PX;
        canvas.height = AVATAR_PX;
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("This browser could not process the image."));
          return;
        }
        // White underneath: a transparent PNG would otherwise come out black
        // once it is re-encoded as JPEG.
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, AVATAR_PX, AVATAR_PX);
        // Centre crop to a square so a portrait photo is not squashed.
        context.drawImage(
          image,
          (image.width - side) / 2, (image.height - side) / 2, side, side,
          0, 0, AVATAR_PX, AVATAR_PX
        );
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      image.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function Avatar({
  src, name, size = 112, editable, onUpload, onError,
}: {
  src: string | null;
  name: string;
  size?: number;
  editable?: boolean;
  onUpload?: (dataUrl: string) => void;
  onError?: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset immediately so choosing the same file twice still fires a change.
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      onError?.("Choose an image file.");
      return;
    }
    try {
      onUpload?.(await downscaleToDataUrl(file));
    } catch (error: any) {
      onError?.(error?.message ?? "That image could not be used.");
    }
  };

  return (
    <div className="relative group shrink-0" style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={`${name}'s profile photo`}
          className="rounded-xl object-cover border border-slate-200 bg-slate-100"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 font-semibold select-none"
          style={{ width: size, height: size, fontSize: size * 0.4 }}
          aria-hidden="true"
        >
          {initial}
        </div>
      )}
      {editable && (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 rounded-xl bg-slate-900/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Camera className="h-5 w-5 text-white" />
            <span className="text-[11px] font-medium text-white">Change</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
            aria-label="Upload a profile photo"
          />
        </>
      )}
    </div>
  );
}

// ── Activity heatmap ────────────────────────────────────────────────────

/**
 * Five steps of the accent colour, from nothing to the busiest band. The
 * cells take the accent through currentColor (the wrapper's accent-recoloured
 * text class), so they follow the Settings choice and stay legible in dark
 * mode; level 0 is the neutral surface, so "nothing" reads as absence.
 */
const LEVEL_OPACITY = [0, 0.25, 0.45, 0.7, 1];
const LEVEL_WORDS = ["none", "1 entry", "2 entries", "3–4 entries", "5 or more"];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function cellTitle(cell: HeatmapCell): string {
  const date = new Date(`${cell.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
  if (cell.count === 0) return `No entries on ${date}`;
  return `${cell.count} ${cell.count === 1 ? "entry" : "entries"} on ${date}`;
}

function HeatCell({ level, title }: { level: number; title?: string }) {
  return (
    <span
      className="relative block h-3.5 w-3.5 overflow-hidden rounded-[3px] bg-slate-100"
      title={title}
      role={title ? "img" : undefined}
      aria-label={title}
    >
      {level > 0 && <span className="absolute inset-0 bg-current" style={{ opacity: LEVEL_OPACITY[level] }} />}
    </span>
  );
}

function ActivityHeatmap({ grid }: { grid: HeatmapCell[][] }) {
  // Month labels sit above the first column in which that month begins.
  const monthLabels = grid.map((week, index) => {
    const first = new Date(`${week[0].date}T00:00:00`);
    const previous = index > 0 ? new Date(`${grid[index - 1][0].date}T00:00:00`) : null;
    const isNewMonth = !previous || previous.getMonth() !== first.getMonth();
    return isNewMonth ? first.toLocaleDateString(undefined, { month: "short" }) : "";
  });

  return (
    // The grid scrolls inside itself on a narrow screen; the page never does.
    <div className="overflow-x-auto text-blue-600">
      <div className="inline-flex min-w-max flex-col gap-1">
        <div className="flex gap-1 pl-9" aria-hidden="true">
          {monthLabels.map((label, index) => (
            <div key={index} className="w-3.5 whitespace-nowrap text-[11px] text-slate-500">{label}</div>
          ))}
        </div>
        <div className="flex gap-1">
          <div className="flex w-8 shrink-0 flex-col gap-1" aria-hidden="true">
            {WEEKDAY_LABELS.map((label, index) => (
              <div key={index} className="h-3.5 text-[11px] leading-[14px] text-slate-500">{label}</div>
            ))}
          </div>
          {grid.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-1">
              {week.map((cell) =>
                // A future day is a gap in the grid, not a zero: it hasn't happened.
                cell.future ? (
                  <span key={cell.date} className="block h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <HeatCell key={cell.date} level={cell.level} title={cellTitle(cell)} />
                )
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-1.5 pt-2" aria-label="Legend: lighter is fewer entries, darker is more">
          <span className="text-[11px] text-slate-500">Less</span>
          {LEVEL_OPACITY.map((_, level) => (
            <HeatCell key={level} level={level} title={LEVEL_WORDS[level]} />
          ))}
          <span className="text-[11px] text-slate-500">More</span>
        </div>
      </div>
    </div>
  );
}

// ── Section shell ───────────────────────────────────────────────────────

function Section({
  title, description, action, children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetaItem({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-slate-600">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

const inputClass =
  "border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition";

// ── Page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<EditableProfile | null>(null);
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [projectNames, setProjectNames] = useState<Map<string, string>>(new Map());

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const editing = draft !== null;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const since = new Date();
      since.setDate(since.getDate() - ACTIVITY_DAYS);

      // The profile is what the page is for; the activity is decoration on
      // top of it. Fetched together, but a failed activity request leaves the
      // card standing rather than blanking the whole page.
      const [profileResponse, entriesResponse, projectsResponse] = await Promise.allSettled([
        api.get<Profile>("/me"),
        api.get("/entries", {
          params: { limit: ENTRY_LIMIT, archived: "include", from: since.toISOString() },
        }),
        api.get("/projects"),
      ]);

      if (profileResponse.status === "rejected") throw profileResponse.reason;
      setProfile(profileResponse.value.data);

      if (entriesResponse.status === "fulfilled") {
        const payload = entriesResponse.value.data;
        setEntries(Array.isArray(payload) ? payload : payload.entries ?? []);
        setTruncated(Boolean(payload?.truncated));
      }
      if (projectsResponse.status === "fulfilled") {
        const projects = projectsResponse.value.data;
        const list = Array.isArray(projects) ? projects : projects.projects ?? [];
        setProjectNames(new Map(list.map((p: any) => [p.id, p.name])));
      }
    } catch (error: any) {
      setLoadError(error?.response?.data?.error ?? "Your profile could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(() => summariseActivity(entries), [entries]);
  const grid = useMemo(() => buildHeatmap(summary.byDay, new Date(), HEATMAP_WEEKS), [summary.byDay]);
  const tags = useMemo(() => topTags(entries, 8), [entries]);
  const projects = useMemo(() => projectActivity(entries, projectNames, 4), [entries, projectNames]);
  // What the visible twelve weeks hold, worded from the grid itself.
  const heatmapTotals = useMemo(() => {
    const cells = grid.flat().filter((cell) => !cell.future);
    return {
      entries: cells.reduce((sum, cell) => sum + cell.count, 0),
      days: cells.filter((cell) => cell.count > 0).length,
    };
  }, [grid]);
  const today = localDateKey(new Date());

  const startEditing = () => {
    if (!profile) return;
    setSaveError(null);
    setDraft({
      bio: profile.bio,
      avatar: profile.avatar,
      studentNumber: profile.studentNumber,
      degree: profile.degree,
      yearOfStudy: profile.yearOfStudy,
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data } = await api.patch<Profile>("/me", draft);
      setProfile(data);
      setDraft(null);
      setSaved(true);
      // The sidebar still reads the photo from localStorage; the server is the
      // source of truth, this only keeps that copy from going stale until the
      // sidebar reads the profile itself.
      if (data.avatar) localStorage.setItem("logbook-avatar", data.avatar);
      else localStorage.removeItem("logbook-avatar");
      window.setTimeout(() => setSaved(false), 2500);
    } catch (error: any) {
      setSaveError(error?.response?.data?.error ?? "Your changes could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const patchDraft = (patch: Partial<EditableProfile>) =>
    setDraft((previous) => (previous ? { ...previous, ...patch } : previous));

  // ── Loading and failure ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profile" subtitle="Who you are, and what you\u2019ve been working on." />
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex items-center gap-5" aria-busy="true">
          <span className="sr-only" role="status">Loading your profile…</span>
          <Skeleton className="h-20 w-20 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profile" subtitle="Who you are, and what you\u2019ve been working on." />
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <AlertCircle className="h-6 w-6 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-600 mt-3">{loadError}</p>
          <button onClick={() => void load()} className={`${button("secondary", "sm")} mt-4`}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  const shown = editing ? draft! : profile;
  // The account's creation date: when this logbook began, not the first entry.
  const memberSince = new Date(profile.memberSince).toLocaleDateString(undefined, {
    month: "long", year: "numeric",
  });
  // The figures cover what the profile loaded: up to a year, at most 500 entries.
  const coverage = truncated ? "most recent 500 entries" : "in the last year";

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader title="Profile" subtitle="Who you are, and what you’ve been working on." />

      {saved && (
        <p role="status" className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> Profile saved.
        </p>
      )}

      {/* ── 1. Identity ───────────────────────────────────────────────── */}
      <section aria-labelledby="profile-name" className="bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar
            src={shown.avatar}
            name={profile.fullName}
            size={72}
            editable={editing}
            onUpload={(avatar) => patchDraft({ avatar })}
            onError={setSaveError}
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 id="profile-name" className="text-xl font-semibold text-slate-900 break-words">{profile.fullName}</h2>
                {!editing && (profile.degree || profile.yearOfStudy) && (
                  <p className="text-sm text-slate-600">{[profile.degree, profile.yearOfStudy].filter(Boolean).join(" · ")}</p>
                )}
              </div>
              {!editing && (
                <button onClick={startEditing} className={button("secondary", "sm")}>
                  <Edit2 className="h-3.5 w-3.5" aria-hidden="true" /> Edit profile
                </button>
              )}
            </div>

            {editing ? (
              <div className="mt-2">
                <label className="sr-only" htmlFor="profile-bio">Bio</label>
                <input
                  id="profile-bio"
                  type="text"
                  value={draft!.bio ?? ""}
                  onChange={(event) => patchDraft({ bio: event.target.value })}
                  maxLength={280}
                  className={`${inputClass} w-full`}
                  placeholder="A short line about what you're working on"
                />
                <p className="text-[11px] text-slate-500 mt-1">{(draft!.bio ?? "").length}/280</p>
              </div>
            ) : profile.bio ? (
              <p className="mt-2 text-sm text-slate-700">{profile.bio}</p>
            ) : (
              <p className="mt-2 text-sm italic text-slate-500">No bio yet. Add one to say what you're working on.</p>
            )}

            {!editing && (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                <MetaItem icon={Mail}>{profile.email}</MetaItem>
                {profile.studentNumber && <MetaItem icon={Hash}>{profile.studentNumber}</MetaItem>}
                <MetaItem icon={CalendarDays}>Member since {memberSince}</MetaItem>
              </div>
            )}
          </div>
        </div>

        {/* Details, while editing */}
        {editing && (
          <div className="mt-5 pt-4 border-t border-slate-100 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Degree</span>
              <input
                type="text"
                value={draft!.degree ?? ""}
                onChange={(event) => patchDraft({ degree: event.target.value })}
                maxLength={120}
                className={inputClass}
                placeholder="e.g. BSc Computer Science"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Year of study</span>
              <select
                value={draft!.yearOfStudy ?? ""}
                onChange={(event) => patchDraft({ yearOfStudy: event.target.value })}
                className={inputClass}
              >
                <option value="">Not set</option>
                {YEARS.map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Student number</span>
              <input
                type="text"
                value={draft!.studentNumber ?? ""}
                onChange={(event) => patchDraft({ studentNumber: event.target.value })}
                maxLength={32}
                className={inputClass}
                placeholder="Optional"
              />
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-600">Email</span>
              <p className="text-sm text-slate-500 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg truncate">
                {profile.email}
              </p>
              <span className="text-[11px] text-slate-500">Managed by your account — change it in Settings.</span>
            </div>
          </div>
        )}

        {saveError && (
          <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {saveError}
          </p>
        )}

        {editing && (
          <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-slate-100">
            {draft!.avatar && (
              <button
                onClick={() => patchDraft({ avatar: null })}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 font-medium mr-auto transition"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove photo
              </button>
            )}
            <button
              onClick={() => { setDraft(null); setSaveError(null); }}
              disabled={saving}
              className={`${button("secondary", "sm")} ml-auto`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> Cancel
            </button>
            <button onClick={() => void handleSave()} disabled={saving} className={button("primary", "sm")}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        )}

        {/* Compact figures, from the same activity summary as before. */}
        <div className="mt-5 grid grid-cols-3 gap-4 border-t border-slate-100 pt-4">
          <Stat
            label="Entries"
            value={summary.totalEntries.toLocaleString()}
            hint={summary.activeDays > 0 ? `on ${summary.activeDays} ${summary.activeDays === 1 ? "day" : "days"}, ${coverage}` : "nothing logged yet"}
          />
          <Stat label="Logged" value={formatDuration(summary.totalMinutes)} hint={coverage} />
          <Stat
            label="Streak"
            value={`${summary.currentStreak} ${summary.currentStreak === 1 ? "day" : "days"}`}
            hint={summary.longestStreak > 0 ? `best ${summary.longestStreak}` : "no entries yet"}
          />
        </div>
      </section>

      {/* ── 2. Activity ───────────────────────────────────────────────── */}
      <Section
        title="Activity"
        description={
          truncated
            ? "Entries written over the last twelve weeks, from your most recent 500 entries."
            : "Entries written over the last twelve weeks."
        }
      >
        {summary.totalEntries === 0 ? (
          <p className="text-sm text-slate-500 py-4">Nothing logged yet. Your first entry will show up here.</p>
        ) : (
          <>
            <ActivityHeatmap grid={grid} />
            <p className="mt-2 text-xs text-slate-500">
              {heatmapTotals.entries === 0
                ? "No entries in these twelve weeks."
                : `${heatmapTotals.entries} ${heatmapTotals.entries === 1 ? "entry" : "entries"} on ${heatmapTotals.days} ${heatmapTotals.days === 1 ? "day" : "days"} in these twelve weeks.`}
            </p>
          </>
        )}
      </Section>

      {/* ── 3. Recent projects + tags ─────────────────────────────────── */}
      <div className="grid gap-5 md:grid-cols-2 items-start">
        <Section
          title="Recent projects"
          description="Where your work has been going."
          action={
            <Link to="/projects" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
              All projects <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          }
        >
          {projects.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">No projects with entries yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 -my-2">
              {projects.map((project) => (
                <li key={project.projectId} className="py-2.5">
                  <Link to={`/projects/${project.projectId}`} className="block rounded hover:text-blue-700">
                    <span className="block truncate text-sm font-medium text-slate-900">{project.name}</span>
                    <span className="block text-xs text-slate-500 tabular-nums">
                      {project.entries} {project.entries === 1 ? "entry" : "entries"}
                      {project.minutes > 0 && ` · ${formatDuration(project.minutes)}`}
                      {` · ${countdownLabel(daysUntil(project.lastActivity, today)).toLowerCase()}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Tags" description="How you label your work.">
          {tags.length === 0 ? (
            <p className="text-sm text-slate-500 py-2">No tags used yet.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li key={tag.name}>
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700">
                    {tag.name}
                    <span className="tabular-nums text-slate-500" aria-label={`${tag.count} ${tag.count === 1 ? "entry" : "entries"}`}>
                      {tag.count}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
