import { check, type Update, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type AppUpdate = Pick<Update, "version" | "body" | "date" | "download" | "install" | "close">;
export type UpdateEvent = DownloadEvent;
export const updater = {
  check: (): Promise<AppUpdate | null> => check({ timeout: 20_000 }),
  restart: relaunch,
};
