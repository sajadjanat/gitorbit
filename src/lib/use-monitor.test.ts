import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { native, type Snapshot, type Workspace } from "./native";
import { useMonitor } from "./use-monitor";
vi.mock("./native", () => ({ native: { scan: vi.fn(), onChange: vi.fn() } }));
const roots: Workspace[] = ["a", "b", "c"].map((id) => ({
  id,
  name: id,
  path: `/${id}`,
  autoFetch: false,
}));
const pair = roots.slice(0, 2);
const single = roots.slice(0, 1);
const result = (id: string): Snapshot => ({
  workspaceId: id,
  repositories: [],
  scannedAt: 1,
  fetchedAt: null,
  diagnostics: [],
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(native.onChange).mockResolvedValue(() => {});
  vi.mocked(native.scan).mockImplementation(async (id) => result(id));
});
afterEach(() => {
  vi.useRealTimers();
});
it("limits concurrency and preserves a queued fetch over local events", async () => {
  const finish = new Map<string, (s: Snapshot) => void>();
  vi.mocked(native.scan).mockImplementation(
    (id) => new Promise((resolve) => finish.set(id, resolve)),
  );
  const hook = renderHook(() => useMonitor(roots, true, false));
  expect(native.scan).toHaveBeenCalledTimes(2);
  act(() => {
    hook.result.current.refresh("a", true);
    hook.result.current.refresh("a", false);
  });
  await act(async () => finish.get("a")!(result("a")));
  expect(native.scan).toHaveBeenCalledWith("c", false);
  await act(async () => finish.get("b")!(result("b")));
  expect(native.scan).toHaveBeenLastCalledWith("a", true);
  await act(async () => {
    finish.get("a")!(result("a"));
    finish.get("c")!(result("c"));
  });
  expect(hook.result.current.snapshots.c).toEqual(result("c"));
});
it("debounces file events and scans only their workspace", async () => {
  vi.useFakeTimers();
  let changed: (id: string) => void = () => {};
  vi.mocked(native.onChange).mockImplementation(async (callback) => {
    changed = callback;
    return () => {};
  });
  renderHook(() => useMonitor(pair, true, true));
  await act(async () => {});
  vi.mocked(native.scan).mockClear();
  act(() => {
    changed("b");
    changed("b");
    changed("b");
    vi.advanceTimersByTime(349);
  });
  expect(native.scan).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(native.scan).toHaveBeenCalledTimes(1);
  expect(native.scan).toHaveBeenCalledWith("b", false);
});
it("supports manual refresh when monitoring is paused", async () => {
  const hook = renderHook(() => useMonitor(single, true, false));
  await waitFor(() => expect(hook.result.current.busy.a).toBe(false));
  expect(native.onChange).not.toHaveBeenCalled();
  act(() => hook.result.current.refresh("a", true));
  await waitFor(() => expect(native.scan).toHaveBeenLastCalledWith("a", true));
});
