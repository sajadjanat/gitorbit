import { useState, type Dispatch, type SetStateAction } from "react";

// Drafts survive closing the panel and app restarts. View state is session-only.
const views = new Map<string, unknown>();
export function clearRepositoryViewCache() { views.clear(); }
export function repositoryStateKey(workspaceId: string, path: string) {
  return JSON.stringify([workspaceId, path]);
}
export function useRepositoryViewState<T>(scope: string, name: string, initial: T, persist = false): [T, Dispatch<SetStateAction<T>>] {
  const key = `gitorbit-view:${scope}:${name}`;
  const [value, update] = useState<T>(() => {
    if (persist) {
      try { const saved = localStorage.getItem(key); const parsed: unknown = saved !== null ? JSON.parse(saved) : initial; return typeof parsed === typeof initial ? parsed as T : initial; } catch { /* Keep an in-memory draft if storage is unavailable. */ }
    }
    return views.has(key) ? views.get(key) as T : initial;
  });
  const set: Dispatch<SetStateAction<T>> = next => update(old => {
    const result = typeof next === "function" ? (next as (old: T) => T)(old) : next;
    views.set(key, result);
    if (persist) try { if (result === "") localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(result)); } catch { /* The in-memory draft remains available. */ }
    return result;
  });
  return [value, set];
}
