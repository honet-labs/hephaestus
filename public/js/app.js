// Constants for API endpoints
const API_SETTINGS_URL = '/api/v1/settings/grafana';
const API_REPORT_URL = '/api/v1/report/cpu';

// DOM elements
const tabGrafana = document.getElementById('tab-grafana');
const tabTelemetry = document.getElementById('tab-telemetry');

const formGrafana = document.getElementById('grafana-form');
const inputHost = document.getElementById('grafana-host');
const inputToken = document.getElementById('grafana-token');
const inputDatasource = document.getElementById('grafana-datasource-uid');

const btnTest = document.getElementById('btn-test-grafana');
const btnSave = document.getElementById('btn-save-grafana');
const btnReset = document.getElementById('btn-reset-grafana');
const spinnerTest = document.getElementById('spinner-test');
const spinnerSave = document.getElementById('spinner-save');
const spinnerReset = document.getElementById('spinner-reset');

const activeHost = document.getElementById('active-host');
const activeDatasource = document.getElementById('active-datasource');
const activeState = document.getElementById('active-state');
const revertBox = document.getElementById('revert-box');
const systemStatusIndicator = document.getElementById('system-status-indicator');

// Alert Feedback elements
const feedbackAlert = document.getElementById('grafana-feedback');
const feedbackTitle = document.getElementById('feedback-title');
const feedbackDesc = document.getElementById('feedback-desc');

// Telemetry console elements
const formTelemetry = document.getElementById('telemetry-form');
const inputTelemetryFrom = document.getElementById('telemetry-from');
const inputTelemetryTo = document.getElementById('telemetry-to');
const inputTelemetryRouter = document.getElementById('telemetry-router');
const btnQueryTelemetry = document.getElementById('btn-query-telemetry');
const spinnerQuery = document.getElementById('spinner-query');
const telemetryFeedback = document.getElementById('telemetry-feedback');
const telemetryFeedbackTitle = document.getElementById('telemetry-feedback-title');
const telemetryFeedbackDesc = document.getElementById('telemetry-feedback-desc');

const metricsCount = document.getElementById('metrics-count');
const metricsTbody = document.getElementById('metrics-tbody');

// Global state variables
let currentHost = '';
let currentDatasource = '';
let currentConfigured = false;

// 1. Initialize Application
window.addEventListener('DOMContentLoaded', () => {
  // Set default query dates (From 1 hour ago until Now)
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  inputTelemetryTo.value = formatDateTimeForInput(now);
  inputTelemetryFrom.value = formatDateTimeForInput(oneHourAgo);
  
  // Load configuration status
  loadGrafanaSettings();
});

// Helper: Format Date object to YYYY-MM-DDTHH:mm
function formatDateTimeForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// 2. Tab switcher logic
function switchTab(tabName) {
  // Update button active classes
  const buttons = document.querySelectorAll('.tab-btn');
  buttons.forEach(btn => {
    if (btn.getAttribute('onclick').includes(tabName)) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle tab views
  if (tabName === 'grafana') {
    tabGrafana.classList.remove('hidden');
    tabTelemetry.classList.add('hidden');
  } else if (tabName === 'telemetry') {
    tabGrafana.classList.add('hidden');
    tabTelemetry.classList.remove('hidden');
  }
}

// 3. Load active settings from backend
async function loadGrafanaSettings() {
  showSystemStatusIndicator('loading', 'Loading settings...');
  try {
    const res = await fetch(API_SETTINGS_URL);
    if (!res.ok) throw new Error('Failed to fetch configurations.');
    
    const result = await res.json();
    if (result.success && result.data) {
      const { host, datasourceUid, isConfigured, maskedToken } = result.data;
      
      currentHost = host || '';
      currentDatasource = datasourceUid || 'bf5jy3ppyomwwd';
      currentConfigured = isConfigured || false;

      // Update Active Info Panel
      activeHost.textContent = currentHost || 'None (No active config)';
      activeDatasource.textContent = currentDatasource;
      
      if (currentConfigured) {
        activeState.className = 'status-badge status-configured';
        activeState.innerHTML = '<span class="dot dot-active"></span><span>Configured</span>';
        revertBox.classList.remove('hidden');
        showSystemStatusIndicator('configured', 'Active (Custom Config)');
        
        // Fill form placeholders/values
        inputHost.value = currentHost;
        inputDatasource.value = currentDatasource;
        inputToken.value = maskedToken || '****************';
      } else {
        activeState.className = 'status-badge status-default';
        activeState.innerHTML = '<span class="dot dot-inactive"></span><span>Default (Env Variable)</span>';
        revertBox.classList.add('hidden');
        showSystemStatusIndicator('default', 'Active (Env Defaults)');
        
        // Pre-fill inputs with active variables if present
        inputHost.value = currentHost;
        inputDatasource.value = currentDatasource;
        inputToken.value = maskedToken || '';
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    showSystemStatusIndicator('error', 'API Connection Error');
  }
}

// Update system indicator badge in header
function showSystemStatusIndicator(type, label) {
  systemStatusIndicator.className = 'status-badge';
  const dot = systemStatusIndicator.querySelector('.dot');
  const text = systemStatusIndicator.querySelector('.status-text');
  
  if (type === 'loading') {
    systemStatusIndicator.classList.add('status-default');
    dot.className = 'dot dot-inactive';
  } else if (type === 'configured') {
    systemStatusIndicator.classList.add('status-configured');
    dot.className = 'dot dot-active';
  } else if (type === 'default') {
    systemStatusIndicator.classList.add('status-default');
    dot.className = 'dot dot-inactive';
  } else {
    systemStatusIndicator.classList.add('status-default');
    systemStatusIndicator.style.borderColor = 'var(--error-border)';
    systemStatusIndicator.style.color = '#ff7b72';
    dot.className = 'dot';
    dot.style.backgroundColor = '#ff7b72';
  }
  
  text.textContent = label;
}

// 4. Test connection action
async function testGrafanaConnection(event) {
  event.preventDefault();
  
  const host = inputHost.value.trim();
  const token = inputToken.value.trim();
  const datasourceUid = inputDatasource.value.trim();

  if (!host || !token) {
    showFeedback('danger', 'Error Form', 'Host URL and Token are required.');
    return;
  }

  setSettingsButtonsLoading(true, 'test');
  hideFeedback();

  try {
    const res = await fetch(API_SETTINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test',
        host,
        token,
        datasourceUid
      })
    });
    
    const result = await res.json();
    if (res.ok && result.success) {
      showFeedback('success', 'Uji Koneksi Berhasil', result.message || 'Koneksi ke server Grafana berhasil tersambung!');
    } else {
      showFeedback('danger', 'Koneksi Gagal', result.message || result.error || 'Uji koneksi ke Grafana gagal.');
    }
  } catch (error) {
    showFeedback('danger', 'API Error', error.message || 'Gagal menghubungi backend API settings.');
  } finally {
    setSettingsButtonsLoading(false);
  }
}

// 5. Save Configuration Action
async function saveGrafanaConfiguration() {
  const host = inputHost.value.trim();
  const token = inputToken.value.trim();
  const datasourceUid = inputDatasource.value.trim();

  if (!host || !token) {
    showFeedback('danger', 'Error Form', 'Host URL and Token are required.');
    return;
  }

  setSettingsButtonsLoading(true, 'save');
  hideFeedback();

  try {
    const res = await fetch(API_SETTINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        host,
        token,
        datasourceUid
      })
    });
    
    const result = await res.json();
    if (res.ok && result.success) {
      showFeedback('success', 'Penyimpanan Berhasil', result.message || 'Konfigurasi integrasi Grafana berhasil disimpan dan diterapkan!');
      // Reload settings details
      await loadGrafanaSettings();
    } else {
      showFeedback('danger', 'Gagal Menyimpan', result.message || result.error || 'Gagal menyimpan konfigurasi.');
    }
  } catch (error) {
    showFeedback('danger', 'API Error', error.message || 'Gagal menghubungi backend API settings.');
  } finally {
    setSettingsButtonsLoading(false);
  }
}

// 6. Reset Configuration Action
async function resetGrafanaConfiguration() {
  if (!confirm('Apakah Anda yakin ingin menghapus konfigurasi kustom Grafana dan kembali ke default (.env)?')) return;

  setSettingsButtonsLoading(true, 'reset');
  hideFeedback();

  try {
    const res = await fetch(API_SETTINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' })
    });
    
    const result = await res.json();
    if (res.ok && result.success) {
      showFeedback('success', 'Reset Berhasil', result.message || 'Konfigurasi Grafana dikembalikan ke default (.env).');
      // Reload settings details
      await loadGrafanaSettings();
    } else {
      showFeedback('danger', 'Gagal Reset', result.message || result.error || 'Gagal mengatur ulang konfigurasi.');
    }
  } catch (error) {
    showFeedback('danger', 'API Error', error.message || 'Gagal menghubungi backend API settings.');
  } finally {
    setSettingsButtonsLoading(false);
  }
}

// Helper: Show alert feedbacks
function showFeedback(type, title, description) {
  feedbackAlert.className = `alert alert-${type}`;
  feedbackTitle.textContent = title;
  feedbackDesc.textContent = description;
  feedbackAlert.classList.remove('hidden');
}

function hideFeedback() {
  feedbackAlert.classList.add('hidden');
}

// Helper: Toggle button spinners
function setSettingsButtonsLoading(loading, actionType = '') {
  if (loading) {
    btnTest.disabled = true;
    btnSave.disabled = true;
    btnReset.disabled = true;
    if (actionType === 'test') spinnerTest.classList.remove('hidden');
    if (actionType === 'save') spinnerSave.classList.remove('hidden');
    if (actionType === 'reset') spinnerReset.classList.remove('hidden');
  } else {
    btnTest.disabled = false;
    btnSave.disabled = false;
    btnReset.disabled = false;
    spinnerTest.classList.add('hidden');
    spinnerSave.classList.add('hidden');
    spinnerReset.classList.add('hidden');
  }
}

// 7. Telemetry Query Logic
async function queryTelemetry(event) {
  event.preventDefault();
  
  const fromDate = inputTelemetryFrom.value;
  const toDate = inputTelemetryTo.value;
  const target = inputTelemetryRouter.value.trim();

  if (!fromDate || !toDate || !target) {
    showTelemetryFeedback('danger', 'Validation Error', 'All query parameters are required.');
    return;
  }

  // Toggle loading state
  btnQueryTelemetry.disabled = true;
  spinnerQuery.classList.remove('hidden');
  hideTelemetryFeedback();

  try {
    const res = await fetch(API_REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromDate: new Date(fromDate).toISOString(),
        toDate: new Date(toDate).toISOString(),
        target: target
      })
    });

    const result = await res.json();
    
    if (res.ok && result.success) {
      renderTelemetryTable(result.data || []);
      showTelemetryFeedback('success', 'Execution Succeeded', `Query metrics completed successfully. Fetched ${result.data ? result.data.length : 0} rows.`);
    } else {
      renderTelemetryTable([]);
      showTelemetryFeedback('danger', 'Execution Failed', result.message || result.error || 'Failed to query telemetry CPU metrics.');
    }
  } catch (error) {
    renderTelemetryTable([]);
    showTelemetryFeedback('danger', 'Server connection failure', error.message || 'Could not establish connection to telemetry report endpoints.');
  } finally {
    btnQueryTelemetry.disabled = false;
    spinnerQuery.classList.add('hidden');
  }
}

// Helper: render metrics response array to tbody
function renderTelemetryTable(data) {
  metricsCount.textContent = `${data.length} records`;
  
  if (data.length === 0) {
    metricsTbody.innerHTML = `
      <tr>
        <td colspan="3">
          <div class="empty-state">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l-7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            <span>No metrics matches for this query range.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  data.forEach(([timestamp, value]) => {
    const date = new Date(timestamp);
    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    
    html += `
      <tr>
        <td class="font-mono">${timestamp}</td>
        <td>${formattedDate}</td>
        <td class="font-mono" style="color: var(--prometheus-orange); font-weight: bold;">
          ${parseFloat(value).toFixed(3)} %
        </td>
      </tr>
    `;
  });
  
  metricsTbody.innerHTML = html;
}

// Helper: Show/hide telemetry feedback
function showTelemetryFeedback(type, title, description) {
  telemetryFeedback.className = `alert alert-${type}`;
  telemetryFeedbackTitle.textContent = title;
  telemetryFeedbackDesc.textContent = description;
  telemetryFeedback.classList.remove('hidden');
}

function hideTelemetryFeedback() {
  telemetryFeedback.classList.add('hidden');
}
