import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import { Clock } from '../../../common/time/clock';
import { PatientNotFoundError } from '../../patients/domain/patient.errors';
import {
  QuickNoteAttachmentNotFoundError,
  QuickNotePayloadEmptyError,
} from '../domain/quick-note.errors';
import { QuickNoteService } from './quick-note.service';
import type { QuickNoteRepository, QuickNoteView } from './ports/quick-note.repository';

const DEMO_CONTEXT: DemoSessionContext = {
  datasetId: '10000000-0000-4000-8000-000000000101',
  actorId: '10000000-0000-4000-8000-000000000201',
  wardId: '10000000-0000-4000-8000-000000000301',
};

describe('QuickNoteService', () => {
  let repository: jest.Mocked<QuickNoteRepository>;
  let service: QuickNoteService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      findStoredFiles: jest.fn(),
      isAccessiblePatient: jest.fn(),
    };
    service = new QuickNoteService(repository, new FixedClock());
  });

  it('환자 접근 가능성과 첨부 파일 metadata를 검증한 뒤 빠른 기록을 저장한다', async () => {
    repository.isAccessiblePatient.mockResolvedValue(true);
    repository.findStoredFiles
      .mockResolvedValueOnce([
        createAttachment({ id: '10000000-0000-4000-8000-000000000501', kind: 'AUDIO' }),
      ])
      .mockResolvedValueOnce([
        createAttachment({ id: '10000000-0000-4000-8000-000000000601', kind: 'PHOTO' }),
      ]);
    repository.create.mockResolvedValue(createQuickNoteView());

    const result = await service.create(DEMO_CONTEXT, {
      patientId: '10000000-0000-4000-8000-000000000401',
      noteType: 'OBSERVATION',
      text: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
      occurredAt: '2026-08-20T10:14:00+09:00',
      audioFileId: '10000000-0000-4000-8000-000000000501',
      photoFileIds: ['10000000-0000-4000-8000-000000000601'],
    });

    expect(repository.isAccessiblePatient).toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: '10000000-0000-4000-8000-000000000401',
        noteType: 'OBSERVATION',
        topic: 'OBSERVATION',
        handoffSection: '관찰사항·특이사항',
        text: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
        keywords: expect.arrayContaining([
          '관찰',
          '보호자',
          '식사량',
          '걱정한다고',
        ]),
        structuredFacts: {
          summary: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
          text: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
          occurredAt: '2026-08-20T01:14:00.000Z',
          sourceChannels: ['TEXT', 'AUDIO', 'PHOTO'],
          audioFileId: '10000000-0000-4000-8000-000000000501',
          photoFileIds: ['10000000-0000-4000-8000-000000000601'],
        },
      }),
    );
    expect(result.id).toBe('10000000-0000-4000-8000-000000000701');
  });

  it('담당 환자가 아니면 저장하지 않는다', async () => {
    repository.isAccessiblePatient.mockResolvedValue(false);

    await expect(
      service.create(DEMO_CONTEXT, {
        patientId: '10000000-0000-4000-8000-000000000401',
        noteType: 'OBSERVATION',
        text: '메모',
        occurredAt: '2026-08-20T10:14:00+09:00',
      }),
    ).rejects.toBeInstanceOf(PatientNotFoundError);
  });

  it('텍스트와 첨부가 모두 없으면 저장을 거부한다', async () => {
    repository.isAccessiblePatient.mockResolvedValue(true);

    await expect(
      service.create(DEMO_CONTEXT, {
        patientId: '10000000-0000-4000-8000-000000000401',
        noteType: 'PAIN',
        occurredAt: '2026-08-20T10:14:00+09:00',
      }),
    ).rejects.toBeInstanceOf(QuickNotePayloadEmptyError);
  });

  it('첨부 파일이 없으면 저장을 거부한다', async () => {
    repository.isAccessiblePatient.mockResolvedValue(true);
    repository.findStoredFiles.mockResolvedValue([]);

    await expect(
      service.create(DEMO_CONTEXT, {
        patientId: '10000000-0000-4000-8000-000000000401',
        noteType: 'OBSERVATION',
        occurredAt: '2026-08-20T10:14:00+09:00',
        audioFileId: '10000000-0000-4000-8000-000000000501',
      }),
    ).rejects.toBeInstanceOf(QuickNoteAttachmentNotFoundError);
  });
});

function createAttachment(overrides: Partial<QuickNoteView['photoFiles'][number]> = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000801',
    kind: 'PHOTO' as const,
    mimeType: 'image/jpeg',
    originalName: 'photo.jpg',
    sizeBytes: 128,
    checksum: 'a'.repeat(64),
    createdAt: new Date('2026-08-20T01:14:00.000Z'),
    ...overrides,
  };
}

function createQuickNoteView(): QuickNoteView {
  return {
    id: '10000000-0000-4000-8000-000000000701',
    patientId: '10000000-0000-4000-8000-000000000401',
    noteType: 'OBSERVATION',
    topic: 'OBSERVATION',
    handoffSection: '관찰사항·특이사항',
    sourceType: 'QUICK_NOTE',
    text: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
    occurredAt: new Date('2026-08-20T01:14:00.000Z'),
    keywords: ['관찰', '보호자'],
    structuredFacts: {
      summary: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
      text: '보호자가 식사량 감소를 걱정한다고 말했습니다.',
      occurredAt: '2026-08-20T01:14:00.000Z',
      sourceChannels: ['TEXT', 'AUDIO', 'PHOTO'],
      audioFileId: '10000000-0000-4000-8000-000000000501',
      photoFileIds: ['10000000-0000-4000-8000-000000000801'],
    },
    evidenceStatus: 'PENDING',
    audioFile: createAttachment({
      id: '10000000-0000-4000-8000-000000000501',
      kind: 'AUDIO',
      mimeType: 'audio/mp4',
      originalName: 'note.m4a',
    }),
    photoFiles: [createAttachment()],
    createdAt: new Date('2026-08-20T01:14:05.000Z'),
    updatedAt: new Date('2026-08-20T01:14:05.000Z'),
  };
}

class FixedClock extends Clock {
  now(): Date {
    return new Date('2026-08-20T01:00:00.000Z');
  }
}
