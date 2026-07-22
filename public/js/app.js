// Endpoints
const API_SETTINGS_URL = '/api/v1/settings/grafana';

// ==========================================
// AUTHENTICATION & SESSION MANAGEMENT
// ==========================================

// Monkeypatch fetch to automatically append Bearer token
const originalFetch = window.fetch;
window.fetch = async function(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  
  const token = localStorage.getItem('hephaestus_session_token');
  if (token) {
    if (options.headers instanceof Headers) {
      options.headers.set('Authorization', `Bearer ${token}`);
    } else {
      options.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  return originalFetch(url, options);
};

function showLoginScreen() {
  localStorage.removeItem('hephaestus_session_token');
  const loginContainer = document.getElementById('login-container');
  const appLayout = document.getElementById('app-layout');
  if (loginContainer) loginContainer.style.display = 'flex';
  if (appLayout) appLayout.style.display = 'none';
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  if (usernameInput) usernameInput.value = '';
  if (passwordInput) passwordInput.value = '';
  const feedback = document.getElementById('login-feedback');
  if (feedback) feedback.classList.add('hidden');
}

function showMainApp(user) {
  const loginContainer = document.getElementById('login-container');
  const appLayout = document.getElementById('app-layout');
  if (loginContainer) loginContainer.style.display = 'none';
  if (appLayout) appLayout.style.display = 'flex';
  
  const avatar = document.getElementById('current-user-avatar');
  const nameEl = document.getElementById('current-user-name');
  const roleEl = document.getElementById('current-user-role');
  
  if (nameEl) nameEl.textContent = user.username;
  if (roleEl) roleEl.textContent = user.role;
  if (avatar) avatar.textContent = user.username.substring(0, 3).toLowerCase();
  
  initAppOnce();
}

// === SETUP WIZARD ===
async function checkSetupStatus() {
  try {
    const res = await fetch('/api/v1/setup/status');
    const data = await res.json();
    if (data.success && data.needsSetup) {
      document.getElementById('setup-container').style.display = 'flex';
      document.getElementById('login-container').style.display = 'none';
    }
  } catch (e) {
    console.log('Setup check failed, continuing to login');
  }
}

window.handleSetupSubmit = async function(event) {
  event.preventDefault();
  const username = document.getElementById('setup-username').value.trim();
  const email = document.getElementById('setup-email').value.trim();
  const password = document.getElementById('setup-password').value;
  const feedback = document.getElementById('setup-feedback');
  const btn = document.getElementById('setup-submit-btn');

  feedback.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  try {
    const res = await fetch('/api/v1/setup/create-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (data.success) {
      feedback.style.background = 'rgba(35, 134, 54, 0.15)';
      feedback.style.borderColor = 'rgba(46, 160, 67, 0.4)';
      feedback.style.color = '#3fb950';
      feedback.textContent = 'Admin created! Redirecting to login...';
      feedback.classList.remove('hidden');
      setTimeout(() => {
        document.getElementById('setup-container').style.display = 'none';
        document.getElementById('login-container').style.display = 'flex';
      }, 1500);
    } else {
      feedback.textContent = data.message || 'Failed to create admin user.';
      feedback.classList.remove('hidden');
    }
  } catch (e) {
    feedback.textContent = 'Connection error: ' + e.message;
    feedback.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Admin & Start';
  }
};

// === UPDATE SYSTEM ===
async function checkForUpdates() {
  const status = document.getElementById('system-update-status');
  const applyBtn = document.getElementById('system-update-apply-btn');
  if (!status || !applyBtn) return;
  status.textContent = 'Checking for updates...';
  status.style.color = 'var(--text-muted)';
  applyBtn.style.display = 'none';

  try {
    const res = await fetch('/api/v1/update/check', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('hephaestus_session_token') }
    });
    const data = await res.json();
    if (data.success && data.hasUpdates) {
      let msg = 'Updates available! Click "Apply Update" to install.';
      if (data.remote) msg += ` (Remote: ${data.remote})`;
      status.textContent = msg;
      status.style.color = '#f59e0b';
      applyBtn.style.display = 'inline-flex';
    } else if (data.success) {
      let msg = 'System is up to date.';
      if (data.remote) msg += ` (Remote: ${data.remote})`;
      status.textContent = msg;
      status.style.color = '#3fb950';
    } else {
      status.textContent = 'Could not check for updates: ' + (data.message || 'Unknown error');
      status.style.color = '#ff7b72';
    }
  } catch (e) {
    status.textContent = 'Failed to check updates: ' + e.message;
    status.style.color = '#ff7b72';
  }
}

async function loadGithubToken() {
  const statusEl = document.getElementById('github-token-status');
  const inputEl = document.getElementById('github-token-input');
  if (!statusEl || !inputEl) return;
  try {
    const res = await fetch('/api/v1/settings/github-token', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('hephaestus_session_token') }
    });
    const data = await res.json();
    if (data.success && data.configured) {
      statusEl.textContent = 'Token configured: ' + data.masked;
      statusEl.style.color = '#3fb950';
      inputEl.value = '';
      inputEl.placeholder = 'Token configured. Enter new token to replace.';
    } else {
      statusEl.textContent = 'No token configured.';
      statusEl.style.color = 'var(--text-muted)';
    }
  } catch (e) {
    statusEl.textContent = 'Failed to load token status.';
    statusEl.style.color = '#ff7b72';
  }
}

async function saveGithubToken() {
  const inputEl = document.getElementById('github-token-input');
  const statusEl = document.getElementById('github-token-status');
  if (!inputEl || !statusEl) return;
  const token = inputEl.value.trim();
  if (!token) {
    statusEl.textContent = 'Please enter a token.';
    statusEl.style.color = '#ff7b72';
    return;
  }
  try {
    const res = await fetch('/api/v1/settings/github-token', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('hephaestus_session_token'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token })
    });
    const data = await res.json();
    if (data.success) {
      statusEl.textContent = 'Token saved successfully.';
      statusEl.style.color = '#3fb950';
      inputEl.value = '';
      loadGithubToken();
    } else {
      statusEl.textContent = 'Failed to save: ' + (data.message || data.error);
      statusEl.style.color = '#ff7b72';
    }
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#ff7b72';
  }
}

async function removeGithubToken() {
  const statusEl = document.getElementById('github-token-status');
  const inputEl = document.getElementById('github-token-input');
  if (!statusEl) return;
  try {
    const res = await fetch('/api/v1/settings/github-token', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('hephaestus_session_token'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token: '' })
    });
    const data = await res.json();
    if (data.success) {
      statusEl.textContent = 'Token removed.';
      statusEl.style.color = 'var(--text-muted)';
      if (inputEl) {
        inputEl.value = '';
        inputEl.placeholder = 'ghp_xxxxxxxxxxxx';
      }
    } else {
      statusEl.textContent = 'Failed to remove: ' + (data.message || data.error);
      statusEl.style.color = '#ff7b72';
    }
  } catch (e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.style.color = '#ff7b72';
  }
}

async function applyUpdate() {
  if (!confirm('This will pull the latest code, rebuild, and restart the server. Continue?')) return;

  const status = document.getElementById('system-update-status');
  const applyBtn = document.getElementById('system-update-apply-btn');
  if (!status || !applyBtn) return;
  applyBtn.disabled = true;
  applyBtn.textContent = 'Updating...';
  status.textContent = 'Pulling latest code...';
  status.style.color = '#f59e0b';

  try {
    const res = await fetch('/api/v1/update/apply', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('hephaestus_session_token')
      }
    });
    const data = await res.json();
    if (data.success) {
      status.textContent = 'Update applied! Server is restarting...';
      status.style.color = '#3fb950';
      setTimeout(() => {
        let attempts = 0;
        const checkAlive = setInterval(async () => {
          attempts++;
          try {
            await fetch('/health');
            clearInterval(checkAlive);
            window.location.reload();
          } catch (e) {
            if (attempts > 30) {
              clearInterval(checkAlive);
              status.textContent = 'Server is taking longer than expected. Please refresh manually.';
            }
          }
        }, 2000);
      }, 3000);
    } else {
      status.textContent = 'Update failed: ' + (data.message || 'Unknown error');
      status.style.color = '#ff7b72';
      applyBtn.disabled = false;
      applyBtn.textContent = 'Apply Update & Restart';
    }
  } catch (e) {
    status.textContent = 'Update failed: ' + e.message;
    status.style.color = '#ff7b72';
    applyBtn.disabled = false;
    applyBtn.textContent = 'Apply Update & Restart';
  }
}

window.handleLoginSubmit = async function(event) {
  event.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const feedback = document.getElementById('login-feedback');
  
  if (!username || !password) {
    feedback.textContent = 'Please enter username and password.';
    feedback.classList.remove('hidden');
    return;
  }
  
  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;
  
  try {
    const res = await originalFetch('/api/v1/users/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await res.json();
    if (res.ok && data.success) {
      localStorage.setItem('hephaestus_session_token', data.token);
      showMainApp(data.user);
    } else {
      feedback.textContent = data.message || 'Login failed.';
      feedback.classList.remove('hidden');
    }
  } catch (err) {
    feedback.textContent = 'Network or connection error occurred.';
    feedback.classList.remove('hidden');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

window.handleLogout = async function() {
  const token = localStorage.getItem('hephaestus_session_token');
  if (token) {
    try {
      await originalFetch('/api/v1/users/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (_) {}
  }
  showLoginScreen();
};

async function checkSession() {
  const token = localStorage.getItem('hephaestus_session_token');
  if (!token) {
    showLoginScreen();
    return;
  }
  
  const MAX_RETRIES = 2;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await originalFetch('/api/v1/users/session', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showMainApp(data.user);
        return;
      }
      if (res.status === 401) {
        showLoginScreen();
        return;
      }
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * attempt));
        continue;
      }
      showLoginScreen();
      return;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 500 * attempt));
        continue;
      }
      showLoginScreen();
      return;
    }
  }
}

let isAppInitialized = false;
function initAppOnce() {
  if (isAppInitialized) return;
  
  // Call initApp which is defined below
  if (typeof initApp === 'function') {
    initApp();
  }
}

// Navigation pages
const pages = ['overview', 'settings', 'diagnostics', 'installer', 'monitoring', 'prometheus-config', 'dataprepper-config', 'snmp-query', 'mib-importer', 'oid-library', 'database', 'user-management', 'activity-logs', 'query-explorer', 'debugging', 'system-update', 'backup-db-configs', 'backup-destinations', 'backup-run', 'backup-history'];

// Global Connection registry caches
let grafanaConfigs = [];
let prometheusConfigs = [];
let dataprepperConfigs = [];
let uptimeKumaConfigs = [];

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
const dataprepperFields = document.getElementById('dataprepper-fields');

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

const inputDataprepperMode = document.getElementById('dataprepper-mode');
const inputDataprepperPipelinesDir = document.getElementById('dataprepper-pipelines-dir');
const inputDataprepperReloadUrl = document.getElementById('dataprepper-reload-url');
const dataprepperSshFields = document.getElementById('dataprepper-ssh-fields');
const inputDataprepperSshHost = document.getElementById('dataprepper-ssh-host');
const inputDataprepperSshPort = document.getElementById('dataprepper-ssh-port');
const inputDataprepperSshUser = document.getElementById('dataprepper-ssh-user');
const inputDataprepperSshAuth = document.getElementById('dataprepper-ssh-auth');
const inputDataprepperSshPassword = document.getElementById('dataprepper-ssh-password');
const inputDataprepperSshKey = document.getElementById('dataprepper-ssh-key');

const dataprepperSshPasswordGroup = document.getElementById('dataprepper-ssh-password-group');
const dataprepperSshKeyGroup = document.getElementById('dataprepper-ssh-key-group');

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
const feedbackAlert = document.getElementById('global-toast');
const feedbackTitle = document.getElementById('global-toast-title');
const feedbackDesc = document.getElementById('global-toast-desc');

let defaultDatasourceUid = 'bf5jy3ppyomwwd';

function debounce(fn, delay = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}


const logsTbody = document.getElementById('activity-logs-tbody');

// Dynamic Datasources Panel elements
const datasourcesPanel = document.getElementById('datasources-panel');
const datasourcesTbody = document.getElementById('datasources-tbody');
const spinnerSyncDs = document.getElementById('spinner-sync-ds');

// App state
let totalScrapes = 0;
let systemLogs = [];

// Initialize
function initApp() {
  if (isAppInitialized) return;
  isAppInitialized = true;

  // Setup hash navigation FIRST - critical for navigation to work
  handleHashNavigation();
  window.addEventListener('hashchange', handleHashNavigation);

  try {
    if (diagTime) diagTime.textContent = new Date().toLocaleString();
  } catch (e) {
    console.warn('[Init] Failed to set diag time:', e);
  }
  
  addLog('System', 'Initializing portal and modules...', 'INFO');

  // Initialize unified connection fields visibility
  try {
    toggleConnectionFields();
    togglePrometheusModeFields();
    toggleSSHAuthFields();
  } catch (e) {
    console.warn('[Init] Failed to init connection fields:', e);
  }

  // Load configuration
  loadGrafanaSettings();
  checkDatabaseConnectionOnLoad();

  // Initialize debug console overlay based on localStorage
  const debugOverlayEnabled = localStorage.getItem('debugConsoleEnabled') === 'true';
  const launcherBtn = document.getElementById('diagnostic-launcher');
  if (launcherBtn) {
    launcherBtn.style.display = debugOverlayEnabled ? 'flex' : 'none';
  }

  // Debounced search/filter inputs
  const registryInput = document.getElementById('search-registry-input');
  if (registryInput) {
    registryInput.addEventListener('input', debounce(() => {
      oidLibraryPage = 1;
      filterOidRegistry();
    }));
  }

  const logSearchInput = document.getElementById('log-search-input');
  if (logSearchInput) {
    logSearchInput.addEventListener('input', debounce(() => {
      filterActivityLogs();
    }));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  checkSetupStatus();
  checkSession();
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

function toggleMonitoringSubmenu() {
  const submenu = document.getElementById('monitoring-submenu');
  const arrow = document.getElementById('menu-monitoring-arrow');
  if (submenu) {
    const isHidden = submenu.classList.contains('hidden') || submenu.style.display === 'none';
    if (isHidden) {
      submenu.classList.remove('hidden');
      submenu.style.display = 'flex';
      if (arrow) arrow.style.transform = 'rotate(180deg)';
      const hash = window.location.hash.replace('#', '') || 'overview';
      if (hash !== 'monitoring') {
        navigate('monitoring');
      }
    } else {
      submenu.classList.add('hidden');
      submenu.style.display = 'none';
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
  }
}

function toggleRemoteConfigSubmenu() {
  const submenu = document.getElementById('remote-config-submenu');
  const arrow = document.getElementById('menu-remote-config-arrow');
  if (submenu) {
    const isHidden = submenu.classList.contains('hidden') || submenu.style.display === 'none';
    if (isHidden) {
      submenu.classList.remove('hidden');
      submenu.style.display = 'flex';
      if (arrow) arrow.style.transform = 'rotate(180deg)';
      const hash = window.location.hash.replace('#', '') || 'overview';
      if (!['prometheus-config', 'dataprepper-config'].includes(hash)) {
        navigate('prometheus-config');
      }
    } else {
      submenu.classList.add('hidden');
      submenu.style.display = 'none';
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
  }
}

async function loadOverviewData() {
  try {
    const res = await fetch('/api/v1/settings/overview');
    if (!res.ok) {
      const tbody = document.getElementById('ov-connections-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Failed to load connections</td></tr>';
      const actTbody = document.getElementById('ov-activity-tbody');
      if (actTbody) actTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Failed to load activity</td></tr>';
      return;
    }
    const result = await res.json();
    if (!result.success) {
      const tbody = document.getElementById('ov-connections-tbody');
      if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No data available</td></tr>';
      const actTbody = document.getElementById('ov-activity-tbody');
      if (actTbody) actTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No data available</td></tr>';
      return;
    }
    const d = result.data;
    if (!d) return;

    // Stats cards
    const ovTotalCount = document.getElementById('ov-total-count');
    const ovTotalDetail = document.getElementById('ov-total-detail');
    if (ovTotalCount) ovTotalCount.textContent = d.totalConnections || 0;
    if (ovTotalDetail) ovTotalDetail.textContent = `${d.grafanaCount || 0} Grafana, ${d.prometheusCount || 0} Prometheus, ${d.uptimeCount || 0} Uptime Kuma`;

    // Storage
    const storageEl = document.getElementById('ov-storage-status');
    const storageDetail = document.getElementById('ov-storage-detail');
    if (storageEl && storageDetail) {
      if (d.storage?.connected) {
        storageEl.textContent = 'Connected';
        storageEl.style.color = '#56d364';
        storageDetail.textContent = d.storage.engine;
      } else {
        storageEl.textContent = 'Disconnected';
        storageEl.style.color = '#ff7b72';
        storageDetail.textContent = 'Database unreachable';
      }
    }

    // Activity count
    const ovActivityCount = document.getElementById('ov-activity-count');
    if (ovActivityCount) ovActivityCount.textContent = d.recentActivity?.length || 0;

    // Connections list
    const tbody = document.getElementById('ov-connections-tbody');
    if (tbody) {
      if (!d.connections || d.connections.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No connections configured</td></tr>';
      } else {
        tbody.innerHTML = d.connections.map(c => {
          const typeColors = { 'Grafana': '#58a6ff', 'Prometheus': 'var(--prometheus-orange)', 'Uptime Kuma': '#56d364' };
          const color = typeColors[c.type] || '#58a6ff';
          return `<tr>
            <td style="font-weight: 500;">${escapeHtml(c.name)}</td>
            <td><span class="status-badge" style="background: ${color}20; color: ${color};">${escapeHtml(c.type).toUpperCase()}</span></td>
            <td class="font-mono" style="font-size: 11px;">${escapeHtml(c.endpoint || '-')}</td>
            <td><span class="status-badge ${c.isActive ? 'status-success' : 'status-default'}">${c.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
          </tr>`;
        }).join('');
      }
    }

    // Activity logs
    const actTbody = document.getElementById('ov-activity-tbody');
    if (actTbody) {
      if (d.recentActivity && d.recentActivity.length > 0) {
        actTbody.innerHTML = d.recentActivity.map(a => {
          const statusClass = a.status === 'SUCCESS' ? 'status-success' : a.status === 'ERROR' ? 'status-error' : 'status-default';
          return `<tr>
            <td class="font-mono" style="font-size: 11px;">${escapeHtml(a.time)}</td>
            <td>${escapeHtml(a.module)}</td>
            <td style="font-size: 11px;">${escapeHtml(a.action)}</td>
            <td><span class="status-badge ${statusClass}">${escapeHtml(a.status)}</span></td>
          </tr>`;
        }).join('');
      } else {
        actTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No activity yet</td></tr>';
      }
    }
  } catch (err) {
    console.error('[Overview] Failed to load:', err);
    const tbody = document.getElementById('ov-connections-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Failed to load connections</td></tr>';
    const actTbody = document.getElementById('ov-activity-tbody');
    if (actTbody) actTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Failed to load activity</td></tr>';
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

  const monitoringPages = ['monitoring'];
  const isMonitoringPage = monitoringPages.includes(pageId);
  const monSubmenu = document.getElementById('monitoring-submenu');
  const monParentMenu = document.getElementById('menu-monitoring-parent');
  const monArrow = document.getElementById('menu-monitoring-arrow');

  if (isMonitoringPage) {
    if (monSubmenu) {
      monSubmenu.classList.remove('hidden');
      monSubmenu.style.display = 'flex';
    }
    if (monParentMenu) monParentMenu.classList.add('active');
    if (monArrow) monArrow.style.transform = 'rotate(180deg)';
  } else {
    if (monSubmenu) {
      monSubmenu.classList.add('hidden');
      monSubmenu.style.display = 'none';
    }
    if (monParentMenu) monParentMenu.classList.remove('active');
    if (monArrow) monArrow.style.transform = 'rotate(0deg)';
  }

  const remoteConfigPages = ['prometheus-config', 'dataprepper-config'];
  const isRemoteConfigPage = remoteConfigPages.includes(pageId);
  const rcSubmenu = document.getElementById('remote-config-submenu');
  const rcParentMenu = document.getElementById('menu-remote-config-parent');
  const rcArrow = document.getElementById('menu-remote-config-arrow');

  if (isRemoteConfigPage) {
    if (rcSubmenu) {
      rcSubmenu.classList.remove('hidden');
      rcSubmenu.style.display = 'flex';
    }
    if (rcParentMenu) rcParentMenu.classList.add('active');
    if (rcArrow) rcArrow.style.transform = 'rotate(180deg)';
  } else {
    if (rcSubmenu) {
      rcSubmenu.classList.add('hidden');
      rcSubmenu.style.display = 'none';
    }
    if (rcParentMenu) rcParentMenu.classList.remove('active');
    if (rcArrow) rcArrow.style.transform = 'rotate(0deg)';
  }

  const settingsPages = ['database', 'user-management', 'activity-logs', 'debugging', 'system-update'];
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

  const isBackupPage = backupPages.includes(pageId);
  const bkSubmenu = document.getElementById('backup-submenu');
  const bkParentMenu = document.getElementById('menu-backup-parent');
  const bkArrow = document.getElementById('menu-backup-arrow');
  if (isBackupPage) {
    if (bkSubmenu) { bkSubmenu.classList.remove('hidden'); bkSubmenu.style.display = 'flex'; }
    if (bkParentMenu) bkParentMenu.classList.add('active');
    if (bkArrow) bkArrow.style.transform = 'rotate(180deg)';
  } else {
    if (bkSubmenu) { bkSubmenu.classList.add('hidden'); bkSubmenu.style.display = 'none'; }
    if (bkParentMenu) bkParentMenu.classList.remove('active');
    if (bkArrow) bkArrow.style.transform = 'rotate(0deg)';
  }

  // Update header descriptions
  activeModuleName.textContent = pageId.toUpperCase();
  
  if (pageId === 'overview') {
    pageTitle.textContent = 'System Overview';
    pageDesc.textContent = 'Ringkasan status integrasi dan konfigurasi portal.';
    loadOverviewData();
  } else if (pageId === 'settings') {
    pageTitle.textContent = 'Add Connections';
    pageDesc.textContent = 'Manage API and service endpoint connections.';
  } else if (pageId === 'diagnostics') {
    pageTitle.textContent = 'System Diagnostics';
    pageDesc.textContent = 'Informasi endpoint API backend dan diagnostik kesehatan sistem.';
    diagTime.textContent = new Date().toLocaleString();
  } else if (pageId === 'installer') {
    navigate('overview');
    return;
  } else if (pageId === 'prometheus') {
    navigate('overview');
    return;
  } else if (pageId === 'monitoring') {
    pageTitle.textContent = 'Monitoring View';
    pageDesc.textContent = 'Slideshow rotasi monitoring dashboard Grafana ter-embed.';
    initMonitoringPage();
  } else if (pageId === 'prometheus-config') {
    pageTitle.textContent = 'Prometheus Config';
    pageDesc.textContent = 'Edit and validate prometheus.yml configuration directly from the portal.';
    initPrometheusConfigPage();
  } else if (pageId === 'dataprepper-config') {
    pageTitle.textContent = 'Data Prepper Pipelines';
    pageDesc.textContent = 'Edit and validate Data Prepper pipeline YAML files.';
    initDpConfigPage();
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
  } else if (pageId === 'debugging') {
    pageTitle.textContent = 'System Debugging';
    pageDesc.textContent = 'Enable or disable debug features and diagnostic tools.';
    initDebuggingPage();
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
  } else if (pageId === 'system-update') {
    pageTitle.textContent = 'System Update';
    pageDesc.textContent = 'Check for and apply portal updates from the remote repository.';
    checkForUpdates();
    loadGithubToken();
  } else if (pageId === 'backup-db-configs') {
    pageTitle.textContent = 'Database Connections';
    pageDesc.textContent = 'Manage database connections for backup operations.';
    loadBackupDbConfigs();
  } else if (pageId === 'backup-destinations') {
    pageTitle.textContent = 'Backup Destinations';
    pageDesc.textContent = 'Configure storage destinations for backup files.';
    loadBackupDestinations();
  } else if (pageId === 'backup-run') {
    pageTitle.textContent = 'Run Backup';
    pageDesc.textContent = 'Execute backups manually or configure automated schedules.';
    loadBackupRunForm();
  } else if (pageId === 'backup-history') {
    pageTitle.textContent = 'Backup History';
    pageDesc.textContent = 'View past backup execution results.';
    loadBackupHistory();
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
        <td style="font-weight: 600;">${escapeHtml(log.module)}</td>
        <td>${escapeHtml(log.message)}</td>
        <td><span class="status-badge ${badgeClass}">${escapeHtml(log.status)}</span></td>
      </tr>
    `;
  });
  if (logsTbody) logsTbody.innerHTML = html;
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
    try {
    const resGrafana = await fetch(API_SETTINGS_URL);
    if (resGrafana.ok) {
      const result = await resGrafana.json();
      if (result.success && result.data) {
        const { id, name, host, datasourceUid, isConfigured, maskedToken } = result.data;
        defaultDatasourceUid = datasourceUid || 'bf5jy3ppyomwwd';
        if (activeHost) activeHost.textContent = name ? `${name} (${host})` : (host || 'None (No active config)');
        if (activeDatasource) activeDatasource.textContent = datasourceUid || 'bf5jy3ppyomwwd';
        if (widgetDatasourceUid) widgetDatasourceUid.textContent = datasourceUid || 'bf5jy3ppyomwwd';
        
        if (isConfigured) {
          if (activeState) { activeState.className = 'status-badge status-configured'; activeState.innerHTML = 'â— Custom Config'; }
          if (widgetGrafanaStatus) { widgetGrafanaStatus.textContent = 'Connected'; widgetGrafanaStatus.style.color = '#56d364'; }
          if (widgetGrafanaSub) widgetGrafanaSub.textContent = name || host;
          if (infraGrafanaDot) infraGrafanaDot.className = 'status-dot dot-green';
        } else {
          if (activeState) { activeState.className = 'status-badge status-default'; activeState.innerHTML = 'â— Default Env'; }
          if (host) {
            if (widgetGrafanaStatus) { widgetGrafanaStatus.textContent = 'Connected'; widgetGrafanaStatus.style.color = '#e3b341'; }
            if (widgetGrafanaSub) widgetGrafanaSub.textContent = 'Using .env configuration';
            if (infraGrafanaDot) infraGrafanaDot.className = 'status-dot dot-green';
          } else {
            if (widgetGrafanaStatus) { widgetGrafanaStatus.textContent = 'Offline'; widgetGrafanaStatus.style.color = '#ff7b72'; }
            if (widgetGrafanaSub) widgetGrafanaSub.textContent = 'Configuration required';
            if (infraGrafanaDot) infraGrafanaDot.className = 'status-dot dot-yellow';
          }
        }
      }
    }
    } catch (_) {}

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

    try {
      const resD = await fetch('/api/v1/dataprepper/configs');
      const rD = await resD.json();
      if (rD.success && Array.isArray(rD.data)) {
        dataprepperConfigs = rD.data;
      }
    } catch (_) {}

    try {
      const resU = await fetch('/api/v1/uptime-kuma/configs');
      const rU = await resU.json();
      if (rU.success && Array.isArray(rU.data)) {
        uptimeKumaConfigs = rU.data;
      }
    } catch (_) {}

    // 3. Render list in registry-cards-container
    const totalCount = grafanaConfigs.length + prometheusConfigs.length + dataprepperConfigs.length + uptimeKumaConfigs.length;
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
                <span style="font-weight: 600; color: var(--text-white); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${escapeHtml(c.name)}</span>
                <span class="status-badge" style="background: rgba(25, 113, 194, 0.15); color: #38bdf8; border: 1px solid rgba(25, 113, 194, 0.3); font-size: 9px; padding: 1px 4px; font-weight: bold; line-height: 1;">GRAFANA API</span>
                ${c.isActive ? '<span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 9px; padding: 1px 4px; font-weight: bold; line-height: 1;">ACTIVE</span>' : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); min-width: 0;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                <span class="font-mono" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(c.host)}</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <span id="conn-status-${escapeHtml(c.id)}" class="status-badge status-default" style="background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 10px; display: inline-flex; align-items: center; padding: 2px 6px; height: 26px; box-sizing: border-box; line-height: 1;">
              CHECKING...
            </span>
            <button type="button" class="btn btn-secondary" onclick="viewDatasources('${escapeAttr(c.id)}', '${escapeAttr(c.name)}', '${escapeAttr(c.host)}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">View DS</button>
            <button type="button" class="btn btn-secondary" onclick="pingServer('${escapeAttr(c.id)}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">Ping Test</button>
            ${!c.isActive ? `<button type="button" class="btn btn-secondary" onclick="activateGrafanaConfig('${escapeAttr(c.id)}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">Activate</button>` : ''}
            <button type="button" class="btn btn-secondary" onclick="editGrafanaConfigById('${escapeAttr(c.id)}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" title="Edit Config">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button type="button" class="btn btn-secondary" onclick="deleteGrafanaConfig('${escapeAttr(c.id)}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: #ff7b72; border-color: rgba(255, 123, 114, 0.15);" title="Delete Config">
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
                <span style="font-weight: 600; color: var(--text-white); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${escapeHtml(c.name)}</span>
                <span class="status-badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 9px; padding: 1px 4px; font-weight: bold; line-height: 1;">PROMETHEUS</span>
                <span class="status-badge" style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid var(--app-border); font-size: 9px; padding: 1px 4px; line-height: 1;">${escapeHtml(c.mode.toUpperCase())}</span>
                ${c.isActive ? '<span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 9px; padding: 1px 4px; font-weight: bold; line-height: 1;">ACTIVE</span>' : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); min-width: 0;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>
                <span class="font-mono" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(c.path)} ${c.mode === 'ssh' ? `(${escapeHtml(c.sshHost)})` : ''}</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <span id="conn-status-${escapeHtml(c.id)}" class="status-badge status-default" style="background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 10px; display: inline-flex; align-items: center; padding: 2px 6px; height: 26px; box-sizing: border-box; line-height: 1;">
              CHECKING...
            </span>
            <button type="button" class="btn btn-secondary" onclick="pingPrometheusServer('${escapeAttr(c.id)}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">Ping Test</button>
            ${!c.isActive ? `<button type="button" class="btn btn-secondary" onclick="activatePrometheusConfig('${escapeAttr(c.id)}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">Activate</button>` : ''}
            <button type="button" class="btn btn-secondary" onclick="editPrometheusConfigById('${escapeAttr(c.id)}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" title="Edit Config">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button type="button" class="btn btn-secondary" onclick="deletePrometheusConfig('${escapeAttr(c.id)}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: #ff7b72; border-color: rgba(255, 123, 114, 0.15);" title="Delete Config">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    });

    // Render Data Prepper connections
    dataprepperConfigs.forEach(c => {
      html += `
        <div class="registry-card" style="display: flex; align-items: center; justify-content: space-between; background: var(--app-card-dark); border: 1px solid var(--app-border); padding: 14px 16px; border-radius: 6px; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
            <div style="width: 36px; height: 36px; background: rgba(86, 211, 100, 0.1); border: 1px solid rgba(86, 211, 100, 0.2); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #56d364; flex-shrink: 0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
              </svg>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-weight: 600; color: var(--text-white); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${escapeHtml(c.name)}</span>
                <span class="status-badge" style="background: rgba(86, 211, 100, 0.15); color: #56d364; border: 1px solid rgba(86, 211, 100, 0.3); font-size: 9px; padding: 1px 4px; font-weight: bold; line-height: 1;">DATA PREPPER</span>
                <span class="status-badge" style="background: rgba(255, 255, 255, 0.05); color: var(--text-muted); border: 1px solid var(--app-border); font-size: 9px; padding: 1px 4px; line-height: 1;">${escapeHtml(c.mode.toUpperCase())}</span>
                ${c.isActive ? '<span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 9px; padding: 1px 4px; font-weight: bold; line-height: 1;">ACTIVE</span>' : ''}
              </div>
              <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); min-width: 0;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span class="font-mono" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(c.pipelinesDir)} ${c.mode === 'ssh' ? `(${escapeHtml(c.sshHost)})` : ''}</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <span id="conn-status-${escapeHtml(c.id)}" class="status-badge status-default" style="background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 10px; display: inline-flex; align-items: center; padding: 2px 6px; height: 26px; box-sizing: border-box; line-height: 1;">
              CHECKING...
            </span>
            <button type="button" class="btn btn-secondary" onclick="pingDataprepperServer('${escapeAttr(c.id)}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">Ping Test</button>
            ${!c.isActive ? `<button type="button" class="btn btn-secondary" onclick="activateDataprepperConfig('${escapeAttr(c.id)}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">Activate</button>` : ''}
            <button type="button" class="btn btn-secondary" onclick="editDataprepperConfigById('${escapeAttr(c.id)}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" title="Edit Config">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button type="button" class="btn btn-secondary" onclick="deleteDataprepperConfig('${escapeAttr(c.id)}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: #ff7b72; border-color: rgba(255, 123, 114, 0.15);" title="Delete Config">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;
    });

    // Render Uptime Kuma connections
    uptimeKumaConfigs.forEach(c => {

      html += `
        <div class="registry-card" style="display: flex; align-items: center; justify-content: space-between; background: var(--app-card-dark); border: 1px solid var(--app-border); padding: 14px 16px; border-radius: 6px; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
            <div style="width: 36px; height: 36px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #10b981; flex-shrink: 0;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </div>
            <div style="display: flex; flex-direction: column; gap: 4px; min-width: 0;">
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <span style="font-weight: 600; color: var(--text-white); font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px;">${escapeHtml(c.name)}</span>
                <span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-size: 9px; padding: 1px 4px; font-weight: bold; line-height: 1;">UPTIME KUMA</span>
              </div>
              <div style="display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--text-muted); min-width: 0;">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink: 0;"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                <span class="font-mono" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(c.url)}</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <span id="conn-status-${escapeHtml(c.id)}" class="status-badge status-default" style="background-color: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 10px; display: inline-flex; align-items: center; padding: 2px 6px; height: 26px; box-sizing: border-box; line-height: 1;">
              CHECKING...
            </span>
            <button type="button" class="btn btn-secondary" onclick="pingUptimeKumaServer('${escapeAttr(c.id)}')" style="padding: 4px 8px; font-size: 10px; height: 26px; line-height: 1; text-transform: none; font-weight: 500;">Ping Test</button>
            <button type="button" class="btn btn-secondary" onclick="editUptimeKumaConfigById('${escapeAttr(c.id)}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center;" title="Edit Config">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            </button>
            <button type="button" class="btn btn-secondary" onclick="deleteUptimeKumaConfig('${escapeAttr(c.id)}')" style="width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: #ff7b72; border-color: rgba(255, 123, 114, 0.15);" title="Delete Config">
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

    dataprepperConfigs.forEach(c => {
      checkDataprepperCardConnection(c.id);
    });

    uptimeKumaConfigs.forEach(c => {
      checkUptimeKumaCardConnection(c.id);
    });

  } catch (error) {
    console.error('Error rendering registry:', error);
    if (registryCardsContainer) {
      registryCardsContainer.innerHTML = '<div style="text-align: center; padding: 24px; color: var(--text-muted);">Failed to load connections</div>';
    }
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
  const type = document.getElementById('connection-type')?.value;
  const grafanaFields = document.getElementById('grafana-fields');
  const prometheusFields = document.getElementById('prometheus-fields');
  const dataprepperFields = document.getElementById('dataprepper-fields');
  const ukFields = document.getElementById('uptime-kuma-fields');
  
  if (grafanaFields) {
    if (type === 'grafana') { grafanaFields.classList.remove('hidden'); grafanaFields.style.display = 'flex'; }
    else { grafanaFields.classList.add('hidden'); grafanaFields.style.display = 'none'; }
  }
  if (prometheusFields) {
    if (type === 'prometheus') { prometheusFields.classList.remove('hidden'); prometheusFields.style.display = 'flex'; }
    else { prometheusFields.classList.add('hidden'); prometheusFields.style.display = 'none'; }
  }
  if (dataprepperFields) {
    if (type === 'dataprepper') { dataprepperFields.classList.remove('hidden'); dataprepperFields.style.display = 'flex'; }
    else { dataprepperFields.classList.add('hidden'); dataprepperFields.style.display = 'none'; }
  }
  if (ukFields) {
    if (type === 'uptime-kuma') { ukFields.classList.remove('hidden'); ukFields.style.display = 'flex'; }
    else { ukFields.classList.add('hidden'); ukFields.style.display = 'none'; }
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

function toggleDataprepperModeFields() {
  if (!inputDataprepperMode || !dataprepperSshFields) return;
  const mode = inputDataprepperMode.value;
  if (mode === 'local') {
    dataprepperSshFields.classList.add('hidden');
  } else {
    dataprepperSshFields.classList.remove('hidden');
  }
}

function toggleDataprepperSSHAuthFields() {
  if (!inputDataprepperSshAuth || !dataprepperSshPasswordGroup || !dataprepperSshKeyGroup) return;
  const auth = inputDataprepperSshAuth.value;
  if (auth === 'password') {
    dataprepperSshPasswordGroup.classList.remove('hidden');
    dataprepperSshKeyGroup.classList.add('hidden');
  } else {
    dataprepperSshPasswordGroup.classList.add('hidden');
    dataprepperSshKeyGroup.classList.remove('hidden');
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

  if (inputDataprepperMode) inputDataprepperMode.value = 'local';
  if (inputDataprepperPipelinesDir) inputDataprepperPipelinesDir.value = '/opt/data-prepper/pipelines';
  if (inputDataprepperReloadUrl) inputDataprepperReloadUrl.value = '';
  if (inputDataprepperSshHost) inputDataprepperSshHost.value = '';
  if (inputDataprepperSshPort) inputDataprepperSshPort.value = '22';
  if (inputDataprepperSshUser) inputDataprepperSshUser.value = '';
  if (inputDataprepperSshAuth) inputDataprepperSshAuth.value = 'password';
  if (inputDataprepperSshPassword) inputDataprepperSshPassword.value = '';
  if (inputDataprepperSshKey) inputDataprepperSshKey.value = '';

  toggleConnectionFields();
  togglePrometheusModeFields();
  toggleSSHAuthFields();
  toggleDataprepperModeFields();
  toggleDataprepperSSHAuthFields();

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
      if (currentHash === '#prometheus-config') {
        if (typeof loadPrometheusConfig === 'function') {
          loadPrometheusConfig(promConfigSelectedId);
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

async function checkDataprepperCardConnection(id) {
  const badge = document.getElementById(`conn-status-${id}`);
  if (!badge) return;

  try {
    const res = await fetch(`/api/v1/dataprepper/configs/${id}/test`, {
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

async function pingDataprepperServer(id) {
  addLog('DataPrepper', `Initiating manual ping to connection ID ${id}...`, 'INFO');
  try {
    const res = await fetch(`/api/v1/dataprepper/configs/${id}/test`, {
      method: 'POST'
    });
    const result = await res.json();
    if (res.ok && result.success && result.isConnected) {
      alert('Koneksi Data Prepper Sukses!');
      addLog('DataPrepper', 'Manual connection check succeeded.', 'SUCCESS');
    } else {
      alert('Koneksi Data Prepper Gagal: ' + (result.message || 'Server offline.'));
      addLog('DataPrepper', `Manual connection check failed: ${result.message || 'Offline'}`, 'ERROR');
    }
  } catch (err) {
    alert('API Error: ' + err.message);
  }
}

async function activateDataprepperConfig(id) {
  addLog('Configuration', 'Activating Data Prepper configuration...', 'INFO');
  try {
    const res = await fetch(`/api/v1/dataprepper/configs/${id}/activate`, {
      method: 'POST'
    });
    const result = await res.json();
    if (res.ok && result.success) {
      addLog('Configuration', result.message || 'Data Prepper configuration activated successfully.', 'SUCCESS');
      
      // If we are currently on the dataprepper-config page, reload the page content
      const currentHash = window.location.hash;
      if (currentHash === '#dataprepper-config') {
        if (typeof initDpConfigPage === 'function') {
          initDpConfigPage();
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

async function deleteDataprepperConfig(id) {
  if (!confirm('Apakah Anda yakin ingin menghapus konfigurasi Data Prepper ini?')) return;
  addLog('Configuration', 'Deleting Data Prepper configuration...', 'INFO');
  try {
    const res = await fetch(`/api/v1/dataprepper/configs/${id}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (res.ok && result.success) {
      addLog('Configuration', result.message || 'Data Prepper configuration deleted successfully.', 'SUCCESS');
      await loadSettingsRegistry();
    } else {
      addLog('Configuration', `Deletion failed: ${result.message || 'Unknown error'}`, 'ERROR');
    }
  } catch (error) {
    console.error('Error deleting configuration:', error);
    addLog('Configuration', 'Network error during configuration deletion.', 'ERROR');
  }
}

function editDataprepperConfigById(id) {
  if (!dataprepperConfigs) return;
  const c = dataprepperConfigs.find(item => item.id === id);
  if (!c) return;

  if (inputConnectionType) inputConnectionType.value = 'dataprepper';
  if (inputConnectionId) inputConnectionId.value = c.id;
  if (inputConnectionName) inputConnectionName.value = c.name;

  if (inputDataprepperMode) inputDataprepperMode.value = c.mode;
  if (inputDataprepperPipelinesDir) inputDataprepperPipelinesDir.value = c.pipelinesDir;
  if (inputDataprepperReloadUrl) inputDataprepperReloadUrl.value = c.reloadUrl || '';
  if (inputDataprepperSshHost) inputDataprepperSshHost.value = c.sshHost || '';
  if (inputDataprepperSshPort) inputDataprepperSshPort.value = c.sshPort || '22';
  if (inputDataprepperSshUser) inputDataprepperSshUser.value = c.sshUser || '';
  if (inputDataprepperSshAuth) inputDataprepperSshAuth.value = c.sshAuth || 'password';
  if (inputDataprepperSshPassword) inputDataprepperSshPassword.value = c.sshPassword ? '********' : '';
  if (inputDataprepperSshKey) inputDataprepperSshKey.value = c.sshKey || '';

  toggleConnectionFields();
  toggleDataprepperModeFields();
  toggleDataprepperSSHAuthFields();

  const saveText = document.getElementById('btn-save-text');
  if (saveText) saveText.textContent = 'Update Connection';
  hideFeedback();
}

async function checkUptimeKumaCardConnection(id) {
  const badge = document.getElementById(`conn-status-${id}`);
  if (!badge) return;

  try {
    const res = await fetch(`/api/v1/uptime-kuma/configs/${id}/test`, {
      method: 'POST'
    });
    const result = await res.json();
    if (res.ok && result.success && result.connected) {
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

async function pingUptimeKumaServer(id) {
  addLog('Uptime Kuma', `Initiating manual ping to connection ID ${id}...`, 'INFO');
  try {
    const res = await fetch(`/api/v1/uptime-kuma/configs/${id}/test`, {
      method: 'POST'
    });
    const result = await res.json();
    if (res.ok && result.success && result.connected) {
      alert('Uptime Kuma connection succeeded!');
      addLog('Uptime Kuma', 'Manual connection check succeeded.', 'SUCCESS');
    } else {
      alert('Uptime Kuma connection failed: ' + (result.message || 'Server offline.'));
      addLog('Uptime Kuma', `Manual connection check failed: ${result.message || 'Offline'}`, 'ERROR');
    }
  } catch (err) {
    alert('API Error: ' + err.message);
  }
}

function editUptimeKumaConfigById(id) {
  if (!uptimeKumaConfigs) return;
  const c = uptimeKumaConfigs.find(item => item.id === id);
  if (!c) return;

  if (inputConnectionType) inputConnectionType.value = 'uptime-kuma';
  if (inputConnectionId) inputConnectionId.value = c.id;
  if (inputConnectionName) inputConnectionName.value = c.name;

  const urlField = document.getElementById('uptime-kuma-url');
  const usernameField = document.getElementById('uptime-kuma-username');
  const passwordField = document.getElementById('uptime-kuma-password');

  if (urlField) urlField.value = c.url;
  if (usernameField) usernameField.value = c.username || '';
  if (passwordField) passwordField.value = c.password ? '********' : '';

  toggleConnectionFields();

  const saveText = document.getElementById('btn-save-text');
  if (saveText) saveText.textContent = 'Update Connection';
  hideFeedback();
}

async function deleteUptimeKumaConfig(id) {
  if (!confirm('Are you sure you want to delete this Uptime Kuma configuration?')) return;
  addLog('Configuration', 'Deleting Uptime Kuma configuration...', 'INFO');
  try {
    const res = await fetch(`/api/v1/uptime-kuma/configs/${id}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (res.ok && result.success) {
      addLog('Configuration', result.message || 'Uptime Kuma configuration deleted successfully.', 'SUCCESS');
      await loadSettingsRegistry();
    } else {
      addLog('Configuration', `Deletion failed: ${result.message || 'Unknown error'}`, 'ERROR');
    }
  } catch (error) {
    console.error('Error deleting Uptime Kuma configuration:', error);
    addLog('Configuration', 'Network error during configuration deletion.', 'ERROR');
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
    } else if (type === 'uptime-kuma') {
      const url = document.getElementById('uptime-kuma-url')?.value?.trim();
      const username = document.getElementById('uptime-kuma-username')?.value?.trim();
      const password = document.getElementById('uptime-kuma-password')?.value;

      if (!url) {
        showFeedback('danger', 'Form Error', 'Uptime Kuma URL is required.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/v1/uptime-kuma/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, username, password })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showFeedback('success', 'Saved Successfully', result.message || 'Uptime Kuma configuration saved.');
        addLog('Configuration', `Uptime Kuma connection saved: ${name}`, 'SUCCESS');
        clearConnectionForm();
        await loadSettingsRegistry();
      } else {
        showFeedback('danger', 'Save Failed', result.message || result.error || 'Failed to save.');
        addLog('Configuration', `Uptime Kuma save failed: ${result.message}`, 'ERROR');
      }
    } else if (type === 'dataprepper') {
      const mode = inputDataprepperMode.value;
      const pipelinesDir = inputDataprepperPipelinesDir.value.trim();
      const reloadUrl = inputDataprepperReloadUrl.value.trim();
      const sshHost = inputDataprepperSshHost.value.trim();
      const sshPort = parseInt(inputDataprepperSshPort.value.trim() || '22', 10);
      const sshUser = inputDataprepperSshUser.value.trim();
      const sshAuth = inputDataprepperSshAuth.value;
      let sshPassword = inputDataprepperSshPassword.value;
      const sshKey = inputDataprepperSshKey.value;

      if (!pipelinesDir) {
        showFeedback('danger', 'Form Error', 'Pipelines directory is required.');
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

      const res = await fetch('/api/v1/dataprepper/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name, mode, pipelinesDir, reloadUrl, sshHost, sshPort, sshUser, sshAuth, sshPassword, sshKey })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showFeedback('success', 'Saved Successfully', result.message || 'Data Prepper connection saved.');
        addLog('Configuration', `Data Prepper connection saved: ${name}`, 'SUCCESS');
        clearConnectionForm();
        await loadSettingsRegistry();
      } else {
        showFeedback('danger', 'Save Failed', result.message || result.error || 'Failed to save.');
        addLog('Configuration', `Data Prepper save failed: ${result.message}`, 'ERROR');
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
  } else if (type === 'uptime-kuma') {
    const url = document.getElementById('uptime-kuma-url')?.value?.trim();
    const username = document.getElementById('uptime-kuma-username')?.value?.trim();
    const password = document.getElementById('uptime-kuma-password')?.value;

    if (!url) {
      showFeedback('danger', 'Form Error', 'Uptime Kuma URL is required.');
      return;
    }

    setLoading(true, 'test');
    addLog('Uptime Kuma', `Testing connection to ${url}...`, 'INFO');

    try {
      const res = await fetch('/api/v1/uptime-kuma/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, username, password })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showFeedback('success', 'Test Successful', result.message || 'Connected to Uptime Kuma.');
        addLog('Uptime Kuma', 'Connection test succeeded.', 'SUCCESS');
      } else {
        showFeedback('danger', 'Test Failed', result.message || result.error || 'Failed to connect.');
        addLog('Uptime Kuma', `Connection test failed: ${result.message || 'Unknown error'}`, 'ERROR');
      }
    } catch (error) {
      showFeedback('danger', 'API Error', error.message);
    } finally {
      setLoading(false);
    }
  } else if (type === 'dataprepper') {
    const mode = inputDataprepperMode.value;
    const pipelinesDir = inputDataprepperPipelinesDir.value.trim();
    const reloadUrl = inputDataprepperReloadUrl.value.trim();
    const sshHost = inputDataprepperSshHost.value.trim();
    const sshPort = parseInt(inputDataprepperSshPort.value.trim() || '22', 10);
    const sshUser = inputDataprepperSshUser.value.trim();
    const sshAuth = inputDataprepperSshAuth.value;
    let sshPassword = inputDataprepperSshPassword.value;
    const sshKey = inputDataprepperSshKey.value;

    if (!pipelinesDir) {
      showFeedback('danger', 'Form Error', 'Pipelines directory is required.');
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
    addLog('DataPrepper', `Testing Data Prepper connection...`, 'INFO');

    try {
      const res = await fetch('/api/v1/dataprepper/configs/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, pipelinesDir, reloadUrl, sshHost, sshPort, sshUser, sshAuth, sshPassword, sshKey })
      });
      const result = await res.json();
      if (res.ok && result.success) {
        showFeedback('success', 'Test Successful', result.message || 'Connection test succeeded.');
        addLog('DataPrepper', 'Connection test succeeded.', 'SUCCESS');
      } else {
        showFeedback('danger', 'Test Failed', result.message || result.error || 'Failed to connect.');
        addLog('DataPrepper', `Connection test failed: ${result.message}`, 'ERROR');
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
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/`/g, '\\`')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
    <button type="button" class="btn btn-secondary" onclick="importMibPreset('${escapeAttr(p.name)}')" id="btn-preset-${escapeAttr(p.name)}" style="padding: 4px 8px; font-size: 11px; height: auto; border-color: var(--app-border); margin: 2px;">
      <span>${escapeHtml(p.name)}</span>
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
        <button class="btn btn-secondary" onclick="deleteImportedMib('${escapeAttr(m.name)}')" style="padding: 2px 6px; font-size: 10px; height: auto; border-color: #ff7b72; color: #ff7b72;">Delete</button>
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
      <tr style="cursor: pointer;" onclick="inspectOid('${escapeAttr(oid)}')">
        <td style="padding: 8px 10px; font-size: 11px;">
          <div style="font-weight: 600; color: var(--text-white);">${escapeHtml(info.name)}</div>
          <div style="font-family: monospace; font-size: 9.5px; color: var(--text-muted);">${oid}</div>
        </td>
        <td style="padding: 8px 10px; font-size: 11px; vertical-align: middle;">
          <span class="status-badge" style="font-size: 9px; padding: 1px 4px; background: rgba(88,166,255,0.05); color: #58a6ff; border: 1px solid rgba(88,166,255,0.1);">${escapeHtml(info.mib)}</span>
        </td>
        <td style="padding: 8px 10px; font-size: 11px; text-align: center; vertical-align: middle;">
          <button type="button" class="btn btn-secondary" onclick="event.stopPropagation(); selectOidForQuery('${escapeAttr(oid)}', '${escapeAttr(info.name)}')" style="padding: 2px 6px; font-size: 10px; height: auto; border-color: var(--app-border);">Select</button>
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
  
  hideFeedback();
  
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

        if (!data.isConnected) {
          showFeedback('danger', 'Database Offline / Error', data.error || 'Server cannot connect to PostgreSQL with the current credentials.');
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
  
  hideFeedback();
  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  
  try {
    const response = await fetch('/api/v1/system/db-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, password, database, ssl })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      showFeedback('success', 'Success', data.message || 'Database settings updated successfully!');
      addLog('Database', 'Configuration updated and pool reloaded successfully.', 'SUCCESS');
      
      const storageEngine = document.getElementById('infra-storage-engine');
      if (storageEngine) {
        storageEngine.className = 'status-text-green';
        storageEngine.textContent = 'PostgreSQL (Connected)';
      }
      
      loadGrafanaSettings();
    } else {
      showFeedback('danger', 'Error', data.message || 'Failed to apply configuration.');
      addLog('Database', `Update failed: ${data.message}`, 'ERROR');
      
      const storageEngine = document.getElementById('infra-storage-engine');
      if (storageEngine) {
        storageEngine.className = 'status-text-red';
        storageEngine.textContent = 'PostgreSQL (Offline)';
      }
    }
  } catch (error) {
    console.error(error);
    showFeedback('danger', 'Error', error.message);
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

  hideFeedback();
  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');

  try {
    const response = await fetch('/api/v1/system/db-config/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port, user, password, database, ssl })
    });

    const data = await response.json();
    if (response.ok && data.success) {
      showFeedback('success', 'Success', data.message || 'Database connection successful! Configuration is valid.');
      addLog('Database', 'Test connection succeeded.', 'SUCCESS');
    } else {
      showFeedback('danger', 'Connection Error', data.message || 'Failed to connect to the database with the provided configuration.');
      addLog('Database', `Test connection failed: ${data.message || data.error}`, 'ERROR');
    }
  } catch (error) {
    console.error(error);
    showFeedback('danger', 'Error', error.message);
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
              <span>${escapeHtml(ds.uid)}</span>
              <button type="button" class="btn btn-secondary" onclick="copyTextToClipboard('${escapeAttr(ds.uid)}')" style="padding: 2px 6px; font-size: 10px; height: auto; border-color: var(--app-border);">Copy</button>
            </td>
          </tr>
        `).join('');
      }
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="text-align: center; color: #ff7b72; padding: 20px;">
            Failed to load datasources: ${escapeHtml(data.message || data.error)}
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
      if (!['database', 'user-management', 'activity-logs', 'debugging', 'system-update'].includes(hash)) {
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
  await loadRolesList();
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

    const users = data.success ? (data.data || data.users || []) : [];
    if (data.success) {
      if (users.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
              No user accounts found.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = users.map(u => {
          const createdAt = u.createdAt || u.created_at;
          const deleteBtn = u.username === 'sysadmin' 
            ? `<button class="btn btn-secondary" disabled style="padding: 2px 8px; font-size: 10.5px; height: auto; opacity: 0.5; cursor: not-allowed; border-color: var(--app-border);">Delete</button>`
            : `<button class="btn btn-secondary" onclick="deleteUserAccount('${escapeAttr(u.id)}', '${escapeAttr(u.username)}')" style="padding: 2px 8px; font-size: 10.5px; height: auto; color: #ff7b72; border-color: rgba(255,123,114,0.2);">Delete</button>`;

          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: var(--text-white);">${escapeHtml(u.username)}</td>
              <td style="padding: 10px 12px; font-size: 12px; color: var(--text-muted);">${escapeHtml(u.email)}</td>
              <td style="padding: 10px 12px; font-size: 12px; vertical-align: middle;">
                <span class="status-badge" style="font-size: 9px; padding: 1px 4px; ${u.role === 'ADMIN' ? 'background: rgba(16,185,129,0.05); color: #10b981; border: 1px solid rgba(16,185,129,0.1);' : 'background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.1);'}">${u.role}</span>
              </td>
              <td style="padding: 10px 12px; font-size: 11px; font-family: monospace; color: var(--text-muted);">${createdAt ? new Date(createdAt).toLocaleString() : '-'}</td>
              <td style="padding: 10px 12px; font-size: 12px; text-align: right; display: flex; justify-content: flex-end; gap: 8px;">
                <button type="button" class="btn btn-secondary" onclick="openResetPasswordModal('${escapeAttr(u.id)}', '${escapeAttr(u.username)}')" style="padding: 2px 8px; font-size: 10.5px; height: auto; border-color: var(--app-border);">Reset Password</button>
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
            Failed to load users: ${escapeHtml(data.message || data.error)}
          </td>
        </tr>
      `;
    }
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #ff7b72; padding: 20px;">
          Failed to fetch users from backend: ${escapeHtml(error.message)}
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

// ==========================================
// SYSTEM ROLES MANAGEMENT
// ==========================================
async function loadRolesList() {
  const tbody = document.getElementById('roles-tbody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">
        <span class="spinner" style="margin-right: 8px;"></span> Loading roles...
      </td>
    </tr>
  `;

  try {
    const res = await fetch('/api/v1/users/roles/list');
    const data = await res.json();
    const roles = data.success ? (data.data || []) : [];

    if (data.success) {
      if (roles.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">
              No system roles found.
            </td>
          </tr>
        `;
      } else {
        tbody.innerHTML = roles.map(r => {
          const isDefault = r.isDefault || r.is_default;
          const deleteBtn = isDefault
            ? `<button class="btn btn-secondary" disabled style="padding: 2px 8px; font-size: 10.5px; height: auto; opacity: 0.5; cursor: not-allowed; border-color: var(--app-border);">Delete</button>`
            : `<button class="btn btn-secondary" onclick="deleteSystemRole('${r.id}', '${escapeAttr(r.name)}')" style="padding: 2px 8px; font-size: 10.5px; height: auto; color: #ff7b72; border-color: rgba(255,123,114,0.2);">Delete</button>`;

          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 10px 12px; font-size: 12px; font-weight: 600; color: var(--text-white);">${escapeHtml(r.name)}</td>
              <td style="padding: 10px 12px; font-size: 12px; color: var(--text-muted);">${escapeHtml(r.description || '-')}</td>
              <td style="padding: 10px 12px; font-size: 12px; vertical-align: middle;">
                <span class="status-badge" style="font-size: 9px; padding: 1px 4px; ${isDefault ? 'background: rgba(88,166,255,0.08); color: #58a6ff; border: 1px solid rgba(88,166,255,0.15);' : 'background: rgba(255,255,255,0.05); color: var(--text-muted); border: 1px solid rgba(255,255,255,0.1);'}">${isDefault ? 'BUILT-IN' : 'CUSTOM'}</span>
              </td>
              <td style="padding: 10px 12px; font-size: 12px; text-align: right;">
                ${deleteBtn}
              </td>
            </tr>
          `;
        }).join('');
      }

      // Dynamically populate the role dropdown in the Add User modal
      const roleSelect = document.getElementById('add-user-role');
      if (roleSelect) {
        roleSelect.innerHTML = roles.map((r, i) => {
          const isOp = r.name.toLowerCase() === 'operator';
          return `<option value="${escapeHtml(r.name)}" ${isOp ? 'selected' : ''}>${escapeHtml(r.name)}</option>`;
        }).join('');
      }
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; color: #ff7b72; padding: 20px;">
            Failed to load roles: ${data.message || data.error}
          </td>
        </tr>
      `;
    }
  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="text-align: center; color: #ff7b72; padding: 20px;">
          Failed to fetch roles from backend: ${error.message}
        </td>
      </tr>
    `;
  }
}

function openAddRoleModal() {
  const modal = document.getElementById('modal-add-role');
  if (modal) {
    modal.classList.add('active');
    document.getElementById('form-add-role').reset();
  }
}

function closeAddRoleModal() {
  const modal = document.getElementById('modal-add-role');
  if (modal) modal.classList.remove('active');
}

async function submitAddRole(event) {
  if (event) event.preventDefault();

  const name = document.getElementById('add-role-name').value.trim();
  const description = document.getElementById('add-role-description').value.trim();

  try {
    const res = await fetch('/api/v1/users/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert('System role created successfully.');
      closeAddRoleModal();
      await loadRolesList();
      addLog('User Management', `Created system role "${name}"`, 'SUCCESS');
    } else {
      alert('Failed to create role: ' + (data.message || 'Unknown error'));
    }
  } catch (error) {
    alert('Error connecting to backend: ' + error.message);
  }
}

async function deleteSystemRole(id, name) {
  if (!confirm(`Are you sure you want to delete role "${name}"?`)) return;

  try {
    const res = await fetch(`/api/v1/users/roles/${id}`, {
      method: 'DELETE'
    });

    const data = await res.json();
    if (res.ok && data.success) {
      alert(`Role "${name}" deleted successfully.`);
      await loadRolesList();
      addLog('User Management', `Deleted system role "${name}"`, 'SUCCESS');
    } else {
      alert('Failed to delete role: ' + (data.message || 'Unknown error'));
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

    const logs = data.success ? (data.data || data.logs || []) : [];
    const pagination = data.pagination || {};
    if (data.success) {
      if (logs.length === 0) {
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
        tbody.innerHTML = logs.map(log => {
          let badgeClass = 'status-default';
          if (log.status === 'SUCCESS') badgeClass = 'status-configured';
          else if (log.status === 'ERROR') badgeClass = 'status-text-red';
          else if (log.status === 'WARNING') badgeClass = 'status-text-yellow';

          const logTime = log.timestamp || log.created_at;
          return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 11.5px;">
              <td style="padding: 8px 12px; font-family: monospace; color: var(--text-muted);">${logTime ? new Date(logTime).toLocaleString() : '-'}</td>
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
        const endIdx = startIdx + logs.length - 1;
        const total = pagination.total || data.total || 0;
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
  
  // Hide table preview wrapper by default
  document.getElementById('query-table-preview-wrapper').classList.add('hidden');
  
  // Reset preview controls to default state
  const vizSelect = document.getElementById('preview-viz-type');
  if (vizSelect) {
    vizSelect.value = 'table';
    togglePreviewSplitCheckboxVisibility('table');
  }
  const combineCheckbox = document.getElementById('preview-combine-metrics');
  if (combineCheckbox) combineCheckbox.checked = false;
  
  // Reset output area
  const outputArea = document.getElementById('query-results-output');
  if (outputArea) {
    outputArea.removeAttribute('style');
    outputArea.innerHTML = '';
  }
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
      <button type="button" class="${btnClass}" data-ip="${escapeAttr(ip)}" onclick="switchQueryExplorerSheet('${escapeAttr(ip)}')" style="${activeStyle}">
        ${escapeHtml(ip)}
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
    const tableId = `sheet-table-${ip.replace(/[^a-zA-Z0-9]/g, '_')}`;
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
        
        colsHtml += `<td style="padding: 8px; font-family: monospace; ${valStyle}">${escapeHtml(displayVal)}</td>`;
      });
      
      rowsHtml += `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.03); font-size: 11.5px;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
          <td style="padding: 8px; font-family: monospace; color: var(--text-muted);">${escapeHtml(row.timestampStr)}</td>
          <td style="padding: 8px; font-family: monospace; color: var(--text-muted);">${escapeHtml(ip)}</td>
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
  
  // Fetch Grafana configurations
  if (grafanaConfigs.length === 0) {
    try {
      const res = await fetch('/api/v1/settings/grafana/configs');
      const r = await res.json();
      if (r.success && Array.isArray(r.data)) {
        grafanaConfigs = r.data;
      }
    } catch (_) {}
  }

  // Fetch Prometheus configurations
  if (prometheusConfigs.length === 0) {
    try {
      const res = await fetch('/api/v1/prometheus/configs');
      const r = await res.json();
      if (r.success && Array.isArray(r.configs)) {
        prometheusConfigs = r.configs;
      }
    } catch (_) {}
  }
  
  // Populate options
  select.innerHTML = `
    <option value="">-- Select Connection --</option>
    <option value="active">Active Configuration (Default)</option>
  `;
  grafanaConfigs.forEach(c => {
    select.innerHTML += `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.host)})</option>`;
  });
  prometheusConfigs.forEach(c => {
    select.innerHTML += `<option value="prom-${c.id}">${escapeHtml(c.name)} (Prometheus)</option>`;
  });
  select.innerHTML += `<option value="uptime-kuma">Uptime Kuma (Monitor Status)</option>`;
}

async function loadGrafanaDatasourcesForPanel() {
  const configSelect = document.getElementById('query-panel-config-id');
  const dsSelect = document.getElementById('query-panel-datasource-uid');
  if (!configSelect || !dsSelect) return;
  
  const configId = configSelect.value;
  if (!configId) {
    dsSelect.innerHTML = '<option value="">-- Select Connection first --</option>';
    return;
  }
  
  dsSelect.innerHTML = '<option value="">Loading datasources...</option>';
  
  // Handle Uptime Kuma connection
  if (configId === 'uptime-kuma') {
    try {
      const res = await fetch('/api/v1/uptime-kuma/monitors');
      const result = await res.json();
      if (res.ok && result.success && Array.isArray(result.data) && result.data.length > 0) {
        dsSelect.innerHTML = '<option value="">-- Select Monitor --</option>';
        result.data.forEach(m => {
          const statusText = m.status === 1 ? 'UP' : m.status === 0 ? 'DOWN' : 'PENDING';
          dsSelect.innerHTML += `<option value="uk-${m.id}">[${statusText}] ${escapeHtml(m.name)} (${m.type})</option>`;
        });
      } else {
        dsSelect.innerHTML = '<option value="">No Uptime Kuma monitors found</option>';
      }
    } catch (error) {
      dsSelect.innerHTML = '<option value="">Failed to load monitors</option>';
    }
    return;
  }

  // Handle Prometheus direct connection
  if (configId.startsWith('prom-')) {
    const promId = configId.replace('prom-', '');
    const promProfile = prometheusConfigs.find(c => c.id === promId);
    dsSelect.innerHTML = `<option value="prom-${promId}">${escapeHtml(promProfile ? promProfile.name : 'Prometheus')} (Direct)</option>`;
    return;
  }
  
  const url = configId === 'active'
    ? `/api/v1/settings/grafana/datasources`
    : `/api/v1/settings/grafana/datasources?configId=${configId}`;
    
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

async function openAddQueryPanelModal() {
  document.getElementById('query-panel-modal-title').textContent = 'Add Query Panel';
  document.getElementById('query-panel-id').value = '';
  document.getElementById('query-panel-name').value = '';
  document.getElementById('query-panel-description').value = '';
  
  await populateGrafanaConnectionsForQueryPanel();
  document.getElementById('query-panel-config-id').value = '';
  
  document.getElementById('query-panel-from').value = 'now-1h';
  document.getElementById('query-panel-to').value = 'now';
  document.getElementById('query-panel-step').value = '1m';
  document.getElementById('query-panel-custom-from-input').value = '';
  document.getElementById('query-panel-custom-to-input').value = '';
  toggleQueryCustomTimeFields('now-1h');
  
  document.getElementById('query-panel-columns-list').innerHTML = '';
  document.getElementById('query-test-feedback').classList.add('hidden');
  
  // Add two default metric columns for CPU and Memory
  addQueryColumnInput('CPU', '100 - (avg by (instance) (irate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)');
  addQueryColumnInput('Memory', '(node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes * 100');
  
  // Load datasources (will be empty select placeholder)
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
  document.getElementById('query-panel-step').value = panel.step;
  
  const presetRanges = ['now-15m', 'now-1h', 'now-6h', 'now-12h', 'now-24h', 'now-7d'];
  if (presetRanges.includes(panel.timeRangeFrom)) {
    document.getElementById('query-panel-from').value = panel.timeRangeFrom;
    document.getElementById('query-panel-to').value = panel.timeRangeTo;
    toggleQueryCustomTimeFields(panel.timeRangeFrom);
  } else {
    document.getElementById('query-panel-from').value = 'custom';
    toggleQueryCustomTimeFields('custom');
    document.getElementById('query-panel-custom-from-input').value = formatToDatetimeLocalValue(panel.timeRangeFrom);
    document.getElementById('query-panel-custom-to-input').value = formatToDatetimeLocalValue(panel.timeRangeTo);
  }
  
  // Populate connections select
  await populateGrafanaConnectionsForQueryPanel();
  
  // Find which connection contains panel.datasourceUid
  let foundConfigId = '';
  
  // Try active config first
  try {
    const res = await fetch(`/api/v1/settings/grafana/datasources`);
    const r = await res.json();
    if (r.success && Array.isArray(r.data)) {
      if (r.data.some(ds => ds.uid === panel.datasourceUid)) {
        foundConfigId = 'active';
      }
    }
  } catch (_) {}
  
  // If not found in active, try other custom configs
  if (!foundConfigId && grafanaConfigs.length > 0) {
    for (const config of grafanaConfigs) {
      try {
        const res = await fetch(`/api/v1/settings/grafana/datasources?configId=${config.id}`);
        const r = await res.json();
        if (r.success && Array.isArray(r.data)) {
          if (r.data.some(ds => ds.uid === panel.datasourceUid)) {
            foundConfigId = config.id;
            break;
          }
        }
      } catch (_) {}
    }
  }
  
  // Set the selected connection ID
  document.getElementById('query-panel-config-id').value = foundConfigId;
  
  document.getElementById('query-panel-columns-list').innerHTML = '';
  document.getElementById('query-test-feedback').classList.add('hidden');
  
  panel.columns.forEach(col => {
    addQueryColumnInput(col.name, col.query);
  });
  
  // Load datasources for the selected connection
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
  let timeFrom = document.getElementById('query-panel-from').value;
  let timeTo = document.getElementById('query-panel-to').value;
  const step = document.getElementById('query-panel-step').value;
  
  const feedback = document.getElementById('query-test-feedback');
  const title = document.getElementById('query-test-title');
  const desc = document.getElementById('query-test-desc');
  
  if (timeFrom === 'custom') {
    timeFrom = document.getElementById('query-panel-custom-from-input').value.trim();
    timeTo = document.getElementById('query-panel-custom-to-input').value.trim() || 'now';
    if (!timeFrom) {
      feedback.className = 'alert alert-error';
      title.textContent = 'Validation Error';
      desc.textContent = 'Please enter a custom From time.';
      feedback.classList.remove('hidden');
      return;
    }
  }
  const columns = getColumnsFromModal();
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
  let timeFrom = document.getElementById('query-panel-from').value;
  let timeTo = document.getElementById('query-panel-to').value;
  const step = document.getElementById('query-panel-step').value;
  
  if (timeFrom === 'custom') {
    timeFrom = document.getElementById('query-panel-custom-from-input').value.trim();
    timeTo = document.getElementById('query-panel-custom-to-input').value.trim() || 'now';
    if (!timeFrom) {
      alert('Please enter a custom From time.');
      return;
    }
  }
  
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
        delete panelQueryCache[savedPanel.id];
        showQueryResultsView(savedPanel.id);
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
  
  ips.forEach(ip => {
    let txt = `QUERY METRICS EXPORT\n`;
    txt += `Panel: ${data.name || activeQueryPanelId}\n`;
    txt += `Server IP: ${ip}\n`;
    txt += `Date: ${new Date().toLocaleString()}\n`;
    txt += "=".repeat(50) + "\n\n";
    
    txt += "Timestamp\t" + columns.join("\t") + "\n";
    txt += "-".repeat(50) + "\n";
    
    rows.forEach(row => {
      const ipData = row[ip] || {};
      const vals = columns.map(col => {
        const val = ipData[col];
        return val !== undefined && val !== null ? formatMetricValue(val, col) : '-';
      });
      txt += `${row.timestampStr}\t${vals.join("\t")}\n`;
    });
    
    const blob = new Blob([txt], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeIp = ip.replace(/[^a-zA-Z0-9.-]/g, '_');
    link.download = `query_explorer_data_${activeQueryPanelId}_${safeIp}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 100);
  });
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
let isExportChartSettingsApplying = false;

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
  updateChartPreview();
};

window.onIpCheckboxChange = function() {
  const items = document.querySelectorAll('.ip-checkbox-item');
  const allCheckbox = document.getElementById('ip-checkbox-all');
  
  const allChecked = Array.from(items).every(item => item.checked);
  if (allCheckbox) {
    allCheckbox.checked = allChecked;
  }
  
  updateExportIpDropdownLabel();
  updateChartPreview();
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
  if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: starting. range=${selectedTimeRange}, step=${selectedStep}`);
  if (!activeQueryPanelId) {
    if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: ERR - activeQueryPanelId is falsy!`, '#ff7b72');
    return;
  }
  
  const previewContainer = document.getElementById('export-chart-preview-container');
  if (previewContainer) {
    previewContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px; display: flex; align-items: center; justify-content: center; height: 100%;">
        <span class="spinner" style="margin-right: 8px;"></span> Querying metrics for new time range...
      </div>
    `;
  }
  
  if (previewChartInstance) {
    if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: disposing existing previewChartInstance`);
    try {
      previewChartInstance.dispose();
    } catch (e) {
      if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: warning - dispose failed: ${e.message}`, '#ff9966');
    }
    previewChartInstance = null;
  }
  
  if (selectedTimeRange === 'default' && selectedStep === 'auto') {
    if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: default range/step detected. Loading from panelQueryCache`);
    exportChartData = JSON.parse(JSON.stringify(panelQueryCache[activeQueryPanelId]));
    exportChartDataTimeRange = 'default';
    exportChartDataStep = 'auto';
    updateExportDropdowns(exportChartData);
    await new Promise(resolve => {
      setTimeout(() => {
        if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: default fallback timeout fired`);
        initPreviewChartInstance();
        updateChartPreview();
        resolve();
      }, 150);
    });
    return;
  }
  
  try {
    const body = {};
    if (selectedTimeRange && typeof selectedTimeRange === 'string' && selectedTimeRange.startsWith('custom:')) {
      const parts = selectedTimeRange.substring(7).split('__');
      body.timeRangeFrom = parts[0];
      body.timeRangeTo = parts[1] || 'now';
    } else if (selectedTimeRange !== 'default') {
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
    
    if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: sending fetch POST request to /api/v1/query-explorer/panels/${activeQueryPanelId}/query`);
    const res = await fetch(`/api/v1/query-explorer/panels/${activeQueryPanelId}/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: response status=${res.status}`);
    const result = await res.json();
    if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: result success=${result.success}`);
    
    if (res.ok && result.success) {
      exportChartData = result.data;
      exportChartDataTimeRange = selectedTimeRange;
      exportChartDataStep = selectedStep;
      if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: data received, ips=${exportChartData?.ips?.length}, rows=${exportChartData?.rows?.length}`);
      updateExportDropdowns(exportChartData);
      await new Promise(resolve => {
        setTimeout(() => {
          if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: success timeout fired. initing & updating chart`);
          initPreviewChartInstance();
          updateChartPreview();
          resolve();
        }, 150);
      });
    } else {
      if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: ERR - status=${res.status}, msg=${result.message}`, '#ff7b72');
      if (previewContainer) {
        previewContainer.innerHTML = `
          <div style="text-align: center; color: #ff7b72; font-size: 12px; padding: 24px; display: flex; align-items: center; justify-content: center; height: 100%;">
            <strong>Query Error:</strong> ${result.message || 'Failed to fetch query results'}
          </div>
        `;
      }
    }
  } catch (error) {
    if (window.diagLog) window.diagLog(`fetchExportChartDataForTimeRange: EXCEPTION caught - ${error.message}`, '#ff7b72');
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
  if (window.diagLog) window.diagLog(`applyExportChartSettings: triggered. isApplying=${isExportChartSettingsApplying}`);
  if (isExportChartSettingsApplying) return;
  isExportChartSettingsApplying = true;
  
  const timeRangeSelect = document.getElementById('export-chart-timerange-select');
  let selectedTimeRange = timeRangeSelect ? timeRangeSelect.value : 'default';
  
  if (selectedTimeRange === 'custom') {
    const customFrom = document.getElementById('export-chart-custom-from').value.trim();
    const customTo = document.getElementById('export-chart-custom-to').value.trim() || 'now';
    selectedTimeRange = `custom:${customFrom}__${customTo}`;
  }
  
  const stepSelect = document.getElementById('export-chart-step-select');
  const selectedStep = stepSelect ? stepSelect.value : 'auto';
  
  const applyBtn = document.getElementById('btn-export-chart-apply');
  if (applyBtn) {
    applyBtn.disabled = true;
    applyBtn.innerHTML = '<span class="spinner" style="margin-right: 6px; width: 10px; height: 10px;"></span> APPLYING...';
  }
  
  try {
    if (window.diagLog) window.diagLog(`applyExportChartSettings: selectedTimeRange=${selectedTimeRange}, exportChartDataTimeRange=${exportChartDataTimeRange}, selectedStep=${selectedStep}, exportChartDataStep=${exportChartDataStep}`);
    if (selectedTimeRange !== exportChartDataTimeRange || selectedStep !== exportChartDataStep) {
      if (window.diagLog) window.diagLog(`applyExportChartSettings: settings changed, calling fetchExportChartDataForTimeRange`);
      await fetchExportChartDataForTimeRange(selectedTimeRange, selectedStep);
    } else {
      if (window.diagLog) window.diagLog(`applyExportChartSettings: settings unchanged, calling updateChartPreview directly`);
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
    isExportChartSettingsApplying = false;
    if (window.diagLog) window.diagLog(`applyExportChartSettings: finished. isApplying=false`);
  }
};

function initPreviewChartInstance() {
  const container = document.getElementById('export-chart-preview-container');
  if (window.diagLog) window.diagLog(`initPreviewChartInstance: container found=${!!container}`);
  if (!container) return;
  
  if (previewChartInstance) {
    if (window.diagLog) window.diagLog(`initPreviewChartInstance: disposing existing previewChartInstance`);
    try {
      previewChartInstance.dispose();
    } catch (e) {
      if (window.diagLog) window.diagLog(`initPreviewChartInstance: warning - dispose failed: ${e.message}`, '#ff9966');
    }
    previewChartInstance = null;
  }
  
  container.innerHTML = '';
  if (window.diagLog) window.diagLog(`initPreviewChartInstance: running echarts.init on container (dim: ${container.clientWidth}x${container.clientHeight})`);
  previewChartInstance = echarts.init(container, 'dark');
}

function updateChartPreview() {
  if (window.diagLog) window.diagLog(`updateChartPreview: starting. previewChartInstance=${!!previewChartInstance}`);
  if (!previewChartInstance) return;
  if (!activeQueryPanelId) return;
  const data = exportChartData;
  if (window.diagLog) window.diagLog(`updateChartPreview: data ips=${data?.ips?.length}, rows=${data?.rows?.length}`);
  if (!data) return;
  
  const ips = data.ips || [];
  const columns = data.columns || [];
  const rows = data.rows || [];
  
  if (ips.length === 0 || rows.length === 0) {
    if (window.diagLog) window.diagLog(`updateChartPreview: empty ips/rows. ips=${ips.length}, rows=${rows.length}`, '#ff9966');
    const container = document.getElementById('export-chart-preview-container');
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 24px; display: flex; align-items: center; justify-content: center; height: 100%;">
          No metrics data found for the selected time range.
        </div>
      `;
    }
    return;
  }
  
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
  
  if (window.diagLog) window.diagLog(`updateChartPreview: calling previewChartInstance.setOption with ${series.length} series`);
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
  
  // Clear custom inputs
  document.getElementById('export-chart-custom-from').value = '';
  document.getElementById('export-chart-custom-to').value = '';
  toggleExportCustomTimeFields('default');
  
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
    script.onerror = () => {
      if (previewContainer) {
        previewContainer.innerHTML = `
          <div style="text-align: center; color: #ff7b72; font-size: 12px; padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 8px;">
            <strong>Failed to Load Chart Library:</strong> ECharts CDN script could not be loaded. Please check your network connection or verify that jsdelivr is not blocked.
          </div>
        `;
      }
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
    try {
      previewChartInstance.dispose();
    } catch (e) {
      if (window.diagLog) window.diagLog(`closeExportChartModal: warning - dispose failed: ${e.message}`, '#ff9966');
    }
    previewChartInstance = null;
  }
  isExportChartSettingsApplying = false;
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
  
  if (ips.length === 0 || rows.length === 0) {
    alert("No data available to export.");
    return;
  }
  
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

function initDebuggingPage() {
  const isEnabled = localStorage.getItem('debugConsoleEnabled') === 'true';
  const checkbox = document.getElementById('debug-overlay-switch');
  if (checkbox) {
    checkbox.checked = isEnabled;
  }
}

window.toggleDebugOverlaySwitch = function(checked) {
  localStorage.setItem('debugConsoleEnabled', checked ? 'true' : 'false');
  
  const launcher = document.getElementById('diagnostic-launcher');
  const panel = document.getElementById('diagnostic-logger');
  
  if (checked) {
    if (launcher) launcher.style.display = 'flex';
  } else {
    if (launcher) launcher.style.display = 'none';
    if (panel) panel.style.display = 'none';
  }
  
  addLog('Configuration', `Diagnostic console overlay ${checked ? 'enabled' : 'disabled'}.`, 'INFO');
};

function toggleQueryCustomTimeFields(val) {
  const customTimeRow = document.getElementById('query-panel-custom-time-row');
  const toContainer = document.getElementById('query-panel-to-container');
  if (!customTimeRow || !toContainer) return;

  if (val === 'custom') {
    customTimeRow.style.display = 'grid';
    toContainer.style.display = 'none';
  } else {
    customTimeRow.style.display = 'none';
    toContainer.style.display = 'block';
  }
}
window.toggleQueryCustomTimeFields = toggleQueryCustomTimeFields;

function toggleExportCustomTimeFields(val) {
  const customFields = document.getElementById('export-chart-custom-time-fields');
  if (!customFields) return;
  if (val === 'custom') {
    customFields.style.display = 'grid';
  } else {
    customFields.style.display = 'none';
  }
}
window.toggleExportCustomTimeFields = toggleExportCustomTimeFields;

function formatToDatetimeLocalValue(dateStr) {
  if (!dateStr || dateStr === 'now') return '';
  
  // Try parsing DD/MM/YYYY HH:mm:ss format
  const ddmmyyyyRegex = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/;
  const matchDd = dateStr.trim().match(ddmmyyyyRegex);
  let dateObj;
  
  if (matchDd) {
    const day = parseInt(matchDd[1], 10);
    const month = parseInt(matchDd[2], 10) - 1;
    const year = parseInt(matchDd[3], 10);
    const hour = matchDd[4] ? parseInt(matchDd[4], 10) : 0;
    const minute = matchDd[5] ? parseInt(matchDd[5], 10) : 0;
    const second = matchDd[6] ? parseInt(matchDd[6], 10) : 0;
    dateObj = new Date(year, month, day, hour, minute, second);
  } else {
    // Try standard fallback
    const parsed = Date.parse(dateStr);
    if (!isNaN(parsed)) {
      dateObj = new Date(parsed);
    }
  }
  
  if (dateObj && !isNaN(dateObj.getTime())) {
    const pad = (num) => num.toString().padStart(2, '0');
    const y = dateObj.getFullYear();
    const m = pad(dateObj.getMonth() + 1);
    const d = pad(dateObj.getDate());
    const hh = pad(dateObj.getHours());
    const mm = pad(dateObj.getMinutes());
    const ss = pad(dateObj.getSeconds());
    return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
  }
  
  return '';
}
window.formatToDatetimeLocalValue = formatToDatetimeLocalValue;

async function triggerBackgroundExport(type, buttonEl) {
  if (!activeQueryPanelId) return;
  const panelId = activeQueryPanelId;
  
  // Show spinner inside button
  const spinner = buttonEl.querySelector('.spinner');
  const labelSpan = buttonEl.querySelector('span:last-child');
  const originalText = labelSpan ? labelSpan.textContent : 'Download';
  
  if (spinner) spinner.classList.remove('hidden');
  buttonEl.disabled = true;
  
  try {
    // If not cached, load data first
    if (!panelQueryCache[panelId]) {
      if (window.diagLog) window.diagLog(`triggerBackgroundExport: data not cached, loading from backend api`);
      if (labelSpan) labelSpan.textContent = 'Fetching data...';
      
      const res = await fetch(`/api/v1/query-explorer/panels/${panelId}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const result = await res.json();
      
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to fetch query results');
      }
      
      panelQueryCache[panelId] = result.data;
      addLog('Query Explorer', `Successfully fetched data for export.`, 'SUCCESS');
    }
    
    // Now trigger corresponding action
    if (type === 'csv') {
      exportActivePanelToCsv();
    } else if (type === 'txt') {
      exportActivePanelToTxt();
    } else if (type === 'xlsx') {
      exportActivePanelToExcel();
    } else if (type === 'chart') {
      openExportChartModal();
    } else if (type === 'table') {
      document.getElementById('query-table-preview-wrapper').classList.remove('hidden');
      renderActiveDataTable(panelQueryCache[panelId]);
    }
  } catch (error) {
    if (window.diagLog) window.diagLog(`triggerBackgroundExport: error occurred - ${error.message}`, '#ff7b72');
    alert(`Export Failed: ${error.message}`);
  } finally {
    if (spinner) spinner.classList.add('hidden');
    buttonEl.disabled = false;
    if (labelSpan) labelSpan.textContent = originalText;
  }
}
window.triggerBackgroundExport = triggerBackgroundExport;

function hideTablePreview() {
  document.getElementById('query-table-preview-wrapper').classList.add('hidden');
  dataPreviewChartInstances.forEach(instance => {
    try {
      instance.dispose();
    } catch (_) {}
  });
  dataPreviewChartInstances = [];
}
window.hideTablePreview = hideTablePreview;

let dataPreviewChartInstances = [];

function loadEChartsLibrary() {
  return new Promise((resolve, reject) => {
    if (typeof echarts !== 'undefined') {
      resolve();
      return;
    }
    if (window.diagLog) window.diagLog('loadEChartsLibrary: appending script tag to head');
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
    script.onload = () => {
      if (window.diagLog) window.diagLog('loadEChartsLibrary: loaded successfully', '#56d364');
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load ECharts library from CDN. Please check your internet connection.'));
    };
    document.head.appendChild(script);
  });
}

async function triggerQueryPreview(buttonEl) {
  if (!activeQueryPanelId) return;
  const panelId = activeQueryPanelId;
  const vizType = document.getElementById('preview-viz-type').value;
  const combineMetrics = document.getElementById('preview-combine-metrics').checked;
  
  const spinner = buttonEl.querySelector('.spinner');
  const labelSpan = buttonEl.querySelector('span:last-child');
  const originalText = labelSpan ? labelSpan.textContent : 'Preview';
  
  if (spinner) spinner.classList.remove('hidden');
  buttonEl.disabled = true;
  
  try {
    if (vizType !== 'table' && typeof echarts === 'undefined') {
      if (window.diagLog) window.diagLog('triggerQueryPreview: ECharts is undefined, loading dynamically...', '#e3b341');
      if (labelSpan) labelSpan.textContent = 'Loading chart library...';
      await loadEChartsLibrary();
    }
    if (!panelQueryCache[panelId]) {
      if (window.diagLog) window.diagLog(`triggerQueryPreview: data not cached, loading from backend api`);
      if (labelSpan) labelSpan.textContent = 'Fetching data...';
      
      const res = await fetch(`/api/v1/query-explorer/panels/${panelId}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const result = await res.json();
      
      if (!res.ok || !result.success) {
        throw new Error(result.message || 'Failed to fetch query results');
      }
      
      panelQueryCache[panelId] = result.data;
      addLog('Query Explorer', `Successfully fetched data for preview.`, 'SUCCESS');
    }
    
    document.getElementById('query-table-preview-wrapper').classList.remove('hidden');
    
    const titleEl = document.getElementById('query-preview-title');
    if (titleEl) {
      const typeLabel = vizType === 'table' ? 'Table' : (vizType.charAt(0).toUpperCase() + vizType.slice(1) + ' Chart');
      titleEl.innerHTML = `
        <span style="display: inline-block; width: 6px; height: 6px; background: #58a6ff; border-radius: 50%;"></span>
        Interactive Data Preview (${typeLabel})
      `;
    }
    
    const data = panelQueryCache[panelId];
    
    if (vizType === 'table') {
      document.getElementById('query-results-chart').style.display = 'none';
      document.getElementById('query-results-output').style.display = 'block';
      renderActiveDataTable(data);
    } else {
      document.getElementById('query-results-output').style.display = 'none';
      document.getElementById('query-results-chart').style.display = 'block';
      // Split is default for all chart types; combine checkbox overrides this
      const isSplitActive = !combineMetrics;
      renderActiveDataChart(data, vizType, isSplitActive);
    }
  } catch (error) {
    if (window.diagLog) window.diagLog(`triggerQueryPreview: error occurred - ${error.message}`, '#ff7b72');
    alert(`Preview Failed: ${error.message}`);
  } finally {
    if (spinner) spinner.classList.add('hidden');
    buttonEl.disabled = false;
    if (labelSpan) labelSpan.textContent = originalText;
  }
}
window.triggerQueryPreview = triggerQueryPreview;

// Show/hide the combine-metrics checkbox based on selected viz type
function togglePreviewSplitCheckboxVisibility(val) {
  const container = document.getElementById('preview-split-container');
  if (!container) return;
  // Show for all chart types except table
  container.style.display = val === 'table' ? 'none' : 'flex';
}
window.togglePreviewSplitCheckboxVisibility = togglePreviewSplitCheckboxVisibility;

function renderActiveDataChart(data, type, splitMetrics) {
  const container = document.getElementById('query-results-chart');
  if (!container) return;
  
  dataPreviewChartInstances.forEach(instance => {
    try {
      instance.dispose();
    } catch (_) {}
  });
  dataPreviewChartInstances = [];
  container.innerHTML = '';
  
  const ips = data.ips || [];
  const columns = data.columns || [];
  const rows = data.rows || [];
  
  if (ips.length === 0 || rows.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 12px; display: flex; align-items: center; justify-content: center; height: 100%; border: 1px solid var(--app-border); border-radius: 4px; background: rgba(0,0,0,0.15);">
        No telemetry matches found in database for the given time range.
      </div>
    `;
    return;
  }
  
  const chronologicalRows = [...rows].reverse();
  
  if (splitMetrics) {
    // Render one chart per column/metric â€” applies to ALL chart types
    columns.forEach(col => {
      const chartWrapper = document.createElement('div');
      chartWrapper.style.marginBottom = '24px';
      chartWrapper.style.border = '1px solid var(--app-border)';
      chartWrapper.style.borderRadius = '4px';
      chartWrapper.style.padding = '15px';
      chartWrapper.style.background = 'rgba(0,0,0,0.15)';
      chartWrapper.style.boxSizing = 'border-box';
      
      const chartTitle = document.createElement('h4');
      chartTitle.style.margin = '0 0 12px 0';
      chartTitle.style.fontSize = '12px';
      chartTitle.style.color = 'var(--text-white)';
      chartTitle.style.fontWeight = '600';
      chartTitle.style.textTransform = 'uppercase';
      chartTitle.style.letterSpacing = '0.5px';
      chartTitle.textContent = `${col} Preview`;
      
      const canvas = document.createElement('div');
      canvas.style.width = '100%';
      
      chartWrapper.appendChild(chartTitle);
      chartWrapper.appendChild(canvas);
      container.appendChild(chartWrapper);
      
      let option = {};
      
      if (type === 'pie' || type === 'donut') {
        canvas.style.height = '320px';
        // Per-metric pie: each slice = one IP's average value for this column
        const pieData = ips.map(ip => {
          let total = 0, count = 0;
          chronologicalRows.forEach(row => {
            const val = (row[ip] || {})[col];
            if (val !== undefined && val !== null && typeof val === 'number') {
              total += val; count++;
            }
          });
          return { name: ip, value: count > 0 ? Number((total / count).toFixed(2)) : 0 };
        });
        
        option = {
          backgroundColor: 'transparent',
          tooltip: {
            trigger: 'item',
            formatter: (params) => {
              const formatted = formatMetricValue(params.value, col);
              return `${params.marker} ${params.name}: <strong>${formatted}</strong> (${params.percent}%)`;
            },
            backgroundColor: '#161b22',
            borderColor: '#30363d',
            textStyle: { color: '#c9d1d9' }
          },
          legend: { orient: 'horizontal', bottom: 0, textStyle: { color: '#8b949e' } },
          series: [{
            name: col,
            type: 'pie',
            radius: type === 'donut' ? ['38%', '65%'] : '55%',
            avoidLabelOverlap: true,
            label: {
              show: true,
              formatter: (params) => `${params.name}\n${formatMetricValue(params.value, col)}`
            },
            emphasis: { label: { show: true, fontSize: 13, fontWeight: 'bold' } },
            data: pieData
          }]
        };
      } else {
        canvas.style.height = '300px';
        const xAxisData = chronologicalRows.map(r => r.timestampStr);
        const series = ips.map(ip => {
          const seriesData = chronologicalRows.map(row => {
            const val = (row[ip] || {})[col];
            return val !== undefined && val !== null ? Number(val.toFixed(2)) : null;
          });
          return {
            name: ip,
            type: type === 'bar' ? 'bar' : 'line',
            smooth: true,
            areaStyle: type === 'area' ? { opacity: 0.15 } : undefined,
            data: seriesData,
            tooltip: { valueFormatter: (value) => formatMetricValue(value, col) }
          };
        });
        
        option = {
          backgroundColor: 'transparent',
          tooltip: { trigger: 'axis', backgroundColor: '#161b22', borderColor: '#30363d', textStyle: { color: '#c9d1d9' } },
          legend: { data: series.map(s => s.name), textStyle: { color: '#8b949e' } },
          grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
          xAxis: {
            type: 'category',
            boundaryGap: type === 'bar',
            data: xAxisData,
            axisLine: { lineStyle: { color: '#30363d' } },
            axisLabel: { color: '#8b949e', fontSize: 10 }
          },
          yAxis: {
            type: 'value',
            axisLine: { lineStyle: { color: '#30363d' } },
            splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
            axisLabel: { color: '#8b949e', formatter: (value) => formatMetricValue(value, col) }
          },
          series: series
        };
      }
      
      const chartInstance = echarts.init(canvas, 'dark');
      chartInstance.setOption(option);
      dataPreviewChartInstances.push(chartInstance);
    });
  } else {
    // Single consolidated chart (stacked/all-in-one metrics or pie/donut)
    const chartWrapper = document.createElement('div');
    chartWrapper.style.border = '1px solid var(--app-border)';
    chartWrapper.style.borderRadius = '4px';
    chartWrapper.style.padding = '15px';
    chartWrapper.style.background = 'rgba(0,0,0,0.15)';
    chartWrapper.style.boxSizing = 'border-box';
    
    const canvas = document.createElement('div');
    canvas.style.width = '100%';
    canvas.style.height = '400px';
    
    chartWrapper.appendChild(canvas);
    container.appendChild(chartWrapper);
    
    const chartInstance = echarts.init(canvas, 'dark');
    let option = {};
    
    if (type === 'pie' || type === 'donut') {
      const pieData = [];
      ips.forEach(ip => {
        columns.forEach(col => {
          let total = 0;
          let count = 0;
          chronologicalRows.forEach(row => {
            const ipData = row[ip] || {};
            const val = ipData[col];
            if (val !== undefined && val !== null && typeof val === 'number') {
              total += val;
              count++;
            }
          });
          const avg = count > 0 ? Number((total / count).toFixed(2)) : 0;
          pieData.push({
            name: `${ip} - ${col}`,
            value: avg
          });
        });
      });
      
      option = {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'item',
          formatter: (params) => {
            // Find which column it is to format properly
            const matchCol = columns.find(c => params.name.endsWith(c));
            const formatted = matchCol ? formatMetricValue(params.value, matchCol) : params.value;
            return `${params.marker} ${params.name}: <strong>${formatted}</strong> (${params.percent}%)`;
          },
          backgroundColor: '#161b22',
          borderColor: '#30363d',
          textStyle: { color: '#c9d1d9' }
        },
        legend: {
          orient: 'vertical',
          left: 'left',
          textStyle: { color: '#8b949e' }
        },
        series: [
          {
            name: 'Metrics Averages',
            type: 'pie',
            radius: type === 'donut' ? ['40%', '70%'] : '55%',
            avoidLabelOverlap: true,
            label: {
              show: true,
              formatter: (params) => {
                const matchCol = columns.find(c => params.name.endsWith(c));
                const formatted = matchCol ? formatMetricValue(params.value, matchCol) : params.value;
                return `${params.name}: ${formatted}`;
              }
            },
            emphasis: {
              label: {
                show: true,
                fontSize: '14',
                fontWeight: 'bold'
              }
            },
            data: pieData
          }
        ]
      };
    } else {
      const xAxisData = chronologicalRows.map(r => r.timestampStr);
      const series = [];
      
      ips.forEach(ip => {
        columns.forEach(col => {
          const seriesData = chronologicalRows.map(row => {
            const ipData = row[ip] || {};
            const val = ipData[col];
            return val !== undefined && val !== null ? Number(val.toFixed(2)) : null;
          });
          
          series.push({
            name: `${ip} - ${col}`,
            type: type === 'bar' ? 'bar' : 'line',
            smooth: true,
            areaStyle: type === 'area' ? { opacity: 0.15 } : undefined,
            data: seriesData,
            tooltip: {
              valueFormatter: (value) => formatMetricValue(value, col)
            }
          });
        });
      });
      
      option = {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#161b22',
          borderColor: '#30363d',
          textStyle: { color: '#c9d1d9' }
        },
        legend: {
          data: series.map(s => s.name),
          textStyle: { color: '#8b949e' }
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          boundaryGap: type === 'bar',
          data: xAxisData,
          axisLine: { lineStyle: { color: '#30363d' } },
          axisLabel: { color: '#8b949e', fontSize: 10 }
        },
        yAxis: {
          type: 'value',
          axisLine: { lineStyle: { color: '#30363d' } },
          splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)' } },
          axisLabel: { color: '#8b949e' }
        },
        series: series
      };
    }
    
    chartInstance.setOption(option);
    dataPreviewChartInstances.push(chartInstance);
  }
}
window.renderActiveDataChart = renderActiveDataChart;

// ==========================================
// PROMETHEUS CONFIG EDITOR
// ==========================================

let promConfigEditor = null;
let promConfigOriginalContent = '';
let promConfigModified = false;
let promConfigProfiles = [];
let promConfigSelectedId = null;

async function loadPromConfigProfiles() {
  const select = document.getElementById('prom-config-profile-select');
  try {
    const res = await fetch('/api/v1/prometheus/configs');
    const result = await res.json();
    promConfigProfiles = (result.configs || []).map(c => ({
      id: c.id,
      name: c.name,
      mode: c.mode,
      path: c.path,
      reloadUrl: c.reloadUrl,
      isActive: c.isActive
    }));

    select.innerHTML = '';
    if (promConfigProfiles.length === 0) {
      select.innerHTML = '<option value="">No profiles configured</option>';
      return;
    }

    promConfigProfiles.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + ' (' + p.mode + ')';
      if (p.isActive && !promConfigSelectedId) opt.selected = true;
      select.appendChild(opt);
    });

    if (promConfigSelectedId) {
      select.value = promConfigSelectedId;
    }

    onPromConfigProfileChange();
  } catch (e) {
    select.innerHTML = '<option value="">Failed to load profiles</option>';
  }
}

function onPromConfigProfileChange() {
  const select = document.getElementById('prom-config-profile-select');
  promConfigSelectedId = select.value;

  const profile = promConfigProfiles.find(p => p.id === promConfigSelectedId);
  const modeEl = document.getElementById('prom-config-profile-mode');
  if (profile) {
    modeEl.textContent = profile.mode === 'local' ? 'Local File' : 'SSH Remote';
  } else {
    modeEl.textContent = '';
  }

  loadPrometheusConfig(promConfigSelectedId);
}

function initPrometheusConfigPage() {
  document.getElementById('prom-config-error').style.display = 'none';
  document.getElementById('prom-config-no-conn').style.display = 'none';
  document.getElementById('prom-config-loading').style.display = 'none';
  document.getElementById('prom-config-info').style.display = 'none';
  document.getElementById('prom-config-toolbar').style.display = 'none';
  document.getElementById('prom-config-editor-wrapper').style.display = 'none';
  document.getElementById('prom-config-result').style.display = 'none';

  loadPromConfigProfiles();
}

async function loadPrometheusConfig(configId) {
  const loadingEl = document.getElementById('prom-config-loading');
  const errorEl = document.getElementById('prom-config-error');
  const noConnEl = document.getElementById('prom-config-no-conn');

  loadingEl.style.display = 'flex';
  errorEl.style.display = 'none';
  noConnEl.style.display = 'none';

  try {
    const url = configId ? '/api/v1/prometheus/config?configId=' + encodeURIComponent(configId) : '/api/v1/prometheus/config';
    const res = await fetch(url);
    const result = await res.json();

    loadingEl.style.display = 'none';

    if (!result.success) {
      const msg = result.message || result.error || 'Failed to load config';
      if (msg.includes('ECONNREFUSED') || msg.includes('not found') || msg.includes('No active') || msg.includes('SSH') || msg.includes('not configured')) {
        noConnEl.style.display = 'block';
      } else {
        errorEl.style.display = 'block';
        document.getElementById('prom-config-error-msg').textContent = msg;
      }
      return;
    }

    document.getElementById('prom-config-path').textContent = result.path || '/etc/prometheus/prometheus.yml';
    document.getElementById('prom-config-info').style.display = 'flex';
    document.getElementById('prom-config-toolbar').style.display = 'flex';
    document.getElementById('prom-config-editor-wrapper').style.display = 'block';

    promConfigOriginalContent = result.content || '';
    promConfigModified = false;

    initCodeMirrorEditor(promConfigOriginalContent);
    updateModifiedBadge();
    document.getElementById('prom-config-status').textContent = 'Loaded';
    document.getElementById('prom-config-status').style.color = '#10b981';
  } catch (error) {
    loadingEl.style.display = 'none';
    const msg = error.message || 'Unknown error';
    if (msg.includes('fetch') || msg.includes('NetworkError') || msg.includes('Failed to fetch')) {
      noConnEl.style.display = 'block';
    } else {
      errorEl.style.display = 'block';
      document.getElementById('prom-config-error-msg').textContent = msg;
    }
  }
}

function initCodeMirrorEditor(content) {
  const textarea = document.getElementById('prom-config-editor');

  if (promConfigEditor) {
    promConfigEditor.toTextArea();
    promConfigEditor = null;
  }

  textarea.value = content;

  promConfigEditor = CodeMirror.fromTextArea(textarea, {
    mode: 'yaml',
    theme: 'material-darker',
    lineNumbers: true,
    lineWrapping: true,
    tabSize: 2,
    indentWithTabs: false,
    matchBrackets: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    extraKeys: {
      'Tab': function(cm) { cm.replaceSelection('  ', 'end'); }
    }
  });

  promConfigEditor.setValue(content);
  promConfigEditor.clearHistory();

  promConfigEditor.on('change', function() {
    const current = promConfigEditor.getValue();
    promConfigModified = (current !== promConfigOriginalContent);
    updateModifiedBadge();
  });

  setTimeout(() => promConfigEditor.refresh(), 100);
}

function updateModifiedBadge() {
  const badge = document.getElementById('prom-config-modified');
  if (promConfigModified) {
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

function showPromConfigResult(message, type) {
  const el = document.getElementById('prom-config-result');
  el.style.display = 'block';
  el.textContent = message;

  if (type === 'success') {
    el.style.background = 'rgba(16,185,129,0.12)';
    el.style.border = '1px solid rgba(16,185,129,0.3)';
    el.style.color = '#10b981';
  } else if (type === 'error') {
    el.style.background = 'rgba(239,68,68,0.12)';
    el.style.border = '1px solid rgba(239,68,68,0.3)';
    el.style.color = '#ef4444';
  } else {
    el.style.background = 'rgba(245,158,11,0.12)';
    el.style.border = '1px solid rgba(245,158,11,0.3)';
    el.style.color = '#f59e0b';
  }

  setTimeout(() => { el.style.display = 'none'; }, 8000);
}

function setValidationBadge(valid) {
  const badge = document.getElementById('prom-config-validation-badge');
  badge.style.display = 'inline';
  if (valid) {
    badge.textContent = 'Valid';
    badge.style.color = '#10b981';
    badge.style.background = 'rgba(16,185,129,0.12)';
  } else {
    badge.textContent = 'Invalid';
    badge.style.color = '#ef4444';
    badge.style.background = 'rgba(239,68,68,0.12)';
  }
}

async function validatePrometheusConfig() {
  if (!promConfigEditor) return;
  const btn = document.getElementById('btn-prom-validate');
  const origText = btn.innerHTML;
  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"></circle></svg> Validating...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/v1/prometheus/config/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: promConfigEditor.getValue(), configId: promConfigSelectedId || undefined })
    });
    const result = await res.json();

    if (result.success) {
      showPromConfigResult('Configuration is valid.', 'success');
      setValidationBadge(true);
    } else {
      showPromConfigResult('Validation error: ' + (result.message || result.error), 'error');
      setValidationBadge(false);
    }
  } catch (error) {
    showPromConfigResult('Validation request failed: ' + error.message, 'error');
    setValidationBadge(false);
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

async function savePrometheusConfig() {
  if (!promConfigEditor) return;

  if (!confirm('Save prometheus.yml and reload Prometheus?')) return;

  const btn = document.getElementById('btn-prom-save');
  const origText = btn.innerHTML;
  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"></circle></svg> Saving...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/v1/prometheus/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: promConfigEditor.getValue(), configId: promConfigSelectedId || undefined })
    });
    const result = await res.json();

    if (result.success) {
      promConfigOriginalContent = promConfigEditor.getValue();
      promConfigModified = false;
      updateModifiedBadge();
      const reloadMsg = result.reloaded ? 'Configuration saved and Prometheus reloaded.' : 'Configuration saved, but reload failed (check Prometheus --web.enable-lifecycle).';
      showPromConfigResult(reloadMsg, 'success');
      document.getElementById('prom-config-status').textContent = 'Saved ' + new Date().toLocaleTimeString();
      document.getElementById('prom-config-status').style.color = '#10b981';
      setValidationBadge(true);
    } else {
      showPromConfigResult('Save failed: ' + (result.message || result.error), 'error');
    }
  } catch (error) {
    showPromConfigResult('Save request failed: ' + error.message, 'error');
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

async function resetPrometheusConfig() {
  if (promConfigModified) {
    if (!confirm('Discard unsaved changes and reload from server?')) return;
  }
  await loadPrometheusConfig(promConfigSelectedId);
  showPromConfigResult('Configuration reloaded from server.', 'info');
}

// ==================== DATA PREPPER PIPELINES ====================

let dpConfigSelectedId = '';
let dpConfigOriginalContent = '';
let dpConfigModified = false;
let dpConfigCm = null;
let dpCurrentFilename = '';

function initDpConfigPage() {
  document.getElementById('dp-config-error').style.display = 'none';
  document.getElementById('dp-config-loading').style.display = 'none';
  document.getElementById('dp-config-info').style.display = 'none';
  document.getElementById('dp-config-toolbar').style.display = 'none';
  document.getElementById('dp-config-editor-wrapper').style.display = 'none';
  document.getElementById('dp-config-result').style.display = 'none';
  dpConfigSelectedId = '';
  dpCurrentFilename = '';
  loadDpConfigProfiles();
}

async function loadDpConfigProfiles() {
  const select = document.getElementById('dp-config-profile-select');
  select.innerHTML = '<option value="">Loading profiles...</option>';
  try {
    const res = await fetch('/api/v1/dataprepper/configs', {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('hephaestus_session_token') }
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to load');
    const configs = data.data || [];
    select.innerHTML = '';
    if (configs.length === 0) {
      select.innerHTML = '<option value="">No profiles configured</option>';
      loadDpPipelineFiles();
      return;
    }
    configs.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name + ' (' + c.mode.toUpperCase() + ')' + (c.isActive ? ' [ACTIVE]' : '');
      if (c.isActive) opt.selected = true;
      select.appendChild(opt);
    });
    dpConfigSelectedId = configs.find(c => c.isActive)?.id || configs[0]?.id || '';
    const active = configs.find(c => c.isActive) || configs[0];
    document.getElementById('dp-config-profile-mode').textContent = active ? active.mode.toUpperCase() : '';
    loadDpPipelineFiles();
  } catch (e) {
    select.innerHTML = '<option value="">Failed to load profiles</option>';
  }
}

function onDpConfigProfileChange() {
  const select = document.getElementById('dp-config-profile-select');
  dpConfigSelectedId = select.value;
  const opt = select.options[select.selectedIndex];
  document.getElementById('dp-config-profile-mode').textContent = opt ? (opt.textContent.includes('LOCAL') ? 'LOCAL' : opt.textContent.includes('SSH') ? 'SSH' : '') : '';
  loadDpPipelineFiles();
}

let dpFileDropdownFiles = [];

function toggleDpFileDropdown() {
  const menu = document.getElementById('dp-file-dropdown-menu');
  if (menu.style.display === 'none' || !menu.style.display) {
    menu.style.display = 'block';
    document.addEventListener('click', closeDpFileDropdownOutside);
  } else {
    menu.style.display = 'none';
    document.removeEventListener('click', closeDpFileDropdownOutside);
  }
}

function closeDpFileDropdownOutside(e) {
  const dropdown = document.getElementById('dp-file-dropdown');
  if (dropdown && !dropdown.contains(e.target)) {
    document.getElementById('dp-file-dropdown-menu').style.display = 'none';
    document.removeEventListener('click', closeDpFileDropdownOutside);
  }
}

function selectDpFile(filename) {
  dpCurrentFilename = filename;
  document.getElementById('dp-file-dropdown-label').textContent = filename || 'Select a pipeline file...';
  document.getElementById('dp-file-dropdown-menu').style.display = 'none';
  document.removeEventListener('click', closeDpFileDropdownOutside);
  if (filename) {
    loadDpPipelineContent(filename);
  } else {
    document.getElementById('dp-config-toolbar').style.display = 'none';
    document.getElementById('dp-config-editor-wrapper').style.display = 'none';
    document.getElementById('dp-config-info').style.display = 'none';
  }
}

async function loadDpPipelineFiles() {
  const menu = document.getElementById('dp-file-dropdown-menu');
  const label = document.getElementById('dp-file-dropdown-label');
  const loadingEl = document.getElementById('dp-config-loading');
  const errorEl = document.getElementById('dp-config-error');

  label.textContent = 'Loading pipeline files...';
  loadingEl.style.display = 'flex';
  errorEl.style.display = 'none';

  try {
    const url = dpConfigSelectedId ? '/api/v1/dataprepper/pipelines?configId=' + encodeURIComponent(dpConfigSelectedId) : '/api/v1/dataprepper/pipelines';
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('hephaestus_session_token') }
    });
    const data = await res.json();
    loadingEl.style.display = 'none';

    if (!data.success) throw new Error(data.error || 'Failed to load');

    const files = data.data?.files || [];
    const dir = data.data?.dir || '/opt/data-prepper/pipelines';
    document.getElementById('dp-config-dir').textContent = dir;
    document.getElementById('dp-file-info').textContent = files.length + ' file(s) found';
    dpFileDropdownFiles = files;

    label.textContent = 'Select a pipeline file...';
    menu.innerHTML = '';

    const defaultItem = document.createElement('div');
    defaultItem.textContent = 'Select a pipeline file...';
    defaultItem.style.cssText = 'padding: 8px 12px; color: #8b949e; font-size: 12px; cursor: default;';
    menu.appendChild(defaultItem);

    files.forEach(f => {
      const item = document.createElement('div');
      item.textContent = f;
      item.style.cssText = 'padding: 8px 12px; color: #e6edf3; font-size: 12px; cursor: pointer;';
      item.onmouseenter = function() { this.style.background = '#21262d'; };
      item.onmouseleave = function() { this.style.background = 'transparent'; };
      item.onclick = function() { selectDpFile(f); };
      menu.appendChild(item);
    });

    if (files.length === 0) {
      document.getElementById('dp-config-info').style.display = 'flex';
      document.getElementById('dp-config-toolbar').style.display = 'none';
      document.getElementById('dp-config-editor-wrapper').style.display = 'none';
    }
  } catch (e) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    document.getElementById('dp-config-error-msg').textContent = e.message;
    label.textContent = 'Failed to load files';
    menu.innerHTML = '';
  }
}

function onDpFileChange() {
  const filename = dpCurrentFilename;
  if (!filename) {
    document.getElementById('dp-config-toolbar').style.display = 'none';
    document.getElementById('dp-config-editor-wrapper').style.display = 'none';
    document.getElementById('dp-config-info').style.display = 'none';
    return;
  }
  loadDpPipelineContent(filename);
}

async function loadDpPipelineContent(filename) {
  const loadingEl = document.getElementById('dp-config-loading');
  const errorEl = document.getElementById('dp-config-error');

  loadingEl.style.display = 'flex';
  errorEl.style.display = 'none';

  try {
    const url = '/api/v1/dataprepper/pipeline?filename=' + encodeURIComponent(filename) + (dpConfigSelectedId ? '&configId=' + encodeURIComponent(dpConfigSelectedId) : '');
    const res = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + localStorage.getItem('hephaestus_session_token') }
    });
    const result = await res.json();
    loadingEl.style.display = 'none';

    if (!result.success) throw new Error(result.error || 'Failed to load');

    document.getElementById('dp-config-filename').textContent = filename;
    document.getElementById('dp-config-info').style.display = 'flex';
    document.getElementById('dp-config-toolbar').style.display = 'flex';
    document.getElementById('dp-config-editor-wrapper').style.display = 'block';

    dpConfigOriginalContent = result.data?.content || '';
    dpConfigModified = false;

    initDpCodeMirrorEditor(dpConfigOriginalContent);
    updateDpModifiedBadge();
    document.getElementById('dp-config-status').textContent = 'Loaded';
    document.getElementById('dp-config-status').style.color = '#10b981';
    document.getElementById('dp-config-result').style.display = 'none';
  } catch (e) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
    document.getElementById('dp-config-error-msg').textContent = e.message;
  }
}

function initDpCodeMirrorEditor(content) {
  const textarea = document.getElementById('dp-config-editor');
  if (typeof CodeMirror !== 'undefined') {
    if (dpConfigCm) dpConfigCm.toTextArea();
    dpConfigCm = CodeMirror.fromTextArea(textarea, {
      mode: 'yaml',
      theme: 'material-darker',
      lineNumbers: true,
      lineWrapping: true,
      tabSize: 2,
      indentWithTabs: false,
      autoCloseBrackets: true,
      matchBrackets: true,
      styleActiveLine: true,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      extraKeys: {
        'Tab': function(cm) { cm.replaceSelection('  ', 'end'); }
      }
    });
    dpConfigCm.setValue(content || '');
    dpConfigCm.on('change', () => {
      const current = dpConfigCm.getValue();
      dpConfigModified = (current !== dpConfigOriginalContent);
      updateDpModifiedBadge();
    });
    setTimeout(() => dpConfigCm.refresh(), 100);
  } else {
    textarea.value = content || '';
    textarea.oninput = () => {
      dpConfigModified = (textarea.value !== dpConfigOriginalContent);
      updateDpModifiedBadge();
    };
  }
}

function updateDpModifiedBadge() {
  const badge = document.getElementById('dp-config-modified');
  if (badge) badge.style.display = dpConfigModified ? 'inline-block' : 'none';
}

async function validateDpPipeline() {
  const content = dpConfigCm ? dpConfigCm.getValue() : document.getElementById('dp-config-editor').value;
  const resultEl = document.getElementById('dp-config-result');
  const badgeEl = document.getElementById('dp-config-validation-badge');

  try {
    const res = await fetch('/api/v1/dataprepper/pipeline/validate', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('hephaestus_session_token'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (data.success && data.data?.valid) {
      const names = data.data.pipelineNames || [];
      resultEl.style.display = 'block';
      resultEl.style.background = 'rgba(16,185,129,0.1)';
      resultEl.style.border = '1px solid rgba(16,185,129,0.3)';
      resultEl.style.color = '#10b981';
      resultEl.innerHTML = '<strong>Valid YAML</strong>' + (names.length ? ' â€” Pipelines: ' + names.map(n => '<code>' + escapeHtml(n) + '</code>').join(', ') : '');
      badgeEl.style.display = 'inline-block';
      badgeEl.style.background = 'rgba(16,185,129,0.15)';
      badgeEl.style.color = '#10b981';
      badgeEl.textContent = 'VALID';
    } else {
      resultEl.style.display = 'block';
      resultEl.style.background = 'rgba(239,68,68,0.1)';
      resultEl.style.border = '1px solid rgba(239,68,68,0.3)';
      resultEl.style.color = '#ef4444';
      resultEl.innerHTML = '<strong>Validation Failed:</strong> ' + escapeHtml(data.data?.error || 'Unknown error');
      badgeEl.style.display = 'inline-block';
      badgeEl.style.background = 'rgba(239,68,68,0.15)';
      badgeEl.style.color = '#ef4444';
      badgeEl.textContent = 'INVALID';
    }
  } catch (e) {
    resultEl.style.display = 'block';
    resultEl.style.background = 'rgba(239,68,68,0.1)';
    resultEl.style.border = '1px solid rgba(239,68,68,0.3)';
    resultEl.style.color = '#ef4444';
    resultEl.innerHTML = 'Validate request failed: ' + escapeHtml(e.message);
  }
}

async function saveDpPipeline() {
  if (!dpCurrentFilename) return;
  const content = dpConfigCm ? dpConfigCm.getValue() : document.getElementById('dp-config-editor').value;
  const btn = document.querySelector('#dp-config-toolbar .btn-primary');
  const resultEl = document.getElementById('dp-config-result');
  const origText = btn.innerHTML;

  btn.innerHTML = '<span class="spinner" style="margin-right: 4px;"></span> Saving...';
  btn.disabled = true;

  try {
    const res = await fetch('/api/v1/dataprepper/pipeline', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('hephaestus_session_token'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filename: dpCurrentFilename, content, configId: dpConfigSelectedId || undefined })
    });
    const data = await res.json();
    if (data.success) {
      dpConfigOriginalContent = content;
      dpConfigModified = false;
      updateDpModifiedBadge();
      resultEl.style.display = 'block';
      resultEl.style.background = data.reloaded ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)';
      resultEl.style.border = data.reloaded ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.3)';
      resultEl.style.color = data.reloaded ? '#10b981' : '#f59e0b';
      resultEl.textContent = data.message || 'Pipeline file saved successfully.';
      document.getElementById('dp-config-status').textContent = data.reloaded ? 'Saved & Reloaded' : 'Saved (Reload needed)';
      document.getElementById('dp-config-status').style.color = data.reloaded ? '#10b981' : '#f59e0b';
    } else {
      resultEl.style.display = 'block';
      resultEl.style.background = 'rgba(239,68,68,0.1)';
      resultEl.style.border = '1px solid rgba(239,68,68,0.3)';
      resultEl.style.color = '#ef4444';
      resultEl.innerHTML = '<strong>Save failed:</strong> ' + escapeHtml(data.message || data.error || 'Unknown error');
    }
  } catch (e) {
    resultEl.style.display = 'block';
    resultEl.style.background = 'rgba(239,68,68,0.1)';
    resultEl.style.border = '1px solid rgba(239,68,68,0.3)';
    resultEl.style.color = '#ef4444';
    resultEl.innerHTML = 'Save request failed: ' + escapeHtml(e.message);
  } finally {
    btn.innerHTML = origText;
    btn.disabled = false;
  }
}

function showNewDpFileModal() {
  const modal = document.getElementById('modal-new-dp-file');
  const input = document.getElementById('new-dp-filename');
  const errorEl = document.getElementById('new-dp-filename-error');
  if (modal) modal.classList.add('active');
  if (input) { input.value = ''; input.focus(); }
  if (errorEl) errorEl.style.display = 'none';
}

function closeNewDpFileModal() {
  const modal = document.getElementById('modal-new-dp-file');
  if (modal) modal.classList.remove('active');
}

async function submitNewDpFile() {
  const input = document.getElementById('new-dp-filename');
  const errorEl = document.getElementById('new-dp-filename-error');
  const createBtn = document.querySelector('#modal-new-dp-file .btn-primary, #modal-new-dp-file button:last-child');
  let filename = (input ? input.value : '').trim();

  if (!filename) {
    errorEl.textContent = 'Filename is required.';
    errorEl.style.display = 'block';
    return;
  }

  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    errorEl.textContent = 'Invalid filename: path separators and .. are not allowed.';
    errorEl.style.display = 'block';
    return;
  }

  if (!filename.endsWith('.yml') && !filename.endsWith('.yaml')) {
    filename += '.yml';
  }

  const existingOptions = dpFileDropdownFiles || [];
  if (existingOptions.includes(filename)) {
    errorEl.textContent = 'A file with this name already exists.';
    errorEl.style.display = 'block';
    return;
  }

  errorEl.style.display = 'none';
  const origBtnText = createBtn ? createBtn.textContent : '';
  if (createBtn) { createBtn.textContent = 'Creating...'; createBtn.disabled = true; }

  const templateContent =
`# Data Prepper Pipeline Configuration
# Created via Hephaestus Web UI
# https://opensearch.org/docs/latest/data-prepper/pipelines/

my-pipeline:
  source:
    http:
      port: 2021

  buffer:
    bounded_blocking:
      buffer_size: 10000
      batch_size: 1000

  sink:
    - opensearch:
        hosts: ["https://localhost:9200"]
        username: admin
        password: admin
`;

  try {
    const res = await fetch('/api/v1/dataprepper/pipeline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('hephaestus_session_token')
      },
      body: JSON.stringify({
        filename: filename,
        content: templateContent,
        configId: dpConfigSelectedId || undefined
      })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.error || result.message || 'Failed to create file');

    closeNewDpFileModal();
    await loadDpPipelineFiles();

    selectDpFile(filename);

    if (result.reloaded === false && result.message) {
      const resultEl = document.getElementById('dp-config-result');
      if (resultEl) {
        resultEl.style.display = 'block';
        resultEl.style.background = 'rgba(245,158,11,0.1)';
        resultEl.style.border = '1px solid rgba(245,158,11,0.3)';
        resultEl.style.color = '#f59e0b';
        resultEl.textContent = result.message;
      }
    } else {
      showFeedback('success', 'Pipeline Created', 'File "' + filename + '" created successfully.');
    }
  } catch (e) {
    errorEl.textContent = e.message;
    errorEl.style.display = 'block';
    showFeedback('error', 'Creation Failed', e.message);
  } finally {
    if (createBtn) { createBtn.textContent = origBtnText; createBtn.disabled = false; }
  }
}

// ==========================================
// BACKUP MANAGER
// ==========================================

const backupPages = ['backup-db-configs', 'backup-destinations', 'backup-run', 'backup-history'];

function toggleBackupSubmenu() {
  const submenu = document.getElementById('backup-submenu');
  const arrow = document.getElementById('menu-backup-arrow');
  if (submenu) {
    const isHidden = submenu.classList.contains('hidden') || submenu.style.display === 'none';
    if (isHidden) {
      submenu.classList.remove('hidden');
      submenu.style.display = 'flex';
      if (arrow) arrow.style.transform = 'rotate(180deg)';
      const hash = window.location.hash.replace('#', '') || 'overview';
      if (!backupPages.includes(hash)) {
        navigate('backup-db-configs');
      }
    } else {
      submenu.classList.add('hidden');
      submenu.style.display = 'none';
      if (arrow) arrow.style.transform = 'rotate(0deg)';
    }
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// ---- Database Connections ----
let backupDbConfigs = [];

async function loadBackupDbConfigs() {
  const container = document.getElementById('backup-db-list');
  container.innerHTML = '<div class="loading-container" style="display: flex;"><div class="loading-spinner"></div><div class="loading-text">Loading connections...</div></div>';
  try {
    const res = await fetch('/api/v1/backup/db-configs');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    backupDbConfigs = data.data || [];
    renderBackupDbConfigs();
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function renderBackupDbConfigs() {
  const container = document.getElementById('backup-db-list');
  if (backupDbConfigs.length === 0) {
    container.innerHTML = '<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg><p>No database connections configured.</p><p style="font-size: 11px;">Click "Add Database" to create a connection for backup operations.</p></div>';
    return;
  }
  const typeIcons = { postgresql: '#336791', mysql: '#4479a1', mariadb: '#003545', sqlserver: '#cc2927' };
  let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
  backupDbConfigs.forEach(c => {
    const color = typeIcons[c.dbType] || '#58a6ff';
    html += `
      <div class="registry-card" style="display: flex; align-items: center; justify-content: space-between; background: var(--app-card-dark); border: 1px solid var(--app-border); padding: 14px 16px; border-radius: 6px; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
          <div style="width: 36px; height: 36px; background: ${color}15; border: 1px solid ${color}30; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: ${color}; flex-shrink: 0; font-size: 10px; font-weight: bold;">${c.dbType.toUpperCase().substring(0,3)}</div>
          <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
            <span style="font-weight: 600; color: var(--text-white); font-size: 13px;">${escapeHtml(c.name)}</span>
            <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeHtml(c.host)}:${c.port} / ${escapeHtml(c.databaseName)}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <span class="status-badge" style="background: ${color}15; color: ${color}; border: 1px solid ${color}30; font-size: 9px;">${escapeHtml(c.dbType.toUpperCase())}</span>
          ${c.sshHost ? '<span class="status-badge" style="background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.3); font-size: 9px;">SSH</span>' : ''}
          <button class="btn btn-secondary" onclick="editBackupDbConfig('${escapeAttr(c.id)}')" style="padding: 4px 8px; font-size: 10px; height: 24px;">Edit</button>
          <button class="btn btn-danger" onclick="deleteBackupDbConfig('${escapeAttr(c.id)}', '${escapeAttr(c.name)}')" style="padding: 4px 8px; font-size: 10px; height: 24px;">Del</button>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function showAddBackupDbModal() {
  document.getElementById('backup-db-id').value = '';
  document.getElementById('backup-db-name').value = '';
  document.getElementById('backup-db-type').value = 'postgresql';
  document.getElementById('backup-db-host').value = '';
  document.getElementById('backup-db-port').value = '5432';
  document.getElementById('backup-db-username').value = '';
  document.getElementById('backup-db-password').value = '';
  document.getElementById('backup-db-database').value = '';
  document.getElementById('backup-db-ssh-host').value = '';
  document.getElementById('backup-db-ssh-port').value = '22';
  document.getElementById('backup-db-ssh-user').value = '';
  document.getElementById('backup-db-ssh-auth').value = 'password';
  document.getElementById('backup-db-ssh-password').value = '';
  document.getElementById('backup-db-ssh-key').value = '';
  document.getElementById('backup-db-test-result').style.display = 'none';
  document.getElementById('backup-db-modal-title').textContent = 'Add Database Connection';
  document.getElementById('modal-backup-db').classList.add('active');
}

function editBackupDbConfig(id) {
  const c = backupDbConfigs.find(x => x.id === id);
  if (!c) return;
  document.getElementById('backup-db-id').value = c.id;
  document.getElementById('backup-db-name').value = c.name;
  document.getElementById('backup-db-type').value = c.dbType;
  document.getElementById('backup-db-host').value = c.host;
  document.getElementById('backup-db-port').value = c.port;
  document.getElementById('backup-db-username').value = c.username;
  document.getElementById('backup-db-password').value = '';
  document.getElementById('backup-db-password').placeholder = 'Enter to change';
  document.getElementById('backup-db-database').value = c.databaseName;
  document.getElementById('backup-db-ssh-host').value = c.sshHost || '';
  document.getElementById('backup-db-ssh-port').value = c.sshPort || 22;
  document.getElementById('backup-db-ssh-user').value = c.sshUser || '';
  document.getElementById('backup-db-ssh-auth').value = c.sshAuth || 'password';
  document.getElementById('backup-db-ssh-password').value = '';
  document.getElementById('backup-db-ssh-key').value = '';
  document.getElementById('backup-db-test-result').style.display = 'none';
  document.getElementById('backup-db-modal-title').textContent = 'Edit Database Connection';
  document.getElementById('modal-backup-db').classList.add('active');
}

async function saveBackupDbConfig() {
  const id = document.getElementById('backup-db-id').value;
  const body = {
    id: id || undefined,
    name: document.getElementById('backup-db-name').value.trim(),
    dbType: document.getElementById('backup-db-type').value,
    host: document.getElementById('backup-db-host').value.trim(),
    port: document.getElementById('backup-db-port').value,
    username: document.getElementById('backup-db-username').value.trim(),
    password: document.getElementById('backup-db-password').value,
    databaseName: document.getElementById('backup-db-database').value.trim(),
    sshHost: document.getElementById('backup-db-ssh-host').value.trim() || undefined,
    sshPort: document.getElementById('backup-db-ssh-port').value || undefined,
    sshUser: document.getElementById('backup-db-ssh-user').value.trim() || undefined,
    sshAuth: document.getElementById('backup-db-ssh-auth').value,
    sshPassword: document.getElementById('backup-db-ssh-password').value || undefined,
    sshKey: document.getElementById('backup-db-ssh-key').value || undefined,
  };
  if (!body.name || !body.host || !body.username || !body.databaseName) {
    alert('Please fill in all required fields.'); return;
  }
  if (!id && !body.password) { alert('Password is required.'); return; }

  try {
    const res = await fetch('/api/v1/backup/db-configs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    closeModal('modal-backup-db');
    loadBackupDbConfigs();
  } catch (e) { alert('Error: ' + e.message); }
}

async function deleteBackupDbConfig(id, name) {
  if (!confirm(`Delete database connection "${name}"?`)) return;
  try {
    await fetch(`/api/v1/backup/db-configs/${id}`, { method: 'DELETE' });
    loadBackupDbConfigs();
  } catch (e) { alert('Error: ' + e.message); }
}

async function testBackupDbConnection() {
  const resultEl = document.getElementById('backup-db-test-result');
  resultEl.style.display = 'block';
  resultEl.style.background = 'rgba(88,166,255,0.1)';
  resultEl.style.border = '1px solid rgba(88,166,255,0.3)';
  resultEl.style.color = '#58a6ff';
  resultEl.textContent = 'Testing connection...';
  const body = {
    name: document.getElementById('backup-db-name').value.trim(),
    dbType: document.getElementById('backup-db-type').value,
    host: document.getElementById('backup-db-host').value.trim(),
    port: document.getElementById('backup-db-port').value,
    username: document.getElementById('backup-db-username').value.trim(),
    password: document.getElementById('backup-db-password').value || 'test',
    databaseName: document.getElementById('backup-db-database').value.trim(),
    sshHost: document.getElementById('backup-db-ssh-host').value.trim() || undefined,
    sshPort: document.getElementById('backup-db-ssh-port').value || undefined,
    sshUser: document.getElementById('backup-db-ssh-user').value.trim() || undefined,
    sshAuth: document.getElementById('backup-db-ssh-auth').value,
    sshPassword: document.getElementById('backup-db-ssh-password').value || undefined,
    sshKey: document.getElementById('backup-db-ssh-key').value || undefined,
  };
  try {
    const res = await fetch('/api/v1/backup/db-configs/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    resultEl.style.background = data.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
    resultEl.style.borderColor = data.success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';
    resultEl.style.color = data.success ? '#10b981' : '#ef4444';
    resultEl.textContent = data.message || data.error;
  } catch (e) {
    resultEl.style.background = 'rgba(239,68,68,0.1)';
    resultEl.style.borderColor = 'rgba(239,68,68,0.3)';
    resultEl.style.color = '#ef4444';
    resultEl.textContent = 'Test failed: ' + e.message;
  }
}

// ---- Backup Destinations ----
let backupDestinations = [];

async function loadBackupDestinations() {
  const container = document.getElementById('backup-dest-list');
  container.innerHTML = '<div class="loading-container" style="display: flex;"><div class="loading-spinner"></div><div class="loading-text">Loading destinations...</div></div>';
  try {
    const res = await fetch('/api/v1/backup/destinations');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    backupDestinations = data.data || [];
    renderBackupDestinations();
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function renderBackupDestinations() {
  const container = document.getElementById('backup-dest-list');
  if (backupDestinations.length === 0) {
    container.innerHTML = '<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><p>No backup destinations configured.</p></div>';
    return;
  }
  const typeLabels = { local: 'Local Disk', r2: 'Cloudflare R2', gdrive: 'Google Drive', nas: 'NAS (SSH)' };
  const typeColors = { local: '#10b981', r2: '#f59e0b', gdrive: '#4285f4', nas: '#8b5cf6' };
  let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
  backupDestinations.forEach(d => {
    const color = typeColors[d.destType] || '#58a6ff';
    const detail = d.destType === 'local' ? (d.config.path || '/opt/backups') : d.destType === 'r2' ? (d.config.bucket || '-') : d.destType === 'gdrive' ? (d.config.folderId || 'Root') : (d.config.host || '-');
    html += `
      <div class="registry-card" style="display: flex; align-items: center; justify-content: space-between; background: var(--app-card-dark); border: 1px solid var(--app-border); padding: 14px 16px; border-radius: 6px; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
          <div style="width: 36px; height: 36px; background: ${color}15; border: 1px solid ${color}30; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: ${color}; flex-shrink: 0; font-size: 10px; font-weight: bold;">${d.destType.toUpperCase().substring(0,3)}</div>
          <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
            <span style="font-weight: 600; color: var(--text-white); font-size: 13px;">${escapeHtml(d.name)}</span>
            <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">${escapeHtml(detail)}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <span class="status-badge" style="background: ${color}15; color: ${color}; border: 1px solid ${color}30; font-size: 9px;">${escapeHtml(typeLabels[d.destType] || d.destType)}</span>
          <button class="btn btn-secondary" onclick="editBackupDest('${escapeAttr(d.id)}')" style="padding: 4px 8px; font-size: 10px; height: 24px;">Edit</button>
          <button class="btn btn-danger" onclick="deleteBackupDest('${escapeAttr(d.id)}', '${escapeAttr(d.name)}')" style="padding: 4px 8px; font-size: 10px; height: 24px;">Del</button>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

function showAddBackupDestModal() {
  document.getElementById('backup-dest-id').value = '';
  document.getElementById('backup-dest-name').value = '';
  document.getElementById('backup-dest-type').value = 'local';
  document.getElementById('backup-dest-local-path').value = '/opt/backups';
  document.getElementById('backup-dest-r2-account-id').value = '';
  document.getElementById('backup-dest-r2-bucket').value = '';
  document.getElementById('backup-dest-r2-access-key').value = '';
  document.getElementById('backup-dest-r2-secret-key').value = '';
  document.getElementById('backup-dest-gdrive-token').value = '';
  document.getElementById('backup-dest-gdrive-folder').value = '';
  document.getElementById('backup-dest-nas-host').value = '';
  document.getElementById('backup-dest-nas-port').value = '22';
  document.getElementById('backup-dest-nas-user').value = '';
  document.getElementById('backup-dest-nas-password').value = '';
  document.getElementById('backup-dest-nas-path').value = '/backups';
  document.getElementById('backup-dest-modal-title').textContent = 'Add Destination';
  onBackupDestTypeChange();
  document.getElementById('modal-backup-dest').classList.add('active');
}

function editBackupDest(id) {
  const d = backupDestinations.find(x => x.id === id);
  if (!d) return;
  document.getElementById('backup-dest-id').value = d.id;
  document.getElementById('backup-dest-name').value = d.name;
  document.getElementById('backup-dest-type').value = d.destType;
  document.getElementById('backup-dest-local-path').value = d.config.path || '';
  document.getElementById('backup-dest-r2-account-id').value = d.config.accountId || '';
  document.getElementById('backup-dest-r2-bucket').value = d.config.bucket || '';
  document.getElementById('backup-dest-r2-access-key').value = d.config.accessKeyId || '';
  document.getElementById('backup-dest-r2-secret-key').value = '';
  document.getElementById('backup-dest-r2-secret-key').placeholder = 'Enter to change';
  document.getElementById('backup-dest-gdrive-token').value = '';
  document.getElementById('backup-dest-gdrive-token').placeholder = 'Enter to change';
  document.getElementById('backup-dest-gdrive-folder').value = d.config.folderId || '';
  document.getElementById('backup-dest-nas-host').value = d.config.host || '';
  document.getElementById('backup-dest-nas-port').value = d.config.port || 22;
  document.getElementById('backup-dest-nas-user').value = d.config.username || '';
  document.getElementById('backup-dest-nas-password').value = '';
  document.getElementById('backup-dest-nas-path').value = d.config.path || '';
  document.getElementById('backup-dest-modal-title').textContent = 'Edit Destination';
  onBackupDestTypeChange();
  document.getElementById('modal-backup-dest').classList.add('active');
}

function onBackupDestTypeChange() {
  const type = document.getElementById('backup-dest-type').value;
  document.querySelectorAll('.dest-config-section').forEach(el => el.style.display = 'none');
  const configMap = { local: 'dest-local-config', r2: 'dest-r2-config', gdrive: 'dest-gdrive-config', nas: 'dest-nas-config' };
  const el = document.getElementById(configMap[type]);
  if (el) el.style.display = 'block';
}

async function saveBackupDestination() {
  const id = document.getElementById('backup-dest-id').value;
  const type = document.getElementById('backup-dest-type').value;
  let config = {};
  if (type === 'local') {
    config = { path: document.getElementById('backup-dest-local-path').value.trim() || '/opt/backups' };
  } else if (type === 'r2') {
    config = { accountId: document.getElementById('backup-dest-r2-account-id').value.trim(), bucket: document.getElementById('backup-dest-r2-bucket').value.trim(), accessKeyId: document.getElementById('backup-dest-r2-access-key').value.trim(), secretAccessKey: document.getElementById('backup-dest-r2-secret-key').value };
  } else if (type === 'gdrive') {
    config = { accessToken: document.getElementById('backup-dest-gdrive-token').value, folderId: document.getElementById('backup-dest-gdrive-folder').value.trim() };
  } else if (type === 'nas') {
    config = { host: document.getElementById('backup-dest-nas-host').value.trim(), port: parseInt(document.getElementById('backup-dest-nas-port').value), username: document.getElementById('backup-dest-nas-user').value.trim(), sshAuth: document.getElementById('backup-dest-nas-auth').value, password: document.getElementById('backup-dest-nas-password').value, sshKey: document.getElementById('backup-dest-nas-key').value, path: document.getElementById('backup-dest-nas-path').value.trim() };
  }
  const body = { id: id || undefined, name: document.getElementById('backup-dest-name').value.trim(), destType: type, config };
  if (!body.name) { alert('Name is required.'); return; }
  try {
    const res = await fetch('/api/v1/backup/destinations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    closeModal('modal-backup-dest');
    loadBackupDestinations();
  } catch (e) { alert('Error: ' + e.message); }
}

async function deleteBackupDest(id, name) {
  if (!confirm(`Delete destination "${name}"?`)) return;
  try {
    await fetch(`/api/v1/backup/destinations/${id}`, { method: 'DELETE' });
    loadBackupDestinations();
  } catch (e) { alert('Error: ' + e.message); }
}

// ---- Run Backup ----
async function loadBackupRunForm() {
  try {
    const [dbRes, destRes] = await Promise.all([
      fetch('/api/v1/backup/db-configs').then(r => r.json()),
      fetch('/api/v1/backup/destinations').then(r => r.json())
    ]);
    const dbSelect = document.getElementById('backup-run-db');
    const destSelect = document.getElementById('backup-run-dest');
    dbSelect.innerHTML = '';
    destSelect.innerHTML = '';
    if (dbRes.success && dbRes.data.length) {
      dbRes.data.forEach(c => { dbSelect.innerHTML += `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)} (${c.dbType.toUpperCase()})</option>`; });
    } else {
      dbSelect.innerHTML = '<option value="">No databases configured</option>';
    }
    if (destRes.success && destRes.data.length) {
      destRes.data.forEach(d => { destSelect.innerHTML += `<option value="${escapeAttr(d.id)}">${escapeHtml(d.name)} (${d.destType.toUpperCase()})</option>`; });
    } else {
      destSelect.innerHTML = '<option value="">No destinations configured</option>';
    }
    loadBackupSchedules();
  } catch (e) {}
}

async function runBackupNow() {
  const dbConfigId = document.getElementById('backup-run-db').value;
  const destinationId = document.getElementById('backup-run-dest').value;
  const resultEl = document.getElementById('backup-run-result');
  const btn = document.getElementById('backup-run-btn');
  if (!dbConfigId || !destinationId) { alert('Please select both database and destination.'); return; }
  btn.innerHTML = '<span class="spinner" style="margin-right: 4px;"></span> Backing up...';
  btn.disabled = true;
  resultEl.style.display = 'block';
  resultEl.style.background = 'rgba(88,166,255,0.1)';
  resultEl.style.border = '1px solid rgba(88,166,255,0.3)';
  resultEl.style.color = '#58a6ff';
  resultEl.textContent = 'Backup in progress...';
  try {
    const res = await fetch('/api/v1/backup/run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dbConfigId, destinationId })
    });
    const data = await res.json();
    if (data.success) {
      resultEl.style.background = 'rgba(16,185,129,0.1)';
      resultEl.style.borderColor = 'rgba(16,185,129,0.3)';
      resultEl.style.color = '#10b981';
      resultEl.innerHTML = `<strong>Backup Successful</strong><br>${escapeHtml(data.message)}<br>File: ${escapeHtml(data.data.filename)} (${formatBytes(data.data.fileSize)})`;
    } else {
      throw new Error(data.error || 'Backup failed');
    }
  } catch (e) {
    resultEl.style.background = 'rgba(239,68,68,0.1)';
    resultEl.style.borderColor = 'rgba(239,68,68,0.3)';
    resultEl.style.color = '#ef4444';
    resultEl.innerHTML = `<strong>Backup Failed</strong><br>${escapeHtml(e.message)}`;
  } finally {
    btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg> Start Backup';
    btn.disabled = false;
  }
}

// ---- Backup History ----
async function loadBackupHistory() {
  const tbody = document.getElementById('backup-history-tbody');
  tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">Loading...</td></tr>';
  try {
    const res = await fetch('/api/v1/backup/history');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    const history = data.data || [];
    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 20px;">No backup history yet.</td></tr>';
      return;
    }
    const statusColors = { success: '#10b981', failed: '#ef4444', running: '#58a6ff' };
    tbody.innerHTML = history.map(h => {
      const color = statusColors[h.status] || '#58a6ff';
      const time = h.startedAt ? new Date(h.startedAt).toLocaleString() : '-';
      return `<tr>
        <td class="font-mono" style="font-size: 11px;">${time}</td>
        <td>${escapeHtml(h.dbName)}</td>
        <td><span class="status-badge" style="font-size: 9px;">${escapeHtml(h.dbType.toUpperCase())}</span></td>
        <td><span class="status-badge" style="font-size: 9px;">${escapeHtml(h.destType.toUpperCase())}</span></td>
        <td class="font-mono" style="font-size: 11px;">${escapeHtml(h.filename)}</td>
        <td>${formatBytes(h.fileSize)}</td>
        <td><span class="status-badge" style="background: ${color}20; color: ${color}; border: 1px solid ${color}40; font-size: 9px;">${escapeHtml(h.status.toUpperCase())}</span></td>
        <td>${h.status === 'failed' ? `<button class="btn btn-danger" onclick="deleteBackupHistory('${escapeAttr(h.id)}')" style="padding: 2px 6px; font-size: 10px;">Del</button>` : ''}</td>
      </tr>`;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #ef4444; padding: 20px;">${escapeHtml(e.message)}</td></tr>`;
  }
}

async function deleteBackupHistory(id) {
  try {
    await fetch(`/api/v1/backup/history/${id}`, { method: 'DELETE' });
    loadBackupHistory();
  } catch (e) { alert('Error: ' + e.message); }
}

// ---- Backup Schedules ----
let backupSchedules = [];

async function loadBackupSchedules() {
  const container = document.getElementById('backup-schedule-list');
  if (!container) return;
  container.innerHTML = '<div class="loading-container" style="display: flex;"><div class="loading-spinner"></div><div class="loading-text">Loading schedules...</div></div>';
  try {
    const res = await fetch('/api/v1/backup/schedules');
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    backupSchedules = data.data || [];
    renderBackupSchedules();
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">${escapeHtml(e.message)}</div>`;
  }
}

function renderBackupSchedules() {
  const container = document.getElementById('backup-schedule-list');
  if (backupSchedules.length === 0) {
    container.innerHTML = '<div class="empty-state"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><p>No backup schedules configured.</p><p style="font-size: 11px;">Create a schedule to automate your backups.</p></div>';
    return;
  }
  let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
  backupSchedules.forEach(s => {
    const dbConf = backupDbConfigs.find(c => c.id === s.dbConfigId);
    const destConf = backupDestinations.find(d => d.id === s.destinationId);
    const dbName = dbConf ? dbConf.name : s.dbConfigId;
    const destName = destConf ? destConf.name : s.destinationId;
    const lastRun = s.lastRun ? new Date(s.lastRun).toLocaleString() : 'Never';
    const activeColor = s.isActive ? '#10b981' : '#6b7280';
    html += `
      <div class="registry-card" style="display: flex; align-items: center; justify-content: space-between; background: var(--app-card-dark); border: 1px solid var(--app-border); padding: 14px 16px; border-radius: 6px; gap: 12px; opacity: ${s.isActive ? '1' : '0.6'};">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
          <div style="width: 36px; height: 36px; background: ${activeColor}15; border: 1px solid ${activeColor}30; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: ${activeColor}; flex-shrink: 0;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          </div>
          <div style="display: flex; flex-direction: column; gap: 2px; min-width: 0;">
            <span style="font-weight: 600; color: var(--text-white); font-size: 13px;">${escapeHtml(s.name)}</span>
            <span style="font-size: 11px; color: var(--text-muted); font-family: monospace;">
              ${escapeHtml(s.cronExpression)} &middot; ${escapeHtml(dbName)} &rarr; ${escapeHtml(destName)}
            </span>
            <span style="font-size: 10px; color: var(--text-muted);">Last run: ${lastRun}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
          <span class="status-badge" style="background: ${activeColor}15; color: ${activeColor}; border: 1px solid ${activeColor}30; font-size: 9px;">${s.isActive ? 'ACTIVE' : 'PAUSED'}</span>
          <button class="btn btn-secondary" onclick="toggleBackupSchedule('${escapeAttr(s.id)}', ${!s.isActive})" style="padding: 4px 8px; font-size: 10px; height: 24px;" title="${s.isActive ? 'Pause' : 'Resume'}">
            ${s.isActive ? 'Pause' : 'Resume'}
          </button>
          <button class="btn btn-secondary" onclick="runBackupScheduleNow('${escapeAttr(s.id)}')" style="padding: 4px 8px; font-size: 10px; height: 24px;" title="Run Now">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </button>
          <button class="btn btn-secondary" onclick="editBackupSchedule('${escapeAttr(s.id)}')" style="padding: 4px 8px; font-size: 10px; height: 24px;">Edit</button>
          <button class="btn btn-danger" onclick="deleteBackupSchedule('${escapeAttr(s.id)}', '${escapeAttr(s.name)}')" style="padding: 4px 8px; font-size: 10px; height: 24px;">Del</button>
        </div>
      </div>`;
  });
  html += '</div>';
  container.innerHTML = html;
}

async function saveQuickBackupAsSchedule() {
  const dbConfigId = document.getElementById('backup-run-db').value;
  const destinationId = document.getElementById('backup-run-dest').value;
  if (!dbConfigId || !destinationId) { alert('Select database and destination first.'); return; }
  const dbConf = backupDbConfigs.find(c => c.id === dbConfigId);
  const destConf = backupDestinations.find(d => d.id === destinationId);
  const defaultName = dbConf && destConf ? `${dbConf.name} â†’ ${destConf.name}` : 'New Schedule';

  document.getElementById('backup-schedule-id').value = '';
  document.getElementById('backup-schedule-name').value = defaultName;
  document.getElementById('backup-schedule-cron').value = '0 2 * * *';
  document.getElementById('backup-schedule-modal-title').textContent = 'Add Backup Schedule';

  await loadBackupScheduleSelectors();
  document.getElementById('backup-schedule-db').value = dbConfigId;
  document.getElementById('backup-schedule-dest').value = destinationId;
  updateBackupCronPreview();
  document.getElementById('modal-backup-schedule').classList.add('active');
}

function showAddBackupScheduleModal() {
  document.getElementById('backup-schedule-id').value = '';
  document.getElementById('backup-schedule-name').value = '';
  document.getElementById('backup-schedule-cron').value = '0 2 * * *';
  document.getElementById('backup-schedule-modal-title').textContent = 'Add Backup Schedule';
  loadBackupScheduleSelectors().then(() => {
    document.getElementById('backup-schedule-db').value = '';
    document.getElementById('backup-schedule-dest').value = '';
  });
  updateBackupCronPreview();
  document.getElementById('modal-backup-schedule').classList.add('active');
}

async function loadBackupScheduleSelectors() {
  const [dbRes, destRes] = await Promise.all([
    fetch('/api/v1/backup/db-configs').then(r => r.json()),
    fetch('/api/v1/backup/destinations').then(r => r.json())
  ]);
  const dbSelect = document.getElementById('backup-schedule-db');
  const destSelect = document.getElementById('backup-schedule-dest');
  dbSelect.innerHTML = '<option value="">Select database...</option>';
  destSelect.innerHTML = '<option value="">Select destination...</option>';
  if (dbRes.success && dbRes.data.length) {
    dbRes.data.forEach(c => { dbSelect.innerHTML += `<option value="${escapeAttr(c.id)}">${escapeHtml(c.name)} (${c.dbType.toUpperCase()})</option>`; });
  }
  if (destRes.success && destRes.data.length) {
    destRes.data.forEach(d => { destSelect.innerHTML += `<option value="${escapeAttr(d.id)}">${escapeHtml(d.name)} (${d.destType.toUpperCase()})</option>`; });
  }
}

function editBackupSchedule(id) {
  const s = backupSchedules.find(x => x.id === id);
  if (!s) return;
  document.getElementById('backup-schedule-id').value = s.id;
  document.getElementById('backup-schedule-name').value = s.name;
  document.getElementById('backup-schedule-cron').value = s.cronExpression;
  document.getElementById('backup-schedule-modal-title').textContent = 'Edit Backup Schedule';
  loadBackupScheduleSelectors().then(() => {
    document.getElementById('backup-schedule-db').value = s.dbConfigId;
    document.getElementById('backup-schedule-dest').value = s.destinationId;
  });
  updateBackupCronPreview();
  document.getElementById('modal-backup-schedule').classList.add('active');
}

async function saveBackupSchedule() {
  const id = document.getElementById('backup-schedule-id').value;
  const body = {
    id: id || undefined,
    name: document.getElementById('backup-schedule-name').value.trim(),
    dbConfigId: document.getElementById('backup-schedule-db').value,
    destinationId: document.getElementById('backup-schedule-dest').value,
    cronExpression: document.getElementById('backup-schedule-cron').value.trim(),
  };
  if (!body.name || !body.dbConfigId || !body.destinationId || !body.cronExpression) {
    alert('Please fill in all fields.'); return;
  }
  try {
    const res = await fetch('/api/v1/backup/schedules', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    closeModal('modal-backup-schedule');
    loadBackupSchedules();
  } catch (e) { alert('Error: ' + e.message); }
}

async function deleteBackupSchedule(id, name) {
  if (!confirm(`Delete schedule "${name}"?`)) return;
  try {
    await fetch(`/api/v1/backup/schedules/${id}`, { method: 'DELETE' });
    loadBackupSchedules();
  } catch (e) { alert('Error: ' + e.message); }
}

async function toggleBackupSchedule(id, isActive) {
  try {
    await fetch(`/api/v1/backup/schedules/${id}/toggle`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive })
    });
    loadBackupSchedules();
  } catch (e) { alert('Error: ' + e.message); }
}

async function runBackupScheduleNow(id) {
  if (!confirm('Run this backup now?')) return;
  try {
    const res = await fetch(`/api/v1/backup/schedules/${id}/run`, { method: 'POST' });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    alert(`Backup completed: ${data.data.filename}`);
    loadBackupSchedules();
  } catch (e) { alert('Error: ' + e.message); }
}

function setBackupCronPreset(expr) {
  document.getElementById('backup-schedule-cron').value = expr;
  updateBackupCronPreview();
}

function updateBackupCronPreview() {
  const expr = document.getElementById('backup-schedule-cron').value.trim();
  const previewEl = document.getElementById('backup-schedule-cron-preview');
  if (!previewEl) return;
  if (!expr) { previewEl.textContent = ''; return; }
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) { previewEl.textContent = 'Invalid cron format'; previewEl.style.color = '#ef4444'; return; }
  const [min, hour, dom, mon, dow] = parts;
  let desc = 'Runs ';
  if (min === '*' && hour === '*') desc += 'every minute';
  else if (min === '*' && hour !== '*') desc += `every minute past hour ${hour}`;
  else if (min !== '*' && hour === '*') desc += `at minute ${min} every hour`;
  else desc += `at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;

  if (dom !== '*' && mon === '*' && dow === '*') desc += `, every day ${dom} of month`;
  else if (dom === '*' && mon === '*' && dow === '0') desc += ' every Sunday';
  else if (dom === '*' && mon === '*' && dow === '1') desc += ' every Monday';
  else if (dom === '*' && mon === '*' && dow === '*') desc += ' every day';
  else if (dom !== '*' && mon !== '*') desc += ` on ${mon}/${dom}`;
  else desc += ` (dom=${dom} mon=${mon} dow=${dow})`;

  previewEl.textContent = desc;
  previewEl.style.color = 'var(--text-muted)';
}

document.addEventListener('DOMContentLoaded', () => {
  const cronInput = document.getElementById('backup-schedule-cron');
  if (cronInput) cronInput.addEventListener('input', updateBackupCronPreview);
});
