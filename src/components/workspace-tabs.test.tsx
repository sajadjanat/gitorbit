import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LanguageProvider, setLanguage } from "@/lib/i18n";
import { Tabs } from "./ui/tabs";
import { WorkspaceTabs } from "./workspace-tabs";
import type { Workspace } from "@/lib/native";

const roots: Workspace[] = ["Alpha", "Beta", "Gamma"].map(name => ({id:name, name, path:`/work/${name}`, autoFetch:name === "Beta"}));
function fixture(save = vi.fn(async (_next: Workspace[]) => true), disabled = false) {
  function Fixture() {
    const [workspaces, setWorkspaces] = useState(roots);
    return <LanguageProvider><Tabs defaultValue="Beta"><WorkspaceTabs workspaces={workspaces} counts={{Alpha:2}} disabled={disabled} onClose={vi.fn()}
      onReorder={async next => {const saved = await save(next); if(saved) setWorkspaces(next); return saved;}}/></Tabs></LanguageProvider>;
  }
  render(<Fixture/>); return save;
}
function tab(name: string) { return screen.getByRole("tab", {name: new RegExp(name)}); }
function row(name: string) { return tab(name).closest("[data-workspace-tab]")!; }
function drag(from: string, to: string) {
  Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>row(to)});
  fireEvent(tab(from),new MouseEvent("pointerdown",{bubbles:true,button:0,clientX:10,clientY:10}));
  fireEvent(tab(from),new MouseEvent("pointermove",{bubbles:true,buttons:1,clientX:100,clientY:10}));
  fireEvent(tab(from),new MouseEvent("pointerup",{bubbles:true,clientX:100,clientY:10}));
}
describe("workspace tab order", () => {
  it("moves a dragged tab and preserves the active tab, counts and settings", async () => {
    const save = fixture(); drag("Alpha","Gamma");
    expect(save).toHaveBeenCalledWith([roots[1],roots[2],roots[0]]);
    await screen.findByText("Moved Alpha to position 3 of 3");
    expect(screen.getAllByRole("tab").map(node => node.textContent)).toEqual(["Beta","Gamma","Alpha2"]);
    expect(tab("Beta")).toHaveAttribute("aria-selected","true");
  });
  it("retains the original order when saving fails", async () => {
    const save = fixture(vi.fn(async (_next:Workspace[]) => false)); drag("Gamma","Alpha");
    await act(async () => {});
    expect(save).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("tab").map(node => node.textContent)).toEqual(["Alpha2","Beta","Gamma"]);
  });
  it("supports visual keyboard movement in RTL without changing selection", async () => {
    act(() => setLanguage("fa")); const save = fixture();
    fireEvent.keyDown(tab("Beta"), {key:"ArrowRight",altKey:true,shiftKey:true});
    expect(save).toHaveBeenCalledWith([roots[1],roots[0],roots[2]]);
    await act(async () => {}); expect(tab("Beta")).toHaveAttribute("aria-selected","true");
  });
  it("ignores outside drops, cancellation, boundaries and disabled movement", () => {
    const save=fixture(undefined,true);
    drag("Alpha","Gamma");
    fireEvent.keyDown(tab("Beta"), {key:"ArrowRight",altKey:true,shiftKey:true});
    expect(save).not.toHaveBeenCalled();
  });
  it("does not save cancelled gestures, outside releases or ordinary clicks", () => {
    const save=fixture();
    Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>row("Gamma")});
    fireEvent(tab("Alpha"),new MouseEvent("pointerdown",{bubbles:true,button:0,clientX:10,clientY:10}));
    fireEvent(tab("Alpha"),new MouseEvent("pointermove",{bubbles:true,buttons:1,clientX:100,clientY:10}));
    fireEvent.pointerCancel(row("Alpha")); fireEvent.pointerUp(row("Alpha"));
    Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>null});
    fireEvent(tab("Alpha"),new MouseEvent("pointerdown",{bubbles:true,button:0,clientX:10,clientY:10}));
    fireEvent(tab("Alpha"),new MouseEvent("pointermove",{bubbles:true,buttons:1,clientX:100,clientY:10}));
    fireEvent.pointerUp(row("Alpha"));
    Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>row("Gamma")});
    fireEvent(tab("Alpha"),new MouseEvent("pointerdown",{bubbles:true,button:0,clientX:10,clientY:10}));
    fireEvent(tab("Alpha"),new MouseEvent("pointermove",{bubbles:true,buttons:1,clientX:12,clientY:10}));
    fireEvent.pointerUp(row("Alpha"));
    fireEvent.keyDown(tab("Alpha"), {key:"ArrowLeft",altKey:true,shiftKey:true});
    expect(save).not.toHaveBeenCalled();
  });
});
