import {fileType} from "@/lib/file-types";
import {t} from "@/lib/i18n";

export function FileIcon({path,className="size-4"}:{path:string;className?:string}) {
  const type=fileType(path);
  return <img src={`/file-icons/${type.icon}.svg`} alt="" aria-hidden="true" draggable={false} title={t("File type: {type}",{type:type.label})} data-file-type={type.icon} className={`shrink-0 object-contain ${className}`}/>;
}
