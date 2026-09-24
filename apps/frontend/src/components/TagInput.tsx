import { forwardRef, useImperativeHandle, useMemo, useState } from "react";
import { X } from "lucide-react";
import { getTagColor } from "../lib/tagColors";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Known tag names to suggest, e.g. the user's existing tag vocabulary. */
  suggestions?: string[];
  placeholder?: string;
}

export interface TagInputHandle {
  /**
   * The committed tags plus whatever's still typed but not yet submitted.
   * Call this at submit time instead of reading `value` directly — clicking
   * a submit button blurs this input in the same tick, and that blur's
   * commit hasn't reached `value` yet when the form's submit handler runs.
   */
  getValue: () => string[];
}

/** Chip-style tag editor: type + Enter/comma to add, click × or Backspace to remove. */
const TagInput = forwardRef<TagInputHandle, TagInputProps>(function TagInput(
  { value, onChange, suggestions = [], placeholder },
  ref
) {
  const [draft, setDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => {
        const pending = draft.trim();
        if (!pending) return value;
        const exists = value.some((t) => t.toLowerCase() === pending.toLowerCase());
        return exists ? value : [...value, pending];
      },
    }),
    [value, draft]
  );

  const addTag = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    const exists = value.some((t) => t.toLowerCase() === name.toLowerCase());
    if (!exists) onChange([...value, name]);
    setDraft("");
  };

  const removeTag = (name: string) => {
    onChange(value.filter((t) => t !== name));
  };

  const filteredSuggestions = useMemo(() => {
    const query = draft.trim().toLowerCase();
    return suggestions
      .filter((s) => !value.some((t) => t.toLowerCase() === s.toLowerCase()))
      .filter((s) => !query || s.toLowerCase().includes(query))
      .slice(0, 6);
  }, [suggestions, value, draft]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1.5 w-full border border-slate-200 rounded-lg px-2 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
        {value.map((tag) => {
          const color = getTagColor(tag);
          return (
            <span
              key={tag}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md text-xs font-medium border"
              style={{ backgroundColor: color.background, color: color.foreground, borderColor: color.border }}
            >
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="p-0.5 rounded-full hover:bg-black/10 transition"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            // Commit a partially typed tag, and let a suggestion click register first.
            setTimeout(() => setShowSuggestions(false), 100);
            if (draft.trim()) addTag(draft);
          }}
          placeholder={value.length === 0 ? placeholder ?? "Add a tag…" : ""}
          className="flex-1 min-w-[80px] border-none outline-none text-sm text-slate-800 py-0.5 bg-transparent"
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg py-1 max-h-40 overflow-y-auto">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(s)}
              className="w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});

export default TagInput;
