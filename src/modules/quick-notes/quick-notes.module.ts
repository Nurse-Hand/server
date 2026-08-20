import { Module } from '@nestjs/common';
import { ClockModule } from '../../common/time/clock.module';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { QuickNoteService } from './application/quick-note.service';
import { QUICK_NOTE_REPOSITORY } from './application/ports/quick-note.repository';
import { PrismaQuickNoteRepository } from './infrastructure/prisma-quick-note.repository';
import { QuickNotesController } from './presentation/quick-notes.controller';

@Module({
  imports: [ClockModule, PrismaModule],
  controllers: [QuickNotesController],
  providers: [
    QuickNoteService,
    PrismaQuickNoteRepository,
    {
      provide: QUICK_NOTE_REPOSITORY,
      useExisting: PrismaQuickNoteRepository,
    },
  ],
})
export class QuickNotesModule {}
