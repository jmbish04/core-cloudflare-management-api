const state = {
  definitions: [],
  latestSession: null,
  isRunning: false,
};

document.addEventListener('DOMContentLoaded', async () => {
  await loadDefinitions();
  await loadLatestSession();
  setupEventListeners();
});

function setupEventListeners() {
  const runButton = document.getElementById('runUnitTestsButton');
  if (runButton) {
    runButton.addEventListener('click', runUnitTests);
  }
}

async function loadDefinitions() {
  try {
    const response = await fetch('/health/unit-tests');
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to load unit test definitions');
    }
    state.definitions = data.result || [];
    renderTests();
  } catch (error) {
    showToast('Unable to fetch test definitions', error.message, true);
  }
}

async function loadLatestSession() {
  try {
    const response = await fetch('/health/tests/session/latest');
    if (!response.ok) {
      if (response.status === 404) {
        updateSummary(null);
        renderTests();
        return;
      }
      throw new Error(await response.text());
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to load latest session');
    }
    state.latestSession = data.result;
    updateSummary(state.latestSession.session);
    renderTests();
  } catch (error) {
    showToast('Unable to load latest session', error.message, true);
    updateSummary(null);
    renderTests();
  }
}

async function runUnitTests() {
  if (state.isRunning) return;
  try {
    setRunning(true);
    renderTests();

    const response = await fetch('/health/tests/run', { method: 'POST' });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Test run failed');
    }

    state.latestSession = data.result;
    updateSummary(state.latestSession.session);
    renderTests();
    showToast('Unit tests completed', 'All results have been recorded.', false);
  } catch (error) {
    showToast('Test run failed', error.message, true);
  } finally {
    setRunning(false);
  }
}

function setRunning(value) {
  state.isRunning = value;
  const runButton = document.getElementById('runUnitTestsButton');
  if (runButton) {
    runButton.disabled = value;
    runButton.textContent = value ? 'Running suite…' : 'Run Unit Test Suite';
  }
}

function renderTests() {
  const container = document.getElementById('testsList');
  if (!container) return;

  container.innerHTML = '';
  const resultsByKey = buildResultsMap();

  state.definitions.forEach((definition) => {
    const result = resultsByKey.get(definition.testKey);
    const card = createTestCard(definition, result);
    container.appendChild(card);
  });

  updateGlobalBadge(resultsByKey);
}

function buildResultsMap() {
  const map = new Map();
  const latest = state.latestSession?.results || [];
  latest.forEach((item) => {
    map.set(item.testKey, item);
  });
  return map;
}

function createTestCard(definition, result) {
  const card = document.createElement('div');
  const status =
    state.isRunning && !result ? 'running' : result ? result.status : 'pending';

  card.className = 'test-card';
  card.dataset.status = status === 'running' ? 'pending' : status;

  const badge = document.createElement('span');
  badge.className = `badge ${
    status === 'pass'
      ? 'badge-status-pass'
      : status === 'fail'
      ? 'badge-status-fail'
      : 'badge-status-running'
  }`;
  badge.innerHTML =
    status === 'running'
      ? '<span class="spinner" style="width:14px;height:14px"></span>Running'
      : status === 'pass'
      ? 'Pass'
      : status === 'fail'
      ? 'Fail'
      : 'Pending';

  const header = document.createElement('div');
  header.className = 'test-header';
  const title = document.createElement('div');
  title.className = 'test-name';
  title.textContent = definition.name;
  header.appendChild(title);
  header.appendChild(badge);

  const meta = document.createElement('div');
  meta.className = 'test-meta';
  meta.innerHTML = `
    <span>ID • ${definition.testKey}</span>
    <span>Scope • ${definition.scope}</span>
    <span>Executor • ${definition.executorKey}</span>
  `;

  const description = document.createElement('div');
  description.className = 'test-meta';
  description.textContent =
    definition.description ||
    definition.metadata.description ||
    'Automated validation step';

  card.appendChild(header);
  card.appendChild(meta);
  card.appendChild(description);

  if (result) {
    const summary = document.createElement('div');
    summary.className = 'test-meta';
    summary.innerHTML = `
      <span>Status • ${result.status.toUpperCase()} ${
      result.httpStatus ? `(${result.httpStatus})` : ''
    }</span>
      <span>Duration • ${formatDuration(result.totalMs)}</span>
    `;
    card.appendChild(summary);

    if (result.aiHumanReadableErrorDescription) {
      const ai = document.createElement('div');
      ai.className = 'ai-summary';
      ai.textContent = result.aiHumanReadableErrorDescription;
      card.appendChild(ai);
    }
  } else if (state.isRunning) {
    const waiting = document.createElement('div');
    waiting.className = 'test-meta';
    waiting.textContent = 'Awaiting result…';
    card.appendChild(waiting);
  } else {
    const pending = document.createElement('div');
    pending.className = 'test-meta';
    pending.textContent = 'No recorded results';
    card.appendChild(pending);
  }

  const footer = document.createElement('div');
  footer.className = 'test-footer';
  const lastRun =
    result?.runAt || state.latestSession?.session?.completedAt || null;
  footer.innerHTML = `
    <span>${lastRun ? formatRelativeTime(new Date(lastRun)) : 'Never run'}</span>
    <span>${definition.category || 'uncategorised'}</span>
  `;
  card.appendChild(footer);

  return card;
}

function updateSummary(session) {
  const sessionUuid = document.getElementById('sessionUuid');
  const sessionTrigger = document.getElementById('sessionTrigger');
  const lastRunTimestamp = document.getElementById('lastRunTimestamp');
  const runDuration = document.getElementById('runDuration');
  const passCount = document.getElementById('passCount');
  const failCount = document.getElementById('failCount');
  const totalCount = document.getElementById('totalCount');

  if (!session) {
    sessionUuid.textContent = '—';
    sessionTrigger.textContent = '—';
    lastRunTimestamp.textContent = 'No history';
    runDuration.textContent = '';
    passCount.textContent = '0';
    failCount.textContent = '0';
    totalCount.textContent = String(state.definitions.length);
    return;
  }

  sessionUuid.textContent = session.sessionUuid;
  sessionTrigger.textContent = session.triggerSource;
  lastRunTimestamp.textContent = formatRelativeTime(new Date(session.completedAt));
  runDuration.textContent = `Duration ${formatDuration(session.durationMs)}`;
  passCount.textContent = String(session.passedTests);
  failCount.textContent = String(session.failedTests);
  totalCount.textContent = String(session.totalTests);
}

function updateGlobalBadge(resultsByKey) {
  const badge = document.getElementById('globalStatusBadge');
  if (!badge) return;

  if (state.isRunning) {
    badge.className = 'badge badge-status-running';
    badge.innerHTML =
      '<span class="spinner" style="width:14px;height:14px"></span>Running';
    return;
  }

  const total = state.definitions.length;
  const completed = resultsByKey.size;
  const failures = state.latestSession
    ? state.latestSession.session.failedTests
    : 0;

  if (completed === 0) {
    badge.className = 'badge badge-status-running';
    badge.textContent = 'Awaiting first run';
    return;
  }

  if (failures > 0) {
    badge.className = 'badge badge-status-fail';
    badge.textContent = `${failures} failing of ${total}`;
  } else {
    badge.className = 'badge badge-status-pass';
    badge.textContent = `All ${total} tests passing`;
  }
}

function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatRelativeTime(date) {
  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function showToast(title, message, isError) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div>
      <strong>${title}</strong>
      <span>${message}</span>
    </div>
    <button aria-label="Dismiss">&times;</button>
  `;

  if (!isError) {
    toast.style.borderColor = 'rgba(34, 197, 94, 0.35)';
  }

  const closeBtn = toast.querySelector('button');
  closeBtn.addEventListener('click', () => toast.remove());

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 10_000);
}
