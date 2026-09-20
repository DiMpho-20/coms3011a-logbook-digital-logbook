interface TagListProps {
  tags: string[] | undefined;
  className?: string;
}

/** Read-only chip list for displaying a project's or entry's tags. */
export default function TagList({ tags, className }: TagListProps) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className ?? ""}`}>
      {tags.map((tag) => (
        <span
          key={tag}
          className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
