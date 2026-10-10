import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { native } from "@/lib/native";
import { setLanguage, t } from "@/lib/i18n";
import { DeleteFiles } from "./delete-files";

vi.mock("@/lib/native",()=>({native:{deleteFilesReview:vi.fn(),deleteFiles:vi.fn()}}));
const props={workspaceId:"w",path:"/repo",paths:["new [x].txt"],blocked:false,onChanged:vi.fn(),onBusyChange:vi.fn()};
beforeEach(()=>{vi.resetAllMocks();setLanguage("en");vi.mocked(native.deleteFilesReview).mockResolvedValue({reviewToken:"reviewed",paths:props.paths});vi.mocked(native.deleteFiles).mockResolvedValue("Selected files deleted. Review and stage tracked deletions when ready.");});

it.each((["en","fa","ar","zh"] as const).flatMap(language=>[1,2].map(count=>({language,count}))))("reviews $count files with the correct label in $language",async ({language,count})=>{
  setLanguage(language);const paths=count===1?props.paths:[...props.paths,"second.txt"];
  vi.mocked(native.deleteFilesReview).mockResolvedValue({reviewToken:"reviewed",paths});
  const label=count===1?t("Delete file"):t("Delete files");
  const user=userEvent.setup();render(<DeleteFiles {...props} paths={paths}/>);
  await user.click(screen.getByRole("button",{name:label}));
  const dialog=screen.getByRole("dialog");expect(dialog).toHaveAttribute("dir",language==="fa"||language==="ar"?"rtl":"ltr");
  expect(within(dialog).getByText(props.paths[0]).closest("ul")).toHaveAttribute("dir","ltr");
  expect(within(dialog).getByRole("heading",{name:label})).toBeInTheDocument();
  expect(within(dialog).getByText(count===1?t("This file will be permanently deleted from the project folder. It will not go to the Recycle Bin."):t("These files will be permanently deleted from the project folder. They will not go to the Recycle Bin."))).toBeInTheDocument();
  await waitFor(()=>expect(within(dialog).getByRole("button",{name:label})).toBeEnabled());
  expect(native.deleteFiles).not.toHaveBeenCalled();await user.click(within(dialog).getByRole("button",{name:label}));
  await waitFor(()=>expect(native.deleteFiles).toHaveBeenCalledWith("w","/repo",{reviewToken:"reviewed",paths}));
  expect(props.onChanged).toHaveBeenCalledWith("Selected files deleted. Review and stage tracked deletions when ready.");
});
it("cancels without deleting and disables empty or blocked selections",async()=>{
  const user=userEvent.setup();const {rerender}=render(<DeleteFiles {...props}/>);await user.click(screen.getByRole("button",{name:"Delete file"}));
  await user.click(within(screen.getByRole("dialog")).getByRole("button",{name:"Cancel"}));expect(native.deleteFiles).not.toHaveBeenCalled();
  rerender(<DeleteFiles {...props} paths={[]}/>);expect(screen.getByRole("button",{name:"Delete files"})).toBeDisabled();
  rerender(<DeleteFiles {...props} blocked/>);expect(screen.getByRole("button",{name:"Delete file"})).toBeDisabled();
});
it("requires an explicit new review after stale state and never automatically retries deletion",async()=>{
  vi.mocked(native.deleteFiles).mockRejectedValue("Repository changed. Refresh and review the operation again.");
  const user=userEvent.setup();render(<DeleteFiles {...props}/>);await user.click(screen.getByRole("button",{name:"Delete file"}));
  await user.click(await screen.findByRole("button",{name:"Delete file"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Repository changed");expect(native.deleteFiles).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button",{name:"Delete file"})).not.toBeInTheDocument();
  vi.mocked(native.deleteFilesReview).mockResolvedValue({reviewToken:"fresh",paths:props.paths});await user.click(screen.getByRole("button",{name:"Refresh"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"Delete file"})).toBeEnabled());expect(native.deleteFiles).toHaveBeenCalledTimes(1);
});
it("ignores a late review from a different repository",async()=>{
  let complete!:(value:{reviewToken:string;paths:string[]})=>void;
  vi.mocked(native.deleteFilesReview).mockImplementationOnce(()=>new Promise(resolve=>{complete=resolve;}));
  const {rerender}=render(<DeleteFiles {...props} open hideTrigger/>);
  vi.mocked(native.deleteFilesReview).mockResolvedValue({reviewToken:"two",paths:["two.txt"]});rerender(<DeleteFiles {...props} path="/other" paths={["two.txt"]} open hideTrigger/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Delete file"})).toBeEnabled());
  complete({reviewToken:"old",paths:props.paths});await waitFor(()=>expect(screen.queryByText(props.paths[0])).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole("button",{name:"Delete file"}));await waitFor(()=>expect(native.deleteFiles).toHaveBeenCalledWith("w","/other",{reviewToken:"two",paths:["two.txt"]}));
});
it("retains a failed review and its paths when refreshing clears the checked selection",async()=>{
  vi.mocked(native.deleteFiles).mockRejectedValue("Deletion failed");const user=userEvent.setup();const {rerender}=render(<DeleteFiles {...props} open hideTrigger/>);
  await waitFor(()=>expect(screen.getByRole("button",{name:"Delete file"})).toBeEnabled());await user.click(screen.getByRole("button",{name:"Delete file"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("Deletion failed");rerender(<DeleteFiles {...props} paths={[]} open hideTrigger/>);
  expect(screen.getByRole("alert")).toHaveTextContent("Deletion failed");expect(screen.getByText(props.paths[0])).toBeInTheDocument();expect(native.deleteFilesReview).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button",{name:"Refresh"}));await waitFor(()=>expect(native.deleteFilesReview).toHaveBeenCalledTimes(2));expect(native.deleteFilesReview).toHaveBeenLastCalledWith("w","/repo",props.paths);
});
