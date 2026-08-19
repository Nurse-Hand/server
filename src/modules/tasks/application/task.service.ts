import { Inject, Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { Clock } from '../../../common/time/clock';
import type { DemoSessionContext } from '../../demo/application/demo-session-context';
import {
  TaskApplyInvalidError,
  TaskCommandInvalidError,
  TaskDueAtInvalidError,
  TaskExtractionEvidenceEmptyError,
  TaskExtractionEvidenceInvalidError,
} from '../domain/task.errors';
import {
  TASK_EVIDENCE_SOURCE_TYPES,
  TASK_EXTRACTION_MAX_ATTEMPTS,
  TASK_LIST_SORTS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskListSort,
  type TaskPriority,
  type TaskStatus,
} from '../domain/task.types';
import {
  deriveSeoulWorkDate,
  parseTaskWorkDate,
} from '../domain/task-work-date';
import {
  TASK_EXTRACTION_EVIDENCE_PORT,
  type TaskExtractionEvidence,
  type TaskExtractionEvidencePort,
  type TaskExtractionEvidenceSnapshot,
} from './ports/task-extraction-evidence.port';
import {
  TASK_REPOSITORY,
  type ApplyTaskCandidateItem,
  type ApplyTaskCandidatesResult,
  type CreateTaskResult,
  type ListTasksResult,
  type TaskExtractionJobView,
  type TaskRepository,
  type TaskView,
} from './ports/task.repository';

type ListTasksCommand = {
  date: string;
  status?: TaskStatus;
  patientId?: string;
  sort?: TaskListSort;
  cursor?: string;
  limit?: number;
};

type CreateTaskCommand = {
  patientId?: string | null;
  title: string;
  description?: string | null;
  dueAt: string;
  priorityOverride?: TaskPriority | null;
};

type ReserveExtractionCommand = {
  roundingSessionId: string;
  recordIds: readonly string[];
};

type UpdateTaskCommand = {
  version: number;
  title?: string;
  description?: string | null;
  dueAt?: string | null;
  status?: TaskStatus;
  priorityOverride?: TaskPriority | null;
};

type ApplyCandidateCommand = {
  candidateId: string;
  selected: boolean;
  title?: string;
  dueAt?: string | null;
  priorityOverride?: TaskPriority | null;
};

type ApplyCandidatesCommand = {
  items: readonly ApplyCandidateCommand[];
};

const TIME_ZONE_SUFFIX_PATTERN = /T.*(?:Z|[+-]\d{2}:\d{2})$/;
const TASK_EXTRACTION_BATCH_MAX_SIZE = 100;

@Injectable()
export class TaskService {
  constructor(
    @Inject(TASK_REPOSITORY)
    private readonly repository: TaskRepository,
    @Inject(TASK_EXTRACTION_EVIDENCE_PORT)
    private readonly evidencePort: TaskExtractionEvidencePort,
    private readonly clock: Clock,
  ) {}

  list(
    context: DemoSessionContext,
    command: ListTasksCommand,
  ): Promise<ListTasksResult> {
    if (
      command.status !== undefined &&
      !TASK_STATUSES.includes(command.status)
    ) {
      throw new TaskCommandInvalidError();
    }

    const sort = command.sort ?? 'priority';

    if (!TASK_LIST_SORTS.includes(sort)) {
      throw new TaskCommandInvalidError();
    }

    const limit = command.limit ?? 20;

    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new TaskCommandInvalidError();
    }

    return this.repository.list({
      context,
      workDate: parseTaskWorkDate(command.date),
      date: command.date,
      ...(command.status === undefined ? {} : { status: command.status }),
      ...(command.patientId === undefined
        ? {}
        : { patientId: command.patientId }),
      sort,
      ...(command.cursor === undefined ? {} : { cursor: command.cursor }),
      limit,
      now: this.clock.now(),
    });
  }

  create(
    context: DemoSessionContext,
    idempotencyKey: string,
    _requestId: string,
    command: CreateTaskCommand,
  ): Promise<CreateTaskResult> {
    assertIdempotencyKey(idempotencyKey);
    const now = this.clock.now();
    const dueAt = parseTimestamp(command.dueAt);

    if (dueAt.getTime() <= now.getTime()) {
      throw new TaskDueAtInvalidError(
        '직접 생성 업무의 dueAt은 현재보다 미래여야 합니다.',
      );
    }

    const title = normalizeRequiredText(command.title, 200);
    const description = normalizeNullableText(command.description, 1000);
    const patientId = command.patientId ?? null;
    const confirmedPriority = command.priorityOverride ?? null;
    assertPriorityOrNull(confirmedPriority);
    const normalizedBody = {
      description,
      dueAt: dueAt.toISOString(),
      patientId,
      priorityOverride: confirmedPriority,
      title,
    };

    return this.repository.create({
      context,
      idempotencyKey,
      requestHash: createCanonicalRequestHash({
        path: {},
        query: {},
        body: normalizedBody,
      }),
      patientId,
      title,
      description,
      dueAt,
      workDate: deriveSeoulWorkDate(dueAt),
      confirmedPriority,
      now,
    });
  }

  async reserveExtraction(
    context: DemoSessionContext,
    idempotencyKey: string,
    requestId: string,
    command: ReserveExtractionCommand,
  ) {
    assertIdempotencyKey(idempotencyKey);
    const recordIds = [...command.recordIds];

    if (
      !isUUID(command.roundingSessionId, '4') ||
      recordIds.length === 0 ||
      recordIds.length > TASK_EXTRACTION_BATCH_MAX_SIZE ||
      new Set(recordIds).size !== recordIds.length ||
      recordIds.some((recordId) => !isUUID(recordId, '4'))
    ) {
      throw new TaskCommandInvalidError();
    }

    const normalizedRecordIds = [...recordIds].sort();
    const requestHash = createCanonicalRequestHash({
      path: {},
      query: {},
      body: {
        recordIds: normalizedRecordIds,
        roundingSessionId: command.roundingSessionId,
      },
    });
    const replay = await this.repository.findExtractionReservationReplay({
      context,
      idempotencyKey,
      requestHash,
    });

    if (replay !== null) {
      return replay;
    }

    const now = this.clock.now();
    const snapshot = await this.evidencePort.read({
      context,
      roundingSessionId: command.roundingSessionId,
      recordIds: normalizedRecordIds,
    });

    assertEvidenceSnapshot(
      snapshot,
      command.roundingSessionId,
      normalizedRecordIds,
    );

    if (snapshot.evidence.length === 0) {
      throw new TaskExtractionEvidenceEmptyError();
    }

    return this.repository.reserveExtraction({
      context,
      idempotencyKey,
      requestHash,
      requestId,
      maxAttempts: TASK_EXTRACTION_MAX_ATTEMPTS,
      evidenceSnapshot: snapshot,
      now,
    });
  }

  findExtractionJob(
    context: DemoSessionContext,
    jobId: string,
  ): Promise<TaskExtractionJobView> {
    return this.repository.findExtractionJob(context, jobId);
  }

  update(
    context: DemoSessionContext,
    taskId: string,
    command: UpdateTaskCommand,
  ): Promise<TaskView> {
    const hasTitle = command.title !== undefined;
    const hasDescription = command.description !== undefined;
    const hasDueAt = command.dueAt !== undefined;
    const hasStatus = command.status !== undefined;
    const hasPriority = command.priorityOverride !== undefined;

    if (
      !hasTitle &&
      !hasDescription &&
      !hasDueAt &&
      !hasStatus &&
      !hasPriority
    ) {
      throw new TaskCommandInvalidError(
        'version 외에 수정할 필드가 하나 이상 필요합니다.',
      );
    }

    if (!Number.isInteger(command.version) || command.version < 1) {
      throw new TaskCommandInvalidError();
    }

    if (hasDueAt && command.dueAt === null) {
      throw new TaskDueAtInvalidError('dueAt을 null로 되돌릴 수 없습니다.');
    }

    const dueAt = hasDueAt ? parseTimestamp(command.dueAt!) : undefined;
    const confirmedPriority = hasPriority
      ? (command.priorityOverride ?? null)
      : undefined;

    if (confirmedPriority !== undefined) {
      assertPriorityOrNull(confirmedPriority);
    }

    if (
      command.status !== undefined &&
      !TASK_STATUSES.includes(command.status)
    ) {
      throw new TaskCommandInvalidError();
    }

    return this.repository.update({
      context,
      taskId,
      expectedVersion: command.version,
      ...(hasTitle
        ? { title: normalizeRequiredText(command.title!, 200) }
        : {}),
      ...(hasDescription
        ? { description: normalizeNullableText(command.description, 1000) }
        : {}),
      ...(dueAt === undefined
        ? {}
        : { dueAt, workDate: deriveSeoulWorkDate(dueAt) }),
      ...(hasStatus ? { status: command.status } : {}),
      ...(hasPriority ? { confirmedPriority: confirmedPriority! } : {}),
      now: this.clock.now(),
    });
  }

  applyCandidates(
    context: DemoSessionContext,
    jobId: string,
    idempotencyKey: string,
    command: ApplyCandidatesCommand,
  ): Promise<ApplyTaskCandidatesResult> {
    assertIdempotencyKey(idempotencyKey);

    if (command.items.length === 0) {
      throw new TaskApplyInvalidError('반영할 후보가 하나 이상 필요합니다.');
    }

    const candidateIds = command.items.map(({ candidateId }) => candidateId);
    if (new Set(candidateIds).size !== candidateIds.length) {
      throw new TaskApplyInvalidError('candidateId는 중복될 수 없습니다.');
    }

    for (const item of command.items) {
      if (
        !item.selected &&
        (item.title !== undefined ||
          item.dueAt !== undefined ||
          item.priorityOverride !== undefined)
      ) {
        throw new TaskApplyInvalidError(
          '선택하지 않은 후보에는 수정값을 보낼 수 없습니다.',
        );
      }
    }

    const selected = command.items.filter(({ selected }) => selected);
    if (selected.length === 0) {
      throw new TaskApplyInvalidError('선택된 후보가 하나 이상 필요합니다.');
    }

    const normalizedItems = selected
      .map((item): ApplyTaskCandidateItem => {
        const hasTitle = item.title !== undefined;
        const hasDueAt = item.dueAt !== undefined;
        const hasPriority = item.priorityOverride !== undefined;
        const priorityOverride = hasPriority
          ? (item.priorityOverride ?? null)
          : undefined;

        if (priorityOverride !== undefined) {
          assertPriorityOrNull(priorityOverride);
        }

        return {
          candidateId: item.candidateId,
          ...(hasTitle
            ? { title: normalizeRequiredText(item.title!, 200) }
            : {}),
          ...(hasDueAt
            ? {
                dueAt: item.dueAt === null ? null : parseTimestamp(item.dueAt!),
              }
            : {}),
          ...(hasPriority ? { priorityOverride: priorityOverride! } : {}),
        };
      })
      .sort((left, right) => left.candidateId.localeCompare(right.candidateId));
    const hashItems = normalizedItems.map((item) => ({
      candidateId: item.candidateId,
      ...(item.title === undefined ? {} : { title: item.title }),
      ...(item.dueAt === undefined
        ? {}
        : { dueAt: item.dueAt?.toISOString() ?? null }),
      ...(item.priorityOverride === undefined
        ? {}
        : { priorityOverride: item.priorityOverride }),
    }));

    return this.repository.applyCandidates({
      context,
      jobId,
      idempotencyKey,
      requestHash: createCanonicalRequestHash({
        path: { jobId },
        query: {},
        body: { items: hashItems },
      }),
      items: normalizedItems,
      now: this.clock.now(),
    });
  }
}

function parseTimestamp(value: string): Date {
  if (!TIME_ZONE_SUFFIX_PATTERN.test(value)) {
    throw new TaskCommandInvalidError(
      'timestamp에는 timezone이 포함되어야 합니다.',
    );
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new TaskCommandInvalidError('timestamp 형식이 올바르지 않습니다.');
  }

  return parsed;
}

function normalizeRequiredText(value: string, maxLength: number): string {
  const normalized = value.trim();

  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new TaskCommandInvalidError();
  }

  return normalized;
}

function normalizeNullableText(
  value: string | null | undefined,
  maxLength: number,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.length > maxLength) {
    throw new TaskCommandInvalidError();
  }

  return normalized;
}

function assertPriorityOrNull(
  value: TaskPriority | null,
): asserts value is TaskPriority | null {
  if (value !== null && !TASK_PRIORITIES.includes(value)) {
    throw new TaskCommandInvalidError();
  }
}

function assertIdempotencyKey(value: string): void {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{1,128}$/.test(value)) {
    throw new TaskCommandInvalidError('X-Idempotency-Key가 올바르지 않습니다.');
  }
}

function assertEvidenceSnapshot(
  snapshot: unknown,
  expectedSessionId: string,
  expectedRecordIds: readonly string[],
): asserts snapshot is TaskExtractionEvidenceSnapshot {
  if (
    typeof snapshot !== 'object' ||
    snapshot === null ||
    !('roundingSessionId' in snapshot) ||
    snapshot.roundingSessionId !== expectedSessionId ||
    !('evidence' in snapshot) ||
    !Array.isArray(snapshot.evidence)
  ) {
    throw new TaskExtractionEvidenceInvalidError();
  }

  const expectedIds = new Set(expectedRecordIds);
  const actualRecordIds = new Set<string>();
  const actualSourceIds = new Set<string>();

  for (const value of snapshot.evidence) {
    if (typeof value !== 'object' || value === null) {
      throw new TaskExtractionEvidenceInvalidError();
    }

    const evidence = value as Partial<TaskExtractionEvidence>;

    if (
      typeof evidence.recordId !== 'string' ||
      !isUUID(evidence.recordId, '4') ||
      !expectedIds.has(evidence.recordId) ||
      actualRecordIds.has(evidence.recordId) ||
      typeof evidence.sourceType !== 'string' ||
      !TASK_EVIDENCE_SOURCE_TYPES.includes(evidence.sourceType) ||
      typeof evidence.sourceId !== 'string' ||
      !isUUID(evidence.sourceId, '4') ||
      actualSourceIds.has(evidence.sourceId) ||
      (evidence.patientId !== null &&
        (typeof evidence.patientId !== 'string' ||
          !isUUID(evidence.patientId, '4'))) ||
      !(evidence.workDate instanceof Date) ||
      Number.isNaN(evidence.workDate.getTime()) ||
      evidence.workDate.toISOString().slice(11) !== '00:00:00.000Z' ||
      typeof evidence.summary !== 'string' ||
      evidence.summary.trim().length === 0 ||
      evidence.summary.length > 500
    ) {
      throw new TaskExtractionEvidenceInvalidError();
    }

    actualRecordIds.add(evidence.recordId);
    actualSourceIds.add(evidence.sourceId);
  }

  if (
    actualRecordIds.size !== 0 &&
    actualRecordIds.size !== expectedRecordIds.length
  ) {
    throw new TaskExtractionEvidenceInvalidError();
  }
}
