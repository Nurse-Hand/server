import type { QuickNoteType } from './quick-note.types';

const DEFAULT_KEYWORDS: Record<QuickNoteType, readonly string[]> = {
  VITAL_SIGNS: ['혈압', '맥박', '체온', '산소포화도', 'SpO2'],
  RESPIRATION: ['기침', '호흡', '가래', '호흡곤란', '산소'],
  MENTAL_STATUS: ['의식', '혼돈', '지남력', '반응'],
  PAIN: ['통증', '아픔', 'NRS'],
  TREATMENT: ['처치', '검사', '시술', '투약'],
  DIET: ['식사', '섭취', '금식', '구토'],
  OBSERVATION: ['관찰', '특이사항', '보호자', '낙상'],
};

const TOKEN_PATTERN = /[A-Za-z0-9]+|[가-힣]{2,}/g;
const MAX_KEYWORD_COUNT = 12;

export function deriveQuickNoteKeywords(input: {
  noteType: QuickNoteType;
  text: string | null;
}): string[] {
  const keywords = new Set(DEFAULT_KEYWORDS[input.noteType]);

  if (input.text !== null) {
    for (const token of input.text.match(TOKEN_PATTERN) ?? []) {
      keywords.add(token);
      if (keywords.size >= MAX_KEYWORD_COUNT) {
        break;
      }
    }
  }

  return [...keywords].slice(0, MAX_KEYWORD_COUNT);
}
