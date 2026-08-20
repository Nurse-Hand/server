import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DatabaseReadinessProbe } from '../application/database-readiness.probe';

@Injectable()
export class PrismaDatabaseReadinessProbe implements DatabaseReadinessProbe {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
