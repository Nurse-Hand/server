export const SYNTHETIC_SCHEDULE_FIXTURE_SHA256 =
  'f7261ef1171c238f2fde493d96951e23fa2a19567db4399ed0e3351834ad81a5';

export const SYNTHETIC_SCHEDULE_FIXTURE_REGISTRY = {
  [SYNTHETIC_SCHEDULE_FIXTURE_SHA256]: {
    templateId: 'FIXED_V1',
    rowIndex: 2,
    width: 640,
    height: 480,
  },
} as const;

export function isAllowedSyntheticScheduleFixture(input: {
  fileHash: string;
  templateId: string;
  rowIndex: number;
  width: number;
  height: number;
}): boolean {
  const fixture =
    SYNTHETIC_SCHEDULE_FIXTURE_REGISTRY[
      input.fileHash as keyof typeof SYNTHETIC_SCHEDULE_FIXTURE_REGISTRY
    ];
  return (
    fixture !== undefined &&
    fixture.templateId === input.templateId &&
    fixture.rowIndex === input.rowIndex &&
    fixture.width === input.width &&
    fixture.height === input.height
  );
}
