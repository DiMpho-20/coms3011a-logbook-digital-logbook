import { useState } from "react";

type FieldType = "text" | "number" | "date" | "boolean";

export interface EntryField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
}

interface EntryFormatBuilderProps {
  projectName: string;
  initialFields?: EntryField[];
  onSave: (fields: EntryField[]) => void;
}

function EntryFormatBuilder({
  projectName,
  initialFields = [],
  onSave,
}: EntryFormatBuilderProps) {
  const [fields, setFields] = useState<EntryField[]>(initialFields);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [required, setRequired] = useState(true);
  const [message, setMessage] = useState("");

  const addField = () => {
    const trimmedName = fieldName.trim();

    if (!trimmedName) {
      setMessage("Please enter a field name.");
      return;
    }

    const duplicate = fields.some(
      (field) => field.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (duplicate) {
      setMessage("A field with this name already exists.");
      return;
    }

    const newField: EntryField = {
      id: crypto.randomUUID(),
      name: trimmedName,
      type: fieldType,
      required,
    };

    setFields((currentFields) => [...currentFields, newField]);
    setFieldName("");
    setFieldType("text");
    setRequired(true);
    setMessage("");
  };

  const removeField = (id: string) => {
    setFields((currentFields) =>
      currentFields.filter((field) => field.id !== id)
    );
    setMessage("");
  };

  const saveFormat = () => {
    if (fields.length === 0) {
      setMessage("Add at least one field before saving the entry format.");
      return;
    }

    onSave(fields);
    setMessage("Entry format saved successfully.");
  };

  return (
    <section className="entry-format-builder">
      <div className="page-header">
        <div>
          <p className="eyebrow">US02</p>
          <h1>Define Entry Format</h1>
          <p>
            Define the fields that must be recorded for each logbook entry.
          </p>
        </div>
      </div>

      <div className="project-card">
        <span>Project</span>
        <strong>{projectName}</strong>
      </div>

      <div className="format-layout">
        <div className="entry-card">
          <h2>Add Field</h2>

          <label htmlFor="field-name">Field name</label>
          <input
            id="field-name"
            type="text"
            value={fieldName}
            onChange={(event) => setFieldName(event.target.value)}
            placeholder="e.g. Catch Weight"
          />

          <label htmlFor="field-type">Field type</label>
          <select
            id="field-type"
            value={fieldType}
            onChange={(event) =>
              setFieldType(event.target.value as FieldType)
            }
          >
            <option value="text">Text</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="boolean">Yes / No</option>
          </select>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={required}
              onChange={(event) => setRequired(event.target.checked)}
            />
            Required field
          </label>

          <button type="button"
           className="entry-button"
           onClick={addField}
           >
            Add Field
          </button>
        </div>

        <div className="entry-card">
          <div className="card-heading">
            <div>
              <h2>Entry Fields</h2>
              <p>{fields.length} field(s) defined</p>
            </div>
          </div>

          {fields.length === 0 ? (
            <div className="entry-empty-state">
              <p>No fields have been defined yet.</p>
              <span>Add fields using the form on the left.</span>
            </div>
          ) : (
            <div className="entry-field-list">
              {fields.map((field, index) => (
                <div className="entry-field-item" key={field.id}>
                  <div>
                    <strong>
                      {index + 1}. {field.name}
                    </strong>

                    <span>
                      {field.type} ·{" "}
                      {field.required ? "Required" : "Optional"}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="remove-field-button"
                    onClick={() => removeField(field.id)}
                    aria-label={`Remove ${field.name}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            className="save-format-button"
            onClick={saveFormat}
          >
            Save Entry Format
          </button>

          {message && <p className="form-message">{message}</p>}
        </div>
      </div>
    </section>
  );
}

export default EntryFormatBuilder;