import type { SpinResult } from "../../domain/entities/SpinResult";

export interface SpinHistoryRepository {
  getAll(): Promise<SpinResult[]>;
  add(result: SpinResult): Promise<void>;
  update(result: SpinResult): Promise<void>;
}
