import { useEffect, useState } from "react";

/** Keep foreground alerts prompt; reduce checks while the tab is hidden. */
export function requestPollingInterval() {
  return typeof document !== "undefined" && document.visibilityState === "hidden" ? 30_000 : 10_000;
}

/** Avoid sending intermediate keystrokes to the server. */
export function useDebouncedSearch(value: string) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timeout = setTimeout(() => setSettled(value), 300);
    return () => clearTimeout(timeout);
  }, [value]);
  return settled;
}