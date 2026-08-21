export type FieldType = "text" | "number" | "date" | "boolean";

export interface EntryField {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
}