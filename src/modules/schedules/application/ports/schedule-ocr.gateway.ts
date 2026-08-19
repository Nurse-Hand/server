import type { ScheduleOcrToken } from '../../domain/schedule-policy';

export const SCHEDULE_OCR_GATEWAY = Symbol('SCHEDULE_OCR_GATEWAY');

export type ScheduleOcrGatewayInput = {
  image: Buffer;
  yearMonth: string;
  templateId: string;
  rowIndex: number;
  requestId: string;
};

export type ScheduleOcrCandidate = {
  day: number;
  token: ScheduleOcrToken;
  confidence: number;
};

export interface ScheduleOcrGateway {
  recognize(input: ScheduleOcrGatewayInput): Promise<ScheduleOcrCandidate[]>;
}
