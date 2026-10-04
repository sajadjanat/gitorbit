import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RepositoryHistory } from "./repository-history";
import { native, type GitHistory } from "@/lib/native";
vi.mock("@/lib/native", () => ({ native: { history: vi.fn() } }));
const history = (subject: string): GitHistory => ({ commits: [{ hash: subject, subject, author: "Demo", timestamp: 1780000000, parents: [] }], refs: [], head: subject, shallow: false, hasMore: true });
describe("repository history", () => {
  it("loads older commits and does not show a late result from another repository", async () => {
    let resolveOld!: (value: GitHistory) => void;
    vi.mocked(native.history).mockImplementation(async (_id, path) => path === "old" ? new Promise((resolve) => { resolveOld = resolve; }) : history("New repository commit"));
    const view = render(<RepositoryHistory workspaceId="a" path="old" />);
    await waitFor(() => expect(native.history).toHaveBeenCalled());
    view.rerender(<RepositoryHistory workspaceId="a" path="new" />);
    expect(await screen.findByText("New repository commit")).toBeInTheDocument();
    resolveOld(history("Old repository commit"));
    await waitFor(() => expect(screen.queryByText("Old repository commit")).not.toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Load 200 more commits" }));
    await waitFor(() => expect(native.history).toHaveBeenCalledWith("a", "new", 400, "all"));
  });
  it("shows read failures instead of pretending the history is empty", async () => {
    vi.mocked(native.history).mockRejectedValue("Repository is unavailable");
    render(<RepositoryHistory workspaceId="a" path="missing" />);
    expect(await screen.findByText("Repository is unavailable")).toBeInTheDocument();
    expect(screen.queryByText("No commits in this history yet.")).not.toBeInTheDocument();
  });
});
