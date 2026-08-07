# Hephaestus

Self-hosted DevOps control plane — one place to manage your monitoring, remote servers, network topology, and backups.

Built for teams who want a single pane of glass across their infrastructure without relying on a dozen SaaS tools.

---

## Table of Contents

- [What is Hephaestus?](#what-is-hephaestus)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Database Schema](#database-schema)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [First-Time Setup](#first-time-setup)
- [Configuration](#configuration)
- [Development](#development)
- [CLI Tools](#cli-tools)
- [API Overview](#api-overview)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

---

## What is Hephaestus?

Hephaestus started as a way to avoid juggling Grafana, Prometheus, SSH terminals, backup scripts, and a bunch of other tools just to keep things running. It grew into a full DevOps portal that handles:

- **Monitoring** — connect to Grafana, Prometheus, and Uptime Kuma from one place
- **Querying** — run PromQL queries through Grafana or directly against Prometheus
- **Remote access** — SSH into servers, manage services, transfer files, all from the browser
- **Network topology** — map out your infrastructure visually and discover devices automatically
- **Backups** — schedule and manage database backups to local, S3, or NAS destinations
- **SNMP** — query network devices with MIB import and OID registry

If you're running a small to medium infrastructure and want to consolidate your tooling, this is for you.

---

## Features

### Monitoring & Metrics

| Feature | What it does |
|---------|-------------|
| **Grafana Integration** | Connect multiple Grafana instances, list datasources, proxy queries through Grafana's API |
| **Prometheus Config Editor** | Edit `prometheus.yml` directly from the UI with YAML validation and hot-reload. Supports local files or remote editing over SSH |
| **Query Explorer** | Build query panels, run PromQL against Prometheus or Grafana datasources, visualize results with time range controls |
| **SNMP Tool** | SNMP GET/WALK with built-in MIB parser, OID registry, and preset modules for common network devices |
| **Uptime Kuma** | Pull monitor data into Query Explorer, list and filter monitors across multiple Uptime Kuma instances |
| **Grok Debugger** | Test grok patterns against log lines with visual match highlighting and JSON output |
| **Monitoring Views** | Create dashboard slideshows that cycle through panels at configurable intervals |

### Remote Server Management

| Feature | What it does |
|---------|-------------|
| **SSH Terminal** | Full xterm.js terminal sessions over WebSocket with MikroTik-compatible algorithms, keepalive, and auto-reconnect |
| **VPS Control Panel** | Dashboard (CPU/RAM/Disk), process manager, systemd service control, system logs, network info |
| **File Transfer** | SFTP browser with local-to-remote, remote-to-local, and remote-to-remote transfers. Drag-and-drop support |
| **Multi-Session** | Open multiple SSH tabs, group connections, rename sessions, keyboard shortcuts |

### Network Topology

| Feature | What it does |
|---------|-------------|
| **Multi-Source Discovery** | Scan devices from Prometheus targets, SNMP, Nmap, or all sources combined |
| **Interactive Canvas** | Drag-and-drop device positioning with vis-network, auto-layout, physics toggle |
| **Workspace Tabs** | Multiple topology maps — each tab has its own independent set of devices and edges |
| **Device Details** | IP, hostname, type, status, interfaces, connections — all editable with double-click |
| **Edge Labels** | Dual interface labels (Source Interface — Type — Target Interface) with edit/delete via context menu |
| **Canvas Icons** | Custom SVG device icons rendered via canvas, different shapes for routers, servers, switches, APs |
| **Keyboard Shortcuts** | Del to delete, Esc to close panels, +/- for zoom, P for physics, L for auto-layout |
| **Persistent State** | Device positions and edges survive page refreshes, stored in PostgreSQL |

### Infrastructure Automation

| Feature | What it does |
|---------|-------------|
| **Database Backup** | Dump PostgreSQL, MySQL, MariaDB, SQL Server — locally or via SSH. Upload to local disk, Cloudflare R2, Google Drive, or NAS (SCP) |
| **Backup Scheduling** | Cron-based schedules with enable/disable toggle and manual run |
| **Data Prepper** | Edit pipeline YAML files for OpenSearch ingestion, validate, and hot-reload over SSH |
| **System Update** | Check for updates from GitHub and apply directly from the web UI |

### Security & Access

| Feature | What it does |
|---------|-------------|
| **Role-Based Access** | Admin and Operator roles with fine-grained route protection |
| **Session Management** | Token-based auth with sliding window expiry (24h, max 7 days) |
| **Rate Limiting** | Global rate limit + per-username login limiter to prevent brute force |
| **Encryption at Rest** | SSH passwords, API keys, and tokens encrypted with AES-256-GCM |
| **Activity Logging** | Full audit trail of who did what and when |
| **CLI User Management** | Create users, reset passwords, and manage roles from the command line |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Runtime** | Node.js 20 (Alpine) | Lightweight, fast startup, good ecosystem |
| **Language** | TypeScript 5.x | Type safety, better refactoring, catches bugs early |
| **Framework** | Express 4.x | Battle-tested, minimal overhead |
| **Database** | PostgreSQL 15 | Reliable, JSONB support for flexible data, good performance |
| **Frontend** | Vanilla JS (SPA) | No framework lock-in, fast load, simple deployment |
| **Terminal** | xterm.js 4.19 | Real terminal emulator in the browser |
| **WebSocket** | ws 8.x | Lightweight WebSocket server for SSH proxy |
| **SSH/SFTP** | ssh2 1.x | Pure Node.js SSH client, no external binaries needed |
| **Network Map** | vis-network 9.x | Interactive graph visualization with physics simulation |
| **Security** | Helmet, bcrypt, AES-256-GCM | Industry standard protections |
| **Container** | Docker + Docker Compose | Consistent deployment across environments |
| **Reverse Proxy** | Cloudflare Tunnel | Optional, for exposing without opening ports |

### Key Dependencies

```
express         → Web framework
pg              → PostgreSQL client
ssh2            → SSH/SFTP connections
ws              → WebSocket server
bcrypt          → Password hashing (12 rounds)
helmet          → Security headers
axios           → HTTP client for external APIs
vis-network     → Network topology visualization
multer          → File upload handling
js-yaml         → YAML parsing for configs
node-cron       → Backup scheduling
@aws-sdk/client-s3 → Cloudflare R2 / S3 uploads
net-snmp        → SNMP protocol
```

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                     User Browser                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │Dashboard │ │Remote Host│ │Topology  │ │  Backup   │  │
│  │  (SPA)   │ │  (SSH)   │ │  (Map)   │ │  Manager  │  │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └─────┬─────┘  │
└───────┼─────────────┼───────────┼──────────────┼────────┘
        │  HTTP API   │ WebSocket │  HTTP API    │ HTTP API
        └──────┬──────┴─────┬─────┴──────┬───────┘
               │            │            │
    ┌──────────┴────────────┴────────────┴──────────┐
    │           Hephaestus Backend (Node.js)         │
    │  ┌─────────┐ ┌──────────┐ ┌────────────────┐  │
    │  │Express  │ │WebSocket │ │  Cron Scheduler │  │
    │  │  API    │ │  Server  │ │  (Backups)      │  │
    │  └────┬────┘ └────┬─────┘ └───────┬────────┘  │
    └───────┼───────────┼───────────────┼────────────┘
            │           │               │
   ┌────────┴───┐  ┌────┴────┐   ┌─────┴──────┐
   │PostgreSQL  │  │  Remote │   │  Backup     │
   │   15       │  │ Servers │   │  Storage    │
   │(port 5435) │  │  (SSH)  │   │ (R2/NAS/FS)│
   └────────────┘  └─────────┘   └────────────┘
```

### Container Architecture

```
┌─────────────── Docker Compose ───────────────┐
│                                               │
│  ┌──────────────────┐  ┌──────────────────┐  │
│  │ hephaestus-      │  │ hephaestus-      │  │
│  │ backend          │  │ postgres         │  │
│  │                  │  │                  │  │
│  │ • Express API    │←→│ • PostgreSQL 15  │  │
│  │ • WebSocket      │  │ • Persistent vol │  │
│  │ • Cron jobs      │  │   (port 5435)    │  │
│  │                  │  │                  │  │
│  │ (port 5000)      │  └──────────────────┘  │
│  │                  │                         │
│  │ Volumes:         │                         │
│  │ /app/data        │                         │
│  └──────────────────┘                         │
└───────────────────────────────────────────────┘
```

### Request Flow

```
Browser ──HTTP──▶ Express ──Auth──▶ Controller ──▶ Service ──▶ PostgreSQL
                      │                                    │
                      │                                    ▼
                      │                              External APIs
                      │                           (Grafana/Prometheus/
                      │                            Uptime Kuma/SNMP)
                      │
Browser ──WS──▶ WebSocket ──Auth──▶ SSH Client ──▶ Remote Server
                      │                                  │
                      └──── xterm.js data ◀──────────────┘
```

### Authentication Flow

```
1. User submits credentials
       │
2. POST /api/v1/users/login
       │
3. Rate limit check (20 req/15min per username)
       │
4. bcrypt.compare(password, stored_hash)
       │
5. Generate random token → SHA-256 hash → store in user_sessions
       │
6. Return raw token to browser (stored in localStorage)
       │
7. All subsequent requests: Authorization: Bearer <token>
       │
8. Auth middleware: SHA-256(token) → lookup in user_sessions → check expiry
```

---

## Database Schema

Hephaestus uses PostgreSQL with 22 tables. Schema is auto-created and migrated on startup.

### Entity Relationship Diagram

```
┌──────────────────────┐     ┌──────────────────────┐
│     system_roles      │     │        users          │
│──────────────────────│     │──────────────────────│
│ id          SERIAL PK│◄────│ role       VARCHAR    │
│ name        VARCHAR  │     │ id         SERIAL PK  │
│ description TEXT     │     │ username   VARCHAR    │
│ is_default  BOOLEAN  │     │ email      VARCHAR    │
└──────────────────────┘     │ password   TEXT       │
                              │ created_at TIMESTAMP  │
                              └──────────┬───────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                     │
         ┌──────────▼────────┐ ┌────────▼────────┐ ┌────────▼────────┐
         │  user_sessions    │ │ activity_logs   │ │ topology_pending │
         │──────────────────│ │────────────────│ │────────────────│
         │ id     SERIAL PK │ │ id    SERIAL PK │ │ id    SERIAL PK │
         │ user_id INT (FK) │ │ user_id INT(FK) │ │ user_id INT(FK) │
         │ token  VARCHAR   │ │ module VARCHAR  │ │ device_data JSONB│
         │ expires_at TS    │ │ action VARCHAR  │ │ created_at TS   │
         └──────────────────┘ │ status VARCHAR  │ └────────────────┘
                               │ timestamp TS   │
                               └────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Monitoring & Config                           │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │ grafana_configs │  │prometheus_cfgs │  │ uptime_kuma_   │    │
│  │────────────────│  │────────────────│  │ configs        │    │
│  │ id       PK    │  │ id        PK   │  │────────────────│    │
│  │ name     VARCHAR│  │ name     VARCHAR│  │ id        PK   │    │
│  │ host     VARCHAR│  │ host     VARCHAR│  │ name     VARCHAR│   │
│  │ token    TEXT   │  │ mode     VARCHAR│  │ url      VARCHAR│   │
│  │ ds_uid   VARCHAR│  │ ssh_config JSONB│  │ username VARCHAR│   │
│  │ is_active BOOLEAN│ │ is_active BOOLEAN│ │ password TEXT   │   │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │monitoring_views │  │ query_panels   │  │ dataprepper_   │    │
│  │────────────────│  │────────────────│  │ configs        │    │
│  │ id       PK    │  │ id        PK   │  │────────────────│    │
│  │ name     VARCHAR│  │ name     VARCHAR│  │ id        PK   │    │
│  │ panels   JSONB │  │ datasource JSONB│  │ name     VARCHAR│   │
│  │ interval INT   │  │ query     TEXT  │  │ host     VARCHAR│   │
│  │ mode     VARCHAR│  │ columns   JSONB│  │ ssh_config JSONB│   │
│  └────────────────┘  └────────────────┘  └────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Network Topology                              │
│                                                                  │
│  ┌────────────────┐     ┌────────────────┐                      │
│  │topology_sheets │     │topology_devices │                      │
│  │────────────────│     │────────────────│                      │
│  │ id       PK    │◄────│ sheet_id  INT(FK)                     │
│  │ name     VARCHAR│     │ id        VARCHAR PK                  │
│  │ sort_order INT │     │ name      VARCHAR                     │
│  │ created_at  TS │     │ ip_address VARCHAR                    │
│  │ updated_at  TS │     │ device_type VARCHAR                   │
│  └────────────────┘     │ status    VARCHAR                     │
│                          │ sources   TEXT[]                      │
│                          │ labels    JSONB                      │
│                          │ interfaces JSONB                     │
│                          │ x, y      DOUBLE                     │
│                          │ sheet_id  INT(FK)                    │
│                          └───────┬────────┘                      │
│                                  │                                │
│                          ┌───────▼────────┐                      │
│                          │ topology_edges  │                      │
│                          │────────────────│                      │
│                          │ id        PK   │                      │
│                          │ source_id  FK  │                      │
│                          │ target_id  FK  │                      │
│                          │ label     VARCHAR│                     │
│                          │ edge_type VARCHAR│                     │
│                          │ source_label    │                      │
│                          │ target_label    │                      │
│                          │ sheet_id  INT(FK)                     │
│                          └────────────────┘                      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Remote Host & Backup                          │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │
│  │remote_host_cfgs │  │backup_database │  │backup_destinations│  │
│  │────────────────│  │ _configs       │  │────────────────│    │
│  │ id       PK    │  │────────────────│  │ id        PK   │    │
│  │ name     VARCHAR│  │ id        PK   │  │ name     VARCHAR│   │
│  │ host     VARCHAR│  │ name     VARCHAR│  │ type     VARCHAR│   │
│  │ port     INT    │  │ type     VARCHAR│  │ config   JSONB │    │
│  │ username VARCHAR│  │ host     VARCHAR│  └────────────────┘    │
│  │ password TEXT   │  │ port     INT    │                        │
│  │ ssh_key  TEXT   │  │ username VARCHAR│  ┌────────────────┐    │
│  │ auth_type VARCHAR│ │ password TEXT   │  │ backup_history │    │
│  │ group_name  VARCHAR│ └────────────────│  │────────────────│    │
│  └────────────────┘                    │  │ id        PK   │    │
│                                         │  │ filename VARCHAR│   │
│  ┌────────────────┐  ┌────────────────┐│  │ size      BIGINT│   │
│  │backup_schedules │  │ imported_mibs  ││  │ status    VARCHAR│  │
│  │────────────────│  │────────────────││  │ created_at  TS  │    │
│  │ id       PK    │  │ id        PK   ││  └────────────────┘    │
│  │ name     VARCHAR│  │ name     VARCHAR│                        │
│  │ cron_expr VARCHAR│ │ file_path VARCHAR│                       │
│  │ active   BOOLEAN│  └───────┬────────┘                        │
│  └────────────────┘          │                                   │
│                       ┌──────▼───────┐                           │
│                       │ oid_registry │                           │
│                       │──────────────│                           │
│                       │ id      PK   │                           │
│                       │ oid    VARCHAR│                           │
│                       │ name  VARCHAR │                           │
│                       │ mib_name  FK  │                           │
│                       └──────────────┘                           │
└─────────────────────────────────────────────────────────────────┘

┌────────────────────────────┐
│        app_config          │
│────────────────────────────│
│ key     VARCHAR PK         │
│ value   TEXT               │
│ updated_at TIMESTAMP       │
└────────────────────────────┘
```

---

## Project Structure

```
hephaestus/
├── src/                              # Backend (TypeScript)
│   ├── config/
│   │   ├── db.ts                     # PostgreSQL pool, schema, migrations, encryption
│   │   └── env.ts                    # Environment config, in-memory caches
│   ├── middleware/
│   │   ├── auth.middleware.ts         # Session token validation
│   │   ├── role.middleware.ts         # Role-based access control
│   │   └── rate-limit.middleware.ts   # Global + login rate limiters
│   ├── routes/                        # 17 route modules
│   │   ├── setup.routes.ts            # Initial setup (no auth)
│   │   ├── user.routes.ts             # Login, session, user CRUD
│   │   ├── settings.routes.ts         # Grafana, app config
│   │   ├── prometheus.routes.ts       # Prometheus config editor
│   │   ├── query-explorer.routes.ts   # Query panels
│   │   ├── snmp.routes.ts             # SNMP queries, MIB import
│   │   ├── remote-host.routes.ts      # SSH host config, SFTP
│   │   ├── vps-control.routes.ts      # VPS exec, metrics, services
│   │   ├── backup.routes.ts           # Backup DB, destinations, schedules
│   │   ├── topology.routes.ts         # Network topology, sheets, devices
│   │   ├── monitoring-view.routes.ts  # Dashboard slideshows
│   │   ├── uptime-kuma.routes.ts      # Uptime Kuma integration
│   │   ├── dataprepper.routes.ts      # Data Prepper pipelines
│   │   ├── grok-debugger.routes.ts    # Grok pattern testing
│   │   ├── activity-log.routes.ts     # Audit logs
│   │   ├── update.routes.ts           # System update
│   │   └── system.routes.ts           # DB config
│   ├── controllers/                    # Request handlers (14 files)
│   ├── services/                       # Business logic (11 files)
│   │   ├── remote-host.service.ts      # SSH/SFTP, WebSocket proxy
│   │   ├── vps-control.service.ts      # Remote command execution
│   │   ├── topology.service.ts         # Device discovery, multi-sheet
│   │   ├── backup.service.ts           # DB dump, upload, scheduling
│   │   ├── prometheus.service.ts       # Config editing, hot-reload
│   │   ├── query-explorer.service.ts   # Multi-datasource queries
│   │   ├── snmp.service.ts             # MIB parsing, SNMP queries
│   │   ├── grafana.service.ts          # Grafana API client
│   │   ├── uptime-kuma.service.ts      # Uptime Kuma API client
│   │   ├── dataprepper.service.ts      # Pipeline YAML management
│   │   └── grok.service.ts             # Grok pattern parser
│   ├── types/                          # TypeScript declarations
│   ├── cli.ts                          # CLI for user management
│   └── index.ts                        # Server entrypoint
│
├── public/                             # Static frontend (SPA)
│   ├── index.html                      # Main dashboard (2700+ lines)
│   ├── css/style.css                   # Design system
│   ├── js/app.js                       # SPA logic
│   └── vendor/                         # xterm.js, JetBrains Mono font
│
├── views/                              # Standalone pages
│   ├── remote-host.html                # SSH terminal + VPS control (2500+ lines)
│   ├── network-topology.html           # Network topology map (2200+ lines)
│   ├── grok-debugger.html              # Grok pattern tester
│   └── vps-control.html                # VPS control (legacy)
│
├── docker-compose.yml                  # Container orchestration
├── Dockerfile                          # Multi-stage production build
├── update.sh                           # Deployment update script
├── local-ci.sh                         # Pre-deploy lint gatekeeper
├── package.json                        # Dependencies and scripts
└── tsconfig.json                       # TypeScript config
```

---

## Installation

### Prerequisites

- Docker and Docker Compose v2+
- Git
- A server with SSH access (for remote host features)

### Quick Start (Docker)

**1. Clone the repo**

```bash
git clone https://github.com/honet-labs/hephaestus.git
cd hephaestus
```

**2. Set up environment**

```bash
cp .env.example .env
```

Edit `.env` — at minimum, set these:

```env
# Database password (change this!)
PGPASSWORD=your_strong_password_here

# Allowed origins (your domain + localhost for dev)
ALLOWED_ORIGINS=http://localhost:5000,https://your-domain.com
```

**3. Start it up**

```bash
docker compose up -d
```

This creates two containers:

| Container | What | Port |
|-----------|------|------|
| `hephaestus-backend` | Node.js API + WebSocket server | 5000 (exposed) |
| `hephaestus-postgres` | PostgreSQL 15 database | 5435 (localhost only) |

**4. Check that it's running**

```bash
docker compose ps
docker compose logs -f hephaestus-backend
```

**5. Open the browser**

Go to `http://localhost:5000`. You'll see the setup wizard on first visit — create your admin account and you're in.

### Install without Docker

You'll need Node.js >= 18 and a running PostgreSQL instance.

```bash
git clone https://github.com/honet-labs/hephaestus.git
cd hephaestus
cp .env.example .env    # Edit with your database credentials
npm install
npm run build
```

Make sure the database exists:

```sql
CREATE DATABASE hephaestus;
```

Tables are created automatically on first startup.

```bash
npm start
```

---

## First-Time Setup

1. Open the web UI in your browser
2. The setup wizard appears if no admin user exists
3. Create an admin account (username, email, password)
4. Log in and head to **Settings** to configure your monitoring connections

### Connecting Grafana

1. Go to **Settings > Grafana**
2. Enter your Grafana URL (e.g., `http://grafana:3000`)
3. Create a Service Account token in Grafana and paste it
4. Select your datasource
5. Click **Test Connection** — if it says OK, you're good

### Connecting Prometheus

1. Go to **Settings > Prometheus**
2. Choose mode:
   - **Local** — if Prometheus runs on the same server, provide the config path and reload URL
   - **SSH** — if Prometheus runs on a remote server, provide SSH host details
3. Click **Test & Save**

### Adding Remote Servers

1. Go to **Remote Host** in the sidebar
2. Click **+ Add Host**
3. Enter the server details (IP, port, username, password/key)
4. Test the connection
5. You now have terminal access, VPS control, and file transfer

> **Note:** For VPS control features (service management, process control), the SSH user needs sudo access:
> ```bash
> # /etc/sudoers.d/administrator
> administrator ALL=(ALL) NOPASSWD: ALL
> ```

---

## Configuration

### Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `5000` | No | Server listen port |
| `ALLOWED_ORIGINS` | `http://localhost:3000,...` | No | CORS allowed origins (comma-separated) |
| `ENCRYPTION_KEY` | (auto-generated) | No | AES-256 key for password encryption at rest |
| `HTTPS` | `false` | No | Set `true` to enable HSTS headers |
| `PGHOST` | `localhost` | Yes | PostgreSQL host |
| `PGPORT` | `5432` | Yes | PostgreSQL port |
| `PGUSER` | `hephaestus` | Yes | PostgreSQL username |
| `PGPASSWORD` | — | **Yes** | PostgreSQL password |
| `PGDATABASE` | `hephaestus` | Yes | PostgreSQL database name |
| `PGSSL` | `false` | No | Enable SSL for PostgreSQL connections |
| `GRAFANA_HOST` | — | No | Default Grafana server URL |
| `GRAFANA_TOKEN` | — | No | Default Grafana API token |
| `GRAFANA_DATASOURCE_UID` | — | No | Default Grafana datasource UID |
| `PROMETHEUS_CONFIG_PATH` | `/etc/prometheus/prometheus.yml` | No | Path to prometheus.yml |
| `PROMETHEUS_RELOAD_URL` | `http://localhost:9090/-/reload` | No | Prometheus hot-reload endpoint |

### Update

**Via update script (recommended):**

```bash
cd /path/to/hephaestus
git pull
./update.sh
```

**Via web UI:**

Go to **Settings > System Update > Check for Updates**.

**Manual:**

```bash
git pull
npm install
npm run build
docker compose up -d --build
```

---

## Development

### Prerequisites

- Node.js >= 18
- npm
- PostgreSQL 15+ (local or Docker)

### Setup

```bash
git clone https://github.com/honet-labs/hephaestus.git
cd hephaestus
cp .env.example .env    # Configure database connection
npm install
```

### Commands

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start dev server with hot-reload (nodemon + ts-node) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint checks |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting without changing files |

### Code Style

- TypeScript strict mode
- ESLint + Prettier enforced
- No CDN dependencies in frontend (CSP `connect-src 'self'`)
- All SSH/SFTP operations happen server-side — no direct browser-to-server SSH
- Sensitive data encrypted before database storage
- Backend pattern: Routes → Controllers → Services → Database

### Adding a New Feature

1. **Backend:** Create service → controller → route → register in `index.ts`
2. **Frontend:** Add UI in the relevant page (SPA for dashboard, views/ for standalone pages)
3. **Database:** Add table/migration in `src/config/db.ts`
4. **Test:** Run `npm run lint` before committing

---

## CLI Tools

For managing users without the web UI:

```bash
# Create a new admin user
node dist/cli.js create-user

# Reset a user's password
node dist/cli.js reset-password

# List all users
node dist/cli.js list-users

# Delete a user
node dist/cli.js delete-user
```

Or use the shell scripts:

```bash
./hephaestus-cli.sh     # Linux/macOS
hephaestus-cli.bat      # Windows
```

---

## API Overview

All API routes are prefixed with `/api/v1`. Most require authentication via `Authorization: Bearer <token>` header.

### Setup (no auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/setup/status` | Check if initial setup is needed |
| POST | `/setup/create-admin` | Create first admin user |

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/users/login` | Login with username/password |
| GET | `/users/session` | Validate current session |
| POST | `/users/logout` | End session |

### Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/settings/overview` | Dashboard overview stats |
| GET/POST | `/settings/grafana` | Grafana connection config |
| GET | `/settings/grafana/datasources` | List Grafana datasources |
| GET/POST | `/settings/grafana/configs` | Grafana profiles (multi-instance) |
| GET/POST | `/prometheus/config` | Prometheus config editor |
| POST | `/prometheus/config/validate` | Validate YAML without saving |
| GET/POST | `/prometheus/configs` | Prometheus profiles |
| GET | `/query-explorer/panels` | Saved query panels |
| POST | `/query-explorer/query-test` | Test ad-hoc query |
| GET | `/uptime-kuma/monitors` | List Uptime Kuma monitors |
| POST | `/snmp/query` | SNMP GET/WALK |
| GET | `/snmp/mibs` | Imported MIB modules |
| POST | `/snmp/mibs/import` | Import MIB from URL |

### Remote Host & VPS

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/remote-host/configs` | SSH host config CRUD |
| POST | `/remote-host/test-connection` | Test SSH connection |
| POST | `/remote-host/sftp/list` | List remote directory |
| POST | `/remote-host/sftp/upload` | Upload file to remote |
| POST | `/remote-host/sftp/download` | Download file from remote |
| POST | `/vps/exec` | Execute SSH command |
| POST | `/vps/metrics` | CPU/RAM/Disk metrics |
| POST | `/vps/processes` | List processes |
| POST | `/vps/services` | List systemd services |
| POST | `/vps/service/control` | Start/stop/restart service |
| POST | `/vps/logs` | Get system logs |
| WS | `/ws/remote-host` | SSH terminal WebSocket |

### Network Topology

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/topology/sheets` | List workspace tabs |
| POST | `/topology/sheets` | Create new tab |
| PUT | `/topology/sheets/:id` | Rename tab |
| DELETE | `/topology/sheets/:id` | Delete tab |
| GET | `/topology/graph` | Get topology graph (filter by sheetId) |
| POST | `/topology/scan` | Scan for devices (Prometheus/SNMP/Nmap) |
| POST | `/topology/device` | Add manual device |
| POST | `/topology/device/save` | Save device from scan |
| POST | `/topology/device/save-all` | Save multiple devices |
| DELETE | `/topology/device/:id` | Delete device |
| PUT | `/topology/device/position` | Update device position |
| POST | `/topology/edge` | Add connection edge |
| PUT | `/topology/edge/:id` | Update edge |
| DELETE | `/topology/edge/:id` | Delete edge |
| GET | `/topology/device/:id/ping` | Ping a device |

### Backup

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/backup/db-configs` | Database connection configs |
| GET/POST | `/backup/destinations` | Backup destinations |
| POST | `/backup/run` | Execute backup now |
| GET | `/backup/history` | Backup history |
| GET/POST | `/backup/schedules` | Cron schedules |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/activity-logs/` | Audit trail |
| GET | `/update/check` | Check for updates |
| POST | `/update/apply` | Apply update |
| GET | `/system/db-config` | Database config |

---

## Security

Security is taken seriously here. Here's what's in place:

- **Authentication** — Session tokens with 24-hour sliding window, SHA-256 hashed before storage
- **Encryption** — SSH passwords, API keys, and tokens encrypted at rest with AES-256-GCM
- **Rate Limiting** — 2000 requests/15min per user globally, 20 login attempts/15min per username
- **WebSocket Security** — Origin validation, first-message auth, 64KB max payload, 10 connection limit
- **HTTP Security** — Helmet.js with CSP, CORS whitelist, 10KB body size limit
- **SSH Security** — Path traversal prevention, command injection protection, output buffer limits
- **Container Security** — Non-root user (UID 1001), minimal Alpine image
- **Input Validation** — Port range checks, file size limits, remote path sanitization
- **Audit Logging** — Every significant action is logged with user, timestamp, and status

---

## Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Clone** your fork
   ```bash
   git clone https://github.com/your-username/hephaestus.git
   ```
3. **Create a branch** for your feature
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make your changes** — follow the code style below
5. **Test** your changes
   ```bash
   npm run lint
   npm run build
   ```
6. **Commit** with a clear message
   ```bash
   git commit -m "add: description of what you added"
   ```
7. **Push** and open a Pull Request

### Commit Convention

We follow a simple prefix system:

| Prefix | Meaning |
|--------|---------|
| `add:` | New feature or capability |
| `fix:` | Bug fix |
| `update:` | Enhancement to existing feature |
| `refactor:` | Code restructure without behavior change |
| `docs:` | Documentation only |
| `chore:` | Maintenance, dependencies, config |

### Code Conventions

- TypeScript strict mode — no `any` unless absolutely necessary
- ESLint + Prettier enforced — run `npm run lint` before committing
- Frontend: vanilla JS, no build step needed for views
- Backend: Routes → Controllers → Services → Database pattern
- All sensitive data must be encrypted before storage
- No hardcoded credentials or secrets in code

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Contact

Got questions, ideas, or want to contribute? Reach out:

- **Email:** [info@honet.web.id](mailto:info@honet.web.id)
- **GitHub:** [github.com/honet-labs/hephaestus](https://github.com/honet-labs/hephaestus)
- **Issues:** [GitHub Issues](https://github.com/honet-labs/hephaestus/issues)

We'd love to hear from you — whether it's a bug report, feature request, or just a hello.
