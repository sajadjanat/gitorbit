import { render, screen, within } from "@testing-library/react";
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
