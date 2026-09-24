interface TagFilterBarProps {
  /** Every tag available to filter by. */
  tags: string[];
  /** Currently selected tags — an item matches if it has any of these. */
  selected: string[];
  onChange: (tags: string[]) => void;
}

/** Click-to-toggle tag chips for filtering a list; supports selecting several at once. */
export default function TagFilterBar({ tags, selected, onChange }: TagFilterBarProps) {
  if (tags.length === 0) return null;

  const toggle = (tag: string) => {
    onChange(selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag]);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-0.5">
        Tags
      </span>
      {tags.map((tag) => {
        const isActive = selected.includes(tag);
        const color = getTagColor(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            aria-pressed={isActive}
            className="px-2.5 py-1 rounded-full text-xs font-medium border transition hover:brightness-95"
            style={
              isActive
                ? { backgroundColor: color.solid, color: "#ffffff", borderColor: color.solid }
                : { backgroundColor: color.background, color: color.foreground, borderColor: color.border }
            }
          >
            {tag}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-slate-400 hover:text-red-500 font-medium ml-1"
        >
          Clear
        </button>
      )}
    </div>
  );
}
import { getTagColor } from "../lib/tagColors";
