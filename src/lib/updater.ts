import { Update, type DownloadEvent } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { relaunch } from "@tauri-apps/plugin-process";

export type AppUpdate = Pick<Update, "version" | "body" | "date" | "download" | "install" | "close">;
export type UpdateEvent = DownloadEvent;
export type UpdateConnection = "system" | "direct";
export const updater = {
  check: async (): Promise<AppUpdate | null> => {
    const metadata = await invoke<ConstructorParameters<typeof Update>[0] | null>("check_app_update");
    return metadata ? new Update(metadata) : null;
  },
  connection: () => invoke<UpdateConnection>("update_connection"),
  saveConnection: (mode: UpdateConnection) => invoke<void>("save_update_connection", { mode }),
  restart: relaunch,
};
