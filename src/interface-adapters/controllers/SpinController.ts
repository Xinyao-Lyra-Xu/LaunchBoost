import type { SpinWheelUseCase, SpinWheelOutput } from "../../application/useCases/SpinWheelUseCase";

export class SpinController {
  constructor(private spinWheelUseCase: SpinWheelUseCase) {}

  async spin(): Promise<SpinWheelOutput> {
    return this.spinWheelUseCase.execute();
  }
}
