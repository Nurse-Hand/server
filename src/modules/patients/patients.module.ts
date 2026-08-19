import { Module } from '@nestjs/common';
import { TimelineModule } from '../timeline/timeline.module';
import { PatientQueryService } from './application/patient-query.service';
import { PatientsController } from './presentation/patients.controller';

@Module({
  imports: [TimelineModule],
  controllers: [PatientsController],
  providers: [PatientQueryService],
})
export class PatientsModule {}
