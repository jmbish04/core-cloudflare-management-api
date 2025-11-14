const state = {
  definitions: [],
  latestSession: null,
  isRunning: false,
  healingPollInterval: null,
};

function formatDateIso(value) {
  try {
    if (!value) return '—';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  } catch (error) {
    console.error('Error formatting date:', error);
    return '—';
  }
}

function formatRelativeTime(date) {
  try {
    if (!date) return '—';
    const now = new Date();
    const targetDate = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(targetDate.getTime())) return '—';

    const diffMs = now.getTime() - targetDate.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);

    if (diffSeconds < 60) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks === 1 ? '' : 's'} ago`;
    return `${diffMonths} month${diffMonths === 1 ? '' : 's'} ago`;
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return '—';
  }
}

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

  // Filter event listeners
  const statusFilter = document.getElementById('statusFilter');
  const categoryFilter = document.getElementById('categoryFilter');
  const scopeFilter = document.getElementById('scopeFilter');

  if (statusFilter) {
    statusFilter.addEventListener('change', applyFilters);
  }
  if (categoryFilter) {
    categoryFilter.addEventListener('change', applyFilters);
  }
  if (scopeFilter) {
    scopeFilter.addEventListener('change', applyFilters);
  }
}

async function loadDefinitions() {
  try {
    const response = await fetch('/health/tests');
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to load health test definitions');
    }

    const rawDefinitions = Array.isArray(data.result) ? data.result : [];

    state.definitions = rawDefinitions.map((entry) => {
      try {
        if (entry?.definition) {
          const { definition, latestResult = null } = entry;
          return {
            ...definition,
            latestResult: latestResult
              ? {
                  testKey: definition.testKey,
                  status: latestResult.status,
                  runAt: latestResult.runAt,
                  httpStatus: latestResult.httpStatus ?? null,
                  httpStatusText: latestResult.httpStatusText ?? null,
                  totalMs: latestResult.totalMs ?? null,
                  aiHumanReadableErrorDescription: latestResult.aiSummary ?? null,
                }
              : null,
          };
        }

        const normalisedLatest = entry?.latestResult
          ? {
              testKey: entry.testKey,
              status: entry.latestResult.status,
              runAt: entry.latestResult.runAt,
              httpStatus: entry.latestResult.httpStatus ?? null,
              httpStatusText: entry.latestResult.httpStatusText ?? null,
              totalMs: entry.latestResult.totalMs ?? null,
              aiHumanReadableErrorDescription:
                entry.latestResult.aiHumanReadableErrorDescription ??
                entry.latestResult.aiSummary ??
                null,
            }
          : null;

        return {
          ...entry,
          latestResult: normalisedLatest,
        };
      } catch (mappingError) {
        console.error('Error mapping definition:', mappingError, entry);
        return entry; // Return as-is if mapping fails
      }
    });

    renderTests();
    populateFilters();
  } catch (error) {
    console.error('Error loading definitions:', error);
    showToast('Unable to fetch test definitions', error.message || 'Network error', true);
    // Still render with empty definitions to show proper UI state
    renderTests();
    populateFilters();
  }
}

async function loadLatestSession() {
  try {
    const response = await fetch('/health/latest');
    if (!response.ok) {
      if (response.status === 404) {
        updateSummary(null);
        renderTests();
        await loadSelfHealingForSession(null).catch(() => {}); // Ignore self-healing errors
        return;
      }
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Failed to load latest health check');
    }
    state.latestSession = data.result;
    updateSummary(state.latestSession.session);
    renderTests();
    await loadSelfHealingForSession(state.latestSession.session?.sessionUuid).catch(() => {}); // Ignore self-healing errors
  } catch (error) {
    console.error('Error loading latest session:', error);
    showToast('Unable to load latest session', error.message || 'Network error', true);
    updateSummary(null);
    renderTests();
    await loadSelfHealingForSession(null).catch(() => {}); // Ignore self-healing errors
  }
}

async function runUnitTests() {
  if (state.isRunning) return;
  setRunning(true);
  renderTests();

  try {
    const response = await fetch('/health/tests/run', { method: 'POST' });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Test run failed');
    }

    // Update UI immediately after getting response
    setRunning(false);
    state.latestSession = data.result;
    updateSummary(state.latestSession.session);
    renderTests();

    // Handle self-healing results if present
    if (data.result.selfHealing) {
      renderSelfHealing(data.result.selfHealing);
      // Start polling for real-time updates if healing is in progress
      const inProgress = data.result.selfHealing.results.some(r => r.status === 'in_progress' || r.status === 'pending');
      if (inProgress) {
        startHealingPolling(data.result.session.sessionUuid).catch(() => {}); // Ignore polling errors
      }
    } else {
      hideSelfHealing();
      stopHealingPolling();
    }

    showToast('Unit tests completed', 'All results have been recorded.', false);
  } catch (error) {
    console.error('Error running unit tests:', error);
    // Ensure running state is cleared even on error
    setRunning(false);
    showToast('Test run failed', error.message || 'Network error', true);
    updateSummary(null);
    renderTests();
    hideSelfHealing();
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

  const statusFilter = document.getElementById('statusFilter')?.value || 'all';
  const categoryFilter = document.getElementById('categoryFilter')?.value || 'all';
  const scopeFilter = document.getElementById('scopeFilter')?.value || 'all';

  let visibleCount = 0;

  state.definitions.forEach((definition) => {
    const result = resultsByKey.get(definition.testKey);
    const status = state.isRunning && !result ? 'running' : result ? result.status : 'pending';
    const category = definition.category || 'uncategorised';
    const scope = definition.scope || 'unknown';

    // Apply filters
    const statusMatch = statusFilter === 'all' ||
      (statusFilter === 'pass' && status === 'pass') ||
      (statusFilter === 'fail' && status === 'fail') ||
      (statusFilter === 'pending' && (status === 'pending' || status === 'running'));

    const categoryMatch = categoryFilter === 'all' || category === categoryFilter;
    const scopeMatch = scopeFilter === 'all' || scope === scopeFilter;

    if (statusMatch && categoryMatch && scopeMatch) {
      const card = createTestCard(definition, result);
      container.appendChild(card);
      visibleCount++;
    }
  });

  updateGlobalBadge(resultsByKey);
  updateVisibleCount(visibleCount);
}

function buildResultsMap() {
  const map = new Map();
  const latest = state.latestSession?.results || [];
  latest.forEach((item) => {
    map.set(item.testKey, item);
  });

  state.definitions.forEach((definition) => {
    if (definition.latestResult && !map.has(definition.testKey)) {
      map.set(definition.testKey, {
        testKey: definition.testKey,
        status: definition.latestResult.status,
        runAt: definition.latestResult.runAt,
        httpStatus: definition.latestResult.httpStatus ?? null,
        httpStatusText: definition.latestResult.httpStatusText ?? null,
        totalMs: definition.latestResult.totalMs ?? null,
        aiHumanReadableErrorDescription:
          definition.latestResult.aiHumanReadableErrorDescription ?? null,
      });
    }
  });

  return map;
}

function createTestCard(definition, result) {
  const card = document.createElement('div');
  const status =
    state.isRunning && !result ? 'running' : result ? result.status : 'pending';

  card.className = 'test-card';
  card.dataset.status = status === 'running' ? 'pending' : status;
  card.dataset.category = definition.category || 'uncategorised';
  card.dataset.scope = definition.scope || 'unknown';

  // Category and Scope badges at top
  const badgesContainer = document.createElement('div');
  badgesContainer.className = 'test-badges';

  const categoryBadge = document.createElement('span');
  categoryBadge.className = 'badge badge-category';
  categoryBadge.textContent = definition.category || 'uncategorised';

  const scopeBadge = document.createElement('span');
  scopeBadge.className = 'badge badge-scope';
  scopeBadge.textContent = definition.scope || 'unknown';

  badgesContainer.appendChild(categoryBadge);
  badgesContainer.appendChild(scopeBadge);

  // Status badge
  const statusBadge = document.createElement('span');
  statusBadge.className = `badge ${
    status === 'pass'
      ? 'badge-status-pass'
      : status === 'fail'
      ? 'badge-status-fail'
      : 'badge-status-running'
  }`;
  statusBadge.innerHTML =
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
  header.appendChild(statusBadge);

  const meta = document.createElement('div');
  meta.className = 'test-meta';
  meta.innerHTML = `
    <span>ID • ${definition.testKey}</span>
  `;

  const description = document.createElement('div');
  description.className = 'test-meta';
  description.textContent =
    definition.description ||
    definition.metadata?.description ||
    definition.metadata?.summary ||
    'Automated validation step';

  card.appendChild(badgesContainer);
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
  const lastRunDate = lastRun ? formatDateIso(lastRun) : null;
  footer.innerHTML = `
    <span>
      ${
        lastRunDate
          ? `<span class="date">${lastRunDate}</span>`
          : 'Never run'
      }
    </span>
  `;
  card.appendChild(footer);

  return card;
}

function updateSummary(session) {
  const sessionUuid = document.getElementById('sessionUuid');
  const sessionDate = document.getElementById('sessionDate');
  const sessionTrigger = document.getElementById('sessionTrigger');
  const runDuration = document.getElementById('runDuration');
  const lastRunTimestamp = document.getElementById('lastRunTimestamp');
  const passCount = document.getElementById('passCount');
  const failCount = document.getElementById('failCount');
  const totalCount = document.getElementById('totalCount');

  if (!session) {
    if (sessionUuid) sessionUuid.textContent = '—';
    if (sessionDate) sessionDate.textContent = '—';
    if (sessionTrigger) sessionTrigger.textContent = '—';
    if (runDuration) runDuration.textContent = '—';
    if (lastRunTimestamp) lastRunTimestamp.textContent = 'No history';
    if (passCount) passCount.textContent = '0';
    if (failCount) failCount.textContent = '0';
    if (totalCount) totalCount.textContent = String(state.definitions.length);
    return;
  }

  if (sessionUuid) sessionUuid.textContent = session.sessionUuid;
  if (sessionDate) sessionDate.textContent = formatDateIso(session.completedAt);
  if (sessionTrigger) sessionTrigger.textContent = session.triggerSource === 'manual' ? 'Triggered manually' : 'Scheduled testing';
  if (runDuration) runDuration.textContent = formatDuration(session.durationMs);
  if (lastRunTimestamp) lastRunTimestamp.textContent = formatRelativeTime(session.completedAt);

  // Count based on actual displayed results, not session summary
  const resultsByKey = buildResultsMap();
  let passCountNum = 0;
  let failCountNum = 0;

  resultsByKey.forEach((result) => {
    if (result.status === 'pass') {
      passCountNum++;
    } else if (result.status === 'fail') {
      failCountNum++;
    }
  });

  if (passCount) passCount.textContent = String(passCountNum);
  if (failCount) failCount.textContent = String(failCountNum);
  if (totalCount) totalCount.textContent = String(resultsByKey.size);
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

function renderSelfHealing(healingData, isUpdate = false) {
  const container = document.getElementById('selfHealingContainer');
  const statusEl = document.getElementById('healingStatus');
  const summaryEl = document.getElementById('healingSummary');
  const stepsEl = document.getElementById('healingSteps');

  if (!container || !statusEl || !summaryEl || !stepsEl) return;

  // Show the container
  container.style.display = 'block';

  // Check if healing is complete
  const allCompleted = healingData.results.every(r => r.status === 'success' || r.status === 'failed');
  const inProgress = healingData.results.filter(r => r.status === 'in_progress').length;

  if (allCompleted) {
    // Healing complete - remove spinner
    statusEl.innerHTML = `
      <span style="color: #4ade80;">✓</span>
      Self-healing analysis completed for ${healingData.results.length} failed test${healingData.results.length === 1 ? '' : 's'}
    `;
  } else {
    // Still in progress
    statusEl.innerHTML = `
      <span class="spinner" style="width:16px;height:16px"></span>
      Analyzing ${healingData.results.length} failed test${healingData.results.length === 1 ? '' : 's'} and attempting auto-repair... ${inProgress} in progress
    `;
  }

  // Generate summary
  const totalAttempts = healingData.results.length;
  const completedAttempts = healingData.results.filter(r => r.status === 'success' || r.status === 'failed').length;
  const successfulAttempts = healingData.results.filter(r => r.status === 'success').length;

  if (completedAttempts === totalAttempts) {
    summaryEl.textContent = `Self-healing analysis completed for ${totalAttempts} failed test${totalAttempts === 1 ? '' : 's'}. ${successfulAttempts} issue${successfulAttempts === 1 ? '' : 's'} were automatically resolved. ${totalAttempts - successfulAttempts} require${(totalAttempts - successfulAttempts) === 1 ? 's' : ''} manual intervention.`;
  } else {
    summaryEl.textContent = `Self-healing in progress: ${completedAttempts}/${totalAttempts} tests analyzed. ${successfulAttempts} resolved so far.`;
  }

  if (!isUpdate) {
    // Initial render - create all elements
    stepsEl.innerHTML = '';
  }

  healingData.results.forEach((result, index) => {
    let stepEl = stepsEl.children[index];

    if (!stepEl || !isUpdate) {
      // Create new element if it doesn't exist or not in update mode
      stepEl = document.createElement('div');
      stepEl.className = 'healing-step';
      if (!isUpdate) {
        stepsEl.appendChild(stepEl);
      } else {
        // In update mode, replace the element at this index
        if (stepsEl.children[index]) {
          stepsEl.replaceChild(stepEl, stepsEl.children[index]);
        } else {
          stepsEl.appendChild(stepEl);
        }
      }
    }

    let statusIcon = '⏳';
    let statusClass = 'pending';

    if (result.status === 'success') {
      statusIcon = '✅';
      statusClass = 'success';
    } else if (result.status === 'failed') {
      statusIcon = '❌';
      statusClass = 'failed';
    } else if (result.status === 'in_progress') {
      statusIcon = '🔄';
      statusClass = 'running';
    }

    stepEl.innerHTML = `
      <div class="step-status ${statusClass}">${statusIcon}</div>
      <div class="step-content">
        <div class="step-title">${result.test_name || 'Unknown Test'}</div>
        <div class="step-description">${result.ai_analysis || 'Analyzing failure...'}</div>
        ${result.status === 'success' ?
          `<div class="step-description" style="color: #4ade80;">✓ ${result.ai_recommendation || 'Issue resolved automatically'}</div>` :
          result.status === 'failed' ?
          `<div class="step-error">❌ ${result.error_message || 'Auto-healing failed'}</div>
           ${result.manual_steps_required ? `<div class="step-solution">💡 ${result.manual_steps_required}</div>` : ''}` :
          `<div class="step-description">🔄 ${result.ai_recommendation || 'Attempting to resolve...'}</div>`
        }
      </div>
    `;
  });

  // Remove extra elements if we have fewer results now
  while (stepsEl.children.length > healingData.results.length) {
    stepsEl.removeChild(stepsEl.lastChild);
  }
}

async function loadSelfHealingForSession(sessionUuid) {
  if (!sessionUuid) {
    hideSelfHealing();
    return;
  }

  try {
    const response = await fetch(`/health/tests/session/${sessionUuid}/healing`);
    if (!response.ok) {
      // No self-healing data for this session, hide the container
      hideSelfHealing();
      return;
    }

    const data = await response.json();
    if (data.success && data.result.results && data.result.results.length > 0) {
      // Enrich results with test names
      const enrichedResults = data.result.results.map(result => {
        try {
          // Find the test name from our state
          const testDef = state.definitions.find(def => def.id === result.health_test_id);
          return {
            ...result,
            test_name: testDef ? testDef.name : 'Unknown Test',
          };
        } catch (enrichError) {
          console.error('Error enriching self-healing result:', enrichError);
          return {
            ...result,
            test_name: 'Unknown Test',
          };
        }
      });

      renderSelfHealing({ results: enrichedResults });
    } else {
      hideSelfHealing();
    }
  } catch (error) {
    console.error('Error loading self-healing data:', error);
    hideSelfHealing();
  }
}

function hideSelfHealing() {
  const container = document.getElementById('selfHealingContainer');
  if (container) {
    container.style.display = 'none';
  }
  stopHealingPolling();
}

function startHealingPolling(sessionUuid) {
  if (!sessionUuid) return;

  stopHealingPolling(); // Clear any existing polling

  state.healingPollInterval = setInterval(async () => {
    try {
      const response = await fetch(`/health/tests/session/${sessionUuid}/healing`);
      if (!response.ok) return;

      const data = await response.json();
      if (data.success && data.result.results && data.result.results.length > 0) {
        // Enrich results with test names
        const enrichedResults = data.result.results.map(result => {
          try {
            // Find the test name from our state
            const testDef = state.definitions.find(def => def.id === result.health_test_id);
            return {
              ...result,
              test_name: testDef ? testDef.name : 'Unknown Test',
            };
          } catch (enrichError) {
            console.error('Error enriching healing result:', enrichError);
            return {
              ...result,
              test_name: 'Unknown Test',
            };
          }
        });

        renderSelfHealing({ results: enrichedResults }, true); // Update mode

        // Stop polling if all healing is complete
        const allCompleted = enrichedResults.every(r => r.status === 'success' || r.status === 'failed');
        if (allCompleted) {
          stopHealingPolling();
        }
      }
    } catch (error) {
      console.error('Error polling healing status:', error);
      // Continue polling even on errors, but don't crash
    }
  }, 2000); // Poll every 2 seconds
}

function stopHealingPolling() {
  if (state.healingPollInterval) {
    clearInterval(state.healingPollInterval);
    state.healingPollInterval = null;
  }
}

function populateFilters() {
  const categoryFilter = document.getElementById('categoryFilter');
  const scopeFilter = document.getElementById('scopeFilter');

  if (!categoryFilter || !scopeFilter) return;

  const categories = new Set();
  const scopes = new Set();

  state.definitions.forEach(definition => {
    categories.add(definition.category || 'uncategorised');
    scopes.add(definition.scope || 'unknown');
  });

  // Clear existing options except "All"
  while (categoryFilter.children.length > 1) {
    categoryFilter.removeChild(categoryFilter.lastChild);
  }
  while (scopeFilter.children.length > 1) {
    scopeFilter.removeChild(scopeFilter.lastChild);
  }

  // Add category options
  Array.from(categories).sort().forEach(category => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = category.charAt(0).toUpperCase() + category.slice(1);
    categoryFilter.appendChild(option);
  });

  // Add scope options
  Array.from(scopes).sort().forEach(scope => {
    const option = document.createElement('option');
    option.value = scope;
    option.textContent = scope.charAt(0).toUpperCase() + scope.slice(1);
    scopeFilter.appendChild(option);
  });
}

function applyFilters() {
  renderTests();
}

function updateVisibleCount(count) {
  const countEl = document.getElementById('visibleCount');
  if (countEl) {
    if (count === 0) {
      countEl.textContent = 'No tests found';
    } else {
      countEl.textContent = `${count} test${count === 1 ? '' : 's'}`;
    }
  }
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
