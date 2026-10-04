import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppUpdates } from "./app-updates";
import { updater, type AppUpdate } from "@/lib/updater";
vi.mock("@/lib/updater", () => ({ updater: { check: vi.fn(), restart: vi.fn() } }));
const update = (): AppUpdate => ({ version: "0.4.0", body: "Faster Git scans", close: vi.fn().mockResolvedValue(undefined), download: vi.fn().mockResolvedValue(undefined), install: vi.fn().mockResolvedValue(undefined) });
beforeEach(() => { vi.resetAllMocks(); vi.mocked(updater.check).mockResolvedValue(null); vi.mocked(updater.restart).mockResolvedValue(undefined); });
afterEach(() => vi.useRealTimers());
describe("app updates", () => {
  it("checks at startup and every six hours, and offers manual checking", async () => {
    vi.useFakeTimers();
    render(<AppUpdates enabled blocked={false} onInstalling={vi.fn()} />);
    await act(async () => {});
    expect(updater.check).toHaveBeenCalledTimes(1);
    await act(async () => { vi.advanceTimersByTime(6 * 60 * 60 * 1000); });
    expect(updater.check).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "App updates" }));
    expect(screen.getByText("You are up to date.")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Check again" })));
    expect(updater.check).toHaveBeenCalledTimes(3);
  });
  it("downloads with progress and installs before restarting after an explicit click", async () => {
    const item = update(); vi.mocked(updater.check).mockResolvedValue(item);
    let finish!: () => void;
    vi.mocked(item.download).mockImplementation(async (event) => {
      event?.({ event: "Started", data: { contentLength: 100 } });
      event?.({ event: "Progress", data: { chunkLength: 50 } });
      await new Promise<void>((resolve) => { finish = resolve; });
    });
    const busy = vi.fn(); const user = userEvent.setup(); render(<AppUpdates enabled blocked={false} onInstalling={busy} />);
    await user.click(await screen.findByRole("button", { name: "Update available: 0.4.0" }));
    expect(item.download).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Update & restart" }));
    expect(await screen.findByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(item.install).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(updater.restart).toHaveBeenCalledOnce());
    expect(item.install).toHaveBeenCalledWith({ restartAfterInstall: true });
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });
  it("shows offline errors without claiming the app is up to date", async () => {
    vi.mocked(updater.check).mockRejectedValue("Network unavailable");
    const user = userEvent.setup(); render(<AppUpdates enabled blocked={false} onInstalling={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "App updates" }));
    expect(await screen.findByText("Network unavailable")).toBeInTheDocument();
    expect(screen.queryByText("You are up to date.")).not.toBeInTheDocument();
  });
  it("blocks installation during Git work and never installs or restarts after a failed download", async () => {
    const item = update(); vi.mocked(updater.check).mockResolvedValue(item);
    vi.mocked(item.download).mockRejectedValue("Invalid signature");
    const busy = vi.fn(); const user = userEvent.setup(); const view = render(<AppUpdates enabled blocked onInstalling={busy} />);
    await user.click(await screen.findByRole("button", { name: "Update available: 0.4.0" }));
    expect(screen.getByRole("button", { name: "Update & restart" })).toBeDisabled();
    view.rerender(<AppUpdates enabled blocked={false} onInstalling={busy} />);
    await user.click(screen.getByRole("button", { name: "Update & restart" }));
    expect(await screen.findByText("Update failed: Invalid signature")).toBeInTheDocument();
    expect(item.install).not.toHaveBeenCalled(); expect(updater.restart).not.toHaveBeenCalled();
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });
  it("does not check in a regular browser and closes pending resources on unmount", async () => {
    const item = update(); let finish!: (value: AppUpdate) => void;
    vi.mocked(updater.check).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const view = render(<AppUpdates enabled={false} blocked={false} onInstalling={vi.fn()} />);
    expect(updater.check).not.toHaveBeenCalled();
    view.rerender(<AppUpdates enabled blocked={false} onInstalling={vi.fn()} />);
    await waitFor(() => expect(updater.check).toHaveBeenCalledOnce());
    view.unmount(); await act(async () => finish(item));
    expect(item.close).toHaveBeenCalledOnce();
  });
});
