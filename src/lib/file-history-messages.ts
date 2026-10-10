import type { Language } from "./i18n";

export const fileHistoryMessages: Record<string, Record<Exclude<Language, "en">, string>> = {
  "File history": {fa: "تاریخچه فایل", ar: "سجل الملف", zh: "文件历史"},
  "History": {fa: "تاریخچه", ar: "السجل", zh: "历史"},
  "Annotate": {fa: "نویسنده خط‌ها", ar: "تعليقات الأسطر", zh: "逐行追溯"},
  "Committed history, including detected renames.": {fa: "تاریخچه کامیت‌ها، همراه با تغییر نام‌های شناسایی‌شده.", ar: "سجل الالتزامات، بما في ذلك إعادة التسمية المكتشفة.", zh: "提交历史，包括检测到的重命名。"},
  "Refresh history": {fa: "بازخوانی تاریخچه", ar: "تحديث السجل", zh: "刷新历史"},
  "Loading file history…": {fa: "در حال دریافت تاریخچه فایل…", ar: "جارٍ تحميل سجل الملف…", zh: "正在加载文件历史…"},
  "Loading diff…": {fa: "در حال دریافت تفاوت‌ها…", ar: "جارٍ تحميل الفروق…", zh: "正在加载差异…"},
  "Loading annotations…": {fa: "در حال دریافت نویسنده خط‌ها…", ar: "جارٍ تحميل تعليقات الأسطر…", zh: "正在加载逐行追溯…"},
  "No committed history for this file on HEAD.": {fa: "این فایل در تاریخچه HEAD کامیتی ندارد.", ar: "لا يوجد سجل التزامات لهذا الملف في HEAD.", zh: "此文件在 HEAD 中没有提交历史。"},
  "Choose a commit to inspect its changes.": {fa: "برای دیدن تغییرات، یک کامیت انتخاب کنید.", ar: "اختر التزامًا لفحص تغييراته.", zh: "选择提交以查看更改。"},
  "Load more commits": {fa: "نمایش کامیت‌های بیشتر", ar: "تحميل المزيد من الالتزامات", zh: "加载更多提交"},
  "History limited to 2,000 commits.": {fa: "تاریخچه به ۲۰۰۰ کامیت محدود است.", ar: "السجل محدود بـ ٢٠٠٠ التزام.", zh: "历史记录最多显示 2,000 次提交。"},
  "Shallow clone: older history may be unavailable.": {fa: "کلون کم‌عمق است؛ ممکن است تاریخچه قدیمی‌تر موجود نباشد.", ar: "نسخة مستنسخة سطحية: قد لا يتوفر السجل الأقدم.", zh: "浅克隆：较早的历史可能不可用。"},
  "Annotations show the selected committed revision; local edits are excluded.": {fa: "نویسنده خط‌ها برای نسخه کامیت‌شده انتخابی نمایش داده می‌شود؛ تغییرات محلی لحاظ نمی‌شوند.", ar: "تعرض التعليقات النسخة الملتزم بها المحددة؛ ولا تشمل التعديلات المحلية.", zh: "追溯显示所选已提交版本，不包含本地修改。"},
  "Author": {fa: "نویسنده", ar: "المؤلف", zh: "作者"},
  "Commit": {fa: "کامیت", ar: "الالتزام", zh: "提交"},
  "Date": {fa: "تاریخ", ar: "التاريخ", zh: "日期"},
  "Original line": {fa: "خط اصلی", ar: "السطر الأصلي", zh: "原始行"},
  "Line": {fa: "خط", ar: "السطر", zh: "行"},
  "Source": {fa: "کد", ar: "المصدر", zh: "源码"},
  "Empty file.": {fa: "فایل خالی است.", ar: "الملف فارغ.", zh: "文件为空。"},
  "Annotations limited to the first 10,000 lines.": {fa: "فقط نویسنده ۱۰٬۰۰۰ خط نخست نمایش داده می‌شود.", ar: "التعليقات محدودة بأول ١٠٬٠٠٠ سطر.", zh: "逐行追溯仅显示前 10,000 行。"},
  "This file was deleted in the selected commit. Choose an earlier commit to annotate it.": {fa: "این فایل در کامیت انتخابی حذف شده است؛ برای دیدن نویسنده خط‌ها، یک کامیت قبلی انتخاب کنید.", ar: "حُذف هذا الملف في الالتزام المحدد. اختر التزامًا أقدم لعرض تعليقات الأسطر.", zh: "此文件在所选提交中已删除。请选择较早的提交进行追溯。"},
  "Line annotations are available for UTF-8 text files only.": {fa: "نویسنده خط‌ها فقط برای فایل‌های متنی UTF-8 قابل نمایش است.", ar: "تعليقات الأسطر متاحة لملفات UTF-8 النصية فقط.", zh: "逐行追溯仅适用于 UTF-8 文本文件。"},
  "This file is too large for line annotations (2 MiB limit).": {fa: "این فایل برای نمایش نویسنده خط‌ها بیش از حد بزرگ است (حداکثر ۲ مگابایت).", ar: "الملف كبير جدًا لتعليقات الأسطر (الحد الأقصى ٢ ميبيبايت).", zh: "文件过大，无法逐行追溯（上限 2 MiB）。"},
};

export function fileHistoryText(key: string, language: Language): string {
  return language === "en" ? key : fileHistoryMessages[key]?.[language] ?? key;
}
