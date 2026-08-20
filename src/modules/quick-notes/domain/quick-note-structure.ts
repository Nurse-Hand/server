import { deriveQuickNoteKeywords } from './quick-note-keywords';
import type {
  QuickNoteStructuredFacts,
  QuickNoteType,
} from './quick-note.types';

const HANDOFF_SECTION_BY_TYPE: Record<QuickNoteType, string> = {
  VITAL_SIGNS: '활력징후',
  RESPIRATION: '호흡',
  MENTAL_STATUS: '의식상태',
  PAIN: '통증',
  TREATMENT: '처치',
  DIET: '식이',
  OBSERVATION: '관찰사항·특이사항',
};

const SUMMARY_MAX_LENGTH = 120;

export function buildQuickNoteStructure(input: {
  noteType: QuickNoteType;
  text: string | null;
  occurredAt: Date;
  audioFileId: string | null;
  photoFileIds: readonly string[];
}): {
  topic: QuickNoteType;
  handoffSection: string;
  keywords: string[];
  structuredFacts: QuickNoteStructuredFacts;
} {
  const topic = input.noteType;
  const handoffSection = HANDOFF_SECTION_BY_TYPE[topic];

  return {
    topic,
    handoffSection,
    keywords: deriveQuickNoteKeywords({
      noteType: input.noteType,
      text: input.text,
    }),
    structuredFacts: {
      summary: summarizeQuickNoteText(input.text),
      text: input.text,
      occurredAt: input.occurredAt.toISOString(),
      sourceChannels: [
        ...(input.text === null ? [] : ['TEXT' as const]),
        ...(input.audioFileId === null ? [] : ['AUDIO' as const]),
        ...(input.photoFileIds.length === 0 ? [] : ['PHOTO' as const]),
      ],
      audioFileId: input.audioFileId,
      photoFileIds: [...input.photoFileIds],
    },
  };
}

function summarizeQuickNoteText(text: string | null): string | null {
  if (text === null) {
    return null;
  }

  return text.length > SUMMARY_MAX_LENGTH
    ? `${text.slice(0, SUMMARY_MAX_LENGTH - 3)}...`
    : text;
}
