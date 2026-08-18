export const TASK_QUERY_PORT = Symbol('TASK_QUERY_PORT');

export type TaskQueryContext = {
  datasetId: string;
  actorId: string;
  wardId: string;
};

export type TaskPriority = 'CRITICAL' | 'HIGH' | 'NORMAL';

export type TaskReadModel = {
  id: string;
  patientId: string | null;
  title: string;
  dueAt: Date | null;
  effectivePriority: TaskPriority;
  version: number;
  sourceReferences: readonly string[];
  updatedAt: Date;
};

export interface TaskQueryPort {
  findIncompleteByPatients(
    context: TaskQueryContext,
    patientIds: readonly string[],
  ): Promise<readonly TaskReadModel[]>;
}
