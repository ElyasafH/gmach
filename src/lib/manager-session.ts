import { useSyncExternalStore } from "react";

const KEY = "gmach_manager_session";
type Session = { token: string; name: string };
const listeners = new Set<() => void>();
let cache: Session | null | undefined;

function read(): Session | null {
  if (typeof window === "undefined") return null;
  if (cache !== undefined) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    cache = null;
  }
  return cache ?? null;
}

export function setManagerSession(s: Session | null) {
  cache = s;
  if (s) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
  listeners.forEach((l) => l());
}

export function getManagerToken() {
  return read()?.token ?? "";
}

export function useManagerSession() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => null,
  );
}

export function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

const GUEST_KEY = "gmach_guest_phone";
let guestCache: string | undefined;
export function getGuestPhone() {
  if (typeof window === "undefined") return "";
  if (guestCache === undefined) guestCache = localStorage.getItem(GUEST_KEY) || "";
  return guestCache;
}
export function setGuestPhone(p: string) {
  guestCache = p;
  if (p) localStorage.setItem(GUEST_KEY, p);
  else localStorage.removeItem(GUEST_KEY);
  listeners.forEach((l) => l());
}
export function useGuestPhone() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getGuestPhone,
    () => "",
  );
}
