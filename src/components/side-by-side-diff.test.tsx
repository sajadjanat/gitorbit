import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { setLanguage, t } from "@/lib/i18n";
import { expect, it } from "vitest";
import { SideBySideDiff } from "./side-by-side-diff";
it("shows additions and removals in the correct version panes", () => {
  render(<SideBySideDiff staged={false} truncated={false} text={"diff --git a/test b/test\n--- a/test\n+++ b/test\n@@ -5,2 +8,2 @@\n common\n-old value\n+new value\n"} />);
  expect(within(screen.getByLabelText("Index code")).getByText(/old/)).toBeInTheDocument();
  expect(within(screen.getByLabelText("Working tree code")).getByText(/new/)).toBeInTheDocument();
  expect(within(screen.getByLabelText("Index code")).getByText("6")).toBeInTheDocument();
  expect(within(screen.getByLabelText("Working tree code")).getByText("9")).toBeInTheDocument();
});
it("recognizes a staged new file behind Git metadata and labels it as index content", () => {
  render(<SideBySideDiff staged truncated={false} text={"diff --git a/new b/new\nnew file mode 100644\nindex 0000000..1111111\n--- /dev/null\n+++ b/new\n@@ -0,0 +1 @@\n+hello\n"} />);
  expect(screen.getByLabelText("New file contents")).toBeInTheDocument();
  expect(screen.getByText("New file · Index · staged")).toBeInTheDocument();
  expect(screen.getByText("hello")).toBeInTheDocument();
  expect(screen.queryByLabelText("Side-by-side diff")).not.toBeInTheDocument();
});

it.each(["en", "fa"] as const)("synchronizes both scroll axes from either pane in %s and resets a new diff", language => {
  act(() => setLanguage(language));
  const view = render(<SideBySideDiff staged={false} truncated={false} text={"@@ -1 +1 @@\n-old\n+new"} />);
  const before = screen.getByLabelText(t("{label} code", { label: t("Index") }));
  const after = screen.getByLabelText(t("{label} code", { label: t("Working tree") }));
  fireEvent.scroll(before, { target: { scrollLeft: 160, scrollTop: 72 } });
  expect(after.scrollLeft).toBe(160);
  expect(after.scrollTop).toBe(72);
  fireEvent.scroll(after); // The programmatic scroll must not bounce back.
  fireEvent.scroll(after, { target: { scrollLeft: 64, scrollTop: 24 } });
  expect(before.scrollLeft).toBe(64);
  expect(before.scrollTop).toBe(24);
  view.rerender(<SideBySideDiff staged={false} truncated={false} text={"@@ -1 +1 @@\n-other\n+next"} />);
  expect([before.scrollLeft, after.scrollLeft, before.scrollTop, after.scrollTop]).toEqual([0, 0, 0, 0]);
  fireEvent.scroll(after, { target: { scrollLeft: 90 } });
  expect(before.scrollLeft).toBe(90);
});

it("does not pull a longer pane back when its shorter peer clamps horizontal scrolling", () => {
  render(<SideBySideDiff staged={false} truncated={false} text={"@@ -1 +1 @@\n-short\n+much longer line"} />);
  const before = screen.getByLabelText("Index code");
  const after = screen.getByLabelText("Working tree code");
  let left = 0;
  Object.defineProperty(before, "scrollLeft", {
    configurable: true,
    get: () => left,
    set: value => { left = Math.min(40, Math.max(0, value)); },
  });
  fireEvent.scroll(after, { target: { scrollLeft: 200 } });
  expect(before.scrollLeft).toBe(40);
  fireEvent.scroll(before);
  expect(after.scrollLeft).toBe(200);
  fireEvent.scroll(before, { target: { scrollTop: 60 } });
  expect(after.scrollTop).toBe(60);
  expect(after.scrollLeft).toBe(200);
  fireEvent.scroll(before, { target: { scrollLeft: 20 } });
  expect(after.scrollLeft).toBe(20);
});

function mockOverflow(pane: HTMLElement) {
  Object.defineProperties(pane, {
    scrollWidth: { configurable: true, value: 1000 },
    clientWidth: { configurable: true, value: 300 },
  });
  pane.style.lineHeight = "20px";
}

it.each(["en", "fa"] as const)("uses Shift-wheel from either pane without vertical movement or duplicate horizontal input in %s", language => {
  act(() => setLanguage(language));
  render(<SideBySideDiff staged={false} truncated={false} text={"@@ -1 +1 @@\n-old\n+new"} />);
  const before = screen.getByLabelText(t("{label} code", { label: t("Index") }));
  const after = screen.getByLabelText(t("{label} code", { label: t("Working tree") }));
  mockOverflow(before); mockOverflow(after);
  const wheel = (pane: HTMLElement, options: WheelEventInit) => {
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, shiftKey: true, ...options });
    fireEvent(pane.querySelector("code")!, event);
    expect(event.defaultPrevented).toBe(true);
  };
  wheel(before, { deltaY: 90 });
  expect([before.scrollLeft, after.scrollLeft]).toEqual([90, 90]);
  wheel(after, { deltaY: -30 });
  expect([before.scrollLeft, after.scrollLeft]).toEqual([60, 60]);
  wheel(after, { deltaX: 15, deltaY: 0 });
  fireEvent.scroll(after);
  expect([before.scrollLeft, after.scrollLeft]).toEqual([75, 75]);
  wheel(before, { deltaY: 2, deltaMode: 1 });
  expect([before.scrollLeft, after.scrollLeft]).toEqual([115, 115]);
  wheel(after, { deltaY: 1, deltaMode: 2 });
  expect([before.scrollLeft, after.scrollLeft]).toEqual([415, 415]);
  expect([before.scrollTop, after.scrollTop]).toEqual([0, 0]);
});

it("leaves ordinary scrolling, zoom shortcuts and non-overflowing panes to the browser", () => {
  render(<SideBySideDiff staged={false} truncated={false} text={"@@ -1 +1 @@\n-old\n+new"} />);
  const pane = screen.getByLabelText("Index code");
  const noOverflow = new WheelEvent("wheel", { cancelable: true, shiftKey: true, deltaY: 90 });
  fireEvent(pane, noOverflow);
  expect(noOverflow.defaultPrevented).toBe(false);
  mockOverflow(pane);
  for (const options of [{ shiftKey: false }, { shiftKey: true, ctrlKey: true }, { shiftKey: true, metaKey: true }, { shiftKey: true, altKey: true }]) {
    const event = new WheelEvent("wheel", { cancelable: true, deltaY: 90, ...options });
    fireEvent(pane, event);
    expect(event.defaultPrevented).toBe(false);
  }
  expect(pane.scrollLeft).toBe(0);
});

it("supports Shift-wheel on a new file and removes the listener when the preview closes", () => {
  const view = render(<SideBySideDiff staged={false} truncated={false} newFile text={"@@ -0,0 +1 @@\n+long new line"} />);
  const pane = screen.getByLabelText("New file contents").querySelector<HTMLElement>(".diff-viewport")!;
  mockOverflow(pane);
  const event = new WheelEvent("wheel", { cancelable: true, shiftKey: true, deltaY: 50 });
  fireEvent(pane, event);
  expect(event.defaultPrevented).toBe(true);
  expect(pane.scrollLeft).toBe(50);
  view.unmount();
  const detached = new WheelEvent("wheel", { cancelable: true, shiftKey: true, deltaY: 50 });
  fireEvent(pane, detached);
  expect(detached.defaultPrevented).toBe(false);
  expect(pane.scrollLeft).toBe(50);
});
