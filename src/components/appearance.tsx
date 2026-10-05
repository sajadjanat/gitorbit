import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
export const PALETTES = [
  { id: "neutral", name: "Neutral", accent: "#71717a", surface: "#18181b" },
  { id: "violet", name: "Violet", accent: "#8b5cf6", surface: "#231a36" },
  { id: "ocean", name: "Ocean", accent: "#0284c7", surface: "#152a3a" },
  { id: "forest", name: "Forest", accent: "#059669", surface: "#152d25" },
];
interface Appearance { mode: "dark" | "light" | "system"; palette: string; accent: string | null }
const defaults: Appearance = { mode: "dark", palette: "neutral", accent: null };
const storageKey = "workspace-monitor-appearance";
export function loadAppearance(): Appearance {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? "null");
    if (!value || !["dark", "light", "system"].includes(value.mode) || !PALETTES.some((p) => p.id === value.palette)) return defaults;
    return { mode: value.mode, palette: value.palette, accent: /^#[\da-f]{6}$/i.test(value.accent ?? "") ? value.accent : null };
  } catch { return defaults; }
}
function foreground(hex: string) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const luminance = rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  return (luminance + .05) / .05 > 1.05 / (luminance + .05) ? "#09090b" : "#ffffff";
}
export function AppearanceButton() {
  const [settings, setSettings] = useState(loadAppearance);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const media = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
    const apply = () => {
      const root = document.documentElement;
      const dark = settings.mode === "dark" || (settings.mode === "system" && Boolean(media?.matches));
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
      root.dataset.palette = settings.palette;
      if (settings.accent) {
        root.style.setProperty("--primary", settings.accent);
        root.style.setProperty("--primary-foreground", foreground(settings.accent));
        root.style.setProperty("--ring", settings.accent);
      } else for (const key of ["--primary", "--primary-foreground", "--ring"]) root.style.removeProperty(key);
    };
    apply();
    localStorage.setItem(storageKey, JSON.stringify(settings));
    media?.addEventListener("change", apply);
    return () => media?.removeEventListener("change", apply);
  }, [settings]);
  return <>
    <Button variant="ghost" size="icon-sm" aria-label={t("Appearance")} onClick={() => setOpen(true)}><Palette className="size-4" /></Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{t("Appearance")}</DialogTitle><DialogDescription>{t("Make the workspace feel like yours. Changes are saved automatically.")}</DialogDescription></DialogHeader>
        <div className="space-y-5 pt-2">
          <fieldset><legend className="text-xs font-medium mb-2">{t("Mode")}</legend><div className="grid grid-cols-3 gap-2">
            {(["light", "dark", "system"] as const).map((mode) => {
              const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
              return <Button key={mode} variant={settings.mode === mode ? "default" : "outline"} aria-pressed={settings.mode === mode} onClick={() => setSettings({ ...settings, mode })}><Icon className="size-4" />{t(mode[0].toUpperCase() + mode.slice(1))}</Button>;
            })}
          </div></fieldset>
          <fieldset><legend className="text-xs font-medium mb-2">{t("Palette")}</legend><div className="grid grid-cols-2 gap-2">
            {PALETTES.map((palette) => <Button key={palette.id} variant="outline" className="justify-start" aria-pressed={settings.palette === palette.id} onClick={() => setSettings({ ...settings, palette: palette.id, accent: null })}>
              <span className="size-4 rounded-full border" style={{ background: palette.accent }} />{t(palette.name)}{settings.palette === palette.id && <Check className="size-3 ms-auto" />}
            </Button>)}
          </div></fieldset>
          <div><label htmlFor="accent-color" className="text-xs font-medium">{t("Custom accent")}</label><div className="flex gap-2 mt-2 items-center">
            <Input id="accent-color" aria-label={t("Custom accent color")} type="color" className="h-9 w-16 p-1 cursor-pointer" value={settings.accent ?? PALETTES.find((p) => p.id === settings.palette)!.accent} onChange={(e) => setSettings({ ...settings, accent: e.target.value })} />
            <span dir="ltr" className="font-mono text-xs text-muted-foreground">{settings.accent ?? t("Palette default")}</span>
            <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setSettings({ ...settings, accent: null })}>{t("Reset color")}</Button>
          </div></div>
          <Button variant="outline" size="sm" onClick={() => setSettings(defaults)}>{t("Reset appearance")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
