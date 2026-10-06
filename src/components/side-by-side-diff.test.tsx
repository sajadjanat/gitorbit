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
