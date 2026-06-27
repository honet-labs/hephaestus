# Hephaestus DevOps Portal

Hephaestus is a lightweight, self-hosted DevOps portal designed to manage Grafana integrations, configure scrape targets, and auto-install exporters across multi-server environments.

---

## Key Features

1.  **Unified Connections Registry**: Dynamic configuration for Grafana Core API instances and Prometheus servers (both local and remote via SSH/SFTP).
2.  **Interactive Configuration Manager**: Direct web-based configuration editor for `prometheus.yml` files, featuring dry-run YAML syntax checking and hot-reload triggers.
3.  **Exporter Installer**: Automated installer guide for generating configuration and systemd service scripts for `node_exporter`, `blackbox_exporter`, and `snmp_exporter` across multiple processor architectures (AMD64, ARM, Windows).
4.  **Diagnostics & Real-time Telemetry**: Active ping checks to verify server connectivity at a glance, along with logs and execution stats.

---

## Directory Structure

```
hephaestus/
├── src/                      # Backend TypeScript Source Code
│   ├── config/               # Environment & Global Configs
│   ├── controllers/          # Express API route controllers
│   ├── routes/               # API route definitions
│   ├── services/             # Low-level core business logic (SSH, FS, Axios)
│   └── index.ts              # Express Server Entrypoint
├── public/                   # Static Frontend Web UI
│   ├── css/                  # Custom CSS styles (design system styling)
│   ├── js/                   # app.js frontend controller
│   └── index.html            # Single Page Application HTML markup
├── data/                     # Locally persisted settings storage (created at runtime)
│   ├── grafana_configs.json  # Registered Grafana endpoints
│   └── prometheus_configs.json# Registered Prometheus endpoints
├── package.json              # Project dependencies & npm scripts
├── tsconfig.json             # TypeScript compiler settings
├── Dockerfile                # Multi-stage production container build
├── local-ci.sh               # Local quality gatekeeper (static check)
└── deploy.sh                 # Deployment script
```

---

## Quick Start

### Prerequisites
*   Node.js (>= 18.0.0)
*   npm

### Installation
1. Clone the repository and navigate to the project directory:
   ```bash
   git clone https://github.com/honet-labs/hephaestus.git
   cd hephaestus
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Setup environment configuration:
   ```bash
   cp .env.example .env
   ```
   *Edit `.env` to configure your port (default: 5000).*

### Development Mode
To start the backend server in development mode with hot-reloading:
```bash
npm run dev
```
The application will be accessible at [http://localhost:5000](http://localhost:5000).

### Production Build & Launch
To compile the TypeScript code and start the compiled service:
```bash
npm run build
npm start
```

---

## Development Guidelines (Clean Code Standards)

To keep the codebase maintainable and support collaborative open-source development:

### 1. Separation of Concerns
*   **Controllers** (`src/controllers/`): Strictly handle incoming request validation, parameters, and HTTP responses. Do not write business/IO logic here.
*   **Services** (`src/services/`): Contain all the business logic, API requests, SSH tunnels, and disk operations.
*   **Frontend** (`public/js/app.js`): Organized with clean, well-commented modular blocks (Navigation, Forms, Exporter commands).

### 2. Error Safety
*   Always wrap async functions in try/catch blocks.
*   Log meaningful errors to the console (`console.error("[Service/Module] error detail", error)`) and return clear, descriptive error payloads to the client.

### 3. Dynamic UI Updates
*   Use pre-defined CSS utility classes for visibility (`.hidden`) rather than inline `.style.display = "none"`.
*   Maintain semantic HTML structure with distinct IDs for all interactive elements to make automated testing simple.

---

## Testing & Quality Control

Before committing or submitting a pull request, run the gatekeeper suite:
```bash
./local-ci.sh
```
This script verifies:
1.  **Static Asset Integrity**: Checks presence and sizes of `index.html`, `style.css`, and `app.js`.
2.  **Configuration Check**: Validates syntax alignment between `.env` and `.env.example`.
3.  **TS Compiler Verification**: Runs a test build to ensure no TypeScript compilation issues are present.
