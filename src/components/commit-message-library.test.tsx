import {fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {setLanguage,t} from "@/lib/i18n";
import {CommitMessageLibrary,readCommitMessages,rememberCommitMessage} from "./commit-message-library";
beforeEach(()=>{localStorage.clear();setLanguage("en");});afterEach(()=>{vi.restoreAllMocks();});
it("bounds and deduplicates recent history per repository",()=>{
  for(let index=0;index<25;index++) expect(rememberCommitMessage("/repo",`Message ${index}`)).toBeNull();
  rememberCommitMessage("/repo","Message 20");const library=readCommitMessages("/repo");
  expect(library.history).toHaveLength(20);expect(library.history[0]).toBe("Message 20");expect(library.history.filter((message)=>message==="Message 20")).toHaveLength(1);
  expect(readCommitMessages("/other").history).toEqual([]);rememberCommitMessage("/repo","x".repeat(16385));expect(readCommitMessages("/repo").history).toHaveLength(20);
});
it.each(["en","fa","ar","zh"] as const)("requires explicit acknowledgement before replacing a draft in %s",async language=>{
  setLanguage(language);rememberCommitMessage("/repo","Saved subject\n\nSaved body");const onUse=vi.fn();const user=userEvent.setup();render(<CommitMessageLibrary path="/repo" message="Unfinished draft" blocked={false} onUse={onUse}/>);
  await user.click(screen.getByRole("button",{name:t("Messages & templates")}));await user.click(screen.getByRole("button",{name:"Saved subject"}));
  expect(onUse).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:t("Use selected message")})).toBeDisabled();
  await user.click(screen.getByRole("checkbox",{name:t("Replace my current draft")}));await user.click(screen.getByRole("button",{name:t("Use selected message")}));expect(onUse).toHaveBeenCalledWith("Saved subject\n\nSaved body");
});
it("persists templates and supports explicit deletion without rewriting the draft",async()=>{
  const user=userEvent.setup();const onUse=vi.fn();const view=render(<CommitMessageLibrary path="/repo" message={"feat: subject\n\nDetails"} blocked={false} onUse={onUse}/>);
  await user.click(screen.getByRole("button",{name:"Messages & templates"}));fireEvent.change(screen.getByRole("textbox",{name:"Template name"}),{target:{value:"Feature"}});await user.click(screen.getByRole("button",{name:"Save draft as template"}));
  expect(readCommitMessages("/repo").templates).toEqual([{name:"Feature",message:"feat: subject\n\nDetails"}]);expect(onUse).not.toHaveBeenCalled();
  view.unmount();render(<CommitMessageLibrary path="/repo" message="" blocked={false} onUse={onUse}/>);await user.click(screen.getByRole("button",{name:"Messages & templates"}));expect(screen.getByRole("button",{name:"Feature"})).toBeInTheDocument();
  await user.click(screen.getByRole("button",{name:"Delete template Feature"}));expect(readCommitMessages("/repo").templates).toEqual([]);expect(onUse).not.toHaveBeenCalled();
});
it("reports storage failure and retains the draft and existing library",async()=>{
  const user=userEvent.setup();const onUse=vi.fn();render(<CommitMessageLibrary path="/repo" message="My draft" blocked={false} onUse={onUse}/>);await user.click(screen.getByRole("button",{name:"Messages & templates"}));
  fireEvent.change(screen.getByRole("textbox",{name:"Template name"}),{target:{value:"Example"}});vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw new Error("quota");});await user.click(screen.getByRole("button",{name:"Save draft as template"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not save commit messages");expect(readCommitMessages("/repo").templates).toEqual([]);expect(onUse).not.toHaveBeenCalled();
});
it("deletes recent history explicitly and recovers from malformed stored data",async()=>{
  rememberCommitMessage("/repo","Recent subject");const user=userEvent.setup();render(<CommitMessageLibrary path="/repo" message="Draft" blocked={false} onUse={vi.fn()}/>);await user.click(screen.getByRole("button",{name:"Messages & templates"}));await user.click(screen.getByRole("button",{name:"Delete recent message 1"}));expect(readCommitMessages("/repo").history).toEqual([]);
  await user.click(within(screen.getByRole("dialog")).getAllByRole("button",{name:"Close"})[0]);
  const storageKey=Object.keys(localStorage).find((key)=>key.startsWith("gitorbit-commit-messages:"))!;localStorage.setItem(storageKey,"bad json");expect(readCommitMessages("/repo")).toEqual({history:[],templates:[]});
  await user.click(screen.getByRole("button",{name:"Messages & templates"}));await waitFor(()=>expect(screen.getByText("No recent commit messages.")).toBeInTheDocument());
});
