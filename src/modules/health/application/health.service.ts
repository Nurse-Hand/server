import { Inject, Injectable } from '@nestjs/common';
import {
  DATABASE_READINESS_PROBE,
  type DatabaseReadinessProbe,
} from './database-readiness.probe';

export type HealthResult = {
  status: 'ok';
  timestamp: string;
};

@Injectable()
export class HealthService {
  constructor(
    @Inject(DATABASE_READINESS_PROBE)
    private readonly databaseReadiness: DatabaseReadinessProbe,
  ) {}

  async getHealth(): Promise<HealthResult> {
    await this.databaseReadiness.check();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
