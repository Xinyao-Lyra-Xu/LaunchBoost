import type { SpinHistoryRepository } from "../../application/ports/SpinHistoryRepository";
import type { SpinResult } from "../../domain/entities/SpinResult";

/** Spin history is kept in memory only (not persisted to disk). */
export class ElectronIpcSpinHistoryRepository implements SpinHistoryRepository {
  private history: SpinResult[] = [];

  async getAll(): Promise<SpinResult[]> {
    return [...this.history];
  }

  async add(result: SpinResult): Promise<void> {
    this.history.push(result);
  }

  async update(result: SpinResult): Promise<void> {
    const idx = this.history.findIndex((r) => r.id === result.id);
    if (idx !== -1) this.history[idx] = result;
  }
}
