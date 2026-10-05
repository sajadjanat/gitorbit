import { Languages } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { languageDirection, languages, t, useLanguage, type Language } from "@/lib/i18n";

export function LanguagePicker() {
  const {language, setLanguage} = useLanguage();
  return <Select value={language} onValueChange={value => setLanguage(value as Language)}>
    <SelectTrigger aria-label={t("Language")} title={t("Language")} className="h-8 w-auto min-w-24 gap-2 border-0 bg-transparent text-xs shadow-none">
      <Languages className="size-3.5 shrink-0" /><SelectValue />
    </SelectTrigger>
    <SelectContent align="end">
      {languages.map(item => <SelectItem key={item.id} value={item.id}><span lang={item.id === "zh" ? "zh-CN" : item.id} dir={languageDirection(item.id)}>{item.name}</span></SelectItem>)}
    </SelectContent>
  </Select>;
}
