import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native } from "@/lib/native";
import { setLanguage, t } from "@/lib/i18n";
import { RepositorySetup } from "./repository-setup";
vi.mock("@/lib/native", () => ({native: {setupRepository: vi.fn()}}));
const props={workspaceId:"w",workspacePath:"C:/workspace",onBusyChange:vi.fn(),onChanged:vi.fn()};
beforeEach(() => {vi.resetAllMocks();setLanguage("en");vi.mocked(native.setupRepository).mockResolvedValue({path:"C:/workspace/project",action:"clone"});});
it.each(["en","fa","ar","zh"] as const)("reviews the exact clone destination before execution in %s", async language => {
  setLanguage(language);const user=userEvent.setup();render(<RepositorySetup {...props} />);
  await user.click(screen.getByRole("button",{name:t("Add repository")}));
  await user.type(screen.getByLabelText(t("Project folder name")),"project");await user.type(screen.getByLabelText(t("Repository URL")),"https://example.invalid/repo.git");
  await user.click(screen.getByRole("button",{name:t("Review repository setup")}));
  expect(screen.getByText("C:/workspace/project")).toBeInTheDocument();expect(native.setupRepository).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button",{name:t("Clone repository")}));
  await waitFor(() => expect(native.setupRepository).toHaveBeenCalledWith("w",{action:"clone",folder:"project",url:"https://example.invalid/repo.git",initialBranch:"main"}));
  await waitFor(() => expect(props.onChanged).toHaveBeenCalledTimes(1));
});
it("initializes existing project after reviewing preservation of files", async () => {
  const user=userEvent.setup();render(<RepositorySetup {...props} />);await user.click(screen.getByRole("button",{name:"Add repository"}));
  await user.click(screen.getByRole("combobox",{name:"Setup method"}));await user.click(screen.getByRole("option",{name:"Initialize repository"}));
  await user.type(screen.getByLabelText("Project folder name"),"existing");await user.click(screen.getByRole("button",{name:"Review repository setup"}));
  expect(screen.getByText("Initialize Git without creating a commit or changing existing project files.")).toBeInTheDocument();
  await user.click(screen.getByRole("button",{name:"Initialize repository"}));await waitFor(() => expect(native.setupRepository).toHaveBeenCalledWith("w",expect.objectContaining({action:"init",folder:"existing",initialBranch:"main"})));
});
it("keeps failure actionable without retrying automatically", async () => {
  vi.mocked(native.setupRepository).mockRejectedValue("The destination already exists or cannot be created. Choose a new folder name.");const user=userEvent.setup();render(<RepositorySetup {...props} />);
  await user.click(screen.getByRole("button",{name:"Add repository"}));await user.type(screen.getByLabelText("Project folder name"),"existing");await user.type(screen.getByLabelText("Repository URL"),"https://example.invalid/repo.git");
  await user.click(screen.getByRole("button",{name:"Review repository setup"}));await user.click(screen.getByRole("button",{name:"Clone repository"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose a new folder name");expect(native.setupRepository).toHaveBeenCalledTimes(1);expect(screen.getByLabelText("Project folder name")).toHaveValue("existing");
});
it("drops a reviewed setup when the workspace changes", async () => {
  const user=userEvent.setup();const view=render(<RepositorySetup {...props} />);await user.click(screen.getByRole("button",{name:"Add repository"}));
  await user.type(screen.getByLabelText("Project folder name"),"project");await user.type(screen.getByLabelText("Repository URL"),"https://example.invalid/repo.git");await user.click(screen.getByRole("button",{name:"Review repository setup"}));
  view.rerender(<RepositorySetup {...props} workspaceId="other" workspacePath="C:/other" />);await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());expect(native.setupRepository).not.toHaveBeenCalled();
});
