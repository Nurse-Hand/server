window.__ROUNDING_MVP_LAB_DATA__ = {
  "nurses": {
    "scenarioKey": "SYNTHETIC_MEDICAL_DAY_SHIFT",
    "generatedAt": "2026-08-19T09:00:00+09:00",
    "items": [
      {
        "nurseId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58d62",
        "persona": "SENDER",
        "displayName": "송신 간호사 A",
        "role": "DAY_SHIFT_LEAD",
        "wardId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58d61",
        "wardLabel": "7A 내과 병동",
        "shiftStartAt": "2026-08-19T07:00:00+09:00",
        "shiftEndAt": "2026-08-19T15:00:00+09:00"
      },
      {
        "nurseId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58d64",
        "persona": "RECEIVER",
        "displayName": "수신 간호사 B",
        "role": "EVENING_SHIFT_LEAD",
        "wardId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58d61",
        "wardLabel": "7A 내과 병동",
        "shiftStartAt": "2026-08-19T15:00:00+09:00",
        "shiftEndAt": "2026-08-19T23:00:00+09:00"
      }
    ]
  },
  "patients": {
    "scenarioKey": "SYNTHETIC_MEDICAL_DAY_SHIFT",
    "generatedAt": "2026-08-19T09:00:00+09:00",
    "items": [
      {
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
        "patientLabel": "P-7A-101",
        "roomLabel": "701-A",
        "ageBand": "50s",
        "primaryConcern": "복강경 수술 후 배액 및 통증 모니터링",
        "safetyFlags": [
          "낙상 주의",
          "배액관 라인"
        ],
        "handoffFocus": [
          "14:00 배액량 재측정",
          "통증 점수 추적",
          "보행 시작 전 어지럼 확인"
        ]
      },
      {
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
        "patientLabel": "P-7A-102",
        "roomLabel": "702-B",
        "ageBand": "60s",
        "primaryConcern": "식후 혈당과 오심 재평가",
        "safetyFlags": [
          "저혈당 주의",
          "식사량 편차"
        ],
        "handoffFocus": [
          "13:30 혈당 재측정",
          "sliding scale 확인",
          "식후 오심 경과 확인"
        ]
      },
      {
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
        "patientLabel": "P-7A-103",
        "roomLabel": "703-A",
        "ageBand": "40s",
        "primaryConcern": "산소 유지와 활동 후 SpO2 추적",
        "safetyFlags": [
          "보행 시 산소 저하",
          "I&O 누락 주의"
        ],
        "handoffFocus": [
          "보행 후 SpO2",
          "산소 감량 조건",
          "I&O 입력 확인"
        ]
      }
    ]
  },
  "tasks": {
    "scenarioKey": "SYNTHETIC_MEDICAL_DAY_SHIFT",
    "generatedAt": "2026-08-19T09:00:00+09:00",
    "items": [
      {
        "taskId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f59101",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
        "title": "14:00 배액량 재측정",
        "rulePriority": "HIGH",
        "status": "TODO",
        "dueAt": "2026-08-19T14:00:00+09:00",
        "workDate": "2026-08-19",
        "source": "MANUAL",
        "description": "1차 라운딩에서 배액량 추적 필요성 확인",
        "confirmedPriority": null,
        "effectivePriority": "HIGH",
        "version": 1
      },
      {
        "taskId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f59102",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
        "title": "13:30 혈당 재측정",
        "rulePriority": "HIGH",
        "status": "TODO",
        "dueAt": "2026-08-19T13:30:00+09:00",
        "workDate": "2026-08-19",
        "source": "MANUAL",
        "description": "식사량 절반과 sliding scale follow-up 필요",
        "confirmedPriority": null,
        "effectivePriority": "HIGH",
        "version": 1
      },
      {
        "taskId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f59103",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
        "title": "14:30 보행 후 SpO2 재확인",
        "rulePriority": "NORMAL",
        "status": "TODO",
        "dueAt": "2026-08-19T14:30:00+09:00",
        "workDate": "2026-08-19",
        "source": "MANUAL",
        "description": "산소 1L 유지 상태에서 활동 후 재평가",
        "confirmedPriority": null,
        "effectivePriority": "NORMAL",
        "version": 1
      },
      {
        "taskId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f59104",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
        "title": "I&O 누락분 입력 확인",
        "rulePriority": "NORMAL",
        "status": "TODO",
        "dueAt": "2026-08-19T15:00:00+09:00",
        "workDate": "2026-08-19",
        "source": "MANUAL",
        "description": "2차 라운딩 전 EMR chart 보완 필요",
        "confirmedPriority": null,
        "effectivePriority": "NORMAL",
        "version": 1
      }
    ]
  },
  "rounding": {
    "scenarioKey": "SYNTHETIC_MEDICAL_DAY_SHIFT",
    "roundingDate": "2026-08-19",
    "sessionTemplate": {
      "sessionLabel": "7A 데이 라운딩 MVP Lab",
      "wardId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58d61",
      "wardLabel": "7A 내과 병동",
      "plannedVisitCount": 6,
      "apiPaths": {
        "health": "/api/v1/health",
        "demoSessions": "/api/v1/demo-sessions",
        "startSession": "/api/v1/rounding-sessions",
        "createRecord": "/api/v1/rounding-sessions/{sessionId}/patient-segments",
        "completeSession": "/api/v1/rounding-sessions/{sessionId}/complete",
        "audioUpload": "/api/v1/files/audio",
        "analysisStart": "/api/v1/rounding-sessions/{sessionId}/analysis-jobs",
        "analysisConfirm": "/api/v1/rounding-sessions/{sessionId}/analysis-confirmation",
        "tasksList": "/api/v1/tasks",
        "handoffPrecheck": "/api/v1/handoff-prechecks",
        "handoffDraft": "/api/v1/handoffs"
      }
    },
    "visitPlan": [
      {
        "visitId": "visit-r1-p101",
        "roundNumber": 1,
        "roundLabel": "1차 라운딩",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
        "audioAssetId": "audio-r1-p101",
        "summaryHint": "통증 및 배액 체크",
        "expectedNextAction": "기록 저장 후 다음 환자 이동"
      },
      {
        "visitId": "visit-r1-p102",
        "roundNumber": 1,
        "roundLabel": "1차 라운딩",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
        "audioAssetId": "audio-r1-p102",
        "summaryHint": "혈당과 식사량 확인",
        "expectedNextAction": "혈당 follow-up task 후보 확인"
      },
      {
        "visitId": "visit-r1-p103",
        "roundNumber": 1,
        "roundLabel": "1차 라운딩",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
        "audioAssetId": "audio-r1-p103",
        "summaryHint": "산소와 활동 tolerance 확인",
        "expectedNextAction": "보행 후 SpO2 evidence 검토"
      },
      {
        "visitId": "visit-r2-p101",
        "roundNumber": 2,
        "roundLabel": "2차 라운딩",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
        "audioAssetId": "audio-r2-p101",
        "summaryHint": "배액 추적 재확인",
        "expectedNextAction": "인수인계용 수치 반영"
      },
      {
        "visitId": "visit-r2-p102",
        "roundNumber": 2,
        "roundLabel": "2차 라운딩",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
        "audioAssetId": "audio-r2-p102",
        "summaryHint": "저혈당 위험 재평가",
        "expectedNextAction": "혈당 follow-up 완료 여부 반영"
      },
      {
        "visitId": "visit-r2-p103",
        "roundNumber": 2,
        "roundLabel": "2차 라운딩",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
        "audioAssetId": "audio-r2-p103",
        "summaryHint": "보행 후 산소 감량 판단",
        "expectedNextAction": "세션 종료 후 handoff draft 생성"
      }
    ]
  },
  "audioManifest": {
    "scenarioKey": "SYNTHETIC_MEDICAL_DAY_SHIFT",
    "notes": "원본 음성은 커밋하지 않고 로컬 record_data 경로 metadata만 유지한다.",
    "baseDirectoryWorkspaceRelativePath": "record_data",
    "baseDirectoryRelativeFromToolDir": "../../../../../record_data",
    "items": [
      {
        "audioAssetId": "audio-r1-p101",
        "visitId": "visit-r1-p101",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
        "roundLabel": "1차 라운딩",
        "fileName": "1차 라운딩 환자1.m4a",
        "workspaceRelativePath": "record_data/1차 라운딩 환자1.m4a",
        "relativePathFromToolDir": "../../../../../record_data/1차 라운딩 환자1.m4a"
      },
      {
        "audioAssetId": "audio-r1-p102",
        "visitId": "visit-r1-p102",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
        "roundLabel": "1차 라운딩",
        "fileName": "1차 라운딩 환자 2.m4a",
        "workspaceRelativePath": "record_data/1차 라운딩 환자 2.m4a",
        "relativePathFromToolDir": "../../../../../record_data/1차 라운딩 환자 2.m4a"
      },
      {
        "audioAssetId": "audio-r1-p103",
        "visitId": "visit-r1-p103",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
        "roundLabel": "1차 라운딩",
        "fileName": "1차 라운딩 환자 3.m4a",
        "workspaceRelativePath": "record_data/1차 라운딩 환자 3.m4a",
        "relativePathFromToolDir": "../../../../../record_data/1차 라운딩 환자 3.m4a"
      },
      {
        "audioAssetId": "audio-r2-p101",
        "visitId": "visit-r2-p101",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
        "roundLabel": "2차 라운딩",
        "fileName": "2차 라운딩 환자 1.m4a",
        "workspaceRelativePath": "record_data/2차 라운딩 환자 1.m4a",
        "relativePathFromToolDir": "../../../../../record_data/2차 라운딩 환자 1.m4a"
      },
      {
        "audioAssetId": "audio-r2-p102",
        "visitId": "visit-r2-p102",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
        "roundLabel": "2차 라운딩",
        "fileName": "2차 라운딩 환자 2.m4a",
        "workspaceRelativePath": "record_data/2차 라운딩 환자 2.m4a",
        "relativePathFromToolDir": "../../../../../record_data/2차 라운딩 환자 2.m4a"
      },
      {
        "audioAssetId": "audio-r2-p103",
        "visitId": "visit-r2-p103",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
        "roundLabel": "2차 라운딩",
        "fileName": "2차 라운딩 환자 3.m4a",
        "workspaceRelativePath": "record_data/2차 라운딩 환자 3.m4a",
        "relativePathFromToolDir": "../../../../../record_data/2차 라운딩 환자 3.m4a"
      }
    ]
  },
  "expectedResults": {
    "health": {
      "mockResponse": {
        "data": {
          "status": "ok",
          "timestamp": "2026-08-19T00:05:00.000Z"
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000101"
        }
      }
    },
    "demoSession": {
      "mockResponse": {
        "data": {
          "scenarioKey": "SYNTHETIC_MEDICAL_DAY_SHIFT",
          "expiresAt": "2026-08-19T15:00:00.000Z",
          "sessions": [
            {
              "persona": "SENDER",
              "sessionId": "demo_sender_session_lab_20260819"
            },
            {
              "persona": "RECEIVER",
              "sessionId": "demo_receiver_session_lab_20260819"
            }
          ]
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000102"
        }
      }
    },
    "sessionStart": {
      "mockResponse": {
        "data": {
          "sessionId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a001",
          "status": "IN_PROGRESS",
          "scenarioKey": "SYNTHETIC_MEDICAL_DAY_SHIFT",
          "startedAt": "2026-08-19T09:10:00+09:00",
          "currentVisitId": "visit-r1-p101",
          "plannedVisitCount": 6,
          "completedVisitCount": 0
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000103"
        }
      }
    },
    "visitResults": [
      {
        "visitId": "visit-r1-p101",
        "audioAssetId": "audio-r1-p101",
        "recordId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b101",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
        "shortSummary": "통증 3점, 배액관 고정 양호, 14시 배액량 재측정 필요",
        "patientScript": [
          {
            "speaker": "NURSE",
            "text": "통증은 3점으로 내려왔고 체위 바꾸면 더 편해진다고 합니다."
          },
          {
            "speaker": "PATIENT",
            "text": "배액관 당김은 없고 어지럼은 없다고 답했습니다."
          },
          {
            "speaker": "NURSE",
            "text": "14시쯤 배액량 다시 보고 early ambulation은 보호자 동행으로 진행 예정입니다."
          }
        ],
        "top3Candidates": [
          {
            "rank": 1,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
            "patientLabel": "P-7A-101",
            "matchReason": "배액관, 통증 3점, 보행 전 어지럼 확인이 모두 일치"
          },
          {
            "rank": 2,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
            "patientLabel": "P-7A-103",
            "matchReason": "활동 tolerance 언급만 일부 겹치고 배액관 근거는 없음"
          },
          {
            "rank": 3,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
            "patientLabel": "P-7A-102",
            "matchReason": "체위 변경 언급 외 핵심 지표가 다름"
          }
        ],
        "evidence": [
          {
            "evidenceId": "ev-r1-p101-1",
            "kind": "SYMPTOM",
            "summary": "통증 3점 보고",
            "sourceAudioAssetId": "audio-r1-p101"
          },
          {
            "evidenceId": "ev-r1-p101-2",
            "kind": "DRAIN",
            "summary": "배액관 유지 양호, 14시 재측정 필요",
            "sourceAudioAssetId": "audio-r1-p101"
          },
          {
            "evidenceId": "ev-r1-p101-3",
            "kind": "SAFETY",
            "summary": "보행 전 어지럼 없음 확인",
            "sourceAudioAssetId": "audio-r1-p101"
          }
        ],
        "taskCandidates": [
          {
            "taskCandidateId": "taskcand-r1-p101-1",
            "taskId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f59101",
            "title": "14:00 배액량 재측정",
            "suggestedPriority": "HIGH",
            "rulePriority": "HIGH",
            "rationale": "1차 라운딩에서 추적 시각이 명시됨"
          }
        ]
      },
      {
        "visitId": "visit-r1-p102",
        "audioAssetId": "audio-r1-p102",
        "recordId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b102",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
        "shortSummary": "식사량 절반, 점심 전 혈당 재측정 필요, 오심 경과 관찰",
        "patientScript": [
          {
            "speaker": "NURSE",
            "text": "아침 식사는 절반 정도 했고 속이 조금 메스껍다고 했습니다."
          },
          {
            "speaker": "PATIENT",
            "text": "손 떨림은 없고 물은 마실 수 있다고 했습니다."
          },
          {
            "speaker": "NURSE",
            "text": "13시 30분쯤 혈당 다시 보고 sliding scale 적용 여부 확인 예정입니다."
          }
        ],
        "top3Candidates": [
          {
            "rank": 1,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
            "patientLabel": "P-7A-102",
            "matchReason": "식사량, 오심, 혈당 재측정 시점이 모두 일치"
          },
          {
            "rank": 2,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
            "patientLabel": "P-7A-101",
            "matchReason": "추적 시각 언급만 유사하며 혈당 근거는 없음"
          },
          {
            "rank": 3,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
            "patientLabel": "P-7A-103",
            "matchReason": "경과 관찰 흐름만 비슷하고 산소 관련 근거는 없음"
          }
        ],
        "evidence": [
          {
            "evidenceId": "ev-r1-p102-1",
            "kind": "INTAKE",
            "summary": "아침 식사량 절반",
            "sourceAudioAssetId": "audio-r1-p102"
          },
          {
            "evidenceId": "ev-r1-p102-2",
            "kind": "GLUCOSE",
            "summary": "13:30 혈당 재측정 필요",
            "sourceAudioAssetId": "audio-r1-p102"
          },
          {
            "evidenceId": "ev-r1-p102-3",
            "kind": "SYMPTOM",
            "summary": "오심 지속, 손 떨림 없음",
            "sourceAudioAssetId": "audio-r1-p102"
          }
        ],
        "taskCandidates": [
          {
            "taskCandidateId": "taskcand-r1-p102-1",
            "taskId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f59102",
            "title": "13:30 혈당 재측정",
            "suggestedPriority": "HIGH",
            "rulePriority": "HIGH",
            "rationale": "식사량 저하와 오심 동반으로 조기 재측정 필요"
          }
        ]
      },
      {
        "visitId": "visit-r1-p103",
        "audioAssetId": "audio-r1-p103",
        "recordId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b103",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
        "shortSummary": "보행 후 SpO2 93%, 산소 1L 유지, I&O 입력 누락 확인 필요",
        "patientScript": [
          {
            "speaker": "NURSE",
            "text": "화장실 다녀온 뒤 산소포화도가 93까지 내려갔다가 회복했습니다."
          },
          {
            "speaker": "PATIENT",
            "text": "기침은 조금 있지만 숨찬 건 오래가진 않는다고 했습니다."
          },
          {
            "speaker": "NURSE",
            "text": "산소 1리터는 유지하고 I&O 입력 누락이 없는지 차트도 같이 확인할 예정입니다."
          }
        ],
        "top3Candidates": [
          {
            "rank": 1,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
            "patientLabel": "P-7A-103",
            "matchReason": "산소 1L, 보행 후 SpO2, I&O 언급이 모두 일치"
          },
          {
            "rank": 2,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
            "patientLabel": "P-7A-102",
            "matchReason": "경과 관찰이라는 표현만 일부 겹치고 주요 근거는 다름"
          },
          {
            "rank": 3,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
            "patientLabel": "P-7A-101",
            "matchReason": "활동 전후 상태 확인 맥락만 비슷"
          }
        ],
        "evidence": [
          {
            "evidenceId": "ev-r1-p103-1",
            "kind": "VITAL",
            "summary": "보행 후 SpO2 93%",
            "sourceAudioAssetId": "audio-r1-p103"
          },
          {
            "evidenceId": "ev-r1-p103-2",
            "kind": "OXYGEN",
            "summary": "산소 1L 유지",
            "sourceAudioAssetId": "audio-r1-p103"
          },
          {
            "evidenceId": "ev-r1-p103-3",
            "kind": "DOCUMENTATION",
            "summary": "I&O 입력 누락 확인 필요",
            "sourceAudioAssetId": "audio-r1-p103"
          }
        ],
        "taskCandidates": [
          {
            "taskCandidateId": "taskcand-r1-p103-1",
            "taskId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f59103",
            "title": "14:30 보행 후 SpO2 재확인",
            "suggestedPriority": "NORMAL",
            "rulePriority": "NORMAL",
            "rationale": "활동 후 산소포화도 변동 재평가 필요"
          },
          {
            "taskCandidateId": "taskcand-r1-p103-2",
            "taskId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f59104",
            "title": "I&O 누락분 입력 확인",
            "suggestedPriority": "NORMAL",
            "rulePriority": "NORMAL",
            "rationale": "인수인계 전 chart completeness 확보 필요"
          }
        ]
      },
      {
        "visitId": "visit-r2-p101",
        "audioAssetId": "audio-r2-p101",
        "recordId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b201",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
        "shortSummary": "배액 40mL 확인, 통증 2점으로 감소, 보호자 동행 보행 교육 완료",
        "patientScript": [
          {
            "speaker": "NURSE",
            "text": "14시 재확인한 배액은 40밀리였고 색 변화는 없었습니다."
          },
          {
            "speaker": "PATIENT",
            "text": "통증은 2점 정도로 줄었고 혼자 일어나진 않겠다고 했습니다."
          },
          {
            "speaker": "NURSE",
            "text": "보호자 동행 보행 교육은 마쳤고 evening shift에는 drain trend만 이어서 보면 됩니다."
          }
        ],
        "top3Candidates": [
          {
            "rank": 1,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
            "patientLabel": "P-7A-101",
            "matchReason": "배액 40mL와 통증 2점 재확인 근거가 명확"
          },
          {
            "rank": 2,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
            "patientLabel": "P-7A-103",
            "matchReason": "보행 교육 맥락만 일부 겹침"
          },
          {
            "rank": 3,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
            "patientLabel": "P-7A-102",
            "matchReason": "재측정 시각 표현 외 공통 근거 부족"
          }
        ],
        "evidence": [
          {
            "evidenceId": "ev-r2-p101-1",
            "kind": "DRAIN",
            "summary": "배액 40mL, 색 변화 없음",
            "sourceAudioAssetId": "audio-r2-p101"
          },
          {
            "evidenceId": "ev-r2-p101-2",
            "kind": "SYMPTOM",
            "summary": "통증 2점으로 감소",
            "sourceAudioAssetId": "audio-r2-p101"
          }
        ],
        "taskCandidates": []
      },
      {
        "visitId": "visit-r2-p102",
        "audioAssetId": "audio-r2-p102",
        "recordId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b202",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
        "shortSummary": "혈당 164 재측정, 오심 감소, 식후 관찰 유지",
        "patientScript": [
          {
            "speaker": "NURSE",
            "text": "13시 30분 재측정 혈당은 164였고 추가 저혈당 증상은 없었습니다."
          },
          {
            "speaker": "PATIENT",
            "text": "메스꺼움은 처음보다 덜하고 물은 계속 마실 수 있다고 했습니다."
          },
          {
            "speaker": "NURSE",
            "text": "evening shift에는 저녁 전 혈당만 한 번 더 확인하면 될 것 같습니다."
          }
        ],
        "top3Candidates": [
          {
            "rank": 1,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
            "patientLabel": "P-7A-102",
            "matchReason": "혈당 164와 오심 감소 경과가 일치"
          },
          {
            "rank": 2,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
            "patientLabel": "P-7A-101",
            "matchReason": "follow-up 완료 보고 흐름만 유사"
          },
          {
            "rank": 3,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
            "patientLabel": "P-7A-103",
            "matchReason": "재측정 후 경과 공유 외 공통 근거 없음"
          }
        ],
        "evidence": [
          {
            "evidenceId": "ev-r2-p102-1",
            "kind": "GLUCOSE",
            "summary": "재측정 혈당 164",
            "sourceAudioAssetId": "audio-r2-p102"
          },
          {
            "evidenceId": "ev-r2-p102-2",
            "kind": "SYMPTOM",
            "summary": "오심 감소, 수분 섭취 가능",
            "sourceAudioAssetId": "audio-r2-p102"
          }
        ],
        "taskCandidates": []
      },
      {
        "visitId": "visit-r2-p103",
        "audioAssetId": "audio-r2-p103",
        "recordId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b203",
        "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
        "shortSummary": "보행 1회 후 SpO2 95%, 산소 감량 여부는 evening shift 재판단",
        "patientScript": [
          {
            "speaker": "NURSE",
            "text": "복도 보행 한 번 하고 왔을 때 산소포화도는 95로 유지됐습니다."
          },
          {
            "speaker": "PATIENT",
            "text": "숨차긴 하지만 휴식하면 바로 괜찮아진다고 했습니다."
          },
          {
            "speaker": "NURSE",
            "text": "산소 감량은 저녁 근무자가 한 번 더 보고 결정하도록 인계 메모에 남기겠습니다."
          }
        ],
        "top3Candidates": [
          {
            "rank": 1,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
            "patientLabel": "P-7A-103",
            "matchReason": "SpO2 95와 산소 감량 판단 유보가 모두 일치"
          },
          {
            "rank": 2,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
            "patientLabel": "P-7A-101",
            "matchReason": "보행 교육 언급만 부분 일치"
          },
          {
            "rank": 3,
            "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
            "patientLabel": "P-7A-102",
            "matchReason": "재평가 완료 보고 흐름 외 공통 근거 없음"
          }
        ],
        "evidence": [
          {
            "evidenceId": "ev-r2-p103-1",
            "kind": "VITAL",
            "summary": "보행 후 SpO2 95%",
            "sourceAudioAssetId": "audio-r2-p103"
          },
          {
            "evidenceId": "ev-r2-p103-2",
            "kind": "OXYGEN",
            "summary": "산소 감량 여부는 evening shift 재판단",
            "sourceAudioAssetId": "audio-r2-p103"
          }
        ],
        "taskCandidates": []
      }
    ],
    "scripts": {
      "fullTranscript": "1차 P-7A-101: 통증 3점, 배액관 양호, 14시 재측정 필요\n1차 P-7A-102: 식사량 절반, 13:30 혈당 재측정 예정\n1차 P-7A-103: 보행 후 SpO2 93, 산소 1L 유지\n2차 P-7A-101: 배액 40mL, 통증 2점으로 감소\n2차 P-7A-102: 혈당 164 재측정, 오심 감소\n2차 P-7A-103: 보행 후 SpO2 95, 산소 감량 판단 보류",
      "patientScripts": [
        {
          "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
          "patientLabel": "P-7A-101",
          "combinedScript": "1차: 통증 3점, 배액관 당김 없음, 14시 배액량 재측정 예정\n2차: 배액 40mL, 통증 2점, 보호자 동행 보행 교육 완료"
        },
        {
          "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
          "patientLabel": "P-7A-102",
          "combinedScript": "1차: 식사량 절반, 오심 지속, 13:30 혈당 재측정 예정\n2차: 혈당 164, 오심 감소, 저녁 전 혈당 한 번 더 확인 권고"
        },
        {
          "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
          "patientLabel": "P-7A-103",
          "combinedScript": "1차: 보행 후 SpO2 93, 산소 1L 유지, I&O 확인 필요\n2차: 보행 후 SpO2 95, 산소 감량 여부는 evening shift 재판단"
        }
      ]
    },
    "audioUpload": {
      "mockResponse": {
        "data": {
          "uploadedFiles": [
            {
              "id": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a101",
              "kind": "AUDIO",
              "originalName": "synthetic-rounding.m4a",
              "mimeType": "audio/mp4",
              "sizeBytes": 1024,
              "checksum": "synthetic-checksum",
              "createdAt": "2026-08-19T05:55:00.000Z"
            }
          ],
          "status": "STORED"
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000104"
        }
      }
    },
    "roundingAnalysis": {
      "mockResponse": {
        "data": {
          "uploadedFiles": [
            {
              "id": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a101",
              "kind": "AUDIO",
              "originalName": "synthetic-rounding.wav",
              "mimeType": "audio/wav",
              "sizeBytes": 1024,
              "checksum": "synthetic-checksum",
              "createdAt": "2026-08-19T05:55:00.000Z"
            }
          ],
          "analysisJob": {
            "jobId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a201",
            "status": "SUCCEEDED",
            "roundingSessionId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a001",
            "audioFileId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a101",
            "fullText": "통증 3점이며 배액 40mL입니다. 저녁 전에 혈당을 다시 확인합니다.",
            "utterances": [
              {
                "utteranceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a301",
                "speakerLabel": "SPEAKER_00",
                "speakerRole": "PATIENT_CANDIDATE",
                "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
                "startedAtMs": 0,
                "endedAtMs": 3200,
                "text": "통증 3점이며 배액 40mL입니다.",
                "confidence": 0.92,
                "important": true
              },
              {
                "utteranceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a302",
                "speakerLabel": "SPEAKER_01",
                "speakerRole": "NURSE",
                "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
                "startedAtMs": 3300,
                "endedAtMs": 6100,
                "text": "저녁 전에 혈당을 다시 확인합니다.",
                "confidence": 0.95,
                "important": true
              }
            ],
            "speakerMatches": [
              {
                "speakerLabel": "SPEAKER_00",
                "rank": 1,
                "candidatePatientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
                "displayName": "P-7A-101",
                "similarity": 0.92
              }
            ],
            "failureCode": null,
            "createdAt": "2026-08-19T05:55:01.000Z",
            "updatedAt": "2026-08-19T05:55:01.000Z"
          }
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000105"
        }
      }
    },
    "roundingAnalysisConfirmation": {
      "mockResponse": {
        "data": {
          "job": {
            "jobId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a201",
            "status": "SUCCEEDED",
            "roundingSessionId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a001",
            "audioFileId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a101",
            "fullText": "통증 3점이며 배액 40mL입니다. 저녁 전에 혈당을 다시 확인합니다.",
            "utterances": [],
            "speakerMatches": [],
            "failureCode": null,
            "createdAt": "2026-08-19T05:55:01.000Z",
            "updatedAt": "2026-08-19T05:55:02.000Z"
          },
          "evidences": [
            {
              "evidenceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b201",
              "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
              "topic": "PAIN",
              "handoffSection": "pain",
              "keywords": [
                "통증",
                "배액"
              ],
              "importanceFlags": [
                "follow_up_needed"
              ],
              "requiresNurseConfirmation": false,
              "textForRetrieval": "통증 3점이며 배액 40mL입니다.",
              "sourceUtteranceIds": [
                "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a301"
              ],
              "timelineEventId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b301",
              "createdAt": "2026-08-19T05:55:02.000Z"
            },
            {
              "evidenceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b202",
              "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
              "topic": "TREATMENT",
              "handoffSection": "treatment",
              "keywords": [
                "혈당",
                "재확인"
              ],
              "importanceFlags": [
                "follow_up_needed"
              ],
              "requiresNurseConfirmation": false,
              "textForRetrieval": "저녁 전에 혈당을 다시 확인합니다.",
              "sourceUtteranceIds": [
                "018f1da8-6c39-4f1d-8f2f-0f9bc2f5a302"
              ],
              "timelineEventId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b302",
              "createdAt": "2026-08-19T05:55:02.000Z"
            }
          ],
          "timelineEventIds": [
            "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b301",
            "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b302"
          ]
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000106"
        }
      }
    },
    "taskExtractionJob": {
      "reservationResponse": {
        "data": {
          "jobId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5e001",
          "status": "QUEUED"
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000105"
        }
      },
      "mockResponse": {
        "data": {
          "jobId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5e001",
          "status": "SUCCEEDED",
          "failure": null,
          "candidates": [
            {
              "candidateId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5e101",
              "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
              "title": "14:00 배액량 재측정",
              "description": null,
              "dueAt": "2026-08-19T14:00:00+09:00",
              "workDate": "2026-08-19",
              "aiSuggestion": {
                "suggestedPriority": "HIGH",
                "reasons": [
                  "라운딩에서 재측정 시각이 확인됨"
                ],
                "confidence": "MEDIUM"
              },
              "evidence": [
                {
                  "sourceType": "TIMELINE_EVENT",
                  "sourceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b101"
                }
              ],
              "duplicateTaskId": null,
              "appliedTaskId": null
            },
            {
              "candidateId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5e102",
              "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
              "title": "13:30 혈당 재측정",
              "description": null,
              "dueAt": "2026-08-19T13:30:00+09:00",
              "workDate": "2026-08-19",
              "aiSuggestion": {
                "suggestedPriority": "HIGH",
                "reasons": [
                  "혈당 추적 계획이 확인됨"
                ],
                "confidence": "MEDIUM"
              },
              "evidence": [
                {
                  "sourceType": "TIMELINE_EVENT",
                  "sourceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b102"
                }
              ],
              "duplicateTaskId": null,
              "appliedTaskId": null
            },
            {
              "candidateId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5e103",
              "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
              "title": "14:30 보행 후 SpO2 재확인",
              "description": null,
              "dueAt": "2026-08-19T14:30:00+09:00",
              "workDate": "2026-08-19",
              "aiSuggestion": {
                "suggestedPriority": "NORMAL",
                "reasons": [
                  "활동 후 재평가가 필요함"
                ],
                "confidence": "MEDIUM"
              },
              "evidence": [
                {
                  "sourceType": "TIMELINE_EVENT",
                  "sourceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b103"
                }
              ],
              "duplicateTaskId": null,
              "appliedTaskId": null
            },
            {
              "candidateId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5e104",
              "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
              "title": "I&O 누락분 입력 확인",
              "description": null,
              "dueAt": "2026-08-19T15:00:00+09:00",
              "workDate": "2026-08-19",
              "aiSuggestion": {
                "suggestedPriority": "NORMAL",
                "reasons": [
                  "기록 완결성 확인이 필요함"
                ],
                "confidence": "MEDIUM"
              },
              "evidence": [
                {
                  "sourceType": "TIMELINE_EVENT",
                  "sourceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b203"
                }
              ],
              "duplicateTaskId": null,
              "appliedTaskId": null
            }
          ],
          "createdAt": "2026-08-19T05:56:00.000Z",
          "updatedAt": "2026-08-19T05:56:01.000Z"
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000105"
        }
      }
    },
    "handoffPrecheck": {
      "reservationResponse": {
        "data": {
          "precheckId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5c001",
          "status": "QUEUED"
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000106"
        }
      },
      "mockResponse": {
        "data": {
          "precheckId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5c001",
          "version": 1,
          "jobId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5c101",
          "status": "SUCCEEDED",
          "failureCode": null,
          "retryable": null,
          "modelVersion": "deterministic-precheck-v1",
          "contractVersion": "handoff-precheck-v1",
          "generatedAt": "2026-08-19T05:57:00.000Z",
          "summary": {
            "critical": 2,
            "recommended": 1
          },
          "items": [
            {
              "itemId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5c201",
              "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
              "severity": "CRITICAL",
              "question": "P-7A-101 배액량 40mL 재측정 시각과 drain trend를 인수인계 메모에 반영했나요?",
              "reason": "미완료 추적 업무가 있음",
              "evidence": [
                {
                  "sourceType": "TIMELINE_EVENT",
                  "sourceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b201",
                  "sourceReference": "timeline:synthetic:drain",
                  "occurredAt": "2026-08-19T05:40:00.000Z",
                  "excerptKind": "SUMMARY",
                  "excerpt": "배액 40mL 재측정"
                }
              ],
              "answer": "INCLUDE_HANDOFF",
              "comment": null,
              "version": 1
            },
            {
              "itemId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5c202",
              "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58102",
              "severity": "CRITICAL",
              "question": "P-7A-102 혈당 164 이후 저녁 전 추가 체크 계획이 전달되나요?",
              "reason": "HIGH 업무가 인계 대상임",
              "evidence": [
                {
                  "sourceType": "TASK",
                  "sourceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f59102",
                  "sourceReference": "task:synthetic:glucose",
                  "occurredAt": null,
                  "excerptKind": "TASK_TITLE",
                  "excerpt": "13:30 혈당 재측정"
                }
              ],
              "answer": "INCLUDE_HANDOFF",
              "comment": null,
              "version": 1
            },
            {
              "itemId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5c203",
              "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58103",
              "severity": "RECOMMENDED",
              "question": "P-7A-103 산소 감량 판단 보류 사유와 재평가 조건을 적었나요?",
              "reason": "관찰 근거를 확인할 수 있음",
              "evidence": [
                {
                  "sourceType": "TIMELINE_EVENT",
                  "sourceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b203",
                  "sourceReference": "timeline:synthetic:oxygen",
                  "occurredAt": "2026-08-19T05:50:00.000Z",
                  "excerptKind": "SUMMARY",
                  "excerpt": "산소 감량 판단 보류"
                }
              ],
              "answer": "NO_ISSUE",
              "comment": null,
              "version": 1
            }
          ]
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000106"
        }
      }
    },
    "handoffDraft": {
      "reservationResponse": {
        "data": {
          "handoffId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5d001",
          "status": "GENERATING"
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000107"
        }
      },
      "mockResponse": {
        "data": {
          "handoffId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5d001",
          "status": "DRAFT",
          "version": 1,
          "date": "2026-08-19",
          "senderActorId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58d62",
          "receiverActorId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58d64",
          "generationJob": {
            "jobId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5d101",
            "status": "SUCCEEDED",
            "failureCode": null,
            "retryable": null
          },
          "templateId": "NURSING_HANDOFF_V1",
          "includeUnverified": false,
          "patients": [
            {
              "patientId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f58101",
              "sections": {
                "patientStatus": "통증 2점, 배액 40mL로 확인됨",
                "pain": "통증 점수 감소 추세",
                "treatment": "배액관 유지 중",
                "diet": "특이사항 없음",
                "activity": "보호자 동행 보행 교육 완료",
                "observation": "evening shift에서 drain trend 확인"
              },
              "aiOriginalSections": {
                "patientStatus": "통증 2점, 배액 40mL로 확인됨",
                "pain": "통증 점수 감소 추세",
                "treatment": "배액관 유지 중",
                "diet": "특이사항 없음",
                "activity": "보호자 동행 보행 교육 완료",
                "observation": "evening shift에서 drain trend 확인"
              },
              "citations": [
                {
                  "sourceType": "TIMELINE_EVENT",
                  "sourceId": "018f1da8-6c39-4f1d-8f2f-0f9bc2f5b201",
                  "sourceReference": "timeline:synthetic:drain",
                  "occurredAt": "2026-08-19T05:40:00.000Z",
                  "excerptKind": "SUMMARY",
                  "excerpt": "배액 40mL 재측정",
                  "section": "PATIENT_STATUS",
                  "wasModified": false
                }
              ],
              "unverified": false
            }
          ],
          "tasks": [],
          "warnings": [],
          "updatedAt": "2026-08-19T05:58:00.000Z"
        },
        "meta": {
          "requestId": "00000000-0000-4000-8000-000000000107"
        }
      }
    }
  }
};
