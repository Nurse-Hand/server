(() => {
  'use strict';

  const STORAGE_KEY = 'nurse-hand-rounding-mvp-lab';
  const DATA = window.__ROUNDING_MVP_LAB_DATA__;

  if (!DATA) {
    document.body.innerHTML =
      "<main style='padding:24px;font-family:system-ui'>embedded mockdata를 찾을 수 없습니다.</main>";
    return;
  }

  const elements = {
    modeRadios: Array.from(document.querySelectorAll('input[name="mode"]')),
    personaRadios: Array.from(
      document.querySelectorAll('input[name="persona"]'),
    ),
    baseUrl: document.getElementById('base-url'),
    senderSessionId: document.getElementById('sender-session-id'),
    receiverSessionId: document.getElementById('receiver-session-id'),
    modeBadge: document.getElementById('mode-badge'),
    scenarioCaption: document.getElementById('scenario-caption'),
    sessionState: document.getElementById('session-state'),
    sessionSummary: document.getElementById('session-summary'),
    visitRoute: document.getElementById('visit-route'),
    currentVisit: document.getElementById('current-visit'),
    manifestList: document.getElementById('manifest-list'),
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
      applyReal(realData) {
        syncDemoSessions(realData);
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
            startedAt: `${DATA.rounding.roundingDate}T09:10:00+09:00`,
            note: `${DATA.rounding.sessionTemplate.sessionLabel} / synthetic ${DATA.rounding.visitPlan.length} visits`,
          },
          description: '라운딩 세션 시작',
        };
      },
      applyReal(realData) {
        state.session.status = 'IN_PROGRESS';
        state.session.sessionId =
          realData.id || realData.sessionId || state.session.sessionId;
        state.session.currentVisitIndex = 0;
        state.session.completedVisitIds = [];
        state.session.records = {};
        state.flags.analysisReady = false;
        state.flags.tasksReady = false;
        state.flags.precheckReady = false;
        state.flags.handoffReady = false;
      },
      mockHandler() {
        const data = DATA.expectedResults.sessionStart.mockResponse.data;
        state.session.status = 'IN_PROGRESS';
        state.session.sessionId = data.sessionId;
        state.session.currentVisitIndex = 0;
        state.session.completedVisitIds = [];
        state.session.records = {};
        state.session.completedAt = null;
        state.flags.analysisReady = false;
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
        const manifest = getManifestByAssetId(visit.audioAssetId);
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
            note: `${visit.roundLabel} / ${visit.summaryHint} / audio=${manifest.workspaceRelativePath}`,
          },
          labMetadata: {
            visitId: visit.visitId,
            audioAssetId: visit.audioAssetId,
            relativePathFromToolDir: manifest.relativePathFromToolDir,
            workspaceRelativePath: manifest.workspaceRelativePath,
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
        if (
          state.session.currentVisitIndex >=
          DATA.rounding.visitPlan.length - 1
        ) {
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
          state.session.completedVisitIds.length !==
          DATA.rounding.visitPlan.length
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
            completedAt: `${DATA.rounding.roundingDate}T14:55:00+09:00`,
          },
          description: '라운딩 세션 종료',
        };
      },
      applyReal() {
        state.session.status = 'COMPLETED';
        state.session.completedAt = `${DATA.rounding.roundingDate}T14:55:00+09:00`;
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
            '2차 라운딩까지 종료했습니다. 이제 서버 분석, task 추출, handoff 흐름을 확인할 수 있습니다.',
          nextAction: '서버 분석',
          summaryLines: [
            `sessionId: ${state.session.sessionId}`,
            `completedVisitCount: ${state.session.completedVisitIds.length}`,
            'status: COMPLETED',
          ],
        };
      },
    },
    'analyze-server': {
      label: '서버 분석',
      transport: 'http',
      guard() {
        if (state.session.completedVisitIds.length === 0) {
          return failResult(
            'warning',
            '분석할 기록이 없습니다.',
            '현재 환자 종료',
          );
        }
        return null;
      },
      buildRequest() {
        return {
          method: 'POST',
          path: DATA.rounding.sessionTemplate.apiPaths.audioAnalyze.replace(
            '{sessionId}',
            state.session.sessionId,
          ),
          requiresDemoSession: true,
          body: {
            sessionId: state.session.sessionId,
            items: completedVisitResults().map((visitResult) => {
              const visit = getVisitById(visitResult.visitId);
              const manifest = getManifestByAssetId(visit.audioAssetId);
              return {
                visitId: visit.visitId,
                patientId: visit.patientId,
                audioAssetId: visit.audioAssetId,
                workspaceRelativePath: manifest.workspaceRelativePath,
                relativePathFromToolDir: manifest.relativePathFromToolDir,
              };
            }),
          },
          description: '오디오 chunk 기반 서버 분석',
        };
      },
      applyReal() {
        state.flags.analysisReady = true;
      },
      mockHandler() {
        state.flags.analysisReady = true;
        return {
          responsePayload: DATA.expectedResults.analysisJob.mockResponse,
          detailText:
            '6개 visit 기준 evidence 추출과 patient match review summary를 생성했습니다.',
          nextAction: 'Evidence 또는 업무 후보',
          summaryLines: [
            'processedVisitCount: 6',
            'patientMatchReviewCount: 2',
            'evidenceCount: 14',
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
        return {
          responsePayload: {
            data: {
              script: DATA.expectedResults.scripts.fullTranscript,
            },
            meta: {
              requestId: 'local-full-script',
            },
          },
          detailText: DATA.expectedResults.scripts.fullTranscript,
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
        const patientScript = DATA.expectedResults.scripts.patientScripts.find(
          (item) => item.patientId === currentVisit().patientId,
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
      transport: 'local',
      guard() {
        if (state.session.completedVisitIds.length === 0) {
          return failResult(
            'warning',
            '표시할 evidence가 없습니다.',
            '현재 환자 종료',
          );
        }
        return null;
      },
      buildRequest() {
        return {
          method: 'LOCAL',
          path: 'lab://show-evidence',
          requiresDemoSession: false,
          body: {
            visitId: currentVisit().visitId,
          },
          description: '현재 방문 evidence 보기',
        };
      },
      mockHandler() {
        const visitResult = currentVisitResult();
        return {
          responsePayload: {
            data: visitResult.evidence,
            meta: {
              requestId: 'local-evidence',
            },
          },
          detailText: visitResult.evidence
            .map((item) => `${item.kind}: ${item.summary} (${item.evidenceId})`)
            .join('\n'),
          nextAction: '업무 후보',
          summaryLines: [
            `patient: ${patientLabel(visitResult.patientId)}`,
            `evidenceCount: ${visitResult.evidence.length}`,
          ],
        };
      },
    },
    'extract-tasks': {
      label: '업무 후보',
      transport: 'http',
      guard() {
        if (
          !state.flags.analysisReady &&
          state.session.completedVisitIds.length === 0
        ) {
          return failResult(
            'warning',
            '분석 결과가 아직 없습니다.',
            '서버 분석',
          );
        }
        return null;
      },
      buildRequest() {
        return {
          method: 'POST',
          path: DATA.rounding.sessionTemplate.apiPaths.tasksExtract,
          requiresDemoSession: true,
          body: {
            sessionId: state.session.sessionId,
            recordIds: Object.values(state.session.records),
            evidenceIds: completedVisitResults().flatMap((item) =>
              item.evidence.map((evidence) => evidence.evidenceId),
            ),
          },
          description: '업무 추출 job 생성',
        };
      },
      applyReal() {
        state.flags.tasksReady = true;
      },
      mockHandler() {
        state.flags.tasksReady = true;
        return {
          responsePayload: DATA.expectedResults.taskExtractionJob.mockResponse,
          detailText:
            DATA.expectedResults.taskExtractionJob.mockResponse.data.candidates
              .map(
                (candidate) =>
                  `${patientLabel(candidate.patientId)} / ${candidate.title} / ${candidate.effectivePriority}`,
              )
              .join('\n'),
          nextAction: '인수인계 질문',
          summaryLines: [
            'taskExtraction status: SUCCEEDED',
            `candidates: ${DATA.expectedResults.taskExtractionJob.mockResponse.data.candidates.length}`,
          ],
        };
      },
    },
    'show-handoff-precheck': {
      label: '인수인계 질문',
      transport: 'http',
      guard() {
        if (!state.flags.tasksReady) {
          return failResult(
            'warning',
            '업무 후보가 아직 없습니다.',
            '업무 후보',
          );
        }
        return null;
      },
      buildRequest() {
        return {
          method: 'POST',
          path: DATA.rounding.sessionTemplate.apiPaths.handoffPrecheck,
          requiresDemoSession: true,
          body: {
            sessionId: state.session.sessionId,
            receiverNurseId: nurseByPersona('RECEIVER').nurseId,
            patientIds: uniqueCompletedPatientIds(),
            taskIds: DATA.tasks.items.map((task) => task.taskId),
          },
          description: 'handoff precheck 생성',
        };
      },
      applyReal() {
        state.flags.precheckReady = true;
      },
      mockHandler() {
        state.flags.precheckReady = true;
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
          body: {
            sessionId: state.session.sessionId,
            senderNurseId: nurseByPersona('SENDER').nurseId,
            receiverNurseId: nurseByPersona('RECEIVER').nurseId,
            patientIds: uniqueCompletedPatientIds(),
            precheckId:
              DATA.expectedResults.handoffPrecheck.mockResponse.data.precheckId,
          },
          description: 'handoff draft 생성',
        };
      },
      applyReal() {
        state.flags.handoffReady = true;
      },
      mockHandler() {
        state.flags.handoffReady = true;
        return {
          responsePayload: DATA.expectedResults.handoffDraft.mockResponse,
          detailText:
            DATA.expectedResults.handoffDraft.mockResponse.data.sections
              .map((section) => `${section.section}. ${section.content}`)
              .join('\n\n'),
          nextAction:
            DATA.expectedResults.handoffDraft.mockResponse.data.nextAction,
          summaryLines: [
            `handoffId: ${DATA.expectedResults.handoffDraft.mockResponse.data.handoffId}`,
            'SBAR draft 생성 완료',
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
  };

  bindEvents();
  renderAll();

  function bindEvents() {
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
        if (apiOutcome.ok) {
          const realData = extractResponseData(apiOutcome.body);
          if (action.applyReal) {
            action.applyReal(realData);
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
              `${requestShape.method} ${requestShape.path}`,
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

      if (mode === 'real') {
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

      if (!apiOutcome) {
        apiOutcome = {
          ok: false,
          isNotImplemented: false,
          status: 0,
          statusText: requestError.message,
          body: {
            error: {
              code: requestError.code,
              message: requestError.message,
            },
          },
        };
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
        baseUrl: config.baseUrl || 'http://localhost:3000',
        activePersona: config.activePersona || 'SENDER',
        senderSessionId: config.senderSessionId || '',
        receiverSessionId: config.receiverSessionId || '',
      },
      session: {
        sessionId:
          DATA.expectedResults.sessionStart.mockResponse.data.sessionId,
        status: 'IDLE',
        currentVisitIndex: 0,
        completedVisitIds: [],
        completedAt: null,
        records: {},
      },
      flags: {
        analysisReady: false,
        tasksReady: false,
        precheckReady: false,
        handoffReady: false,
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
          '6 visit / 3 patient / 6 local m4a metadata',
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
    renderHeader();
    renderSessionSummary();
    renderRoute();
    renderCurrentVisit();
    renderManifest();
    renderConsole();
    renderLogs();
    renderButtons();
  }

  function syncFormControls() {
    elements.baseUrl.value = state.config.baseUrl;
    elements.senderSessionId.value = state.config.senderSessionId;
    elements.receiverSessionId.value = state.config.receiverSessionId;

    elements.modeRadios.forEach((radio) => {
      radio.checked = radio.value === state.config.mode;
    });

    elements.personaRadios.forEach((radio) => {
      radio.checked = radio.value === state.config.activePersona;
    });
  }

  function renderHeader() {
    elements.modeBadge.textContent = state.config.mode;
    elements.scenarioCaption.textContent = `${DATA.rounding.sessionTemplate.wardLabel} / ${DATA.rounding.roundingDate} / ${state.lastResult.nextAction}`;
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
    elements.manifestNote.textContent = `${DATA.audioManifest.items.length} local m4a metadata`;
  }

  function renderSessionSummary() {
    const items = [
      {
        value: `${state.session.completedVisitIds.length}/${DATA.rounding.visitPlan.length}`,
        label: 'visit 완료',
      },
      {
        value: state.flags.analysisReady ? 'ready' : 'pending',
        label: '분석',
      },
      {
        value: state.flags.tasksReady ? 'ready' : 'pending',
        label: '업무',
      },
      {
        value: state.flags.handoffReady ? 'ready' : 'pending',
        label: 'handoff',
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
    elements.visitRoute.innerHTML = DATA.rounding.visitPlan
      .map((visit, index) => {
        const classes = ['route-stop'];
        if (index === state.session.currentVisitIndex) {
          classes.push('current');
        }
        if (state.session.completedVisitIds.includes(visit.visitId)) {
          classes.push('completed');
        }
        return `
          <li class="${classes.join(' ')}">
            <span class="index-pill">${index + 1}</span>
            <div class="route-copy">
              <strong>${escapeHtml(patientLabel(visit.patientId))}</strong>
              <span>${escapeHtml(visit.roundLabel)} / ${escapeHtml(visit.summaryHint)}</span>
            </div>
            <span class="mini-status">${escapeHtml(visit.roundNumber + 'R')}</span>
          </li>
        `;
      })
      .join('');
  }

  function renderCurrentVisit() {
    const visit = currentVisit();
    const manifest = getManifestByAssetId(visit.audioAssetId);
    const visitResult = currentVisitResult();
    const completed = isCurrentVisitCompleted() ? 'yes' : 'no';
    elements.currentVisit.textContent = [
      `현재 visit: ${visit.visitId}`,
      `환자: ${patientLabel(visit.patientId)} / ${visit.roundLabel}`,
      `summary hint: ${visit.summaryHint}`,
      `audio: ${manifest.fileName}`,
      `recorded: ${completed}`,
      `expected result: ${visitResult.shortSummary}`,
    ].join('\n');
  }

  function renderManifest() {
    elements.manifestList.innerHTML = DATA.audioManifest.items
      .map(
        (item) => `
          <div class="manifest-row">
            <strong>${escapeHtml(item.fileName)} / ${escapeHtml(patientLabel(item.patientId))}</strong>
            <span>${escapeHtml(item.workspaceRelativePath)}</span>
            <span>${escapeHtml(item.relativePathFromToolDir)}</span>
          </div>
        `,
      )
      .join('');
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
      `<hr style="border:0;border-top:1px solid #d4ddd9;margin:12px 0" />`,
      `<div>${escapeHtml(state.lastResult.detailText)}</div>`,
    ].join('');
    elements.detailSnapshot.textContent = state.lastResult.detailText;
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
        state.session.currentVisitIndex >= DATA.rounding.visitPlan.length - 1
      );
    }
    if (actionId === 'complete-rounding') {
      return state.session.status !== 'IN_PROGRESS';
    }
    if (actionId === 'analyze-server') {
      return state.session.completedVisitIds.length === 0;
    }
    if (actionId === 'extract-tasks') {
      return (
        !state.flags.analysisReady &&
        state.session.completedVisitIds.length === 0
      );
    }
    if (actionId === 'show-handoff-precheck') {
      return !state.flags.tasksReady;
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
      headers: buildHeaders(requestShape),
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

    if (requestShape.requiresDemoSession && !activeSessionId()) {
      return {
        code: 'DEMO_SESSION_REQUIRED',
        message: 'X-Demo-Session-Id가 없습니다.',
        nextAction: 'Demo Session 생성',
      };
    }

    return null;
  }

  async function executeHttp(requestShape) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(
        joinUrl(state.config.baseUrl, requestShape.path),
        {
          method: requestShape.method,
          headers: buildHeaders(requestShape),
          body: requestShape.body
            ? JSON.stringify(requestShape.body)
            : undefined,
          signal: controller.signal,
        },
      );
      const text = await response.text();
      const body = parseResponseBody(text);
      return {
        ok: response.ok,
        isNotImplemented: [404, 405, 501].includes(response.status),
        status: response.status,
        statusText: response.statusText,
        body,
      };
    } catch (error) {
      return {
        ok: false,
        isNotImplemented: false,
        status: 0,
        statusText: error.name === 'AbortError' ? 'timeout' : error.message,
        body: {
          error: {
            code: error.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
            message: error.message,
          },
        },
      };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  function buildHeaders(requestShape) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Request-Id': createRequestId(),
    };
    if (requestShape.requiresDemoSession) {
      headers['X-Demo-Session-Id'] = activeSessionId();
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
    const tone = apiOutcome.isNotImplemented ? 'warning' : 'danger';
    return {
      tone,
      statusText: apiOutcome.isNotImplemented ? 'not-implemented' : 'failed',
      originText: 'real',
      detailText: `${requestShape.method} ${requestShape.path} -> ${apiOutcome.status} ${apiOutcome.statusText}`,
      nextAction: apiOutcome.isNotImplemented
        ? 'mock mode 또는 fallback 사용'
        : 'response payload 확인',
      summaryLines: [
        `${requestShape.method} ${requestShape.path}`,
        `status: ${apiOutcome.status}`,
        apiOutcome.isNotImplemented
          ? 'API not implemented or unavailable'
          : 'API failed',
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

  function currentVisit() {
    return DATA.rounding.visitPlan[state.session.currentVisitIndex];
  }

  function currentVisitResult() {
    return getVisitResultById(currentVisit().visitId);
  }

  function estimateVisitStartedAt(visit) {
    const visitIndex = DATA.rounding.visitPlan.findIndex(
      (item) => item.visitId === visit.visitId,
    );

    return formatRoundingTime(9 * 60 + 10 + visitIndex * 20);
  }

  function estimateVisitEndedAt(visit) {
    const visitIndex = DATA.rounding.visitPlan.findIndex(
      (item) => item.visitId === visit.visitId,
    );

    return formatRoundingTime(9 * 60 + 15 + visitIndex * 20);
  }

  function formatRoundingTime(totalMinutes) {
    return `${DATA.rounding.roundingDate}T${String(
      Math.floor(totalMinutes / 60),
    ).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}:00+09:00`;
  }

  function getVisitResultById(visitId) {
    return DATA.expectedResults.visitResults.find(
      (item) => item.visitId === visitId,
    );
  }

  function getVisitById(visitId) {
    return DATA.rounding.visitPlan.find((visit) => visit.visitId === visitId);
  }

  function getManifestByAssetId(audioAssetId) {
    return DATA.audioManifest.items.find(
      (item) => item.audioAssetId === audioAssetId,
    );
  }

  function patientLabel(patientId) {
    return patientById(patientId).patientLabel;
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

  function lastVisit() {
    return DATA.rounding.visitPlan[DATA.rounding.visitPlan.length - 1];
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
      return '서버 분석';
    }
    if (actionId === 'analyze-server') {
      return '업무 후보';
    }
    if (actionId === 'extract-tasks') {
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
