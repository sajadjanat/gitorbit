import { useSyncExternalStore, type ReactNode } from "react";
import { Direction } from "radix-ui";
import { messages } from "./messages";

export type Language = "en" | "fa" | "ar";
export const languages = [{id: "en", name: "English"}, {id: "fa", name: "فارسی"}, {id: "ar", name: "العربية"}] as const;
const storageKey = "gitorbit-language";
const listeners = new Set<() => void>();
export function readLanguage(): Language {
  try { const value = localStorage.getItem(storageKey); return value === "fa" || value === "ar" ? value : "en"; }
  catch { return "en"; }
}
let current: Language = readLanguage();
export const languageDirection = (language: Language): "ltr" | "rtl" => language === "en" ? "ltr" : "rtl";
export const languageLocale = (language: Language) => ({en: "en-GB", fa: "fa-IR", ar: "ar-EG"})[language];
function applyLanguage() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = current;
  document.documentElement.dir = languageDirection(current);
}
applyLanguage();
export function setLanguage(language: Language) {
  if (!languages.some(item => item.id === language)) return;
  current = language;
  try { localStorage.setItem(storageKey, language); } catch { /* Session preference still works. */ }
  applyLanguage();
  listeners.forEach(listener => listener());
}
export function useLanguage() {
  const language = useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener); }, () => current, () => "en" as Language);
  return {language, direction: languageDirection(language), locale: languageLocale(language), setLanguage};
}
export function LanguageProvider({children}: {children: ReactNode}) {
  const {direction} = useLanguage();
  return <Direction.Provider dir={direction}>{children}</Direction.Provider>;
}
export function translate(key: string, language: Language, values: Record<string, string | number> = {}) {
  const value = language === "en" ? key : messages[key]?.[language] ?? key;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => {
    const replacement = values[name];
    if (replacement === undefined) return match;
    const text = typeof replacement === "number" ? new Intl.NumberFormat(languageLocale(language)).format(replacement) : replacement;
    // Keep interpolated paths/branch names and numbers from affecting the sentence's direction.
    return language === "en" ? text : `\u2068${text}\u2069`;
  });
}
export const t = (key: string, values?: Record<string, string | number>): string => {
  if (values || current === "en" || messages[key]) return translate(key, current, values);
  // Only recognize app-owned summaries; leave original Git output and user text intact.
  const commit = key.match(/^Created commit ([a-f\d]+)\.$/);
  if (commit) return translate("Created commit {hash}.", current, {hash: commit[1]});
  const files = key.match(/^(Staged|Unstaged) (\d+) file\(s\)\.$/);
  if (files) return translate(`${files[1]} {count} file(s).`, current, {count: Number(files[2])});
  return key;
};
export const plural = (count: number, one: string, other: string) => t(count === 1 ? one : other, {count});
export const number = (value: number) => new Intl.NumberFormat(languageLocale(current)).format(value);
export const date = (value: Date, options: Intl.DateTimeFormatOptions = {}) => new Intl.DateTimeFormat(languageLocale(current), {calendar: "gregory", ...options}).format(value);
