import {existsSync,readFileSync} from "node:fs";
import {render,screen} from "@testing-library/react";
import {expect,it} from "vitest";
import {fileType} from "./file-types";
import {FileIcon} from "@/components/file-icon";
it("uses the same file type across Windows/POSIX paths and case variants",()=>{
  expect(fileType("src\\APP.TSX")).toEqual(fileType("src/App.tsx"));
  expect(fileType("images/PHOTO.PNG")).toEqual(fileType("photo.png"));
});
it("distinguishes compound framework files from ordinary language files",()=>{
  expect(fileType("views/show.blade.php").icon).not.toBe(fileType("app/Controller.php").icon);
  expect(fileType("README.md").icon).not.toBe(fileType("article.md").icon);
});
it("ships every icon referenced by the file type map",()=>{
  const source=readFileSync("src/lib/file-types.ts","utf8");
  for(const [,icon] of source.matchAll(/(?:\[|icon:)"([a-z_]+)"/g)) expect(existsSync(`public/file-icons/${icon}.svg`),icon).toBe(true);
});
it("keeps filenames as accessible names and icons decorative",()=>{
  render(<button><FileIcon path="catalog.json"/>catalog.json</button>);
  expect(screen.getByRole("button",{name:"catalog.json"})).toBeInTheDocument();expect(screen.queryByRole("img")).not.toBeInTheDocument();
});
