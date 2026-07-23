# Hephaestus DevOps Portal

Self-hosted DevOps control plane for managing monitoring infrastructure, querying metrics, managing remote servers, and automating operational tasks from a single web interface.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Features](#features)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Update](#update)
- [Configuration](#configuration)
- [Development](#development)
- [API Reference](#api-reference)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 (Alpine) |
| Language | TypeScript 5.x |
| Framework | Express 4.x |
| Database | PostgreSQL 15 (Alpine) |
| Frontend | Vanilla JavaScript (SPA), HTML5, CSS3 |
| Terminal | xterm.js 4.19 with WebSocket SSH proxy |
| Container | Docker, Docker Compose |
| Reverse Proxy | Cloudflare Tunnel (optional) |
| Security | Helmet.js, bcrypt, express-rate-limit, AES-256-GCM encryption |
| Integrations | Grafana API, Prometheus API, Uptime Kuma REST API, SNMP (net-snmp), SSH/SFTP (ssh2) |

---

## Features

**Monitoring & Metrics**
- Unified Connections Registry for Grafana, Prometheus, and Uptime Kuma instances
- Prometheus Config Editor with YAML validation, hot-reload, and multi-profile support
- Query Explorer for executing PromQL queries directly or via Grafana datasource proxy
- SNMP Query Tool with MIB import and OID registry
- System Overview dashboard with connection status and recent activity

**Remote Server Management**
- Remote Host terminal with full xterm.js SSH session (WebSocket proxy)
- VPS Control Panel sidebar: Dashboard, Processes, Services, System Logs, Network
- Dual-panel file transfer (local/remote) with drag-and-drop support
- Tab groups and multi-session management

**Infrastructure Automation**
- Exporter Installer for `node_exporter`, `blackbox_exporter`, `snmp_exporter` across AMD64/ARM/Windows
- Database Backup Manager with scheduling, destinations (local/S3/SMB), and history
- Data Prepper pipeline editor for OpenSearch ingestion
- Grok Debugger for testing grok patterns against log lines

**Security & Access Control**
- Role-based access control (Admin, Operator)
- Session management with sliding window expiry
- Rate limiting per-user (global) and per-username (login)
- SSH/SFTP password encryption at rest with AES-256-GCM
- Activity audit logging

---

## Architecture

### High-Level Design (HLD)

```
                          +---------------------+
                          |     User Browser    |
                          +----------+----------+
                                     |
                          HTTPS / HTTP (port 5000)
                                     |
                     +---------------+---------------+
                     |    Cloudflare Tunnel         |
                     |    (optional, production)    |
                     +---------------+---------------+
                                     |
                     +---------------+---------------+
                     |   Hephaestus Backend (Node)  |
                     |   Express + WebSocket Server |
                     |   Port 5000                  |
                     +------+----------+------------+
                            |          |
              +-------------+          +-------------+
              |                                      |
     +--------+--------+               +------------+-----------+
     | PostgreSQL 15    |               |  Remote Servers (SSH)  |
     | (host: 5435)     |               |  - Terminal (WS/SSH)   |
     | hephaestus-db    |               |  - File Transfer (SFTP)|
     +------------------+               |  - VPS Control (exec)  |
                                        +------------------------+
```

### Container Architecture

```
+---------------------------------------------------+
|                  Docker Compose                    |
|                                                    |
|  +---------------------+  +---------------------+ |
|  | hephaestus-backend  |  | hephaestus-postgres | |
|  | Node.js 20 Alpine   |  | PostgreSQL 15       | |
|  | Port: 5000          |  | Port: 5435 (host)   | |
|  |                     |  |                     | |
|  | - Express API       |<>| - Persistent volume | |
|  | - WebSocket (SSH)   |  |   hephaestus-db-data| |
|  | - xterm.js frontend |  +---------------------+ |
|  |                     |                           |
|  | Volume:             |                           |
|  | hephaestus-backend- |                           |
|  | data:/app/data      |                           |
|  +---------------------+                           |
+---------------------------------------------------+
```

### Data Flow

1. **HTTP Requests** -- Browser sends API requests to Express backend (port 5000). Backend processes and returns JSON responses.
2. **WebSocket SSH** -- Terminal sessions establish a WebSocket connection to the backend, which proxies commands to remote servers via SSH. Authentication is performed via session token on the first WebSocket message.
3. **File Transfer** -- SFTP operations are proxied through the backend. Local-to-remote transfers read files server-side before uploading via SSH.
4. **Database** -- All configuration, user data, and audit logs are persisted in PostgreSQL. Sensitive data (SSH passwords, keys) is encrypted with AES-256-GCM before storage.

---

## Project Structure

```
hephaestus/
├── src/                              # Backend TypeScript source
│   ├── config/                       # Environment and database config
│   │   ├── db.ts                     # PostgreSQL pool, encryption, schema init
│   │   └── env.ts                    # Environment variable loader
│   ├── controllers/                  # Express route handlers
│   │   ├── remote-host.controller.ts # Host CRUD, SFTP, file transfer
│   │   ├── vps-control.controller.ts # VPS exec, metrics, processes, services
│   │   ├── user.controller.ts        # Authentication, session management
│   │   └── ...
│   ├── middleware/                    # Auth, rate-limit, role middleware
│   │   ├── auth.middleware.ts        # Session token validation
│   │   └── rate-limit.middleware.ts  # Global + login rate limiters
│   ├── routes/                       # API route definitions (16 modules)
│   ├── services/                     # Business logic
│   │   ├── remote-host.service.ts    # SSH/SFTP connections, WebSocket proxy
│   │   ├── vps-control.service.ts    # Remote command execution
│   │   ├── backup.service.ts         # Database backup orchestration
│   │   └── ...
│   ├── types/                        # TypeScript type definitions
│   ├── cli.ts                        # CLI for user management
│   └── index.ts                      # Express server + WebSocket entrypoint
├── public/                           # Static frontend (served by Express)
│   ├── index.html                    # Main SPA markup
│   ├── css/style.css                 # Design system styles
│   ├── js/app.js                     # Frontend controller (SPA logic)
│   ├── fullscreen.html               # Fullscreen panel view
│   └── vendor/                       # Vendored dependencies
│       ├── xterm/                    # xterm.js v4.19 (DOM renderer)
│       └── fonts/                    # JetBrains Mono WOFF2
├── views/                            # Authenticated standalone pages
│   ├── remote-host.html              # Remote Host terminal + VPS control
│   ├── grok-debugger.html            # Grok pattern tester
│   └── vps-control.html              # Legacy VPS control (deprecated)
├── data/                             # Runtime persistent storage (git-ignored)
├── docker-compose.yml                # Container orchestration
├── Dockerfile                        # Multi-stage production build
├── update.sh                         # Deployment update script
├── local-ci.sh                       # Pre-deploy lint/typecheck gatekeeper
├── package.json                      # Dependencies and scripts
└── tsconfig.json                     # TypeScript configuration
```

---

## Installation

### Prerequisites

- Docker and Docker Compose (recommended)
- Git
- A Linux server with SSH access (for remote host features)

### Docker Compose (Recommended)

1. **Clone the repository**

```bash
git clone https://github.com/honet-labs/hephaestus.git
cd hephaestus
```

2. **Configure environment**

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
# Change these before first run
PGPASSWORD=your_strong_password_here
ALLOWED_ORIGINS=http://localhost:5000,https://your-domain.com
GRAFANA_HOST=http://your-grafana-host:3000
GRAFANA_TOKEN=your_grafana_service_account_token
```

3. **Start services**

```bash
docker compose up -d
```

This creates two containers:

| Container | Purpose | Port |
|-----------|---------|------|
| `hephaestus-backend` | Node.js API + WebSocket server | 5000 |
| `hephaestus-postgres` | PostgreSQL 15 database | 5435 (host) |

4. **Verify**

```bash
docker compose ps
docker compose logs -f hephaestus-backend
```

5. **Open the web UI**

Navigate to `http://localhost:5000`. The setup wizard will appear on first visit -- create an admin account to get started.

### Manual Deployment (without Docker)

Requires Node.js >= 18 and a running PostgreSQL instance.

```bash
git clone https://github.com/honet-labs/hephaestus.git
cd hephaestus
cp .env.example .env    # Edit with your database credentials
npm install
npm run build
npm start
```

Create the database manually if it does not exist:

```sql
CREATE DATABASE hephaestus;
```

Tables are created automatically on first startup.

---

## Update

### Via update script (recommended)

```bash
cd /path/to/hephaestus
git pull
./update.sh
```

The script performs: git pull, lint check, `.env` generation, Docker rebuild, container restart, and image cleanup.

### Via web UI

Navigate to **Settings > System Update > Check for Updates** in the web interface.

### Manual update

```bash
git pull
npm install
npm run build
docker compose up -d --build
```

---

## Configuration

### First-Time Setup

1. Open the web UI in your browser
2. The setup wizard appears if no admin user exists
3. Create an admin account (username, email, password)
4. Log in and configure monitoring connections in **Settings**

### Connection Registry

Navigate to **Settings** to add monitoring integrations:

- **Grafana** -- Host URL, API Token, Datasource UID
- **Prometheus** -- `local` (filesystem) or `ssh` (remote via SSH/SFTP), config path, reload URL
- **Uptime Kuma** -- Instance URL and credentials

### Remote Host Configuration

Add remote servers via **Remote Host** in the sidebar:

1. Provide host IP/hostname, SSH port, username
2. Choose authentication: password or SSH key
3. Test connection before saving
4. Use the terminal, VPS control panel, or file transfer features

For VPS control features (service management, process control), the SSH user needs sudo access:

```bash
# /etc/sudoers.d/administrator
administrator ALL=(ALL) NOPASSWD: ALL
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server listen port |
| `ALLOWED_ORIGINS` | `http://localhost:3000,...` | Comma-separated CORS origins |
| `ENCRYPTION_KEY` | (auto-generated) | AES-256 key for password encryption |
| `HTTPS` | `false` | Enable HSTS headers |
| `PGHOST` | `localhost` | PostgreSQL host |
| `PGPORT` | `5432` | PostgreSQL port |
| `PGUSER` | `postgres` | PostgreSQL user |
| `PGPASSWORD` | `postgres` | PostgreSQL password |
| `PGDATABASE` | `hephaestus` | PostgreSQL database name |
| `PGSSL` | `false` | Enable SSL for PostgreSQL |
| `GRAFANA_HOST` | -- | Default Grafana URL |
| `GRAFANA_TOKEN` | -- | Grafana API token |
| `PROMETHEUS_CONFIG_PATH` | `/etc/prometheus/prometheus.yml` | Prometheus config path |
| `PROMETHEUS_RELOAD_URL` | `http://localhost:9090/-/reload` | Prometheus reload endpoint |

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

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint checks |
| `npm run lint:fix` | Auto-fix lint issues |
| `npm run format` | Format code with Prettier |

### CLI Tools

```bash
node dist/cli.js register          # Create admin user
node dist/cli.js reset-password    # Reset user password
node dist/cli.js list-users        # List all users
node dist/cli.js reset-setup       # Reset setup wizard
```

---

## API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/users/login` | No | Authenticate user |
| GET | `/api/v1/users/session` | No | Validate session |
| POST | `/api/v1/users/logout` | Yes | Destroy session |

### Monitoring

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/settings/overview` | ADMIN | Dashboard data |
| GET/POST | `/api/v1/settings/grafana` | ADMIN | Grafana connection CRUD |
| GET/POST | `/api/v1/prometheus/config` | ADMIN | Prometheus config management |
| POST | `/api/v1/prometheus/config/validate` | ADMIN | YAML validation |
| GET | `/api/v1/query-explorer/panels` | Yes | List query panels |
| POST | `/api/v1/query-explorer/query-test` | Yes | Test Prometheus query |
| POST | `/api/v1/grok-debugger/test` | ADMIN | Test grok pattern |
| GET | `/api/v1/uptime-kuma/monitors` | Yes | List Uptime Kuma monitors |

### Remote Host & VPS

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET/POST | `/api/v1/remote-host/configs` | ADMIN | Host config CRUD |
| POST | `/api/v1/remote-host/test` | ADMIN | Test SSH connection |
| POST | `/api/v1/remote-host/sftp/list` | ADMIN | List remote directory |
| POST | `/api/v1/remote-host/sftp/upload` | ADMIN | Upload file to remote |
| POST | `/api/v1/remote-host/sftp/download` | ADMIN | Download file from remote |
| POST | `/api/v1/remote-host/sftp/local-to-remote` | ADMIN | Server-side local to remote transfer |
| POST | `/api/v1/remote-host/sftp/remote-to-local` | ADMIN | Server-side remote to local transfer |
| POST | `/api/v1/remote-host/sftp/remote-to-remote` | ADMIN | Server-side remote to remote transfer |
| POST | `/api/v1/vps/exec` | ADMIN | Execute command on remote host |
| POST | `/api/v1/vps/metrics` | ADMIN | Get system metrics |
| POST | `/api/v1/vps/processes` | ADMIN | List processes |
| POST | `/api/v1/vps/services` | ADMIN | List systemd services |
| POST | `/api/v1/vps/service/control` | ADMIN | Start/stop/restart service |
| POST | `/api/v1/vps/kill-process` | ADMIN | Kill process by PID |
| WS | `/ws/remote-host` | Token | SSH terminal WebSocket |

### Infrastructure

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/snmp/query` | Yes | SNMP GET/WALK |
| GET | `/api/v1/backup/databases` | ADMIN | List backup configs |
| POST | `/api/v1/backup/run` | ADMIN | Execute backup |
| GET | `/api/v1/setup/status` | No | Check setup status |
| POST | `/api/v1/setup/create-admin` | No | Create initial admin |

---

## Security

- **Authentication** -- Session tokens with 24-hour sliding window expiry, hashed with SHA-256 before storage
- **Encryption** -- SSH passwords and keys encrypted at rest with AES-256-GCM
- **Rate Limiting** -- Global rate limit (2000 req/15min per user), login rate limit (20 attempts/15min per username)
- **WebSocket Security** -- Origin validation, first-message authentication, max payload 64KB, connection limit (10)
- **SSH Security** -- Private/reserved IP blocking, path traversal prevention, command injection allowlist, 10MB output buffer limit
- **HTTP Security** -- Helmet.js CSP, CORS whitelist, request body size limit (10KB)
- **Container Security** -- Non-root user in Docker, no nmap in production image
- **Input Validation** -- Port range (1-65535), file size limits (100MB), remote path sanitization

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run lint and format checks:
   ```bash
   npm run lint
   npm run format
   ```
5. Commit with a clear message describing the change
6. Push and open a Pull Request

### Code Conventions

- TypeScript strict mode
- ESLint + Prettier for code style
- No CDN dependencies in frontend (CSP `connect-src 'self'`)
- Backend handles all SSH/SFTP operations (no direct browser-to-server SSH)
- Sensitive data encrypted before database storage

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

## Contact

For questions, feedback, contributions, or any suggestions, ideas, and criticism:

- Email: info@honet.web.id
- GitHub: https://github.com/honet-labs/hephaestus
