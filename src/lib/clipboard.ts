export async function copyText(value:string):Promise<void> {
  if(!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable. Copy the displayed path or hash manually.");
  await navigator.clipboard.writeText(value);
}
