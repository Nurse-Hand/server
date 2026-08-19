import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock } from '../../../common/time/clock';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import {
  DEFAULT_NO_LOGIN_MVP_DATASET_ID,
  type EnvironmentVariables,
} from '../../../config/environment';
import type { DemoSessionContext } from './demo-session-context';
import { DemoScenarioSeeder } from '../infrastructure/demo-scenario.seeder';

const NO_LOGIN_MVP_SCENARIO_KEY = 'SYNTHETIC_MEDICAL_DAY_SHIFT';

@Injectable()
export class NoLoginMvpContextResolver {
  private contextPromise?: Promise<DemoSessionContext>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly seeder: DemoScenarioSeeder,
    private readonly configService: ConfigService<EnvironmentVariables, true>,
    private readonly clock: Clock,
  ) {}

  resolve(): Promise<DemoSessionContext> {
    this.contextPromise ??= this.seedContext();
    return this.contextPromise;
  }

  private async seedContext(): Promise<DemoSessionContext> {
    const datasetId =
      this.configService.get('NO_LOGIN_MVP_DATASET_ID', { infer: true }) ??
      DEFAULT_NO_LOGIN_MVP_DATASET_ID;
    const now = this.clock.now();

    return this.prisma.$transaction(async (transaction) => {
      await transaction.demoDataset.upsert({
        where: { id: datasetId },
        update: { scenarioKey: NO_LOGIN_MVP_SCENARIO_KEY },
        create: {
          id: datasetId,
          scenarioKey: NO_LOGIN_MVP_SCENARIO_KEY,
        },
      });

      const seeded = await this.seeder.seed(
        transaction,
        datasetId,
        NO_LOGIN_MVP_SCENARIO_KEY,
        now,
      );

      return {
        datasetId,
        actorId: seeded.actorId,
        wardId: seeded.wardId,
      };
    });
  }
}
