// Endpoints
const API_SETTINGS_URL = '/api/v1/settings/grafana';

// Navigation pages
const pages = ['overview', 'settings', 'diagnostics', 'installer', 'prometheus', 'monitoring'];

// Global Connection registry caches
let grafanaConfigs = [];
let prometheusConfigs = [];

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

// Unified Connection form inputs
const inputConnectionType = document.getElementById('connection-type');
const inputConnectionId = document.getElementById('connection-id');
const inputConnectionName = document.getElementById('connection-name');

const grafanaFields = document.getElementById('grafana-fields');
const prometheusFields = document.getElementById('prometheus-fields');

const inputPrometheusMode = document.getElementById('prometheus-mode');
const inputPrometheusPath = document.getElementById('prometheus-path');
const inputPrometheusReloadUrl = document.getElementById('prometheus-reload-url');
const prometheusSshFields = document.getElementById('prometheus-ssh-fields');
const inputPrometheusSshHost = document.getElementById('prometheus-ssh-host');
const inputPrometheusSshPort = document.getElementById('prometheus-ssh-port');
const inputPrometheusSshUser = document.getElementById('prometheus-ssh-user');
const inputPrometheusSshAuth = document.getElementById('prometheus-ssh-auth');
const inputPrometheusSshPassword = document.getElementById('prometheus-ssh-password');
const inputPrometheusSshKey = document.getElementById('prometheus-ssh-key');

const sshPasswordGroup = document.getElementById('ssh-password-group');
const sshKeyGroup = document.getElementById('ssh-key-group');

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

  // Initialize unified connection fields visibility
  toggleConnectionFields();
  togglePrometheusModeFields();
  toggleSSHAuthFields();

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
  } else if (pageId === 'diagnostics') {
    pageTitle.textContent = 'System Diagnostics';
    pageDesc.textContent = 'Informasi endpoint API backend dan diagnostik kesehatan sistem.';
    diagTime.textContent = new Date().toLocaleString();
  } else if (pageId === 'installer') {
    pageTitle.textContent = 'Exporter Installer';
    pageDesc.textContent = 'Panduan instalasi otomatis dan generate command setup service systemd Prometheus Exporters.';
    initInstallerPage();
  } else if (pageId === 'prometheus') {
    pageTitle.textContent = 'Prometheus Config';
    pageDesc.textContent = 'Kelola, validasi, dan muat ulang (hot reload) konfigurasi file prometheus.yml.';
    initPrometheusPage();
  } else if (pageId === 'monitoring') {
    pageTitle.textContent = 'Monitoring View';
    pageDesc.textContent = 'Slideshow rotasi monitoring dashboard Grafana ter-embed.';
    initMonitoringPage();
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
  await loadSettingsRegistry();
}

async function loadGrafanaConfigsList() {
  await loadSettingsRegistry();
}

async function loadSettingsRegistry() {
  try {
    // 1. Fetch Grafana Active Setting to update Top Overview / Info panel
    const resGrafana = await fetch(API_SETTINGS_URL);
    if (resGrafana.ok) {
      const result = await resGrafana.json();
      if (result.success && result.data) {
        const { id, name, host, datasourceUid, isConfigured, maskedToken } = result.data;
        defaultDatasourceUid = datasourceUid || 'bf5jy3ppyomwwd';
        activeHost.textContent = name ? `${name} (${host})` : (host || 'None (No active config)');
        activeDatasource.textContent = datasourceUid || 'bf5jy3ppyomwwd';
        widgetDatasourceUid.textContent = datasourceUid || 'bf5jy3ppyomwwd';
        
        if (isConfigured) {
          activeState.className = 'status-badge status-configured';
          activeState.innerHTML = '● Custom Config';
          widgetGrafanaStatus.textContent = 'Connected';
          widgetGrafanaStatus.style.color = '#56d364';
          widgetGrafanaSub.textContent = name || host;
          infraGrafanaDot.className = 'status-dot dot-green';
        } else {
          activeState.className = 'status-badge status-default';
          activeState.innerHTML = '● Default Env';
          if (host) {
            widgetGrafanaStatus.textContent = 'Connected';
            widgetGrafanaStatus.style.color = '#e3b341';
            widgetGrafanaSub.textContent = 'Using .env configuration';
            infraGrafanaDot.className = 'status-dot dot-green';
          } else {
            widgetGrafanaStatus.textContent = 'Offline';
            widgetGrafanaStatus.style.color = '#ff7b72';
            widgetGrafanaSub.textContent = 'Configuration required';
            infraGrafanaDot.className = 'status-dot dot-yellow';
          }
        }
      }
    }

    // 2. Fetch Grafana Configs List AND Prometheus Configs List
    try {
      const resG = await fetch('/api/v1/settings/grafana/configs');
      const rG = await resG.json();
      if (rG.success && Array.isArray(rG.data)) {
        grafanaConfigs = rG.data;
      }
    } catch (_) {}

    try {
      const resP = await fetch('/api/v1/prometheus/configs');
      const rP = await resP.json();
      if (rP.success && Array.isArray(rP.configs)) {
        prometheusConfigs = rP.configs;
      }
    } catch (_) {}

    // 3. Render list in registry-cards-container
    const totalCount = grafanaConfigs.length + prometheusConfigs.length;
    const headerTitle = document.getElementById('registry-header-title');
    if (headerTitle) {
      headerTitle.textContent = `Active Registry (${totalCount})`;
    }

    if (totalCount === 0) {
      registryCardsContainer.innerHTML = `
        <div style="text-align: center; padding: 24px; color: var(--text-muted);">
          No registered connections found.
        </div>
      `;
      return;
    }

    let html = '';

    // Render Grafana connections
    grafanaConfigs.forEach(c => {
      const escapedName = c.name.replace(/'/g, "\\'");
      const escapedHost = c.host.replace(/'/g, "\\'");

      html += `
        <div class="registry-card" style="display: flex; align-items: center; justify-content: space-between; background: var(--app-card-dark); border: 1px solid var(--app-border); padding: 14px 16px; border-radius: 6px; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
            <div style="width: 36px; height: 36px; background: rgba(25, 113, 194, 0.1); border: 1px solid rgba(25, 113, 194, 0.2); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #1971c2; flex-shrink: 0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                <line x1="6" y1="6" x2="6.01" y2="6"></line>
                <line x1="6" y1="18" x2="6.01" y2="18"></line>
              </svg>
            </div>
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
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <span id="conn-status-${c.id}" class="status-badge status-default" style="background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 10px; display: inline-flex; align-items: center; padding: 2px 6px; height: 26px; box-sizing: border-box; line-height: 1;">
              CHECKING...
            </span>
            <button type="button" class="btn btn-secondary" onclick="viewDatasources('${c.id}', '${escapedName}', '${escapedHost}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">View DS</button>
            <button type="button" class="btn btn-secondary" onclick="pingServer('${c.id}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">Ping Test</button>
            ${!c.isActive ? `<button type="button" class="btn btn-secondary" onclick="activateGrafanaConfig('${c.id}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">Activate</button>` : ''}
            <button type="button" class="btn btn-secondary" onclick="editGrafanaConfigById('${c.id}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" title="Edit Config">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button type="button" class="btn btn-secondary" onclick="deleteGrafanaConfig('${c.id}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: #ff7b72; border-color: rgba(255, 123, 114, 0.15);" title="Delete Config">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    });

    // Render Prometheus connections
    prometheusConfigs.forEach(c => {
      html += `
        <div class="registry-card" style="display: flex; align-items: center; justify-content: space-between; background: var(--app-card-dark); border: 1px solid var(--app-border); padding: 14px 16px; border-radius: 6px; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
            <div style="width: 36px; height: 36px; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #f59e0b; flex-shrink: 0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
                <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"></path>
              </svg>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-weight: 600; color: var(--text-white); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${c.name}</span>
                <span class="status-badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 9px; padding: 1px 4px; font-weight: bold; line-height: 1;">PROMETHEUS</span>
                <span class="status-badge" style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid var(--app-border); font-size: 9px; padding: 1px 4px; line-height: 1;">${c.mode.toUpperCase()}</span>
                ${c.isActive ? '<span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 9px; padding: 1px 4px; font-weight: bold; line-height: 1;">ACTIVE</span>' : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); min-width: 0;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                <span class="font-mono" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${c.path} ${c.mode === 'ssh' ? `(${c.sshHost})` : ''}</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <span id="conn-status-${c.id}" class="status-badge status-default" style="background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 10px; display: inline-flex; align-items: center; padding: 2px 6px; height: 26px; box-sizing: border-box; line-height: 1;">
              CHECKING...
            </span>
            <button type="button" class="btn btn-secondary" onclick="pingPrometheusServer('${c.id}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">Ping Test</button>
            ${!c.isActive ? `<button type="button" class="btn btn-secondary" onclick="activatePrometheusConfig('${c.id}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">Activate</button>` : ''}
            <button type="button" class="btn btn-secondary" onclick="editPrometheusConfigById('${c.id}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" title="Edit Config">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button type="button" class="btn btn-secondary" onclick="deletePrometheusConfig('${c.id}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: #ff7b72; border-color: rgba(255, 123, 114, 0.15);" title="Delete Config">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    });

    registryCardsContainer.innerHTML = html;

    // Trigger asynchronous connection checks
    grafanaConfigs.forEach(c => {
      checkCardConnection(c.id);
    });

    prometheusConfigs.forEach(c => {
      checkPrometheusCardConnection(c.id);
    });

  } catch (error) {
    console.error('Error rendering registry:', error);
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
  
  setTimeout(() => {
    const updatedBadge = document.getElementById(`conn-status-${id}`);
    if (updatedBadge && updatedBadge.textContent.includes('CONNECTED')) {
      addLog('Configuration', `Ping test connection successful for configuration.`, 'SUCCESS');
    } else {
      addLog('Configuration', `Ping test connection failed. Server is offline or unreachable.`, 'ERROR');
    }
  }, 800);
}

function toggleConnectionFields() {
  if (!inputConnectionType || !grafanaFields || !prometheusFields) return;
  const type = inputConnectionType.value;
  if (type === 'grafana') {
    grafanaFields.classList.remove('hidden');
    prometheusFields.classList.add('hidden');
    if (inputConnectionName) inputConnectionName.placeholder = 'e.g. Production Grafana';
  } else {
    grafanaFields.classList.add('hidden');
    prometheusFields.classList.remove('hidden');
    if (inputConnectionName) inputConnectionName.placeholder = 'e.g. Remote Prometheus';
  }
}

function togglePrometheusModeFields() {
  if (!inputPrometheusMode || !prometheusSshFields) return;
  const mode = inputPrometheusMode.value;
  if (mode === 'local') {
    prometheusSshFields.classList.add('hidden');
  } else {
    prometheusSshFields.classList.remove('hidden');
  }
}

function toggleSSHAuthFields() {
  if (!inputPrometheusSshAuth || !sshPasswordGroup || !sshKeyGroup) return;
  const auth = inputPrometheusSshAuth.value;
  if (auth === 'password') {
    sshPasswordGroup.classList.remove('hidden');
    sshKeyGroup.classList.add('hidden');
  } else {
    sshPasswordGroup.classList.add('hidden');
    sshKeyGroup.classList.remove('hidden');
  }
}

function clearConnectionForm() {
  if (inputConnectionId) inputConnectionId.value = '';
  if (inputConnectionName) inputConnectionName.value = '';
  if (inputHost) inputHost.value = '';
  if (inputToken) inputToken.value = '';
  if (inputDatasource) inputDatasource.value = '';
  
  if (inputPrometheusMode) inputPrometheusMode.value = 'local';
  if (inputPrometheusPath) inputPrometheusPath.value = '/etc/prometheus/prometheus.yml';
  if (inputPrometheusReloadUrl) inputPrometheusReloadUrl.value = 'http://localhost:9090/-/reload';
  if (inputPrometheusSshHost) inputPrometheusSshHost.value = '';
  if (inputPrometheusSshPort) inputPrometheusSshPort.value = '22';
  if (inputPrometheusSshUser) inputPrometheusSshUser.value = '';
  if (inputPrometheusSshAuth) inputPrometheusSshAuth.value = 'password';
  if (inputPrometheusSshPassword) inputPrometheusSshPassword.value = '';
  if (inputPrometheusSshKey) inputPrometheusSshKey.value = '';

  toggleConnectionFields();
  togglePrometheusModeFields();
  toggleSSHAuthFields();

  const saveText = document.getElementById('btn-save-text');
  if (saveText) saveText.textContent = '+ Register Endpoint';
  hideFeedback();
}

function clearGrafanaForm() {
  clearConnectionForm();
}

function editGrafanaConfigById(id) {
  if (!grafanaConfigs) return;
  const c = grafanaConfigs.find(item => item.id === id);
  if (!c) return;

  if (inputConnectionType) inputConnectionType.value = 'grafana';
  if (inputConnectionId) inputConnectionId.value = c.id;
  if (inputConnectionName) inputConnectionName.value = c.name;
  if (inputHost) inputHost.value = c.host;
  if (inputDatasource) inputDatasource.value = c.datasourceUid || '';
  
  const tokenVal = c.maskedToken || '';
  if (inputToken) inputToken.value = tokenVal === '****************' ? '' : tokenVal;

  toggleConnectionFields();

  const saveText = document.getElementById('btn-save-text');
  if (saveText) saveText.textContent = 'Update Connection';
  hideFeedback();
}

function editPrometheusConfigById(id) {
  if (!prometheusConfigs) return;
  const c = prometheusConfigs.find(item => item.id === id);
  if (!c) return;

  if (inputConnectionType) inputConnectionType.value = 'prometheus';
  if (inputConnectionId) inputConnectionId.value = c.id;
  if (inputConnectionName) inputConnectionName.value = c.name;

  if (inputPrometheusMode) inputPrometheusMode.value = c.mode;
  if (inputPrometheusPath) inputPrometheusPath.value = c.path;
  if (inputPrometheusReloadUrl) inputPrometheusReloadUrl.value = c.reloadUrl;
  if (inputPrometheusSshHost) inputPrometheusSshHost.value = c.sshHost || '';
  if (inputPrometheusSshPort) inputPrometheusSshPort.value = c.sshPort || '22';
  if (inputPrometheusSshUser) inputPrometheusSshUser.value = c.sshUser || '';
  if (inputPrometheusSshAuth) inputPrometheusSshAuth.value = c.sshAuth || 'password';
  if (inputPrometheusSshPassword) inputPrometheusSshPassword.value = c.sshPassword ? '********' : '';
  if (inputPrometheusSshKey) inputPrometheusSshKey.value = c.sshKey || '';

  toggleConnectionFields();
  togglePrometheusModeFields();
  toggleSSHAuthFields();

  const saveText = document.getElementById('btn-save-text');
  if (saveText) saveText.textContent = 'Update Connection';
  hideFeedback();
}

async function activateGrafanaConfig(id) {
  addLog('Configuration', 'Activating Grafana configuration...', 'INFO');
  try {
    const res = await fetch(`/api/v1/settings/grafana/configs/${id}/activate`, {
      method: 'POST'
    });
    const result = await res.json();
    if (res.ok && result.success) {
      addLog('Configuration', result.message || 'Configuration activated successfully.', 'SUCCESS');
      await loadSettingsRegistry();
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
      await loadSettingsRegistry();
    } else {
      addLog('Configuration', `Deletion failed: ${result.message || 'Unknown error'}`, 'ERROR');
    }
  } catch (error) {
    console.error('Error deleting configuration:', error);
    addLog('Configuration', 'Network error during configuration deletion.', 'ERROR');
  }
}

async function activatePrometheusConfig(id) {
  addLog('Configuration', 'Activating Prometheus configuration...', 'INFO');
  try {
    const res = await fetch(`/api/v1/prometheus/configs/${id}/activate`, {
      method: 'POST'
    });
    const result = await res.json();
    if (res.ok && result.success) {
      addLog('Configuration', result.message || 'Prometheus configuration activated successfully.', 'SUCCESS');
      
      // If we are currently on the prometheus page, reload the editor configuration
      const currentHash = window.location.hash;
      if (currentHash === '#prometheus') {
        if (typeof initPrometheusPage === 'function') {
          initPrometheusPage();
        }
      }
      
      await loadSettingsRegistry();
    } else {
      addLog('Configuration', `Activation failed: ${result.message || 'Unknown error'}`, 'ERROR');
    }
  } catch (error) {
    console.error('Error activating configuration:', error);
    addLog('Configuration', 'Network error during configuration activation.', 'ERROR');
  }
}

async function deletePrometheusConfig(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus konfigurasi Prometheus ini?')) return;
  addLog('Configuration', 'Deleting Prometheus configuration...', 'INFO');
  try {
    const res = await fetch(`/api/v1/prometheus/configs/${id}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (res.ok && result.success) {
      addLog('Configuration', result.message || 'Prometheus configuration deleted successfully.', 'SUCCESS');
      await loadSettingsRegistry();
    } else {
      addLog('Configuration', `Deletion failed: ${result.message || 'Unknown error'}`, 'ERROR');
    }
  } catch (error) {
    console.error('Error deleting configuration:', error);
    addLog('Configuration', 'Network error during configuration deletion.', 'ERROR');
  }
}

async function checkPrometheusCardConnection(id) {
  const badge = document.getElementById(`conn-status-${id}`);
  if (!badge) return;

  try {
    const res = await fetch(`/api/v1/prometheus/configs/${id}/test`, {
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
    badge.innerHTML = 'ERROR';
  }
}

async function pingPrometheusServer(id) {
  addLog('Prometheus', `Initiating manual ping to connection ID ${id}...`, 'INFO');
  try {
    const res = await fetch(`/api/v1/prometheus/configs/${id}/test`, {
      method: 'POST'
    });
    const result = await res.json();
    if (res.ok && result.success && result.isConnected) {
      alert('Koneksi Prometheus Sukses!');
      addLog('Prometheus', 'Manual connection check succeeded.', 'SUCCESS');
    } else {
      alert('Koneksi Prometheus Gagal: ' + (result.message || 'Server offline.'));
      addLog('Prometheus', `Manual connection check failed: ${result.message || 'Offline'}`, 'ERROR');
    }
  } catch (err) {
    alert('API Error: ' + err.message);
  }
}

async function saveConnectionConfiguration(event) {
  if (event) event.preventDefault();

  const type = inputConnectionType.value;
  const id = inputConnectionId.value;
  const name = inputConnectionName.value.trim();

  if (!name) {
    showFeedback('danger', 'Form Error', 'Connection name/alias is required.');
    return;
  }

  setLoading(true, 'save');
  hideFeedback();
  addLog('Configuration', `Saving ${type} connection...`, 'INFO');

  try {
    if (type === 'grafana') {
      const host = inputHost.value.trim();
      const token = inputToken.value.trim();
      const datasourceUid = inputDatasource.value.trim();

      if (!host || !token) {
        showFeedback('danger', 'Form Error', 'Host URL and Token are required.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/v1/settings/grafana/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, host, token, datasourceUid })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showFeedback('success', 'Saved Successfully', result.message || 'Grafana configuration saved.');
        addLog('Configuration', `Grafana connection saved: ${name}`, 'SUCCESS');
        clearConnectionForm();
        await loadSettingsRegistry();
      } else {
        showFeedback('danger', 'Save Failed', result.message || result.error || 'Failed to save.');
        addLog('Configuration', `Grafana save failed: ${result.message}`, 'ERROR');
      }
    } else {
      const mode = inputPrometheusMode.value;
      const path = inputPrometheusPath.value.trim();
      const reloadUrl = inputPrometheusReloadUrl.value.trim();
      const sshHost = inputPrometheusSshHost.value.trim();
      const sshPort = parseInt(inputPrometheusSshPort.value.trim() || '22', 10);
      const sshUser = inputPrometheusSshUser.value.trim();
      const sshAuth = inputPrometheusSshAuth.value;
      let sshPassword = inputPrometheusSshPassword.value;
      const sshKey = inputPrometheusSshKey.value;

      if (!path) {
        showFeedback('danger', 'Form Error', 'Config file path is required.');
        setLoading(false);
        return;
      }

      if (mode === 'ssh' && (!sshHost || !sshUser)) {
        showFeedback('danger', 'Form Error', 'SSH host and user are required.');
        setLoading(false);
        return;
      }

      if (sshPassword === '********') {
        sshPassword = undefined;
      }

      const res = await fetch('/api/v1/prometheus/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, mode, path, reloadUrl, sshHost, sshPort, sshUser, sshAuth, sshPassword, sshKey })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showFeedback('success', 'Saved Successfully', result.message || 'Prometheus connection saved.');
        addLog('Configuration', `Prometheus connection saved: ${name}`, 'SUCCESS');
        clearConnectionForm();
        await loadSettingsRegistry();
      } else {
        showFeedback('danger', 'Save Failed', result.message || result.error || 'Failed to save.');
        addLog('Configuration', `Prometheus save failed: ${result.message}`, 'ERROR');
      }
    }
  } catch (error) {
    showFeedback('danger', 'API Error', error.message || 'Failed to communicate with server.');
  } finally {
    setLoading(false);
  }
}

async function testConnectionConfig() {
  const type = inputConnectionType.value;
  hideFeedback();

  if (type === 'grafana') {
    const host = inputHost.value.trim();
    const token = inputToken.value.trim();
    const datasourceUid = inputDatasource.value.trim();

    if (!host || !token) {
      showFeedback('danger', 'Form Error', 'Host URL and Token are required.');
      return;
    }

    setLoading(true, 'test');
    addLog('Grafana API', `Testing connection to ${host}...`, 'INFO');

    try {
      const res = await fetch(API_SETTINGS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test', host, token, datasourceUid })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showFeedback('success', 'Test Successful', result.message || 'Connected to Grafana.');
        addLog('Grafana API', 'Connectivity test successful.', 'SUCCESS');
      } else {
        showFeedback('danger', 'Test Failed', result.message || result.error || 'Failed to connect.');
        addLog('Grafana API', `Connectivity test failed: ${result.message || 'Unknown error'}`, 'ERROR');
      }
    } catch (error) {
      showFeedback('danger', 'API Error', error.message);
    } finally {
      setLoading(false);
    }
  } else {
    const mode = inputPrometheusMode.value;
    const path = inputPrometheusPath.value.trim();
    const reloadUrl = inputPrometheusReloadUrl.value.trim();
    const sshHost = inputPrometheusSshHost.value.trim();
    const sshPort = parseInt(inputPrometheusSshPort.value.trim() || '22', 10);
    const sshUser = inputPrometheusSshUser.value.trim();
    const sshAuth = inputPrometheusSshAuth.value;
    let sshPassword = inputPrometheusSshPassword.value;
    const sshKey = inputPrometheusSshKey.value;

    if (!path) {
      showFeedback('danger', 'Form Error', 'Config file path is required.');
      return;
    }

    if (mode === 'ssh' && (!sshHost || !sshUser)) {
      showFeedback('danger', 'Form Error', 'SSH host and user are required.');
      return;
    }

    if (sshPassword === '********') {
      sshPassword = undefined;
    }

    setLoading(true, 'test');
    addLog('Prometheus', `Testing Prometheus connection...`, 'INFO');

    try {
      const res = await fetch('/api/v1/prometheus/configs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, path, reloadUrl, sshHost, sshPort, sshUser, sshAuth, sshPassword, sshKey })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showFeedback('success', 'Test Successful', result.message || 'Connection test succeeded.');
        addLog('Prometheus', 'Connection test succeeded.', 'SUCCESS');
      } else {
        showFeedback('danger', 'Test Failed', result.message || result.error || 'Failed to connect.');
        addLog('Prometheus', `Connection test failed: ${result.message}`, 'ERROR');
      }
    } catch (error) {
      showFeedback('danger', 'API Error', error.message);
    } finally {
      setLoading(false);
    }
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
      await loadSettingsRegistry();
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

// ==========================================
// EXPORTER INSTALLER FUNCTIONALITY
// ==========================================
let activeExporter = 'node';
let activePlatform = 'linux-amd64';

const installerData = {
  node: {
    name: "Node Exporter",
    category: "system",
    desc: "Host system metrics (CPU, RAM, Disk, Network)",
    repo: "https://github.com/prometheus/node_exporter",
    port: 9100,
    job: `  - job_name: 'node_exporter'
    static_configs:
      - targets: ['localhost:9100']`,
    platforms: {
      "linux-amd64": {
        script: `# Exporter: Node Exporter (Linux AMD64)
# Script ini mendownload versi terbaru dan mendaftarkannya ke Systemd

# 1. Dapatkan versi release terbaru dari GitHub
VERSION=$(curl -s https://api.github.com/repos/prometheus/node_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.8.1"
fi

# 2. Download archive
ARCH="amd64"
URL="https://github.com/prometheus/node_exporter/releases/download/v\${VERSION}/node_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Node Exporter v\${VERSION} (\${ARCH})..."
curl -LO "\$URL"

# 3. Ekstrak dan pindahkan binary
tar -xvf node_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv node_exporter-\${VERSION}.linux-\${ARCH}/node_exporter /usr/bin/

# 4. Buat user sistem (tanpa home & login shell)
sudo useradd --no-create-home --shell /bin/false node_exporter || true

# 5. Daftarkan Service ke Systemd
cat <<EOF | sudo tee /etc/systemd/system/node_exporter.service
[Unit]
Description=Node Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/bin/node_exporter

[Install]
WantedBy=multi-user.target
EOF

# 6. Aktifkan dan jalankan Service
sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter

# 7. Tampilkan status
sudo systemctl status node_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Menggunakan <strong>GitHub API</strong> untuk melacak versi rilis terbaru secara otomatis.</li>
            <li>Mengunduh dan mengekstrak berkas <code>node_exporter</code> untuk arsitektur <strong>Linux AMD64</strong>.</li>
            <li>Memindahkan binary ke <code>/usr/bin</code> dan mendaftarkan service <code>node_exporter.service</code> di systemd.</li>
            <li>Membuat service user terisolasi untuk keamanan maksimum.</li>
          </ul>
        `
      },
      "linux-arm64": {
        script: `# Exporter: Node Exporter (Linux ARM64)
# Cocok untuk Raspberry Pi 3/4/5 atau AWS Graviton instance

VERSION=$(curl -s https://api.github.com/repos/prometheus/node_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.8.1"
fi

ARCH="arm64"
URL="https://github.com/prometheus/node_exporter/releases/download/v\${VERSION}/node_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Node Exporter v\${VERSION} (\${ARCH})..."
curl -LO "\$URL"

tar -xvf node_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv node_exporter-\${VERSION}.linux-\${ARCH}/node_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false node_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/node_exporter.service
[Unit]
Description=Node Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/bin/node_exporter

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter
sudo systemctl status node_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh binary versi ARM64 untuk arsitektur CPU 64-bit ARM.</li>
            <li>Mendaftarkan service systemd dengan privilege non-root menggunakan user <code>node_exporter</code>.</li>
          </ul>
        `
      },
      "linux-armv7": {
        script: `# Exporter: Node Exporter (Linux ARMv7)
# Cocok untuk Raspberry Pi versi lama (OS 32-bit)

VERSION=$(curl -s https://api.github.com/repos/prometheus/node_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.8.1"
fi

ARCH="armv7"
URL="https://github.com/prometheus/node_exporter/releases/download/v\${VERSION}/node_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Node Exporter v\${VERSION} (\${ARCH})..."
curl -LO "\$URL"

tar -xvf node_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv node_exporter-\${VERSION}.linux-\${ARCH}/node_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false node_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/node_exporter.service
[Unit]
Description=Node Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=node_exporter
Group=node_exporter
Type=simple
ExecStart=/usr/bin/node_exporter

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable node_exporter
sudo systemctl start node_exporter
sudo systemctl status node_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh binary versi ARMv7 untuk arsitektur CPU 32-bit ARM.</li>
            <li>Mendaftarkan service systemd secara otomatis.</li>
          </ul>
        `
      },
      "windows-amd64": {
        script: `# Windows PowerShell Script to Install windows_exporter (WMI)
# Jalankan PowerShell sebagai Administrator dan paste script berikut:

$version = (Invoke-RestMethod -Uri "https://api.github.com/repos/prometheus-community/windows_exporter/releases/latest").tag_name
$version = $version -replace '^v', ''
if (!$version) { $version = "0.27.2" }

$url = "https://github.com/prometheus-community/windows_exporter/releases/download/v$version/windows_exporter-$version-amd64.msi"
$output = "$env:TEMP\\windows_exporter.msi"

Write-Host "Downloading windows_exporter v$version..."
Invoke-WebRequest -Uri $url -OutFile $output

Write-Host "Installing windows_exporter as a service..."
Start-Process msiexec.exe -ArgumentList "/i $output /quiet /qn /norestart ENABLED_COLLECTORS=cpu,memory,net,logical_disk,os,system" -Wait

Write-Host "Service installed and started successfully!"
Get-Service -Name "windows_exporter"
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>PowerShell script ini mengunduh installer <strong>MSI</strong> langsung dari rilis GitHub <code>prometheus-community/windows_exporter</code>.</li>
            <li>Melakukan instalasi silent background (quiet install) dengan mendaftarkannya sebagai Windows Service otomatis.</li>
            <li>Secara default mengaktifkan kolektor CPU, Memory, Network, Disk, OS, dan System.</li>
          </ul>
        `
      },
      "macos": {
        script: `# macOS Installation via Homebrew

# 1. Install Node Exporter menggunakan Homebrew
brew install node_exporter

# 2. Daftarkan sebagai background service macOS (Launchd) dan langsung jalankan
brew services start node_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Menggunakan manajer paket Homebrew untuk instalasi terstandarisasi di macOS.</li>
            <li><code>brew services start</code> mendaftarkan Launchd agent agar exporter otomatis berjalan saat booting.</li>
          </ul>
        `
      }
    }
  },
  blackbox: {
    name: "Blackbox Exporter",
    category: "network",
    desc: "Network probing (HTTP, HTTPS, DNS, TCP, ICMP)",
    repo: "https://github.com/prometheus/blackbox_exporter",
    port: 9115,
    job: `  - job_name: 'blackbox'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
        - http://prometheus.io
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: 127.0.0.1:9115`,
    platforms: {
      "linux-amd64": {
        script: `# Exporter: Blackbox Exporter (Linux AMD64)

VERSION=$(curl -s https://api.github.com/repos/prometheus/blackbox_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.25.0"
fi

ARCH="amd64"
URL="https://github.com/prometheus/blackbox_exporter/releases/download/v\${VERSION}/blackbox_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Blackbox Exporter v\${VERSION} (\${ARCH})..."
curl -LO "\$URL"

tar -xvf blackbox_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv blackbox_exporter-\${VERSION}.linux-\${ARCH}/blackbox_exporter /usr/bin/

# Buat direktori konfigurasi dan salin file bawaan
sudo mkdir -p /etc/blackbox_exporter
sudo mv blackbox_exporter-\${VERSION}.linux-\${ARCH}/blackbox.yml /etc/blackbox_exporter/

sudo useradd --no-create-home --shell /bin/false blackbox_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/blackbox_exporter.service
[Unit]
Description=Blackbox Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=blackbox_exporter
Group=blackbox_exporter
Type=simple
ExecStart=/usr/bin/blackbox_exporter --config.file=/etc/blackbox_exporter/blackbox.yml

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable blackbox_exporter
sudo systemctl start blackbox_exporter
sudo systemctl status blackbox_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis biner Blackbox Exporter terbaru untuk sistem Linux AMD64.</li>
            <li>Memindahkan konfigurasi default <code>blackbox.yml</code> ke <code>/etc/blackbox_exporter/</code>.</li>
            <li>Mendaftarkan service systemd dengan argumen file konfigurasi eksplisit.</li>
          </ul>
        `
      },
      "linux-arm64": {
        script: `# Exporter: Blackbox Exporter (Linux ARM64)

VERSION=$(curl -s https://api.github.com/repos/prometheus/blackbox_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.25.0"
fi

ARCH="arm64"
URL="https://github.com/prometheus/blackbox_exporter/releases/download/v\${VERSION}/blackbox_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Blackbox Exporter v\${VERSION} (\${ARCH})..."
curl -LO "\$URL"

tar -xvf blackbox_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv blackbox_exporter-\${VERSION}.linux-\${ARCH}/blackbox_exporter /usr/bin/

sudo mkdir -p /etc/blackbox_exporter
sudo mv blackbox_exporter-\${VERSION}.linux-\${ARCH}/blackbox.yml /etc/blackbox_exporter/

sudo useradd --no-create-home --shell /bin/false blackbox_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/blackbox_exporter.service
[Unit]
Description=Blackbox Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=blackbox_exporter
Group=blackbox_exporter
Type=simple
ExecStart=/usr/bin/blackbox_exporter --config.file=/etc/blackbox_exporter/blackbox.yml

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable blackbox_exporter
sudo systemctl start blackbox_exporter
sudo systemctl status blackbox_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARM64 untuk platform 64-bit ARM.</li>
            <li>Mendaftarkan konfigurasi dan systemd service.</li>
          </ul>
        `
      },
      "linux-armv7": {
        script: `# Exporter: Blackbox Exporter (Linux ARMv7)

VERSION=$(curl -s https://api.github.com/repos/prometheus/blackbox_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.25.0"
fi

ARCH="armv7"
URL="https://github.com/prometheus/blackbox_exporter/releases/download/v\${VERSION}/blackbox_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Blackbox Exporter v\${VERSION} (\${ARCH})..."
curl -LO "\$URL"

tar -xvf blackbox_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv blackbox_exporter-\${VERSION}.linux-\${ARCH}/blackbox_exporter /usr/bin/

sudo mkdir -p /etc/blackbox_exporter
sudo mv blackbox_exporter-\${VERSION}.linux-\${ARCH}/blackbox.yml /etc/blackbox_exporter/

sudo useradd --no-create-home --shell /bin/false blackbox_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/blackbox_exporter.service
[Unit]
Description=Blackbox Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=blackbox_exporter
Group=blackbox_exporter
Type=simple
ExecStart=/usr/bin/blackbox_exporter --config.file=/etc/blackbox_exporter/blackbox.yml

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable blackbox_exporter
sudo systemctl start blackbox_exporter
sudo systemctl status blackbox_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARMv7 untuk platform 32-bit ARM.</li>
            <li>Mendaftarkan service systemd.</li>
          </ul>
        `
      },
      "windows-amd64": {
        script: `# Windows PowerShell Script to Install blackbox_exporter
# Jalankan PowerShell sebagai Administrator:

$version = (Invoke-RestMethod -Uri "https://api.github.com/repos/prometheus/blackbox_exporter/releases/latest").tag_name
$version = $version -replace '^v', ''
if (!$version) { $version = "0.25.0" }

$url = "https://github.com/prometheus/blackbox_exporter/releases/download/v$version/blackbox_exporter-$version.windows-amd64.zip"
$output = "$env:TEMP\\blackbox_exporter.zip"
$dest = "C:\\Program Files\\blackbox_exporter"

Write-Host "Downloading blackbox_exporter v$version..."
Invoke-WebRequest -Uri $url -OutFile $output

Write-Host "Extracting files..."
Expand-Archive -Path $output -DestinationPath $dest -Force
Move-Item -Path "$dest\\blackbox_exporter-$version.windows-amd64\\*" -Destination $dest -Force -ErrorAction SilentlyContinue

Write-Host "Registering Service using PowerShell sc utility..."
New-Service -Name "blackbox_exporter" -BinaryPathName "$dest\\blackbox_exporter.exe --config.file=\`"$dest\\blackbox.yml\`"" -DisplayName "Blackbox Exporter" -StartupType Automatic

Write-Host "Starting service..."
Start-Service -Name "blackbox_exporter"
Get-Service -Name "blackbox_exporter"
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>PowerShell script ini mengunduh berkas biner ZIP dari rilis resmi GitHub.</li>
            <li>Mengekstrak file ke folder <code>C:\\Program Files\\blackbox_exporter</code>.</li>
            <li>Menggunakan utility bawaan Windows <code>New-Service</code> untuk mendaftarkannya sebagai background Windows Service.</li>
          </ul>
        `
      },
      "macos": {
        script: `# macOS Installation via Homebrew

brew install blackbox_exporter
brew services start blackbox_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Menggunakan Homebrew untuk manajemen lifecycle service otomatis di macOS.</li>
          </ul>
        `
      }
    }
  },
  snmp: {
    name: "SNMP Exporter",
    category: "network",
    desc: "Network devices metrics monitoring (SNMP v1/v2/v3)",
    repo: "https://github.com/prometheus/snmp_exporter",
    port: 9116,
    job: `  - job_name: 'snmp'
    static_configs:
      - targets:
        - 192.168.1.1 # Mikrotik/Device IP
    metrics_path: /snmp
    params:
      module: [if_mib]
    relabel_configs:
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: 127.0.0.1:9116`,
    platforms: {
      "linux-amd64": {
        script: `# Exporter: SNMP Exporter (Linux AMD64)

VERSION=$(curl -s https://api.github.com/repos/prometheus/snmp_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.26.0"
fi

ARCH="amd64"
URL="https://github.com/prometheus/snmp_exporter/releases/download/v\${VERSION}/snmp_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading SNMP Exporter v\${VERSION} (\${ARCH})..."
curl -LO "\$URL"

tar -xvf snmp_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv snmp_exporter-\${VERSION}.linux-\${ARCH}/snmp_exporter /usr/bin/

sudo mkdir -p /etc/snmp_exporter
sudo mv snmp_exporter-\${VERSION}.linux-\${ARCH}/snmp.yml /etc/snmp_exporter/

sudo useradd --no-create-home --shell /bin/false snmp_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/snmp_exporter.service
[Unit]
Description=SNMP Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=snmp_exporter
Group=snmp_exporter
Type=simple
ExecStart=/usr/bin/snmp_exporter --config.file=/etc/snmp_exporter/snmp.yml

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable snmp_exporter
sudo systemctl start snmp_exporter
sudo systemctl status snmp_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh biner SNMP Exporter terbaru untuk sistem Linux AMD64.</li>
            <li>Memindahkan konfigurasi generator MIB default <code>snmp.yml</code> ke <code>/etc/snmp_exporter/</code>.</li>
            <li>Mendaftarkan service systemd.</li>
          </ul>
        `
      },
      "linux-arm64": {
        script: `# Exporter: SNMP Exporter (Linux ARM64)

VERSION=$(curl -s https://api.github.com/repos/prometheus/snmp_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.26.0"
fi

ARCH="arm64"
URL="https://github.com/prometheus/snmp_exporter/releases/download/v\${VERSION}/snmp_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading SNMP Exporter v\${VERSION} (\${ARCH})..."
curl -LO "\$URL"

tar -xvf snmp_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv snmp_exporter-\${VERSION}.linux-\${ARCH}/snmp_exporter /usr/bin/

sudo mkdir -p /etc/snmp_exporter
sudo mv snmp_exporter-\${VERSION}.linux-\${ARCH}/snmp.yml /etc/snmp_exporter/

sudo useradd --no-create-home --shell /bin/false snmp_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/snmp_exporter.service
[Unit]
Description=SNMP Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=snmp_exporter
Group=snmp_exporter
Type=simple
ExecStart=/usr/bin/snmp_exporter --config.file=/etc/snmp_exporter/snmp.yml

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable snmp_exporter
sudo systemctl start snmp_exporter
sudo systemctl status snmp_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARM64 untuk platform 64-bit ARM.</li>
            <li>Mendaftarkan konfigurasi dan systemd service.</li>
          </ul>
        `
      },
      "linux-armv7": {
        script: `# Exporter: SNMP Exporter (Linux ARMv7)

VERSION=$(curl -s https://api.github.com/repos/prometheus/snmp_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.26.0"
fi

ARCH="armv7"
URL="https://github.com/prometheus/snmp_exporter/releases/download/v\${VERSION}/snmp_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading SNMP Exporter v\${VERSION} (\${ARCH})..."
curl -LO "\$URL"

tar -xvf snmp_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv snmp_exporter-\${VERSION}.linux-\${ARCH}/snmp_exporter /usr/bin/

sudo mkdir -p /etc/snmp_exporter
sudo mv snmp_exporter-\${VERSION}.linux-\${ARCH}/snmp.yml /etc/snmp_exporter/

sudo useradd --no-create-home --shell /bin/false snmp_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/snmp_exporter.service
[Unit]
Description=SNMP Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=snmp_exporter
Group=snmp_exporter
Type=simple
ExecStart=/usr/bin/snmp_exporter --config.file=/etc/snmp_exporter/snmp.yml

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable snmp_exporter
sudo systemctl start snmp_exporter
sudo systemctl status snmp_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARMv7 untuk platform 32-bit ARM.</li>
            <li>Mendaftarkan service systemd.</li>
          </ul>
        `
      },
      "windows-amd64": {
        script: `# Windows PowerShell Script to Install snmp_exporter
# Jalankan PowerShell sebagai Administrator:

$version = (Invoke-RestMethod -Uri "https://api.github.com/repos/prometheus/snmp_exporter/releases/latest").tag_name
$version = $version -replace '^v', ''
if (!$version) { $version = "0.26.0" }

$url = "https://github.com/prometheus/snmp_exporter/releases/download/v$version/snmp_exporter-$version.windows-amd64.zip"
$output = "$env:TEMP\\snmp_exporter.zip"
$dest = "C:\\Program Files\\snmp_exporter"

Write-Host "Downloading snmp_exporter v$version..."
Invoke-WebRequest -Uri $url -OutFile $output

Write-Host "Extracting files..."
Expand-Archive -Path $output -DestinationPath $dest -Force
Move-Item -Path "$dest\\snmp_exporter-$version.windows-amd64\\*" -Destination $dest -Force -ErrorAction SilentlyContinue

Write-Host "Registering Service..."
New-Service -Name "snmp_exporter" -BinaryPathName "$dest\\snmp_exporter.exe --config.file=\`"$dest\\snmp.yml\`"" -DisplayName "SNMP Exporter" -StartupType Automatic

Write-Host "Starting service..."
Start-Service -Name "snmp_exporter"
Get-Service -Name "snmp_exporter"
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>PowerShell script ini mengunduh SNMP Exporter ZIP biner, mengekstraknya ke <code>Program Files</code>, dan mendaftarkannya sebagai Windows Service otomatis.</li>
          </ul>
        `
      },
      "macos": {
        script: `# macOS Installation via Homebrew

brew install snmp_exporter
brew services start snmp_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Menggunakan Homebrew untuk mengelola service SNMP Exporter di macOS.</li>
          </ul>
        `
      }
    }
  },
  mysqld: {
    name: "MySQLD Exporter",
    category: "database",
    desc: "MySQL database server metrics",
    repo: "https://github.com/prometheus/mysqld_exporter",
    port: 9104,
    job: `  - job_name: 'mysqld_exporter'
    static_configs:
      - targets: ['localhost:9104']`,
    platforms: {
      "linux-amd64": {
        script: `# Exporter: MySQLD Exporter (Linux AMD64)

VERSION=$(curl -s https://api.github.com/repos/prometheus/mysqld_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.15.1"
fi

ARCH="amd64"
URL="https://github.com/prometheus/mysqld_exporter/releases/download/v\${VERSION}/mysqld_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading MySQLD Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf mysqld_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv mysqld_exporter-\${VERSION}.linux-\${ARCH}/mysqld_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false mysqld_exporter || true

# Systemd Service Configuration
# Catatan: DATA_SOURCE_NAME harus disesuaikan dengan user & password MySQL Anda
cat <<EOF | sudo tee /etc/systemd/system/mysqld_exporter.service
[Unit]
Description=MySQLD Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=mysqld_exporter
Group=mysqld_exporter
Type=simple
Environment=DATA_SOURCE_NAME="user:password@(localhost:3306)/"
ExecStart=/usr/bin/mysqld_exporter

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mysqld_exporter
sudo systemctl start mysqld_exporter
sudo systemctl status mysqld_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis MySQLD Exporter resmi terbaru untuk Linux AMD64.</li>
            <li>Memindahkan binary ke <code>/usr/bin</code> dan mendaftarkan service systemd.</li>
            <li>Menggunakan variabel lingkungan <code>DATA_SOURCE_NAME</code> untuk kredensial koneksi database MySQL.</li>
          </ul>
        `
      },
      "linux-arm64": {
        script: `# Exporter: MySQLD Exporter (Linux ARM64)

VERSION=$(curl -s https://api.github.com/repos/prometheus/mysqld_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.15.1"
fi

ARCH="arm64"
URL="https://github.com/prometheus/mysqld_exporter/releases/download/v\${VERSION}/mysqld_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading MySQLD Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf mysqld_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv mysqld_exporter-\${VERSION}.linux-\${ARCH}/mysqld_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false mysqld_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/mysqld_exporter.service
[Unit]
Description=MySQLD Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=mysqld_exporter
Group=mysqld_exporter
Type=simple
Environment=DATA_SOURCE_NAME="user:password@(localhost:3306)/"
ExecStart=/usr/bin/mysqld_exporter

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mysqld_exporter
sudo systemctl start mysqld_exporter
sudo systemctl status mysqld_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARM64 untuk platform 64-bit ARM.</li>
          </ul>
        `
      },
      "linux-armv7": {
        script: `# Exporter: MySQLD Exporter (Linux ARMv7)

VERSION=$(curl -s https://api.github.com/repos/prometheus/mysqld_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.15.1"
fi

ARCH="armv7"
URL="https://github.com/prometheus/mysqld_exporter/releases/download/v\${VERSION}/mysqld_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading MySQLD Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf mysqld_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv mysqld_exporter-\${VERSION}.linux-\${ARCH}/mysqld_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false mysqld_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/mysqld_exporter.service
[Unit]
Description=MySQLD Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=mysqld_exporter
Group=mysqld_exporter
Type=simple
Environment=DATA_SOURCE_NAME="user:password@(localhost:3306)/"
ExecStart=/usr/bin/mysqld_exporter

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable mysqld_exporter
sudo systemctl start mysqld_exporter
sudo systemctl status mysqld_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARMv7 untuk platform 32-bit ARM.</li>
          </ul>
        `
      },
      "windows-amd64": {
        script: `# Windows Installation (MySQLD Exporter)
# Jalankan PowerShell sebagai Administrator:

$version = (Invoke-RestMethod -Uri "https://api.github.com/repos/prometheus/mysqld_exporter/releases/latest").tag_name
$version = $version -replace '^v', ''
if (!$version) { $version = "0.15.1" }

$url = "https://github.com/prometheus/mysqld_exporter/releases/download/v$version/mysqld_exporter-$version.windows-amd64.zip"
$output = "$env:TEMP\\mysqld_exporter.zip"
$dest = "C:\\Program Files\\mysqld_exporter"

Write-Host "Downloading mysqld_exporter v$version..."
Invoke-WebRequest -Uri $url -OutFile $output

Write-Host "Extracting files..."
Expand-Archive -Path $output -DestinationPath $dest -Force
Move-Item -Path "$dest\\mysqld_exporter-$version.windows-amd64\\*" -Destination $dest -Force -ErrorAction SilentlyContinue

# Jalankan service dengan environment variables untuk kredensial
$mySqlDSN = "user:password@(localhost:3306)/"
[Environment]::SetEnvironmentVariable("DATA_SOURCE_NAME", $mySqlDSN, "Machine")

New-Service -Name "mysqld_exporter" -BinaryPathName "$dest\\mysqld_exporter.exe" -DisplayName "MySQLD Exporter" -StartupType Automatic
Start-Service -Name "mysqld_exporter"
Get-Service -Name "mysqld_exporter"
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis Windows ZIP, mengekstrak, dan membuat Windows Service <code>mysqld_exporter</code>.</li>
            <li>Mengatur environment variable tingkat mesin <code>DATA_SOURCE_NAME</code> untuk kredensial MySQL.</li>
          </ul>
        `
      },
      "macos": {
        script: `# macOS Installation via Homebrew
brew install mysqld_exporter
# Atur environment variable di launchd atau jalankan langsung dengan DSN
export DATA_SOURCE_NAME="user:password@(localhost:3306)/"
mysqld_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Menggunakan Homebrew untuk instalasi client macOS.</li>
          </ul>
        `
      }
    }
  },
  postgres: {
    name: "PostgreSQL Exporter",
    category: "database",
    desc: "PostgreSQL database server metrics",
    repo: "https://github.com/prometheus-community/postgres_exporter",
    port: 9187,
    job: `  - job_name: 'postgres_exporter'
    static_configs:
      - targets: ['localhost:9187']`,
    platforms: {
      "linux-amd64": {
        script: `# Exporter: Postgres Exporter (Linux AMD64)

VERSION=$(curl -s https://api.github.com/repos/prometheus-community/postgres_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.15.0"
fi

ARCH="amd64"
URL="https://github.com/prometheus-community/postgres_exporter/releases/download/v\${VERSION}/postgres_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Postgres Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf postgres_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv postgres_exporter-\${VERSION}.linux-\${ARCH}/postgres_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false postgres_exporter || true

# Systemd Service Configuration
cat <<EOF | sudo tee /etc/systemd/system/postgres_exporter.service
[Unit]
Description=Postgres Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=postgres_exporter
Group=postgres_exporter
Type=simple
Environment=DATA_SOURCE_NAME="postgresql://username:password@localhost:5432/postgres?sslmode=disable"
ExecStart=/usr/bin/postgres_exporter

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable postgres_exporter
sudo systemctl start postgres_exporter
sudo systemctl status postgres_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis Postgres Exporter resmi terbaru untuk Linux AMD64.</li>
            <li>Memindahkan binary ke <code>/usr/bin</code> dan mendaftarkan service systemd.</li>
            <li>Menggunakan variabel lingkungan <code>DATA_SOURCE_NAME</code> untuk URI koneksi PostgreSQL.</li>
          </ul>
        `
      },
      "linux-arm64": {
        script: `# Exporter: Postgres Exporter (Linux ARM64)

VERSION=$(curl -s https://api.github.com/repos/prometheus-community/postgres_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.15.0"
fi

ARCH="arm64"
URL="https://github.com/prometheus-community/postgres_exporter/releases/download/v\${VERSION}/postgres_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Postgres Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf postgres_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv postgres_exporter-\${VERSION}.linux-\${ARCH}/postgres_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false postgres_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/postgres_exporter.service
[Unit]
Description=Postgres Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=postgres_exporter
Group=postgres_exporter
Type=simple
Environment=DATA_SOURCE_NAME="postgresql://username:password@localhost:5432/postgres?sslmode=disable"
ExecStart=/usr/bin/postgres_exporter

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable postgres_exporter
sudo systemctl start postgres_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARM64 untuk platform 64-bit ARM.</li>
          </ul>
        `
      },
      "linux-armv7": {
        script: `# Exporter: Postgres Exporter (Linux ARMv7)

VERSION=$(curl -s https://api.github.com/repos/prometheus-community/postgres_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.15.0"
fi

ARCH="armv7"
URL="https://github.com/prometheus-community/postgres_exporter/releases/download/v\${VERSION}/postgres_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Postgres Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf postgres_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv postgres_exporter-\${VERSION}.linux-\${ARCH}/postgres_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false postgres_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/postgres_exporter.service
[Unit]
Description=Postgres Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=postgres_exporter
Group=postgres_exporter
Type=simple
Environment=DATA_SOURCE_NAME="postgresql://username:password@localhost:5432/postgres?sslmode=disable"
ExecStart=/usr/bin/postgres_exporter

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable postgres_exporter
sudo systemctl start postgres_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARMv7 untuk platform 32-bit ARM.</li>
          </ul>
        `
      },
      "windows-amd64": {
        script: `# Windows Installation (PostgreSQL Exporter)
# Jalankan PowerShell sebagai Administrator:

$version = (Invoke-RestMethod -Uri "https://api.github.com/repos/prometheus-community/postgres_exporter/releases/latest").tag_name
$version = $version -replace '^v', ''
if (!$version) { $version = "0.15.0" }

$url = "https://github.com/prometheus-community/postgres_exporter/releases/download/v$version/postgres_exporter-$version.windows-amd64.zip"
$output = "$env:TEMP\\postgres_exporter.zip"
$dest = "C:\\Program Files\\postgres_exporter"

Write-Host "Downloading postgres_exporter v$version..."
Invoke-WebRequest -Uri $url -OutFile $output

Write-Host "Extracting files..."
Expand-Archive -Path $output -DestinationPath $dest -Force
Move-Item -Path "$dest\\postgres_exporter-$version.windows-amd64\\*" -Destination $dest -Force -ErrorAction SilentlyContinue

$postgresDSN = "postgresql://username:password@localhost:5432/postgres?sslmode=disable"
[Environment]::SetEnvironmentVariable("DATA_SOURCE_NAME", $postgresDSN, "Machine")

New-Service -Name "postgres_exporter" -BinaryPathName "$dest\\postgres_exporter.exe" -DisplayName "PostgreSQL Exporter" -StartupType Automatic
Start-Service -Name "postgres_exporter"
Get-Service -Name "postgres_exporter"
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh ZIP rilis Windows, mengekstrak, dan mendaftarkannya sebagai Windows Service otomatis.</li>
          </ul>
        `
      },
      "macos": {
        script: `# macOS Installation via Homebrew
brew install postgres_exporter
export DATA_SOURCE_NAME="postgresql://username:password@localhost:5432/postgres?sslmode=disable"
postgres_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Instalasi menggunakan Homebrew untuk macOS.</li>
          </ul>
        `
      }
    }
  },
  redis: {
    name: "Redis Exporter",
    category: "database",
    desc: "Redis In-Memory Key-Value store metrics",
    repo: "https://github.com/oliver006/redis_exporter",
    port: 9121,
    job: `  - job_name: 'redis_exporter'
    static_configs:
      - targets: ['localhost:9121']`,
    platforms: {
      "linux-amd64": {
        script: `# Exporter: Redis Exporter (Linux AMD64)

VERSION=$(curl -s https://api.github.com/repos/oliver006/redis_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.58.0"
fi

ARCH="amd64"
URL="https://github.com/oliver006/redis_exporter/releases/download/v\${VERSION}/redis_exporter-v\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Redis Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf redis_exporter-v\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv redis_exporter-v\${VERSION}.linux-\${ARCH}/redis_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false redis_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/redis_exporter.service
[Unit]
Description=Redis Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=redis_exporter
Group=redis_exporter
Type=simple
ExecStart=/usr/bin/redis_exporter -redis.addr localhost:6379

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable redis_exporter
sudo systemctl start redis_exporter
sudo systemctl status redis_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis Redis Exporter (oliver006/redis_exporter) terbaru.</li>
            <li>Mendaftarkan service systemd with flag <code>-redis.addr</code> to your local Redis instance.</li>
          </ul>
        `
      },
      "linux-arm64": {
        script: `# Exporter: Redis Exporter (Linux ARM64)

VERSION=$(curl -s https://api.github.com/repos/oliver006/redis_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.58.0"
fi

ARCH="arm64"
URL="https://github.com/oliver006/redis_exporter/releases/download/v\${VERSION}/redis_exporter-v\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Redis Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf redis_exporter-v\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv redis_exporter-v\${VERSION}.linux-\${ARCH}/redis_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false redis_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/redis_exporter.service
[Unit]
Description=Redis Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=redis_exporter
Group=redis_exporter
Type=simple
ExecStart=/usr/bin/redis_exporter -redis.addr localhost:6379

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable redis_exporter
sudo systemctl start redis_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARM64 untuk platform 64-bit ARM.</li>
          </ul>
        `
      },
      "linux-armv7": {
        script: `# Exporter: Redis Exporter (Linux ARMv7)

VERSION=$(curl -s https://api.github.com/repos/oliver006/redis_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.58.0"
fi

ARCH="armv7"
URL="https://github.com/oliver006/redis_exporter/releases/download/v\${VERSION}/redis_exporter-v\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Redis Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf redis_exporter-v\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv redis_exporter-v\${VERSION}.linux-\${ARCH}/redis_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false redis_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/redis_exporter.service
[Unit]
Description=Redis Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=redis_exporter
Group=redis_exporter
Type=simple
ExecStart=/usr/bin/redis_exporter -redis.addr localhost:6379

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable redis_exporter
sudo systemctl start redis_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARMv7 untuk platform 32-bit ARM.</li>
          </ul>
        `
      },
      "windows-amd64": {
        script: `# Windows Installation (Redis Exporter)
# Jalankan PowerShell sebagai Administrator:

$version = (Invoke-RestMethod -Uri "https://api.github.com/repos/oliver006/redis_exporter/releases/latest").tag_name
if (!$version) { $version = "v1.58.0" }

$url = "https://github.com/oliver006/redis_exporter/releases/download/$version/redis_exporter-$version.windows-amd64.zip"
$output = "$env:TEMP\\redis_exporter.zip"
$dest = "C:\\Program Files\\redis_exporter"

Write-Host "Downloading redis_exporter $version..."
Invoke-WebRequest -Uri $url -OutFile $output

Write-Host "Extracting files..."
Expand-Archive -Path $output -DestinationPath $dest -Force
Move-Item -Path "$dest\\redis_exporter-$version.windows-amd64\\*" -Destination $dest -Force -ErrorAction SilentlyContinue

New-Service -Name "redis_exporter" -BinaryPathName "$dest\\redis_exporter.exe -redis.addr localhost:6379" -DisplayName "Redis Exporter" -StartupType Automatic
Start-Service -Name "redis_exporter"
Get-Service -Name "redis_exporter"
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh dan mengekstrak zip redis_exporter untuk Windows AMD64.</li>
            <li>Membuat Windows Service otomatis.</li>
          </ul>
        `
      },
      "macos": {
        script: `# macOS Installation via Homebrew
brew install redis_exporter
brew services start redis_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Menggunakan Homebrew untuk macOS.</li>
          </ul>
        `
      }
    }
  },
  nginx: {
    name: "NGINX Exporter",
    category: "webserver",
    desc: "NGINX Web Server stub_status metrics",
    repo: "https://github.com/nginxinc/nginx-prometheus-exporter",
    port: 9113,
    job: `  - job_name: 'nginx_exporter'
    static_configs:
      - targets: ['localhost:9113']`,
    platforms: {
      "linux-amd64": {
        script: `# Exporter: Nginx Exporter (Linux AMD64)

VERSION=$(curl -s https://api.github.com/repos/nginxinc/nginx-prometheus-exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.1.0"
fi

ARCH="amd64"
URL="https://github.com/nginxinc/nginx-prometheus-exporter/releases/download/v\${VERSION}/nginx-prometheus-exporter_\${VERSION}_linux_\${ARCH}.tar.gz"
echo "Downloading Nginx Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf nginx-prometheus-exporter_\${VERSION}_linux_\${ARCH}.tar.gz
sudo mv nginx-prometheus-exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false nginx_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/nginx_exporter.service
[Unit]
Description=Nginx Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=nginx_exporter
Group=nginx_exporter
Type=simple
ExecStart=/usr/bin/nginx-prometheus-exporter -nginx.scrape-uri=http://127.0.0.1/stub_status

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable nginx_exporter
sudo systemctl start nginx_exporter
sudo systemctl status nginx_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis Nginx Prometheus Exporter resmi terbaru.</li>
            <li>Membutuhkan modul <code>stub_status</code> diaktifkan di konfigurasi Nginx Anda.</li>
          </ul>
        `
      },
      "linux-arm64": {
        script: `# Exporter: Nginx Exporter (Linux ARM64)

VERSION=$(curl -s https://api.github.com/repos/nginxinc/nginx-prometheus-exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.1.0"
fi

ARCH="arm64"
URL="https://github.com/nginxinc/nginx-prometheus-exporter/releases/download/v\${VERSION}/nginx-prometheus-exporter_\${VERSION}_linux_\${ARCH}.tar.gz"
echo "Downloading Nginx Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf nginx-prometheus-exporter_\${VERSION}_linux_\${ARCH}.tar.gz
sudo mv nginx-prometheus-exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false nginx_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/nginx_exporter.service
[Unit]
Description=Nginx Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=nginx_exporter
Group=nginx_exporter
Type=simple
ExecStart=/usr/bin/nginx-prometheus-exporter -nginx.scrape-uri=http://127.0.0.1/stub_status

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable nginx_exporter
sudo systemctl start nginx_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARM64 untuk platform 64-bit ARM.</li>
          </ul>
        `
      },
      "linux-armv7": {
        script: `# Exporter: Nginx Exporter (Linux ARMv7)

VERSION=$(curl -s https://api.github.com/repos/nginxinc/nginx-prometheus-exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.1.0"
fi

ARCH="armv7"
URL="https://github.com/nginxinc/nginx-prometheus-exporter/releases/download/v\${VERSION}/nginx-prometheus-exporter_\${VERSION}_linux_\${ARCH}.tar.gz"
echo "Downloading Nginx Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf nginx-prometheus-exporter_\${VERSION}_linux_\${ARCH}.tar.gz
sudo mv nginx-prometheus-exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false nginx_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/nginx_exporter.service
[Unit]
Description=Nginx Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=nginx_exporter
Group=nginx_exporter
Type=simple
ExecStart=/usr/bin/nginx-prometheus-exporter -nginx.scrape-uri=http://127.0.0.1/stub_status

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable nginx_exporter
sudo systemctl start nginx_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARMv7 untuk platform 32-bit ARM.</li>
          </ul>
        `
      },
      "windows-amd64": {
        script: `# Windows Installation (Nginx Exporter)
# Jalankan PowerShell sebagai Administrator:

$version = (Invoke-RestMethod -Uri "https://api.github.com/repos/nginxinc/nginx-prometheus-exporter/releases/latest").tag_name
$version = $version -replace '^v', ''
if (!$version) { $version = "1.1.0" }

$url = "https://github.com/nginxinc/nginx-prometheus-exporter/releases/download/v$version/nginx-prometheus-exporter_\${version}_windows_amd64.zip"
$output = "$env:TEMP\\nginx_exporter.zip"
$dest = "C:\\Program Files\\nginx_exporter"

Write-Host "Downloading nginx_exporter v$version..."
Invoke-WebRequest -Uri $url -OutFile $output

Write-Host "Extracting files..."
Expand-Archive -Path $output -DestinationPath $dest -Force
Move-Item -Path "$dest\\nginx-prometheus-exporter.exe" -Destination $dest -Force -ErrorAction SilentlyContinue

New-Service -Name "nginx_exporter" -BinaryPathName "$dest\\nginx-prometheus-exporter.exe -nginx.scrape-uri=http://127.0.0.1/stub_status" -DisplayName "Nginx Exporter" -StartupType Automatic
Start-Service -Name "nginx_exporter"
Get-Service -Name "nginx_exporter"
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh, mengekstrak, dan mendaftarkannya sebagai Windows Service.</li>
          </ul>
        `
      },
      "macos": {
        script: `# macOS Installation via Homebrew
brew install nginx-prometheus-exporter
brew services start nginx-prometheus-exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Menggunakan Homebrew untuk instalasi client macOS.</li>
          </ul>
        `
      }
    }
  },
  apache: {
    name: "Apache Exporter",
    category: "webserver",
    desc: "Apache HTTPD Web Server server-status metrics",
    repo: "https://github.com/Lusitaniae/apache_exporter",
    port: 9117,
    job: `  - job_name: 'apache_exporter'
    static_configs:
      - targets: ['localhost:9117']`,
    platforms: {
      "linux-amd64": {
        script: `# Exporter: Apache Exporter (Linux AMD64)

VERSION=$(curl -s https://api.github.com/repos/Lusitaniae/apache_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.0.8"
fi

ARCH="amd64"
URL="https://github.com/Lusitaniae/apache_exporter/releases/download/v\${VERSION}/apache_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Apache Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf apache_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv apache_exporter-\${VERSION}.linux-\${ARCH}/apache_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false apache_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/apache_exporter.service
[Unit]
Description=Apache Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=apache_exporter
Group=apache_exporter
Type=simple
ExecStart=/usr/bin/apache_exporter --scrape_uri="http://127.0.0.1/server-status/?auto"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable apache_exporter
sudo systemctl start apache_exporter
sudo systemctl status apache_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis Apache Exporter resmi terbaru untuk Linux AMD64.</li>
            <li>Membutuhkan <code>mod_status</code> diaktifkan di konfigurasi Apache Server Anda dengan parameter <code>ExtendedStatus On</code>.</li>
          </ul>
        `
      },
      "linux-arm64": {
        script: `# Exporter: Apache Exporter (Linux ARM64)

VERSION=$(curl -s https://api.github.com/repos/Lusitaniae/apache_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.0.8"
fi

ARCH="arm64"
URL="https://github.com/Lusitaniae/apache_exporter/releases/download/v\${VERSION}/apache_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Apache Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf apache_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv apache_exporter-\${VERSION}.linux-\${ARCH}/apache_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false apache_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/apache_exporter.service
[Unit]
Description=Apache Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=apache_exporter
Group=apache_exporter
Type=simple
ExecStart=/usr/bin/apache_exporter --scrape_uri="http://127.0.0.1/server-status/?auto"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable apache_exporter
sudo systemctl start apache_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARM64 untuk platform 64-bit ARM.</li>
          </ul>
        `
      },
      "linux-armv7": {
        script: `# Exporter: Apache Exporter (Linux ARMv7)

VERSION=$(curl -s https://api.github.com/repos/Lusitaniae/apache_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="1.0.8"
fi

ARCH="armv7"
URL="https://github.com/Lusitaniae/apache_exporter/releases/download/v\${VERSION}/apache_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading Apache Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf apache_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv apache_exporter-\${VERSION}.linux-\${ARCH}/apache_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false apache_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/apache_exporter.service
[Unit]
Description=Apache Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=apache_exporter
Group=apache_exporter
Type=simple
ExecStart=/usr/bin/apache_exporter --scrape_uri="http://127.0.0.1/server-status/?auto"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable apache_exporter
sudo systemctl start apache_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARMv7 untuk platform 32-bit ARM.</li>
          </ul>
        `
      },
      "windows-amd64": {
        script: `# Windows Installation (Apache Exporter)
# Jalankan PowerShell sebagai Administrator:

$version = (Invoke-RestMethod -Uri "https://api.github.com/repos/Lusitaniae/apache_exporter/releases/latest").tag_name
$version = $version -replace '^v', ''
if (!$version) { $version = "1.0.8" }

$url = "https://github.com/Lusitaniae/apache_exporter/releases/download/v$version/apache_exporter-$version.windows-amd64.zip"
$output = "$env:TEMP\\apache_exporter.zip"
$dest = "C:\\Program Files\\apache_exporter"

Write-Host "Downloading apache_exporter v$version..."
Invoke-WebRequest -Uri $url -OutFile $output

Write-Host "Extracting files..."
Expand-Archive -Path $output -DestinationPath $dest -Force
Move-Item -Path "$dest\\apache_exporter-$version.windows-amd64\\*" -Destination $dest -Force -ErrorAction SilentlyContinue

New-Service -Name "apache_exporter" -BinaryPathName "$dest\\apache_exporter.exe --scrape_uri \`"http://127.0.0.1/server-status/?auto\`"" -DisplayName "Apache Exporter" -StartupType Automatic
Start-Service -Name "apache_exporter"
Get-Service -Name "apache_exporter"
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh dan mengekstrak zip biner, mendaftarkannya sebagai Windows Service otomatis.</li>
          </ul>
        `
      },
      "macos": {
        script: `# macOS Installation via Homebrew
brew install apache-exporter
brew services start apache-exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Menggunakan Homebrew untuk instalasi client macOS.</li>
          </ul>
        `
      }
    }
  },
  haproxy: {
    name: "HAProxy Exporter",
    category: "webserver",
    desc: "HAProxy Load Balancer metrics",
    repo: "https://github.com/prometheus/haproxy_exporter",
    port: 9101,
    job: `  - job_name: 'haproxy_exporter'
    static_configs:
      - targets: ['localhost:9101']`,
    platforms: {
      "linux-amd64": {
        script: `# Exporter: HAProxy Exporter (Linux AMD64)

VERSION=$(curl -s https://api.github.com/repos/prometheus/haproxy_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.15.0"
fi

ARCH="amd64"
URL="https://github.com/prometheus/haproxy_exporter/releases/download/v\${VERSION}/haproxy_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading HAProxy Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf haproxy_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv haproxy_exporter-\${VERSION}.linux-\${ARCH}/haproxy_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false haproxy_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/haproxy_exporter.service
[Unit]
Description=HAProxy Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=haproxy_exporter
Group=haproxy_exporter
Type=simple
ExecStart=/usr/bin/haproxy_exporter --haproxy.scrape-uri="http://localhost:1936/;csv"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable haproxy_exporter
sudo systemctl start haproxy_exporter
sudo systemctl status haproxy_exporter --no-pager
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis HAProxy Exporter resmi terbaru untuk Linux AMD64.</li>
            <li>Membutuhkan stats page diaktifkan di konfigurasi HAProxy Anda.</li>
          </ul>
        `
      },
      "linux-arm64": {
        script: `# Exporter: HAProxy Exporter (Linux ARM64)

VERSION=$(curl -s https://api.github.com/repos/prometheus/haproxy_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.15.0"
fi

ARCH="arm64"
URL="https://github.com/prometheus/haproxy_exporter/releases/download/v\${VERSION}/haproxy_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading HAProxy Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf haproxy_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv haproxy_exporter-\${VERSION}.linux-\${ARCH}/haproxy_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false haproxy_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/haproxy_exporter.service
[Unit]
Description=HAProxy Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=haproxy_exporter
Group=haproxy_exporter
Type=simple
ExecStart=/usr/bin/haproxy_exporter --haproxy.scrape-uri="http://localhost:1936/;csv"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable haproxy_exporter
sudo systemctl start haproxy_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARM64 untuk platform 64-bit ARM.</li>
          </ul>
        `
      },
      "linux-armv7": {
        script: `# Exporter: HAProxy Exporter (Linux ARMv7)

VERSION=$(curl -s https://api.github.com/repos/prometheus/haproxy_exporter/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
if [ -z "$VERSION" ]; then
  VERSION="0.15.0"
fi

ARCH="armv7"
URL="https://github.com/prometheus/haproxy_exporter/releases/download/v\${VERSION}/haproxy_exporter-\${VERSION}.linux-\${ARCH}.tar.gz"
echo "Downloading HAProxy Exporter v\${VERSION}..."
curl -LO "\$URL"

tar -xvf haproxy_exporter-\${VERSION}.linux-\${ARCH}.tar.gz
sudo mv haproxy_exporter-\${VERSION}.linux-\${ARCH}/haproxy_exporter /usr/bin/

sudo useradd --no-create-home --shell /bin/false haproxy_exporter || true

cat <<EOF | sudo tee /etc/systemd/system/haproxy_exporter.service
[Unit]
Description=HAProxy Exporter
Wants=network-online.target
After=network-online.target

[Service]
User=haproxy_exporter
Group=haproxy_exporter
Type=simple
ExecStart=/usr/bin/haproxy_exporter --haproxy.scrape-uri="http://localhost:1936/;csv"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable haproxy_exporter
sudo systemctl start haproxy_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh rilis ARMv7 untuk platform 32-bit ARM.</li>
          </ul>
        `
      },
      "windows-amd64": {
        script: `# Windows Installation (HAProxy Exporter)
# Jalankan PowerShell sebagai Administrator:

$version = (Invoke-RestMethod -Uri "https://api.github.com/repos/prometheus/haproxy_exporter/releases/latest").tag_name
$version = $version -replace '^v', ''
if (!$version) { $version = "0.15.0" }

$url = "https://github.com/prometheus/haproxy_exporter/releases/download/v$version/haproxy_exporter-$version.windows-amd64.zip"
$output = "$env:TEMP\\haproxy_exporter.zip"
$dest = "C:\\Program Files\\haproxy_exporter"

Write-Host "Downloading haproxy_exporter v$version..."
Invoke-WebRequest -Uri $url -OutFile $output

Write-Host "Extracting files..."
Expand-Archive -Path $output -DestinationPath $dest -Force
Move-Item -Path "$dest\\haproxy_exporter-$version.windows-amd64\\*" -Destination $dest -Force -ErrorAction SilentlyContinue

New-Service -Name "haproxy_exporter" -BinaryPathName "$dest\\haproxy_exporter.exe --haproxy.scrape-uri \`"http://localhost:1936/;csv\`"" -DisplayName "HAProxy Exporter" -StartupType Automatic
Start-Service -Name "haproxy_exporter"
Get-Service -Name "haproxy_exporter"
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Mengunduh dan mendaftarkan HAProxy Exporter sebagai Windows Service.</li>
          </ul>
        `
      },
      "macos": {
        script: `# macOS Installation via Homebrew
brew install haproxy_exporter
brew services start haproxy_exporter
`,
        explanation: `
          <ul style="padding-left: 20px; font-size: 11.5px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px;">
            <li>Menggunakan Homebrew untuk instalasi client macOS.</li>
          </ul>
        `
      }
    }
  }
};

function renderExporterCards() {
  const container = document.getElementById('exporter-cards-list');
  if (!container) return;

  const categoryFilter = document.getElementById('exporter-category-filter').value;
  const searchQuery = document.getElementById('exporter-search-input').value.toLowerCase();

  let html = '';
  
  Object.keys(installerData).forEach(key => {
    const item = installerData[key];
    
    // Apply category filter
    if (categoryFilter !== 'all' && item.category !== categoryFilter) {
      return;
    }
    
    // Apply search filter
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery) && !item.desc.toLowerCase().includes(searchQuery)) {
      return;
    }

    const isSelected = key === activeExporter;
    const borderStyle = isSelected ? '2px solid #1971c2' : '1px solid var(--app-border)';
    const bgStyle = isSelected ? 'rgba(25, 113, 194, 0.05)' : 'none';

    html += `
      <div class="stat-card" id="card-exp-${key}" onclick="selectExporter('${key}')" style="cursor: pointer; border: ${borderStyle}; margin-bottom: 0; padding: 16px; background: ${bgStyle};">
        <div class="stat-card-left">
          <span class="stat-card-title">${item.name}</span>
          <span class="stat-card-sub" style="font-size: 10px; margin-top: 4px; line-height: 1.4;">${item.desc}</span>
        </div>
      </div>
    `;
  });

  if (!html) {
    html = `
      <div style="grid-column: span 3; text-align: center; padding: 35px; color: var(--text-muted); font-size: 11px;">
        No exporters found matching the criteria.
      </div>
    `;
  }

  container.innerHTML = html;
}

function filterExporters() {
  renderExporterCards();
}

function selectExporter(expType) {
  activeExporter = expType;
  renderExporterCards();
  renderInstallerContent();
}

function selectPlatform(platformId) {
  activePlatform = platformId;

  const platforms = ['linux-amd64', 'linux-arm64', 'linux-armv7', 'windows-amd64', 'macos'];
  platforms.forEach(p => {
    const el = document.getElementById(`btn-plat-${p}`);
    if (el) {
      if (p === platformId) {
        el.className = 'btn btn-primary';
        el.style.borderColor = '';
      } else {
        el.className = 'btn btn-secondary';
        el.style.borderColor = 'var(--app-border)';
      }
    }
  });

  renderInstallerContent();
}

function renderInstallerContent() {
  const exporter = installerData[activeExporter];
  if (!exporter) return;

  const data = exporter.platforms[activePlatform];
  if (!data) return;

  let scriptText = data.script;

  // Apply robustness wrapper for Linux platforms
  if (activePlatform.startsWith('linux')) {
    let lines = scriptText.split('\n');
    let insertIndex = 0;
    // Find the first line that is not a comment or empty
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() && !lines[i].trim().startsWith('#')) {
        insertIndex = i;
        break;
      }
    }
    lines.splice(insertIndex, 0, 'set -e', '');
    scriptText = lines.join('\n');
    
    // Wrap in a temporary installer script file to prevent copy-paste terminal line execution race conditions
    scriptText = `cat << 'EOF' > install.sh\n${scriptText}\nEOF\nchmod +x install.sh\n./install.sh\nrm install.sh`;
  }

  document.getElementById('installer-script-pre').textContent = scriptText;
  document.getElementById('installer-step-explanation').innerHTML = data.explanation;

  document.getElementById('exporter-github-link').href = exporter.repo;
  document.getElementById('exporter-github-link').textContent = exporter.repo;
  document.getElementById('exporter-default-port').textContent = exporter.port;
  document.getElementById('exporter-prometheus-snippet').textContent = exporter.job;
}

function copyInstallerScript() {
  const text = document.getElementById('installer-script-pre').textContent;
  navigator.clipboard.writeText(text).then(() => {
    addLog('System', `Copied ${installerData[activeExporter].name} (${activePlatform}) installer script to clipboard`, 'SUCCESS');
    alert("Script copied to clipboard!");
  }).catch(err => {
    console.error("Failed to copy script: ", err);
  });
}

function initInstallerPage() {
  // Reset fields
  const catFilter = document.getElementById('exporter-category-filter');
  if (catFilter) catFilter.value = 'all';
  const searchInput = document.getElementById('exporter-search-input');
  if (searchInput) searchInput.value = '';

  selectExporter('node');
  selectPlatform('linux-amd64');
}

// PROMETHEUS CONFIGURATION MANAGER
function initPrometheusPage() {
  const alertEl = document.getElementById('prometheus-alert');
  if (alertEl) alertEl.classList.add('hidden');
  
  const textarea = document.getElementById('prometheus-yaml-textarea');
  if (textarea) {
    textarea.value = 'Loading configuration...';
    textarea.disabled = true;
  }
  
  fetch('/api/v1/prometheus/config')
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        document.getElementById('prometheus-config-path').textContent = data.path;
        textarea.value = data.content;
        textarea.disabled = false;
        addLog('System', `Successfully fetched Prometheus configuration from ${data.path}`, 'SUCCESS');
      } else {
        showPrometheusAlert('error', 'Error Fetching Configuration', data.message || 'Failed to read prometheus.yml');
        textarea.value = '';
        addLog('System', `Failed to fetch Prometheus configuration: ${data.message}`, 'ERROR');
      }
    })
    .catch(err => {
      showPrometheusAlert('error', 'Network Error', err.message || 'Failed to communicate with API server.');
      textarea.value = '';
      addLog('System', `Network error while fetching Prometheus configuration: ${err.message}`, 'ERROR');
    });
}

function showPrometheusAlert(type, title, desc) {
  const alertEl = document.getElementById('prometheus-alert');
  const titleEl = document.getElementById('prometheus-alert-title');
  const descEl = document.getElementById('prometheus-alert-desc');
  
  if (!alertEl || !titleEl || !descEl) return;
  
  alertEl.className = 'alert'; // Reset classes
  alertEl.classList.remove('hidden');
  
  if (type === 'success') {
    alertEl.style.borderLeft = '4px solid #56d364';
    alertEl.style.background = 'rgba(86, 211, 100, 0.1)';
    titleEl.style.color = '#56d364';
  } else {
    alertEl.style.borderLeft = '4px solid #f9826c';
    alertEl.style.background = 'rgba(249, 130, 108, 0.1)';
    titleEl.style.color = '#f9826c';
  }
  
  titleEl.textContent = title;
  descEl.textContent = desc;
}

function validatePrometheusConfig() {
  const textarea = document.getElementById('prometheus-yaml-textarea');
  if (!textarea) return;
  
  const content = textarea.value;
  const btnValidate = document.getElementById('btn-validate-prometheus');
  const btnSave = document.getElementById('btn-save-prometheus');
  const spinner = document.getElementById('spinner-validate-prometheus');
  
  if (btnValidate) btnValidate.disabled = true;
  if (btnSave) btnSave.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  
  fetch('/api/v1/prometheus/config/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })
    .then(response => response.json().then(data => ({ status: response.status, data })))
    .then(({ status, data }) => {
      if (status === 200 && data.success) {
        showPrometheusAlert('success', 'Configuration Check Passed', 'Success! The Prometheus configuration is syntactically and semantically valid.');
        addLog('System', 'Prometheus configuration syntax check passed', 'SUCCESS');
      } else {
        showPrometheusAlert('error', 'Configuration Check Failed', data.message || 'The configuration contains errors.');
        addLog('System', `Prometheus configuration check failed: ${data.message}`, 'ERROR');
      }
    })
    .catch(err => {
      showPrometheusAlert('error', 'Validation Error', err.message || 'Failed to perform validation check.');
      addLog('System', `Error validating Prometheus configuration: ${err.message}`, 'ERROR');
    })
    .finally(() => {
      if (btnValidate) btnValidate.disabled = false;
      if (btnSave) btnSave.disabled = false;
      if (spinner) spinner.classList.add('hidden');
    });
}

function savePrometheusConfig() {
  const textarea = document.getElementById('prometheus-yaml-textarea');
  if (!textarea) return;
  
  const content = textarea.value;
  const btnValidate = document.getElementById('btn-validate-prometheus');
  const btnSave = document.getElementById('btn-save-prometheus');
  const spinner = document.getElementById('spinner-save-prometheus');
  
  if (btnValidate) btnValidate.disabled = true;
  if (btnSave) btnSave.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  
  fetch('/api/v1/prometheus/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  })
    .then(response => response.json().then(data => ({ status: response.status, data })))
    .then(({ status, data }) => {
      if (status === 200 && data.success) {
        showPrometheusAlert('success', 'Configuration Saved', data.message);
        addLog('System', 'Saved new Prometheus configuration and triggered hot-reload', 'SUCCESS');
      } else {
        showPrometheusAlert('error', 'Save Failed', data.message || 'Could not save configuration file.');
        addLog('System', `Failed to save Prometheus configuration: ${data.message}`, 'ERROR');
      }
    })
    .catch(err => {
      showPrometheusAlert('error', 'Save Error', err.message || 'Failed to submit configuration save request.');
      addLog('System', `Error saving Prometheus configuration: ${err.message}`, 'ERROR');
    })
    .finally(() => {
      if (btnValidate) btnValidate.disabled = false;
      if (btnSave) btnSave.disabled = false;
      if (spinner) spinner.classList.add('hidden');
    });
}

function insertExporterJob() {
  const textarea = document.getElementById('prometheus-yaml-textarea');
  if (!textarea) return;

  const exporterKey = activeExporter || 'node';
  const exporter = installerData[exporterKey];
  if (!exporter || !exporter.job) {
    alert("Please select a valid exporter first on the Exporter Installer page.");
    return;
  }

  const jobText = "\n" + exporter.job.trimEnd() + "\n";
  const currentText = textarea.value;

  // Check if job name already exists in configuration to avoid duplicates
  const jobNameMatch = exporter.job.match(/job_name:\s*['"]?([^'"]+)['"]?/);
  if (jobNameMatch && jobNameMatch[1]) {
    const jobName = jobNameMatch[1];
    const regex = new RegExp(`job_name:\\s*['"]?${jobName}['"]?`);
    if (regex.test(currentText)) {
      if (!confirm(`Scrape job for '${jobName}' is already defined in the configuration. Do you still want to insert another copy?`)) {
        return;
      }
    }
  }

  // Find 'scrape_configs:' to insert it under
  const scrapeConfigsIndex = currentText.indexOf('scrape_configs:');
  if (scrapeConfigsIndex !== -1) {
    // Insert after 'scrape_configs:'
    const insertPosition = scrapeConfigsIndex + 'scrape_configs:'.length;
    const before = currentText.substring(0, insertPosition);
    const after = currentText.substring(insertPosition);
    textarea.value = before + jobText + after;
    addLog('System', `Inserted ${exporter.name} scrape job under scrape_configs`, 'SUCCESS');
  } else {
    // Append to the end
    textarea.value = currentText.trimEnd() + "\n\nscrape_configs:" + jobText;
    addLog('System', `Appended scrape_configs and ${exporter.name} scrape job to configuration`, 'SUCCESS');
  }

  // Highlight textarea and focus
  textarea.focus();
  
  // Show a notice in the alert box
  showPrometheusAlert('success', 'Job Snippet Inserted', `Successfully inserted scrape job snippet for ${exporter.name}. Click 'Check Config' to validate or 'Save & Reload' to apply changes.`);
}

// ==========================================
// MONITORING VIEW MODULE FUNCTIONALITY
// ==========================================
let monitoringViews = [];
let activeMonitoringView = null;
let playerMode = 'grid'; // 'grid' | 'slideshow'
let slideshowActive = false;
let slideshowTimer = null;
let currentSlideIndex = 0;
let slideshowRemainingTime = 0;
let slideshowDurationSetting = 10;

function initMonitoringPage() {
  stopSlideshowTimer();
  slideshowActive = false;
  activeMonitoringView = null;
  
  // Reset elements
  document.getElementById('monitoring-player-container').classList.add('hidden');
  document.getElementById('monitoring-list-container').classList.remove('hidden');
  
  loadMonitoringViews();
}

async function loadMonitoringViews() {
  try {
    const res = await fetch('/api/v1/monitoring-views');
    const result = await res.json();
    if (res.ok && result.success) {
      monitoringViews = result.data || [];
      renderMonitoringViews(monitoringViews);
    } else {
      addLog('Monitoring', 'Failed to load monitoring views: ' + (result.message || 'Unknown error'), 'ERROR');
    }
  } catch (error) {
    addLog('Monitoring', 'API connection error while loading views: ' + error.message, 'ERROR');
  }
}

function renderMonitoringViews(views) {
  const grid = document.getElementById('monitoring-views-grid');
  const emptyState = document.getElementById('monitoring-empty-state');
  
  if (views.length === 0) {
    grid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  grid.classList.remove('hidden');
  
  let html = '';
  views.forEach(view => {
    html += `
      <div class="panel" style="display: flex; flex-direction: column; justify-content: space-between; gap: 12px;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <h3 style="margin: 0; font-size: 14px; color: var(--text-white);">${escapeHtml(view.title)}</h3>
            <span class="status-badge status-configured" style="font-size: 9px; font-weight: normal; padding: 2px 6px;">
              ${view.urls.length} Panel${view.urls.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p style="font-size: 12px; color: var(--text-muted); line-height: 1.4; margin-bottom: 12px;">
            ${escapeHtml(view.description || 'No description provided.')}
          </p>
          <div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
            <span>⏱️ Slideshow Interval:</span>
            <strong style="color: var(--text-white);">${view.slideDuration}s</strong>
          </div>
        </div>
        <div style="display: flex; gap: 8px; border-top: 1px solid var(--app-border); padding-top: 12px; margin-top: auto;">
          <button class="btn btn-primary" onclick="startMonitoringPlayer('${view.id}')" style="flex-grow: 1; padding: 6px 12px; font-size: 11px; height: auto; justify-content: center;">
            View / Play
          </button>
          <button class="btn btn-secondary" onclick="openEditMonitoringViewModal('${view.id}')" style="padding: 6px 10px; font-size: 11px; height: auto;" title="Edit View">
            ✏️
          </button>
          <button class="btn btn-danger" onclick="deleteMonitoringView('${view.id}')" style="padding: 6px 10px; font-size: 11px; height: auto;" title="Delete View">
            🗑️
          </button>
        </div>
      </div>
    `;
  });
  grid.innerHTML = html;
}

// Modal management
function openAddMonitoringViewModal() {
  document.getElementById('monitoring-modal-title').textContent = 'Add Monitoring View';
  document.getElementById('monitoring-view-id').value = '';
  document.getElementById('monitoring-title').value = '';
  document.getElementById('monitoring-description').value = '';
  document.getElementById('monitoring-duration').value = '10';
  
  const list = document.getElementById('monitoring-urls-list');
  list.innerHTML = '';
  addMonitoringUrlInput('');
  
  const modal = document.getElementById('modal-monitoring-view');
  modal.classList.add('active');
}

function openEditMonitoringViewModal(id) {
  const view = monitoringViews.find(v => v.id === id);
  if (!view) return;
  
  document.getElementById('monitoring-modal-title').textContent = 'Edit Monitoring View';
  document.getElementById('monitoring-view-id').value = view.id;
  document.getElementById('monitoring-title').value = view.title;
  document.getElementById('monitoring-description').value = view.description || '';
  document.getElementById('monitoring-duration').value = view.slideDuration || '10';
  
  const list = document.getElementById('monitoring-urls-list');
  list.innerHTML = '';
  
  if (view.urls && view.urls.length > 0) {
    view.urls.forEach(url => addMonitoringUrlInput(url));
  } else {
    addMonitoringUrlInput('');
  }
  
  const modal = document.getElementById('modal-monitoring-view');
  modal.classList.add('active');
}

function closeMonitoringViewModal() {
  const modal = document.getElementById('modal-monitoring-view');
  modal.classList.remove('active');
}

function addMonitoringUrlInput(urlVal = '') {
  const list = document.getElementById('monitoring-urls-list');
  const div = document.createElement('div');
  div.className = 'monitoring-url-row';
  div.style.display = 'flex';
  div.style.gap = '8px';
  div.style.width = '100%';
  
  div.innerHTML = `
    <input type="text" class="monitoring-url-input" value="${escapeHtml(urlVal)}" placeholder="http://localhost:3000/d-solo/..." style="background: var(--app-card-dark); border: 1px solid var(--app-border); color: var(--text-white); padding: 8px 12px; border-radius: 4px; font-size: 12px; flex-grow: 1; box-sizing: border-box;">
    <button class="btn btn-danger" onclick="this.parentNode.remove()" style="padding: 8px 12px; height: auto;" title="Remove URL">
      &times;
    </button>
  `;
  list.appendChild(div);
}

async function saveMonitoringView() {
  const id = document.getElementById('monitoring-view-id').value;
  const title = document.getElementById('monitoring-title').value.trim();
  const description = document.getElementById('monitoring-description').value.trim();
  const duration = parseInt(document.getElementById('monitoring-duration').value, 10) || 10;
  
  const urlInputs = document.querySelectorAll('.monitoring-url-input');
  const urls = [];
  urlInputs.forEach(input => {
    const val = input.value.trim();
    if (val) urls.push(val);
  });
  
  if (!title) {
    alert('Judul monitoring view wajib diisi.');
    return;
  }
  
  if (urls.length === 0) {
    alert('Minimal masukkan satu share URL dashboard Grafana.');
    return;
  }
  
  const payload = {
    title,
    description,
    slideDuration: duration,
    urls
  };
  
  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/v1/monitoring-views/${id}` : '/api/v1/monitoring-views';
    
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    if (res.ok && result.success) {
      addLog('Monitoring', `Monitoring view "${title}" saved successfully.`, 'SUCCESS');
      closeMonitoringViewModal();
      loadMonitoringViews();
    } else {
      alert('Gagal menyimpan: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    alert('Koneksi API Error: ' + error.message);
  }
}

async function deleteMonitoringView(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus monitoring view ini?')) {
    return;
  }
  
  try {
    const res = await fetch(`/api/v1/monitoring-views/${id}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (res.ok && result.success) {
      addLog('Monitoring', 'Monitoring view deleted successfully.', 'SUCCESS');
      loadMonitoringViews();
    } else {
      alert('Gagal menghapus: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    alert('Koneksi API Error: ' + error.message);
  }
}

// Player / Detail View Functions
function startMonitoringPlayer(id) {
  const view = monitoringViews.find(v => v.id === id);
  if (!view) return;
  
  activeMonitoringView = view;
  
  // Set elements
  document.getElementById('player-view-title').textContent = view.title;
  document.getElementById('player-view-desc').textContent = view.description || 'No description';
  
  // Switch visible sections
  document.getElementById('monitoring-list-container').classList.add('hidden');
  document.getElementById('monitoring-player-container').classList.remove('hidden');
  
  // Setup interval dropdown selector
  slideshowDurationSetting = view.slideDuration || 10;
  const selectInterval = document.getElementById('player-interval-select');
  if (selectInterval) {
    selectInterval.value = slideshowDurationSetting.toString();
  }
  
  // Reset slideshow state
  currentSlideIndex = 0;
  slideshowActive = false;
  
  // Set default mode to Grid View
  setPlayerMode('grid');
}

function exitMonitoringPlayer() {
  stopSlideshowTimer();
  slideshowActive = false;
  activeMonitoringView = null;
  
  document.getElementById('monitoring-player-container').classList.add('hidden');
  document.getElementById('monitoring-list-container').classList.remove('hidden');
  
  // Refresh views list
  loadMonitoringViews();
}

function setPlayerMode(mode) {
  stopSlideshowTimer();
  playerMode = mode;
  
  const btnGrid = document.getElementById('btn-player-grid');
  const btnSlideshow = document.getElementById('btn-player-slideshow');
  const slideshowControls = document.getElementById('player-slideshow-controls');
  const progressBarWrapper = document.getElementById('slideshow-progress-bar-wrapper');
  const indicator = document.getElementById('slideshow-indicator');
  
  if (mode === 'grid') {
    btnGrid.classList.add('active');
    btnGrid.style.background = 'var(--prometheus-orange)';
    btnGrid.style.color = '#fff';
    
    btnSlideshow.classList.remove('active');
    btnSlideshow.style.background = 'transparent';
    btnSlideshow.style.color = 'var(--foreground)';
    
    slideshowControls.classList.add('hidden');
    progressBarWrapper.classList.add('hidden');
    indicator.classList.add('hidden');
    slideshowActive = false;
    
    renderPlayer();
  } else {
    btnSlideshow.classList.add('active');
    btnSlideshow.style.background = 'var(--prometheus-orange)';
    btnSlideshow.style.color = '#fff';
    
    btnGrid.classList.remove('active');
    btnGrid.style.background = 'transparent';
    btnGrid.style.color = 'var(--foreground)';
    
    slideshowControls.classList.remove('hidden');
    progressBarWrapper.classList.remove('hidden');
    indicator.classList.remove('hidden');
    
    // Auto play when switching to slideshow mode
    slideshowActive = true;
    updatePlayPauseButton();
    renderPlayer();
    startSlideshowTimer();
  }
}

function openFullscreenSlideshow() {
  if (!activeMonitoringView) return;
  window.open(`fullscreen.html#${activeMonitoringView.id}`, '_blank');
}

function renderPlayer() {
  const renderArea = document.getElementById('monitoring-render-area');
  renderArea.innerHTML = '';
  
  if (!activeMonitoringView || !activeMonitoringView.urls || activeMonitoringView.urls.length === 0) {
    renderArea.innerHTML = '<div class="empty-state">No URLs configured for this monitoring view.</div>';
    return;
  }
  
  if (playerMode === 'grid') {
    // Render in a grid
    const gridDiv = document.createElement('div');
    gridDiv.className = 'dashboard-panels-grid'; // Matches 2-column style from style.css
    
    activeMonitoringView.urls.forEach((url, index) => {
      const cleanedUrl = getEmbedUrl(url);
      
      const panelDiv = document.createElement('div');
      panelDiv.className = 'panel';
      panelDiv.style.padding = '0';
      panelDiv.style.overflow = 'hidden';
      panelDiv.style.height = '350px';
      panelDiv.style.display = 'flex';
      panelDiv.style.flexDirection = 'column';
      panelDiv.style.marginBottom = '0';
      
      panelDiv.innerHTML = `
        <div style="background: var(--app-sidebar); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--app-border);">
          <span style="font-size: 11px; font-weight: bold; color: var(--text-white);">Panel ${index + 1}</span>
        </div>
        <iframe src="${cleanedUrl}" style="border: none; width: 100%; flex-grow: 1;" allowfullscreen></iframe>
      `;
      gridDiv.appendChild(panelDiv);
    });
    renderArea.appendChild(gridDiv);
  } else {
    // Render single slide (slideshow mode)
    if (currentSlideIndex >= activeMonitoringView.urls.length) {
      currentSlideIndex = 0;
    }
    
    const url = activeMonitoringView.urls[currentSlideIndex];
    const cleanedUrl = getEmbedUrl(url);
    
    const panelDiv = document.createElement('div');
    panelDiv.className = 'panel';
    panelDiv.style.padding = '0';
    panelDiv.style.overflow = 'hidden';
    panelDiv.style.height = '500px';
    panelDiv.style.display = 'flex';
    panelDiv.style.flexDirection = 'column';
    
    panelDiv.innerHTML = `
      <div style="background: var(--app-sidebar); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--app-border);">
        <span style="font-size: 11px; font-weight: bold; color: var(--text-white);">Active Panel: ${currentSlideIndex + 1} of ${activeMonitoringView.urls.length}</span>
      </div>
      <iframe src="${cleanedUrl}" style="border: none; width: 100%; flex-grow: 1;" allowfullscreen></iframe>
    `;
    renderArea.appendChild(panelDiv);
    updateSlideshowUI();
  }
}

// Slideshow playback logic
function startSlideshowTimer() {
  stopSlideshowTimer();
  slideshowRemainingTime = slideshowDurationSetting;
  updateSlideshowUI();
  
  slideshowTimer = setInterval(() => {
    slideshowRemainingTime--;
    if (slideshowRemainingTime <= 0) {
      nextSlide();
    } else {
      updateSlideshowUI();
    }
  }, 1000);
}

function stopSlideshowTimer() {
  if (slideshowTimer) {
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }
}

function updateSlideshowUI() {
  const progressBar = document.getElementById('slideshow-progress-bar');
  const timerText = document.getElementById('slideshow-indicator-timer');
  const indicatorText = document.getElementById('slideshow-indicator-text');
  
  if (progressBar) {
    const percent = ((slideshowDurationSetting - slideshowRemainingTime) / slideshowDurationSetting) * 100;
    progressBar.style.width = `${percent}%`;
  }
  
  if (timerText) {
    timerText.textContent = `Next switch in: ${slideshowRemainingTime}s`;
  }
  
  if (indicatorText && activeMonitoringView) {
    indicatorText.textContent = `Panel ${currentSlideIndex + 1} of ${activeMonitoringView.urls.length}`;
  }
}

function toggleSlideshowPlay() {
  slideshowActive = !slideshowActive;
  updatePlayPauseButton();
  
  if (slideshowActive) {
    startSlideshowTimer();
  } else {
    stopSlideshowTimer();
  }
}

function updatePlayPauseButton() {
  const icon = document.getElementById('btn-slideshow-play-icon');
  const text = document.getElementById('btn-slideshow-play-text');
  
  if (slideshowActive) {
    icon.textContent = '⏸️';
    text.textContent = 'Pause';
  } else {
    icon.textContent = '▶️';
    text.textContent = 'Play';
  }
}

function nextSlide() {
  if (!activeMonitoringView || activeMonitoringView.urls.length <= 1) return;
  currentSlideIndex = (currentSlideIndex + 1) % activeMonitoringView.urls.length;
  renderPlayer();
  if (slideshowActive) {
    startSlideshowTimer();
  }
}

function prevSlide() {
  if (!activeMonitoringView || activeMonitoringView.urls.length <= 1) return;
  currentSlideIndex = (currentSlideIndex - 1 + activeMonitoringView.urls.length) % activeMonitoringView.urls.length;
  renderPlayer();
  if (slideshowActive) {
    startSlideshowTimer();
  }
}

function adjustPlayerInterval() {
  const select = document.getElementById('player-interval-select');
  if (select) {
    slideshowDurationSetting = parseInt(select.value, 10) || 10;
    if (slideshowActive) {
      startSlideshowTimer();
    } else {
      updateSlideshowUI();
    }
  }
}

// Helpers
function getEmbedUrl(url) {
  try {
    let u = new URL(url);
    if (u.searchParams.has('embed')) {
      return url;
    }
    u.searchParams.set('embed', 'true');
    return u.toString();
  } catch (e) {
    if (url.includes('?')) {
      return url.includes('embed=') ? url : `${url}&embed=true`;
    }
    return `${url}?embed=true`;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}


