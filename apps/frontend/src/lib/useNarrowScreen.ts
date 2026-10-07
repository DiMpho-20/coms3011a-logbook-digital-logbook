import { useEffect, useState } from "react";

const QUERY = "(max-width: 639px)";

/**
 * True on phone-width screens, for layouts that change shape rather than
 * just reflow (a month grid becoming an agenda list). Defaults to false where
 * matchMedia isn't available, such as in tests.
 */
export function useNarrowScreen(): boolean {
  const supported = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [narrow, setNarrow] = useState(() => supported && window.matchMedia(QUERY).matches);
  useEffect(() => {
    if (!supported) return;
    const media = window.matchMedia(QUERY);
    const onChange = () => setNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [supported]);
  return narrow;
}
