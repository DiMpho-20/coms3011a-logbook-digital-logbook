import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Camera, Edit2, Check, X, GraduationCap, Hash, Mail, CalendarDays,
  NotebookPen, Clock, FolderKanban, Flame, Trash2, Loader2, AlertCircle, ArrowRight,
} from "lucide-react";
import PageHeader from "../components/PageHeader";
import { api } from "../api/client";
import { getTagColor } from "../lib/tagColors";
import {
  summariseActivity, buildHeatmap, topTags, projectActivity, formatDuration, entryHeadline,
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
          className="rounded-2xl object-cover ring-4 ring-white shadow-sm bg-slate-100"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold ring-4 ring-white shadow-sm select-none"
          style={{ width: size, height: size, fontSize: size * 0.38 }}
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
            className="absolute inset-0 rounded-2xl bg-slate-900/50 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 focus:opacity-100 transition cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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

// ── Stat tile ───────────────────────────────────────────────────────────

function StatTile({
  icon: Icon, label, value, hint, tint,
}: {
  icon: typeof NotebookPen;
  label: string;
  value: string;
  hint?: string;
  tint: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center gap-2">
        <span className={`h-7 w-7 rounded-lg flex items-center justify-center ${tint}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      {/* The figure is the point of the tile, so it gets the size. */}
      <p className="mt-3 text-2xl font-bold text-slate-900 tabular-nums tracking-tight">{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ── Activity heatmap ────────────────────────────────────────────────────

/**
 * A single-hue sequential ramp, light to dark: more entries, darker square.
 *
 * Level 0 is a near-surface grey rather than the palest blue, so "nothing
 * logged" reads as absence instead of as a very small amount.
 */
const LEVEL_COLORS = ["#eef2f7", "#cde2fb", "#86b6ef", "#3987e5", "#1c5cab"];
const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

function cellTitle(cell: HeatmapCell): string {
  const date = new Date(`${cell.date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
  if (cell.count === 0) return `No entries on ${date}`;
  return `${cell.count} ${cell.count === 1 ? "entry" : "entries"} on ${date}`;
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
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1 min-w-full">
        <div className="flex gap-[3px] pl-8">
          {monthLabels.map((label, index) => (
            <div key={index} className="w-[11px] text-[10px] text-slate-400 whitespace-nowrap">
              {label}
            </div>
          ))}
        </div>
        <div className="flex gap-[3px]">
          <div className="flex flex-col gap-[3px] w-8 shrink-0">
            {WEEKDAY_LABELS.map((label, index) => (
              <div key={index} className="h-[11px] text-[10px] leading-[11px] text-slate-400">
                {label}
              </div>
            ))}
          </div>
          {grid.map((week, weekIndex) => (
            <div key={weekIndex} className="flex flex-col gap-[3px]">
              {week.map((cell) => (
                <div
                  key={cell.date}
                  // A future day is a gap in the grid, not a zero — showing it
                  // as an empty square would claim nothing was logged on a day
                  // that has not happened.
                  className={`h-[11px] w-[11px] rounded-[2px] ${cell.future ? "" : "ring-1 ring-inset ring-slate-900/5"}`}
                  style={{ backgroundColor: cell.future ? "transparent" : LEVEL_COLORS[cell.level] }}
                  title={cell.future ? undefined : cellTitle(cell)}
                  aria-hidden={cell.future ? "true" : undefined}
                  role={cell.future ? undefined : "img"}
                  aria-label={cell.future ? undefined : cellTitle(cell)}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 justify-end pt-1">
          <span className="text-[10px] text-slate-400">Less</span>
          {LEVEL_COLORS.map((color) => (
            <span
              key={color}
              className="h-[11px] w-[11px] rounded-[2px] ring-1 ring-inset ring-slate-900/5"
              style={{ backgroundColor: color }}
            />
          ))}
          <span className="text-[10px] text-slate-400">More</span>
        </div>
      </div>
    </div>
  );
}

// ── Section shell ───────────────────────────────────────────────────────

function Section({
  title, description, children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function MetaPill({ icon: Icon, children }: { icon: typeof Mail; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1">
      <Icon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      {children}
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
  const recent = useMemo(() => entries.slice(0, 5), [entries]);
  const projects = useMemo(() => projectActivity(entries, projectNames, 4), [entries, projectNames]);
  const projectCount = useMemo(
    () => new Set(entries.map((entry) => entry.projectId)).size,
    [entries]
  );

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
        <PageHeader title="Profile" subtitle="Your details and your logbook activity." />
        <div className="flex items-center gap-2 text-sm text-slate-500 py-12 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your profile…
        </div>
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profile" subtitle="Your details and your logbook activity." />
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <AlertCircle className="h-6 w-6 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-600 mt-3">{loadError}</p>
          <button
            onClick={() => void load()}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const shown = editing ? draft! : profile;
  const memberSince = new Date(profile.memberSince).toLocaleDateString(undefined, {
    month: "long", year: "numeric",
  });

  return (
    <div className="space-y-5 max-w-4xl">
      <PageHeader
        title="Profile"
        subtitle="Your details and your logbook activity."
        action={
          !editing && (
            <button
              onClick={startEditing}
              className="flex items-center gap-1.5 border border-slate-200 bg-white px-3 py-1.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              <Edit2 className="h-3.5 w-3.5" /> Edit profile
            </button>
          )
        }
      />

      {saved && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0" /> Profile saved.
        </p>
      )}

      {/* ── Identity card ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div
          className="h-28 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600"
          // A faint dot field stops the band reading as a flat block of colour.
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.22) 1px, transparent 0)",
            backgroundSize: "14px 14px",
          }}
        />

        <div className="px-5 pb-5">
          <div className="-mt-14 flex flex-col sm:flex-row sm:items-end gap-4">
            <Avatar
              src={shown.avatar}
              name={profile.fullName}
              editable={editing}
              onUpload={(avatar) => patchDraft({ avatar })}
              onError={setSaveError}
            />

            <div className="flex-1 min-w-0 sm:pb-1">
              <h2 className="text-xl font-bold text-slate-900 truncate">{profile.fullName}</h2>
              {editing ? (
                <div className="mt-1.5">
                  <input
                    type="text"
                    value={draft!.bio ?? ""}
                    onChange={(event) => patchDraft({ bio: event.target.value })}
                    maxLength={280}
                    className={`${inputClass} w-full`}
                    placeholder="A short line about what you're working on"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {(draft!.bio ?? "").length}/280
                  </p>
                </div>
              ) : profile.bio ? (
                <p className="text-sm text-slate-600 mt-1">{profile.bio}</p>
              ) : (
                <p className="text-sm text-slate-400 mt-1 italic">
                  No bio yet — add one to say what you're working on.
                </p>
              )}
            </div>
          </div>

          {/* Details */}
          {editing ? (
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
                <span className="text-[11px] text-slate-400">
                  Managed by your account — change it in Settings.
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <MetaPill icon={Mail}>{profile.email}</MetaPill>
              {(profile.degree || profile.yearOfStudy) && (
                <MetaPill icon={GraduationCap}>
                  {[profile.degree, profile.yearOfStudy].filter(Boolean).join(" · ")}
                </MetaPill>
              )}
              {profile.studentNumber && <MetaPill icon={Hash}>{profile.studentNumber}</MetaPill>}
              <MetaPill icon={CalendarDays}>Logging since {memberSince}</MetaPill>
            </div>
          )}

          {saveError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-4 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" /> {saveError}
            </p>
          )}

          {editing && (
            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100">
              {draft!.avatar && (
                <button
                  onClick={() => patchDraft({ avatar: null })}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 font-medium mr-auto transition"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove photo
                </button>
              )}
              <button
                onClick={() => { setDraft(null); setSaveError(null); }}
                disabled={saving}
                className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition disabled:opacity-50 ml-auto"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Headline numbers ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          icon={NotebookPen}
          label="Entries logged"
          value={`${summary.totalEntries}`}
          hint={summary.activeDays > 0 ? `across ${summary.activeDays} ${summary.activeDays === 1 ? "day" : "days"}` : "nothing logged yet"}
          tint="bg-blue-50 text-blue-600"
        />
        <StatTile
          icon={Clock}
          label="Time logged"
          value={formatDuration(summary.totalMinutes)}
          hint="in the last year"
          tint="bg-indigo-50 text-indigo-600"
        />
        <StatTile
          icon={FolderKanban}
          label="Projects"
          value={`${projectCount}`}
          hint={projectCount === 1 ? "with entries" : "with entries"}
          tint="bg-emerald-50 text-emerald-600"
        />
        <StatTile
          icon={Flame}
          label="Current streak"
          value={`${summary.currentStreak} ${summary.currentStreak === 1 ? "day" : "days"}`}
          hint={summary.longestStreak > 0 ? `best: ${summary.longestStreak}` : "start one today"}
          tint="bg-amber-50 text-amber-600"
        />
      </div>

      {/* ── Activity ──────────────────────────────────────────────────── */}
      <Section
        title="Activity"
        description={
          truncated
            ? "Your most recent 500 entries — earlier ones aren't counted here."
            : "Entries written over the last twelve weeks."
        }
      >
        {summary.totalEntries === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            Nothing logged yet. Your first entry will show up here.
          </p>
        ) : (
          <ActivityHeatmap grid={grid} />
        )}
      </Section>

      {/* Recent entries is the tallest panel, so the two shorter ones stack
          beside it rather than each taking a half-width card of its own. */}
      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="space-y-5">
        {/* ── Recent projects ─────────────────────────────────────────── */}
        <Section title="Recent projects" description="Where your work has been going.">
          {projects.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No projects with entries yet.</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-100 -mt-2">
                {projects.map((project) => (
                  <li key={project.projectId} className="py-2.5 flex items-center gap-3">
                    <span className="h-8 w-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                      <FolderKanban className="h-4 w-4 text-slate-400" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{project.name}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {project.entries} {project.entries === 1 ? "entry" : "entries"}
                        {project.minutes > 0 && ` · ${formatDuration(project.minutes)}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link
                to="/projects"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 mt-3 transition"
              >
                View all projects <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </Section>
          {/* ── Tags ──────────────────────────────────────────────────── */}
        <Section title="Most-used tags" description="What you label your work with.">
            {tags.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">No tags used yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const color = getTagColor(tag.name);
                  return (
                    <li key={tag.name}>
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 border"
                        style={{
                          backgroundColor: color.background,
                          color: color.foreground,
                          borderColor: color.border,
                        }}
                      >
                        {tag.name}
                        <span className="tabular-nums opacity-70">{tag.count}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
        </Section>
        </div>

        {/* ── Recent entries ──────────────────────────────────────────── */}
        <Section title="Recent entries" description="The last five things you logged.">
          {recent.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">Nothing logged yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 -my-2">
              {recent.map((entry) => {
                const project = projectNames.get(entry.projectId) ?? "Unknown project";
                const when = new Date(entry.entryDate ?? entry.createdAt).toLocaleDateString(undefined, {
                  day: "numeric", month: "short",
                });
                return (
                  <li key={entry.id} className="py-2.5 flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                        entry.status === "DONE" ? "bg-emerald-500" : "bg-amber-400"
                      }`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-800 truncate">
                        {entryHeadline(entry.values as Record<string, unknown>, project)}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">
                        {project} · {when}
                        {entry.durationMinutes > 0 && ` · ${formatDuration(entry.durationMinutes)}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
