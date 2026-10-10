export function fileType(path: string): {icon:string; label:string} {
  const name = path.replace(/\\/g, "/").split("/").pop()!.toLowerCase();
  if (name.endsWith(".blade.php")) return {icon:"laravel",label:"Laravel Blade"};
  if (/^readme(?:\.|$)/.test(name)) return {icon:"readme",label:"README"};
  if (/^(?:dockerfile|compose\.ya?ml|docker-compose\.)/.test(name)) return {icon:"docker",label:"Docker"};
  if (/^(?:\.gitignore|\.gitattributes|\.gitmodules|\.gitkeep)$/.test(name)) return {icon:"git",label:"Git"};
  if (/^\.env(?:\.|$)/.test(name)) return {icon:"tune",label:"Environment"};
  if (/^(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.lock|composer\.lock)$/.test(name)) return {icon:"lock",label:"Lockfile"};
  const ext = name.split(".").pop() ?? "";
  const types: Record<string,[string,string]> = {
    php:["php","PHP"], md:["markdown","Markdown"], mdx:["markdown","MDX"], markdown:["markdown","Markdown"],
    json:["json","JSON"], jsonc:["json","JSONC"], json5:["json","JSON5"],
    js:["javascript","JavaScript"], mjs:["javascript","JavaScript"], cjs:["javascript","JavaScript"],
    ts:["typescript","TypeScript"], mts:["typescript","TypeScript"], cts:["typescript","TypeScript"], jsx:["react","React JSX"], tsx:["react_ts","React TSX"],
    vue:["vue","Vue"], svelte:["svelte","Svelte"], py:["python","Python"], rs:["rust","Rust"], go:["go","Go"],
    html:["html","HTML"], htm:["html","HTML"], volt:["html","Volt"], css:["css","CSS"], scss:["sass","SCSS"], sass:["sass","Sass"],
    yml:["yaml","YAML"], yaml:["yaml","YAML"], xml:["xml","XML"], svg:["image","SVG"],
    png:["image","PNG"], jpg:["image","JPEG"], jpeg:["image","JPEG"], gif:["image","GIF"], webp:["image","WebP"], avif:["image","AVIF"], bmp:["image","BMP"], ico:["image","ICO"], tif:["image","TIFF"], tiff:["image","TIFF"], psd:["image","PSD"],
    pdf:["pdf","PDF"], mp3:["audio","MP3"], wav:["audio","WAV"], flac:["audio","FLAC"], ogg:["audio","Ogg"], oga:["audio","Ogg"], m4a:["audio","M4A"], aac:["audio","AAC"],
    mp4:["video","MP4"], mov:["video","MOV"], webm:["video","WebM"], ogv:["video","Ogg video"], avi:["video","AVI"], mkv:["video","MKV"],
    zip:["zip","ZIP"], gz:["zip","Gzip"], tar:["zip","TAR"], rar:["zip","RAR"], "7z":["zip","7-Zip"],
    sql:["database","SQL"], db:["database","Database"], sqlite:["database","SQLite"], csv:["table","CSV"], tsv:["table","TSV"], xls:["table","Excel"], xlsx:["table","Excel"],
    doc:["document","Word"], docx:["document","Word"], odt:["document","Document"], txt:["document","Text"], log:["document","Log"],
    woff:["font","WOFF"], woff2:["font","WOFF2"], ttf:["font","TrueType"], otf:["font","OpenType"],
    java:["java","Java"], kt:["kotlin","Kotlin"], swift:["swift","Swift"], rb:["ruby","Ruby"], c:["c","C"], h:["c","C header"], cpp:["cpp","C++"], hpp:["cpp","C++ header"], cs:["csharp","C#"],
    sh:["console","Shell"], bash:["console","Bash"], zsh:["console","Zsh"], ps1:["powershell","PowerShell"], bat:["console","Batch"], cmd:["console","Batch"],
    toml:["settings","TOML"], ini:["settings","INI"], conf:["settings","Configuration"], config:["settings","Configuration"], lock:["lock","Lockfile"], pem:["certificate","Certificate"], crt:["certificate","Certificate"],
  };
  const found = types[ext];
  return found ? {icon:found[0],label:found[1]} : {icon:"file",label: name.includes(".") ? ext.toUpperCase() : "File"};
}
