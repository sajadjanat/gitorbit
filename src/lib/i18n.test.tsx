/// <reference types="node" />
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { LanguageProvider, date, readLanguage, setLanguage, translate, useLanguage } from "./i18n";
import { messages } from "./messages";
import { SideBySideDiff } from "@/components/side-by-side-diff";

describe("language and direction", () => {
  it("persists supported choices and ignores corrupted storage", () => {
    setLanguage("fa");
    expect(readLanguage()).toBe("fa");
    expect(document.documentElement).toHaveAttribute("lang", "fa");
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    setLanguage("ar"); expect(readLanguage()).toBe("ar");
    setLanguage("zh"); expect(readLanguage()).toBe("zh");
    expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
    expect(document.documentElement).toHaveAttribute("dir", "ltr");
    localStorage.setItem("gitorbit-language", "invalid");
    expect(readLanguage()).toBe("en");
    setLanguage("en"); expect(document.documentElement.dir).toBe("ltr");
  });
  it("keeps a working session when storage is blocked", () => {
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    try { setLanguage("ar"); expect(document.documentElement.lang).toBe("ar"); }
    finally { storage.mockRestore(); }
  });
  it("isolates mixed paths and formats counts without changing Git dates", () => {
    expect(translate("Close {name}", "fa", {name: "api/feature-2"})).toContain("\u2068api/feature-2\u2069");
    expect(translate("{count} repositories", "fa", {count: 12})).toContain("۱۲");
    setLanguage("fa"); expect(date(new Date("2026-10-05T00:00:00Z"), {year: "numeric"})).toContain("۲۰۲۶");
  });
  it.each(["fa", "ar", "zh"] as const)("keeps code and before/after panes LTR in %s", (language) => {
    function Fixture() { useLanguage(); return <SideBySideDiff staged={false} truncated={false} text={"--- a/code\n+++ b/code\n@@ -1 +1 @@\n-const value = 1;\n+const value = 2;\n"} />; }
    render(<LanguageProvider><Fixture /></LanguageProvider>);
    act(() => setLanguage(language));
    const oldCode = screen.getAllByText(/const value =/)[0].closest("code");
    expect(oldCode).toHaveAttribute("dir", "ltr");
    expect(oldCode?.closest('.diff-viewport')).toHaveAttribute("dir", "ltr");
    expect(screen.getAllByText(/const value =/)).toHaveLength(2);
  });
});

describe("translation catalog", () => {
  it("has matching interpolation fields in all complete translations", () => {
    const fields = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const [key, values] of Object.entries(messages)) {
      for (const language of ["fa", "ar", "zh"] as const) {
        expect(values[language].trim(), `${key}: ${language}`).not.toBe("");
        expect(fields(values[language]), `${key}: ${language}`).toEqual(fields(key));
      }
    }
  });
  it("covers every literal UI translation key", () => {
    const paths = (directory: string): string[] => readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? paths(path) : /\.tsx?$/.test(path) && !/\.test\./.test(path) ? [path] : [];
    });
    const missing = new Set<string>();
    for (const path of paths(resolve("src"))) {
      const file = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const args = node.expression.text === "t" ? node.arguments.slice(0, 1) : node.expression.text === "plural" ? node.arguments.slice(1) : [];
          for (const argument of args) if (ts.isStringLiteral(argument) && !messages[argument.text]) missing.add(argument.text);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect([...missing]).toEqual([]);
  });
});
