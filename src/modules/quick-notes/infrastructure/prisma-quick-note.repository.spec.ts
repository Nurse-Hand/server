import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  QUICK_NOTE_TYPES,
  type QuickNoteType,
} from '../domain/quick-note.types';
import { PrismaQuickNoteRepository } from './prisma-quick-note.repository';

const CONTEXT: DemoSessionContext = {
  datasetId: '10000000-0000-4000-8000-000000000101',
  actorId: '10000000-0000-4000-8000-000000000201',
  wardId: '10000000-0000-4000-8000-000000000301',
};
const PATIENT_ID = '10000000-0000-4000-8000-000000000401';
const OCCURRED_AT = new Date('2026-08-20T01:14:00.000Z');

describe('PrismaQuickNoteRepository', () => {
  it.each(QUICK_NOTE_TYPES)(
    '%s Quick Note의 임상 분류를 TimelineEvent에 그대로 보존한다',
    async (noteType) => {
      const transaction = {
        quickNote: {
          create: jest.fn().mockResolvedValue(createQuickNoteRow(noteType)),
        },
        timelineEvent: { create: jest.fn() },
      };
      const prisma = {
        $transaction: jest.fn(
          async (callback: (client: typeof transaction) => unknown) =>
            callback(transaction),
        ),
      };
      const repository = new PrismaQuickNoteRepository(
        prisma as unknown as PrismaService,
      );

      await repository.create({
        context: CONTEXT,
        patientId: PATIENT_ID,
        noteType,
        topic: noteType,
        handoffSection: 'Synthetic section',
        text: `Synthetic ${noteType}`,
        occurredAt: OCCURRED_AT,
        audioFile: null,
        photoFiles: [],
        keywords: [noteType],
        structuredFacts: {
          summary: `Synthetic ${noteType}`,
          text: `Synthetic ${noteType}`,
          occurredAt: OCCURRED_AT.toISOString(),
          sourceChannels: ['TEXT'],
          audioFileId: null,
          photoFileIds: [],
        },
      });

      expect(transaction.timelineEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          patientId: PATIENT_ID,
          type: 'OBSERVATION',
          clinicalCategory: noteType,
          source: 'MANUAL',
          confirmationStatus: 'CONFIRMED',
        }),
      });
    },
  );
});

function createQuickNoteRow(noteType: QuickNoteType) {
  return {
    id: '10000000-0000-4000-8000-000000000701',
    patientId: PATIENT_ID,
    noteType,
    topic: noteType,
    handoffSection: 'Synthetic section',
    sourceType: 'QUICK_NOTE' as const,
    text: `Synthetic ${noteType}`,
    occurredAt: OCCURRED_AT,
    keywords: [noteType],
    structuredFacts: {
      summary: `Synthetic ${noteType}`,
      text: `Synthetic ${noteType}`,
      occurredAt: OCCURRED_AT.toISOString(),
      sourceChannels: ['TEXT'],
      audioFileId: null,
      photoFileIds: [],
    },
    evidenceStatus: 'CONVERTED' as const,
    createdAt: OCCURRED_AT,
    updatedAt: OCCURRED_AT,
    audioFile: null,
    photoLinks: [],
  };
}
