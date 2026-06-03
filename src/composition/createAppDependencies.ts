import { ElectronIpcTaskRepository } from "../frameworks/storage/ElectronIpcTaskRepository";
import { ElectronIpcRewardRepository } from "../frameworks/storage/ElectronIpcRewardRepository";
import { ElectronIpcRoundStateRepository } from "../frameworks/storage/ElectronIpcRoundStateRepository";
import { ElectronIpcSpinHistoryRepository } from "../frameworks/storage/ElectronIpcSpinHistoryRepository";
import { ElectronIpcStatsRepository } from "../frameworks/storage/ElectronIpcStatsRepository";
import { ElectronIpcAchievementRepository } from "../frameworks/storage/ElectronIpcAchievementRepository";
import { ElectronIpcTaskSplitterGateway } from "../frameworks/api/ElectronIpcTaskSplitterGateway";

import { SpinWheelUseCase } from "../application/useCases/SpinWheelUseCase";
import { CompleteTaskUseCase } from "../application/useCases/CompleteTaskUseCase";
import { ProcrastinateTaskUseCase } from "../application/useCases/ProcrastinateTaskUseCase";
import { SkipTaskUseCase } from "../application/useCases/SkipTaskUseCase";
import { BankRewardUseCase } from "../application/useCases/BankRewardUseCase";
import { UseRewardUseCase } from "../application/useCases/UseRewardUseCase";
import { SplitTaskUseCase } from "../application/useCases/SplitTaskUseCase";
import { ResetRoundUseCase } from "../application/useCases/ResetRoundUseCase";
import { CheckAchievementsUseCase } from "../application/useCases/CheckAchievementsUseCase";

import { SpinController } from "../interface-adapters/controllers/SpinController";
import { TaskController } from "../interface-adapters/controllers/TaskController";
import { RewardController } from "../interface-adapters/controllers/RewardController";
import { SplitTaskController } from "../interface-adapters/controllers/SplitTaskController";
import { AchievementController } from "../interface-adapters/controllers/AchievementController";

export interface AppDependencies {
  spinController: SpinController;
  taskController: TaskController;
  rewardController: RewardController;
  splitTaskController: SplitTaskController;
  achievementController: AchievementController;
  taskRepo: ElectronIpcTaskRepository;
  rewardRepo: ElectronIpcRewardRepository;
  roundStateRepo: ElectronIpcRoundStateRepository;
  statsRepo: ElectronIpcStatsRepository;
}

export function createAppDependencies(): AppDependencies {
  // Repositories
  const taskRepo = new ElectronIpcTaskRepository();
  const rewardRepo = new ElectronIpcRewardRepository();
  const roundStateRepo = new ElectronIpcRoundStateRepository();
  const spinHistoryRepo = new ElectronIpcSpinHistoryRepository();
  const statsRepo = new ElectronIpcStatsRepository();
  const achievementRepo = new ElectronIpcAchievementRepository();

  // Gateway
  const splitterGateway = new ElectronIpcTaskSplitterGateway();

  // Use cases
  const spinWheelUseCase = new SpinWheelUseCase(
    taskRepo,
    rewardRepo,
    roundStateRepo,
    spinHistoryRepo,
  );
  const completeTaskUseCase = new CompleteTaskUseCase(taskRepo, roundStateRepo, statsRepo);
  const procrastinateTaskUseCase = new ProcrastinateTaskUseCase(
    taskRepo,
    roundStateRepo,
    statsRepo,
  );
  const skipTaskUseCase = new SkipTaskUseCase(taskRepo, roundStateRepo, statsRepo);
  const bankRewardUseCase = new BankRewardUseCase(rewardRepo, statsRepo);
  const useRewardUseCase = new UseRewardUseCase(rewardRepo);
  const splitTaskUseCase = new SplitTaskUseCase(taskRepo, splitterGateway, roundStateRepo);
  const resetRoundUseCase = new ResetRoundUseCase(taskRepo, roundStateRepo);
  const checkAchievementsUseCase = new CheckAchievementsUseCase(
    statsRepo,
    roundStateRepo,
    achievementRepo,
  );

  // Controllers
  const spinController = new SpinController(spinWheelUseCase);
  const taskController = new TaskController(
    taskRepo,
    roundStateRepo,
    completeTaskUseCase,
    procrastinateTaskUseCase,
    skipTaskUseCase,
    resetRoundUseCase,
  );
  const rewardController = new RewardController(rewardRepo, bankRewardUseCase, useRewardUseCase);
  const splitTaskController = new SplitTaskController(splitTaskUseCase);
  const achievementController = new AchievementController(statsRepo, checkAchievementsUseCase);

  return {
    spinController,
    taskController,
    rewardController,
    splitTaskController,
    achievementController,
    taskRepo,
    rewardRepo,
    roundStateRepo,
    statsRepo,
  };
}
