(() => {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 10_000;
  const DEFAULT_POLL_INTERVAL_MS = 500;
  const DEFAULT_POLL_TIMEOUT_MS = 30_000;

  async function request(options) {
    const fetchImpl = options.fetchImpl || window.fetch.bind(window);
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const headers = { ...(options.headers || {}) };
    let body;

    if (options.formData) {
      body = options.formData;
      delete headers['Content-Type'];
      delete headers['content-type'];
    } else if (options.jsonBody !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.jsonBody);
    }

    try {
      const response = await fetchImpl(joinUrl(options.baseUrl, options.path), {
        method: options.method,
        headers,
        body,
        signal: controller.signal,
      });
      const text = await response.text();
      const responseBody = parseResponseBody(text);

      return {
        ok: response.ok,
        isRouteNotFound:
          response.status === 404 &&
          responseBody?.error?.code === 'ROUTE_NOT_FOUND',
        status: response.status,
        statusText: response.statusText,
        body: responseBody,
      };
    } catch (error) {
      const timedOut = error?.name === 'AbortError';
      return {
        ok: false,
        isRouteNotFound: false,
        status: 0,
        statusText: timedOut ? 'timeout' : String(error?.message || error),
        body: {
          error: {
            code: timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
            message: timedOut
              ? `요청 시간이 ${timeoutMs}ms를 초과했습니다.`
              : '네트워크 요청에 실패했습니다.',
          },
        },
      };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function poll(options) {
    const startedAt = Date.now();
    const pollIntervalMs = options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS;
    const pollTimeoutMs = options.pollTimeoutMs || DEFAULT_POLL_TIMEOUT_MS;
    const sleep =
      options.sleep ||
      ((milliseconds) =>
        new Promise((resolve) => window.setTimeout(resolve, milliseconds)));

    while (Date.now() - startedAt < pollTimeoutMs) {
      const outcome = await options.request();
      if (!outcome.ok) {
        return outcome;
      }

      const data = extractResponseData(outcome.body);
      const status = options.readStatus(data);
      if (options.terminalStatuses.includes(status)) {
        if (options.successStatuses.includes(status)) {
          return outcome;
        }

        return {
          ...outcome,
          ok: false,
          statusText: `terminal ${status}`,
        };
      }

      await sleep(pollIntervalMs);
    }

    return {
      ok: false,
      isRouteNotFound: false,
      status: 0,
      statusText: 'poll timeout',
      body: {
        error: {
          code: 'POLL_TIMEOUT',
          message: `작업 결과 조회가 ${pollTimeoutMs}ms를 초과했습니다.`,
        },
      },
    };
  }

  function joinUrl(baseUrl, path) {
    const normalizedBase = String(baseUrl || '').replace(/\/+$/, '');
    if (normalizedBase.endsWith('/api/v1') && path.startsWith('/api/v1')) {
      return normalizedBase + path.slice('/api/v1'.length);
    }
    return `${normalizedBase}${path}`;
  }

  function extractResponseData(body) {
    return body?.data || body || {};
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

  window.__ROUNDING_MVP_API__ = {
    extractResponseData,
    joinUrl,
    poll,
    request,
  };
})();
