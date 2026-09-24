interface TagListProps {
  tags: string[] | undefined;
  className?: string;
}

/** Read-only chip list for displaying a project's or entry's tags. */
export default function TagList({ tags, className }: TagListProps) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ""}`}>
      {tags.map((tag) => {
        const color = getTagColor(tag);
        return (
          <span
            key={tag}
            className="px-2 py-0.5 rounded-md text-[11px] font-medium border"
            style={{ backgroundColor: color.background, color: color.foreground, borderColor: color.border }}
          >
            {tag}
          </span>
        );
      })}
    </div>
  );
}
import { getTagColor } from "../lib/tagColors";
