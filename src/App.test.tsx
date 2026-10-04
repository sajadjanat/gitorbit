import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
vi.mock("./lib/updater", () => ({ updater: { check: vi.fn().mockResolvedValue(null), restart: vi.fn() } }));
import {
  native,
  nextStep,
  type Environment,
  type Repository,
  type Snapshot,
  type Workspace,
} from "./lib/native";
vi.mock("./lib/native", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/native")>()),
  native: {
    available: vi.fn(() => true),
    environment: vi.fn(),
    load: vi.fn(),
    save: vi.fn(),
    scan: vi.fn(),
    chooseFolders: vi.fn(),
    onChange: vi.fn(),
    installGit: vi.fn(),
    downloadGit: vi.fn(),
    openRepository: vi.fn(),
    history: vi.fn(),
    changes: vi.fn(),
    diff: vi.fn(),
    action: vi.fn(),
  },
}));
const roots: Workspace[] = [
  { id: "a", name: "sepehra", path: "C:/projects/sepehra", autoFetch: false },
  {
    id: "b",
    name: "telefonchy",
    path: "C:/projects/telefonchy",
    autoFetch: false,
  },
];
const env: Environment = {
  platform: "windows",
  gitVersion: "git version 2.51",
  gitPath: "git.exe",
  installer: {
    available: true,
    description: "Install using Windows Package Manager.",
    command: "winget install Git.Git",
    downloadUrl: "https://git-scm.com/install/windows",
    systemPrompt: false,
  },
};
const repo = (name: string, patch: Partial<Repository> = {}): Repository => ({
  path: `C:/projects/${name}`,
  name,
  branch: "main",
  upstream: "origin/main",
  changed: 0,
  staged: 0,
  unstaged: 0,
  untracked: 0,
  conflicts: 0,
  ahead: 0,
  behind: 0,
  detached: false,
  files: [],
  error: null,
  fetchError: null,
  ...patch,
});
const snapshot = (id: string): Snapshot => ({
  workspaceId: id,
  repositories:
    id === "a"
      ? [
          repo("api", {
            changed: 2,
            unstaged: 2,
            files: [
              { path: "src/server.ts", originalPath: null, status: " M" },
            ],
          }),
          repo("landing"),
        ]
      : [repo("phone", { ahead: 3 })],
  scannedAt: Date.now(),
  fetchedAt: null,
  diagnostics: [],
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(native.available).mockReturnValue(true);
  vi.mocked(native.environment).mockResolvedValue(env);
  vi.mocked(native.load).mockResolvedValue(roots);
  vi.mocked(native.save).mockResolvedValue(null);
  vi.mocked(native.onChange).mockResolvedValue(() => {});
  vi.mocked(native.scan).mockImplementation(async (id) => snapshot(id));
  vi.mocked(native.history).mockResolvedValue({ commits: [{ hash: "abcdef123456", parents: [], author: "Demo Author", timestamp: 1780000000, subject: "Add project" }], refs: [], head: "abcdef123456", hasMore: false, shallow: false });
  vi.mocked(native.changes).mockResolvedValue(snapshot("a").repositories[0]);
  vi.mocked(native.diff).mockResolvedValue({ text: "@@ -1 +1 @@\n-old\n+new", truncated: false });
  vi.mocked(native.action).mockResolvedValue("Updated.");
});
describe("Workspace Monitor", () => {
  it("monitors inactive tabs and opens live file details", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "api" });
    await waitFor(() => expect(native.scan).toHaveBeenCalledWith("b", false));
    expect(screen.getByText("Commit", { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "api" }));
    expect(await screen.findByText("Add project")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /Version Control/ }));
    expect(await screen.findByText("server.ts")).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }),
    );
    await user.click(screen.getByRole("tab", { name: /telefonchy/ }));
    expect(
      await screen.findByRole("button", { name: "phone" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Push", { selector: '[data-slot="badge"]' }),
    ).toBeInTheDocument();
  });
  it("does not duplicate workspaces and saves closed tabs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("tab", { name: /sepehra/ });
    vi.mocked(native.chooseFolders).mockResolvedValue([
      "C:\\projects\\SEPEHRA",
      "C:/projects/new",
    ]);
    await user.click(screen.getByRole("button", { name: "Add workspace" }));
    await waitFor(() =>
      expect(native.save).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: "new" })]),
      ),
    );
    expect(vi.mocked(native.save).mock.calls[0][0]).toHaveLength(3);
    await user.click(screen.getByRole("button", { name: "Close telefonchy" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("tab", { name: /telefonchy/ }),
      ).not.toBeInTheDocument(),
    );
  });
  it("blocks scanning without Git and recovers after installation", async () => {
    const user = userEvent.setup();
    vi.mocked(native.environment).mockResolvedValueOnce({
      ...env,
      gitVersion: null,
      gitPath: null,
    });
    vi.mocked(native.installGit).mockResolvedValue("Git is ready.");
    render(<App />);
    await screen.findByText("Install Git to get started");
    expect(native.scan).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Install Git" }));
    await screen.findByRole("button", { name: "api" });
    expect(native.installGit).toHaveBeenCalledTimes(1);
  });
  it("shows an installation error without claiming Git is ready", async () => {
    const user = userEvent.setup();
    vi.mocked(native.environment).mockResolvedValue({
      ...env,
      gitVersion: null,
      gitPath: null,
    });
    vi.mocked(native.installGit).mockRejectedValue("Installation cancelled");
    render(<App />);
    await screen.findByText("Install Git to get started");
    await user.click(screen.getByRole("button", { name: "Install Git" }));
    expect(
      await screen.findByText("Installation cancelled"),
    ).toBeInTheDocument();
    expect(native.scan).not.toHaveBeenCalled();
  });
  it("never reports failures, detached HEAD or unknown upstream as clean", () => {
    expect(nextStep(repo("a", { error: "unsafe repository" })).label).toBe(
      "Check Git",
    );
    expect(nextStep(repo("a", { fetchError: "denied" })).label).toBe(
      "Retry fetch",
    );
    expect(
      nextStep(repo("a", { upstream: null, ahead: null, behind: null })).label,
    ).toBe("Set upstream");
    expect(nextStep(repo("a", { detached: true })).label).toBe("Select branch");
    expect(nextStep(repo("a", { ahead: 2, behind: 1 })).label).toBe(
      "Sync branch",
    );
  });
  it("pulls the complete workspace including repositories hidden by the filter", async () => {
    vi.mocked(native.action).mockImplementation(async (_id, path) => {
      if (path.endsWith("api")) throw "Skipped: commit local changes first.";
      return "Already up to date.";
    });
    const user = userEvent.setup(); render(<App />);
    await screen.findByRole("button", { name: "api" });
    expect(screen.queryByRole("button", { name: "landing" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Pull all" }));
    await waitFor(() => expect(native.action).toHaveBeenCalledWith("a", "C:/projects/landing", "pull"));
    expect(await screen.findByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("Already up to date.")).toBeInTheDocument();
    expect(native.action).toHaveBeenCalledTimes(2);
  });
  it("saves and restores light mode, a palette and custom accent", async () => {
    const user = userEvent.setup(); const view = render(<App />);
    await user.click(screen.getByRole("button", { name: "Appearance" }));
    await user.click(screen.getByRole("button", { name: "Light" }));
    await user.click(screen.getByRole("button", { name: "Ocean" }));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.palette).toBe("ocean");
    fireEvent.change(screen.getByLabelText("Custom accent color"), { target: { value: "#ff9922" } });
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#ff9922");
    expect(JSON.parse(localStorage.getItem("workspace-monitor-appearance")!)).toMatchObject({ mode: "light", palette: "ocean" });
    view.unmount(); render(<App />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.dataset.palette).toBe("ocean");
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#ff9922");
  });
  it("pulls only the repository selected in the dialog", async () => {
    const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole("button", { name: "api" }));
    await user.click(screen.getByRole("button", { name: "Pull repository" }));
    expect(await screen.findByText("Updated.")).toBeInTheDocument();
    expect(native.action).toHaveBeenCalledExactlyOnceWith("a", "C:/projects/api", "pull");
  });
  it("retains a failed commit message and hook error after reloading files", async () => {
    const user = userEvent.setup();
    vi.mocked(native.changes).mockResolvedValue(repo("api", { changed: 1, staged: 1, files: [{ path: "src/server.ts", originalPath: null, status: "M " }] }));
    vi.mocked(native.action).mockRejectedValue("Pre-commit hook rejected the commit.");
    render(<App />); await user.click(await screen.findByRole("button", { name: "api" }));
    await user.click(screen.getByRole("tab", { name: /Version Control/ }));
    await screen.findByRole("checkbox", { name: "Select staged src/server.ts" });
    await user.type(screen.getByLabelText("Commit message"), "Keep this message");
    await user.click(screen.getByRole("button", { name: "Commit staged" }));
    expect(await screen.findByText("Pre-commit hook rejected the commit.")).toBeInTheDocument();
    await waitFor(() => expect(native.changes).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Commit message")).toHaveValue("Keep this message");
    expect(screen.getByText("Pre-commit hook rejected the commit.")).toBeInTheDocument();
  });
  it("stages only selected files and commits only the existing index", async () => {
    const user = userEvent.setup();
    let current = repo("api", { changed: 2, unstaged: 1, untracked: 1, files: [ { path: "src/server.ts", originalPath: null, status: " M" }, { path: "new.txt", originalPath: null, status: "??" } ] });
    vi.mocked(native.changes).mockImplementation(async () => current);
    vi.mocked(native.action).mockImplementation(async (_id, _path, action) => {
      if (action === "stage") current = { ...current, staged: 1, unstaged: 0, files: [ { path: "src/server.ts", originalPath: null, status: "M " }, current.files[1] ] };
      return action === "stage" ? "Staged 1 file." : "Created commit abc123.";
    });
    render(<App />); await user.click(await screen.findByRole("button", { name: "api" }));
    await user.click(screen.getByRole("tab", { name: /Version Control/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Select changes src/server.ts" }));
    await user.click(screen.getByRole("button", { name: "Stage selected" }));
    await waitFor(() => expect(native.action).toHaveBeenCalledWith("a", "C:/projects/api", "stage", ["src/server.ts"], null));
    await screen.findByRole("checkbox", { name: "Select staged src/server.ts" });
    await user.type(screen.getByLabelText("Commit message"), "Update server");
    await waitFor(() => expect(screen.getByRole("button", { name: "Commit staged" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Commit staged" }));
    await waitFor(() => expect(native.action).toHaveBeenCalledWith("a", "C:/projects/api", "commit", [], "Update server"));
  });
});
