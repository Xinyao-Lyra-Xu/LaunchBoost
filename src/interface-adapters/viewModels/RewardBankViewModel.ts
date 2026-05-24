export interface RewardBankItem {
  id: string;
  title: string;
  durationMinutes: number;
  bankedCount: number;
  color: string;
}

export interface RewardBankViewModel {
  items: RewardBankItem[];
}
