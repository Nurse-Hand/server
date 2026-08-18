import { Injectable } from '@nestjs/common';

export type HealthResult = {
  status: 'ok';
  timestamp: string;
};

@Injectable()
export class HealthService {
  getHealth(): HealthResult {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
