import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { SystemClock } from '../src/common/time/system-clock';
import { createPrismaPgAdapter } from '../src/infrastructure/database/prisma-pg-adapter';
import { assertDemoSeedAllowed } from '../src/modules/demo/domain/demo-seed-policy';
import { DemoScenarioSeeder } from '../src/modules/demo/infrastructure/demo-scenario.seeder';

const SEED_DATASET_ID = '00000000-0000-4000-8000-000000000005';
const SCENARIO_KEY = 'SYNTHETIC_MEDICAL_DAY_SHIFT';

async function seedDemo(): Promise<void> {
  assertDemoSeedAllowed(process.env.NODE_ENV, process.env.DEMO_MODE);

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('Demo seed에는 DATABASE_URL이 필요합니다.');
  }

  const prisma = new PrismaClient({
    adapter: createPrismaPgAdapter(databaseUrl),
  });
  const seeder = new DemoScenarioSeeder(new SystemClock());

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.demoDataset.upsert({
        where: { id: SEED_DATASET_ID },
        update: { scenarioKey: SCENARIO_KEY },
        create: { id: SEED_DATASET_ID, scenarioKey: SCENARIO_KEY },
      });
      await seeder.seed(transaction, SEED_DATASET_ID, SCENARIO_KEY);
    });

    console.log('Synthetic demo seed completed.');
  } finally {
    await prisma.$disconnect();
  }
}

seedDemo().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Demo seed 실패');
  process.exitCode = 1;
});
