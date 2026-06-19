// Endpoints
const API_SETTINGS_URL = '/api/v1/settings/grafana';
const API_REPORT_URL = '/api/v1/report/cpu';

// Navigation pages
const pages = ['overview', 'settings', 'telemetry', 'diagnostics'];

// DOM elements
const activeModuleName = document.getElementById('active-module-name');
const pageTitle = document.getElementById('page-title');
const pageDesc = document.getElementById('page-desc');

// Forms & Inputs
const inputHost = document.getElementById('grafana-host');
const inputToken = document.getElementById('grafana-token');
const inputDatasource = document.getElementById('grafana-datasource-uid');

const btnTest = document.getElementById('btn-test-grafana');
const btnSave = document.getElementById('btn-save-grafana');
const btnReset = document.getElementById('btn-reset-grafana');
const spinnerTest = document.getElementById('spinner-test');
const spinnerSave = document.getElementById('spinner-save');
const spinnerReset = document.getElementById('spinner-reset');

const activeHost = document.getElementById('overview-host');
const activeDatasource = document.getElementById('overview-datasource');
const activeState = document.getElementById('overview-state');
const revertBox = document.getElementById('revert-box');

// Widget elements
const widgetGrafanaStatus = document.getElementById('widget-grafana-status');
const widgetGrafanaSub = document.getElementById('widget-grafana-sub');
const widgetDatasourceUid = document.getElementById('widget-datasource-uid');
const widgetScrapes = document.getElementById('widget-scrapes');
const infraGrafanaDot = document.getElementById('infra-grafana-dot');
const diagTime = document.getElementById('diag-time');

// Alerts
const feedbackAlert = document.getElementById('grafana-feedback');
const feedbackTitle = document.getElementById('feedback-title');
const feedbackDesc = document.getElementById('feedback-desc');

// Telemetry
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
const logsTbody = document.getElementById('logs-tbody');

// App state
let totalScrapes = 0;
let systemLogs = [];

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  // Set query date range (default last 1 hour)
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  inputTelemetryTo.value = formatDateTimeForInput(now);
  inputTelemetryFrom.value = formatDateTimeForInput(oneHourAgo);
  
  // Set local diagnostic time
  diagTime.textContent = now.toLocaleString();
  
  addLog('System', 'Initializing portal and modules...', 'INFO');
  
  // Load configuration
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

// 1. Navigation routing
function navigate(pageId) {
  pages.forEach(p => {
    const pageEl = document.getElementById(`page-${p}`);
    const menuEl = document.getElementById(`menu-${p}`);
    
    if (p === pageId) {
      pageEl.classList.remove('hidden');
      menuEl.classList.add('active');
    } else {
      pageEl.classList.add('hidden');
      menuEl.classList.remove('active');
    }
  });

  // Update header descriptions
  activeModuleName.textContent = pageId.toUpperCase();
  
  if (pageId === 'overview') {
    pageTitle.textContent = 'System Overview';
    pageDesc.textContent = 'Ringkasan status integrasi Grafana dan telemetri metrik real-time.';
  } else if (pageId === 'settings') {
    pageTitle.textContent = 'Grafana Settings';
    pageDesc.textContent = 'Konfigurasi integrasi API Grafana dan kredensial token.';
  } else if (pageId === 'telemetry') {
    pageTitle.textContent = 'Telemetry Console';
    pageDesc.textContent = 'Eksekusi query dan filter metrik CPU real-time.';
  } else if (pageId === 'diagnostics') {
    pageTitle.textContent = 'System Diagnostics';
    pageDesc.textContent = 'Informasi endpoint API backend dan diagnostik kesehatan sistem.';
    diagTime.textContent = new Date().toLocaleString();
  }
}

// Add system log entry
function addLog(module, message, status = 'INFO') {
  const time = new Date().toLocaleTimeString();
  systemLogs.unshift({ time, module, message, status });
  if (systemLogs.length > 10) systemLogs.pop(); // Keep last 10 logs
  renderLogs();
}

function renderLogs() {
  let html = '';
  systemLogs.forEach(log => {
    let badgeClass = 'status-default';
    if (log.status === 'SUCCESS' || log.status === 'OK') badgeClass = 'status-configured';
    
    html += `
      <tr>
        <td class="font-mono" style="color: var(--text-muted);">${log.time}</td>
        <td style="font-weight: 600;">${log.module}</td>
        <td>${log.message}</td>
        <td><span class="status-badge ${badgeClass}">${log.status}</span></td>
      </tr>
    `;
  });
  logsTbody.innerHTML = html;
}

// 2. Load active configurations
async function loadGrafanaSettings() {
  try {
    const res = await fetch(API_SETTINGS_URL);
    if (!res.ok) throw new Error('API fetch failed');
    
    const result = await res.json();
    if (result.success && result.data) {
      const { host, datasourceUid, isConfigured, maskedToken } = result.data;
      
      // Update config views
      activeHost.textContent = host || 'None (No active config)';
      activeDatasource.textContent = datasourceUid || 'bf5jy3ppyomwwd';
      
      widgetDatasourceUid.textContent = datasourceUid || 'bf5jy3ppyomwwd';
      
      if (isConfigured) {
        // Status updates (configured)
        activeState.className = 'status-badge status-configured';
        activeState.innerHTML = '● Custom Config';
        revertBox.classList.remove('hidden');
        
        widgetGrafanaStatus.textContent = 'Connected';
        widgetGrafanaStatus.style.color = '#56d364';
        widgetGrafanaSub.textContent = host;
        
        infraGrafanaDot.className = 'status-dot dot-green';
        
        // Fill form fields
        inputHost.value = host;
        inputDatasource.value = datasourceUid;
        inputToken.value = maskedToken || '****************';
        
        addLog('Configuration', 'Loaded custom Grafana configuration from local storage', 'OK');
      } else {
        // Status updates (defaults)
        activeState.className = 'status-badge status-default';
        activeState.innerHTML = '● Default Env';
        revertBox.classList.add('hidden');
        
        if (host) {
          widgetGrafanaStatus.textContent = 'Connected';
          widgetGrafanaStatus.style.color = '#e3b341';
          widgetGrafanaSub.textContent = 'Using .env configuration';
          infraGrafanaDot.className = 'status-dot dot-green';
          
          inputHost.value = host;
          inputDatasource.value = datasourceUid;
          inputToken.value = maskedToken || '';
          
          addLog('Configuration', 'Using static .env configuration defaults', 'INFO');
        } else {
          widgetGrafanaStatus.textContent = 'Offline';
          widgetGrafanaStatus.style.color = '#ff7b72';
          widgetGrafanaSub.textContent = 'Configuration required';
          infraGrafanaDot.className = 'status-dot dot-yellow';
          
          addLog('Configuration', 'No environment or custom settings loaded. Please configure.', 'WARN');
        }
      }
    }
  } catch (error) {
    addLog('Configuration', 'Failed to fetch settings from server.', 'ERROR');
  }
}

// 3. Test Connection
async function testGrafanaConnection(event) {
  event.preventDefault();
  
  const host = inputHost.value.trim();
  const token = inputToken.value.trim();
  const datasourceUid = inputDatasource.value.trim();

  if (!host || !token) {
    showFeedback('danger', 'Form Error', 'Host URL and Service Token are required.');
    return;
  }

  setLoading(true, 'test');
  hideFeedback();
  addLog('Grafana API', `Initiating connection test to ${host}...`, 'INFO');

  try {
    const res = await fetch(API_SETTINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'test', host, token, datasourceUid })
    });
    
    const result = await res.json();
    if (res.ok && result.success) {
      showFeedback('success', 'Uji Koneksi Berhasil', result.message || 'Berhasil terhubung ke Grafana server!');
      addLog('Grafana API', 'Connectivity check passed successfully.', 'SUCCESS');
    } else {
      showFeedback('danger', 'Koneksi Gagal', result.message || result.error || 'Gagal terhubung.');
      addLog('Grafana API', `Connectivity check failed: ${result.message || 'Unknown error'}`, 'ERROR');
    }
  } catch (error) {
    showFeedback('danger', 'API Error', error.message || 'Gagal menghubungi server backend.');
    addLog('Grafana API', 'Communication timeout or CORS issue with backend endpoint.', 'ERROR');
  } finally {
    setLoading(false);
  }
}

// 4. Save configuration
async function saveGrafanaConfiguration() {
  const host = inputHost.value.trim();
  const token = inputToken.value.trim();
  const datasourceUid = inputDatasource.value.trim();

  if (!host || !token) {
    showFeedback('danger', 'Form Error', 'Host URL and Service Token are required.');
    return;
  }

  setLoading(true, 'save');
  hideFeedback();
  addLog('Configuration', 'Saving and applying settings...', 'INFO');

  try {
    const res = await fetch(API_SETTINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', host, token, datasourceUid })
    });
    
    const result = await res.json();
    if (res.ok && result.success) {
      showFeedback('success', 'Penyimpanan Berhasil', result.message || 'Konfigurasi berhasil disimpan!');
      addLog('Configuration', `Endpoint updated dynamically to: ${host}`, 'SUCCESS');
      await loadGrafanaSettings();
    } else {
      showFeedback('danger', 'Gagal Menyimpan', result.message || result.error || 'Gagal menyimpan.');
      addLog('Configuration', `Save settings failed: ${result.message}`, 'ERROR');
    }
  } catch (error) {
    showFeedback('danger', 'API Error', error.message || 'Gagal menghubungi server.');
    addLog('Configuration', 'Request failed to commit settings storage.', 'ERROR');
  } finally {
    setLoading(false);
  }
}

// 5. Reset configuration
async function resetGrafanaConfiguration() {
  if (!confirm('Apakah Anda yakin ingin menghapus konfigurasi kustom ini dan kembali ke default?')) return;

  setLoading(true, 'reset');
  hideFeedback();
  addLog('Configuration', 'Resetting settings registry...', 'INFO');

  try {
    const res = await fetch(API_SETTINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' })
    });
    
    const result = await res.json();
    if (res.ok && result.success) {
      showFeedback('success', 'Reset Berhasil', result.message || 'Menggunakan setting default (.env).');
      addLog('Configuration', 'Dynamic registry cleared. Fallback to system default activated.', 'SUCCESS');
      await loadGrafanaSettings();
    } else {
      showFeedback('danger', 'Gagal Reset', result.message || result.error || 'Gagal reset.');
      addLog('Configuration', 'Clear registry storage failed.', 'ERROR');
    }
  } catch (error) {
    showFeedback('danger', 'API Error', error.message || 'Gagal menghubungi server.');
  } finally {
    setLoading(false);
  }
}

// 6. Telemetry CPU metric query
async function queryTelemetry(event) {
  event.preventDefault();
  
  const fromDate = inputTelemetryFrom.value;
  const toDate = inputTelemetryTo.value;
  const target = inputTelemetryRouter.value.trim();

  if (!fromDate || !toDate || !target) {
    showTelemetryFeedback('danger', 'Form Error', 'Semua parameter pencarian wajib diisi.');
    return;
  }

  btnQueryTelemetry.disabled = true;
  spinnerQuery.classList.remove('hidden');
  hideTelemetryFeedback();
  addLog('Telemetry', `Querying CPU stream metrics for: ${target}`, 'INFO');

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
      const data = result.data || [];
      renderTelemetryTable(data);
      updateChartHeights(data);
      
      // Update scrapes count
      totalScrapes++;
      widgetScrapes.textContent = totalScrapes;
      
      showTelemetryFeedback('success', 'Query Succeeded', `Berhasil mengambil ${data.length} baris data metrik.`);
      addLog('Telemetry', `Stream success: Fetched ${data.length} records for ${target}`, 'SUCCESS');
    } else {
      renderTelemetryTable([]);
      updateChartHeights([]);
      showTelemetryFeedback('danger', 'Query Failed', result.message || result.error || 'Gagal mengambil data metrik.');
      addLog('Telemetry', `Stream failed: ${result.message || 'Server error'}`, 'ERROR');
    }
  } catch (error) {
    renderTelemetryTable([]);
    updateChartHeights([]);
    showTelemetryFeedback('danger', 'API Error', error.message || 'Gagal menghubungi endpoint telemetri.');
    addLog('Telemetry', 'API Connection timeout.', 'ERROR');
  } finally {
    btnQueryTelemetry.disabled = false;
    spinnerQuery.classList.add('hidden');
  }
}

function renderTelemetryTable(data) {
  metricsCount.textContent = `${data.length} records`;
  
  if (data.length === 0) {
    metricsTbody.innerHTML = `
      <tr>
        <td colspan="3">
          <div class="empty-state">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <span>No data stream matching targets.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  data.forEach(([timestamp, value]) => {
    const timeStr = new Date(timestamp).toLocaleString();
    html += `
      <tr>
        <td class="font-mono" style="color: var(--text-muted);">${timestamp}</td>
        <td>${timeStr}</td>
        <td class="font-mono" style="color: var(--prometheus-orange); font-weight: bold;">${parseFloat(value).toFixed(3)} %</td>
      </tr>
    `;
  });
  metricsTbody.innerHTML = html;
}

// Update the visual chart heights based on query output sample
function updateChartHeights(data) {
  const bars = document.querySelectorAll('.chart-bar');
  if (data.length === 0) {
    bars.forEach(bar => {
      bar.style.height = '4px';
    });
    return;
  }
  
  // Distribute values to 7 mock bar columns
  const step = Math.max(1, Math.floor(data.length / 7));
  bars.forEach((bar, index) => {
    const dataIndex = Math.min(data.length - 1, index * step);
    const value = parseFloat(data[dataIndex][1]);
    // Map value percentage safely to bar height (max 90% space)
    const heightPercent = Math.max(4, Math.min(95, value));
    bar.style.height = `${heightPercent}%`;
  });
}

// Helpers
function showFeedback(type, title, description) {
  feedbackAlert.className = `alert alert-${type}`;
  feedbackTitle.textContent = title;
  feedbackDesc.textContent = description;
  feedbackAlert.classList.remove('hidden');
}

function hideFeedback() {
  feedbackAlert.classList.add('hidden');
}

function showTelemetryFeedback(type, title, description) {
  telemetryFeedback.className = `alert alert-${type}`;
  telemetryFeedbackTitle.textContent = title;
  telemetryFeedbackDesc.textContent = description;
  telemetryFeedback.classList.remove('hidden');
}

function hideTelemetryFeedback() {
  telemetryFeedback.classList.add('hidden');
}

function setLoading(loading, type = '') {
  btnTest.disabled = loading;
  btnSave.disabled = loading;
  btnReset.disabled = loading;
  
  if (loading) {
    if (type === 'test') spinnerTest.classList.remove('hidden');
    if (type === 'save') spinnerSave.classList.remove('hidden');
    if (type === 'reset') spinnerReset.classList.remove('hidden');
  } else {
    spinnerTest.classList.add('hidden');
    spinnerSave.classList.add('hidden');
    spinnerReset.classList.add('hidden');
  }
}
