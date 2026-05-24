import type { RoundState } from "../../domain/entities/RoundState";

export interface RoundStateRepository {
  get(): Promise<RoundState>;
  save(state: RoundState): Promise<void>;
}
