import { useState } from "react";
import { X } from "lucide-react";

interface ChecklistItem {
  label: string;
  checked: boolean;
}

interface ChecklistInputProps {
  value: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}

/** Interactive checklist: check items off, edit a label in place, add/remove items. */
export default function ChecklistInput({ value, onChange }: ChecklistInputProps) {
  const [draft, setDraft] = useState("");

  const addItem = () => {
    const label = draft.trim();
    if (!label) return;
    onChange([...value, { label, checked: false }]);
    setDraft("");
  };

  const toggleItem = (index: number) => {
    onChange(value.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item)));
  };

  const updateLabel = (index: number, label: string) => {
    onChange(value.map((item, i) => (i === index ? { ...item, label } : item)));
  };

  const removeItem = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <div className="border border-slate-200 rounded-lg px-2 py-1.5 space-y-1">
      {value.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.checked}
            onChange={() => toggleItem(i)}
            className="rounded shrink-0"
            aria-label={`Mark "${item.label}" ${item.checked ? "not done" : "done"}`}
          />
          <input
            type="text"
            value={item.label}
            onChange={(e) => updateLabel(i, e.target.value)}
            className={`flex-1 min-w-0 text-sm border-none outline-none bg-transparent ${
              item.checked ? "line-through text-slate-400" : "text-slate-800"
            }`}
          />
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="p-0.5 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition shrink-0"
            aria-label={`Remove "${item.label}"`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <span className="w-4 shrink-0" />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItem();
            }
          }}
          placeholder="Add checklist item, press Enter"
          className="flex-1 min-w-0 text-sm border-none outline-none bg-transparent placeholder:text-slate-400"
        />
      </div>
    </div>
  );
}
