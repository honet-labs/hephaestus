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

// Dashboards & Panels State
const DEFAULT_DASHBOARDS = [
  {
    id: "db-linux",
    name: "Dashboard Agent Overview - Linux",
    targetGroup: "-- Semua Group (All Groups) --",
    panels: [
      {
        id: "panel-linux-cpu",
        title: "Linux CPU Utilization",
        query: 'mktxp_system_cpu_load{routerboard_name="RC_HONET"}',
        fromDate: "",
        toDate: "",
        format: "time_series",
        intervalMs: 60000,
        maxDataPoints: 1000,
        data: []
      },
      {
        id: "panel-linux-mem",
        title: "Linux Memory Overview",
        query: 'mktxp_system_cpu_load',
        fromDate: "",
        toDate: "",
        format: "time_series",
        intervalMs: 60000,
        maxDataPoints: 1000,
        data: []
      }
    ]
  },
  {
    id: "db-windows",
    name: "Dashboard Agent Overview - Windows",
    targetGroup: "-- Semua Group (All Groups) --",
    panels: [
      {
        id: "panel-windows-cpu",
        title: "Windows CPU Load",
        query: 'mktxp_system_cpu_load{routerboard_name="RC_HONET"}',
        fromDate: "",
        toDate: "",
        format: "time_series",
        intervalMs: 60000,
        maxDataPoints: 1000,
        data: []
      },
      {
        id: "panel-windows-mem",
        title: "Windows Active Memory",
        query: 'mktxp_system_cpu_load',
        fromDate: "",
        toDate: "",
        format: "time_series",
        intervalMs: 60000,
        maxDataPoints: 1000,
        data: []
      }
    ]
  },
  {
    id: "db-ogg",
    name: "Dashboard Status OGG",
    targetGroup: "-- Semua Group (All Groups) --",
    panels: [
      {
        id: "panel-ogg-status",
        title: "OGG Process Status",
        query: 'mktxp_system_cpu_load',
        fromDate: "",
        toDate: "",
        format: "time_series",
        intervalMs: 60000,
        maxDataPoints: 1000,
        data: []
      }
    ]
  }
];

let dashboards = JSON.parse(localStorage.getItem('hephaestus_dashboards')) || DEFAULT_DASHBOARDS;
let activeDashboardId = null;

function saveDashboardsToStorage() {
  localStorage.setItem('hephaestus_dashboards', JSON.stringify(dashboards));
}

const logsTbody = document.getElementById('logs-tbody');

// Dynamic Datasources Panel elements
const datasourcesPanel = document.getElementById('datasources-panel');
const datasourcesTbody = document.getElementById('datasources-tbody');
const spinnerSyncDs = document.getElementById('spinner-sync-ds');

// App state
let totalScrapes = 0;
let systemLogs = [];

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  // Set local diagnostic time
  diagTime.textContent = new Date().toLocaleString();
  
  addLog('System', 'Initializing portal and modules...', 'INFO');
  
  // Setup hash navigation
  handleHashNavigation();
  window.addEventListener('hashchange', handleHashNavigation);

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
  window.location.hash = pageId;
}

function showPage(pageId) {
  pages.forEach(p => {
    const pageEl = document.getElementById(`page-${p}`);
    const menuEl = document.getElementById(`menu-${p}`);
    
    if (p === pageId) {
      if (pageEl) pageEl.classList.remove('hidden');
      if (menuEl) menuEl.classList.add('active');
    } else {
      if (pageEl) pageEl.classList.add('hidden');
      if (menuEl) menuEl.classList.remove('active');
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
    pageTitle.textContent = 'Query Data';
    pageDesc.textContent = 'Eksekusi query dan filter metrik Prometheus secara real-time.';
    exitDashboardDetail();
  } else if (pageId === 'diagnostics') {
    pageTitle.textContent = 'System Diagnostics';
    pageDesc.textContent = 'Informasi endpoint API backend dan diagnostik kesehatan sistem.';
    diagTime.textContent = new Date().toLocaleString();
  }
}

function handleHashNavigation() {
  const hash = window.location.hash.replace('#', '') || 'overview';
  if (pages.includes(hash)) {
    showPage(hash);
  } else {
    showPage('overview');
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
        
        // Show and fetch datasources
        datasourcesPanel.classList.remove('hidden');
        fetchDatasources();
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
          
          // Show and fetch datasources
          datasourcesPanel.classList.remove('hidden');
          fetchDatasources();
        } else {
          widgetGrafanaStatus.textContent = 'Offline';
          widgetGrafanaStatus.style.color = '#ff7b72';
          widgetGrafanaSub.textContent = 'Configuration required';
          infraGrafanaDot.className = 'status-dot dot-yellow';
          
          addLog('Configuration', 'No environment or custom settings loaded. Please configure.', 'WARN');
          datasourcesPanel.classList.add('hidden');
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

// 6. Dashboard List & Panels Logic
function renderDashboardsList() {
  const tbody = document.getElementById('telemetry-dashboards-tbody');
  if (!tbody) return;

  if (dashboards.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="padding: 20px; text-align: center; color: var(--text-muted);">
          No dashboards found. Click "+ Create Dashboard" to build one.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  dashboards.forEach(db => {
    const totalPanels = db.panels ? db.panels.length : 0;
    html += `
      <tr>
        <td style="font-weight: 600; color: #58a6ff; cursor: pointer;" onclick="enterDashboardDetail('${db.id}')">
          📊 ${db.name}
        </td>
        <td style="color: var(--text-muted);">${db.targetGroup || '-- Semua Group (All Groups) --'}</td>
        <td>
          <span class="status-badge status-default" style="color: var(--text-muted); border-color: var(--app-border); background: var(--app-card-dark);">
            ${totalPanels} Panels
          </span>
        </td>
        <td style="text-align: right; padding-right: 20px;">
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button class="btn btn-secondary" onclick="enterDashboardDetail('${db.id}')" style="padding: 4px 8px; font-size: 10px; height: auto;">👁️ View</button>
            <button class="btn btn-secondary" onclick="openEditDashboardModal('${db.id}')" style="padding: 4px 8px; font-size: 10px; height: auto;">⚙️ Edit</button>
            <button class="btn btn-danger" onclick="deleteDashboard('${db.id}')" style="padding: 4px 8px; font-size: 10px; height: auto; background: #ff7b72; color: #0d1117; border-color: #ff7b72;">🗑️ Delete</button>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

function enterDashboardDetail(dbId) {
  activeDashboardId = dbId;
  const db = dashboards.find(d => d.id === dbId);
  if (!db) return;

  document.getElementById('telemetry-list-view').classList.add('hidden');
  document.getElementById('telemetry-detail-view').classList.remove('hidden');
  document.getElementById('active-dashboard-title').textContent = db.name;

  renderDashboardPanels();
}

function exitDashboardDetail() {
  activeDashboardId = null;
  document.getElementById('telemetry-detail-view').classList.add('hidden');
  document.getElementById('telemetry-list-view').classList.remove('hidden');
  renderDashboardsList();
}

function renderDashboardPanels() {
  const container = document.getElementById('telemetry-panels-container');
  if (!container) return;

  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db) return;

  if (!db.panels || db.panels.length === 0) {
    container.innerHTML = `
      <div style="grid-column: span 2; text-align: center; padding: 40px; color: var(--text-muted); border: 1px dashed var(--app-border); border-radius: 6px; background: var(--app-card-dark);">
        No data panels in this dashboard. Click "+ Add Panel" to create one.
      </div>
    `;
    return;
  }

  let html = '';
  db.panels.forEach(panel => {
    const hasData = panel.data && panel.data.length > 0;
    
    let chartHtml = `
      <div class="empty-state" style="padding: 20px;">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
        <span style="font-size: 11px; margin-top: 8px;">No data loaded. Edit query to configure.</span>
      </div>
    `;
    
    if (hasData) {
      const step = Math.max(1, Math.floor(panel.data.length / 7));
      let barsHtml = '';
      for (let index = 0; index < 7; index++) {
        const dataIndex = Math.min(panel.data.length - 1, index * step);
        const item = panel.data[dataIndex];
        let val = 0;
        if (Array.isArray(item)) {
          val = parseFloat(item[1]) || 0;
        } else if (item && typeof item === 'object') {
          val = parseFloat(item.value) || 0;
        }
        const heightPercent = Math.max(4, Math.min(95, val));
        
        let timeLabel = '';
        if (item) {
          const t = Array.isArray(item) ? item[0] : item.timestamp;
          const dateObj = new Date(t);
          timeLabel = `${String(dateObj.getHours()).padStart(2, '0')}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
        }

        barsHtml += `
          <div class="chart-bar-wrapper">
            <div class="chart-bar" style="height: ${heightPercent}%;"></div>
            <span class="chart-bar-label">${timeLabel}</span>
          </div>
        `;
      }

      chartHtml = `
        <div class="chart-container" style="display: flex; align-items: flex-end; justify-content: space-around; padding: 16px 24px; position: relative; height: 120px; margin-top: 12px;">
          ${barsHtml}
        </div>
      `;
    }

    let tableHtml = '';
    if (hasData) {
      const isCpu = panel.query && panel.query.toLowerCase().includes('cpu');
      const suffix = isCpu ? ' %' : '';
      
      let rows = '';
      const latestData = panel.data.slice(-5).reverse();
      latestData.forEach(item => {
        let timestamp, value;
        if (Array.isArray(item)) {
          timestamp = item[0];
          value = item[1];
        } else {
          timestamp = item.timestamp;
          value = item.value;
        }
        const timeStr = new Date(timestamp).toLocaleTimeString();
        rows += `
          <tr>
            <td class="font-mono" style="font-size: 11px; color: var(--text-muted);">${timestamp}</td>
            <td style="font-size: 11px;">${timeStr}</td>
            <td class="font-mono" style="font-size: 11px; color: var(--prometheus-orange); font-weight: bold; text-align: right;">
              ${parseFloat(value).toFixed(3)}${suffix}
            </td>
          </tr>
        `;
      });

      tableHtml = `
        <div class="table-wrapper" style="margin-top: 12px; max-height: 200px; overflow-y: auto;">
          <table style="width: 100%;">
            <thead>
              <tr>
                <th style="font-size: 10px;">Epoch Timestamp</th>
                <th style="font-size: 10px;">Time</th>
                <th style="font-size: 10px; text-align: right;">Value</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    }

    html += `
      <div class="panel" style="display: flex; flex-direction: column;">
        <div class="panel-header" style="padding-bottom: 12px; border-bottom: 1px solid var(--app-border);">
          <h3 class="panel-title" style="font-size: 13px;">📊 ${panel.title}</h3>
          <div class="dashboard-panel-actions">
            <button class="dashboard-panel-action-btn" onclick="openEditPanelModal('${panel.id}')" title="Edit Query">⚙️</button>
            <button class="dashboard-panel-action-btn" onclick="deletePanel('${panel.id}')" title="Remove Panel" style="color: #ff7b72;">🗑️</button>
          </div>
        </div>
        
        <div style="font-size: 10px; color: var(--text-muted); background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 4px; font-family: monospace; word-break: break-all; margin-top: 8px;">
          ${panel.query || 'No query configured'}
        </div>

        ${chartHtml}
        ${tableHtml}
      </div>
    `;
  });

  container.innerHTML = html;
}

// Dashboard Modals and CRUD
function openCreateDashboardModal() {
  document.getElementById('dashboard-modal-title').textContent = "Create Dashboard";
  document.getElementById('dashboard-id-input').value = "";
  document.getElementById('dashboard-name-input').value = "";
  document.getElementById('dashboard-group-input').value = "";
  document.getElementById('dashboard-modal').classList.add('active');
}

function openEditDashboardModal(dbId) {
  const db = dashboards.find(d => d.id === dbId);
  if (!db) return;
  document.getElementById('dashboard-modal-title').textContent = "Edit Dashboard";
  document.getElementById('dashboard-id-input').value = db.id;
  document.getElementById('dashboard-name-input').value = db.name;
  document.getElementById('dashboard-group-input').value = db.targetGroup || "";
  document.getElementById('dashboard-modal').classList.add('active');
}

function closeDashboardModal() {
  document.getElementById('dashboard-modal').classList.remove('active');
}

function saveDashboard(event) {
  event.preventDefault();
  const id = document.getElementById('dashboard-id-input').value;
  const name = document.getElementById('dashboard-name-input').value.trim();
  const targetGroup = document.getElementById('dashboard-group-input').value.trim();

  if (id) {
    const db = dashboards.find(d => d.id === id);
    if (db) {
      db.name = name;
      db.targetGroup = targetGroup;
    }
  } else {
    const newDb = {
      id: "db-" + Date.now(),
      name: name,
      targetGroup: targetGroup,
      panels: []
    };
    dashboards.push(newDb);
  }

  saveDashboardsToStorage();
  closeDashboardModal();
  renderDashboardsList();
}

function deleteDashboard(dbId) {
  if (!confirm("Are you sure you want to delete this dashboard?")) return;
  dashboards = dashboards.filter(d => d.id !== dbId);
  saveDashboardsToStorage();
  renderDashboardsList();
}

// Panel CRUD
function addNewPanel() {
  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db) return;

  const panelId = "panel-" + Date.now();
  const newPanel = {
    id: panelId,
    title: "New Panel",
    query: "",
    fromDate: "",
    toDate: "",
    format: "time_series",
    intervalMs: 60000,
    maxDataPoints: 1000,
    data: []
  };

  db.panels.push(newPanel);
  saveDashboardsToStorage();
  renderDashboardPanels();
  openEditPanelModal(panelId);
}

function deletePanel(panelId) {
  if (!confirm("Are you sure you want to remove this panel?")) return;
  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db) return;

  db.panels = db.panels.filter(p => p.id !== panelId);
  saveDashboardsToStorage();
  renderDashboardPanels();
}

// Panel Query Modal
let activePanelId = null;

function openEditPanelModal(panelId) {
  activePanelId = panelId;
  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db) return;

  const panel = db.panels.find(p => p.id === panelId);
  if (!panel) return;

  document.getElementById('query-panel-id').value = panelId;
  document.getElementById('panel-title-input').value = panel.title || "";
  document.getElementById('panel-query-input').value = panel.query || "";
  document.getElementById('panel-format-select').value = panel.format || "time_series";
  document.getElementById('panel-interval-input').value = panel.intervalMs || 60000;
  document.getElementById('panel-max-datapoints-input').value = panel.maxDataPoints || 1000;

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  document.getElementById('panel-to-input').value = panel.toDate || formatDateTimeForInput(now);
  document.getElementById('panel-from-input').value = panel.fromDate || formatDateTimeForInput(oneHourAgo);

  hidePanelQueryFeedback();
  document.getElementById('query-modal').classList.add('active');
}

function closeQueryModal() {
  document.getElementById('query-modal').classList.remove('active');
  activePanelId = null;
}

function showPanelQueryFeedback(type, title, description) {
  const alertEl = document.getElementById('panel-query-feedback');
  const titleEl = document.getElementById('panel-query-feedback-title');
  const descEl = document.getElementById('panel-query-feedback-desc');
  if (alertEl && titleEl && descEl) {
    alertEl.className = `alert alert-${type}`;
    titleEl.textContent = title;
    descEl.textContent = description;
    alertEl.classList.remove('hidden');
  }
}

function hidePanelQueryFeedback() {
  const alertEl = document.getElementById('panel-query-feedback');
  if (alertEl) alertEl.classList.add('hidden');
}

async function applyPanelQuery(event) {
  event.preventDefault();
  
  const panelId = document.getElementById('query-panel-id').value;
  const title = document.getElementById('panel-title-input').value.trim();
  const query = document.getElementById('panel-query-input').value.trim();
  const fromDate = document.getElementById('panel-from-input').value;
  const toDate = document.getElementById('panel-to-input').value;
  const format = document.getElementById('panel-format-select').value;
  const intervalMs = parseInt(document.getElementById('panel-interval-input').value, 10) || 60000;
  const maxDataPoints = parseInt(document.getElementById('panel-max-datapoints-input').value, 10) || 1000;

  if (!query) {
    showPanelQueryFeedback('danger', 'Form Error', 'Query PromQL expression wajib diisi.');
    return;
  }

  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db) return;

  const panel = db.panels.find(p => p.id === panelId);
  if (!panel) return;

  const btn = document.getElementById('btn-apply-query');
  const spinner = document.getElementById('spinner-apply-query');
  
  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  hidePanelQueryFeedback();

  addLog('Telemetry', `Querying metric for panel "${title}": ${query.split('{')[0]}`, 'INFO');

  try {
    const res = await fetch(API_REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromDate: new Date(fromDate).toISOString(),
        toDate: new Date(toDate).toISOString(),
        query: query,
        format: format,
        intervalMs: intervalMs,
        maxDataPoints: maxDataPoints
      })
    });

    const result = await res.json();
    if (res.ok && result.success) {
      const data = result.data || [];
      
      panel.title = title;
      panel.query = query;
      panel.fromDate = fromDate;
      panel.toDate = toDate;
      panel.format = format;
      panel.intervalMs = intervalMs;
      panel.maxDataPoints = maxDataPoints;
      panel.data = data;

      saveDashboardsToStorage();
      renderDashboardPanels();
      
      totalScrapes++;
      widgetScrapes.textContent = totalScrapes;
      
      addLog('Telemetry', `Panel query success: Fetched ${data.length} records`, 'SUCCESS');
      closeQueryModal();
    } else {
      showPanelQueryFeedback('danger', 'Query Failed', result.message || result.error || 'Gagal mengambil data metrik.');
      addLog('Telemetry', `Stream failed: ${result.message || 'Server error'}`, 'ERROR');
    }
  } catch (error) {
    showPanelQueryFeedback('danger', 'API Error', error.message || 'Gagal menghubungi endpoint telemetri.');
    addLog('Telemetry', 'API Connection timeout.', 'ERROR');
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

// 7. Fetch all datasources from Grafana server
async function fetchDatasources() {
  const host = inputHost.value.trim();
  const token = inputToken.value.trim();

  if (!host) {
    addLog('Grafana API', 'Cannot sync datasources: Host URL is empty.', 'WARN');
    return;
  }

  spinnerSyncDs.classList.remove('hidden');
  addLog('Grafana API', 'Syncing list of datasources from Grafana...', 'INFO');

  try {
    const res = await fetch('/api/v1/settings/grafana/datasources');
    const result = await res.json();

    if (res.ok && result.success) {
      const data = result.data || [];
      renderDatasourcesTable(data);
      addLog('Grafana API', `Successfully retrieved ${data.length} datasources.`, 'SUCCESS');
    } else {
      renderDatasourcesTable([]);
      addLog('Grafana API', `Failed to sync datasources: ${result.message || 'Server error'}`, 'ERROR');
    }
  } catch (error) {
    renderDatasourcesTable([]);
    addLog('Grafana API', `Error fetching datasources list: ${error.message}`, 'ERROR');
  } finally {
    spinnerSyncDs.classList.add('hidden');
  }
}

function renderDatasourcesTable(datasources) {
  if (datasources.length === 0) {
    datasourcesTbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 15px;">
          No datasources found. Make sure host and token are correct.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  datasources.forEach(ds => {
    const isPrometheus = ds.type === 'prometheus';
    const highlightStyle = isPrometheus ? 'color: var(--prometheus-orange); font-weight: bold;' : 'color: var(--text-muted);';
    const actionBtn = isPrometheus 
      ? `<button type="button" class="btn btn-primary" onclick="selectDatasource('${ds.uid}')" style="padding: 4px 8px; font-size: 10px; text-transform: none;">Select UID</button>`
      : `<span style="font-size: 10px; color: var(--text-muted);">Non-Prometheus</span>`;

    html += `
      <tr>
        <td style="font-weight: 600;">${ds.name}</td>
        <td style="${highlightStyle}">${ds.type}</td>
        <td class="font-mono" style="font-size: 11px;">${ds.uid}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  });
  datasourcesTbody.innerHTML = html;
}

function selectDatasource(uid) {
  inputDatasource.value = uid;
  addLog('Configuration', `Automatically filled Prometheus UID field with: ${uid}`, 'INFO');
  // Highlight the input temporarily to give visual feedback
  inputDatasource.style.borderColor = 'var(--prometheus-orange)';
  setTimeout(() => {
    inputDatasource.style.borderColor = 'var(--app-border)';
  }, 1500);
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
