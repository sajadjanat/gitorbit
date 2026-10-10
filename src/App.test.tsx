import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LanguageProvider, languageDirection, setLanguage, t } from "./lib/i18n";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
vi.mock("./lib/updater", () => ({ updater: { check: vi.fn().mockResolvedValue(null), restart: vi.fn(), connection: vi.fn().mockResolvedValue("system"), saveConnection: vi.fn() } }));
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
    commitOptions: vi.fn(),
    commitReviewed: vi.fn(),
    tools: vi.fn(),
    toolAction: vi.fn(),
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
  vi.mocked(native.commitOptions).mockResolvedValue({reviewToken:"reviewed", head:"a".repeat(40), previousMessage:"Previous", canAmend:true, blockedReason:null, staged:1, published:false, signOffIdentity:"Test <test@example.invalid>"});
  vi.mocked(native.commitReviewed).mockResolvedValue("Created commit abc123.");
  vi.mocked(native.toolAction).mockResolvedValue("Git operation completed.");
  vi.mocked(native.tools).mockResolvedValue({reviewToken: "reviewed", head: "abcdef123456", branch: "main", operation: null, changed: 1, conflicts: 0, refs: [], stashes: [], reflog: [], remotes: ["origin"]});
});
describe("GitOrbit", () => {
  it("reloads branch details after creation without losing the commit draft or using the old upstream", async () => {
    const user = userEvent.setup();
    const staged = repo("api", {changed: 1, staged: 1, files: [{path: "src/server.ts", originalPath: null, status: "M "}]});
    vi.mocked(native.changes).mockResolvedValue(staged);
    render(<App />);
    await user.click(await screen.findByRole("button", {name: "api"}));
    await screen.findByRole("checkbox", {name: "Select staged src/server.ts"});
    await user.type(screen.getByLabelText("Commit message"), "Keep my draft");
    expect(screen.getByRole("button", {name: "Commit and Push…"})).toBeEnabled();
    await user.click(screen.getByRole("button", {name: "main"}));
    await user.click(await screen.findByRole("button", {name: "Create branch"}));
    const form = screen.getByRole("dialog", {name: "Create branch"});
    await user.type(within(form).getByLabelText("Branch name"), "feature/new");
    let finishReload!: (value: Repository) => void;
    vi.mocked(native.changes).mockImplementation(() => new Promise(resolve => { finishReload = resolve; }));
    await user.click(within(form).getByRole("button", {name: "Create branch"}));
    await waitFor(() => expect(native.toolAction).toHaveBeenCalledWith("a", staged.path, expect.objectContaining({action: "create", name: "feature/new", reviewToken: "reviewed"})));
    await waitFor(() => expect(native.changes).toHaveBeenCalledTimes(2));
    await user.click(within(screen.getByRole("dialog", {name: "Git branches and operations"})).getByRole("button", {name: "Close"}));
    expect(screen.getByRole("button", {name: "Commit and Push…"})).toBeDisabled();
    await act(async () => finishReload({...staged, branch: "feature/new", upstream: null}));
    await waitFor(() => expect(screen.getByRole("button", {name: "Commit"})).toBeEnabled());
    expect(screen.getByRole("button", {name: "Commit and Push…"})).toBeDisabled();
    expect(screen.getByLabelText("Commit message")).toHaveValue("Keep my draft");
  });
  it("monitors inactive tabs and opens live file details", async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByRole("button", { name: "api" });
    await waitFor(() => expect(native.scan).toHaveBeenCalledWith("b", false));
    expect(screen.getByText("Commit", { exact: true })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "api" }));
    expect(await screen.findByText("server.ts")).toBeInTheDocument();
    const tabs = within(screen.getByRole("dialog")).getAllByRole("tab");
    expect(tabs.map(tab => tab.textContent)).toEqual(["Version Control2", "Push0", "Branches", "Git graph"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(native.history).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("tab", { name: "Git graph" }));
    expect(await screen.findByText("Add project")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "phone" }));
    expect(screen.getByRole("tab", { name: /Version Control/ })).toHaveAttribute("aria-selected", "true");
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
    await user.click(screen.getByRole("combobox", {name:"Repository filter"}));
    await user.click(screen.getByRole("option", {name:"Needs attention"}));
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
    vi.mocked(native.commitReviewed).mockRejectedValue("Pre-commit hook rejected the commit.");
    render(<App />); await user.click(await screen.findByRole("button", { name: "api" }));
    await user.click(screen.getByRole("tab", { name: /Version Control/ }));
    await screen.findByRole("checkbox", { name: "Select staged src/server.ts" });
    await user.type(screen.getByLabelText("Commit message"), "Keep this message");
    await user.click(screen.getByRole("button", { name: "Commit" }));
    expect(await screen.findByText("Pre-commit hook rejected the commit.")).toBeInTheDocument();
    await waitFor(() => expect(native.changes).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Commit message")).toHaveValue("Keep this message");
    expect(screen.getByText("Pre-commit hook rejected the commit.")).toBeInTheDocument();
  });
  it("switches all four languages without losing selected files or a draft commit", async () => {
    const user = userEvent.setup();
    render(<LanguageProvider><App /></LanguageProvider>);
    await user.click(await screen.findByRole("button", {name: "api"}));
    await user.click(screen.getByRole("tab", {name: /Version Control/}));
    await user.click(await screen.findByRole("checkbox", {name: "Select changes src/server.ts"}));
    await user.type(screen.getByLabelText("Commit message"), "fix: keep my draft");
    const loads = vi.mocked(native.changes).mock.calls.length;
    for (const language of ["fa", "ar", "zh", "en"] as const) {
      act(() => setLanguage(language));
      expect(document.documentElement.dir).toBe(languageDirection(language));
      expect(screen.getByLabelText(t("Commit message"))).toHaveValue("fix: keep my draft");
      expect(screen.getByRole("checkbox", {name: t("Select {group} {path}", {group: t("changes"), path: "src/server.ts"})})).toBeChecked();
      expect(document.querySelector('[data-slot="sheet-content"]')).toHaveAttribute("data-side", languageDirection(language) === "ltr" ? "left" : "right");
      const resize = screen.getByRole("separator");
      const before = Number(resize.getAttribute("aria-valuenow"));
      fireEvent.keyDown(resize, {key: "ArrowRight"});
      expect(resize).toHaveAttribute("aria-valuenow", String(before + (languageDirection(language) === "ltr" ? 3 : -3)));
      fireEvent.keyDown(resize, {key: "ArrowLeft"});
      expect(resize).toHaveAttribute("aria-valuenow", String(before));
    }
    expect(native.changes).toHaveBeenCalledTimes(loads);
    expect(native.action).not.toHaveBeenCalled();
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
    await waitFor(() => expect(screen.getByRole("button", { name: "Commit" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Commit" }));
    await waitFor(() => expect(native.commitReviewed).toHaveBeenCalledWith("a", "C:/projects/api", {reviewToken:"reviewed", message:"Update server", amend:false, signOff:false}));
  });
});
