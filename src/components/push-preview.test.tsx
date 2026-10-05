import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native, type Outgoing } from "@/lib/native";
import { PushPreview } from "./push-preview";
vi.mock("@/lib/native", () => ({ native: { outgoing: vi.fn(), commitFiles: vi.fn(), push: vi.fn() } }));
const outgoing: Outgoing = { head: "a".repeat(40), upstreamHead: "b".repeat(40), sourceBranch: "feature", remote: "origin", destinationBranch: "main", totalCommits: 1, hasMore: false, commits: [{ hash: "a".repeat(40), subject: "Update server", author: "Demo", timestamp: 1780000000 }] };
const props = { workspaceId: "demo", path: "/demo", upstream: "origin/main", behind: 0, onPushed: vi.fn() };
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(native.outgoing).mockResolvedValue(outgoing);
  vi.mocked(native.commitFiles).mockResolvedValue([{ path: "server.ts", originalPath: null, status: "M" }]);
});
it("pushes the reviewed heads and holds the operation lock through completion", async () => {
  let finish!: (value: string) => void;
  vi.mocked(native.push).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const onBusyChange = vi.fn(); const user = userEvent.setup();
  render(<PushPreview {...props} onBusyChange={onBusyChange} />);
  await screen.findByText("server.ts");
  await user.click(screen.getByRole("button", { name: "Push 1 commit" }));
  expect(native.push).toHaveBeenCalledExactlyOnceWith("demo", "/demo", outgoing.head, outgoing.upstreamHead);
  expect(onBusyChange).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole("button", { name: "Pushing…" })).toBeDisabled();
  await act(async () => finish("Pushed successfully."));
  await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
  expect(props.onPushed).toHaveBeenCalledOnce();
});
it("blocks pushing during another operation and retains errors after a rejection", async () => {
  const user = userEvent.setup(); const onBusyChange = vi.fn();
  const view = render(<PushPreview {...props} blocked onBusyChange={onBusyChange} />);
  await screen.findByText("server.ts");
  expect(screen.getByRole("button", { name: "Push 1 commit" })).toBeDisabled();
  view.rerender(<PushPreview {...props} blocked={false} onBusyChange={onBusyChange} />);
  vi.mocked(native.push).mockRejectedValue("Refresh the push list before pushing.");
  await user.click(screen.getByRole("button", { name: "Push 1 commit" }));
  expect(await screen.findByText("Refresh the push list before pushing.")).toBeInTheDocument();
  expect(onBusyChange).toHaveBeenLastCalledWith(false);
  expect(props.onPushed).not.toHaveBeenCalled();
});
