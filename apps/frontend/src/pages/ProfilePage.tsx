import { useState, useRef } from "react";
import { Camera, Edit2, Check, X, GraduationCap, Hash } from "lucide-react";
import PageHeader from "../components/PageHeader";

interface ProfileData {
  name: string;
  email: string;
  bio: string;
  avatar: string;
  studentNumber: string;
  degree: string;
  year: string;
}

function loadProfile(): ProfileData {
  return {
    name: localStorage.getItem("logbook-name") || "Student",
    email: localStorage.getItem("logbook-email") || "",
    bio: localStorage.getItem("logbook-bio") || "",
    avatar: localStorage.getItem("logbook-avatar") || "",
    studentNumber: localStorage.getItem("logbook-studentNumber") || "",
    degree: localStorage.getItem("logbook-degree") || "",
    year: localStorage.getItem("logbook-year") || "",
  };
}

function saveProfile(data: ProfileData) {
  // name and email are managed by auth — only save editable fields
  localStorage.setItem("logbook-bio", data.bio);
  localStorage.setItem("logbook-avatar", data.avatar);
  localStorage.setItem("logbook-studentNumber", data.studentNumber);
  localStorage.setItem("logbook-degree", data.degree);
  localStorage.setItem("logbook-year", data.year);
}

function handleFileRead(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Avatar component ────────────────────────────────────────────────────

function Avatar({
  src,
  name,
  size = 96,
  editable,
  onUpload,
}: {
  src: string;
  name: string;
  size?: number;
  editable?: boolean;
  onUpload?: (dataUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initial = name.charAt(0).toUpperCase();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be under 2 MB.");
      return;
    }
    const dataUrl = await handleFileRead(file);
    onUpload?.(dataUrl);
  };

  return (
    <div className="relative group" style={{ width: size, height: size }}>
      {src ? (
        <img
          src={src}
          alt={name}
          className="rounded-full object-cover border-2 border-slate-200"
          style={{ width: size, height: size }}
        />
      ) : (
        <div
          className="rounded-full bg-blue-600 flex items-center justify-center text-white font-bold border-2 border-blue-200"
          style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          {initial}
        </div>
      )}
      {editable && (
        <>
          <button
            onClick={() => inputRef.current?.click()}
            className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer"
            aria-label="Change avatar"
          >
            <Camera className="h-5 w-5 text-white" />
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </>
      )}
    </div>
  );
}

// ── Profile page ────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData>(loadProfile);
  const [draft, setDraft] = useState<ProfileData>(loadProfile);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveProfile(draft);
    setProfile(draft);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleCancel = () => {
    setDraft(profile);
    setEditing(false);
  };

  const handleAvatarUpload = (dataUrl: string) => {
    setDraft((prev) => ({ ...prev, avatar: dataUrl }));
  };

  const handleRemoveAvatar = () => {
    setDraft((prev) => ({ ...prev, avatar: "" }));
  };

  const hasDetails =
    profile.degree || profile.year || profile.studentNumber;

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Profile"
        subtitle="Your personal information and academic details."
      />

      {/* Profile card */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        {/* Cover strip */}
        <div className="h-24 bg-gradient-to-r from-blue-600 to-blue-500" />

        {/* Avatar + info */}
        <div className="px-6 pb-6">
          <div className="-mt-12 flex items-end gap-4">
            <Avatar
              src={editing ? draft.avatar : profile.avatar}
              name={editing ? draft.name : profile.name}
              size={96}
              editable={editing}
              onUpload={handleAvatarUpload}
            />
            <div className="pb-1 flex-1 min-w-0">
              <h2 className="text-lg font-bold text-slate-900 truncate">
                {profile.name}
              </h2>
              {editing ? (
                <input
                  type="text"
                  value={draft.bio}
                  onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                  className="text-sm text-slate-500 border-b border-slate-300 outline-none bg-transparent w-full mt-1 pb-0.5"
                  placeholder="Add a short bio or slogan..."
                />
              ) : (
                profile.bio ? (
                  <p className="text-sm text-slate-500 mt-0.5 italic truncate">
                    &ldquo;{profile.bio}&rdquo;
                  </p>
                ) : (
                  <p className="text-sm text-slate-400 mt-0.5 italic">
                    No bio yet — click Edit Profile to add one
                  </p>
                )
              )}
            </div>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50 transition shrink-0"
              >
                <Edit2 className="h-3.5 w-3.5" /> Edit Profile
              </button>
            )}
          </div>

          {/* Detail rows */}
          <div className="mt-4 space-y-2 text-sm">
            {/* Email (read-only from auth) */}
            <div className="flex items-center gap-2 text-slate-600">
              <span className="text-slate-400">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </span>
              <span>{profile.email || "No email set"}</span>
            </div>

            {/* Degree + Year */}
            {(editing || hasDetails) && (
              <div className="flex items-center gap-2 text-slate-600">
                <GraduationCap className="h-4 w-4 text-slate-400 shrink-0" />
                {editing ? (
                  <div className="flex gap-2 flex-1">
                    <input
                      type="text"
                      value={draft.degree}
                      onChange={(e) => setDraft({ ...draft, degree: e.target.value })}
                      className="border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 flex-1"
                      placeholder="e.g. BSc Computer Science"
                    />
                    <select
                      value={draft.year}
                      onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                      className="border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">Year...</option>
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                      <option value="Postgraduate">Postgraduate</option>
                    </select>
                  </div>
                ) : (
                  <span>
                    {[profile.degree, profile.year].filter(Boolean).join(" \u2022 ")}
                  </span>
                )}
              </div>
            )}

            {/* Student number */}
            {(editing || profile.studentNumber) && (
              <div className="flex items-center gap-2 text-slate-600">
                <Hash className="h-4 w-4 text-slate-400 shrink-0" />
                {editing ? (
                  <input
                    type="text"
                    value={draft.studentNumber}
                    onChange={(e) =>
                      setDraft({ ...draft, studentNumber: e.target.value })
                    }
                    className="border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 flex-1"
                    placeholder="Student number (optional)"
                  />
                ) : (
                  <span>{profile.studentNumber}</span>
                )}
              </div>
            )}
          </div>

          {/* Edit mode: show student number field if not already visible */}
          {editing && !profile.studentNumber && !draft.studentNumber && (
            <div className="mt-2">
              <div className="flex items-center gap-2 text-slate-600">
                <Hash className="h-4 w-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={draft.studentNumber}
                  onChange={(e) =>
                    setDraft({ ...draft, studentNumber: e.target.value })
                  }
                  className="border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 flex-1"
                  placeholder="Student number (optional)"
                />
              </div>
            </div>
          )}

          {/* Edit mode: degree + year if not already visible */}
          {editing && !hasDetails && !draft.degree && (
            <div className="mt-2">
              <div className="flex items-center gap-2 text-slate-600">
                <GraduationCap className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="flex gap-2 flex-1">
                  <input
                    type="text"
                    value={draft.degree}
                    onChange={(e) => setDraft({ ...draft, degree: e.target.value })}
                    className="border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500 flex-1"
                    placeholder="e.g. BSc Computer Science"
                  />
                  <select
                    value={draft.year}
                    onChange={(e) => setDraft({ ...draft, year: e.target.value })}
                    className="border border-slate-200 rounded-md px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Year...</option>
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                    <option value="Postgraduate">Postgraduate</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Edit actions */}
          {editing && (
            <div className="flex items-center gap-2 mt-5 pt-4 border-t border-slate-100">
              {draft.avatar && (
                <button
                  onClick={handleRemoveAvatar}
                  className="text-xs text-red-500 hover:text-red-600 font-medium mr-auto"
                >
                  Remove photo
                </button>
              )}
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
              <button
                onClick={handleSave}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition"
              >
                {saved ? <Check className="h-3.5 w-3.5" /> : null}
                Save Changes
              </button>
            </div>
          )}

          {saved && !editing && (
            <p className="text-xs text-emerald-600 font-medium mt-3 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" /> Profile updated successfully.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
