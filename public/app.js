// Cloudflare WaaS Health Dashboard JavaScript

let currentFilter = 'all';
let latestHealthCheck = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    loadLatestHealthCheck();
    setupEventListeners();
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
            if (latestHealthCheck) {
                displayEndpointResults(latestHealthCheck.results);
            }
        });
    });
}

// Load latest health check from D1
async function loadLatestHealthCheck() {
    try {
        const response = await fetch('/health/latest');
        const data = await response.json();

        if (data.success && data.result) {
            latestHealthCheck = data.result;
            displayHealthStatus(data.result);
            displayEndpointResults(data.result.results);
        } else {
            showNoDataMessage();
        }
    } catch (error) {
        console.error('Failed to load health check:', error);
        showNoDataMessage();
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
        const data = await response.json();

        if (data.success && data.result) {
            latestHealthCheck = data.result;
            displayHealthStatus(data.result);
            displayEndpointResults(data.result.results);
        } else {
            throw new Error(data.error || 'Health check failed');
        }
    } catch (error) {
        console.error('Health check error:', error);
        alert('Failed to run health check: ' + error.message);
    } finally {
        loading.style.display = 'none';
        statusDiv.style.display = 'block';
        runButton.disabled = false;
        runButton.textContent = 'Run Health Check';
    }
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
    totalEndpoints.textContent = healthCheck.total_endpoints;
    healthyEndpoints.textContent = healthCheck.healthy_endpoints;
    unhealthyEndpoints.textContent = healthCheck.unhealthy_endpoints;
    responseTime.textContent = healthCheck.response_time_ms + 'ms';

    // Update last check time
    const checkTime = new Date(healthCheck.check_time);
    lastCheck.textContent = formatRelativeTime(checkTime);
}

// Display endpoint results
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

    const statusIcon = result.status === 'success' ? '✅' : '❌';

    const errorHtml = result.error
        ? '<div style="color: var(--error); font-size: 0.875rem; margin-top: 0.25rem;">' + result.error + '</div>'
        : '';

    const statusCodeHtml = result.statusCode
        ? '<div class="response-time">HTTP ' + result.statusCode + '</div>'
        : '';

    div.innerHTML =
        '<div class="endpoint-info">' +
            '<div class="endpoint-path">' +
                '<span class="endpoint-method">' + result.method + '</span>' +
                result.endpoint +
            '</div>' +
            '<div class="endpoint-description">' + result.description + '</div>' +
            errorHtml +
        '</div>' +
        '<div class="endpoint-status">' +
            '<span class="status-icon">' + statusIcon + '</span>' +
            '<div style="text-align: right;">' +
                '<div class="response-time">' + result.responseTime + 'ms</div>' +
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
