import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { RoundingRecordService } from './application/rounding-record.service';
import { RoundingSessionService } from './application/rounding-session.service';
import { RoundingRecordsController } from './presentation/rounding-records.controller';
import { RoundingSessionsController } from './presentation/rounding-sessions.controller';

@Module({
  imports: [FilesModule],
  controllers: [RoundingSessionsController, RoundingRecordsController],
  providers: [RoundingSessionService, RoundingRecordService],
})
export class RoundingModule {}
