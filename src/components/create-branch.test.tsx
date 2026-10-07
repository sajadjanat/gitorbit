import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { LanguageProvider, languageDirection, setLanguage, t } from "@/lib/i18n";
import { native } from "@/lib/native";
import { CreateBranch } from "./create-branch";

vi.mock("@/lib/native", () => ({native: {action: vi.fn()}}));
beforeEach(() => vi.resetAllMocks());
const pending = "A Git operation is already in progress. Finish or abort it before creating a branch.";

it.each(["en", "fa", "ar", "zh"] as const)("shows branch-operation guidance with the correct direction in %s", async language => {
  setLanguage(language);
  vi.mocked(native.action).mockRejectedValue(pending);
  const onCreated = vi.fn();
  const user = userEvent.setup();
  render(<LanguageProvider><CreateBranch workspaceId="w" path="/repo" blocked={false} onBusyChange={vi.fn()} onCreated={onCreated} /></LanguageProvider>);
  await user.click(screen.getByRole("button", {name: t("Create branch")}));
  const dialog = screen.getByRole("dialog");
  expect(dialog).toHaveAttribute("dir", languageDirection(language));
  const input = within(dialog).getByLabelText(t("Branch name"));
  expect(input).toHaveAttribute("dir", "ltr");
  await user.type(input, "feature/new");
  await user.click(within(dialog).getByRole("button", {name: t("Create branch")}));
  expect(await screen.findByRole("alert")).toHaveTextContent(t(pending));
  expect(onCreated).not.toHaveBeenCalled();
  expect(input).toHaveValue("feature/new");
  vi.mocked(native.action).mockResolvedValue("Created.");
  await user.click(within(dialog).getByRole("button", {name: t("Create branch")}));
  expect(onCreated).toHaveBeenCalledTimes(1);
});

it("blocks duplicate submissions and keeps the form open until the operation finishes", async () => {
  let finish!: (value: string) => void;
  vi.mocked(native.action).mockImplementation(() => new Promise(resolve => {finish = resolve;}));
  const onCreated = vi.fn(), onBusyChange = vi.fn();
  const user = userEvent.setup();
  render(<CreateBranch workspaceId="w" path="/repo" blocked={false} onBusyChange={onBusyChange} onCreated={onCreated} />);
  await user.click(screen.getByRole("button", {name: "Create branch"}));
  const dialog = screen.getByRole("dialog");
  const input = within(dialog).getByLabelText("Branch name");
  await user.type(input, "feature/new");
  fireEvent.submit(input.closest("form")!);
  fireEvent.submit(input.closest("form")!);
  expect(native.action).toHaveBeenCalledTimes(1);
  expect(within(dialog).getByRole("button", {name: "Cancel"})).toBeDisabled();
  fireEvent.keyDown(dialog, {key: "Escape"});
  expect(dialog).toBeInTheDocument();
  await act(async () => finish("Created."));
  expect(onCreated).toHaveBeenCalledTimes(1);
  expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
});
