import { useCallback, useEffect, useRef, useState } from "react";
import { native, type Snapshot, type Workspace } from "./native";

export function useMonitor(
  workspaces: Workspace[],
  enabled: boolean,
  live: boolean,
) {
  const [snapshots, setSnapshots] = useState<Record<string, Snapshot>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const refs = useRef({ workspaces, enabled, live });
  refs.current = { workspaces, enabled, live };
  const queue = useRef(new Map<string, boolean>());
  const running = useRef(new Set<string>());
  const fetchTimes = useRef(new Map<string, number>());
  const mounted = useRef(true);
  const pumpRef = useRef<() => void>(() => {});
  const request = useCallback((id: string, fetch = false) => {
    if (
      !refs.current.enabled ||
      !refs.current.workspaces.some((w) => w.id === id)
    )
      return;
    queue.current.set(id, fetch || Boolean(queue.current.get(id)));
    pumpRef.current();
  }, []);
  pumpRef.current = () => {
    if (!mounted.current) return;
    for (const [id, fetch] of queue.current) {
      if (running.current.size >= 2) break;
      if (running.current.has(id)) continue;
      queue.current.delete(id);
      if (
        !refs.current.enabled ||
        !refs.current.workspaces.some((w) => w.id === id)
      )
        continue;
      running.current.add(id);
      setBusy((s) => ({ ...s, [id]: true }));
      if (fetch) fetchTimes.current.set(id, Date.now());
      void native
        .scan(id, fetch)
        .then((snapshot) => {
          if (
            !mounted.current ||
            !refs.current.workspaces.some((w) => w.id === id)
          )
            return;
          setSnapshots((s) => ({ ...s, [id]: snapshot }));
          setErrors((s) => ({ ...s, [id]: "" }));
        })
        .catch((error) => {
          if (mounted.current)
            setErrors((s) => ({ ...s, [id]: String(error) }));
        })
        .finally(() => {
          running.current.delete(id);
          if (mounted.current) {
            setBusy((s) => ({ ...s, [id]: false }));
            pumpRef.current();
          }
        });
    }
  };
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queue.current.clear();
    };
  }, []);
  useEffect(() => {
    if (enabled) workspaces.forEach((w) => request(w.id));
  }, [enabled, workspaces, request]);
  useEffect(() => {
    if (!enabled || !live) return;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void native
      .onChange((id) => {
        clearTimeout(timers.get(id));
        timers.set(
          id,
          setTimeout(() => {
            timers.delete(id);
            request(id);
          }, 350),
        );
      })
      .then((stop) => {
        if (cancelled) stop();
        else unlisten = stop;
      })
      .catch(() => {});
    const localTimer = setInterval(
      () =>
        refs.current.workspaces.forEach((w) => {
          if (!running.current.has(w.id)) request(w.id);
        }),
      15_000,
    );
    const remoteTimer = setInterval(
      () =>
        refs.current.workspaces.forEach((w) => {
          if (
            w.autoFetch &&
            !running.current.has(w.id) &&
            Date.now() - (fetchTimes.current.get(w.id) ?? 0) >= 60_000
          )
            request(w.id, true);
        }),
      5000,
    );
    return () => {
      cancelled = true;
      unlisten?.();
      timers.forEach(clearTimeout);
      clearInterval(localTimer);
      clearInterval(remoteTimer);
    };
  }, [enabled, live, request]);
  return { snapshots, errors, busy, refresh: request };
}
