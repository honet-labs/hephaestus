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
const inputConfigId = document.getElementById('grafana-config-id');
const inputName = document.getElementById('grafana-name');
const registryCardsContainer = document.getElementById('registry-cards-container');

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

let defaultDatasourceUid = 'bf5jy3ppyomwwd';

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
      const { id, name, host, datasourceUid, isConfigured, maskedToken } = result.data;
      defaultDatasourceUid = datasourceUid || 'bf5jy3ppyomwwd';
      
      // Update config views
      activeHost.textContent = name ? `${name} (${host})` : (host || 'None (No active config)');
      activeDatasource.textContent = datasourceUid || 'bf5jy3ppyomwwd';
      
      widgetDatasourceUid.textContent = datasourceUid || 'bf5jy3ppyomwwd';
      
      if (isConfigured) {
        // Status updates (configured)
        activeState.className = 'status-badge status-configured';
        activeState.innerHTML = '● Custom Config';
        if (revertBox) revertBox.classList.remove('hidden');
        
        widgetGrafanaStatus.textContent = 'Connected';
        widgetGrafanaStatus.style.color = '#56d364';
        widgetGrafanaSub.textContent = name || host;
        
        infraGrafanaDot.className = 'status-dot dot-green';
        
        // Fill form fields
        if (inputConfigId) inputConfigId.value = id || '';
        if (inputName) inputName.value = name || '';
        inputHost.value = host;
        inputDatasource.value = datasourceUid;
        inputToken.value = maskedToken || '****************';
        
        addLog('Configuration', 'Loaded custom Grafana configuration from local storage', 'OK');
        
        if (datasourcesPanel) datasourcesPanel.classList.remove('hidden');
      } else {
        // Status updates (defaults)
        activeState.className = 'status-badge status-default';
        activeState.innerHTML = '● Default Env';
        if (revertBox) revertBox.classList.add('hidden');
        
        if (host) {
          widgetGrafanaStatus.textContent = 'Connected';
          widgetGrafanaStatus.style.color = '#e3b341';
          widgetGrafanaSub.textContent = 'Using .env configuration';
          infraGrafanaDot.className = 'status-dot dot-green';
          
          if (inputConfigId) inputConfigId.value = id || '';
          if (inputName) inputName.value = name || 'Environment Defaults';
          inputHost.value = host;
          inputDatasource.value = datasourceUid;
          inputToken.value = maskedToken || '';
          
          addLog('Configuration', 'Using static .env configuration defaults', 'INFO');
          
          if (datasourcesPanel) datasourcesPanel.classList.remove('hidden');
        } else {
          widgetGrafanaStatus.textContent = 'Offline';
          widgetGrafanaStatus.style.color = '#ff7b72';
          widgetGrafanaSub.textContent = 'Configuration required';
          infraGrafanaDot.className = 'status-dot dot-yellow';
          
          addLog('Configuration', 'No environment or custom settings loaded. Please configure.', 'WARN');
          if (datasourcesPanel) datasourcesPanel.classList.add('hidden');
        }
      }
      await loadGrafanaConfigsList();
    }
  } catch (error) {
    addLog('Configuration', 'Failed to fetch settings from server.', 'ERROR');
  }
}

async function loadGrafanaConfigsList() {
  if (!registryCardsContainer) return;

  try {
    const res = await fetch('/api/v1/settings/grafana/configs');
    const result = await res.json();
    if (res.ok && result.success && Array.isArray(result.data)) {
      const list = result.data;
      
      // Update header count
      const headerTitle = document.getElementById('registry-header-title');
      if (headerTitle) {
        headerTitle.textContent = `Active Registry (${list.length})`;
      }

      if (list.length === 0) {
        registryCardsContainer.innerHTML = `
          <div style="text-align: center; padding: 24px; color: var(--text-muted);">
            No registered Grafana servers found.
          </div>
        `;
        return;
      }

      let html = '';
      list.forEach(c => {
        const escapedName = c.name.replace(/'/g, "\\'");
        const escapedHost = c.host.replace(/'/g, "\\'");
        const escapedUid = (c.datasourceUid || '').replace(/'/g, "\\'");
        const tokenVal = c.maskedToken || '****************';

        html += `
          <div class="registry-card" style="display: flex; align-items: center; justify-content: space-between; background: var(--app-card-dark); border: 1px solid var(--app-border); padding: 14px 16px; border-radius: 6px; gap: 12px;">
            <!-- Left Side: Icon & Info -->
            <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
              <!-- Icon Container -->
              <div style="width: 36px; height: 36px; background: rgba(25, 113, 194, 0.1); border: 1px solid rgba(25, 113, 194, 0.2); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #1971c2; flex-shrink: 0;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                  <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                  <line x1="6" y1="6" x2="6.01" y2="6"></line>
                  <line x1="6" y1="18" x2="6.01" y2="18"></line>
                </svg>
              </div>
              <!-- Details -->
              <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                  <span style="font-weight: 600; color: var(--text-white); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${c.name}</span>
                  <span class="status-badge" style="background: rgba(25, 113, 194, 0.15); color: #38bdf8; border: 1px solid rgba(25, 113, 194, 0.3); font-size: 9px; padding: 1px 4px; font-weight: bold; line-height: 1;">GRAFANA API</span>
                  ${c.isActive ? '<span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 9px; padding: 1px 4px; font-weight: bold; line-height: 1;">ACTIVE</span>' : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); min-width: 0;">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                  <span class="font-mono" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.host}</span>
                </div>
              </div>
            </div>
            
            <!-- Right Side: Status & Actions -->
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
              <!-- Status Badge -->
              <span id="conn-status-${c.id}" class="status-badge status-default" style="background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 10px; display: inline-flex; align-items: center; padding: 2px 6px;">
                CHECKING...
              </span>
              <!-- Actions -->
              <button type="button" class="btn btn-secondary" onclick="viewDatasources('${c.id}', '${escapedName}', '${escapedHost}')" style="padding: 4px 8px; font-size: 11px; height: auto;">View DS</button>
              <button type="button" class="btn btn-secondary" onclick="pingServer('${c.id}')" style="padding: 4px 8px; font-size: 11px; height: auto;">Ping Test</button>
              ${!c.isActive ? `<button type="button" class="btn btn-secondary" onclick="activateGrafanaConfig('${c.id}')" style="padding: 4px 8px; font-size: 11px; height: auto;">Activate</button>` : ''}
              <button type="button" class="btn btn-secondary" onclick="editGrafanaConfig('${c.id}', '${escapedName}', '${escapedHost}', '${escapedUid}', '${tokenVal}')" style="padding: 4px 8px; font-size: 11px; height: auto; display: inline-flex; align-items: center; justify-content: center;" title="Edit Config">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              </button>
              <button type="button" class="btn btn-secondary" onclick="deleteGrafanaConfig('${c.id}')" style="padding: 4px 8px; font-size: 11px; height: auto; color: #ff7b72; border-color: rgba(255, 123, 114, 0.15); display: inline-flex; align-items: center; justify-content: center;" title="Delete Config">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </div>
          </div>
        `;
      });
      registryCardsContainer.innerHTML = html;

      // Trigger asynchronous connection checks
      list.forEach(c => {
        checkCardConnection(c.id);
      });
    }
  } catch (error) {
    console.error('Error loading configurations list:', error);
    registryCardsContainer.innerHTML = `
      <div style="text-align: center; padding: 24px; color: #ef4444;">
        Failed to load saved configurations.
      </div>
    `;
  }
}

async function checkCardConnection(id) {
  const badge = document.getElementById(`conn-status-${id}`);
  if (!badge) return;

  try {
    const res = await fetch(`/api/v1/settings/grafana/configs/${id}/test`, {
      method: 'POST'
    });
    const result = await res.json();
    if (res.ok && result.success && result.isConnected) {
      badge.style.backgroundColor = 'rgba(16, 185, 129, 0.15)';
      badge.style.color = '#10b981';
      badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      badge.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px;"><polyline points="20 6 9 17 4 12"></polyline></svg>
        CONNECTED
      `;
    } else {
      badge.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
      badge.style.color = '#ef4444';
      badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
      badge.innerHTML = `
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        OFFLINE
      `;
    }
  } catch (error) {
    badge.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
    badge.style.color = '#ef4444';
    badge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    badge.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      OFFLINE
    `;
  }
}

async function pingServer(id) {
  const badge = document.getElementById(`conn-status-${id}`);
  if (badge) {
    badge.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
    badge.style.color = '#f59e0b';
    badge.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    badge.innerHTML = 'CHECKING...';
  }
  addLog('Configuration', `Initiating manual ping test to server...`, 'INFO');
  await checkCardConnection(id);
  
  // Show notification feedback based on updated state
  setTimeout(() => {
    const updatedBadge = document.getElementById(`conn-status-${id}`);
    if (updatedBadge && updatedBadge.textContent.includes('CONNECTED')) {
      addLog('Configuration', `Ping test connection successful for configuration.`, 'SUCCESS');
    } else {
      addLog('Configuration', `Ping test connection failed. Server is offline or unreachable.`, 'ERROR');
    }
  }, 800);
}

function clearGrafanaForm() {
  if (inputConfigId) inputConfigId.value = '';
  if (inputName) inputName.value = '';
  if (inputHost) inputHost.value = '';
  if (inputToken) inputToken.value = '';
  if (inputDatasource) inputDatasource.value = '';
  const saveText = document.getElementById('btn-save-text');
  if (saveText) saveText.textContent = '+ Register Endpoint';
  hideFeedback();
}

function editGrafanaConfig(id, name, host, datasourceUid, maskedToken) {
  if (inputConfigId) inputConfigId.value = id;
  if (inputName) inputName.value = name;
  if (inputHost) inputHost.value = host;
  if (inputToken) inputToken.value = maskedToken || '****************';
  if (inputDatasource) inputDatasource.value = datasourceUid;
  const saveText = document.getElementById('btn-save-text');
  if (saveText) saveText.textContent = 'Update Endpoint';
  hideFeedback();
}

async function activateGrafanaConfig(id) {
  addLog('Configuration', 'Activating configuration...', 'INFO');
  try {
    const res = await fetch(`/api/v1/settings/grafana/configs/${id}/activate`, {
      method: 'POST'
    });
    const result = await res.json();
    if (res.ok && result.success) {
      addLog('Configuration', result.message || 'Configuration activated successfully.', 'SUCCESS');
      await loadGrafanaSettings();
    } else {
      addLog('Configuration', `Activation failed: ${result.message || 'Unknown error'}`, 'ERROR');
    }
  } catch (error) {
    console.error('Error activating configuration:', error);
    addLog('Configuration', 'Network error during configuration activation.', 'ERROR');
  }
}

async function deleteGrafanaConfig(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus konfigurasi Grafana ini?')) return;
  addLog('Configuration', 'Deleting configuration...', 'INFO');
  try {
    const res = await fetch(`/api/v1/settings/grafana/configs/${id}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (res.ok && result.success) {
      addLog('Configuration', result.message || 'Configuration deleted successfully.', 'SUCCESS');
      await loadGrafanaSettings();
    } else {
      addLog('Configuration', `Deletion failed: ${result.message || 'Unknown error'}`, 'ERROR');
    }
  } catch (error) {
    console.error('Error deleting configuration:', error);
    addLog('Configuration', 'Network error during configuration deletion.', 'ERROR');
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

async function saveGrafanaConfiguration(event) {
  if (event) event.preventDefault();
  const id = inputConfigId ? inputConfigId.value : "";
  const name = inputName ? inputName.value.trim() : "";
  const host = inputHost.value.trim();
  const token = inputToken.value.trim();
  const datasourceUid = inputDatasource.value.trim();

  if (!name) {
    showFeedback('danger', 'Form Error', 'Configuration Name/Alias is required.');
    return;
  }

  if (!host || !token) {
    showFeedback('danger', 'Form Error', 'Host URL and Service Token are required.');
    return;
  }

  setLoading(true, 'save');
  hideFeedback();
  addLog('Configuration', 'Saving configuration...', 'INFO');

  try {
    const res = await fetch('/api/v1/settings/grafana/configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, host, token, datasourceUid })
    });
    
    const result = await res.json();
    if (res.ok && result.success) {
      showFeedback('success', 'Penyimpanan Berhasil', result.message || 'Konfigurasi berhasil disimpan!');
      addLog('Configuration', `Endpoint saved: ${name} (${host})`, 'SUCCESS');
      clearGrafanaForm();
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
          No reports found. Click "+ Create Report" to build one.
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
        <td style="font-weight: 600; color: #38bdf8; cursor: pointer;" onclick="enterDashboardDetail('${db.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 6px; opacity: 0.8;"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg>
          ${db.name}
        </td>
        <td style="color: var(--text-muted);">${db.targetGroup || '-- Semua Group (All Groups) --'}</td>
        <td>
          <span class="status-badge status-default" style="color: var(--text-muted); border-color: var(--app-border); background: var(--app-card-dark);">
            ${totalPanels} Metrics
          </span>
        </td>
        <td style="text-align: right; padding-right: 20px;">
          <div style="display: flex; gap: 8px; justify-content: flex-end;">
            <button class="btn btn-secondary" onclick="enterDashboardDetail('${db.id}')" style="padding: 4px 8px; font-size: 10px; height: auto; display: inline-flex; align-items: center; gap: 4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
              View
            </button>
            <button class="btn btn-secondary" onclick="openEditDashboardModal('${db.id}')" style="padding: 4px 8px; font-size: 10px; height: auto; display: inline-flex; align-items: center; gap: 4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              Edit
            </button>
            <button class="btn btn-danger" onclick="deleteDashboard('${db.id}')" style="padding: 4px 8px; font-size: 10px; height: auto; background: rgba(248, 81, 73, 0.15); color: #ff7b72; border-color: rgba(248, 81, 73, 0.4); display: inline-flex; align-items: center; gap: 4px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

let reportViewMode = 'report';
const expandedInlineTables = new Set();

function setReportViewMode(mode) {
  reportViewMode = mode;
  const btnReport = document.getElementById('toggle-view-report');
  const btnConfig = document.getElementById('toggle-view-config');
  
  if (mode === 'report') {
    if (btnReport) {
      btnReport.className = 'btn btn-primary';
    }
    if (btnConfig) {
      btnConfig.className = 'btn btn-secondary';
      btnConfig.style.borderColor = 'var(--app-border)';
    }
  } else {
    if (btnReport) {
      btnReport.className = 'btn btn-secondary';
      btnReport.style.borderColor = 'var(--app-border)';
    }
    if (btnConfig) {
      btnConfig.className = 'btn btn-primary';
    }
  }
  
  renderDashboardPanels();
}

function calculatePanelStats(data) {
  if (!data || data.length === 0) {
    return { min: '0.000', max: '0.000', avg: '0.000', latest: '0.000' };
  }
  const values = data.map(item => {
    if (Array.isArray(item)) return parseFloat(item[1]) || 0;
    if (item && typeof item === 'object') return parseFloat(item.value) || 0;
    return 0;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
  const latest = values[values.length - 1];
  return {
    min: min.toFixed(3),
    max: max.toFixed(3),
    avg: avg.toFixed(3),
    latest: (typeof latest === 'number' ? latest : parseFloat(latest) || 0).toFixed(3)
  };
}

function togglePanelTableInline(panelId) {
  const el = document.getElementById(`table-inline-${panelId}`);
  if (!el) return;
  if (expandedInlineTables.has(panelId)) {
    expandedInlineTables.delete(panelId);
    el.classList.add('hidden');
  } else {
    expandedInlineTables.add(panelId);
    el.classList.remove('hidden');
  }
  renderDashboardPanels();
}

async function refreshReportTelemetry() {
  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db) return;

  const btn = document.getElementById('btn-refresh-report');
  const spinner = document.getElementById('spinner-refresh-report');

  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  addLog('Telemetry', `Refreshing telemetry for report "${db.name}"...`, 'INFO');

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  try {
    if (db.panels && db.panels.length > 0) {
      const promises = db.panels.map(async (panel) => {
        let fromVal = panel.fromDate;
        let toVal = panel.toDate;

        if (panel.timePreset && panel.timePreset !== 'custom') {
          const nowRef = new Date();
          let durationMs = 60 * 60 * 1000;
          if (panel.timePreset === '6h') durationMs = 6 * 60 * 60 * 1000;
          else if (panel.timePreset === '24h') durationMs = 24 * 60 * 60 * 1000;
          else if (panel.timePreset === '7d') durationMs = 7 * 24 * 60 * 60 * 1000;
          
          fromVal = new Date(nowRef.getTime() - durationMs).toISOString();
          toVal = nowRef.toISOString();
        } else {
          if (!fromVal) fromVal = oneHourAgo.toISOString();
          if (!toVal) toVal = now.toISOString();
        }

        try {
          const res = await fetch('/api/v1/report/cpu', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fromDate: fromVal,
              toDate: toVal,
              query: panel.query,
              format: panel.format || 'time_series',
              intervalMs: panel.intervalMs || 60000,
              maxDataPoints: panel.maxDataPoints || 1000,
              datasourceUid: panel.datasourceUid,
              datasourceType: panel.datasourceType || 'prometheus',
              grafanaConfigId: panel.grafanaConfigId
            })
          });

          if (res.ok) {
            const result = await res.json();
            if (result.success) {
              panel.data = result.data || [];
            } else {
              panel.data = [];
            }
          } else {
            panel.data = [];
          }
        } catch (err) {
          console.error(`Error loading telemetry for panel "${panel.title}":`, err);
          panel.data = [];
        }
      });

      await Promise.all(promises);
      saveDashboardsToStorage();
    }
    
    renderDashboardPanels();
    addLog('Telemetry', `Telemetry refreshed successfully.`, 'SUCCESS');
  } catch (error) {
    console.error('Error refreshing telemetry:', error);
    addLog('Telemetry', 'Failed to refresh telemetry data.', 'ERROR');
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

async function enterDashboardDetail(dbId) {
  activeDashboardId = dbId;
  const db = dashboards.find(d => d.id === dbId);
  if (!db) return;

  document.getElementById('telemetry-list-view').classList.add('hidden');
  document.getElementById('telemetry-detail-view').classList.remove('hidden');
  document.getElementById('active-dashboard-title').textContent = db.name;

  // Update cover metadata
  const coverName = document.getElementById('cover-report-name');
  const coverGroup = document.getElementById('cover-report-group');
  const coverDate = document.getElementById('cover-report-date');
  const coverElements = document.getElementById('cover-report-elements');

  if (coverName) coverName.textContent = db.name;
  if (coverGroup) coverGroup.textContent = db.targetGroup || 'General Group';
  if (coverDate) coverDate.textContent = new Date().toLocaleString();
  if (coverElements) coverElements.textContent = `${db.panels ? db.panels.length : 0} Items`;

  renderDashboardPanels();
  await refreshReportTelemetry();
}

function exitDashboardDetail() {
  activeDashboardId = null;
  document.getElementById('telemetry-detail-view').classList.add('hidden');
  document.getElementById('telemetry-list-view').classList.remove('hidden');
  renderDashboardsList();
}

function generateLineOrAreaChart(data, isArea = false) {
  if (!data || data.length === 0) return '';
  
  const values = data.map(item => {
    if (Array.isArray(item)) return parseFloat(item[1]) || 0;
    if (item && typeof item === 'object') return parseFloat(item.value) || 0;
    return 0;
  });

  const maxVal = Math.max(10, ...values);
  const minVal = Math.min(0, ...values);
  const range = Math.max(1, maxVal - minVal);

  const width = 300;
  const height = 100;
  const padding = 10;
  const usableHeight = height - padding * 2;
  const usableWidth = width;

  const points = values.map((val, idx) => {
    const x = (idx / Math.max(1, values.length - 1)) * usableWidth;
    const y = height - padding - ((val - minVal) / range) * usableHeight;
    return { x, y };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

  let fillPathD = '';
  if (isArea && points.length > 0) {
    fillPathD = `${pathD} L ${points[points.length - 1].x.toFixed(1)} ${height} L ${points[0].x.toFixed(1)} ${height} Z`;
  }

  return `
    <div style="height: 120px; width: 100%; margin-top: 12px; position: relative;">
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" preserveAspectRatio="none" style="overflow: visible;">
        <defs>
          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--prometheus-orange)" stop-opacity="0.4"/>
            <stop offset="100%" stop-color="var(--prometheus-orange)" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <line x1="0" y1="${height - padding}" x2="${width}" y2="${height - padding}" stroke="var(--app-border)" stroke-width="1" stroke-dasharray="4"/>
        <line x1="0" y1="${padding}" x2="${width}" y2="${padding}" stroke="var(--app-border)" stroke-width="1" stroke-dasharray="4"/>
        
        ${isArea ? `<path d="${fillPathD}" fill="url(#area-grad)" stroke="none" />` : ''}
        <path d="${pathD}" fill="none" stroke="var(--prometheus-orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
  `;
}

function generateBarChart(data) {
  if (!data || data.length === 0) return '';
  const step = Math.max(1, Math.floor(data.length / 7));
  let barsHtml = '';
  for (let index = 0; index < 7; index++) {
    const dataIndex = Math.min(data.length - 1, index * step);
    const item = data[dataIndex];
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

  return `
    <div class="chart-container" style="display: flex; align-items: flex-end; justify-content: space-around; padding: 16px 24px; position: relative; height: 120px; margin-top: 12px;">
      ${barsHtml}
    </div>
  `;
}

function generateDonutOrPieChart(data, isDonut = true) {
  if (!data || data.length === 0) return '';
  const latestItem = data[data.length - 1];
  let val = 0;
  if (Array.isArray(latestItem)) {
    val = parseFloat(latestItem[1]) || 0;
  } else if (latestItem && typeof latestItem === 'object') {
    val = parseFloat(latestItem.value) || 0;
  }

  const percent = Math.min(100, Math.max(0, val));
  const radius = 35;
  const strokeWidth = isDonut ? 8 : 24;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percent / 100) * circumference;

  return `
    <div style="display: flex; align-items: center; justify-content: center; height: 120px; margin-top: 12px; gap: 20px;">
      <div style="position: relative; width: 90px; height: 90px;">
        <svg width="90" height="90" viewBox="0 0 90 90" style="transform: rotate(-90deg);">
          <circle cx="45" cy="45" r="${radius}" stroke="var(--app-border)" stroke-width="${strokeWidth}" fill="${isDonut ? 'none' : 'rgba(255,255,255,0.05)'}"/>
          <circle cx="45" cy="45" r="${radius}" stroke="var(--prometheus-orange)" stroke-width="${strokeWidth}" fill="none"
            stroke-dasharray="${circumference}" stroke-dashoffset="${strokeDashoffset}" stroke-linecap="round"
            style="transition: stroke-dashoffset 0.35s;"/>
        </svg>
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
          <span class="font-mono" style="font-size: 13px; font-weight: bold; color: var(--text-white);">${percent.toFixed(1)}%</span>
          <span style="font-size: 8px; color: var(--text-muted); text-transform: uppercase;">Latest</span>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px; font-size: 11px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--prometheus-orange);"></span>
          <span style="color: var(--text-white);">Active: ${percent.toFixed(2)}%</span>
        </div>
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--app-border);"></span>
          <span style="color: var(--text-muted);">Idle: ${(100 - percent).toFixed(2)}%</span>
        </div>
      </div>
    </div>
  `;
}

function renderDashboardPanels() {
  const container = document.getElementById('telemetry-panels-container');
  if (!container) return;

  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db) return;

  if (!db.panels || db.panels.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted); border: 1px dashed var(--app-border); border-radius: 6px; background: var(--app-card-dark); grid-column: span 2; width: 100%;">
        No reports configured in this section. Click "+ Add Report" to create one.
      </div>
    `;
    return;
  }

  if (reportViewMode === 'config') {
    // Render the Configuration Mode table
    let html = `
      <div style="background: var(--app-card-dark); border: 1px solid var(--app-border); border-radius: 6px; overflow: hidden; width: 100%;">
        <div style="overflow-x: auto;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; min-width: 600px;">
            <thead>
              <tr style="background: rgba(255, 255, 255, 0.02); border-bottom: 1px solid var(--app-border);">
                <th style="padding: 12px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; width: 25%;">Report Title</th>
                <th style="padding: 12px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; width: 40%;">PromQL Expression</th>
                <th style="padding: 12px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; width: 15%;">Format</th>
                <th style="padding: 12px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; width: 10%;">Interval</th>
                <th style="padding: 12px 16px; font-size: 11px; text-transform: uppercase; color: var(--text-muted); font-weight: 600; text-align: right; width: 10%;">Actions</th>
              </tr>
            </thead>
            <tbody>
    `;

    db.panels.forEach(panel => {
      const formatLabel = panel.format ? panel.format.replace('_', ' ').toUpperCase() : 'LINE CHART';
      const intervalStr = panel.intervalMs ? `${panel.intervalMs}ms` : '60000ms';
      
      html += `
              <tr style="border-bottom: 1px solid var(--app-border); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.01)'" onmouseout="this.style.background='transparent'">
                <td style="padding: 14px 16px; font-size: 12px; font-weight: 500; color: var(--text-white);">${panel.title}</td>
                <td style="padding: 14px 16px; font-size: 11px; font-family: monospace; color: var(--text-muted); word-break: break-all;">${panel.query || '-'}</td>
                <td style="padding: 14px 16px; font-size: 11px;">
                  <span style="background: rgba(56, 189, 248, 0.1); color: #38bdf8; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px;">${formatLabel}</span>
                </td>
                <td style="padding: 14px 16px; font-size: 12px; color: var(--text-muted);">${intervalStr}</td>
                <td style="padding: 14px 16px; text-align: right;">
                  <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button class="btn btn-secondary" onclick="previewPanel('${panel.id}')" style="padding: 4px 8px; font-size: 11px; height: auto; display: inline-flex; align-items: center; gap: 4px;" title="Preview Report Data">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      Preview
                    </button>
                    <button class="btn btn-secondary" onclick="openEditPanelModal('${panel.id}')" style="padding: 4px 8px; font-size: 11px; height: auto; display: inline-flex; align-items: center; gap: 4px;" title="Edit Config">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                      Edit
                    </button>
                    <button class="btn btn-secondary" onclick="deletePanel('${panel.id}')" style="padding: 4px 8px; font-size: 11px; height: auto; display: inline-flex; align-items: center; gap: 4px; color: #ff7b72;" title="Remove Report">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
    container.innerHTML = html;
  } else {
    // Render the Visual Report Mode (Pandora FMS style elements)
    let html = '<div class="dashboard-panels-grid">';
    
    db.panels.forEach(panel => {
      const stats = calculatePanelStats(panel.data);
      const hasData = panel.data && panel.data.length > 0;
      const format = panel.format || 'line_chart';
      const dsType = panel.datasourceType || 'prometheus';
      const formatLabel = format.replace('_', ' ').toUpperCase();
      
      // Generate Chart HTML
      let chartHtml = '';
      if (format !== 'table') {
        if (!hasData) {
          chartHtml = `
            <div style="height: 120px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px dashed var(--app-border); border-radius: 4px; margin-top: 12px; color: var(--text-muted); background: rgba(0, 0, 0, 0.1);">
              <span style="font-size: 10px;">No telemetry data loaded. Click "Refresh Data" to pull metrics.</span>
            </div>
          `;
        } else {
          if (format === 'line_chart') {
            chartHtml = generateLineOrAreaChart(panel.data, false);
          } else if (format === 'area_chart') {
            chartHtml = generateLineOrAreaChart(panel.data, true);
          } else if (format === 'bar_chart' || format === 'time_series') {
            chartHtml = generateBarChart(panel.data);
          } else if (format === 'pie_chart') {
            chartHtml = generateDonutOrPieChart(panel.data, false);
          } else if (format === 'donut_chart') {
            chartHtml = generateDonutOrPieChart(panel.data, true);
          }
        }
      }

      // Generate Data Table rows
      let rowsHtml = '';
      if (hasData) {
        const isCpu = panel.query && panel.query.toLowerCase().includes('cpu');
        const suffix = isCpu ? ' %' : '';
        const sortedData = [...panel.data].reverse();
        
        sortedData.forEach(item => {
          let timestamp, value;
          if (Array.isArray(item)) {
            timestamp = item[0];
            value = item[1];
          } else {
            timestamp = item.timestamp;
            value = item.value;
          }
          const timeStr = new Date(timestamp).toLocaleTimeString();
          const dateStr = new Date(timestamp).toLocaleDateString();
          rowsHtml += `
            <tr style="border-bottom: 1px solid var(--app-border);">
              <td class="font-mono" style="font-size: 10px; color: var(--text-muted); padding: 6px 10px;">${timestamp}</td>
              <td style="font-size: 10px; padding: 6px 10px; color: var(--text-white);">${dateStr} ${timeStr}</td>
              <td class="font-mono" style="font-size: 10px; color: #38bdf8; font-weight: bold; text-align: right; padding: 6px 10px;">
                ${parseFloat(value).toFixed(3)}${suffix}
              </td>
            </tr>
          `;
        });
      }

      const isExpanded = expandedInlineTables.has(panel.id);
      const displayClass = isExpanded ? '' : 'hidden';
      const buttonText = isExpanded ? 'Hide Raw Data Table ▲' : 'Show Raw Data Table ▼';

      html += `
        <div class="panel" style="display: flex; flex-direction: column; gap: 12px; border-left: 4px solid #1971c2; position: relative;">
          <!-- Card Header -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <h4 style="margin: 0; font-size: 13px; color: var(--text-white); font-weight: bold;">${panel.title}</h4>
              <span class="font-mono" style="font-size: 9px; color: var(--text-muted); display: block; margin-top: 4px; word-break: break-all;">
                [${dsType.toUpperCase()}] ${panel.query || 'No query configured'}
              </span>
            </div>
            <span style="background: rgba(25, 113, 194, 0.1); color: #1971c2; border: 1px solid rgba(25, 113, 194, 0.2); padding: 2px 6px; border-radius: 4px; font-weight: 700; font-size: 9px; text-transform: uppercase;">
              ${formatLabel}
            </span>
          </div>

          <!-- Chart Area -->
          ${chartHtml}

          <!-- Stats Grid -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; border-top: 1px solid var(--app-border); border-bottom: 1px solid var(--app-border); padding: 8px 0; margin-top: 8px;">
            <div style="text-align: center;">
              <span style="font-size: 8px; color: var(--text-muted); text-transform: uppercase; display: block;">Min</span>
              <span class="font-mono" style="font-size: 11px; font-weight: bold; color: #ff7b72;">${stats.min}</span>
            </div>
            <div style="text-align: center;">
              <span style="font-size: 8px; color: var(--text-muted); text-transform: uppercase; display: block;">Max</span>
              <span class="font-mono" style="font-size: 11px; font-weight: bold; color: #56d364;">${stats.max}</span>
            </div>
            <div style="text-align: center;">
              <span style="font-size: 8px; color: var(--text-muted); text-transform: uppercase; display: block;">Average</span>
              <span class="font-mono" style="font-size: 11px; font-weight: bold; color: #38bdf8;">${stats.avg}</span>
            </div>
            <div style="text-align: center;">
              <span style="font-size: 8px; color: var(--text-muted); text-transform: uppercase; display: block;">Latest</span>
              <span class="font-mono" style="font-size: 11px; font-weight: bold; color: var(--text-white);">${stats.latest}</span>
            </div>
          </div>

          <!-- Actions & Expansion -->
          <div style="display: flex; gap: 8px; margin-top: 4px;">
            <button type="button" class="btn btn-secondary" onclick="togglePanelTableInline('${panel.id}')" style="flex: 1; font-size: 10px; padding: 4px 8px; height: auto; border-color: var(--app-border); text-align: center; justify-content: center;">
              ${buttonText}
            </button>
            <button type="button" class="btn btn-secondary" onclick="exportPanelCSV('${panel.id}')" style="font-size: 10px; padding: 4px 8px; height: auto; border-color: var(--app-border); display: inline-flex; align-items: center; justify-content: center;" title="Export CSV">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </button>
          </div>

          <!-- Inline Raw Data Table -->
          <div id="table-inline-${panel.id}" class="${displayClass}" style="margin-top: 8px; max-height: 180px; overflow-y: auto; border: 1px solid var(--app-border); border-radius: 4px;">
            ${hasData ? `
              <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                  <tr style="background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--app-border);">
                    <th style="font-size: 9px; padding: 6px 10px; color: var(--text-muted);">Epoch</th>
                    <th style="font-size: 9px; padding: 6px 10px; color: var(--text-muted);">Time</th>
                    <th style="font-size: 9px; padding: 6px 10px; text-align: right; color: var(--text-muted);">Value</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            ` : `
              <div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 10px;">
                No historical records loaded.
              </div>
            `}
          </div>
        </div>
      `;
    });

    html += '</div>';
    container.innerHTML = html;
  }
}

// Dashboard Modals and CRUD
function openCreateDashboardModal() {
  document.getElementById('dashboard-modal-title').textContent = "Create Report";
  document.getElementById('dashboard-id-input').value = "";
  document.getElementById('dashboard-name-input').value = "";
  document.getElementById('dashboard-group-input').value = "";
  document.getElementById('dashboard-modal').classList.add('active');
}

function openEditDashboardModal(dbId) {
  const db = dashboards.find(d => d.id === dbId);
  if (!db) return;
  document.getElementById('dashboard-modal-title').textContent = "Edit Report";
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
  if (!confirm("Are you sure you want to delete this report?")) return;
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
    title: "New Metric",
    query: "",
    timePreset: "1h",
    fromDate: "",
    toDate: "",
    format: "line_chart",
    intervalMs: 60000,
    maxDataPoints: 1000,
    grafanaConfigId: "",
    datasourceUid: "",
    datasourceType: "prometheus",
    data: []
  };

  db.panels.push(newPanel);
  saveDashboardsToStorage();
  renderDashboardPanels();
  openEditPanelModal(panelId);
}

function deletePanel(panelId) {
  if (!confirm("Are you sure you want to remove this report?")) return;
  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db) return;

  db.panels = db.panels.filter(p => p.id !== panelId);
  saveDashboardsToStorage();
  renderDashboardPanels();
}

async function loadConfigsDropdown(selectedConfigId) {
  const selectEl = document.getElementById('panel-config-select');
  if (!selectEl) return;

  selectEl.innerHTML = '<option value="">-- Loading Server Profiles... --</option>';

  try {
    const res = await fetch('/api/v1/settings/grafana/configs');
    const result = await res.json();
    if (res.ok && result.success && Array.isArray(result.data)) {
      const configs = result.data;
      
      let options = '<option value="">-- Use Active Configuration --</option>';
      configs.forEach(c => {
        const isSelected = c.id === selectedConfigId ? 'selected' : '';
        options += `<option value="${c.id}" ${isSelected}>${c.name}</option>`;
      });
      selectEl.innerHTML = options;
    } else {
      selectEl.innerHTML = '<option value="">-- Use Active Configuration --</option>';
    }
  } catch (error) {
    console.error('Error loading configs dropdown:', error);
    selectEl.innerHTML = '<option value="">-- Use Active Configuration --</option>';
  }
}

async function onPanelConfigChange() {
  const selectEl = document.getElementById('panel-config-select');
  if (!selectEl) return;
  const configId = selectEl.value;
  
  // Reload datasources for this config
  await loadDatasourcesDropdown(null, configId);
  onPanelDatasourceChange();
}

async function loadDatasourcesDropdown(selectedUid, configId = "") {
  const selectEl = document.getElementById('panel-datasource-select');
  if (!selectEl) return;

  selectEl.innerHTML = '<option value="">-- Loading datasources... --</option>';

  try {
    const url = configId 
      ? `/api/v1/settings/grafana/datasources?configId=${configId}` 
      : '/api/v1/settings/grafana/datasources';
    const res = await fetch(url);
    const result = await res.json();
    if (res.ok && result.success && Array.isArray(result.data)) {
      const datasources = result.data;
      if (datasources.length === 0) {
        selectEl.innerHTML = '<option value="">No datasources found (Check Settings)</option>';
        return;
      }
      
      const activeUid = selectedUid || defaultDatasourceUid;
      let options = '';
      datasources.forEach(ds => {
        const isSelected = ds.uid === activeUid ? 'selected' : '';
        options += `<option value="${ds.uid}" data-type="${ds.type}" ${isSelected}>${ds.name} (${ds.type})</option>`;
      });
      selectEl.innerHTML = options;
    } else {
      selectEl.innerHTML = '<option value="">Failed to load datasources</option>';
    }
  } catch (error) {
    console.error('Error loading datasources:', error);
    selectEl.innerHTML = '<option value="">Failed to load datasources (Connection Error)</option>';
  }
}

function onPanelDatasourceChange() {
  const selectEl = document.getElementById('panel-datasource-select');
  if (!selectEl) return;
  const selectedOption = selectEl.options[selectEl.selectedIndex];
  if (!selectedOption) return;
  
  const dsType = selectedOption.getAttribute('data-type') || '';
  const queryLabel = document.getElementById('panel-query-label');
  const queryHelp = document.getElementById('panel-query-help');
  const queryInput = document.getElementById('panel-query-input');

  if (queryLabel && queryHelp && queryInput) {
    if (dsType.toLowerCase().includes('prom')) {
      queryLabel.textContent = 'PromQL Query Expression (expr)';
      queryInput.placeholder = 'e.g. mktxp_system_cpu_load{routerboard_name="RC_HONET"}';
      queryHelp.textContent = 'Masukkan PromQL expression lengkap (seperti parameter \'expr\' di Postman).';
    } else {
      queryLabel.textContent = `Query Expression (${dsType.toUpperCase()} rawSql / query)`;
      queryInput.placeholder = 'e.g. SELECT time, value FROM metrics WHERE host = \'RC_HONET\'';
      queryHelp.textContent = `Masukkan query query/rawSql yang sesuai untuk datasource tipe ${dsType}.`;
    }
  }
}

// Panel Query Modal Helpers
function onMetricPresetChange() {
  const preset = document.getElementById('panel-preset-select').value;
  const titleInput = document.getElementById('panel-title-input');
  const queryInput = document.getElementById('panel-query-input');
  const formatSelect = document.getElementById('panel-format-select');

  if (preset === 'custom') {
    return;
  }

  const presets = {
    mikrotik_cpu: {
      title: 'Mikrotik Router CPU Load',
      query: 'mktxp_system_cpu_load',
      format: 'line_chart'
    },
    node_cpu: {
      title: 'Node Exporter CPU Utilization (%)',
      query: '100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)',
      format: 'line_chart'
    },
    node_memory: {
      title: 'Node Exporter Memory Usage (%)',
      query: 'node_memory_Active_bytes / node_memory_MemTotal_bytes * 100',
      format: 'line_chart'
    },
    node_disk: {
      title: 'Node Exporter Disk Utilization (%)',
      query: '(node_filesystem_size_bytes{mountpoint="/"} - node_filesystem_free_bytes{mountpoint="/"}) / node_filesystem_size_bytes{mountpoint="/"} * 100',
      format: 'bar_chart'
    },
    prometheus_uptime: {
      title: 'Prometheus Instance Uptime',
      query: 'process_uptime_seconds',
      format: 'table'
    }
  };

  const selected = presets[preset];
  if (selected) {
    titleInput.value = selected.title;
    queryInput.value = selected.query;
    formatSelect.value = selected.format;
  }
}

function onTimePresetChange() {
  const preset = document.getElementById('panel-time-preset-select').value;
  const customDateRow = document.getElementById('custom-date-row');
  const fromInput = document.getElementById('panel-from-input');
  const toInput = document.getElementById('panel-to-input');

  if (preset === 'custom') {
    customDateRow.classList.remove('hidden');
    fromInput.required = true;
    toInput.required = true;
  } else {
    customDateRow.classList.add('hidden');
    fromInput.required = false;
    toInput.required = false;
  }
}

let activePanelId = null;

async function openEditPanelModal(panelId) {
  activePanelId = panelId;
  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db) return;

  const panel = db.panels.find(p => p.id === panelId);
  if (!panel) return;

  document.getElementById('query-panel-id').value = panelId;
  document.getElementById('panel-preset-select').value = "custom";
  document.getElementById('panel-title-input').value = panel.title || "";
  document.getElementById('panel-query-input').value = panel.query || "";
  document.getElementById('panel-format-select').value = panel.format || "time_series";
  document.getElementById('panel-interval-input').value = panel.intervalMs || 60000;
  document.getElementById('panel-max-datapoints-input').value = panel.maxDataPoints || 1000;

  const timePreset = panel.timePreset || "1h";
  document.getElementById('panel-time-preset-select').value = timePreset;
  
  const customDateRow = document.getElementById('custom-date-row');
  const fromInput = document.getElementById('panel-from-input');
  const toInput = document.getElementById('panel-to-input');

  if (timePreset === 'custom') {
    customDateRow.classList.remove('hidden');
    fromInput.value = panel.fromDate || "";
    toInput.value = panel.toDate || "";
    fromInput.required = true;
    toInput.required = true;
  } else {
    customDateRow.classList.add('hidden');
    fromInput.required = false;
    toInput.required = false;
  }

  hidePanelQueryFeedback();
  
  await loadConfigsDropdown(panel.grafanaConfigId);
  await loadDatasourcesDropdown(panel.datasourceUid, panel.grafanaConfigId);
  onPanelDatasourceChange();

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
  const timePreset = document.getElementById('panel-time-preset-select').value;
  
  let fromDate = "";
  let toDate = "";

  if (timePreset === 'custom') {
    fromDate = document.getElementById('panel-from-input').value;
    toDate = document.getElementById('panel-to-input').value;
    if (!fromDate || !toDate) {
      showPanelQueryFeedback('danger', 'Form Error', 'Start Date dan End Date wajib diisi untuk range kustom.');
      return;
    }
  } else {
    const now = new Date();
    let durationMs = 60 * 60 * 1000; // default 1h
    if (timePreset === '6h') durationMs = 6 * 60 * 60 * 1000;
    else if (timePreset === '24h') durationMs = 24 * 60 * 60 * 1000;
    else if (timePreset === '7d') durationMs = 7 * 24 * 60 * 60 * 1000;

    const fromTime = new Date(now.getTime() - durationMs);
    fromDate = fromTime.toISOString();
    toDate = now.toISOString();
  }

  const format = document.getElementById('panel-format-select').value;
  const intervalMs = parseInt(document.getElementById('panel-interval-input').value, 10) || 60000;
  const maxDataPoints = parseInt(document.getElementById('panel-max-datapoints-input').value, 10) || 1000;

  const selectEl = document.getElementById('panel-datasource-select');
  const datasourceUid = selectEl ? selectEl.value : "";
  const selectedOption = selectEl ? selectEl.options[selectEl.selectedIndex] : null;
  const datasourceType = selectedOption ? selectedOption.getAttribute('data-type') : "prometheus";

  const configSelectEl = document.getElementById('panel-config-select');
  const grafanaConfigId = configSelectEl ? configSelectEl.value : "";

  if (!query) {
    showPanelQueryFeedback('danger', 'Form Error', 'Query expression wajib diisi.');
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

  addLog('Telemetry', `Querying metric for report "${title}" via ${datasourceType.toUpperCase()}...`, 'INFO');

  try {
    const res = await fetch(API_REPORT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromDate: timePreset === 'custom' ? new Date(fromDate).toISOString() : fromDate,
        toDate: timePreset === 'custom' ? new Date(toDate).toISOString() : toDate,
        query: query,
        format: format,
        intervalMs: intervalMs,
        maxDataPoints: maxDataPoints,
        datasourceUid: datasourceUid,
        datasourceType: datasourceType,
        grafanaConfigId: grafanaConfigId
      })
    });

    const result = await res.json();
    if (res.ok && result.success) {
      const data = result.data || [];
      
      panel.title = title;
      panel.query = query;
      panel.timePreset = timePreset;
      panel.fromDate = fromDate;
      panel.toDate = toDate;
      panel.format = format;
      panel.intervalMs = intervalMs;
      panel.maxDataPoints = maxDataPoints;
      panel.datasourceUid = datasourceUid;
      panel.datasourceType = datasourceType;
      panel.grafanaConfigId = grafanaConfigId;
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

// 7. View datasources popup modal for a specific Grafana configuration
async function viewDatasources(configId, configName, configHost) {
  const modal = document.getElementById('datasources-modal');
  const titleEl = document.getElementById('datasources-modal-title');
  const infoEl = document.getElementById('datasources-modal-server-info');
  const tbody = document.getElementById('popup-datasources-tbody');
  
  if (!modal || !tbody) return;
  
  titleEl.textContent = `Datasources: ${configName}`;
  infoEl.textContent = `Host: ${configHost}`;
  tbody.innerHTML = `
    <tr>
      <td colspan="3" class="text-center" style="padding: 20px; text-align: center; color: var(--text-muted);">
        <span class="spinner" style="display: inline-block; width: 12px; height: 12px; border: 2px solid var(--text-muted); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite; margin-right: 6px; vertical-align: middle;"></span>
        Fetching datasources list...
      </td>
    </tr>
  `;
  
  modal.classList.add('active');
  
  try {
    const res = await fetch(`/api/v1/settings/grafana/datasources?configId=${configId}`);
    const result = await res.json();
    if (res.ok && result.success && Array.isArray(result.data)) {
      const list = result.data;
      if (list.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="3" class="text-center" style="padding: 20px; text-align: center; color: var(--text-muted);">
              No datasources found on this server.
            </td>
          </tr>
        `;
        return;
      }
      
      let html = '';
      list.forEach(ds => {
        const isPrometheus = ds.type === 'prometheus';
        const highlightStyle = isPrometheus ? 'color: var(--prometheus-orange); font-weight: bold;' : 'color: var(--text-muted);';
        
        html += `
          <tr style="border-bottom: 1px solid var(--app-border);">
            <td style="padding: 8px 12px; font-weight: 600;">${ds.name}</td>
            <td style="padding: 8px 12px; ${highlightStyle}">${ds.type}</td>
            <td style="padding: 8px 12px;" class="font-mono text-muted">
              <span>${ds.uid}</span>
              <button type="button" class="btn btn-secondary" onclick="copyTextToClipboard('${ds.uid}')" style="padding: 2px 4px; font-size: 9px; height: auto; margin-left: 6px; display: inline-flex; align-items: center; justify-content: center;" title="Copy UID">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              </button>
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" class="text-center" style="padding: 20px; text-align: center; color: #ff7b72;">
            Failed to load datasources: ${result.message || 'Server error'}
          </td>
        </tr>
      `;
    }
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center" style="padding: 20px; text-align: center; color: #ff7b72;">
          Failed to load datasources: Connection error
        </td>
      </tr>
    `;
  }
}

function closeDatasourcesModal() {
  const modal = document.getElementById('datasources-modal');
  if (modal) modal.classList.remove('active');
}

function copyTextToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    addLog('System', `Copied to clipboard: ${text}`, 'INFO');
  }).catch(err => {
    console.error('Failed to copy: ', err);
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

function setLoading(loading, type = '') {
  if (btnTest) btnTest.disabled = loading;
  if (btnSave) btnSave.disabled = loading;
  if (btnReset) btnReset.disabled = loading;
  
  if (loading) {
    if (type === 'test' && spinnerTest) spinnerTest.classList.remove('hidden');
    if (type === 'save' && spinnerSave) spinnerSave.classList.remove('hidden');
    if (type === 'reset' && spinnerReset) spinnerReset.classList.remove('hidden');
  } else {
    if (spinnerTest) spinnerTest.classList.add('hidden');
    if (spinnerSave) spinnerSave.classList.add('hidden');
    if (spinnerReset) spinnerReset.classList.add('hidden');
  }
}

function exportPanelCSV(panelId) {
  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db) return;
  const panel = db.panels.find(p => p.id === panelId);
  if (!panel || !panel.data || panel.data.length === 0) {
    alert("No data available to export.");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Epoch Timestamp,Time,Value\n";

  panel.data.forEach(item => {
    let timestamp, value;
    if (Array.isArray(item)) {
      timestamp = item[0];
      value = item[1];
    } else {
      timestamp = item.timestamp;
      value = item.value;
    }
    const timeStr = new Date(timestamp).toLocaleString().replace(/,/g, '');
    csvContent += `${timestamp},${timeStr},${value}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${panel.title.replace(/\s+/g, '_')}_report.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function exportDashboardCSV() {
  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db || !db.panels || db.panels.length === 0) {
    alert("No panels available to export.");
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,";
  csvContent += "Panel Title,Epoch Timestamp,Time,Value\n";

  let hasAnyData = false;
  db.panels.forEach(panel => {
    if (panel.data && panel.data.length > 0) {
      hasAnyData = true;
      panel.data.forEach(item => {
        let timestamp, value;
        if (Array.isArray(item)) {
          timestamp = item[0];
          value = item[1];
        } else {
          timestamp = item.timestamp;
          value = item.value;
        }
        const timeStr = new Date(timestamp).toLocaleString().replace(/,/g, '');
        csvContent += `"${panel.title}",${timestamp},${timeStr},${value}\n`;
      });
    }
  });

  if (!hasAnyData) {
    alert("No data available to export.");
    return;
  }

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `${db.name.replace(/\s+/g, '_')}_full_report.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const previewModal = document.getElementById('preview-modal');
const previewTitle = document.getElementById('preview-title');
const previewQuery = document.getElementById('preview-query');
const previewChartContainer = document.getElementById('preview-chart-container');
const previewTableContainer = document.getElementById('preview-table-container');
const btnPreviewExport = document.getElementById('btn-preview-export');

function previewPanel(panelId) {
  const db = dashboards.find(d => d.id === activeDashboardId);
  if (!db) return;
  const panel = db.panels.find(p => p.id === panelId);
  if (!panel) return;

  previewTitle.textContent = `Report Preview: ${panel.title}`;
  const dsType = panel.datasourceType || 'prometheus';
  previewQuery.textContent = `${dsType.toUpperCase()} Query: ${panel.query || 'No query configured'}`;

  // Configure export button in the preview modal
  btnPreviewExport.onclick = () => exportPanelCSV(panel.id);

  const hasData = panel.data && panel.data.length > 0;
  const format = panel.format || 'line_chart';

  // 1. Render Chart
  let chartHtml = '';
  if (format !== 'table') {
    previewChartContainer.style.display = 'block';
    if (!hasData) {
      chartHtml = `
        <div class="empty-state" style="padding: 40px; text-align: center; color: var(--text-muted);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          <div style="font-size: 11px; margin-top: 8px;">No data loaded. Edit query to configure.</div>
        </div>
      `;
    } else {
      if (format === 'line_chart') {
        chartHtml = generateLineOrAreaChart(panel.data, false);
      } else if (format === 'area_chart') {
        chartHtml = generateLineOrAreaChart(panel.data, true);
      } else if (format === 'bar_chart' || format === 'time_series') {
        chartHtml = generateBarChart(panel.data);
      } else if (format === 'pie_chart') {
        chartHtml = generateDonutOrPieChart(panel.data, false);
      } else if (format === 'donut_chart') {
        chartHtml = generateDonutOrPieChart(panel.data, true);
      }
    }
  } else {
    previewChartContainer.style.display = 'none';
  }
  previewChartContainer.innerHTML = chartHtml;

  // 2. Render Table (Show all data points!)
  let tableHtml = '';
  if (hasData) {
    const isCpu = panel.query && panel.query.toLowerCase().includes('cpu');
    const suffix = isCpu ? ' %' : '';
    
    let rows = '';
    // Show all data points, reverse to show newest first
    const allData = [...panel.data].reverse();
    allData.forEach(item => {
      let timestamp, value;
      if (Array.isArray(item)) {
        timestamp = item[0];
        value = item[1];
      } else {
        timestamp = item.timestamp;
        value = item.value;
      }
      const timeStr = new Date(timestamp).toLocaleTimeString();
      const dateStr = new Date(timestamp).toLocaleDateString();
      rows += `
        <tr style="border-bottom: 1px solid var(--app-border);">
          <td class="font-mono" style="font-size: 11px; color: var(--text-muted); padding: 8px 12px;">${timestamp}</td>
          <td style="font-size: 11px; padding: 8px 12px;">${dateStr} ${timeStr}</td>
          <td class="font-mono" style="font-size: 11px; color: #38bdf8; font-weight: bold; text-align: right; padding: 8px 12px;">
            ${parseFloat(value).toFixed(3)}${suffix}
          </td>
        </tr>
      `;
    });

    tableHtml = `
      <div style="margin-top: 12px;">
        <h4 style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px;">Detailed Data Points (${panel.data.length} records)</h4>
        <div class="table-wrapper" style="max-height: 300px; overflow-y: auto; border: 1px solid var(--app-border); border-radius: 4px;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: var(--app-card-dark); border-bottom: 1px solid var(--app-border);">
                <th style="font-size: 10px; padding: 8px 12px; color: var(--text-muted);">Epoch Timestamp</th>
                <th style="font-size: 10px; padding: 8px 12px; color: var(--text-muted);">Date & Time</th>
                <th style="font-size: 10px; padding: 8px 12px; text-align: right; color: var(--text-muted);">Value</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } else {
    tableHtml = `
      <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 11px; border: 1px dashed var(--app-border); border-radius: 4px;">
        No data table available.
      </div>
    `;
  }
  previewTableContainer.innerHTML = tableHtml;

  // Open the modal
  previewModal.classList.add('active');
}

function closePreviewModal() {
  previewModal.classList.remove('active');
}
