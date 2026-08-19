import { Inject, Injectable } from '@nestjs/common';
import { createCanonicalRequestHash } from '../../../common/idempotency/canonical-request-hash';
import { Clock } from '../../../common/time/clock';
import {
  TASK_QUERY_PORT,
  type TaskQueryPort,
} from '../../tasks/application/ports/task-query.port';
import {
  HANDOFF_DEFAULT_LIST_LIMIT,
  HANDOFF_JOB_MAX_ATTEMPTS,
  type HandoffTemplateId,
} from '../domain/handoff.constants';
import { decodeHandoffCursor } from '../domain/handoff-cursor';
import {
  HandoffCommandInvalidError,
  HandoffCriticalAnswerRequiredError,
  HandoffStateInvalidError,
  HandoffTaskLinkInvalidError,
} from '../domain/handoff.errors';
import type {
  HandoffDraftContext,
  HandoffDraftDetail,
  HandoffDraftListResult,
} from './handoff-draft.models';
import {
  HANDOFF_DRAFT_REPOSITORY,
  type HandoffDraftRepository,
} from './ports/handoff-draft.repository';
import {
  HANDOFF_PRECHECK_REPOSITORY,
  type HandoffPrecheckRepository,
} from './ports/handoff-precheck.repository';

type CreateHandoffRequest = {
  precheckId: string;
  templateId: HandoffTemplateId;
  includeUnverified: boolean;
};

type ClinicalSectionsRequest = {
  patientStatus: string;
  pain: string;
  treatment: string;
  diet: string;
  activity: string;
  observation: string;
};

type UpdateHandoffRequest = {
  patients: readonly {
    patientId: string;
    sections: ClinicalSectionsRequest;
  }[];
  taskIds: readonly string[];
  version: number;
};

@Injectable()
export class HandoffDraftsService {
  constructor(
    @Inject(HANDOFF_DRAFT_REPOSITORY)
    private readonly repository: HandoffDraftRepository,
    @Inject(HANDOFF_PRECHECK_REPOSITORY)
    private readonly prechecks: HandoffPrecheckRepository,
    @Inject(TASK_QUERY_PORT)
    private readonly taskQueryPort: TaskQueryPort,
    private readonly clock: Clock,
  ) {}

  list(
    context: HandoffDraftContext,
    query: {
      date?: string;
      status?: 'DRAFT' | 'FINALIZED';
      cursor?: string;
      limit?: number;
    },
  ): Promise<HandoffDraftListResult> {
    return this.repository.list({
      context,
      ...(query.date === undefined ? {} : { date: query.date }),
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.cursor === undefined
        ? {}
        : { cursor: decodeHandoffCursor(query.cursor) }),
      limit: query.limit ?? HANDOFF_DEFAULT_LIST_LIMIT,
    });
  }

  get(
    context: HandoffDraftContext,
    handoffId: string,
  ): Promise<HandoffDraftDetail> {
    return this.repository.get(context, handoffId, this.clock.now());
  }

  async create(
    context: HandoffDraftContext,
    body: CreateHandoffRequest,
    idempotencyKey: string,
    requestId: string,
  ): Promise<{ handoffId: string; status: 'GENERATING' }> {
    assertIdempotencyKey(idempotencyKey);
    const requestHash = createCanonicalRequestHash({
      path: {},
      query: {},
      body: {
        includeUnverified: body.includeUnverified,
        precheckId: body.precheckId,
        templateId: body.templateId,
      },
    });
    const replay = await this.repository.findReplay({
      context,
      idempotencyKey,
      requestHash,
    });
    if (replay !== null) {
      return { handoffId: replay.resourceId, status: 'GENERATING' };
    }

    const precheck = await this.prechecks.get(context, body.precheckId);
    if (precheck.job.status !== 'SUCCEEDED') {
      throw new HandoffStateInvalidError(
        '성공한 사전검증 결과만 초안 생성에 사용할 수 있습니다.',
      );
    }
    if (
      precheck.items.some(
        ({ severity, answer }) => severity === 'CRITICAL' && answer === null,
      )
    ) {
      throw new HandoffCriticalAnswerRequiredError();
    }

    const reserved = await this.repository.reserve({
      context,
      ...body,
      idempotencyKey,
      requestHash,
      requestId,
      now: this.clock.now(),
      maxAttempts: HANDOFF_JOB_MAX_ATTEMPTS,
    });
    return { handoffId: reserved.resourceId, status: 'GENERATING' };
  }

  async update(
    context: HandoffDraftContext,
    handoffId: string,
    body: UpdateHandoffRequest,
  ) {
    const detail = await this.repository.get(
      context,
      handoffId,
      this.clock.now(),
    );
    if (detail.status !== 'DRAFT' || detail.draft === null) {
      throw new HandoffStateInvalidError();
    }

    const patientIds = [
      ...new Set(body.patients.map(({ patientId }) => patientId)),
    ];
    if (patientIds.length !== body.patients.length) {
      throw new HandoffCommandInvalidError();
    }
    const requestedTaskIds = [...new Set(body.taskIds)];
    if (requestedTaskIds.length !== body.taskIds.length) {
      throw new HandoffTaskLinkInvalidError();
    }

    const existingTasksById = new Map(
      detail.draft.tasks.map((task) => [task.id, task]),
    );
    const newTaskIds = requestedTaskIds.filter(
      (taskId) => !existingTasksById.has(taskId),
    );
    const incompleteTasks =
      newTaskIds.length === 0
        ? []
        : await this.taskQueryPort.findIncompleteByPatients(
            context,
            patientIds,
          );
    const incompleteTasksById = new Map(
      incompleteTasks.map((task) => [task.id, task]),
    );
    if (
      newTaskIds.some((taskId) => {
        const task = incompleteTasksById.get(taskId);
        return (
          task === undefined ||
          (task.patientId !== null && !patientIds.includes(task.patientId))
        );
      })
    ) {
      throw new HandoffTaskLinkInvalidError();
    }

    return this.repository.update({
      context,
      handoffId,
      version: body.version,
      patients: body.patients.map(({ patientId, sections }) => ({
        patientId,
        sections: {
          PATIENT_STATUS: sections.patientStatus,
          PAIN: sections.pain,
          TREATMENT: sections.treatment,
          DIET: sections.diet,
          ACTIVITY: sections.activity,
          OBSERVATION: sections.observation,
        },
      })),
      tasks: requestedTaskIds.map((taskId) => {
        const task =
          existingTasksById.get(taskId) ?? incompleteTasksById.get(taskId);
        if (!task) throw new HandoffTaskLinkInvalidError();
        return task;
      }),
      now: this.clock.now(),
    });
  }
}

function assertIdempotencyKey(value: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 128 ||
    Array.from(value).some((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    })
  ) {
    throw new HandoffCommandInvalidError();
  }
}
