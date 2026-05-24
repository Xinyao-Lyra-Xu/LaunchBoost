export interface WheelDisplayItem {
  id: string;
  type: "task" | "reward";
  title: string;
  weight: number;
  probability: number;
  color: string;
}

export interface SpinnerViewModel {
  segments: WheelDisplayItem[];
  isSpinning: boolean;
  canSpin: boolean;
  targetRotation: number;
  statsLine: string;
  skipCardsLine: string;
}
