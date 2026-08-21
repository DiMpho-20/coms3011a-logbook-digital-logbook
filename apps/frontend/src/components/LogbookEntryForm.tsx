import { useState } from "react";
import type { EntryField } from "./entryTypes";

interface LogbookEntryFormProps {
  projectName: string;
  fields: EntryField[];
  onSave: (values: Record<string, string | number | boolean>) => void;
}

function LogbookEntryForm({
  projectName,
  fields,
  onSave,
}: LogbookEntryFormProps) {
  const [values, setValues] = useState<
    Record<string, string | number | boolean>
  >({});
  const [message, setMessage] = useState("");

  const handleChange = (
    field: EntryField,
    value: string | number | boolean
  ) => {
    setValues((current) => ({
      ...current,
      [field.id]: value,
    }));

    setMessage("");
  };

  const handleSubmit = () => {
    for (const field of fields) {
      const value = values[field.id];

      if (
        field.required &&
        (value === undefined || value === "")
      ) {
        setMessage(`Please complete the required field: ${field.name}`);
        return;
      }
    }

    onSave(values);
    setMessage("Logbook entry saved successfully.");
  };

  if (fields.length === 0) {
    return (
      <section className="entry-card">
        <h2>Record Logbook Entry</h2>
        <div className="entry-empty-state">
          <p>No entry format has been defined.</p>
          <span>
            Define the project's entry format before recording an entry.
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className="entry-card">
      <div className="page-header">
        <p className="eyebrow">US03</p>
        <h2>Record Logbook Entry</h2>
        <p>
          Record a new entry using the format defined for this project.
        </p>
      </div>

      <div className="project-card">
        <span>Project</span>
        <strong>{projectName}</strong>
      </div>

      {fields.map((field) => (
        <div key={field.id}>
          <label htmlFor={`entry-${field.id}`}>
            {field.name}
            {field.required && " *"}
          </label>

          {field.type === "text" && (
            <input
              id={`entry-${field.id}`}
              type="text"
              value={(values[field.id] as string) ?? ""}
              onChange={(event) =>
                handleChange(field, event.target.value)
              }
            />
          )}

          {field.type === "number" && (
            <input
              id={`entry-${field.id}`}
              type="number"
              value={(values[field.id] as number) ?? ""}
              onChange={(event) =>
                handleChange(
                  field,
                  event.target.value === ""
                    ? ""
                    : Number(event.target.value)
                )
              }
            />
          )}

          {field.type === "date" && (
            <input
              id={`entry-${field.id}`}
              type="date"
              value={(values[field.id] as string) ?? ""}
              onChange={(event) =>
                handleChange(field, event.target.value)
              }
            />
          )}

          {field.type === "boolean" && (
            <label className="checkbox-row">
              <input
                id={`entry-${field.id}`}
                type="checkbox"
                checked={Boolean(values[field.id])}
                onChange={(event) =>
                  handleChange(field, event.target.checked)
                }
              />
              Yes
            </label>
          )}
        </div>
      ))}

      <button
        type="button"
        className="save-format-button"
        onClick={handleSubmit}
      >
        Save Logbook Entry
      </button>

      {message && <p className="form-message">{message}</p>}
    </section>
  );
}

export default LogbookEntryForm;