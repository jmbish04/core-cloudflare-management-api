// Cloudflare WaaS Health Dashboard JavaScript

let currentFilter = 'all';
let latestHealthCheck = null;
let testsWithResults = [];

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadTestsWithResults();
    loadLatestHealthCheck();
    setupEventListeners();
    setupMCPTabs();
    setupCopyButtons();
});

// Setup event listeners
function setupEventListeners() {
    const runButton = document.getElementById('runHealthCheck');
    if (runButton) {
        runButton.addEventListener('click', runHealthCheck);
    }

    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.category;
            filterButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            displayTestsWithResults();
        });
    });
}

// Load tests with their latest results
async function loadTestsWithResults() {
    try {
        const response = await fetch('/health/tests-with-results');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }
        const data = await response.json();

        if (data.success && data.result) {
            testsWithResults = data.result;
            displayTestsWithResults();
            updateHealthStatusFromTests();
        }
    } catch (error) {
        console.error('Failed to load tests with results:', error);
        showErrorToast('Failed to load tests', error.message);
    }
}

// Load latest health check from D1 (for backward compatibility)
async function loadLatestHealthCheck() {
    try {
        const response = await fetch('/health/latest');
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }
        const data = await response.json();

        if (data.success && data.result) {
            latestHealthCheck = data.result;
            // Only update status if we don't have tests with results
            if (testsWithResults.length === 0) {
                displayHealthStatus(data.result);
                displayEndpointResults(data.result.results);
            }
        }
    } catch (error) {
        console.error('Failed to load health check:', error);
        // Don't show error if we have tests with results
        if (testsWithResults.length === 0) {
            showNoDataMessage();
        }
    }
}

// Run new health check
async function runHealthCheck() {
    const loading = document.getElementById('loading');
    const statusDiv = document.getElementById('healthStatus');
    const runButton = document.getElementById('runHealthCheck');

    try {
        // Show loading
        loading.style.display = 'block';
        statusDiv.style.display = 'none';
        runButton.disabled = true;
        runButton.textContent = 'Running...';

        const response = await fetch('/health/check', { method: 'POST' });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText);
        }
        const data = await response.json();

        if (data.success && data.result) {
            latestHealthCheck = data.result;
            displayHealthStatus(data.result);
            // Reload tests with results to show updated status
            await loadTestsWithResults();
        } else {
            throw new Error(data.error || 'Health check failed');
        }
    } catch (error) {
        console.error('Health check error:', error);
        showErrorToast('Failed to run health check', error.message);
    } finally {
        loading.style.display = 'none';
        statusDiv.style.display = 'block';
        runButton.disabled = false;
        runButton.textContent = 'Run Health Check';
    }
}

// Show an error toast message
function showErrorToast(title, message) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        console.error('Toast container not found!');
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'error-toast';

    // Sanitize the message to prevent HTML injection
    const sanitizedMessage = document.createElement('pre');
    sanitizedMessage.textContent = message;

    toast.innerHTML = `
        <div class="font-bold">${title}</div>
        <div class="text-sm mt-1">${sanitizedMessage.innerHTML}</div>
        <button class="toast-close-btn">&times;</button>
    `;

    toastContainer.appendChild(toast);

    const closeButton = toast.querySelector('.toast-close-btn');
    closeButton.addEventListener('click', () => {
        toast.remove();
    });

    // Auto-dismiss after 10 seconds
    setTimeout(() => {
        toast.remove();
    }, 10000);
}

// Display health status
function displayHealthStatus(healthCheck) {
    const statusBadge = document.getElementById('statusBadge');
    const totalEndpoints = document.getElementById('totalEndpoints');
    const healthyEndpoints = document.getElementById('healthyEndpoints');
    const unhealthyEndpoints = document.getElementById('unhealthyEndpoints');
    const responseTime = document.getElementById('responseTime');
    const lastCheck = document.getElementById('lastCheck');

    // Update badge
    statusBadge.className = 'status-badge ' + healthCheck.overall_status;
    const statusText = healthCheck.overall_status.charAt(0).toUpperCase() + healthCheck.overall_status.slice(1);
    statusBadge.querySelector('.status-text').textContent = statusText;

    // Update stats
    totalEndpoints.textContent = healthCheck.total_endpoints || 0;
    healthyEndpoints.textContent = healthCheck.healthy_endpoints || 0;
    unhealthyEndpoints.textContent = healthCheck.unhealthy_endpoints || 0;
    responseTime.textContent = (healthCheck.avg_response_time || 0).toFixed(0) + 'ms';

    // Update last check time
    const checkTime = new Date(healthCheck.checked_at || Date.now());
    lastCheck.textContent = formatRelativeTime(checkTime);
}

// Display tests with their latest results
function displayTestsWithResults() {
    const container = document.getElementById('endpointResults');
    container.innerHTML = '';

    // Filter by category
    const filtered = currentFilter === 'all'
        ? testsWithResults
        : testsWithResults.filter(item => item.test.category === currentFilter);

    if (filtered.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--cf-gray); padding: 2rem;">No tests in this category</p>';
        return;
    }

    // Create test items with their latest results
    filtered.forEach(item => {
        const testItem = createTestItem(item);
        container.appendChild(testItem);
    });
}

// Update health status from tests with results
function updateHealthStatusFromTests() {
    if (testsWithResults.length === 0) return;

    const totalTests = testsWithResults.length;
    let healthy = 0;
    let unhealthy = 0;
    let totalResponseTime = 0;
    let latestRunTime = null;

    testsWithResults.forEach(item => {
        if (item.latest_result) {
            if (item.latest_result.outcome === 'pass') {
                healthy++;
            } else {
                unhealthy++;
            }
            totalResponseTime += item.latest_result.response_time_ms || 0;
            
            const runTime = new Date(item.latest_result.run_at);
            if (!latestRunTime || runTime > latestRunTime) {
                latestRunTime = runTime;
            }
        }
    });

    const overallStatus = unhealthy === 0 ? 'pass' : unhealthy === totalTests ? 'fail' : 'degraded';
    const avgResponseTime = totalTests > 0 ? totalResponseTime / totalTests : 0;

    // Update status badge
    const statusBadge = document.getElementById('statusBadge');
    if (statusBadge) {
        statusBadge.className = 'status-badge ' + overallStatus;
        const statusText = overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1);
        statusBadge.querySelector('.status-text').textContent = statusText;
    }

    // Update stats
    const totalEndpoints = document.getElementById('totalEndpoints');
    const healthyEndpoints = document.getElementById('healthyEndpoints');
    const unhealthyEndpoints = document.getElementById('unhealthyEndpoints');
    const responseTime = document.getElementById('responseTime');
    const lastCheck = document.getElementById('lastCheck');

    if (totalEndpoints) totalEndpoints.textContent = totalTests;
    if (healthyEndpoints) healthyEndpoints.textContent = healthy;
    if (unhealthyEndpoints) unhealthyEndpoints.textContent = unhealthy;
    if (responseTime) responseTime.textContent = avgResponseTime.toFixed(0) + 'ms';
    if (lastCheck && latestRunTime) {
        lastCheck.textContent = formatRelativeTime(latestRunTime);
    }
}

// Create test item with latest result
function createTestItem(item) {
    const div = document.createElement('div');
    div.className = 'endpoint-item';

    const test = item.test;
    const result = item.latest_result;

    // Determine status
    const outcome = result ? result.outcome : 'unknown';
    const statusIcon = outcome === 'pass' ? '✅' : outcome === 'fail' ? '❌' : '⏳';
    const method = test.http_method || 'GET';
    const endpointName = test.name || 'Unknown';
    const statusCode = result ? result.status : 0;
    const responseTime = result ? result.response_time_ms : 0;
    const statusText = result ? result.status_text : 'Not tested yet';
    const description = test.description || '';

    const errorHtml = outcome === 'fail' && result && result.error_message
        ? '<div style="color: var(--error); font-size: 0.875rem; margin-top: 0.25rem;">' + result.error_message + '</div>'
        : '';

    const statusCodeHtml = statusCode > 0
        ? '<div class="response-time" style="font-size: 0.75rem; color: var(--cf-gray);">HTTP ' + statusCode + '</div>'
        : '';
    
    const pathInfo = test.endpoint_path
        ? '<div style="font-size: 0.75rem; color: var(--cf-gray); margin-top: 0.25rem; font-family: monospace;">' + test.endpoint_path + '</div>'
        : '';

    const lastRunInfo = result && result.run_at
        ? '<div style="font-size: 0.75rem; color: var(--cf-gray); margin-top: 0.25rem;">Last run: ' + formatRelativeTime(new Date(result.run_at)) + '</div>'
        : '<div style="font-size: 0.75rem; color: var(--cf-gray); margin-top: 0.25rem;">Never run</div>';

    div.innerHTML =
        '<div class="endpoint-info">' +
            '<div class="endpoint-path">' +
                '<span class="endpoint-method">' + method + '</span>' +
                endpointName +
            '</div>' +
            pathInfo +
            (description ? '<div class="endpoint-description" style="font-size: 0.875rem; color: var(--cf-gray); margin-top: 0.25rem;">' + description + '</div>' : '') +
            lastRunInfo +
            errorHtml +
        '</div>' +
        '<div class="endpoint-status">' +
            '<span class="status-icon">' + statusIcon + '</span>' +
            '<div style="text-align: right;">' +
                (responseTime > 0 ? '<div class="response-time">' + responseTime.toFixed(0) + 'ms</div>' : '<div class="response-time" style="color: var(--cf-gray);">-</div>') +
                statusCodeHtml +
            '</div>' +
        '</div>';

    return div;
}

// Display endpoint results (legacy function for backward compatibility)
function displayEndpointResults(results) {
    const container = document.getElementById('endpointResults');
    container.innerHTML = '';

    // Filter results
    const filteredResults = currentFilter === 'all'
        ? results
        : results.filter(r => r.category === currentFilter);

    if (filteredResults.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: var(--cf-gray); padding: 2rem;">No endpoints in this category</p>';
        return;
    }

    // Create endpoint items
    filteredResults.forEach(result => {
        const item = createEndpointItem(result);
        container.appendChild(item);
    });
}

// Create endpoint item element
function createEndpointItem(result) {
    const div = document.createElement('div');
    div.className = 'endpoint-item';

    // Map backend fields to frontend format
    const outcome = result.outcome || (result.status >= 200 && result.status < 300 ? 'pass' : 'fail');
    const statusIcon = outcome === 'pass' ? '✅' : '❌';
    const method = result.method || 'GET'; // Get method from result if available
    const endpointName = result.endpoint || 'Unknown';
    const statusCode = result.status || 0;
    const responseTime = result.response_time_ms || 0;
    const statusText = result.statusText || 'Error';
    const description = ''; // No description in backend response

    const errorHtml = outcome === 'fail' && statusText
        ? '<div style="color: var(--error); font-size: 0.875rem; margin-top: 0.25rem;">' + statusText + '</div>'
        : '';

    const statusCodeHtml = statusCode > 0
        ? '<div class="response-time" style="font-size: 0.75rem; color: var(--cf-gray);">HTTP ' + statusCode + '</div>'
        : '';
    
    const pathInfo = result.path 
        ? '<div style="font-size: 0.75rem; color: var(--cf-gray); margin-top: 0.25rem; font-family: monospace;">' + result.path + '</div>'
        : '';

    div.innerHTML =
        '<div class="endpoint-info">' +
            '<div class="endpoint-path">' +
                '<span class="endpoint-method">' + method + '</span>' +
                endpointName +
            '</div>' +
            pathInfo +
            '<div class="endpoint-description">' + description + '</div>' +
            errorHtml +
        '</div>' +
        '<div class="endpoint-status">' +
            '<span class="status-icon">' + statusIcon + '</span>' +
            '<div style="text-align: right;">' +
                '<div class="response-time">' + responseTime.toFixed(0) + 'ms</div>' +
                statusCodeHtml +
            '</div>' +
        '</div>';

    return div;
}

// Show no data message
function showNoDataMessage() {
    const statusBadge = document.getElementById('statusBadge');
    const totalEndpoints = document.getElementById('totalEndpoints');
    const healthyEndpoints = document.getElementById('healthyEndpoints');
    const unhealthyEndpoints = document.getElementById('unhealthyEndpoints');
    const responseTime = document.getElementById('responseTime');
    const lastCheck = document.getElementById('lastCheck');
    const endpointResults = document.getElementById('endpointResults');

    statusBadge.className = 'status-badge';
    statusBadge.querySelector('.status-text').textContent = 'No Data';
    totalEndpoints.textContent = '-';
    healthyEndpoints.textContent = '-';
    unhealthyEndpoints.textContent = '-';
    responseTime.textContent = '-';
    lastCheck.textContent = 'Never';
    endpointResults.innerHTML = '<p style="text-align: center; color: var(--cf-gray); padding: 2rem;">No health check data available. Click "Run Health Check" to start.</p>';
}

// Format relative time
function formatRelativeTime(date) {
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return days + ' day' + (days > 1 ? 's' : '') + ' ago';
    } else if (hours > 0) {
        return hours + ' hour' + (hours > 1 ? 's' : '') + ' ago';
    } else if (minutes > 0) {
        return minutes + ' minute' + (minutes > 1 ? 's' : '') + ' ago';
    } else {
        return 'Just now';
    }
}

// Setup MCP tabs
function setupMCPTabs() {
    const tabs = document.querySelectorAll('.mcp-tab');
    const panels = document.querySelectorAll('.mcp-panel');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active panel
            panels.forEach(p => p.classList.remove('active'));
            const targetPanel = document.getElementById(`${targetTab}-panel`);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });
}

// Setup copy buttons
function setupCopyButtons() {
    const copyButtons = document.querySelectorAll('.copy-btn');
    
    copyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const codeId = btn.dataset.copy;
            const codeElement = document.getElementById(codeId);
            
            if (codeElement) {
                // Get the text content, replacing placeholders with actual values
                let text = codeElement.textContent;
                const baseUrl = window.location.origin;
                text = text.replace(/YOUR_CLIENT_AUTH_TOKEN/g, 'YOUR_CLIENT_AUTH_TOKEN');
                text = text.replace(/https:\/\/core-cloudflare-manager-api\.hacolby\.workers\.dev\/mcp/g, `${baseUrl}/mcp`);
                
                // Copy to clipboard
                navigator.clipboard.writeText(text).then(() => {
                    // Show feedback
                    const originalText = btn.textContent;
                    btn.textContent = 'Copied!';
                    btn.style.backgroundColor = 'var(--success)';
                    setTimeout(() => {
                        btn.textContent = originalText;
                        btn.style.backgroundColor = '';
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy:', err);
                });
            }
        });
    });
}
