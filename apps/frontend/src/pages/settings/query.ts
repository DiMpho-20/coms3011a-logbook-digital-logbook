import { createContext } from "react";

/**
 * The settings search, so a label can mark the words that matched it.
 *
 * A context rather than a prop because every `Field` and `GroupLabel` in every
 * section needs it, and threading it through would make each signature carry
 * a detail none of them own.
 */
export const QueryContext = createContext("");
