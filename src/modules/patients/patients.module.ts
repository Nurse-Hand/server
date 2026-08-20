import { Module } from '@nestjs/common';
import { TimelineModule } from '../timeline/timeline.module';
import { PatientCommandService } from './application/patient-command.service';
import { PatientQueryService } from './application/patient-query.service';
import { PatientsController } from './presentation/patients.controller';

@Module({
  imports: [TimelineModule],
  controllers: [PatientsController],
  providers: [PatientCommandService, PatientQueryService],
})
export class PatientsModule {}
