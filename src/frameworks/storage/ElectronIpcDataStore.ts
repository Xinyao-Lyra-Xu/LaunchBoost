import type { PersistedData } from "../../electron";

/** Singleton that caches the full JSON payload from Electron IPC. */
class ElectronIpcDataStore {
  private cache: PersistedData | null = null;

  async load(): Promise<PersistedData> {
    const raw = await window.api.loadData();
    const data: PersistedData = {
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      rewards: Array.isArray(raw.rewards) ? raw.rewards : [],
      meta: raw.meta && typeof raw.meta === "object" ? raw.meta : {},
    };
    this.cache = data;
    return data;
  }

  async get(): Promise<PersistedData> {
    if (!this.cache) return this.load();
    return this.cache;
  }

  async save(data: PersistedData): Promise<void> {
    this.cache = data;
    await window.api.saveData(data);
  }

  invalidate(): void {
    this.cache = null;
  }
}

export const dataStore = new ElectronIpcDataStore();
