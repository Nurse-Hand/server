import { Injectable } from '@nestjs/common';
import { Clock } from '../../../common/time/clock';
import type { Prisma } from '../../../generated/prisma/client';
import {
  type DemoScenarioKey,
  isDemoScenarioKey,
} from '../domain/demo-scenario';
import { DemoScenarioNotAllowedError } from '../domain/demo-session.errors';

const HOUR_IN_MILLISECONDS = 60 * 60 * 1000;

export type SeededDemoScenario = {
  actorId: string;
  receiverId: string;
  wardId: string;
  nurseIds: readonly string[];
  patientIds: readonly string[];
  timelineEventIds: readonly string[];
  senderShiftEndsAt: Date;
};

@Injectable()
export class DemoScenarioSeeder {
  constructor(private readonly clock: Clock) {}

  async seed(
    transaction: Prisma.TransactionClient,
    datasetId: string,
    scenarioKey: DemoScenarioKey,
    referenceTime = this.clock.now(),
  ): Promise<SeededDemoScenario> {
    if (!isDemoScenarioKey(scenarioKey)) {
      throw new DemoScenarioNotAllowedError();
    }

    const senderShiftStart = new Date(
      referenceTime.getTime() - HOUR_IN_MILLISECONDS,
    );
    const senderShiftEnd = new Date(
      referenceTime.getTime() + 7 * HOUR_IN_MILLISECONDS,
    );
    const receiverShiftStart = senderShiftEnd;
    const receiverShiftEnd = new Date(
      receiverShiftStart.getTime() + 8 * HOUR_IN_MILLISECONDS,
    );

    const ward = await transaction.ward.upsert({
      where: {
        ward_dataset_logical_key: {
          datasetId,
          logicalKey: 'ward-medical-a',
        },
      },
      update: {
        code: 'SYN-MED-A',
        displayName: 'Synthetic Medical Ward A',
      },
      create: {
        datasetId,
        logicalKey: 'ward-medical-a',
        code: 'SYN-MED-A',
        displayName: 'Synthetic Medical Ward A',
      },
    });
    const actor = await this.upsertNurse(
      transaction,
      datasetId,
      'nurse-sender-a',
      'Synthetic Nurse Sender A',
    );
    const receiver = await this.upsertNurse(
      transaction,
      datasetId,
      'nurse-receiver-a',
      'Synthetic Nurse Receiver A',
    );

    await this.upsertMembership(
      transaction,
      datasetId,
      actor.id,
      ward.id,
      'membership-sender-a',
      'SENDER',
    );
    await this.upsertMembership(
      transaction,
      datasetId,
      receiver.id,
      ward.id,
      'membership-receiver-a',
      'RECEIVER',
    );

    const actorShift = await this.upsertShift(
      transaction,
      datasetId,
      actor.id,
      ward.id,
      'shift-sender-day-a',
      'DAY',
      senderShiftStart,
      senderShiftEnd,
    );
    await this.upsertShift(
      transaction,
      datasetId,
      receiver.id,
      ward.id,
      'shift-receiver-evening-a',
      'EVENING',
      receiverShiftStart,
      receiverShiftEnd,
    );

    const patientA = await this.upsertPatient(
      transaction,
      datasetId,
      ward.id,
      'patient-a',
      '환자 A',
      '301호 1번 침상',
      {
        patientCode: 'P-301-01',
        statusLabel: '주의',
        department: '정형외과',
        admittedAt: new Date('2026-07-30T00:00:00.000+09:00'),
        baselineSummary: '우측 대퇴골 골절 수술 후 통증 조절 및 보행 재활 중',
      },
    );
    const patientB = await this.upsertPatient(
      transaction,
      datasetId,
      ward.id,
      'patient-b',
      '환자 B',
      '405호 2번 침상',
      {
        patientCode: 'P-405-02',
        statusLabel: '주의',
        department: '호흡기내과',
        admittedAt: new Date('2026-08-02T00:00:00.000+09:00'),
        baselineSummary: '폐렴 치료 후 산소포화도와 호흡곤란 여부 관찰 중',
      },
    );

    await this.upsertAssignment(
      transaction,
      datasetId,
      patientA.id,
      actor.id,
      ward.id,
      actorShift.id,
      'assignment-patient-a',
      senderShiftStart,
      senderShiftEnd,
    );
    await this.upsertAssignment(
      transaction,
      datasetId,
      patientB.id,
      actor.id,
      ward.id,
      actorShift.id,
      'assignment-patient-b',
      senderShiftStart,
      senderShiftEnd,
    );

    const eventA = await this.upsertTimelineEvent(
      transaction,
      datasetId,
      patientA.id,
      ward.id,
      'timeline-patient-a-observation',
      new Date(referenceTime.getTime() - 30 * 60 * 1000),
      'synthetic:observation:a',
      '오전 라운딩에서 보행기 사용 가능, 수술 부위 출혈 없음',
    );
    const eventB = await this.upsertTimelineEvent(
      transaction,
      datasetId,
      patientB.id,
      ward.id,
      'timeline-patient-b-observation',
      new Date(referenceTime.getTime() - 15 * 60 * 1000),
      'synthetic:observation:b',
      '산소포화도 96% 유지, 기침 증상은 전일보다 감소',
    );

    return {
      actorId: actor.id,
      receiverId: receiver.id,
      wardId: ward.id,
      nurseIds: [actor.id, receiver.id],
      patientIds: [patientA.id, patientB.id],
      timelineEventIds: [eventA.id, eventB.id],
      senderShiftEndsAt: senderShiftEnd,
    };
  }

  private upsertNurse(
    transaction: Prisma.TransactionClient,
    datasetId: string,
    logicalKey: string,
    displayName: string,
  ) {
    return transaction.nurse.upsert({
      where: { nurse_dataset_logical_key: { datasetId, logicalKey } },
      update: { displayName },
      create: { datasetId, logicalKey, displayName },
    });
  }

  private upsertMembership(
    transaction: Prisma.TransactionClient,
    datasetId: string,
    nurseId: string,
    wardId: string,
    logicalKey: string,
    role: 'SENDER' | 'RECEIVER',
  ) {
    return transaction.wardMembership.upsert({
      where: {
        membership_dataset_logical_key: { datasetId, logicalKey },
      },
      update: { role },
      create: { datasetId, logicalKey, nurseId, wardId, role },
    });
  }

  private upsertShift(
    transaction: Prisma.TransactionClient,
    datasetId: string,
    nurseId: string,
    wardId: string,
    logicalKey: string,
    duty: 'DAY' | 'EVENING' | 'NIGHT',
    startsAt: Date,
    endsAt: Date,
  ) {
    return transaction.nurseShift.upsert({
      where: { shift_dataset_logical_key: { datasetId, logicalKey } },
      update: { duty, startsAt, endsAt },
      create: {
        datasetId,
        logicalKey,
        nurseId,
        wardId,
        duty,
        startsAt,
        endsAt,
      },
    });
  }

  private upsertPatient(
    transaction: Prisma.TransactionClient,
    datasetId: string,
    wardId: string,
    logicalKey: string,
    displayName: string,
    roomLabel: string,
    profile: {
      patientCode: string;
      statusLabel: string;
      department: string;
      admittedAt: Date;
      baselineSummary: string;
    },
  ) {
    return transaction.patient.upsert({
      where: { patient_dataset_logical_key: { datasetId, logicalKey } },
      update: { displayName, roomLabel, ...profile },
      create: {
        datasetId,
        logicalKey,
        wardId,
        displayName,
        roomLabel,
        ...profile,
      },
    });
  }

  private upsertAssignment(
    transaction: Prisma.TransactionClient,
    datasetId: string,
    patientId: string,
    nurseId: string,
    wardId: string,
    nurseShiftId: string,
    logicalKey: string,
    startsAt: Date,
    endsAt: Date,
  ) {
    return transaction.patientAssignment.upsert({
      where: {
        assignment_dataset_logical_key: { datasetId, logicalKey },
      },
      update: { startsAt, endsAt },
      create: {
        datasetId,
        logicalKey,
        patientId,
        nurseId,
        wardId,
        nurseShiftId,
        startsAt,
        endsAt,
      },
    });
  }

  private upsertTimelineEvent(
    transaction: Prisma.TransactionClient,
    datasetId: string,
    patientId: string,
    wardId: string,
    logicalKey: string,
    occurredAt: Date,
    sourceReference: string,
    summary: string,
  ) {
    return transaction.timelineEvent.upsert({
      where: {
        timeline_event_dataset_logical_key: { datasetId, logicalKey },
      },
      update: {
        occurredAt,
        type: 'OBSERVATION',
        source: 'MANUAL',
        sourceReference,
        summary,
      },
      create: {
        datasetId,
        logicalKey,
        patientId,
        wardId,
        occurredAt,
        type: 'OBSERVATION',
        source: 'MANUAL',
        sourceReference,
        summary,
      },
    });
  }
}
