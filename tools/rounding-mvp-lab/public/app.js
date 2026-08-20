(() => {
  'use strict';

  const STORAGE_KEY = 'nurse-hand-rounding-mvp-lab';
  const DATA = window.__ROUNDING_MVP_LAB_DATA__;
  const API = window.__ROUNDING_MVP_API__;

  if (!DATA || !API) {
    document.body.innerHTML =
      "<main style='padding:24px;font-family:system-ui'>하네스 데이터 또는 API client를 찾을 수 없습니다.</main>";
    return;
  }

  const elements = {
    screens: Array.from(document.querySelectorAll('[data-screen]')),
    navTargets: Array.from(document.querySelectorAll('[data-nav-target]')),
    navItems: Array.from(
      document.querySelectorAll('.nav-item[data-nav-target]'),
    ),
    modeRadios: Array.from(document.querySelectorAll('input[name="mode"]')),
    personaRadios: Array.from(
      document.querySelectorAll('input[name="persona"]'),
    ),
    baseUrl: document.getElementById('base-url'),
    senderSessionId: document.getElementById('sender-session-id'),
    receiverSessionId: document.getElementById('receiver-session-id'),
    senderShiftId: document.getElementById('sender-shift-id'),
    handoffDate: document.getElementById('handoff-date'),
    modeBadge: document.getElementById('mode-badge'),
    scenarioCaption: document.getElementById('scenario-caption'),
    sessionState: document.getElementById('session-state'),
    sessionSummary: document.getElementById('session-summary'),
    visitRoute: document.getElementById('visit-route'),
    currentVisit: document.getElementById('current-visit'),
    patientSearchInput: document.getElementById('patient-search-input'),
    patientList: document.getElementById('patient-list'),
    patientCountAll: document.getElementById('patient-count-all'),
    patientCountAlert: document.getElementById('patient-count-alert'),
    patientDetailBadge: document.getElementById('patient-detail-badge'),
    patientDetailCard: document.getElementById('patient-detail-card'),
    patientTimelineSummary: document.getElementById('patient-timeline-summary'),
    patientTimelineFeed: document.getElementById('patient-timeline-feed'),
    uploadStatus: document.getElementById('upload-status'),
    roundingUpload: document.getElementById('rounding-upload'),
    roundingUploadList: document.getElementById('rounding-upload-list'),
    quicknoteUpload: document.getElementById('quicknote-upload'),
    quicknotePatient: document.getElementById('quicknote-patient'),
    quicknoteTopic: document.getElementById('quicknote-topic'),
    quicknoteUploadList: document.getElementById('quicknote-upload-list'),
    mobileQuicknotePatient: document.getElementById('mobile-quicknote-patient'),
    mobileQuicknoteTopic: document.getElementById('mobile-quicknote-topic'),
    quickNoteMicStatus: document.getElementById('quick-note-mic-status'),
    quickNoteHint: document.getElementById('quick-note-hint'),
    quickNotePreviewList: document.getElementById('quick-note-preview-list'),
    manifestNote: document.getElementById('manifest-note'),
    detailSnapshot: document.getElementById('detail-snapshot'),
    requestView: document.getElementById('request-view'),
    responseView: document.getElementById('response-view'),
    summaryView: document.getElementById('summary-view'),
    logList: document.getElementById('log-list'),
    responseStatus: document.getElementById('response-status'),
    resultOrigin: document.getElementById('result-origin'),
    nextActionPill: document.getElementById('next-action-pill'),
    lastActionLabel: document.getElementById('last-action-label'),
    clearLog: document.getElementById('clear-log'),
    actionButtons: Array.from(document.querySelectorAll('[data-action]')),
  };

  let state = createInitialState(loadSavedConfig());

  const ACTIONS = {
    health: {
      label: 'Health',
      transport: 'http',
      buildRequest() {
        return {
          method: 'GET',
          path: DATA.rounding.sessionTemplate.apiPaths.health,
          requiresDemoSession: false,
          description: '서버 liveness 확인',
        };
      },
      mockHandler() {
        return {
          responsePayload: DATA.expectedResults.health.mockResponse,
          detailText: 'Health mock response를 표시했습니다.',
          nextAction: 'Demo Session 생성 또는 라운딩 시작',
          summaryLines: ['GET /api/v1/health', 'mock status: ok'],
        };
      },
    },
    'create-demo-session': {
      label: 'Demo Session',
      transport: 'http',
      buildRequest() {
        return {
          method: 'POST',
          path: DATA.rounding.sessionTemplate.apiPaths.demoSessions,
          requiresDemoSession: false,
          body: {
            scenarioKey: DATA.nurses.scenarioKey,
          },
          description: 'SENDER/RECEIVER demo session 발급',
        };
      },
      async applyReal(realData) {
        syncDemoSessions(realData);
        return loadRealPatients();
      },
      mockHandler() {
        syncDemoSessions(DATA.expectedResults.demoSession.mockResponse.data);
        return {
          responsePayload: DATA.expectedResults.demoSession.mockResponse,
          detailText:
            'mock sender/receiver demo session을 입력 필드에 채웠습니다.',
          nextAction: '라운딩 시작',
          summaryLines: [
            'POST /api/v1/demo-sessions',
            'SENDER/RECEIVER X-Demo-Session-Id 채움',
          ],
        };
      },
    },
    'start-rounding': {
      label: '라운딩 시작',
      transport: 'http',
      guard() {
        if (state.session.status === 'IN_PROGRESS') {
          return failResult(
            'warning',
            '이미 진행 중인 세션이 있습니다.',
            'reset 또는 완료 후 다시 시작',
          );
        }
        if (state.session.status === 'COMPLETED') {
          return failResult(
            'warning',
            '완료된 세션이 남아 있습니다.',
            '초기화 후 재시작',
          );
        }
        return null;
      },
      buildRequest() {
        return {
          method: 'POST',
          path: DATA.rounding.sessionTemplate.apiPaths.startSession,
          requiresDemoSession: true,
          body: {
            startedAt: new Date().toISOString(),
            note: `${DATA.rounding.sessionTemplate.sessionLabel} / browser lab`,
          },
          description: '라운딩 세션 시작',
        };
      },
      async applyReal(realData) {
        state.ui.activeScreen = 'rounding';
        state.session.status = 'IN_PROGRESS';
        state.session.sessionId =
          realData.id || realData.sessionId || state.session.sessionId;
        state.session.startedAt =
          realData.startedAt || new Date().toISOString();
        state.session.currentVisitIndex = 0;
        state.session.completedVisitIds = [];
        state.session.records = {};
        state.session.visitIntervals = {};
        state.session.lastSegmentEndedAt = null;
        state.analysis.job = null;
        state.analysis.confirmation = null;
        state.flags.analysisReady = false;
        state.flags.evidenceReady = false;
        state.flags.tasksReady = false;
        state.flags.precheckReady = false;
        state.flags.handoffReady = false;
        if (state.real.visitPlan.length === 0) {
          return loadRealPatients();
        }
      },
      mockHandler() {
        const data = DATA.expectedResults.sessionStart.mockResponse.data;
        state.ui.activeScreen = 'rounding';
        state.session.status = 'IN_PROGRESS';
        state.session.sessionId = data.sessionId;
        state.session.startedAt = data.startedAt;
        state.session.currentVisitIndex = 0;
        state.session.completedVisitIds = [];
        state.session.records = {};
        state.session.completedAt = null;
        state.session.visitIntervals = {};
        state.session.lastSegmentEndedAt = null;
        state.analysis.job = null;
        state.analysis.confirmation = null;
        state.flags.analysisReady = false;
        state.flags.evidenceReady = false;
        state.flags.tasksReady = false;
        state.flags.precheckReady = false;
        state.flags.handoffReady = false;
        return {
          responsePayload: DATA.expectedResults.sessionStart.mockResponse,
          detailText:
            '6개 방문 순서가 고정된 synthetic 라운딩 세션을 시작했습니다.',
          nextAction: currentVisit().expectedNextAction,
          summaryLines: [
            `sessionId: ${data.sessionId}`,
            `currentVisit: ${data.currentVisitId}`,
            `plannedVisitCount: ${data.plannedVisitCount}`,
          ],
        };
      },
    },
    'complete-current-patient': {
      label: '현재 환자 종료',
      transport: 'http',
      guard() {
        if (state.session.status !== 'IN_PROGRESS') {
          return failResult(
            'warning',
            '세션이 시작되지 않았습니다.',
            '라운딩 시작',
          );
        }
        if (isCurrentVisitCompleted()) {
          return failResult(
            'warning',
            '현재 방문은 이미 기록되었습니다.',
            '다음 환자 이동',
          );
        }
        return null;
      },
      buildRequest() {
        const visit = currentVisit();
        return {
          method: 'POST',
          path: DATA.rounding.sessionTemplate.apiPaths.createRecord.replace(
            '{sessionId}',
            state.session.sessionId,
          ),
          requiresDemoSession: true,
          body: {
            patientId: visit.patientId,
            startedAt: estimateVisitStartedAt(visit),
            endedAt: estimateVisitEndedAt(visit),
            note: `${visit.roundLabel} / ${visit.summaryHint}`,
          },
          labMetadata: {
            visitId: visit.visitId,
          },
          description: '현재 환자 기록 저장',
        };
      },
      applyReal(realData) {
        const latestSegment = Array.isArray(realData.segments)
          ? realData.segments[realData.segments.length - 1]
          : null;
        markVisitCompleted(
          currentVisit().visitId,
          realData.recordId ||
            latestSegment?.id ||
            currentVisitResult().recordId,
        );
      },
      mockHandler() {
        const visit = currentVisit();
        const visitResult = currentVisitResult();
        markVisitCompleted(visit.visitId, visitResult.recordId);
        return {
          responsePayload: {
            data: {
              recordId: visitResult.recordId,
              visitId: visit.visitId,
              patientId: visit.patientId,
              status: 'RECORDED',
              summary: visitResult.shortSummary,
            },
            meta: {
              requestId: '00000000-0000-4000-8000-000000000201',
            },
          },
          detailText: visitResult.patientScript
            .map((line) => `${line.speaker}: ${line.text}`)
            .join('\n'),
          nextAction: visit === lastVisit() ? '전체 라운딩 종료' : '다음 환자',
          summaryLines: [
            `recordId: ${visitResult.recordId}`,
            `patient: ${patientLabel(visit.patientId)}`,
            visitResult.shortSummary,
          ],
        };
      },
    },
    'next-patient': {
      label: '다음 환자',
      transport: 'local',
      guard() {
        if (state.session.status !== 'IN_PROGRESS') {
          return failResult(
            'warning',
            '진행 중인 세션이 없습니다.',
            '라운딩 시작',
          );
        }
        if (!isCurrentVisitCompleted()) {
          return failResult(
            'warning',
            '현재 환자 기록을 먼저 저장하세요.',
            '현재 환자 종료',
          );
        }
        if (state.session.currentVisitIndex >= activeVisitPlan().length - 1) {
          return failResult(
            'warning',
            '마지막 방문입니다.',
            '전체 라운딩 종료',
          );
        }
        return null;
      },
      buildRequest() {
        return {
          method: 'LOCAL',
          path: 'lab://next-patient',
          requiresDemoSession: false,
          body: {
            previousVisitId: currentVisit().visitId,
          },
          description: '클라이언트 상태에서 현재 방문 포인터 이동',
        };
      },
      mockHandler() {
        const previousVisit = currentVisit();
        state.session.currentVisitIndex += 1;
        const nextVisit = currentVisit();
        return {
          responsePayload: {
            data: {
              previousVisitId: previousVisit.visitId,
              currentVisitId: nextVisit.visitId,
              patientId: nextVisit.patientId,
            },
            meta: {
              requestId: 'local-next-visit',
            },
          },
          detailText: `${patientLabel(previousVisit.patientId)} 종료 후 ${patientLabel(
            nextVisit.patientId,
          )}(${nextVisit.roundLabel})로 이동했습니다.`,
          nextAction: nextVisit.expectedNextAction,
          summaryLines: [
            `previous: ${previousVisit.visitId}`,
            `current: ${nextVisit.visitId}`,
            `patient: ${patientLabel(nextVisit.patientId)}`,
          ],
        };
      },
    },
    'complete-rounding': {
      label: '전체 라운딩 종료',
      transport: 'http',
      guard() {
        if (state.session.status !== 'IN_PROGRESS') {
          return failResult(
            'warning',
            '완료할 세션이 없습니다.',
            '라운딩 시작',
          );
        }
        if (
          state.session.completedVisitIds.length !== activeVisitPlan().length
        ) {
          return failResult(
            'warning',
            '모든 방문 기록이 끝나지 않았습니다.',
            '남은 방문을 저장하거나 mock 흐름을 계속 확인',
          );
        }
        return null;
      },
      buildRequest() {
        return {
          method: 'POST',
          path: DATA.rounding.sessionTemplate.apiPaths.completeSession.replace(
            '{sessionId}',
            state.session.sessionId,
          ),
          requiresDemoSession: true,
          body: {
            completedAt: completionTimestamp(),
          },
          description: '라운딩 세션 종료',
        };
      },
      applyReal(realData) {
        state.session.status = 'COMPLETED';
        state.session.completedAt =
          realData.completedAt || new Date().toISOString();
      },
      mockHandler() {
        state.session.status = 'COMPLETED';
        state.session.completedAt = `${DATA.rounding.roundingDate}T14:55:00+09:00`;
        return {
          responsePayload: {
            data: {
              sessionId: state.session.sessionId,
              status: 'COMPLETED',
              completedAt: state.session.completedAt,
              completedVisitCount: state.session.completedVisitIds.length,
            },
            meta: {
              requestId: '00000000-0000-4000-8000-000000000202',
            },
          },
          detailText:
            '2차 라운딩까지 종료했습니다. 이제 오디오 업로드·분석, 업무 목록, handoff 흐름을 확인할 수 있습니다.',
          nextAction: '오디오 업로드·분석',
          summaryLines: [
            `sessionId: ${state.session.sessionId}`,
            `completedVisitCount: ${state.session.completedVisitIds.length}`,
            'status: COMPLETED',
          ],
        };
      },
    },
    'analyze-server': {
      label: '오디오 업로드·분석',
      transport: 'http',
      guard() {
        if (state.session.completedVisitIds.length === 0) {
          return failResult(
            'warning',
            '업로드할 라운딩 기록이 없습니다.',
            '현재 환자 종료',
          );
        }
        if (!state.uploads.roundingLibrary[0]?.file) {
          return failResult(
            'warning',
            '세션 전체 녹음 File이 연결되지 않았습니다.',
            '오른쪽 패널에서 세션 오디오 파일 선택',
          );
        }
        return null;
      },
      buildRequest() {
        const multipartFiles = [state.uploads.roundingLibrary[0].file];
        return {
          method: 'POST',
          path: DATA.rounding.sessionTemplate.apiPaths.audioUpload,
          requiresDemoSession: true,
          multipartFiles,
          body: multipartFiles.map((file) => ({
            field: 'file',
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            size: file.size,
          })),
          afterMultipart(uploadedFiles) {
            const firstAudioFile = uploadedFiles[0];
            return {
              method: 'POST',
              path: DATA.rounding.sessionTemplate.apiPaths.analysisStart.replace(
                '{sessionId}',
                state.session.sessionId,
              ),
              requiresDemoSession: true,
              body: {
                audioFileId: firstAudioFile.id,
              },
            };
          },
          description:
            '실제 File 객체를 multipart/form-data로 업로드한 뒤 라운딩 분석 Job 시작',
          summaryPaths: [
            'POST /api/v1/files/audio',
            'POST /api/v1/rounding-sessions/{sessionId}/analysis-jobs',
          ],
        };
      },
      applyReal(realData) {
        state.uploads.storedFiles = realData.uploadedFiles || [];
        state.analysis.job = realData.analysisJob || null;
        state.flags.analysisReady = state.analysis.job?.status === 'SUCCEEDED';
      },
      mockHandler() {
        state.flags.analysisReady = true;
        state.analysis.job =
          DATA.expectedResults.roundingAnalysis.mockResponse.data.analysisJob;
        state.uploads.storedFiles =
          DATA.expectedResults.roundingAnalysis.mockResponse.data.uploadedFiles;
        return {
          responsePayload: DATA.expectedResults.roundingAnalysis.mockResponse,
          detailText: 'synthetic 오디오 저장·분석 결과를 표시했습니다.',
          nextAction: '스크립트 또는 Evidence 확인',
          summaryLines: [
            'POST /api/v1/files/audio',
            'POST /api/v1/rounding-sessions/{sessionId}/analysis-jobs',
            'transport: multipart/form-data',
            'analysis status: SUCCEEDED',
          ],
        };
      },
    },
    'show-full-script': {
      label: '전체 스크립트',
      transport: 'local',
      buildRequest() {
        return {
          method: 'LOCAL',
          path: 'lab://show-full-script',
          requiresDemoSession: false,
          description: 'synthetic 전체 스크립트 보기',
        };
      },
      mockHandler() {
        const script =
          state.config.mode !== 'mock' && state.analysis.job?.fullText
            ? state.analysis.job.fullText
            : DATA.expectedResults.scripts.fullTranscript;
        return {
          responsePayload: {
            data: {
              script,
            },
            meta: {
              requestId: 'local-full-script',
            },
          },
          detailText: script,
          nextAction: 'Top3 후보 또는 Evidence',
          summaryLines: [
            '6개 visit synthetic transcript',
            '환자별 요약 분리 가능',
          ],
        };
      },
    },
    'show-patient-script': {
      label: '환자별 스크립트',
      transport: 'local',
      buildRequest() {
        return {
          method: 'LOCAL',
          path: 'lab://show-patient-script',
          requiresDemoSession: false,
          body: {
            patientId: currentVisit().patientId,
          },
          description: '현재 환자의 누적 스크립트 보기',
        };
      },
      mockHandler() {
        const patientId = currentVisit().patientId;
        const realScript = state.analysis.job?.utterances
          ?.filter((item) => item.patientId === patientId)
          .map((item) => item.text)
          .join('\n');
        const patientScript =
          state.config.mode !== 'mock' && realScript
            ? {
                patientId,
                patientLabel: patientLabel(patientId),
                combinedScript: realScript,
              }
            : DATA.expectedResults.scripts.patientScripts.find(
                (item) => item.patientId === patientId,
              );
        return {
          responsePayload: {
            data: patientScript,
            meta: {
              requestId: 'local-patient-script',
            },
          },
          detailText: patientScript.combinedScript,
          nextAction: 'Top3 후보 또는 Evidence',
          summaryLines: [
            `patient: ${patientScript.patientLabel}`,
            '1차/2차 라운딩 누적 스크립트',
          ],
        };
      },
    },
    'show-top3': {
      label: 'Top3 후보',
      transport: 'local',
      buildRequest() {
        return {
          method: 'LOCAL',
          path: 'lab://show-top3',
          requiresDemoSession: false,
          body: {
            visitId: currentVisit().visitId,
          },
          description: '현재 방문의 Top3 patient 후보 보기',
        };
      },
      mockHandler() {
        if (
          state.config.mode !== 'mock' &&
          state.analysis.job?.speakerMatches?.length
        ) {
          return {
            responsePayload: {
              data: state.analysis.job.speakerMatches,
              meta: { requestId: 'local-real-speaker-matches' },
            },
            detailText: state.analysis.job.speakerMatches
              .map(
                (match) =>
                  `${match.rank}. ${match.displayName} - similarity ${match.similarity}`,
              )
              .join('\n'),
            nextAction: 'Evidence 확인',
            summaryLines: [
              `analysisJob: ${state.analysis.job.jobId}`,
              `candidates: ${state.analysis.job.speakerMatches.length}`,
            ],
          };
        }
        const visitResult = currentVisitResult();
        return {
          responsePayload: {
            data: visitResult.top3Candidates,
            meta: {
              requestId: 'local-top3',
            },
          },
          detailText: visitResult.top3Candidates
            .map(
              (candidate) =>
                `${candidate.rank}. ${candidate.patientLabel} - ${candidate.matchReason}`,
            )
            .join('\n'),
          nextAction: 'Evidence 확인',
          summaryLines: [
            `visit: ${visitResult.visitId}`,
            'Top 3 patient match candidates',
          ],
        };
      },
    },
    'show-evidence': {
      label: 'Evidence',
      transport: 'http',
      guard() {
        if (!state.flags.analysisReady || !state.analysis.job) {
          return failResult(
            'warning',
            '확정할 분석 결과가 없습니다.',
            '오디오 업로드·분석',
          );
        }
        return null;
      },
      buildRequest() {
        return {
          method: 'POST',
          path: DATA.rounding.sessionTemplate.apiPaths.analysisConfirm.replace(
            '{sessionId}',
            state.session.sessionId,
          ),
          requiresDemoSession: true,
          body: {
            jobId: state.analysis.job.jobId,
            utterances: state.analysis.job.utterances.map((utterance) => ({
              utteranceId: utterance.utteranceId,
              patientId: utterance.patientId,
              speakerRole: utterance.speakerRole,
              important: utterance.important,
            })),
          },
          description: '간호사 확인 결과로 Evidence·Timeline 확정 저장',
        };
      },
      applyReal(realData) {
        state.analysis.confirmation = realData;
        state.flags.evidenceReady = true;
      },
      mockHandler() {
        state.analysis.confirmation =
          DATA.expectedResults.roundingAnalysisConfirmation.mockResponse.data;
        state.flags.evidenceReady = true;
        const evidences = state.analysis.confirmation.evidences;
        return {
          responsePayload:
            DATA.expectedResults.roundingAnalysisConfirmation.mockResponse,
          detailText: evidences
            .map(
              (item) =>
                `${item.topic}: ${item.textForRetrieval} (${item.evidenceId})`,
            )
            .join('\n'),
          nextAction: '업무 목록 또는 인수인계 질문',
          summaryLines: [
            'POST /api/v1/rounding-sessions/{sessionId}/analysis-confirmation',
            `evidenceCount: ${evidences.length}`,
          ],
        };
      },
    },
    'show-tasks': {
      label: '업무 목록',
      transport: 'http',
      buildRequest() {
        return {
          method: 'GET',
          path: `${DATA.rounding.sessionTemplate.apiPaths.tasksList}?date=${currentSeoulDate()}`,
          requiresDemoSession: true,
          description: '간호사가 직접 생성한 당일 업무 조회',
        };
      },
      applyReal(realData) {
        state.real.tasks = realData.items || [];
        state.flags.tasksReady = true;
      },
      mockHandler() {
        state.flags.tasksReady = true;
        return {
          responsePayload: {
            data: {
              items: DATA.tasks.items,
            },
            meta: { requestId: 'local-task-list' },
          },
          detailText: DATA.tasks.items
            .map((task) => `${task.title} / ${task.effectivePriority}`)
            .join('\n'),
          nextAction: '인수인계 질문',
          summaryLines: [
            'GET /api/v1/tasks',
            `manual tasks: ${DATA.tasks.items.length}`,
          ],
        };
      },
    },
    'show-handoff-precheck': {
      label: '인수인계 질문',
      transport: 'http',
      guard() {
        if (!state.flags.evidenceReady) {
          return failResult(
            'warning',
            '확정된 Evidence가 아직 없습니다.',
            'Evidence 확인',
          );
        }
        if (state.config.mode !== 'mock' && !state.config.senderShiftId) {
          return failResult(
            'warning',
            '실제 precheck에는 Sender shift UUID가 필요합니다.',
            '개발 연결 설정에 NurseShift.id 입력',
          );
        }
        return null;
      },
      buildRequest() {
        return {
          method: 'POST',
          path: DATA.rounding.sessionTemplate.apiPaths.handoffPrecheck,
          requiresDemoSession: true,
          requiresIdempotency: true,
          idempotencyScope: 'handoff-precheck',
          body: {
            shiftId: state.config.senderShiftId,
            targetDuty: 'EVENING',
            date: state.config.handoffDate,
          },
          poll: {
            path(data) {
              return `/api/v1/handoff-prechecks/${data.precheckId}`;
            },
            readStatus(data) {
              return data.status;
            },
            terminalStatuses: ['SUCCEEDED', 'FAILED'],
            successStatuses: ['SUCCEEDED'],
          },
          description: 'handoff precheck 생성',
        };
      },
      applyReal(realData) {
        state.ui.activeScreen = 'handoff';
        state.flags.precheckReady = true;
        state.handoff.precheckId = realData.precheckId;
      },
      mockHandler() {
        state.ui.activeScreen = 'handoff';
        state.flags.precheckReady = true;
        state.handoff.precheckId =
          DATA.expectedResults.handoffPrecheck.mockResponse.data.precheckId;
        return {
          responsePayload: DATA.expectedResults.handoffPrecheck.mockResponse,
          detailText:
            DATA.expectedResults.handoffPrecheck.mockResponse.data.items
              .map((item) => `${item.severity}: ${item.question}`)
              .join('\n'),
          nextAction: '인수인계 초안',
          summaryLines: [
            `precheckId: ${DATA.expectedResults.handoffPrecheck.mockResponse.data.precheckId}`,
            `items: ${DATA.expectedResults.handoffPrecheck.mockResponse.data.items.length}`,
          ],
        };
      },
    },
    'show-handoff-draft': {
      label: '인수인계 초안',
      transport: 'http',
      guard() {
        if (!state.flags.precheckReady) {
          return failResult(
            'warning',
            'precheck가 아직 없습니다.',
            '인수인계 질문',
          );
        }
        return null;
      },
      buildRequest() {
        return {
          method: 'POST',
          path: DATA.rounding.sessionTemplate.apiPaths.handoffDraft,
          requiresDemoSession: true,
          requiresIdempotency: true,
          idempotencyScope: 'handoff-draft',
          body: {
            precheckId: state.handoff.precheckId,
            templateId: 'NURSING_HANDOFF_V1',
            includeUnverified: false,
          },
          poll: {
            path(data) {
              return `/api/v1/handoffs/${data.handoffId}`;
            },
            readStatus(data) {
              return data.status === 'GENERATING'
                ? data.generationJob?.status
                : data.status;
            },
            terminalStatuses: ['DRAFT', 'FINALIZED', 'SUCCEEDED', 'FAILED'],
            successStatuses: ['DRAFT', 'FINALIZED', 'SUCCEEDED'],
          },
          description: 'handoff draft 생성',
        };
      },
      applyReal(realData) {
        state.ui.activeScreen = 'handoff';
        state.flags.handoffReady = true;
        state.handoff.handoffId = realData.handoffId;
      },
      mockHandler() {
        state.ui.activeScreen = 'handoff';
        state.flags.handoffReady = true;
        state.handoff.handoffId =
          DATA.expectedResults.handoffDraft.mockResponse.data.handoffId;
        return {
          responsePayload: DATA.expectedResults.handoffDraft.mockResponse,
          detailText: summarizeHandoffDraft(
            DATA.expectedResults.handoffDraft.mockResponse.data,
          ),
          nextAction: '초안 검토·수정 또는 최종 확정',
          summaryLines: [
            `handoffId: ${DATA.expectedResults.handoffDraft.mockResponse.data.handoffId}`,
            '6개 임상 section draft 생성 완료',
          ],
        };
      },
    },
    'reset-lab': {
      label: '초기화',
      transport: 'local',
      buildRequest() {
        return {
          method: 'LOCAL',
          path: 'lab://reset',
          requiresDemoSession: false,
          description: '세션 상태 초기화',
        };
      },
      mockHandler() {
        const preserved = { ...state.config };
        state = createInitialState(preserved);
        return {
          responsePayload: {
            data: {
              status: 'RESET',
            },
            meta: {
              requestId: 'local-reset',
            },
          },
          detailText:
            'BASE_URL, mode, demo session 값은 유지하고 라운딩 상태와 feed를 초기화했습니다.',
          nextAction: 'Health 또는 Demo Session',
          summaryLines: ['session state reset', 'logs cleared'],
        };
      },
    },
    'toggle-quick-note-recording': {
      label: '빠른 기록 녹음',
      transport: 'local',
      buildRequest() {
        return {
          method: 'LOCAL',
          path: 'lab://quick-note-recording',
          requiresDemoSession: false,
          body: {
            patientId: state.uploads.quickNotePatientId,
            topic: state.uploads.quickNoteTopic,
            recording: !state.uploads.quickNoteRecording,
          },
          description: '빠른 기록 녹음 상태 토글',
        };
      },
      mockHandler() {
        state.uploads.quickNoteRecording = !state.uploads.quickNoteRecording;
        const patient = patientById(state.uploads.quickNotePatientId);
        return {
          responsePayload: {
            data: {
              recording: state.uploads.quickNoteRecording,
              patientId: patient.patientId,
              topic: state.uploads.quickNoteTopic,
            },
            meta: {
              requestId: 'local-quick-note-recording',
            },
          },
          detailText: state.uploads.quickNoteRecording
            ? `${patient.roomLabel} ${patient.patientLabel} / ${topicLabel(state.uploads.quickNoteTopic)} 빠른 기록 녹음을 시작했습니다.`
            : `${patient.roomLabel} ${patient.patientLabel} / ${topicLabel(state.uploads.quickNoteTopic)} 빠른 기록 녹음을 종료했습니다.`,
          nextAction: state.uploads.quickNoteRecording
            ? '상황 발화 후 저장'
            : '새 빠른 기록 또는 라운딩 복귀',
          summaryLines: [
            `patient: ${patient.roomLabel} ${patient.patientLabel}`,
            `topic: ${topicLabel(state.uploads.quickNoteTopic)}`,
            `recording: ${state.uploads.quickNoteRecording ? 'ON' : 'OFF'}`,
          ],
        };
      },
    },
  };

  bindEvents();
  renderAll();

  function bindEvents() {
    elements.navTargets.forEach((target) => {
      target.addEventListener('click', (event) => {
        event.preventDefault();
        const screen = target.getAttribute('data-nav-target');
        if (!screen) {
          return;
        }
        navigateTo(screen);
      });
    });

    elements.modeRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        state.config.mode = radio.value;
        persistConfig();
        renderAll();
      });
    });

    elements.personaRadios.forEach((radio) => {
      radio.addEventListener('change', () => {
        state.config.activePersona = radio.value;
        persistConfig();
        renderAll();
      });
    });

    elements.baseUrl.addEventListener('input', () => {
      state.config.baseUrl = elements.baseUrl.value.trim();
      persistConfig();
      renderAll();
    });

    elements.senderSessionId.addEventListener('input', () => {
      state.config.senderSessionId = elements.senderSessionId.value.trim();
      persistConfig();
      renderAll();
    });

    elements.receiverSessionId.addEventListener('input', () => {
      state.config.receiverSessionId = elements.receiverSessionId.value.trim();
      persistConfig();
      renderAll();
    });

    elements.senderShiftId.addEventListener('input', () => {
      state.config.senderShiftId = elements.senderShiftId.value.trim();
      persistConfig();
      renderAll();
    });

    elements.handoffDate.addEventListener('input', () => {
      state.config.handoffDate = elements.handoffDate.value;
      persistConfig();
      renderAll();
    });

    if (elements.patientSearchInput) {
      elements.patientSearchInput.addEventListener('input', () => {
        state.ui.patientSearch = elements.patientSearchInput.value.trim();
        renderAll();
      });
    }

    if (elements.roundingUpload) {
      elements.roundingUpload.addEventListener('change', (event) => {
        handleRoundingUpload(event.target.files);
        event.target.value = '';
      });
    }

    if (elements.quicknotePatient) {
      elements.quicknotePatient.addEventListener('change', () => {
        state.uploads.quickNotePatientId = elements.quicknotePatient.value;
        renderAll();
      });
    }

    if (elements.quicknoteTopic) {
      elements.quicknoteTopic.addEventListener('change', () => {
        state.uploads.quickNoteTopic = elements.quicknoteTopic.value;
        renderAll();
      });
    }

    if (elements.mobileQuicknotePatient) {
      elements.mobileQuicknotePatient.addEventListener('change', () => {
        state.uploads.quickNotePatientId =
          elements.mobileQuicknotePatient.value;
        renderAll();
      });
    }

    if (elements.mobileQuicknoteTopic) {
      elements.mobileQuicknoteTopic.addEventListener('change', () => {
        state.uploads.quickNoteTopic = elements.mobileQuicknoteTopic.value;
        renderAll();
      });
    }

    if (elements.quicknoteUpload) {
      elements.quicknoteUpload.addEventListener('change', (event) => {
        handleQuickNoteUpload(event.target.files);
        event.target.value = '';
      });
    }

    elements.actionButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        const actionId = button.getAttribute('data-action');
        if (!actionId) {
          return;
        }
        button.disabled = true;
        await runAction(actionId);
        renderAll();
      });
    });

    elements.clearLog.addEventListener('click', () => {
      state.logs = [];
      renderAll();
    });
  }

  async function runAction(actionId) {
    const action = ACTIONS[actionId];
    if (!action) {
      return;
    }

    const guarded = action.guard ? action.guard() : null;
    if (guarded) {
      setResult(action.label, guarded, null, null);
      return;
    }

    const requestShape = action.buildRequest(state);
    const requestPreview = buildRequestPreview(action.label, requestShape);
    state.lastActionLabel = action.label;
    state.lastRequest = requestPreview;

    if (action.transport === 'local') {
      const mockResult = action.mockHandler(state);
      setResult(
        action.label,
        finalizeMockResult(mockResult, 'local'),
        requestPreview,
        null,
      );
      return;
    }

    const mode = state.config.mode;
    let apiOutcome = null;

    if (mode !== 'mock') {
      const requestError = validateRealRequest(requestShape);
      if (!requestError) {
        apiOutcome = await executeHttp(requestShape);
        if (apiOutcome.ok && apiOutcome.status === 202 && requestShape.poll) {
          apiOutcome = await pollHttp(
            requestShape.poll,
            extractResponseData(apiOutcome.body),
          );
        }
        if (apiOutcome.ok) {
          const realData = extractResponseData(apiOutcome.body);
          if (action.applyReal) {
            const applyOutcome = await action.applyReal(realData);
            if (applyOutcome?.ok === false) {
              const failure = failureFromApiOutcome(applyOutcome, requestShape);
              setResult(
                action.label,
                failure,
                requestPreview,
                applyOutcome.body,
              );
              return;
            }
          }
          const successResult = {
            tone: 'accent',
            statusText: 'real-success',
            originText: 'real',
            detailText:
              apiOutcome.body && JSON.stringify(apiOutcome.body, null, 2)
                ? `${action.label} 실응답 수신`
                : `${action.label} 실응답 수신`,
            nextAction: inferNextAction(actionId, 'real'),
            summaryLines: [
              ...(requestShape.summaryPaths || [
                `${requestShape.method} ${requestShape.path}`,
              ]),
              `status: ${apiOutcome.status}`,
              'origin: real',
            ],
            responsePayload: apiOutcome.body,
          };
          setResult(
            action.label,
            successResult,
            requestPreview,
            apiOutcome.body,
          );
          return;
        }
      }

      if (mode === 'real' || requestError || !apiOutcome?.isRouteNotFound) {
        const failure = apiOutcome
          ? failureFromApiOutcome(apiOutcome, requestShape)
          : failResult('danger', requestError.message, requestError.nextAction);
        setResult(
          action.label,
          failure,
          requestPreview,
          apiOutcome ? apiOutcome.body : null,
        );
        return;
      }
    }

    const mockResult = action.mockHandler(state, apiOutcome);
    setResult(
      action.label,
      finalizeMockResult(
        mockResult,
        mode === 'mock' ? 'mock' : 'mock-fallback',
      ),
      requestPreview,
      buildMockResponse(apiOutcome, mockResult.responsePayload, mode),
    );
  }

  function createInitialState(config) {
    return {
      config: {
        mode: config.mode || 'mock',
        baseUrl: config.baseUrl || defaultApiBaseUrl(),
        activePersona: config.activePersona || 'SENDER',
        senderSessionId: config.senderSessionId || '',
        receiverSessionId: config.receiverSessionId || '',
        senderShiftId: config.senderShiftId || '',
        handoffDate: config.handoffDate || currentSeoulDate(),
      },
      ui: {
        activeScreen: config.activeScreen || 'home',
        selectedPatientId:
          config.selectedPatientId || DATA.patients.items[0].patientId,
        patientSearch: '',
      },
      session: {
        sessionId:
          DATA.expectedResults.sessionStart.mockResponse.data.sessionId,
        status: 'IDLE',
        currentVisitIndex: 0,
        completedVisitIds: [],
        completedAt: null,
        startedAt: null,
        records: {},
        visitIntervals: {},
        lastSegmentEndedAt: null,
      },
      handoff: {
        precheckId: null,
        handoffId: null,
      },
      analysis: {
        job: null,
        confirmation: null,
      },
      real: {
        patients: [],
        visitPlan: [],
        tasks: [],
      },
      idempotencyKeys: {},
      flags: {
        analysisReady: false,
        evidenceReady: false,
        tasksReady: false,
        precheckReady: false,
        handoffReady: false,
      },
      uploads: {
        roundingLibrary: [],
        visitFileMap: {},
        quickNotePatientId: DATA.patients.items[0].patientId,
        quickNoteTopic: 'OBSERVATION',
        quickNotes: [],
        quickNoteRecording: false,
        storedFiles: [],
      },
      lastActionLabel: 'none',
      lastRequest: {},
      lastResponse: {},
      lastResult: {
        tone: 'accent',
        statusText: 'mock-ready',
        originText: 'mock',
        detailText:
          'Health, Demo Session, 라운딩 시작 버튼부터 순서대로 눌러 실제 API 또는 mock 흐름을 확인하세요.',
        nextAction: 'Health 또는 Demo Session',
        summaryLines: [
          'embedded mockdata loaded',
          '6 visit / 3 patient synthetic workflow',
        ],
        responsePayload: {},
      },
      logs: [
        {
          actionLabel: 'Harness loaded',
          statusText: 'mock-ready',
          originText: 'mock',
          nextAction: 'Health 또는 Demo Session',
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  function loadSavedConfig() {
    try {
      return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    } catch (_error) {
      return {};
    }
  }

  function persistConfig() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
  }

  function renderAll() {
    syncFormControls();
    renderScreens();
    renderHeader();
    renderSessionSummary();
    renderRoute();
    renderCurrentVisit();
    renderPatients();
    renderQuickNoteScreen();
    renderUploadLab();
    renderConsole();
    renderLogs();
    renderButtons();
  }

  function syncFormControls() {
    elements.baseUrl.value = state.config.baseUrl;
    elements.senderSessionId.value = state.config.senderSessionId;
    elements.receiverSessionId.value = state.config.receiverSessionId;
    elements.senderShiftId.value = state.config.senderShiftId;
    elements.handoffDate.value = state.config.handoffDate;
    if (elements.patientSearchInput) {
      elements.patientSearchInput.value = state.ui.patientSearch;
    }
    if (elements.quicknotePatient) {
      elements.quicknotePatient.value = state.uploads.quickNotePatientId;
    }
    if (elements.quicknoteTopic) {
      elements.quicknoteTopic.value = state.uploads.quickNoteTopic;
    }
    if (elements.mobileQuicknotePatient) {
      elements.mobileQuicknotePatient.value = state.uploads.quickNotePatientId;
    }
    if (elements.mobileQuicknoteTopic) {
      elements.mobileQuicknoteTopic.value = state.uploads.quickNoteTopic;
    }

    elements.modeRadios.forEach((radio) => {
      radio.checked = radio.value === state.config.mode;
    });

    elements.personaRadios.forEach((radio) => {
      radio.checked = radio.value === state.config.activePersona;
    });
  }

  function renderScreens() {
    elements.screens.forEach((screen) => {
      const isActive =
        screen.getAttribute('data-screen') === state.ui.activeScreen;
      screen.classList.toggle('active', isActive);
    });

    elements.navItems.forEach((item) => {
      const target = item.getAttribute('data-nav-target');
      const isActive =
        (target === 'home' && state.ui.activeScreen === 'home') ||
        (target === 'patient-list' &&
          (state.ui.activeScreen === 'patient-list' ||
            state.ui.activeScreen === 'patient-detail')) ||
        (target === 'rounding' && state.ui.activeScreen === 'rounding') ||
        (target === 'handoff' && state.ui.activeScreen === 'handoff');

      item.classList.toggle('active', isActive);
    });
  }

  function renderPatients() {
    const filteredPatients = getFilteredPatients();
    const alertCount = DATA.patients.items.filter(
      (patient) => patient.safetyFlags.length > 0,
    ).length;

    if (elements.patientCountAll) {
      elements.patientCountAll.textContent = String(DATA.patients.items.length);
    }
    if (elements.patientCountAlert) {
      elements.patientCountAlert.textContent = String(alertCount);
    }

    if (elements.patientList) {
      elements.patientList.innerHTML = filteredPatients
        .map((patient) => {
          const latestVisit = latestVisitForPatient(patient.patientId);
          return `
            <button
              type="button"
              class="patient-list-card"
              data-patient-id="${escapeHtml(patient.patientId)}"
            >
              <div class="patient-card-top">
                <div>
                  <div class="patient-bedline">
                    <span>${escapeHtml(patient.roomLabel)}</span>
                    <span>${escapeHtml(patient.ageBand)}</span>
                  </div>
                  <div class="patient-title-line">
                    <strong>${escapeHtml(patient.patientLabel)}</strong>
                    ${
                      patient.safetyFlags.length
                        ? '<span class="patient-alert-chip">주의</span>'
                        : ''
                    }
                  </div>
                </div>
                <img
                  class="patient-card-arrow"
                  src="./assets/figma/patient-arrow.svg"
                  alt=""
                />
              </div>
              <div class="patient-meta-line">
                <span>${escapeHtml(latestVisit.department)}</span>
                <span class="dot-separator"></span>
                <span>${escapeHtml(latestVisit.stayLabel)}</span>
              </div>
              <div class="patient-note">${escapeHtml(patient.primaryConcern)}</div>
            </button>
          `;
        })
        .join('');

      Array.from(
        elements.patientList.querySelectorAll('[data-patient-id]'),
      ).forEach((button) => {
        button.addEventListener('click', () => {
          const patientId = button.getAttribute('data-patient-id');
          if (!patientId) {
            return;
          }
          state.ui.selectedPatientId = patientId;
          navigateTo('patient-detail');
        });
      });
    }

    const patient = patientById(state.ui.selectedPatientId);
    const timeline = buildPatientTimeline(patient.patientId);
    const latest = latestVisitForPatient(patient.patientId);

    if (elements.patientDetailBadge) {
      elements.patientDetailBadge.textContent = patient.safetyFlags.length
        ? '주의'
        : '안정';
      applyTone(
        elements.patientDetailBadge,
        patient.safetyFlags.length ? 'danger' : 'accent',
      );
    }

    if (elements.patientDetailCard) {
      elements.patientDetailCard.innerHTML = `
        <div class="patient-detail-grid">
          <div class="patient-detail-top">
            <div>
              <div class="patient-detail-room">
                <span>${escapeHtml(patient.roomLabel)}</span>
                <span>${escapeHtml(patient.ageBand)}</span>
              </div>
              <div class="patient-detail-name-row">
                <strong>${escapeHtml(patient.patientLabel)}</strong>
                ${
                  patient.safetyFlags.length
                    ? '<span class="patient-alert-chip">주의</span>'
                    : ''
                }
              </div>
            </div>
            <button type="button" class="icon-surface">
              <img src="./assets/figma/patient-detail-edit.svg" alt="" />
            </button>
          </div>
          <div class="patient-detail-facts">
            <div class="patient-detail-fact">
              <span>환자 번호</span>
              <strong>${escapeHtml(patient.patientLabel)}</strong>
            </div>
            <div class="patient-detail-fact">
              <span>진료과</span>
              <strong>${escapeHtml(latest.department)}</strong>
            </div>
            <div class="patient-detail-fact">
              <span>입원일</span>
              <strong>${escapeHtml(latest.admissionDate)}</strong>
            </div>
          </div>
          <div class="patient-detail-desc">
            <span>기본정보</span>
            <p>${escapeHtml(patient.primaryConcern)}</p>
          </div>
        </div>
      `;
    }

    if (elements.patientTimelineSummary) {
      elements.patientTimelineSummary.innerHTML = `
        <strong>하루 AI 요약</strong>
        <div>${escapeHtml(timeline.summary)}</div>
      `;
    }

    if (elements.patientTimelineFeed) {
      elements.patientTimelineFeed.innerHTML = timeline.items
        .map(
          (item) => `
            <article class="timeline-entry">
              <div class="timeline-track">
                <span class="timeline-dot"></span>
              </div>
              <div class="timeline-card ${item.highlight ? 'highlight' : ''}">
                <div class="timeline-card-head">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.time)}</span>
                </div>
                <p>${escapeHtml(item.content)}</p>
                ${
                  item.alert
                    ? `
                      <div class="timeline-inline-alert">
                        <img src="./assets/figma/patient-warning.svg" alt="" />
                        ${escapeHtml(item.alert)}
                      </div>
                    `
                    : ''
                }
              </div>
            </article>
          `,
        )
        .join('');
    }
  }

  function renderQuickNoteScreen() {
    renderQuickNotePatientOptions();
    renderMobileQuickNoteTopicOptions();

    const patient = patientById(state.uploads.quickNotePatientId);
    if (elements.quickNoteMicStatus) {
      elements.quickNoteMicStatus.textContent = state.uploads.quickNoteRecording
        ? `${patient.roomLabel} ${patient.patientLabel} 녹음 중`
        : '마이크 켜고 바로 녹음 시작';
    }
    if (elements.quickNoteHint) {
      elements.quickNoteHint.textContent = state.uploads.quickNoteRecording
        ? `${topicLabel(state.uploads.quickNoteTopic)} 상황을 바로 말하면 환자와 함께 임시 저장됩니다.`
        : '환자와 유형을 선택한 뒤, 마이크를 눌러 빠른 상황 기록을 바로 남길 수 있습니다.';
    }
    const micButton = document.querySelector(
      '[data-action="toggle-quick-note-recording"]',
    );
    if (micButton) {
      micButton.classList.toggle('recording', state.uploads.quickNoteRecording);
    }
    if (elements.quickNotePreviewList) {
      const previewItems = state.uploads.quickNotes
        .filter((item) => item.patientId === state.uploads.quickNotePatientId)
        .slice(0, 3);
      elements.quickNotePreviewList.innerHTML =
        previewItems.length > 0
          ? previewItems
              .map(
                (item) => `
                  <article class="quick-note-preview-item">
                    <strong>${escapeHtml(item.fileName)}</strong>
                    <span>${escapeHtml(topicLabel(item.topic))} · ${escapeHtml(formatBytes(item.size))}</span>
                  </article>
                `,
              )
              .join('')
          : '';
    }
  }

  function renderHeader() {
    elements.modeBadge.textContent = state.config.mode;
    elements.scenarioCaption.textContent = `${DATA.rounding.sessionTemplate.wardLabel} · ${state.config.mode === 'mock' ? DATA.rounding.roundingDate : currentSeoulDate()}`;
    elements.sessionState.textContent = state.session.status;
    applyTone(
      elements.modeBadge,
      state.config.mode === 'real' ? 'warning' : 'accent',
    );
    applyTone(
      elements.sessionState,
      state.session.status === 'COMPLETED' ? 'accent' : 'warning',
    );
    elements.nextActionPill.textContent = state.lastResult.nextAction;
    applyTone(elements.nextActionPill, state.lastResult.tone);
    elements.manifestNote.textContent = `${countAssignedUploads()}/${activeVisitPlan().length} 파일 연결`;
  }

  function renderSessionSummary() {
    const items = [
      {
        value: `${state.session.completedVisitIds.length}/${activeVisitPlan().length}`,
        label: '환자 방문',
      },
      {
        value: state.flags.analysisReady ? '완료' : '대기',
        label: '음성 분석',
      },
      {
        value: state.flags.evidenceReady ? '완료' : '대기',
        label: 'Evidence 확정',
      },
      {
        value: state.flags.tasksReady ? '완료' : '대기',
        label: '업무 조회',
      },
      {
        value: state.flags.handoffReady ? '완료' : '대기',
        label: '인수인계',
      },
    ];

    elements.sessionSummary.innerHTML = items
      .map(
        (item) =>
          `<div class="summary-cell"><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(
            item.label,
          )}</span></div>`,
      )
      .join('');
  }

  function renderRoute() {
    elements.visitRoute.innerHTML = activeVisitPlan()
      .map((visit, index) => {
        const classes = ['route-stop'];
        if (index === state.session.currentVisitIndex) {
          classes.push('current');
        }
        if (state.session.completedVisitIds.includes(visit.visitId)) {
          classes.push('completed');
        }
        const patient = patientForVisit(visit);
        const status = state.session.completedVisitIds.includes(visit.visitId)
          ? '완료'
          : index === state.session.currentVisitIndex
            ? '진행'
            : '대기';
        return `
          <li class="${classes.join(' ')}">
            <span class="index-pill">${index + 1}</span>
            <div class="route-copy">
              <strong>${escapeHtml(patient.roomLabel)} · ${escapeHtml(patient.patientLabel)}</strong>
              <span>${escapeHtml(visit.roundLabel)} / ${escapeHtml(visit.summaryHint)}</span>
            </div>
            <span class="mini-status">${escapeHtml(status)}</span>
          </li>
        `;
      })
      .join('');
  }

  function renderCurrentVisit() {
    const visit = currentVisit();
    const patient = patientForVisit(visit);
    const audioSource = getAudioSourceForVisit(visit);
    const visitResult = currentVisitResult();
    const completed = isCurrentVisitCompleted();
    const safetyFlags = patient.safetyFlags
      .map(
        (flag) =>
          `<span class="mini-status warning">${escapeHtml(flag)}</span>`,
      )
      .join('');
    elements.currentVisit.innerHTML = `
      <article class="visit-card">
        <div class="visit-card-header">
          <div class="patient-main">
            <span class="patient-room">${escapeHtml(visit.roundLabel)} · ${escapeHtml(patient.roomLabel)}</span>
            <strong class="patient-name">${escapeHtml(patient.patientLabel)}</strong>
            <p class="patient-concern">${escapeHtml(patient.primaryConcern)}</p>
          </div>
          <span class="mini-status ${completed ? 'accent' : 'warning'}">
            ${completed ? '기록 완료' : state.session.status === 'IN_PROGRESS' ? '녹음 중' : '대기'}
          </span>
        </div>
        <div class="voice-message">
          <div class="voice-message-title">
            <img src="./assets/figma/ai-spark.svg" alt="" />
            NurseHand
          </div>
          <p>${escapeHtml(visitResult.shortSummary)}</p>
        </div>
        <div class="visit-meta">
          <div class="visit-meta-row">
            <span>방문 목표</span>
            <strong>${escapeHtml(visit.summaryHint)}</strong>
          </div>
          <div class="visit-meta-row">
            <span>녹음 파일</span>
            <strong>${escapeHtml(audioSource.fileName)}</strong>
          </div>
          <div class="visit-meta-row">
            <span>연결 상태</span>
            <strong>${escapeHtml(audioSource.statusLabel)}</strong>
          </div>
          <div class="visit-meta-row">
            <span>주의 플래그</span>
            <strong>${safetyFlags || '없음'}</strong>
          </div>
        </div>
      </article>
    `;
  }

  function renderUploadLab() {
    renderQuickNotePatientOptions();

    if (elements.uploadStatus) {
      elements.uploadStatus.textContent = `${countAssignedUploads()}/${activeVisitPlan().length} 연결`;
    }

    if (elements.roundingUploadList) {
      elements.roundingUploadList.innerHTML = activeVisitPlan()
        .map((visit, index) => {
          const patient = patientForVisit(visit);
          const assignedFileId =
            state.uploads.visitFileMap[visit.visitId] || '';
          const fileEntry = state.uploads.roundingLibrary.find(
            (item) => item.id === assignedFileId,
          );

          return `
            <article class="upload-row">
              <div class="upload-row-head">
                <div class="upload-row-title">
                  <strong>${index + 1}. ${escapeHtml(visit.roundLabel)} · ${escapeHtml(patient.roomLabel)} ${escapeHtml(patient.patientLabel)}</strong>
                  <span>${escapeHtml(visit.summaryHint)}</span>
                </div>
                <span class="upload-file-chip ${fileEntry ? '' : 'unassigned'}">
                  ${escapeHtml(fileEntry ? '업로드 연결됨' : '미연결')}
                </span>
              </div>
              <select data-visit-file-select="${escapeHtml(visit.visitId)}">
                <option value="">파일 선택 안 함</option>
                ${state.uploads.roundingLibrary
                  .map(
                    (file) => `
                      <option value="${escapeHtml(file.id)}" ${file.id === assignedFileId ? 'selected' : ''}>
                        ${escapeHtml(file.name)}
                      </option>
                    `,
                  )
                  .join('')}
              </select>
              <div class="upload-meta-line">
                ${fileEntry ? `${escapeHtml(fileEntry.name)} · ${escapeHtml(formatBytes(fileEntry.size))}` : '이 visit에 연결된 녹음 파일이 없습니다.'}
              </div>
            </article>
          `;
        })
        .join('');

      Array.from(
        elements.roundingUploadList.querySelectorAll(
          '[data-visit-file-select]',
        ),
      ).forEach((select) => {
        select.addEventListener('change', () => {
          const visitId = select.getAttribute('data-visit-file-select');
          if (!visitId) {
            return;
          }
          if (select.value) {
            state.uploads.visitFileMap[visitId] = select.value;
          } else {
            delete state.uploads.visitFileMap[visitId];
          }
          renderAll();
        });
      });
    }

    if (elements.quicknoteUploadList) {
      if (state.uploads.quickNotes.length === 0) {
        elements.quicknoteUploadList.innerHTML =
          '<div class="upload-empty">빠른 기록 음성을 올리면 환자와 유형이 함께 저장됩니다.</div>';
      } else {
        elements.quicknoteUploadList.innerHTML = state.uploads.quickNotes
          .map((item) => {
            const patient = patientById(item.patientId);
            return `
              <article class="upload-row">
                <div class="upload-row-head">
                  <div class="upload-row-title">
                    <strong>${escapeHtml(item.fileName)}</strong>
                    <span>${escapeHtml(patient.roomLabel)} · ${escapeHtml(patient.patientLabel)} · ${escapeHtml(topicLabel(item.topic))}</span>
                  </div>
                  <button type="button" class="ghost-button" data-remove-quicknote="${escapeHtml(item.id)}">
                    삭제
                  </button>
                </div>
                <div class="upload-meta-line">
                  ${escapeHtml(formatBytes(item.size))} · sourceType=QUICK_NOTE
                </div>
              </article>
            `;
          })
          .join('');

        Array.from(
          elements.quicknoteUploadList.querySelectorAll(
            '[data-remove-quicknote]',
          ),
        ).forEach((button) => {
          button.addEventListener('click', () => {
            const noteId = button.getAttribute('data-remove-quicknote');
            state.uploads.quickNotes = state.uploads.quickNotes.filter(
              (item) => item.id !== noteId,
            );
            renderAll();
          });
        });
      }
    }
  }

  function renderConsole() {
    elements.lastActionLabel.textContent = state.lastActionLabel;
    elements.requestView.textContent = JSON.stringify(
      state.lastRequest,
      null,
      2,
    );
    elements.responseView.textContent = JSON.stringify(
      state.lastResponse,
      null,
      2,
    );
    elements.responseStatus.textContent = state.lastResult.statusText;
    elements.resultOrigin.textContent = state.lastResult.originText;
    applyTone(elements.responseStatus, state.lastResult.tone);
    applyTone(elements.resultOrigin, state.lastResult.tone);
    elements.summaryView.innerHTML = [
      state.lastResult.summaryLines
        .map((line) => `<div>${escapeHtml(line)}</div>`)
        .join(''),
      `<hr style="border:0;border-top:1px solid #ede9fe;margin:12px 0" />`,
      `<div>${escapeHtml(state.lastResult.detailText)}</div>`,
    ].join('');
    elements.detailSnapshot.innerHTML = renderReadableDetail();
  }

  function renderReadableDetail() {
    const title = escapeHtml(state.lastActionLabel);
    const nextAction = escapeHtml(state.lastResult.nextAction);
    const summaryItems = state.lastResult.summaryLines
      .map((line) => `<li>${escapeHtml(line)}</li>`)
      .join('');
    const detail = escapeHtml(
      state.lastResult.detailText || '아직 실행된 결과가 없습니다.',
    );
    return `
      <article class="readable-detail">
        <div class="visit-card-header">
          <div>
            <span class="patient-room">현재 결과</span>
            <strong class="patient-name">${title}</strong>
          </div>
          <span class="mini-status ${state.lastResult.tone}">${escapeHtml(state.lastResult.statusText)}</span>
        </div>
        <ul class="result-list">${summaryItems}</ul>
        <div class="voice-message">
          <div class="voice-message-title">
            <img src="./assets/figma/ai-spark.svg" alt="" />
            다음 단계
          </div>
          <p>${nextAction}</p>
        </div>
        <pre class="detail-text">${detail}</pre>
      </article>
    `;
  }

  function renderLogs() {
    elements.logList.innerHTML = state.logs
      .map(
        (log) => `
          <li class="log-item">
            <strong>${escapeHtml(log.actionLabel)} / ${escapeHtml(log.statusText)}</strong>
            <span>${escapeHtml(formatTimestamp(log.timestamp))}</span>
            <span>${escapeHtml(log.originText)} / next: ${escapeHtml(log.nextAction)}</span>
          </li>
        `,
      )
      .join('');
  }

  function renderButtons() {
    elements.actionButtons.forEach((button) => {
      const actionId = button.getAttribute('data-action');
      if (!actionId) {
        return;
      }
      button.disabled = isActionDisabled(actionId);
    });
  }

  function isActionDisabled(actionId) {
    if (actionId === 'complete-current-patient') {
      return (
        state.session.status !== 'IN_PROGRESS' || isCurrentVisitCompleted()
      );
    }
    if (actionId === 'next-patient') {
      return (
        state.session.status !== 'IN_PROGRESS' ||
        !isCurrentVisitCompleted() ||
        state.session.currentVisitIndex >= activeVisitPlan().length - 1
      );
    }
    if (actionId === 'complete-rounding') {
      return state.session.status !== 'IN_PROGRESS';
    }
    if (actionId === 'analyze-server') {
      return state.session.completedVisitIds.length === 0;
    }
    if (actionId === 'show-evidence') {
      return !state.flags.analysisReady;
    }
    if (actionId === 'show-handoff-precheck') {
      return !state.flags.evidenceReady;
    }
    if (actionId === 'show-handoff-draft') {
      return !state.flags.precheckReady;
    }
    if (actionId === 'start-rounding') {
      return state.session.status !== 'IDLE';
    }
    return false;
  }

  function buildRequestPreview(actionLabel, requestShape) {
    return {
      action: actionLabel,
      mode: state.config.mode,
      baseUrl: state.config.baseUrl,
      method: requestShape.method,
      path: requestShape.path,
      url:
        requestShape.method === 'LOCAL'
          ? requestShape.path
          : joinUrl(state.config.baseUrl, requestShape.path),
      headers: buildHeaders(requestShape, {
        multipart: Array.isArray(requestShape.multipartFiles),
      }),
      body: requestShape.body || null,
      labMetadata: requestShape.labMetadata || null,
      description: requestShape.description,
      activePersona: state.config.activePersona,
    };
  }

  function validateRealRequest(requestShape) {
    if (!state.config.baseUrl) {
      return {
        code: 'BASE_URL_REQUIRED',
        message: 'BASE_URL이 비어 있습니다.',
        nextAction: 'BASE_URL 입력',
      };
    }

    return null;
  }

  async function executeHttp(requestShape) {
    if (Array.isArray(requestShape.multipartFiles)) {
      const uploadedFiles = [];
      for (const file of requestShape.multipartFiles) {
        const formData = new FormData();
        formData.append('file', file, file.name);
        const outcome = await API.request({
          baseUrl: state.config.baseUrl,
          path: requestShape.path,
          method: requestShape.method,
          headers: buildHeaders(requestShape, { multipart: true }),
          formData,
        });
        if (!outcome.ok) {
          return outcome;
        }
        uploadedFiles.push(extractResponseData(outcome.body));
      }
      if (requestShape.afterMultipart) {
        const followUp = requestShape.afterMultipart(uploadedFiles);
        const analysisOutcome = await API.request({
          baseUrl: state.config.baseUrl,
          path: followUp.path,
          method: followUp.method,
          headers: buildHeaders(followUp),
          jsonBody: followUp.body,
        });
        if (!analysisOutcome.ok) {
          return analysisOutcome;
        }
        return {
          ...analysisOutcome,
          body: {
            data: {
              uploadedFiles,
              analysisJob: extractResponseData(analysisOutcome.body),
            },
            meta: analysisOutcome.body?.meta || {
              requestId: createRequestId(),
            },
          },
        };
      }
      return {
        ok: true,
        isRouteNotFound: false,
        status: 201,
        statusText: 'Created',
        body: {
          data: { uploadedFiles, status: 'STORED' },
          meta: { requestId: createRequestId() },
        },
      };
    }

    return API.request({
      baseUrl: state.config.baseUrl,
      path: requestShape.path,
      method: requestShape.method,
      headers: buildHeaders(requestShape),
      ...(requestShape.body === undefined
        ? {}
        : { jsonBody: requestShape.body }),
    });
  }

  function pollHttp(pollConfig, reservationData) {
    return API.poll({
      request: () =>
        API.request({
          baseUrl: state.config.baseUrl,
          path: pollConfig.path(reservationData),
          method: 'GET',
          headers: buildHeaders({
            method: 'GET',
            requiresDemoSession: true,
          }),
        }),
      readStatus: pollConfig.readStatus,
      terminalStatuses: pollConfig.terminalStatuses,
      successStatuses: pollConfig.successStatuses,
    });
  }

  function buildHeaders(requestShape, options = {}) {
    const headers = {
      'X-Request-Id': createRequestId(),
    };
    if (!options.multipart && requestShape.method !== 'GET') {
      headers['Content-Type'] = 'application/json';
    }
    if (requestShape.requiresDemoSession && activeSessionId()) {
      headers['X-Demo-Session-Id'] = activeSessionId();
    }
    if (requestShape.requiresIdempotency) {
      headers['X-Idempotency-Key'] = stableIdempotencyKey(
        requestShape.idempotencyScope,
        requestShape,
      );
    }
    return headers;
  }

  function buildMockResponse(apiOutcome, mockPayload, mode) {
    if (mode === 'mock') {
      return mockPayload;
    }
    return {
      result: 'mock-fallback',
      apiAttempt: apiOutcome
        ? {
            status: apiOutcome.status,
            statusText: apiOutcome.statusText,
            body: apiOutcome.body,
          }
        : null,
      mockResponse: mockPayload,
    };
  }

  function finalizeMockResult(mockResult, origin) {
    const originText = origin === 'mock-fallback' ? 'mock-fallback' : origin;
    const tone = origin === 'mock-fallback' ? 'warning' : 'accent';
    return {
      tone,
      statusText: origin === 'mock-fallback' ? 'mock-fallback' : 'mock',
      originText,
      detailText: mockResult.detailText,
      nextAction: mockResult.nextAction,
      summaryLines: mockResult.summaryLines,
      responsePayload: mockResult.responsePayload,
    };
  }

  function failureFromApiOutcome(apiOutcome, requestShape) {
    const tone = apiOutcome.isRouteNotFound ? 'warning' : 'danger';
    return {
      tone,
      statusText: apiOutcome.isRouteNotFound ? 'not-implemented' : 'failed',
      originText: 'real',
      detailText: `${requestShape.method} ${requestShape.path} -> ${apiOutcome.status} ${apiOutcome.statusText}`,
      nextAction: apiOutcome.isRouteNotFound
        ? 'mock mode 또는 fallback 사용'
        : 'response payload 확인',
      summaryLines: [
        `${requestShape.method} ${requestShape.path}`,
        `status: ${apiOutcome.status}`,
        apiOutcome.isRouteNotFound ? 'API route not implemented' : 'API failed',
      ],
      responsePayload: apiOutcome.body,
    };
  }

  function failResult(tone, message, nextAction) {
    return {
      tone,
      statusText: tone === 'warning' ? 'warning' : 'failed',
      originText: 'local-guard',
      detailText: message,
      nextAction,
      summaryLines: [message],
      responsePayload: {
        error: {
          message,
        },
      },
    };
  }

  function setResult(actionLabel, result, requestPreview, responsePayload) {
    state.lastActionLabel = actionLabel;
    state.lastRequest = requestPreview || state.lastRequest;
    state.lastResponse = responsePayload || result.responsePayload || {};
    state.lastResult = result;
    state.logs = [
      {
        actionLabel,
        statusText: result.statusText,
        originText: result.originText,
        nextAction: result.nextAction,
        timestamp: new Date().toISOString(),
      },
      ...state.logs,
    ].slice(0, 18);
  }

  function navigateTo(screen) {
    state.ui.activeScreen = screen;
    renderAll();
  }

  function getFilteredPatients() {
    const query = state.ui.patientSearch.toLowerCase();
    if (!query) {
      return DATA.patients.items;
    }
    return DATA.patients.items.filter((patient) => {
      const latest = latestVisitForPatient(patient.patientId);
      return [
        patient.patientLabel,
        patient.roomLabel,
        patient.primaryConcern,
        latest.department,
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }

  function latestVisitForPatient(patientId) {
    const patient = patientById(patientId);
    const visitResults = patientVisitResults(patientId);
    const latestResult = visitResults[visitResults.length - 1];
    const metadata = {
      '018f1da8-6c39-4f1d-8f2f-0f9bc2f58101': {
        department: '외과',
        stayLabel: '입원 10일차',
        admissionDate: '2026.08.10',
      },
      '018f1da8-6c39-4f1d-8f2f-0f9bc2f58102': {
        department: '내분비내과',
        stayLabel: '입원 12일차',
        admissionDate: '2026.08.08',
      },
      '018f1da8-6c39-4f1d-8f2f-0f9bc2f58103': {
        department: '호흡기내과',
        stayLabel: '입원 4일차',
        admissionDate: '2026.08.15',
      },
    }[patientId];

    return {
      department: metadata.department,
      stayLabel: metadata.stayLabel,
      admissionDate: metadata.admissionDate,
      note: latestResult ? latestResult.shortSummary : patient.primaryConcern,
    };
  }

  function patientVisitResults(patientId) {
    return DATA.expectedResults.visitResults.filter(
      (result) => result.patientId === patientId,
    );
  }

  function buildPatientTimeline(patientId) {
    const patient = patientById(patientId);
    const results = patientVisitResults(patientId);
    const taskMap = new Map(
      DATA.tasks.items
        .filter((task) => task.patientId === patientId)
        .map((task) => [task.taskId, task]),
    );
    const timelineItems = [];

    timelineItems.push({
      title: '야간 인계',
      time: '08:30',
      content: `${patient.handoffFocus[0]} 중심으로 전 근무 인계가 남아 있습니다.`,
      highlight: true,
    });

    results.forEach((result, index) => {
      timelineItems.push({
        title: index === 0 ? '오전 라운딩' : '오후 라운딩',
        time: formatVisitClock(result.visitId, index === 0 ? '09:15' : '14:20'),
        content: result.shortSummary,
        highlight: false,
      });

      result.taskCandidates.forEach((candidate) => {
        const linkedTask = taskMap.get(candidate.taskId);
        timelineItems.push({
          title: '추적 업무',
          time: linkedTask ? formatDueClock(linkedTask.dueAt) : '15:00',
          content: `${candidate.title} · ${candidate.rationale}`,
          highlight: candidate.rulePriority === 'HIGH',
          alert:
            candidate.rulePriority === 'HIGH' ? '지속적인 모니터링 필요' : '',
        });
      });
    });

    const summary = `${patient.patientLabel} 환자는 ${results
      .map((result) => result.shortSummary)
      .join(' / ')}.`;

    return {
      summary,
      items: timelineItems,
    };
  }

  function currentVisit() {
    return activeVisitPlan()[state.session.currentVisitIndex];
  }

  function currentVisitResult() {
    return getVisitResultById(currentVisit().visitId);
  }

  function estimateVisitStartedAt(visit) {
    if (state.config.mode !== 'mock' && state.session.startedAt) {
      return realVisitInterval(visit).startedAt;
    }
    const visitIndex = activeVisitPlan().findIndex(
      (item) => item.visitId === visit.visitId,
    );
    return formatRoundingTime(9 * 60 + 10 + visitIndex * 20);
  }

  function estimateVisitEndedAt(visit) {
    if (state.config.mode !== 'mock' && state.session.startedAt) {
      return realVisitInterval(visit).endedAt;
    }
    const visitIndex = activeVisitPlan().findIndex(
      (item) => item.visitId === visit.visitId,
    );
    return formatRoundingTime(9 * 60 + 15 + visitIndex * 20);
  }

  function realVisitInterval(visit) {
    if (state.session.visitIntervals[visit.visitId]) {
      return state.session.visitIntervals[visit.visitId];
    }

    const sessionStartedAt = new Date(state.session.startedAt).getTime();
    const previousEndedAt = state.session.lastSegmentEndedAt
      ? new Date(state.session.lastSegmentEndedAt).getTime()
      : sessionStartedAt;
    const startedAtMs = Math.max(sessionStartedAt, previousEndedAt);
    const endedAtMs = Math.max(Date.now(), startedAtMs + 1);
    const interval = {
      startedAt: new Date(startedAtMs).toISOString(),
      endedAt: new Date(endedAtMs).toISOString(),
    };
    state.session.visitIntervals[visit.visitId] = interval;
    state.session.lastSegmentEndedAt = interval.endedAt;
    return interval;
  }

  function completionTimestamp() {
    const lastSegmentEndedAt = state.session.lastSegmentEndedAt
      ? new Date(state.session.lastSegmentEndedAt).getTime()
      : 0;
    return new Date(Math.max(Date.now(), lastSegmentEndedAt)).toISOString();
  }

  function formatRoundingTime(totalMinutes) {
    return `${DATA.rounding.roundingDate}T${String(
      Math.floor(totalMinutes / 60),
    ).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}:00+09:00`;
  }

  function formatVisitClock(visitId, fallback) {
    const visit = getVisitById(visitId);
    if (!visit) {
      return fallback;
    }
    return visit.roundNumber === 1 ? '09:15' : '14:20';
  }

  function formatDueClock(isoString) {
    if (!isoString) {
      return '15:00';
    }
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return '15:00';
    }
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  function getVisitResultById(visitId) {
    const visit = activeVisitPlan().find((item) => item.visitId === visitId);
    return DATA.expectedResults.visitResults.find(
      (item) => item.visitId === (visit?.mockVisitId || visitId),
    );
  }

  function getVisitById(visitId) {
    return activeVisitPlan().find((visit) => visit.visitId === visitId);
  }

  function getAudioSourceForVisit(visit) {
    const uploadedFile = getUploadedFileForVisit(visit.visitId);

    if (uploadedFile) {
      return {
        sourceType: 'UPLOAD',
        fileName: uploadedFile.name,
        statusLabel: `업로드 파일 · ${formatBytes(uploadedFile.size)}`,
        meta: {
          uploaded: true,
          fileName: uploadedFile.name,
          mimeType: uploadedFile.type || 'audio/*',
          size: uploadedFile.size,
          lastModified: uploadedFile.lastModified,
        },
      };
    }

    return {
      sourceType: 'UNASSIGNED',
      fileName: '업로드 파일 필요',
      statusLabel: '라운딩 파일 미연결',
      meta: {
        uploaded: false,
        audioAssetId: visit.audioAssetId,
      },
    };
  }

  function getUploadedFileForVisit(visitId) {
    const uploadedFileId = state.uploads.visitFileMap[visitId];
    return state.uploads.roundingLibrary.find(
      (item) => item.id === uploadedFileId,
    );
  }

  function hasAssignedUpload(visitId) {
    return !!state.uploads.visitFileMap[visitId];
  }

  function handleRoundingUpload(fileList) {
    const files = Array.from(fileList || []).slice(0, 1);
    state.uploads.roundingLibrary = files.map((file, index) => ({
      id: `rounding-file-${Date.now()}-${index}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
    }));
    state.uploads.visitFileMap = {};
    activeVisitPlan().forEach((visit) => {
      const file = state.uploads.roundingLibrary[0];
      if (file) {
        state.uploads.visitFileMap[visit.visitId] = file.id;
      }
    });
    renderAll();
  }

  function handleQuickNoteUpload(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) {
      return;
    }
    const nextItems = files.map((file, index) => ({
      id: `quick-note-${Date.now()}-${index}`,
      file,
      fileName: file.name,
      size: file.size,
      type: file.type,
      patientId: state.uploads.quickNotePatientId,
      topic: state.uploads.quickNoteTopic,
    }));
    state.uploads.quickNotes = [
      ...nextItems,
      ...state.uploads.quickNotes,
    ].slice(0, 12);
    renderAll();
  }

  function renderQuickNotePatientOptions() {
    if (!elements.quicknotePatient) {
      if (!elements.mobileQuicknotePatient) {
        return;
      }
    }
    const options = DATA.patients.items
      .map(
        (patient) => `
          <option value="${escapeHtml(patient.patientId)}">
            ${escapeHtml(patient.roomLabel)} · ${escapeHtml(patient.patientLabel)}
          </option>
        `,
      )
      .join('');
    if (elements.quicknotePatient) {
      elements.quicknotePatient.innerHTML = options;
      elements.quicknotePatient.value = state.uploads.quickNotePatientId;
    }
    if (elements.mobileQuicknotePatient) {
      elements.mobileQuicknotePatient.innerHTML = options;
      elements.mobileQuicknotePatient.value = state.uploads.quickNotePatientId;
    }
  }

  function renderMobileQuickNoteTopicOptions() {
    if (elements.mobileQuicknoteTopic) {
      elements.mobileQuicknoteTopic.value = state.uploads.quickNoteTopic;
    }
  }

  function countAssignedUploads() {
    return activeVisitPlan().filter(
      (visit) => !!state.uploads.visitFileMap[visit.visitId],
    ).length;
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) {
      return '-';
    }
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    if (bytes >= 1024) {
      return `${Math.round(bytes / 1024)} KB`;
    }
    return `${bytes} B`;
  }

  function topicLabel(topic) {
    return (
      {
        OBSERVATION: '관찰사항',
        TREATMENT: '처치',
        PAIN: '통증',
        RESPIRATION: '호흡',
        DIET: '식이',
      }[topic] || topic
    );
  }

  function patientLabel(patientId) {
    const realPatient = state.real.patients.find(
      (patient) => patient.patientId === patientId,
    );
    return (
      realPatient?.displayName ||
      patientById(patientId)?.patientLabel ||
      patientId
    );
  }

  function patientForVisit(visit) {
    const realPatient = state.real.patients.find(
      (patient) => patient.patientId === visit.patientId,
    );
    if (!realPatient) {
      return patientById(visit.patientId);
    }
    const templateVisit = DATA.rounding.visitPlan.find(
      (item) => item.visitId === visit.mockVisitId,
    );
    const templatePatient = patientById(templateVisit.patientId);
    return {
      ...templatePatient,
      patientId: realPatient.patientId,
      patientLabel: realPatient.displayName,
      roomLabel: realPatient.roomLabel,
    };
  }

  function patientById(patientId) {
    return DATA.patients.items.find(
      (patient) => patient.patientId === patientId,
    );
  }

  function nurseByPersona(persona) {
    return DATA.nurses.items.find((nurse) => nurse.persona === persona);
  }

  function activeSessionId() {
    return state.config.activePersona === 'SENDER'
      ? state.config.senderSessionId
      : state.config.receiverSessionId;
  }

  function syncDemoSessions(realData) {
    const sender = realData.sessions.find((item) => item.persona === 'SENDER');
    const receiver = realData.sessions.find(
      (item) => item.persona === 'RECEIVER',
    );
    state.config.senderSessionId = sender
      ? sender.sessionId
      : state.config.senderSessionId;
    state.config.receiverSessionId = receiver
      ? receiver.sessionId
      : state.config.receiverSessionId;
    persistConfig();
  }

  function markVisitCompleted(visitId, recordId) {
    if (!state.session.completedVisitIds.includes(visitId)) {
      state.session.completedVisitIds = [
        ...state.session.completedVisitIds,
        visitId,
      ];
    }
    state.session.records[visitId] = recordId;
  }

  function isCurrentVisitCompleted() {
    return state.session.completedVisitIds.includes(currentVisit().visitId);
  }

  function completedVisitResults() {
    return state.session.completedVisitIds.map((visitId) =>
      getVisitResultById(visitId),
    );
  }

  function uniqueCompletedPatientIds() {
    return Array.from(
      new Set(
        state.session.completedVisitIds.map(
          (visitId) => getVisitById(visitId).patientId,
        ),
      ),
    );
  }

  function activeVisitPlan() {
    if (state.config.mode !== 'mock' && state.real.visitPlan.length > 0) {
      return state.real.visitPlan;
    }
    return DATA.rounding.visitPlan;
  }

  async function loadRealPatients() {
    const headers = { 'X-Request-Id': createRequestId() };
    if (state.config.senderSessionId) {
      headers['X-Demo-Session-Id'] = state.config.senderSessionId;
    }
    const outcome = await API.request({
      baseUrl: state.config.baseUrl,
      path: '/api/v1/patients',
      method: 'GET',
      headers,
    });
    if (!outcome.ok) {
      return outcome;
    }

    const patients = extractResponseData(outcome.body).items || [];
    if (patients.length === 0) {
      return {
        ok: false,
        isRouteNotFound: false,
        status: 422,
        statusText: 'No assigned patients',
        body: {
          error: {
            code: 'REAL_PATIENTS_EMPTY',
            message: '실제 demo session에 배정된 환자가 없습니다.',
          },
        },
      };
    }

    state.real.patients = patients;
    state.real.visitPlan = [1, 2].flatMap((roundNumber) =>
      patients.map((patient, patientIndex) => {
        const template = DATA.rounding.visitPlan.find(
          (visit, visitIndex) =>
            visit.roundNumber === roundNumber &&
            visitIndex % DATA.patients.items.length === patientIndex,
        );
        if (!template) {
          throw new Error('실제 환자용 라운딩 template를 찾을 수 없습니다.');
        }
        return {
          ...template,
          visitId: `real-r${roundNumber}-${patient.patientId}`,
          patientId: patient.patientId,
          mockVisitId: template.visitId,
        };
      }),
    );
    state.session.currentVisitIndex = 0;
    state.uploads.visitFileMap = {};
    return outcome;
  }

  function stableIdempotencyKey(scope, requestShape) {
    const requestIdentity = JSON.stringify({
      method: requestShape.method,
      path: requestShape.path,
      body: requestShape.body || null,
    });
    const scopedRequest = `${scope}:${requestIdentity}`;
    if (!state.idempotencyKeys[scopedRequest]) {
      state.idempotencyKeys[scopedRequest] = createRequestId();
    }
    return state.idempotencyKeys[scopedRequest];
  }

  function currentSeoulDate() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function defaultApiBaseUrl() {
    if (
      window.location.protocol === 'http:' ||
      window.location.protocol === 'https:'
    ) {
      return window.location.origin;
    }
    return 'http://localhost:3000';
  }

  function summarizeHandoffDraft(draft) {
    const sectionLabels = [
      ['patientStatus', 'PATIENT_STATUS'],
      ['pain', 'PAIN'],
      ['treatment', 'TREATMENT'],
      ['diet', 'DIET'],
      ['activity', 'ACTIVITY'],
      ['observation', 'OBSERVATION'],
    ];
    return (draft.patients || [])
      .flatMap((patient) =>
        sectionLabels.map(
          ([key, label]) => `${label}: ${patient.sections[key] || ''}`,
        ),
      )
      .join('\n');
  }

  function lastVisit() {
    const plan = activeVisitPlan();
    return plan[plan.length - 1];
  }

  function joinUrl(baseUrl, path) {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    if (normalizedBase.endsWith('/api/v1') && path.startsWith('/api/v1')) {
      return normalizedBase + path.slice('/api/v1'.length);
    }
    return `${normalizedBase}${path}`;
  }

  function parseResponseBody(text) {
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch (_error) {
      return { rawText: text };
    }
  }

  function extractResponseData(body) {
    if (!body) {
      return {};
    }
    return body.data || body;
  }

  function inferNextAction(actionId) {
    if (actionId === 'health') {
      return 'Demo Session 또는 라운딩 시작';
    }
    if (actionId === 'create-demo-session') {
      return '라운딩 시작';
    }
    if (actionId === 'start-rounding') {
      return currentVisit().expectedNextAction;
    }
    if (actionId === 'complete-current-patient') {
      return currentVisit() === lastVisit() ? '전체 라운딩 종료' : '다음 환자';
    }
    if (actionId === 'complete-rounding') {
      return '오디오 업로드·분석';
    }
    if (actionId === 'analyze-server') {
      return '스크립트 또는 Evidence 확인';
    }
    if (actionId === 'show-evidence') {
      return '업무 목록 또는 인수인계 질문';
    }
    if (actionId === 'show-tasks') {
      return '인수인계 질문';
    }
    if (actionId === 'show-handoff-precheck') {
      return '인수인계 초안';
    }
    return '다음 액션 수동 선택';
  }

  function createRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `lab-${Math.random().toString(16).slice(2)}-${Date.now()}`;
  }

  function applyTone(element, tone) {
    element.classList.remove('accent', 'warning', 'danger');
    if (tone === 'accent' || tone === 'warning' || tone === 'danger') {
      element.classList.add(tone);
    }
  }

  function formatTimestamp(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) {
      return isoString;
    }
    return date.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
})();
