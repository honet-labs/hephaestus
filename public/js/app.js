// Endpoints
const API_SETTINGS_URL = '/api/v1/settings/grafana';

// Navigation pages
const pages = ['overview', 'settings', 'diagnostics', 'installer', 'prometheus', 'monitoring', 'snmp-query', 'mib-importer', 'oid-library', 'database', 'user-management', 'activity-logs', 'query-explorer'];

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
  checkDatabaseConnectionOnLoad();
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

// Helper: UI Feedbacks & Loading Spinners
function showFeedback(type, title, desc) {
  if (!feedbackAlert || !feedbackTitle || !feedbackDesc) return;
  feedbackAlert.className = `alert alert-${type}`;
  feedbackTitle.textContent = title;
  feedbackDesc.textContent = desc;
  feedbackAlert.classList.remove('hidden');
}

function hideFeedback() {
  if (feedbackAlert) {
    feedbackAlert.classList.add('hidden');
  }
}

function setLoading(isLoading, action = '') {
  const buttons = [btnTest, btnSave, btnReset];
  const spinners = {
    test: spinnerTest,
    save: spinnerSave,
    reset: spinnerReset
  };

  buttons.forEach(btn => {
    if (btn) btn.disabled = isLoading;
  });

  // Hide all spinners first
  Object.values(spinners).forEach(sp => {
    if (sp) sp.classList.add('hidden');
  });

  // Show target spinner if loading
  if (isLoading && action && spinners[action]) {
    spinners[action].classList.remove('hidden');
  }
}

// 1. Navigation routing
function navigate(pageId) {
  window.location.hash = pageId;
}

function toggleSnmpSubmenu() {
  const submenu = document.getElementById('snmp-submenu');
  const arrow = document.getElementById('menu-snmp-arrow');
  if (submenu) {
    const isHidden = submenu.classList.contains('hidden') || submenu.style.display === 'none';
    if (isHidden) {
      submenu.classList.remove('hidden');
      submenu.style.display = 'flex';
      if (arrow) arrow.style.transform = 'rotate(180deg)';
      // Navigate to snmp-query if not already on an SNMP page
      const hash = window.location.hash.replace('#', '') || 'overview';
      if (!['snmp-query', 'mib-importer', 'oid-library'].includes(hash)) {
        navigate('snmp-query');
      }
    } else {
      submenu.classList.add('hidden');
      submenu.style.display = 'none';
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
  }
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

  const snmpPages = ['snmp-query', 'mib-importer', 'oid-library'];
  const isSnmpPage = snmpPages.includes(pageId);
  const submenu = document.getElementById('snmp-submenu');
  const parentMenu = document.getElementById('menu-snmp-parent');
  const arrow = document.getElementById('menu-snmp-arrow');

  if (isSnmpPage) {
    if (submenu) {
      submenu.classList.remove('hidden');
      submenu.style.display = 'flex';
    }
    if (parentMenu) parentMenu.classList.add('active');
    if (arrow) arrow.style.transform = 'rotate(180deg)';
  } else {
    if (submenu) {
      submenu.classList.add('hidden');
      submenu.style.display = 'none';
    }
    if (parentMenu) parentMenu.classList.remove('active');
    if (arrow) arrow.style.transform = 'rotate(0deg)';
  }

  const settingsPages = ['database', 'user-management', 'activity-logs'];
  const isSettingsPage = settingsPages.includes(pageId);
  const setSubmenu = document.getElementById('settings-submenu');
  const setParentMenu = document.getElementById('menu-settings-parent');
  const setArrow = document.getElementById('menu-settings-arrow');

  if (isSettingsPage) {
    if (setSubmenu) {
      setSubmenu.classList.remove('hidden');
      setSubmenu.style.display = 'flex';
    }
    if (setParentMenu) setParentMenu.classList.add('active');
    if (setArrow) setArrow.style.transform = 'rotate(180deg)';
  } else {
    if (setSubmenu) {
      setSubmenu.classList.add('hidden');
      setSubmenu.style.display = 'none';
    }
    if (setParentMenu) setParentMenu.classList.remove('active');
    if (setArrow) setArrow.style.transform = 'rotate(0deg)';
  }

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
    navigate('overview');
    return;
  } else if (pageId === 'prometheus') {
    pageTitle.textContent = 'Prometheus Config';
    pageDesc.textContent = 'Kelola, validasi, dan muat ulang (hot reload) konfigurasi file prometheus.yml.';
    initPrometheusPage();
  } else if (pageId === 'monitoring') {
    pageTitle.textContent = 'Monitoring View';
    pageDesc.textContent = 'Slideshow rotasi monitoring dashboard Grafana ter-embed.';
    initMonitoringPage();
  } else if (pageId === 'snmp-query') {
    pageTitle.textContent = 'SNMP Query Console';
    pageDesc.textContent = 'Perform real-time SNMP GET and WALK queries against target network agents and devices.';
    initSnmpQueryPage();
  } else if (pageId === 'mib-importer') {
    pageTitle.textContent = 'MIB Importer';
    pageDesc.textContent = 'Download preset MIBs or import custom ASN.1 definitions to compile into the database.';
    initMibImporterPage();
  } else if (pageId === 'oid-library') {
    pageTitle.textContent = 'Library MIB/OID SNMP';
    pageDesc.textContent = 'Browse the registered OID Dictionary Registry database to inspect metrics and select OIDs for queries.';
    initOidLibraryPage();
  } else if (pageId === 'database') {
    pageTitle.textContent = 'System Settings';
    pageDesc.textContent = 'PostgreSQL database connection settings and performance tuning.';
    initDatabasePage();
  } else if (pageId === 'user-management') {
    pageTitle.textContent = 'User Management';
    pageDesc.textContent = 'Create, list, delete user accounts and manage credentials.';
    initUserManagementPage();
  } else if (pageId === 'activity-logs') {
    pageTitle.textContent = 'Activity Audit Logs';
    pageDesc.textContent = 'View and query chronological audit logs of portal configuration events.';
    initActivityLogsPage();
  } else if (pageId === 'query-explorer') {
    pageTitle.textContent = 'Query Data Explorer';
    pageDesc.textContent = 'Fetch and align multi-column metrics grouped by server IP Address from Grafana datasources.';
    initQueryExplorerPage();
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
          <div style="font-size: 11px; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            <span>Slideshow Interval:</span>
            <strong style="color: var(--text-white);">${view.slideDuration}s</strong>
          </div>
        </div>
        <div style="display: flex; gap: 8px; border-top: 1px solid var(--app-border); padding-top: 12px; margin-top: auto;">
          <button class="btn btn-primary" onclick="startMonitoringPlayer('${view.id}')" style="flex-grow: 1; padding: 6px 12px; font-size: 11px; height: auto; justify-content: center;">
            View / Play
          </button>
          <button class="btn btn-secondary" onclick="openEditMonitoringViewModal('${view.id}')" style="padding: 6px 10px; font-size: 11px; height: auto; display: flex; align-items: center; justify-content: center;" title="Edit View">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <button class="btn btn-danger" onclick="deleteMonitoringView('${view.id}')" style="padding: 6px 10px; font-size: 11px; height: auto; display: flex; align-items: center; justify-content: center;" title="Delete View">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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
      const escapedUrl = (cleanedUrl || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      
      const panelDiv = document.createElement('div');
      panelDiv.className = 'panel';
      panelDiv.style.padding = '0';
      panelDiv.style.overflow = 'hidden';
      panelDiv.style.height = '450px';
      panelDiv.style.display = 'flex';
      panelDiv.style.flexDirection = 'column';
      panelDiv.style.marginBottom = '0';
      
      panelDiv.innerHTML = `
        <div style="background: var(--app-sidebar); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--app-border);">
          <span style="font-size: 11px; font-weight: bold; color: var(--text-white);">Panel ${index + 1}</span>
        </div>
        <div style="width: 100%; flex-grow: 1; overflow: hidden; position: relative;">
          <iframe src="${escapedUrl}" style="border: none; width: 125%; height: 125%; transform: scale(0.8); transform-origin: 0 0; position: absolute; top: 0; left: 0;" allowfullscreen></iframe>
        </div>
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
    const escapedUrl = (cleanedUrl || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    
    const panelDiv = document.createElement('div');
    panelDiv.className = 'panel';
    panelDiv.style.padding = '0';
    panelDiv.style.overflow = 'hidden';
    panelDiv.style.height = '600px';
    panelDiv.style.display = 'flex';
    panelDiv.style.flexDirection = 'column';
    
    panelDiv.innerHTML = `
      <div style="background: var(--app-sidebar); padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--app-border);">
        <span style="font-size: 11px; font-weight: bold; color: var(--text-white);">Active Panel: ${currentSlideIndex + 1} of ${activeMonitoringView.urls.length}</span>
      </div>
      <div style="width: 100%; flex-grow: 1; overflow: hidden; position: relative;">
        <iframe src="${escapedUrl}" style="border: none; width: 111%; height: 111%; transform: scale(0.9); transform-origin: 0 0; position: absolute; top: 0; left: 0;" allowfullscreen></iframe>
      </div>
    `;
    renderArea.appendChild(panelDiv);
    updateSlideshowUI();
  }
}

// Slideshow playback logic
function startSlideshowTimer() {
  stopSlideshowTimer();
  if (!activeMonitoringView || activeMonitoringView.urls.length <= 1) {
    slideshowRemainingTime = 0;
    updateSlideshowUI();
    return;
  }
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
  
  const hasMultiple = (activeMonitoringView && activeMonitoringView.urls.length > 1);

  if (progressBar) {
    if (!hasMultiple) {
      progressBar.style.width = '100%';
    } else {
      const percent = ((slideshowDurationSetting - slideshowRemainingTime) / slideshowDurationSetting) * 100;
      progressBar.style.width = `${percent}%`;
    }
  }
  
  if (timerText) {
    if (!hasMultiple) {
      timerText.textContent = 'Rotation inactive (1 panel)';
    } else {
      timerText.textContent = `Next switch in: ${slideshowRemainingTime}s`;
    }
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
    icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
    text.textContent = 'Pause';
  } else {
    icon.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
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

function getEmbedUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  try {
    let u = new URL(url);
    if (!u.searchParams.has('embed')) {
      u.searchParams.set('embed', 'true');
    }
    // Automatically apply kiosk mode to full Grafana dashboards to hide the top/left navigation bars
    if (u.pathname.includes('/d/') && !u.pathname.includes('/d-solo/')) {
      if (!u.searchParams.has('kiosk')) {
        u.searchParams.set('kiosk', 'true');
      }
    }
    return u.toString();
  } catch (e) {
    let result = url;
    if (typeof result.includes === 'function') {
      if (!result.includes('embed=')) {
        result += (result.includes('?') ? '&' : '?') + 'embed=true';
      }
      if (result.includes('/d/') && !result.includes('/d-solo/') && !result.includes('kiosk=')) {
        result += '&kiosk=true';
      }
    }
    return result;
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

// ==========================================
// SNMP EXPLORER FRONTEND IMPLEMENTATION
// ==========================================

let snmpOidRegistry = {};
let snmpImportedMibs = [];
let oidLibraryPage = 1;
const oidLibraryPageSize = 50;

async function initSnmpQueryPage() {
  // Ready to perform queries
}

async function initMibImporterPage() {
  const presetsContainer = document.getElementById('presets-container');
  if (!presetsContainer) return;
  
  if (presetsContainer.children.length === 0) {
    try {
      const res = await fetch('/api/v1/snmp/presets');
      const data = await res.json();
      if (data.success) {
        renderPresetMibs(data.presets);
      }
    } catch (err) {
      console.error('Failed to load MIB presets:', err);
    }
  }

  try {
    const mibsRes = await fetch('/api/v1/snmp/mibs');
    const mibsData = await mibsRes.json();
    if (mibsData.success) {
      snmpImportedMibs = mibsData.mibs;
      renderImportedMibs(mibsData.mibs);
    }
  } catch (err) {
    console.error('Failed to load SNMP MIBs:', err);
  }
}

async function initOidLibraryPage() {
  try {
    const regRes = await fetch('/api/v1/snmp/registry');
    const regData = await regRes.json();
    if (regData.success) {
      snmpOidRegistry = regData.registry;
      renderOidRegistry(regData.registry);
    }
  } catch (err) {
    console.error('Failed to load SNMP Registry:', err);
  }
}

async function loadSnmpMibsAndRegistry() {
  try {
    const mibsRes = await fetch('/api/v1/snmp/mibs');
    const mibsData = await mibsRes.json();
    if (mibsData.success) {
      snmpImportedMibs = mibsData.mibs;
      renderImportedMibs(mibsData.mibs);
    }
  } catch (err) {
    console.error('Failed to reload MIBs:', err);
  }

  try {
    const regRes = await fetch('/api/v1/snmp/registry');
    const regData = await regRes.json();
    if (regData.success) {
      snmpOidRegistry = regData.registry;
      renderOidRegistry(regData.registry);
    }
  } catch (err) {
    console.error('Failed to reload SNMP Registry:', err);
  }
}

function renderPresetMibs(presets) {
  const container = document.getElementById('presets-container');
  if (!container) return;
  container.innerHTML = presets.map(p => `
    <button type="button" class="btn btn-secondary" onclick="importMibPreset('${p.name}')" id="btn-preset-${p.name}" style="padding: 4px 8px; font-size: 11px; height: auto; border-color: var(--app-border); margin: 2px;">
      <span>${p.name}</span>
    </button>
  `).join('');
}

async function importMibPreset(name) {
  const btn = document.getElementById(`btn-preset-${name}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="margin-right: 4px;"></span><span>Installing...</span>`;
  }

  const url = `https://raw.githubusercontent.com/librenms/librenms/master/mibs/${name}`;

  try {
    const response = await fetch('/api/v1/snmp/mibs/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mibName: name, sourceUrl: url })
    });
    const data = await response.json();

    if (!data.success) throw new Error(data.message);

    addLog('SNMP', `Successfully imported preset MIB: ${name}`, 'SUCCESS');
    await loadSnmpMibsAndRegistry();

  } catch (error) {
    console.error(error);
    addLog('SNMP', `Failed to import preset ${name}: ${error.message}`, 'ERROR');
    alert(`Import Failed: ${error.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>${name}</span>`;
    }
  }
}

function toggleImportMethodFields() {
  const method = document.getElementById('import-method').value;
  const urlGroup = document.getElementById('import-url-group');
  const textGroup = document.getElementById('import-text-group');

  if (method === 'url') {
    urlGroup.classList.remove('hidden');
    textGroup.classList.add('hidden');
  } else {
    urlGroup.classList.add('hidden');
    textGroup.classList.remove('hidden');
  }
}

async function importCustomMib(event) {
  if (event) event.preventDefault();

  const name = document.getElementById('import-mib-name').value.trim();
  const method = document.getElementById('import-method').value;
  const url = document.getElementById('import-mib-url').value.trim();
  const text = document.getElementById('import-mib-text').value.trim();

  const btn = document.getElementById('btn-import-mib');
  const spinner = document.getElementById('spinner-import-mib');

  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');

  const body = { mibName: name };
  if (method === 'url') {
    body.sourceUrl = url;
  } else {
    body.mibText = text;
  }

  try {
    const response = await fetch('/api/v1/snmp/mibs/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json();

    if (!data.success) throw new Error(data.message);

    addLog('SNMP', `Successfully imported MIB: ${name}`, 'SUCCESS');
    
    document.getElementById('import-mib-name').value = '';
    if (document.getElementById('import-mib-url')) document.getElementById('import-mib-url').value = '';
    if (document.getElementById('import-mib-text')) document.getElementById('import-mib-text').value = '';

    await loadSnmpMibsAndRegistry();

  } catch (error) {
    console.error(error);
    addLog('SNMP', `Failed to import ${name}: ${error.message}`, 'ERROR');
    alert(`Import Failed: ${error.message}`);
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

function renderImportedMibs(mibs) {
  const tbody = document.getElementById('imported-mibs-tbody');
  if (!tbody) return;

  if (mibs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 15px; font-size: 11px;">
          No custom MIBs imported yet.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = mibs.map(m => `
    <tr>
      <td style="padding: 8px 10px; font-size: 11px; font-weight: 600; color: var(--text-white);">${escapeHtml(m.name)}</td>
      <td style="padding: 8px 10px; font-size: 11px; font-family: monospace;">${m.nodeCount}</td>
      <td style="padding: 8px 10px; font-size: 11px; text-align: center;">
        <button class="btn btn-secondary" onclick="deleteImportedMib('${m.name}')" style="padding: 2px 6px; font-size: 10px; height: auto; border-color: #ff7b72; color: #ff7b72;">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function deleteImportedMib(name) {
  if (!confirm(`Are you sure you want to delete MIB module '${name}'? This will remove all associated OID dictionary definitions.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/v1/snmp/mibs/${name}`, {
      method: 'DELETE'
    });
    const data = await response.json();

    if (!data.success) throw new Error(data.message);

    addLog('SNMP', `Deleted MIB module: ${name}`, 'SUCCESS');
    await loadSnmpMibsAndRegistry();

  } catch (error) {
    console.error(error);
    addLog('SNMP', `Failed to delete MIB ${name}: ${error.message}`, 'ERROR');
    alert(`Delete Failed: ${error.message}`);
  }
}

function renderOidRegistry(registry) {
  snmpOidRegistry = registry;
  oidLibraryPage = 1;
  filterOidRegistry();
}

function filterOidRegistry() {
  const query = document.getElementById('search-registry-input').value.toLowerCase().trim();
  const tbody = document.getElementById('oid-registry-tbody');
  if (!tbody) return;

  const sortedOids = Object.keys(snmpOidRegistry).sort((a, b) => {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);
    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      if (aParts[i] === undefined) return -1;
      if (bParts[i] === undefined) return 1;
      if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
    }
    return 0;
  });

  const filteredOids = sortedOids.filter(oid => {
    const info = snmpOidRegistry[oid];
    const nameMatch = info.name.toLowerCase().includes(query);
    const oidMatch = oid.toLowerCase().includes(query);
    const mibMatch = info.mib.toLowerCase().includes(query);
    return !query || nameMatch || oidMatch || mibMatch;
  });

  const totalItems = filteredOids.length;
  const totalPages = Math.ceil(totalItems / oidLibraryPageSize) || 1;

  if (oidLibraryPage > totalPages) {
    oidLibraryPage = totalPages;
  }
  if (oidLibraryPage < 1) {
    oidLibraryPage = 1;
  }

  const startIndex = (oidLibraryPage - 1) * oidLibraryPageSize;
  const endIndex = Math.min(startIndex + oidLibraryPageSize, totalItems);
  const pageOids = filteredOids.slice(startIndex, endIndex);

  let html = '';
  pageOids.forEach(oid => {
    const info = snmpOidRegistry[oid];
    html += `
      <tr style="cursor: pointer;" onclick="inspectOid('${oid}')">
        <td style="padding: 8px 10px; font-size: 11px;">
          <div style="font-weight: 600; color: var(--text-white);">${escapeHtml(info.name)}</div>
          <div style="font-family: monospace; font-size: 9.5px; color: var(--text-muted);">${oid}</div>
        </td>
        <td style="padding: 8px 10px; font-size: 11px; vertical-align: middle;">
          <span class="status-badge" style="font-size: 9px; padding: 1px 4px; background: rgba(88,166,255,0.05); color: #58a6ff; border: 1px solid rgba(88,166,255,0.1);">${escapeHtml(info.mib)}</span>
        </td>
        <td style="padding: 8px 10px; font-size: 11px; text-align: center; vertical-align: middle;">
          <button type="button" class="btn btn-secondary" onclick="event.stopPropagation(); selectOidForQuery('${oid}', '${info.name}')" style="padding: 2px 6px; font-size: 10px; height: auto; border-color: var(--app-border);">Select</button>
        </td>
      </tr>
    `;
  });

  if (totalItems === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 11px;">
          No matching OIDs found in registry.
        </td>
      </tr>
    `;
  } else {
    tbody.innerHTML = html;
  }

  const infoEl = document.getElementById('oid-pagination-info');
  const btnPrev = document.getElementById('btn-oid-prev');
  const btnNext = document.getElementById('btn-oid-next');

  if (infoEl) {
    if (totalItems === 0) {
      infoEl.textContent = 'Showing 0-0 of 0 items';
    } else {
      infoEl.textContent = `Showing ${startIndex + 1}-${endIndex} of ${totalItems} items (Page ${oidLibraryPage} of ${totalPages})`;
    }
  }

  if (btnPrev) {
    btnPrev.disabled = (oidLibraryPage <= 1);
  }
  if (btnNext) {
    btnNext.disabled = (oidLibraryPage >= totalPages);
  }
}

function changeOidPage(direction) {
  oidLibraryPage += direction;
  filterOidRegistry();
}

function selectOidForQuery(oid, name) {
  navigate('snmp-query');
  setTimeout(() => {
    const inputOid = document.getElementById('snmp-oid');
    if (inputOid) {
      inputOid.value = oid;
      inputOid.focus();
      inputOid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
}

function inspectOid(oid) {
  const info = snmpOidRegistry[oid];
  const inspector = document.getElementById('oid-detail-inspector');
  if (!info || !inspector) return;

  inspector.classList.remove('hidden');
  document.getElementById('inspect-name').textContent = info.name;
  document.getElementById('inspect-oid').textContent = oid;
  document.getElementById('inspect-syntax').textContent = info.syntax || 'N/A';
  document.getElementById('inspect-access').textContent = info.access || 'N/A';
  document.getElementById('inspect-mib').textContent = info.mib;
  document.getElementById('inspect-desc').textContent = info.description || 'No description provided for this object.';
}

async function runSnmpQuery(event) {
  if (event) event.preventDefault();

  const host = document.getElementById('snmp-host').value.trim();
  const port = document.getElementById('snmp-port').value.trim();
  const version = document.getElementById('snmp-version').value;
  const community = document.getElementById('snmp-community').value.trim();
  const oid = document.getElementById('snmp-oid').value.trim();
  const operation = document.getElementById('snmp-operation').value;

  const btn = document.getElementById('btn-run-snmp');
  const spinner = document.getElementById('spinner-run-snmp');
  const resultsPanel = document.getElementById('snmp-results-panel');
  const tbody = document.getElementById('snmp-results-tbody');

  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  if (resultsPanel) resultsPanel.classList.add('hidden');

  try {
    const response = await fetch('/api/v1/snmp/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, version, community, oid, operation })
    });
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'SNMP Query returned failure.');
    }

    let html = '';
    data.results.forEach(res => {
      html += `
        <tr>
          <td class="font-mono" style="padding: 8px 10px; font-size: 11px; color: var(--text-muted);">${escapeHtml(res.oid)}</td>
          <td style="padding: 8px 10px; font-size: 11px; font-weight: 600; color: #58a6ff;">${escapeHtml(res.name)}</td>
          <td style="padding: 8px 10px; font-size: 11px; font-family: monospace;">${escapeHtml(res.type)}</td>
          <td class="font-mono" style="padding: 8px 10px; font-size: 11.5px; color: #56d364; word-break: break-all;">${escapeHtml(res.value)}</td>
        </tr>
      `;
    });

    if (data.results.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">No values returned.</td></tr>`;
    } else {
      tbody.innerHTML = html;
    }

    if (resultsPanel) resultsPanel.classList.remove('hidden');
    const displayOid = data.queriedOid || oid || '1.3.6.1';
    const displayOp = data.queriedOperation || operation;
    addLog('SNMP', `Successfully executed ${displayOp.toUpperCase()} on OID: ${displayOid}`, 'SUCCESS');

  } catch (error) {
    console.error(error);
    addLog('SNMP', `Query failed: ${error.message}`, 'ERROR');
    alert(`SNMP Query Error: ${error.message}`);
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

async function checkDatabaseConnectionOnLoad() {
  try {
    const res = await fetch('/api/v1/system/db-config');
    if (res.ok) {
      const data = await res.json();
      const storageEngine = document.getElementById('infra-storage-engine');
      if (storageEngine) {
        if (data.isConnected) {
          storageEngine.className = 'status-text-green';
          storageEngine.textContent = 'PostgreSQL (Connected)';
          addLog('Database', 'Connected to PostgreSQL database successfully.', 'SUCCESS');
        } else {
          storageEngine.className = 'status-text-red';
          storageEngine.textContent = 'PostgreSQL (Offline)';
          addLog('Database', `PostgreSQL connection offline: ${data.error || 'Unknown error'}`, 'ERROR');
        }
      }
    }
  } catch (err) {
    console.error('Error checking DB connection:', err);
  }
}

async function initDatabasePage() {
  const hostInput = document.getElementById('db-host');
  const portInput = document.getElementById('db-port');
  const userInput = document.getElementById('db-user');
  const passwordInput = document.getElementById('db-password');
  const nameInput = document.getElementById('db-name');
  const sslInput = document.getElementById('db-ssl');
  
  const feedback = document.getElementById('db-feedback');
  if (feedback) feedback.classList.add('hidden');
  
  try {
    const res = await fetch('/api/v1/system/db-config');
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.config) {
        if (hostInput) hostInput.value = data.config.host || '';
        if (portInput) portInput.value = data.config.port || 5432;
        if (userInput) userInput.value = data.config.user || '';
        if (passwordInput) passwordInput.value = data.config.maskedPassword || '';
        if (nameInput) nameInput.value = data.config.database || '';
        if (sslInput) sslInput.value = data.config.ssl ? 'true' : 'false';

        if (!data.isConnected && feedback) {
          const title = document.getElementById('db-feedback-title');
          const desc = document.getElementById('db-feedback-desc');
          feedback.className = 'alert alert-danger';
          if (title) title.textContent = 'Database Offline / Error';
          if (desc) desc.textContent = data.error || 'Server cannot connect to PostgreSQL with the current credentials.';
          feedback.classList.remove('hidden');
        }
      }
    }
  } catch (error) {
    console.error('Failed to load database config:', error);
    addLog('Database', `Failed to load DB config: ${error.message}`, 'ERROR');
  }
}

async function saveDbConfiguration(event) {
  if (event) event.preventDefault();
  
  const host = document.getElementById('db-host').value.trim();
  const port = document.getElementById('db-port').value.trim();
  const user = document.getElementById('db-user').value.trim();
  const password = document.getElementById('db-password').value;
  const database = document.getElementById('db-name').value.trim();
  const ssl = document.getElementById('db-ssl').value === 'true';
  
  const btn = document.getElementById('btn-save-db');
  const spinner = document.getElementById('spinner-save-db');
  const feedback = document.getElementById('db-feedback');
  const title = document.getElementById('db-feedback-title');
  const desc = document.getElementById('db-feedback-desc');
  
  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  if (feedback) feedback.classList.add('hidden');
  
  try {
    const response = await fetch('/api/v1/system/db-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, password, database, ssl })
    });
    
    const data = await response.json();
    if (feedback && title && desc) {
      if (response.ok && data.success) {
        feedback.className = 'alert alert-success';
        title.textContent = 'Success';
        desc.textContent = data.message || 'Database settings updated successfully!';
        addLog('Database', 'Configuration updated and pool reloaded successfully.', 'SUCCESS');
        
        const storageEngine = document.getElementById('infra-storage-engine');
        if (storageEngine) {
          storageEngine.className = 'status-text-green';
          storageEngine.textContent = 'PostgreSQL (Connected)';
        }
        
        loadGrafanaSettings();
      } else {
        feedback.className = 'alert alert-danger';
        title.textContent = 'Error';
        desc.textContent = data.message || 'Failed to apply configuration.';
        addLog('Database', `Update failed: ${data.message}`, 'ERROR');
        
        const storageEngine = document.getElementById('infra-storage-engine');
        if (storageEngine) {
          storageEngine.className = 'status-text-red';
          storageEngine.textContent = 'PostgreSQL (Offline)';
        }
      }
      feedback.classList.remove('hidden');
    }
  } catch (error) {
    console.error(error);
    if (feedback && title && desc) {
      feedback.className = 'alert alert-danger';
      title.textContent = 'Error';
      desc.textContent = error.message;
      feedback.classList.remove('hidden');
    }
    addLog('Database', `Error: ${error.message}`, 'ERROR');
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

async function testDbConfiguration(event) {
  if (event) event.preventDefault();

  const host = document.getElementById('db-host').value.trim();
  const port = document.getElementById('db-port').value.trim();
  const user = document.getElementById('db-user').value.trim();
  const password = document.getElementById('db-password').value;
  const database = document.getElementById('db-name').value.trim();
  const ssl = document.getElementById('db-ssl').value === 'true';

  const btn = document.getElementById('btn-test-db');
  const spinner = document.getElementById('spinner-test-db');
  const feedback = document.getElementById('db-feedback');
  const title = document.getElementById('db-feedback-title');
  const desc = document.getElementById('db-feedback-desc');

  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  if (feedback) feedback.classList.add('hidden');

  try {
    const response = await fetch('/api/v1/system/db-config/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, password, database, ssl })
    });

    const data = await response.json();
    if (feedback && title && desc) {
      if (response.ok && data.success) {
        feedback.className = 'alert alert-success';
        title.textContent = 'Success';
        desc.textContent = data.message || 'Database connection successful! Configuration is valid.';
        addLog('Database', 'Test connection succeeded.', 'SUCCESS');
      } else {
        feedback.className = 'alert alert-danger';
        title.textContent = 'Connection Error';
        desc.textContent = data.message || 'Failed to connect to the database with the provided configuration.';
        addLog('Database', `Test connection failed: ${data.message || data.error}`, 'ERROR');
      }
      feedback.classList.remove('hidden');
    }
  } catch (error) {
    console.error(error);
    if (feedback && title && desc) {
      feedback.className = 'alert alert-danger';
      title.textContent = 'Error';
      desc.textContent = error.message;
      feedback.classList.remove('hidden');
    }
    addLog('Database', `Test connection error: ${error.message}`, 'ERROR');
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

async function viewDatasources(configId, configName, configHost) {
  const modal = document.getElementById('datasources-modal');
  const title = document.getElementById('datasources-modal-title');
  const serverInfo = document.getElementById('datasources-modal-server-info');
  const tbody = document.getElementById('popup-datasources-tbody');

  if (!modal || !tbody) return;

  if (title) title.textContent = `Datasources for "${configName}"`;
  if (serverInfo) serverInfo.textContent = `Server Host: ${configHost}`;
  tbody.innerHTML = `
    <tr>
      <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 20px;">
        <span class="spinner" style="margin-right: 8px;"></span> Loading datasources...
      </td>
    </tr>
  `;

  modal.classList.add('active');

  try {
    const res = await fetch(`/api/v1/settings/grafana/datasources?configId=${configId}`);
    const data = await res.json();

    if (data.success && data.data) {
      if (data.data.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="3" style="text-align: center; color: var(--text-muted); padding: 20px;">
              No datasources found on this Grafana server.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = data.data.map(ds => `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 10px 12px; font-size: 11px; font-weight: 600; color: var(--text-white);">${escapeHtml(ds.name)}</td>
            <td style="padding: 10px 12px; font-size: 11px; vertical-align: middle;">
              <span class="status-badge" style="font-size: 9px; padding: 1px 4px; background: rgba(245,158,11,0.05); color: #f59e0b; border: 1px solid rgba(245,158,11,0.1);">${escapeHtml(ds.type)}</span>
            </td>
            <td style="padding: 10px 12px; font-size: 11px; font-family: monospace; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <span>${ds.uid}</span>
              <button type="button" class="btn btn-secondary" onclick="copyTextToClipboard('${ds.uid}')" style="padding: 2px 6px; font-size: 10px; height: auto; border-color: var(--app-border);">Copy</button>
            </td>
          </tr>
        `).join('');
      }
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center; color: #ff7b72; padding: 20px;">
            Failed to load datasources: ${data.message || data.error}
          </td>
        </tr>
      `;
    }
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="text-align: center; color: #ff7b72; padding: 20px;">
          Failed to fetch from backend: ${error.message}
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
    alert('UID copied to clipboard: ' + text);
  }).catch(err => {
    console.error('Failed to copy text: ', err);
  });
}

function openAddPanelUrlModal() {
  const modal = document.getElementById('modal-add-panel-url');
  const input = document.getElementById('quick-add-url-input');
  if (input) input.value = '';
  if (modal) modal.classList.add('active');
}

function closeAddPanelUrlModal() {
  const modal = document.getElementById('modal-add-panel-url');
  if (modal) modal.classList.remove('active');
}

async function submitQuickAddPanelUrl() {
  if (!activeMonitoringView) return;
  const input = document.getElementById('quick-add-url-input');
  const newUrl = input ? input.value.trim() : '';
  if (!newUrl) {
    alert('Please enter a Grafana panel URL.');
    return;
  }

  // Add the new URL to the active monitoring view urls list
  const updatedUrls = [...activeMonitoringView.urls, newUrl];
  
  const payload = {
    title: activeMonitoringView.title,
    description: activeMonitoringView.description,
    slideDuration: activeMonitoringView.slideDuration,
    urls: updatedUrls
  };

  try {
    const res = await fetch(`/api/v1/monitoring-views/${activeMonitoringView.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    if (res.ok && result.success) {
      addLog('Monitoring', `Successfully added panel URL to view "${activeMonitoringView.title}".`, 'SUCCESS');
      
      // Update local state
      activeMonitoringView.urls = updatedUrls;
      
      // Also update in the global monitoringViews list
      const localViewIndex = monitoringViews.findIndex(v => v.id === activeMonitoringView.id);
      if (localViewIndex !== -1) {
        monitoringViews[localViewIndex].urls = updatedUrls;
      }
      
      // Close the modal
      closeAddPanelUrlModal();
      
      // Refresh the player
      renderPlayer();
      
      // If we are currently in slideshow mode, let's restart the timer with updated length
      if (playerMode === 'slideshow') {
        // Reset to the last added slide so they see what they just added!
        currentSlideIndex = activeMonitoringView.urls.length - 1;
        renderPlayer();
        startSlideshowTimer();
      }
    } else {
      alert('Failed to add panel: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    alert('API Connection Error: ' + error.message);
  }
}

// System settings / Database sub-menu toggle logic
function toggleSettingsSubmenu() {
  const submenu = document.getElementById('settings-submenu');
  const arrow = document.getElementById('menu-settings-arrow');
  if (submenu) {
    const isHidden = submenu.classList.contains('hidden') || submenu.style.display === 'none';
    if (isHidden) {
      submenu.classList.remove('hidden');
      submenu.style.display = 'flex';
      if (arrow) arrow.style.transform = 'rotate(180deg)';
      // Navigate to database if not already on a database/settings page
      const hash = window.location.hash.replace('#', '') || 'overview';
      if (!['database', 'user-management', 'activity-logs'].includes(hash)) {
        navigate('database');
      }
    } else {
      submenu.classList.add('hidden');
      submenu.style.display = 'none';
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
  }
}

// User Management Page Logic
async function initUserManagementPage() {
  await loadUsersList();
}

async function loadUsersList() {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
        <span class="spinner" style="margin-right: 8px;"></span> Loading users...
      </td>
    </tr>
  `;

  try {
    const res = await fetch('/api/v1/users');
    const data = await res.json();

    if (data.success && data.users) {
      if (data.users.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
              No user accounts found.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = data.users.map(u => {
          const deleteBtn = u.username === 'sysadmin' 
            ? `<button class="btn btn-secondary" disabled style="padding: 2px 8px; font-size: 10.5px; height: auto; opacity: 0.5; cursor: not-allowed; border-color: var(--app-border);">Delete</button>`
            : `<button class="btn btn-secondary" onclick="deleteUserAccount('${u.id}', '${u.username}')" style="padding: 2px 8px; font-size: 10.5px; height: auto; color: #ff7b72; border-color: rgba(255,123,114,0.2);">Delete</button>`;

          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: var(--text-white);">${escapeHtml(u.username)}</td>
              <td style="padding: 10px 12px; font-size: 12px; color: var(--text-muted);">${escapeHtml(u.email)}</td>
              <td style="padding: 10px 12px; font-size: 12px; vertical-align: middle;">
                <span class="status-badge" style="font-size: 9px; padding: 1px 4px; ${u.role === 'ADMIN' ? 'background: rgba(16,185,129,0.05); color: #10b981; border: 1px solid rgba(16,185,129,0.1);' : 'background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.1);'}">${u.role}</span>
              </td>
              <td style="padding: 10px 12px; font-size: 11px; font-family: monospace; color: var(--text-muted);">${new Date(u.created_at).toLocaleString()}</td>
              <td style="padding: 10px 12px; font-size: 12px; text-align: right; display: flex; justify-content: flex-end; gap: 8px;">
                <button type="button" class="btn btn-secondary" onclick="openResetPasswordModal('${u.id}', '${u.username}')" style="padding: 2px 8px; font-size: 10.5px; height: auto; border-color: var(--app-border);">Reset Password</button>
                ${deleteBtn}
              </td>
            </tr>
          `;
        }).join('');
      }
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: #ff7b72; padding: 20px;">
            Failed to load users: ${data.message || data.error}
          </td>
        </tr>
      `;
    }
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #ff7b72; padding: 20px;">
          Failed to fetch users from backend: ${error.message}
        </td>
      </tr>
    `;
  }
}

function openAddUserModal() {
  const modal = document.getElementById('modal-add-user');
  if (modal) {
    modal.classList.add('active');
    document.getElementById('form-add-user').reset();
  }
}

function closeAddUserModal() {
  const modal = document.getElementById('modal-add-user');
  if (modal) modal.classList.remove('active');
}

async function submitAddUser(event) {
  if (event) event.preventDefault();

  const username = document.getElementById('add-user-username').value.trim();
  const email = document.getElementById('add-user-email').value.trim();
  const password = document.getElementById('add-user-password').value;
  const role = document.getElementById('add-user-role').value;

  try {
    const res = await fetch('/api/v1/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password, role })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert('User account created successfully.');
      closeAddUserModal();
      await loadUsersList();
      addLog('User Management', `Created user account "${username}"`, 'SUCCESS');
    } else {
      alert('Failed to create user: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    alert('Error connecting to backend: ' + error.message);
  }
}

async function deleteUserAccount(id, username) {
  if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;

  try {
    const res = await fetch(`/api/v1/users/${id}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(`User "${username}" deleted successfully.`);
      await loadUsersList();
      addLog('User Management', `Deleted user account "${username}"`, 'SUCCESS');
    } else {
      alert('Failed to delete user: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    alert('Error connecting to backend: ' + error.message);
  }
}

function openResetPasswordModal(id, username) {
  const modal = document.getElementById('modal-reset-password');
  if (modal) {
    document.getElementById('reset-password-userid').value = id;
    document.getElementById('reset-password-username').textContent = username;
    document.getElementById('reset-password-newval').value = '';
    modal.classList.add('active');
  }
}

function closeResetPasswordModal() {
  const modal = document.getElementById('modal-reset-password');
  if (modal) modal.classList.remove('active');
}

async function submitResetPassword(event) {
  if (event) event.preventDefault();

  const id = document.getElementById('reset-password-userid').value;
  const username = document.getElementById('reset-password-username').textContent;
  const newPassword = document.getElementById('reset-password-newval').value;

  try {
    const res = await fetch(`/api/v1/users/${id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(`Password for user "${username}" reset successfully.`);
      closeResetPasswordModal();
      addLog('User Management', `Reset password for user "${username}"`, 'SUCCESS');
    } else {
      alert('Failed to reset password: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    alert('Error connecting to backend: ' + error.message);
  }
}

// Activity Logs Page Logic
let logsPage = 1;
const logsLimit = 15;

async function initActivityLogsPage() {
  logsPage = 1;
  await loadActivityLogs();
}

async function loadActivityLogs() {
  const tbody = document.getElementById('activity-logs-tbody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
        <span class="spinner" style="margin-right: 8px;"></span> Loading activity logs...
      </td>
    </tr>
  `;

  const search = document.getElementById('log-search-input').value.trim();
  const module = document.getElementById('log-module-filter').value;
  const status = document.getElementById('log-status-filter').value;

  let queryUrl = `/api/v1/activity-logs?page=${logsPage}&limit=${logsLimit}`;
  if (search) queryUrl += `&search=${encodeURIComponent(search)}`;
  if (module) queryUrl += `&module=${encodeURIComponent(module)}`;
  if (status) queryUrl += `&status=${encodeURIComponent(status)}`;

  try {
    const res = await fetch(queryUrl);
    const data = await res.json();

    if (data.success && data.logs) {
      if (data.logs.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
              No activity logs found.
            </td>
          </tr>
        `;
        document.getElementById('logs-pagination-info').textContent = 'Showing 0-0 of 0 logs';
        document.getElementById('btn-logs-prev').disabled = true;
        document.getElementById('btn-logs-next').disabled = true;
      } else {
        tbody.innerHTML = data.logs.map(log => {
          let badgeClass = 'status-default';
          if (log.status === 'SUCCESS') badgeClass = 'status-configured';
          else if (log.status === 'ERROR') badgeClass = 'status-text-red';
          else if (log.status === 'WARNING') badgeClass = 'status-text-yellow';

          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11.5px;">
              <td style="padding: 8px 12px; font-family: monospace; color: var(--text-muted);">${new Date(log.created_at).toLocaleString()}</td>
              <td style="padding: 8px 12px; font-weight: 600; color: var(--text-white);">${escapeHtml(log.module)}</td>
              <td style="padding: 8px 12px; color: #58a6ff; font-weight: 500;">${escapeHtml(log.action)}</td>
              <td style="padding: 8px 12px; color: var(--text-muted); word-break: break-word;">${escapeHtml(log.details)}</td>
              <td style="padding: 8px 12px; vertical-align: middle;">
                <span class="status-badge ${badgeClass}" style="font-size: 9px; padding: 1px 4px;">${log.status}</span>
              </td>
            </tr>
          `;
        }).join('');

        const startIdx = (logsPage - 1) * logsLimit + 1;
        const endIdx = startIdx + data.logs.length - 1;
        const total = data.total || 0;
        document.getElementById('logs-pagination-info').textContent = `Showing ${startIdx}-${endIdx} of ${total} logs`;

        document.getElementById('btn-logs-prev').disabled = logsPage <= 1;
        document.getElementById('btn-logs-next').disabled = endIdx >= total;
      }
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: #ff7b72; padding: 20px;">
            Failed to load logs: ${data.message || data.error}
          </td>
        </tr>
      `;
    }
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #ff7b72; padding: 20px;">
          Failed to fetch logs from backend: ${error.message}
        </td>
      </tr>
    `;
  }
}

function changeLogsPage(direction) {
  logsPage += direction;
  if (logsPage < 1) logsPage = 1;
  loadActivityLogs();
}

function filterActivityLogs() {
  logsPage = 1;
  loadActivityLogs();
}

async function clearActivityLogs() {
  if (!confirm('Are you sure you want to permanently clear all activity logs? This action cannot be undone.')) return;

  try {
    const res = await fetch('/api/v1/activity-logs', {
      method: 'DELETE'
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert('Activity logs cleared successfully.');
      logsPage = 1;
      await loadActivityLogs();
      addLog('System', 'Activity audit logs cleared.', 'SUCCESS');
    } else {
      alert('Failed to clear logs: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    alert('Error connecting to backend: ' + error.message);
  }
}

// ==========================================
// QUERY DATA EXPLORER MODULE
// ==========================================
let queryPanels = [];
let queryExplorerDatasources = [];
let activeQueryPanelId = null;
const panelQueryCache = {};

function initQueryExplorerPage() {
  // Exit results view if active
  activeQueryPanelId = null;
  document.getElementById('query-explorer-results-container').classList.add('hidden');
  document.getElementById('query-explorer-list-container').classList.remove('hidden');
  
  // Reset container view
  document.getElementById('query-explorer-empty-state').classList.add('hidden');
  document.getElementById('query-panels-grid').innerHTML = `
    <div style="text-align: center; padding: 40px; color: var(--text-muted); grid-column: 1 / -1;">
      <span class="spinner" style="margin-right: 8px;"></span> Loading query panels...
    </div>
  `;
  
  // Load initial settings and panels
  populateGrafanaConnectionsForQueryPanel();
  loadQueryPanels();
}

async function loadQueryPanels() {
  const grid = document.getElementById('query-panels-grid');
  const emptyState = document.getElementById('query-explorer-empty-state');
  
  try {
    const res = await fetch('/api/v1/query-explorer/panels');
    const result = await res.json();
    
    if (res.ok && result.success) {
      queryPanels = result.data || [];
      
      if (queryPanels.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
      }
      
      emptyState.classList.add('hidden');
      renderQueryPanels(queryPanels);
      
      // Auto-restore active query panel on page load/refresh
      const savedActivePanelId = sessionStorage.getItem('activeQueryPanelId');
      if (savedActivePanelId && queryPanels.some(p => p.id === savedActivePanelId)) {
        showQueryResultsView(savedActivePanelId);
      }
    } else {
      grid.innerHTML = `
        <div class="panel" style="padding: 20px; text-align: center; color: #ff7b72; grid-column: 1 / -1;">
          Failed to load query panels: ${result.message || 'Unknown error'}
        </div>
      `;
      addLog('Query Explorer', 'Failed to load query panels: ' + (result.message || 'Unknown error'), 'ERROR');
    }
  } catch (error) {
    grid.innerHTML = `
      <div class="panel" style="padding: 20px; text-align: center; color: #ff7b72; grid-column: 1 / -1;">
        Error connecting to backend: ${error.message}
      </div>
    `;
    addLog('Query Explorer', 'API connection error while loading panels: ' + error.message, 'ERROR');
  }
}

function renderQueryPanels(panels) {
  const grid = document.getElementById('query-panels-grid');
  grid.innerHTML = '';
  
  panels.forEach(panel => {
    const colNames = panel.columns.map(c => c.name).join(', ');
    
    grid.innerHTML += `
      <div class="panel" style="display: flex; flex-direction: column; justify-content: space-between; gap: 12px;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
            <h3 style="margin: 0; font-size: 14px; color: var(--text-white); display: flex; align-items: center; gap: 6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: #58a6ff;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>
              ${escapeHtml(panel.name)}
            </h3>
            <span class="status-badge status-configured" style="font-size: 9px; font-weight: normal; padding: 2px 6px; text-transform: none;">
              ${panel.columns.length} Column${panel.columns.length !== 1 ? 's' : ''}
            </span>
          </div>
          <p style="font-size: 12px; color: var(--text-muted); line-height: 1.4; margin-bottom: 12px; min-height: 34px;">
            ${escapeHtml(panel.description || 'No description provided.')}
          </p>
          <div style="font-size: 11px; color: var(--text-muted); display: flex; flex-direction: column; gap: 6px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 10px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span>Time Range:</span>
              <strong style="color: var(--text-white); font-weight: normal;">${panel.timeRangeFrom} to ${panel.timeRangeTo} (${panel.step})</strong>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(colNames)}">
              <span>Metrics:</span>
              <strong style="color: var(--text-white); font-weight: normal;">${escapeHtml(colNames)}</strong>
            </div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; border-top: 1px solid var(--app-border); padding-top: 12px; margin-top: auto;">
          <button class="btn btn-primary" onclick="showQueryResultsView('${panel.id}')" style="flex-grow: 1; padding: 6px 12px; font-size: 11px; height: auto; justify-content: center;">
            Open
          </button>
          <button class="btn btn-secondary" onclick="openEditQueryPanelModal('${panel.id}')" style="padding: 6px 10px; font-size: 11px; height: auto; display: flex; align-items: center; justify-content: center;" title="Edit Panel">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          </button>
          <button class="btn btn-danger" onclick="deleteQueryPanel('${panel.id}')" style="padding: 6px 10px; font-size: 11px; height: auto; display: flex; align-items: center; justify-content: center;" title="Delete Panel">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      </div>
    `;
  });
}

function showQueryResultsView(panelId) {
  const panel = queryPanels.find(p => p.id === panelId);
  if (!panel) return;
  
  activeQueryPanelId = panelId;
  sessionStorage.setItem('activeQueryPanelId', panelId);
  
  // Set metadata
  document.getElementById('query-results-title').textContent = panel.name;
  document.getElementById('query-results-desc').textContent = panel.description || 'No description provided.';
  document.getElementById('query-results-time-badge').textContent = `Time: ${panel.timeRangeFrom} to ${panel.timeRangeTo} (step: ${panel.step})`;
  document.getElementById('query-results-cols-badge').textContent = `Columns: ${panel.columns.map(c => c.name).join(', ')}`;
  
  // Switch view state
  document.getElementById('query-explorer-list-container').classList.add('hidden');
  document.getElementById('query-explorer-results-container').classList.remove('hidden');
  
  // Hide CSV export button initially until data is loaded
  document.getElementById('btn-results-export').classList.add('hidden');
  
  // Reset output area to default prompt state
  const outputArea = document.getElementById('query-results-output');
  outputArea.removeAttribute('style');
  outputArea.style.minHeight = '200px';
  outputArea.style.display = 'flex';
  outputArea.style.alignItems = 'center';
  outputArea.style.justifyContent = 'center';
  outputArea.style.background = 'rgba(0,0,0,0.15)';
  outputArea.style.borderRadius = '4px';
  outputArea.style.border = '1px dashed var(--app-border)';
  outputArea.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px;">
      Click "Run Query" button above to fetch telemetry metrics from Grafana.
    </div>
  `;
}

function exitQueryResultsView() {
  activeQueryPanelId = null;
  sessionStorage.removeItem('activeQueryPanelId');
  document.getElementById('query-explorer-results-container').classList.add('hidden');
  document.getElementById('query-explorer-list-container').classList.remove('hidden');
  loadQueryPanels();
}

function editActiveQueryPanel() {
  if (!activeQueryPanelId) return;
  openEditQueryPanelModal(activeQueryPanelId);
}

async function runActiveQuery() {
  if (!activeQueryPanelId) return;
  
  const panelId = activeQueryPanelId;
  const btn = document.getElementById('btn-results-run');
  const spinner = document.getElementById('spinner-results-run');
  const exportBtn = document.getElementById('btn-results-export');
  const outputArea = document.getElementById('query-results-output');
  
  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  
  // Set output area to loading state
  outputArea.removeAttribute('style');
  outputArea.style.minHeight = '200px';
  outputArea.style.display = 'flex';
  outputArea.style.alignItems = 'center';
  outputArea.style.justifyContent = 'center';
  outputArea.style.background = 'rgba(0,0,0,0.15)';
  outputArea.style.borderRadius = '4px';
  outputArea.style.border = '1px dashed var(--app-border)';
  outputArea.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px;">
      <span class="spinner" style="margin-right: 8px;"></span> Executing query metrics from Grafana...
    </div>
  `;
  
  try {
    const res = await fetch(`/api/v1/query-explorer/panels/${panelId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    const result = await res.json();
    
    if (res.ok && result.success) {
      const data = result.data;
      panelQueryCache[panelId] = data; // Cache data for exporting
      
      renderActiveDataTable(data);
      if (exportBtn) exportBtn.classList.remove('hidden');
      addLog('Query Explorer', `Successfully executed query for panel.`, 'SUCCESS');
    } else {
      outputArea.removeAttribute('style');
      outputArea.style.minHeight = '120px';
      outputArea.style.display = 'flex';
      outputArea.style.alignItems = 'center';
      outputArea.style.justifyContent = 'center';
      outputArea.style.border = '1px solid var(--app-border)';
      outputArea.style.borderRadius = '4px';
      outputArea.style.background = 'rgba(255,0,0,0.02)';
      outputArea.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #ff7b72; font-size: 12px;">
          <strong>Query Error:</strong> ${result.message || 'Failed to fetch query results'}
        </div>
      `;
      addLog('Query Explorer', `Query execution failed: ${result.message || 'Unknown error'}`, 'ERROR');
    }
  } catch (error) {
    outputArea.removeAttribute('style');
    outputArea.style.minHeight = '120px';
    outputArea.style.display = 'flex';
    outputArea.style.alignItems = 'center';
    outputArea.style.justifyContent = 'center';
    outputArea.style.border = '1px solid var(--app-border)';
    outputArea.style.borderRadius = '4px';
    outputArea.style.background = 'rgba(255,0,0,0.02)';
    outputArea.innerHTML = `
      <div style="padding: 24px; text-align: center; color: #ff7b72; font-size: 12px;">
        <strong>Connection Error:</strong> ${error.message}
      </div>
    `;
    addLog('Query Explorer', `Network error executing query: ${error.message}`, 'ERROR');
  } finally {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

function formatMetricValue(val, columnName) {
  if (val === undefined || val === null) {
    return '-';
  }
  
  const num = Number(val);
  if (isNaN(num)) {
    return String(val);
  }
  
  const colLower = columnName.toLowerCase();
  
  // 1. Percentage formatting (CPU, Memory, Usage, etc.)
  if (colLower.includes('cpu') || colLower.includes('mem') || colLower.includes('ram') || colLower.includes('usage') || colLower.includes('%')) {
    // Standard percentage suffix
    return num.toFixed(2) + ' %';
  }
  
  // 2. Bytes / Disk Size formatting
  if (colLower.includes('disk') || colLower.includes('bytes') || colLower.includes('size') || colLower.includes('free') || colLower.includes('avail') || colLower.includes('space') || colLower.includes('capacity')) {
    // If the value is large, format as bytes (KB, MB, GB, TB)
    if (num > 1000) {
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      const i = Math.floor(Math.log(num) / Math.log(k));
      const formatted = (num / Math.pow(k, i)).toFixed(2);
      return `${formatted} ${sizes[i]}`;
    }
  }
  
  // 3. Default formatting for numbers
  return num.toFixed(2);
}

function renderActiveDataTable(data) {
  const outputArea = document.getElementById('query-results-output');
  
  const ips = data.ips || [];
  const columns = data.columns || [];
  const rows = data.rows || [];
  
  if (ips.length === 0 || rows.length === 0) {
    outputArea.removeAttribute('style');
    outputArea.style.minHeight = '120px';
    outputArea.style.display = 'flex';
    outputArea.style.alignItems = 'center';
    outputArea.style.justifyContent = 'center';
    outputArea.style.border = '1px solid var(--app-border)';
    outputArea.style.borderRadius = '4px';
    outputArea.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px;">
        No telemetry matches found in database for the given time range.
      </div>
    `;
    return;
  }
  
  // 1. Build Sheets Tab Bar (Excel-like Sheet Tabs)
  let sheetsBarHtml = `
    <div class="excel-sheets-bar" style="display: flex; background: rgba(0,0,0,0.25); border-bottom: 1px solid var(--app-border); padding: 6px 12px 0 12px; gap: 4px; border-top-left-radius: 4px; border-top-right-radius: 4px; align-items: flex-end;">
      <div style="display: flex; gap: 4px; align-items: flex-end; width: 100%; border-bottom: 1px solid var(--app-border); padding-bottom: 0;">
  `;
  
  ips.forEach((ip, idx) => {
    const isFirst = idx === 0;
    const btnClass = isFirst ? 'sheet-tab active' : 'sheet-tab';
    const activeStyle = isFirst 
      ? 'background: var(--app-background); border: 1px solid var(--app-border); border-bottom: 1px solid var(--app-background); color: #58a6ff; font-weight: bold; border-top: 3px solid #58a6ff; margin-bottom: -1px; border-top-left-radius: 4px; border-top-right-radius: 4px; padding: 6px 16px; font-size: 11px; cursor: pointer;'
      : 'background: rgba(0,0,0,0.3); border: 1px solid var(--app-border); border-bottom: 1px solid var(--app-border); color: var(--text-muted); margin-bottom: 0; border-top-left-radius: 4px; border-top-right-radius: 4px; padding: 5px 16px; font-size: 11px; cursor: pointer;';
    
    sheetsBarHtml += `
      <button type="button" class="${btnClass}" data-ip="${ip}" onclick="switchQueryExplorerSheet('${ip}')" style="${activeStyle}">
        ${ip}
      </button>
    `;
  });
  
  sheetsBarHtml += `
      </div>
    </div>
  `;
  
  // 2. Build Tables (One for each IP)
  let tablesHtml = '';
  
  ips.forEach((ip, ipIdx) => {
    const isFirstIp = ipIdx === 0;
    const tableId = `sheet-table-${ip.replace(/\./g, '_')}`;
    const tableClass = isFirstIp ? 'query-explorer-sheet-table' : 'query-explorer-sheet-table hidden';
    
    let rowsHtml = '';
    
    rows.forEach(row => {
      const ipData = row[ip] || {};
      let colsHtml = '';
      
      columns.forEach(col => {
        const val = ipData[col];
        let displayVal = '-';
        let valStyle = '';
        
        if (val !== undefined && val !== null) {
          displayVal = formatMetricValue(val, col);
          
          if (typeof val === 'number') {
            // Dynamic styling based on warning levels
            const lowerCol = col.toLowerCase();
            if (lowerCol.includes('cpu') || lowerCol.includes('mem') || lowerCol.includes('ram') || lowerCol.includes('usage')) {
              if (val > 90) {
                valStyle = 'color: #ff7b72; font-weight: bold;'; 
              } else if (val > 75) {
                valStyle = 'color: #e3b341; font-weight: bold;'; 
              } else {
                valStyle = 'color: #56d364;'; 
              }
            }
          }
        }
        
        colsHtml += `<td style="padding: 8px; font-family: monospace; ${valStyle}">${displayVal}</td>`;
      });
      
      rowsHtml += `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 11.5px;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
          <td style="padding: 8px; font-family: monospace; color: var(--text-muted);">${row.timestampStr}</td>
          <td style="padding: 8px; font-family: monospace; color: var(--text-muted);">${ip}</td>
          ${colsHtml}
        </tr>
      `;
    });
    
    tablesHtml += `
      <div class="${tableClass}" id="${tableId}" style="max-height: calc(100vh - 290px); overflow: auto; background: transparent; border-bottom-left-radius: 4px; border-bottom-right-radius: 4px;">
        <table style="width: 100%; border-collapse: collapse; text-align: left; white-space: nowrap;">
          <thead>
            <tr style="border-bottom: 1px solid var(--app-border); background: var(--app-sidebar);">
              <th style="font-size: 10.5px; padding: 8px; color: var(--text-muted); font-weight: 600; width: 160px;">Timestamp</th>
              <th style="font-size: 10.5px; padding: 8px; color: var(--text-muted); font-weight: 600; width: 130px;">IP Address</th>
              ${columns.map(col => `<th style="font-size: 10.5px; padding: 8px; color: var(--text-muted); font-weight: 600;">${escapeHtml(col)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  });
  
  // Set output HTML table
  outputArea.removeAttribute('style');
  outputArea.className = 'table-wrapper';
  outputArea.style.background = 'transparent';
  outputArea.innerHTML = sheetsBarHtml + tablesHtml;
}

// Global switcher function for active IP Address sheet tab
window.switchQueryExplorerSheet = function(ip) {
  // Hide all sheet tables
  document.querySelectorAll('.query-explorer-sheet-table').forEach(tbl => {
    tbl.classList.add('hidden');
  });
  
  // Show active sheet table
  const targetTbl = document.getElementById(`sheet-table-${ip.replace(/\./g, '_')}`);
  if (targetTbl) {
    targetTbl.classList.remove('hidden');
  }
  
  // Update tab buttons styling
  document.querySelectorAll('.sheet-tab').forEach(btn => {
    const btnIp = btn.getAttribute('data-ip');
    if (btnIp === ip) {
      btn.className = 'sheet-tab active';
      btn.style.background = 'var(--app-background)';
      btn.style.borderBottom = '1px solid var(--app-background)';
      btn.style.color = '#58a6ff';
      btn.style.fontWeight = 'bold';
      btn.style.borderTop = '3px solid #58a6ff';
      btn.style.padding = '6px 16px';
      btn.style.marginBottom = '-1px';
    } else {
      btn.className = 'sheet-tab';
      btn.style.background = 'rgba(0,0,0,0.3)';
      btn.style.borderBottom = '1px solid var(--app-border)';
      btn.style.color = 'var(--text-muted)';
      btn.style.borderTop = '1px solid var(--app-border)';
      btn.style.padding = '5px 16px';
      btn.style.marginBottom = '0';
    }
  });
};

function exportActivePanelToExcel() {
  if (!activeQueryPanelId) return;
  exportPanelToExcel(activeQueryPanelId);
}


// Modal column inputs handlers
function addQueryColumnInput(name, query) {
  const container = document.getElementById('query-panel-columns-list');
  const index = container.children.length;
  
  const div = document.createElement('div');
  div.className = 'query-column-row';
  div.style.display = 'grid';
  div.style.gridTemplateColumns = '150px 1fr 40px';
  div.style.gap = '12px';
  div.style.alignItems = 'center';
  div.style.marginBottom = '12px';
  
  div.innerHTML = `
    <div>
      <input type="text" placeholder="e.g. CPU" class="query-col-name form-control" value="${escapeHtml(name)}" required style="background: var(--app-card-dark); border: 1px solid var(--app-border); color: var(--text-white); padding: 8px 12px; border-radius: 4px; font-size: 12px; width: 100%; box-sizing: border-box;">
    </div>
    <div>
      <textarea placeholder="PromQL: e.g. 100 - (avg by (instance) (irate(node_cpu_seconds_total{mode='idle'}[5m])) * 100)" class="query-col-expr form-control" required style="background: var(--app-card-dark); border: 1px solid var(--app-border); color: var(--text-white); padding: 8px 12px; border-radius: 4px; font-size: 12px; width: 100%; height: 55px; box-sizing: border-box; resize: vertical; font-family: monospace;"></textarea>
    </div>
    <div style="text-align: center;">
      <button type="button" class="btn btn-secondary" onclick="removeQueryColumnInput(this)" style="width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: #ff7b72; border-color: rgba(255,123,114,0.15);">
        &times;
      </button>
    </div>
  `;
  
  // Set textarea content correctly to handle raw string literals
  div.querySelector('.query-col-expr').value = query;
  
  container.appendChild(div);
}

function removeQueryColumnInput(btn) {
  const row = btn.closest('.query-column-row');
  if (row) {
    row.remove();
  }
}

// Modal open/close handlers
async function populateGrafanaConnectionsForQueryPanel() {
  const select = document.getElementById('query-panel-config-id');
  if (!select) return;
  
  // Fetch configurations list if empty
  if (grafanaConfigs.length === 0) {
    try {
      const res = await fetch('/api/v1/settings/grafana/configs');
      const r = await res.json();
      if (r.success && Array.isArray(r.data)) {
        grafanaConfigs = r.data;
      }
    } catch (_) {}
  }
  
  // Populate options
  select.innerHTML = '<option value="">-- Use Active Configuration --</option>';
  grafanaConfigs.forEach(c => {
    select.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)} (${c.host})</option>`;
  });
}

async function loadGrafanaDatasourcesForPanel() {
  const configSelect = document.getElementById('query-panel-config-id');
  const dsSelect = document.getElementById('query-panel-datasource-uid');
  
  dsSelect.innerHTML = '<option value="">Loading datasources...</option>';
  
  const configId = configSelect.value;
  const url = configId 
    ? `/api/v1/settings/grafana/datasources?configId=${configId}`
    : `/api/v1/settings/grafana/datasources`;
    
  try {
    const res = await fetch(url);
    const result = await res.json();
    
    if (res.ok && result.success && Array.isArray(result.data)) {
      const datasources = result.data;
      
      // Filter prometheus datasources or show all
      const promDatasources = datasources.filter(ds => ds.type === 'prometheus');
      
      if (promDatasources.length === 0 && datasources.length > 0) {
        dsSelect.innerHTML = '<option value="">-- Select Datasource --</option>';
        datasources.forEach(ds => {
          dsSelect.innerHTML += `<option value="${ds.uid}">${escapeHtml(ds.name)} (${ds.type})</option>`;
        });
      } else if (promDatasources.length > 0) {
        dsSelect.innerHTML = '<option value="">-- Select Prometheus Datasource --</option>';
        promDatasources.forEach(ds => {
          dsSelect.innerHTML += `<option value="${ds.uid}" selected>${escapeHtml(ds.name)}</option>`;
        });
      } else {
        dsSelect.innerHTML = '<option value="">No datasources found</option>';
      }
    } else {
      dsSelect.innerHTML = '<option value="">Failed to load datasources</option>';
    }
  } catch (error) {
    dsSelect.innerHTML = '<option value="">Connection error loading datasources</option>';
  }
}

function openAddQueryPanelModal() {
  document.getElementById('query-panel-modal-title').textContent = 'Add Query Panel';
  document.getElementById('query-panel-id').value = '';
  document.getElementById('query-panel-name').value = '';
  document.getElementById('query-panel-description').value = '';
  document.getElementById('query-panel-config-id').value = '';
  document.getElementById('query-panel-from').value = 'now-1h';
  document.getElementById('query-panel-to').value = 'now';
  document.getElementById('query-panel-step').value = '1m';
  
  document.getElementById('query-panel-columns-list').innerHTML = '';
  document.getElementById('query-test-feedback').classList.add('hidden');
  
  // Add two default metric columns for CPU and Memory
  addQueryColumnInput('CPU', '100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)');
  addQueryColumnInput('Memory', '(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100');
  
  // Load datasources
  loadGrafanaDatasourcesForPanel();
  
  document.getElementById('modal-query-panel').classList.add('active');
}

async function openEditQueryPanelModal(panelId) {
  const panel = queryPanels.find(p => p.id === panelId);
  if (!panel) return;
  
  document.getElementById('query-panel-modal-title').textContent = 'Edit Query Panel';
  document.getElementById('query-panel-id').value = panel.id;
  document.getElementById('query-panel-name').value = panel.name;
  document.getElementById('query-panel-description').value = panel.description || '';
  document.getElementById('query-panel-from').value = panel.timeRangeFrom;
  document.getElementById('query-panel-to').value = panel.timeRangeTo;
  document.getElementById('query-panel-step').value = panel.step;
  
  // We can select the config associated with this datasource if needed, but since active is default, we can leave config selection as default
  document.getElementById('query-panel-config-id').value = '';
  
  document.getElementById('query-panel-columns-list').innerHTML = '';
  document.getElementById('query-test-feedback').classList.add('hidden');
  
  panel.columns.forEach(col => {
    addQueryColumnInput(col.name, col.query);
  });
  
  // Set datasource list selection
  await loadGrafanaDatasourcesForPanel();
  document.getElementById('query-panel-datasource-uid').value = panel.datasourceUid;
  
  document.getElementById('modal-query-panel').classList.add('active');
}

function closeQueryPanelModal() {
  document.getElementById('modal-query-panel').classList.remove('active');
}

// Get columns list from modal form fields
function getColumnsFromModal() {
  const colElements = document.querySelectorAll('#query-panel-columns-list .query-column-row');
  const columns = [];
  
  colElements.forEach(el => {
    const nameInput = el.querySelector('.query-col-name');
    const exprInput = el.querySelector('.query-col-expr');
    
    if (nameInput && exprInput && nameInput.value.trim() !== '' && exprInput.value.trim() !== '') {
      columns.push({
        name: nameInput.value.trim(),
        query: exprInput.value.trim()
      });
    }
  });
  
  return columns;
}

// Test Query configuration (Dry Run)
async function testQueryPanelConfig() {
  const dsUid = document.getElementById('query-panel-datasource-uid').value;
  const timeFrom = document.getElementById('query-panel-from').value;
  const timeTo = document.getElementById('query-panel-to').value;
  const step = document.getElementById('query-panel-step').value;
  
  const columns = getColumnsFromModal();
  
  const feedback = document.getElementById('query-test-feedback');
  const title = document.getElementById('query-test-title');
  const desc = document.getElementById('query-test-desc');
  const testBtn = document.querySelector('button[onclick="testQueryPanelConfig()"]');
  const spinner = document.getElementById('spinner-test-query');
  
  if (!dsUid) {
    feedback.className = 'alert alert-error';
    title.textContent = 'Validation Error';
    desc.textContent = 'Please select a Target Datasource.';
    feedback.classList.remove('hidden');
    return;
  }
  
  if (columns.length === 0) {
    feedback.className = 'alert alert-error';
    title.textContent = 'Validation Error';
    desc.textContent = 'At least one metric column configuration is required.';
    feedback.classList.remove('hidden');
    return;
  }
  
  if (testBtn) testBtn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  feedback.classList.add('hidden');
  
  try {
    const res = await fetch('/api/v1/query-explorer/query-test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        datasourceUid: dsUid,
        timeRangeFrom: timeFrom,
        timeRangeTo: timeTo,
        step,
        columns
      })
    });
    
    const result = await res.json();
    
    if (res.ok && result.success) {
      const data = result.data;
      const ipsCount = (data.ips || []).length;
      const rowsCount = (data.rows || []).length;
      
      feedback.className = 'alert alert-configured';
      title.textContent = 'Dry Run Test Passed';
      desc.textContent = `Found ${ipsCount} servers / IP addresses with ${rowsCount} time-series data rows successfully.`;
      feedback.classList.remove('hidden');
    } else {
      feedback.className = 'alert alert-error';
      title.textContent = 'Dry Run Test Failed';
      desc.textContent = result.message || 'Failed to dry run metrics query.';
      feedback.classList.remove('hidden');
    }
  } catch (error) {
    feedback.className = 'alert alert-error';
    title.textContent = 'API Connection Error';
    desc.textContent = error.message;
    feedback.classList.remove('hidden');
  } finally {
    if (testBtn) testBtn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
  }
}

// Submit Panel save/update form
async function submitQueryPanelForm() {
  const id = document.getElementById('query-panel-id').value;
  const name = document.getElementById('query-panel-name').value;
  const description = document.getElementById('query-panel-description').value;
  const dsUid = document.getElementById('query-panel-datasource-uid').value;
  const timeFrom = document.getElementById('query-panel-from').value;
  const timeTo = document.getElementById('query-panel-to').value;
  const step = document.getElementById('query-panel-step').value;
  
  const columns = getColumnsFromModal();
  
  if (!name.trim()) {
    alert('Please enter a panel name.');
    return;
  }
  
  if (!dsUid) {
    alert('Please select a target datasource.');
    return;
  }
  
  if (columns.length === 0) {
    alert('Please add at least one metrics column configuration.');
    return;
  }
  
  const payload = {
    name,
    description,
    datasourceType: 'grafana',
    datasourceUid: dsUid,
    timeRangeFrom: timeFrom,
    timeRangeTo: timeTo,
    step,
    columns
  };
  
  const url = id ? `/api/v1/query-explorer/panels/${id}` : '/api/v1/query-explorer/panels';
  const method = id ? 'PUT' : 'POST';
  
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    
    if (res.ok && result.success) {
      closeQueryPanelModal();
      
      const savedPanel = result.data;
      
      // Update local queryPanels array
      const existingIdx = queryPanels.findIndex(p => p.id === savedPanel.id);
      if (existingIdx !== -1) {
        queryPanels[existingIdx] = savedPanel;
      } else {
        queryPanels.push(savedPanel);
      }
      
      // If we are currently viewing this panel in the results view, update its header info dynamically
      if (activeQueryPanelId === savedPanel.id) {
        document.getElementById('query-results-title').textContent = savedPanel.name;
        document.getElementById('query-results-desc').textContent = savedPanel.description || 'No description provided.';
        
        const cols = savedPanel.columns.map(c => c.name).join(', ');
        document.getElementById('query-results-cols-badge').textContent = `COLUMNS: ${cols.toUpperCase()}`;
        
        const timeInfo = `TIME: ${savedPanel.timeRangeFrom.toUpperCase()} TO ${savedPanel.timeRangeTo.toUpperCase()} (STEP: ${savedPanel.step.toUpperCase()})`;
        document.getElementById('query-results-time-badge').textContent = timeInfo;
        
        // Reset output area to prompt for running query since settings updated
        document.getElementById('query-results-output').innerHTML = `
          <div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px;">
            Click "Run Query" button above to fetch telemetry metrics from Grafana with the updated settings.
          </div>
        `;
        document.getElementById('btn-results-export').classList.add('hidden');
      } else {
        // Go back to list view for newly created panels
        document.getElementById('query-explorer-results-container').classList.add('hidden');
        document.getElementById('query-explorer-list-container').classList.remove('hidden');
        activeQueryPanelId = null;
      }
      
      loadQueryPanels();
      addLog('Query Explorer', `Successfully saved query panel "${name}".`, 'SUCCESS');
    } else {
      alert('Failed to save panel: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    alert('API connection error: ' + error.message);
  }
}

// Delete query panel
async function deleteQueryPanel(panelId) {
  if (!confirm('Apakah Anda yakin ingin menghapus panel query explorer ini?')) return;
  
  try {
    const res = await fetch(`/api/v1/query-explorer/panels/${panelId}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    
    if (res.ok && result.success) {
      loadQueryPanels();
      addLog('Query Explorer', 'Successfully deleted query panel.', 'SUCCESS');
    } else {
      alert('Failed to delete query panel: ' + (result.message || 'Unknown error'));
    }
  } catch (error) {
    alert('API connection error: ' + error.message);
  }
}
// Export dropdown handlers
window.toggleExportDropdown = function(event) {
  event.stopPropagation();
  const menu = document.getElementById('export-dropdown-menu');
  if (menu) {
    const isVisible = menu.style.display === 'block';
    menu.style.display = isVisible ? 'none' : 'block';
  }
};

window.addEventListener('click', function() {
  const menu = document.getElementById('export-dropdown-menu');
  if (menu) {
    menu.style.display = 'none';
  }
});

function exportActivePanelToExcel() {
  if (!activeQueryPanelId) return;
  exportPanelToExcel(activeQueryPanelId);
}

function exportPanelToExcel(panelId) {
  const data = panelQueryCache[panelId];
  if (!data) return;
  
  const ips = data.ips || [];
  const columns = data.columns || [];
  const rows = data.rows || [];
  
  if (ips.length === 0 || rows.length === 0) return;

  const exportFn = () => {
    const wb = XLSX.utils.book_new();
    
    ips.forEach(ip => {
      const sheetData = [];
      const headers = ['Timestamp', 'IP Address', ...columns];
      sheetData.push(headers);
      
      rows.forEach(row => {
        const ipData = row[ip] || {};
        const dataRow = [
          row.timestampStr,
          ip
        ];
        
        columns.forEach(col => {
          const val = ipData[col];
          if (val !== undefined && val !== null) {
            dataRow.push(formatMetricValue(val, col));
          } else {
            dataRow.push('');
          }
        });
        
        sheetData.push(dataRow);
      });
      
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      const sheetName = ip.substring(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
    
    XLSX.writeFile(wb, `query_explorer_data_${panelId}.xlsx`);
  };

  if (typeof XLSX === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = exportFn;
    document.head.appendChild(script);
  } else {
    exportFn();
  }
}

window.exportActivePanelToCsv = function() {
  if (!activeQueryPanelId) return;
  const data = panelQueryCache[activeQueryPanelId];
  if (!data) return;
  
  const ips = data.ips || [];
  const columns = data.columns || [];
  const rows = data.rows || [];
  
  if (ips.length === 0 || rows.length === 0) return;
  
  const csvRows = [];
  const headers = ['Timestamp', 'IP Address', ...columns];
  csvRows.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));
  
  rows.forEach(row => {
    ips.forEach(ip => {
      const ipData = row[ip] || {};
      const csvRow = [row.timestampStr, ip];
      columns.forEach(col => {
        const val = ipData[col];
        csvRow.push(val !== undefined && val !== null ? formatMetricValue(val, col) : '');
      });
      csvRows.push(csvRow.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    });
  });
  
  const csvContent = "\ufeff" + csvRows.join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `query_explorer_data_${activeQueryPanelId}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

window.exportActivePanelToTxt = function() {
  if (!activeQueryPanelId) return;
  const data = panelQueryCache[activeQueryPanelId];
  if (!data) return;
  
  const ips = data.ips || [];
  const columns = data.columns || [];
  const rows = data.rows || [];
  
  if (ips.length === 0 || rows.length === 0) return;
  
  let txt = `QUERY METRICS EXPORT\n`;
  txt += `Panel: ${data.name || activeQueryPanelId}\n`;
  txt += `Date: ${new Date().toLocaleString()}\n`;
  txt += "=".repeat(50) + "\n\n";
  
  ips.forEach(ip => {
    txt += `Server IP: ${ip}\n`;
    txt += "-".repeat(50) + "\n";
    txt += "Timestamp\t" + columns.join("\t") + "\n";
    
    rows.forEach(row => {
      const ipData = row[ip] || {};
      const vals = columns.map(col => {
        const val = ipData[col];
        return val !== undefined && val !== null ? formatMetricValue(val, col) : '-';
      });
      txt += `${row.timestampStr}\t${vals.join("\t")}\n`;
    });
    txt += "\n";
  });
  
  const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `query_explorer_data_${activeQueryPanelId}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ==========================================
// CHART EXPORT OPTIONS AND LIVE PREVIEW
// ==========================================
const themeStyles = {
  grafana: {
    bg: '#0b0c10',
    text: '#c9d1d9',
    axis: '#8b949e',
    split: '#21262d'
  },
  midnight: {
    bg: '#1a1b26',
    text: '#a9b1d6',
    axis: '#787c99',
    split: '#24283b'
  },
  slate: {
    bg: '#1f1f1f',
    text: '#e0e0e0',
    axis: '#888888',
    split: '#333333'
  },
  light: {
    bg: '#ffffff',
    text: '#333333',
    axis: '#666666',
    split: '#e0e0e0'
  }
};

const colorPalettes = {
  grafana: ['#73BF69', '#5794F2', '#FADE2A', '#FF9E1B', '#F2495C', '#B877D9', '#70DBFF', '#E075B6'],
  cool: ['#00f2fe', '#4facfe', '#7000ff', '#b18cf4', '#0000fe'],
  warm: ['#ff5e62', '#ff9966', '#ff4e50', '#f9d423', '#e74c3c'],
  neon: ['#39ff14', '#ff007f', '#00ffff', '#ffff00', '#ff00ff'],
  monochrome: ['#58a6ff', '#1f6feb', '#104eb2', '#8b949e', '#c9d1d9']
};

let previewChartInstance = null;
let exportChartData = null;
let exportChartDataTimeRange = 'default';
let exportChartDataStep = 'auto';

function updateExportDropdowns(data) {
  const dropdownContent = document.getElementById('export-chart-ip-dropdown-content');
  const metricSelect = document.getElementById('export-chart-metric-select');
  if (!dropdownContent || !metricSelect) return;
  
  const ips = data.ips || [];
  const columns = data.columns || [];
  
  // Save current checked state
  const previousCheckedItems = document.querySelectorAll('.ip-checkbox-item');
  const hasPrevious = previousCheckedItems.length > 0;
  const checkedIps = new Set();
  if (hasPrevious) {
    previousCheckedItems.forEach(cb => {
      if (cb.checked) checkedIps.add(cb.value);
    });
  }
  
  // 1. Populate IP Checkboxes
  dropdownContent.innerHTML = '';
  
  // "Select All" Option
  const allRow = document.createElement('div');
  allRow.style.padding = '6px 12px';
  allRow.style.display = 'flex';
  allRow.style.alignItems = 'center';
  allRow.style.gap = '8px';
  allRow.style.cursor = 'pointer';
  allRow.onmouseover = function() { this.style.background = 'rgba(255,255,255,0.05)'; };
  allRow.onmouseout = function() { this.style.background = 'transparent'; };
  allRow.onclick = function(e) {
    e.stopPropagation();
    const allCheckbox = document.getElementById('ip-checkbox-all');
    if (allCheckbox) {
      allCheckbox.checked = !allCheckbox.checked;
      toggleAllIpCheckboxes(allCheckbox.checked);
    }
  };
  
  const allCheckedByDefault = hasPrevious ? (checkedIps.size === previousCheckedItems.length) : true;
  allRow.innerHTML = `
    <input type="checkbox" id="ip-checkbox-all" ${allCheckedByDefault ? 'checked' : ''} style="cursor: pointer; pointer-events: none;">
    <span style="font-size: 12px; color: var(--text-white);">Select All</span>
  `;
  dropdownContent.appendChild(allRow);
  
  // Individual IP Options
  ips.forEach(ip => {
    const ipRow = document.createElement('div');
    ipRow.style.padding = '6px 12px';
    ipRow.style.display = 'flex';
    ipRow.style.alignItems = 'center';
    ipRow.style.gap = '8px';
    ipRow.style.cursor = 'pointer';
    ipRow.onmouseover = function() { this.style.background = 'rgba(255,255,255,0.05)'; };
    ipRow.onmouseout = function() { this.style.background = 'transparent'; };
    
    ipRow.onclick = function(e) {
      e.stopPropagation();
      const cb = document.getElementById(`ip-checkbox-${ip.replace(/\./g, '-')}`);
      if (cb) {
        cb.checked = !cb.checked;
        onIpCheckboxChange();
      }
    };
    
    const isChecked = hasPrevious ? checkedIps.has(ip) : true;
    ipRow.innerHTML = `
      <input type="checkbox" class="ip-checkbox-item" id="ip-checkbox-${ip.replace(/\./g, '-')}" value="${ip}" ${isChecked ? 'checked' : ''} style="cursor: pointer; pointer-events: none;">
      <span style="font-size: 12px; color: var(--text-white);">${ip}</span>
    `;
    dropdownContent.appendChild(ipRow);
  });
  
  // Update button label
  updateExportIpDropdownLabel();
  
  // 2. Populate Metric select dropdown
  const currentMetric = metricSelect.value;
  metricSelect.innerHTML = '<option value="all">All Metrics</option>';
  columns.forEach(col => {
    metricSelect.innerHTML += `<option value="${col}">${col}</option>`;
  });
  if (currentMetric === 'all' || columns.includes(currentMetric)) {
    metricSelect.value = currentMetric;
  } else {
    metricSelect.value = 'all';
  }
}

window.toggleExportIpDropdown = function(e) {
  if (e) e.stopPropagation();
  const content = document.getElementById('export-chart-ip-dropdown-content');
  if (content) {
    content.style.display = content.style.display === 'block' ? 'none' : 'block';
  }
};

window.toggleAllIpCheckboxes = function(checked) {
  const items = document.querySelectorAll('.ip-checkbox-item');
  items.forEach(item => {
    item.checked = checked;
  });
  updateExportIpDropdownLabel();
};

window.onIpCheckboxChange = function() {
  const items = document.querySelectorAll('.ip-checkbox-item');
  const allCheckbox = document.getElementById('ip-checkbox-all');
  
  const allChecked = Array.from(items).every(item => item.checked);
  if (allCheckbox) {
    allCheckbox.checked = allChecked;
  }
  
  updateExportIpDropdownLabel();
};

window.updateExportIpDropdownLabel = function() {
  const items = document.querySelectorAll('.ip-checkbox-item');
  const label = document.getElementById('export-chart-ip-dropdown-label');
  if (!label) return;
  
  const checkedItems = Array.from(items).filter(item => item.checked).map(item => item.value);
  
  if (checkedItems.length === 0) {
    label.innerText = 'No IP Address Selected';
  } else if (checkedItems.length === items.length) {
    label.innerText = 'All IP Addresses';
  } else if (checkedItems.length <= 2) {
    label.innerText = checkedItems.join(', ');
  } else {
    label.innerText = `${checkedItems.length} IPs Selected`;
  }
};

document.addEventListener('click', function(e) {
  const content = document.getElementById('export-chart-ip-dropdown-content');
  const btn = document.getElementById('export-chart-ip-dropdown-btn');
  if (content && content.style.display === 'block') {
    if (btn && btn.contains(e.target)) return;
    if (!content.contains(e.target)) {
      content.style.display = 'none';
    }
  }
});

async function fetchExportChartDataForTimeRange(selectedTimeRange, selectedStep) {
  if (!activeQueryPanelId) return;
  
  const previewContainer = document.getElementById('export-chart-preview-container');
  if (previewContainer) {
    previewContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px; display: flex; align-items: center; justify-content: center; height: 100%;">
        <span class="spinner" style="margin-right: 8px;"></span> Querying metrics for new time range...
      </div>
    `;
  }
  
  if (previewChartInstance) {
    previewChartInstance.dispose();
    previewChartInstance = null;
  }
  
  if (selectedTimeRange === 'default' && selectedStep === 'auto') {
    exportChartData = JSON.parse(JSON.stringify(panelQueryCache[activeQueryPanelId]));
    exportChartDataTimeRange = 'default';
    exportChartDataStep = 'auto';
    updateExportDropdowns(exportChartData);
    initPreviewChartInstance();
    updateChartPreview();
    return;
  }
  
  try {
    const body = {};
    if (selectedTimeRange !== 'default') {
      body.timeRangeFrom = selectedTimeRange;
      body.timeRangeTo = 'now';
    }
    
    // Determine step based on time range / selectedStep
    let step = selectedStep;
    if (selectedStep === 'auto') {
      if (selectedTimeRange === 'now-3h') step = '1m';
      else if (selectedTimeRange === 'now-6h') step = '5m';
      else if (selectedTimeRange === 'now-12h') step = '5m';
      else if (selectedTimeRange === 'now-24h') step = '15m';
      else if (selectedTimeRange === 'now-2d') step = '30m';
      else if (selectedTimeRange === 'now-7d') step = '1h';
      else if (selectedTimeRange === 'now-14d') step = '3h';
      else if (selectedTimeRange === 'now-30d') step = '6h';
      else step = '1m'; // default fallback for default timerange
    }
    
    body.step = step;
    
    const res = await fetch(`/api/v1/query-explorer/panels/${activeQueryPanelId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    const result = await res.json();
    
    if (res.ok && result.success) {
      exportChartData = result.data;
      exportChartDataTimeRange = selectedTimeRange;
      exportChartDataStep = selectedStep;
      updateExportDropdowns(exportChartData);
      initPreviewChartInstance();
      updateChartPreview();
    } else {
      if (previewContainer) {
        previewContainer.innerHTML = `
          <div style="text-align: center; color: #ff7b72; font-size: 12px; padding: 24px; display: flex; align-items: center; justify-content: center; height: 100%;">
            <strong>Query Error:</strong> ${result.message || 'Failed to fetch query results'}
          </div>
        `;
      }
    }
  } catch (error) {
    if (previewContainer) {
      previewContainer.innerHTML = `
        <div style="text-align: center; color: #ff7b72; font-size: 12px; padding: 24px; display: flex; align-items: center; justify-content: center; height: 100%;">
          <strong>Connection Error:</strong> ${error.message}
        </div>
      `;
    }
  }
}

window.applyExportChartSettings = async function() {
  const timeRangeSelect = document.getElementById('export-chart-timerange-select');
  const selectedTimeRange = timeRangeSelect ? timeRangeSelect.value : 'default';
  
  const stepSelect = document.getElementById('export-chart-step-select');
  const selectedStep = stepSelect ? stepSelect.value : 'auto';
  
  const applyBtn = document.getElementById('btn-export-chart-apply');
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.innerHTML = '<span class="spinner" style="margin-right: 6px; width: 10px; height: 10px;"></span> APPLYING...';
  }
  
  try {
    if (selectedTimeRange !== exportChartDataTimeRange || selectedStep !== exportChartDataStep) {
      await fetchExportChartDataForTimeRange(selectedTimeRange, selectedStep);
    } else {
      updateChartPreview();
    }
  } finally {
    if (applyBtn) {
      applyBtn.disabled = false;
      applyBtn.innerHTML = `
        <svg style="width: 12px; height: 12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
        </svg>
        APPLY CONFIGURATION
      `;
    }
  }
};

function initPreviewChartInstance() {
  const container = document.getElementById('export-chart-preview-container');
  if (!container) return;
  
  if (previewChartInstance) {
    previewChartInstance.dispose();
    previewChartInstance = null;
  }
  
  container.innerHTML = '';
  previewChartInstance = echarts.init(container, 'dark');
}

function updateChartPreview() {
  if (!previewChartInstance) return;
  if (!activeQueryPanelId) return;
  const data = exportChartData;
  if (!data) return;
  
  const ips = data.ips || [];
  const columns = data.columns || [];
  const rows = data.rows || [];
  
  if (ips.length === 0 || rows.length === 0) return;
  
  const ipCheckboxes = document.querySelectorAll('.ip-checkbox-item');
  const targetIps = Array.from(ipCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
  const selectedMetric = document.getElementById('export-chart-metric-select').value;
  const customTitle = document.getElementById('export-chart-title-input').value;
  const bgTheme = document.getElementById('export-chart-bg-select').value;
  const palette = document.getElementById('export-chart-palette-select').value;
  
  const theme = themeStyles[bgTheme] || themeStyles.grafana;
  const colors = colorPalettes[palette] || colorPalettes.grafana;
  
  const rawTimestamps = rows.map(r => r.timestampStr).reverse();
  
  let timeRangeText = '';
  if (rawTimestamps.length > 0) {
    const startTime = rawTimestamps[0];
    const endTime = rawTimestamps[rawTimestamps.length - 1];
    timeRangeText = `Time Range: ${startTime} - ${endTime}`;
  }
  
  const shortTimestamps = rawTimestamps.map(ts => {
    const parts = ts.split(' ');
    if (parts.length === 2) {
      const dateParts = parts[0].split('-');
      const timeParts = parts[1].split(':');
      if (dateParts.length === 3 && timeParts.length === 3) {
        return `${dateParts[1]}-${dateParts[2]} ${timeParts[0]}:${timeParts[1]}`;
      }
    }
    return ts;
  });
  
  const series = [];
  const targetColumns = selectedMetric === 'all' ? columns : [selectedMetric];
  
  targetIps.forEach(ip => {
    targetColumns.forEach(col => {
      const seriesData = rows.map(row => {
        const ipData = row[ip] || {};
        return ipData[col] !== undefined ? ipData[col] : null;
      }).reverse();
      
      series.push({
        name: `${ip} - ${col}`,
        type: 'line',
        data: seriesData,
        smooth: true,
        showSymbol: false
      });
    });
  });
  
  const option = {
    backgroundColor: theme.bg,
    color: colors,
    title: {
      text: customTitle || 'Metrics Trend Chart',
      subtext: timeRangeText,
      textStyle: { color: theme.text, fontSize: 13 },
      subtextStyle: { color: theme.axis, fontSize: 9 },
      left: 'center',
      top: 5
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: {
          show: false
        },
        lineStyle: {
          color: theme.axis,
          width: 1,
          type: 'dashed'
        }
      },
      formatter: function(params) {
        if (!params || params.length === 0) return '';
        const timestamp = params[0].name;
        let html = `<div style="font-weight: 600; margin-bottom: 4px; border-bottom: 1px solid ${theme.split}; padding-bottom: 4px; font-size: 11px;">${timestamp}</div>`;
        params.forEach(item => {
          const nameParts = item.seriesName.split(' - ');
          const colName = nameParts.length > 1 ? nameParts[1] : '';
          const formattedValue = formatMetricValue(item.value, colName);
          html += `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; font-size: 11px; margin: 3px 0;">
              <span style="color: ${theme.text}">${item.marker} ${item.seriesName}</span>
              <span style="font-weight: 600; color: ${theme.text}">${formattedValue}</span>
            </div>
          `;
        });
        return html;
      },
      backgroundColor: theme.bg === '#ffffff' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(20, 20, 20, 0.95)',
      borderColor: theme.split,
      textStyle: {
        color: theme.text,
        fontSize: 11
      }
    },
    legend: {
      data: series.map(s => s.name),
      textStyle: { color: theme.text, fontSize: 9 },
      bottom: 10,
      type: 'scroll',
      width: '90%'
    },
    grid: {
      left: '4%',
      right: '4%',
      bottom: 60,
      top: 55,
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: shortTimestamps,
      axisLabel: { 
        color: theme.axis, 
        fontSize: 9,
        rotate: 15,
        interval: 'auto',
        hideOverlap: true
      },
      axisLine: { lineStyle: { color: theme.split } }
    },
    yAxis: {
      type: 'value',
      axisLabel: { 
        color: theme.axis, 
        fontSize: 9,
        formatter: function(value) {
          if (targetColumns.length === 1) {
            return formatMetricValue(value, targetColumns[0]);
          }
          return value;
        }
      },
      splitLine: { lineStyle: { color: theme.split } }
    },
    series: series
  };
  
  previewChartInstance.setOption(option, true);
}

window.openExportChartModal = function() {
  if (!activeQueryPanelId) return;
  const data = panelQueryCache[activeQueryPanelId];
  if (!data) return;
  
  exportChartData = JSON.parse(JSON.stringify(data));
  
  // Populate Title
  document.getElementById('export-chart-title-input').value = exportChartData.name || 'Metrics Trend Chart';
  
  // Populate dropdowns & checkboxes
  updateExportDropdowns(exportChartData);
  
  // Set defaults for theme & palette
  document.getElementById('export-chart-bg-select').value = 'grafana';
  document.getElementById('export-chart-palette-select').value = 'grafana';
  
  // Show modal
  document.getElementById('modal-export-chart').classList.add('active');
  
  // Set default time range & step
  const timeRangeSelect = document.getElementById('export-chart-timerange-select');
  if (timeRangeSelect) {
    timeRangeSelect.value = 'default';
  }
  const stepSelect = document.getElementById('export-chart-step-select');
  if (stepSelect) {
    stepSelect.value = 'auto';
  }
  
  exportChartDataTimeRange = 'default';
  exportChartDataStep = 'auto';
  
  // Load ECharts and render preview
  const previewContainer = document.getElementById('export-chart-preview-container');
  previewContainer.innerHTML = `
    <div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px;">
      <span class="spinner" style="margin-right: 8px;"></span> Loading chart preview...
    </div>
  `;
  
  if (typeof echarts === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
    script.onload = () => {
      initPreviewChartInstance();
      updateChartPreview();
    };
    document.head.appendChild(script);
  } else {
    setTimeout(() => {
      initPreviewChartInstance();
      updateChartPreview();
    }, 150);
  }
};

window.closeExportChartModal = function() {
  if (previewChartInstance) {
    previewChartInstance.dispose();
    previewChartInstance = null;
  }
  document.getElementById('modal-export-chart').classList.remove('active');
};

window.submitExportChart = function() {
  const ipCheckboxes = document.querySelectorAll('.ip-checkbox-item');
  const selectedIps = Array.from(ipCheckboxes).filter(cb => cb.checked).map(cb => cb.value);
  const metricSelect = document.getElementById('export-chart-metric-select').value;
  const customTitle = document.getElementById('export-chart-title-input').value;
  const bgTheme = document.getElementById('export-chart-bg-select').value;
  const palette = document.getElementById('export-chart-palette-select').value;
  
  closeExportChartModal();
  exportActivePanelToChartImageWithOptions(selectedIps, metricSelect, customTitle, bgTheme, palette);
};
 
window.exportActivePanelToChartImageWithOptions = function(selectedIp, selectedMetric, customTitle, bgTheme, palette) {
  if (!activeQueryPanelId) return;
  const data = exportChartData;
  if (!data) return;
  
  const ips = data.ips || [];
  const columns = data.columns || [];
  const rows = data.rows || [];
  
  if (ips.length === 0 || rows.length === 0) return;
  
  let targetIps = [];
  if (Array.isArray(selectedIp)) {
    targetIps = selectedIp;
  } else if (selectedIp && selectedIp !== 'all') {
    targetIps = [selectedIp];
  } else {
    targetIps = ips;
  }
  
  const processChartExport = () => {
    const tempDiv = document.createElement('div');
    tempDiv.style.width = '1200px';
    tempDiv.style.height = '700px';
    tempDiv.style.position = 'absolute';
    tempDiv.style.left = '-9999px';
    tempDiv.style.top = '-9999px';
    document.body.appendChild(tempDiv);
    
    const chart = echarts.init(tempDiv, 'dark');
    
    const theme = themeStyles[bgTheme] || themeStyles.grafana;
    const colors = colorPalettes[palette] || colorPalettes.grafana;
    
    const rawTimestamps = rows.map(r => r.timestampStr).reverse();
    
    let timeRangeText = '';
    if (rawTimestamps.length > 0) {
      const startTime = rawTimestamps[0];
      const endTime = rawTimestamps[rawTimestamps.length - 1];
      timeRangeText = `Time Range: ${startTime} - ${endTime}`;
    }

    const shortTimestamps = rawTimestamps.map(ts => {
      const parts = ts.split(' ');
      if (parts.length === 2) {
        const dateParts = parts[0].split('-');
        const timeParts = parts[1].split(':');
        if (dateParts.length === 3 && timeParts.length === 3) {
          return `${dateParts[1]}-${dateParts[2]} ${timeParts[0]}:${timeParts[1]}`;
        }
      }
      return ts;
    });
    
    const series = [];
    const targetColumns = selectedMetric === 'all' ? columns : [selectedMetric];
    
    targetIps.forEach(ip => {
      targetColumns.forEach(col => {
        const seriesData = rows.map(row => {
          const ipData = row[ip] || {};
          return ipData[col] !== undefined ? ipData[col] : null;
        }).reverse();
        
        series.push({
          name: `${ip} - ${col}`,
          type: 'line',
          data: seriesData,
          smooth: true,
          showSymbol: false
        });
      });
    });
    
    const option = {
      animation: false,
      backgroundColor: theme.bg,
      color: colors,
      title: {
        text: customTitle || 'Metrics Trend Chart',
        subtext: timeRangeText,
        textStyle: { color: theme.text, fontSize: 16 },
        subtextStyle: { color: theme.axis, fontSize: 11 },
        left: 'center',
        top: 15
      },
      legend: {
        data: series.map(s => s.name),
        textStyle: { color: theme.text, fontSize: 11 },
        bottom: 15,
        type: 'scroll',
        width: '90%'
      },
      grid: {
        left: '5%',
        right: '5%',
        bottom: 80,
        top: 75,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: shortTimestamps,
        axisLabel: { 
          color: theme.axis, 
          fontSize: 10,
          rotate: 15,
          interval: 'auto',
          hideOverlap: true
        },
        axisLine: { lineStyle: { color: theme.split } }
      },
      yAxis: {
        type: 'value',
        axisLabel: { 
          color: theme.axis, 
          fontSize: 10,
          formatter: function(value) {
            if (targetColumns.length === 1) {
              return formatMetricValue(value, targetColumns[0]);
            }
            return value;
          }
        },
        splitLine: { lineStyle: { color: theme.split } }
      },
      series: series
    };
    
    chart.setOption(option);
    
    setTimeout(() => {
      const imgUrl = chart.getDataURL({
        type: 'png',
        pixelRatio: 2,
        excludeComponents: ['toolbox']
      });
      
      const link = document.createElement('a');
      link.href = imgUrl;
      
      let filename = `query_explorer_chart_${activeQueryPanelId}`;
      if (Array.isArray(selectedIp)) {
        if (selectedIp.length === 1) {
          filename += `_${selectedIp[0].replace(/\./g, '_')}`;
        } else if (selectedIp.length < ips.length) {
          filename += `_selected_ips`;
        }
      } else if (selectedIp && selectedIp !== 'all') {
        filename += `_${selectedIp.replace(/\./g, '_')}`;
      }
      if (selectedMetric !== 'all') filename += `_${selectedMetric.toLowerCase()}`;
      filename += '.png';
      
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      chart.dispose();
      document.body.removeChild(tempDiv);
    }, 300);
  };
  
  if (typeof echarts === 'undefined') {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
    script.onload = processChartExport;
    document.head.appendChild(script);
  } else {
    processChartExport();
  }
};


// ==========================================
// EXPLORE METRICS LIBRARY FUNCTIONALITY
// ==========================================
async function openExploreMetricsModal() {
  const dsUid = document.getElementById('query-panel-datasource-uid').value;
  if (!dsUid) {
    alert('Please select a target datasource first.');
    return;
  }
  
  document.getElementById('explore-metrics-search').value = '';
  document.getElementById('modal-explore-metrics').classList.add('active');
  
  // Load default metrics list (empty query)
  await loadMetricsLibrary('');
}

function closeExploreMetricsModal() {
  document.getElementById('modal-explore-metrics').classList.remove('active');
}

async function loadMetricsLibrary(queryStr = '') {
  const dsUid = document.getElementById('query-panel-datasource-uid').value;
  const listEl = document.getElementById('explore-metrics-list');
  const loadingEl = document.getElementById('explore-metrics-loading');
  
  loadingEl.classList.remove('hidden');
  listEl.innerHTML = '';
  
  try {
    const res = await fetch(`/api/v1/query-explorer/metadata?datasourceUid=${dsUid}&query=${encodeURIComponent(queryStr)}`);
    const result = await res.json();
    
    if (res.ok && result.success) {
      const data = result.data || [];
      
      if (data.length === 0) {
        listEl.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; padding: 30px; color: var(--text-muted);">
              No metrics found matching "${escapeHtml(queryStr)}".
            </td>
          </tr>
        `;
        return;
      }
      
      let html = '';
      data.forEach(item => {
        // Prettify metric name for the column name input (convert snake_case to Title Case/Upper Case and remove common prefixes)
        let nameSuggestion = item.metric
          .replace(/^node_/, '')
          .replace(/_total$/, '')
          .replace(/_seconds$/, '')
          .replace(/_bytes$/, '')
          .replace(/_/g, ' ')
          .toUpperCase();
        
        // Truncate name suggestion if too long
        if (nameSuggestion.length > 25) {
          nameSuggestion = nameSuggestion.substring(0, 22) + '...';
        }
        
        // Escape single quotes for inline JS call
        const escapedMetric = escapeHtml(item.metric);
        const escapedName = escapeHtml(nameSuggestion);
        
        html += `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); cursor: default;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
            <td style="padding: 8px; text-align: center;">
              <button type="button" class="btn btn-secondary" onclick="addMetricFromLibrary('${escapedName}', '${escapedMetric}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: #58a6ff; border-color: rgba(88,166,255,0.15);" title="Add metric to panel columns">
                +
              </button>
            </td>
            <td style="padding: 8px; font-weight: 600; color: var(--text-white); word-break: break-all; font-family: monospace;">${escapedMetric}</td>
            <td style="padding: 8px;">
              <span class="status-badge" style="background: rgba(88, 166, 255, 0.1); color: #58a6ff; padding: 2px 6px; font-size: 9.5px; text-transform: uppercase;">${escapeHtml(item.type)}</span>
            </td>
            <td style="padding: 8px; color: var(--text-muted); line-height: 1.4;">${escapeHtml(item.help)}</td>
          </tr>
        `;
      });
      listEl.innerHTML = html;
    } else {
      listEl.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 30px; color: #ff7b72;">
            Failed to load metrics metadata: ${result.message || 'Unknown error'}
          </td>
        </tr>
      `;
    }
  } catch (error) {
    listEl.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; padding: 30px; color: #ff7b72;">
          Connection error: ${error.message}
        </td>
      </tr>
    `;
  } finally {
    loadingEl.classList.add('hidden');
  }
}

let searchDebounceTimeout = null;
function searchMetricsLibrary() {
  if (searchDebounceTimeout) {
    clearTimeout(searchDebounceTimeout);
  }
  
  searchDebounceTimeout = setTimeout(() => {
    const q = document.getElementById('explore-metrics-search').value;
    loadMetricsLibrary(q);
  }, 300);
}

function addMetricFromLibrary(colName, metricQuery) {
  addQueryColumnInput(colName, metricQuery);
  addLog('Query Explorer', `Added metric "${metricQuery}" to columns.`, 'SUCCESS');
}





