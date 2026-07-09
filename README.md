# Hephaestus DevOps Portal

Self-hosted DevOps control plane for managing monitoring integrations, querying metrics, and configuring Prometheus scrape targets from a single web UI.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >= 18 |
| Language | TypeScript 5.x |
| Framework | Express 4.x |
| Database | PostgreSQL 15 |
| Frontend | Vanilla JS (SPA), HTML5, CSS3 |
| Container | Docker, Docker Compose |
| Reverse Proxy | Cloudflare Tunnel (optional) |
| Security | Helmet.js, bcrypt, express-rate-limit, CORS |
| Integrations | Grafana API, Prometheus API, Uptime Kuma REST API, SNMP (net-snmp), SSH/SFTP (ssh2) |

---

## Features

- **Unified Connections Registry** -- Manage Grafana and Prometheus instances (local and remote via SSH/SFTP) from one dashboard.
- **Prometheus Config Editor** -- Web-based YAML editor with syntax validation, hot-reload, and multi-profile support.
- **Exporter Installer** -- Auto-generate systemd scripts and install `node_exporter`, `blackbox_exporter`, `snmp_exporter` across AMD64/ARM/Windows.
- **Query Explorer** -- Execute Prometheus queries directly or via Grafana datasource proxy with panel management.
- **Grok Debugger** -- Test grok patterns against log lines with real-time visual feedback.
- **Uptime Kuma Monitor** -- Integration with Uptime Kuma REST API for service monitoring.
- **SNMP Query Tool** -- SNMP GET/WALK with MIB import and OID registry.
- **System Overview** -- Dashboard showing all registered connections, storage status, and recent activity.
- **User & Role Management** -- RBAC with admin/operator roles, session management, and audit logging.
- **System Update** -- Pull and deploy updates directly from the web UI.

---

## Project Structure

```
hephaestus/
├── src/                          # Backend TypeScript source
│   ├── config/                   # Environment & database config
│   ├── controllers/              # Express route controllers
│   ├── middleware/                # Auth, rate-limit, role middleware
│   ├── routes/                   # API route definitions
│   ├── services/                 # Business logic (SSH, SNMP, Prometheus)
│   └── index.ts                  # Express server entrypoint
├── public/                       # Static frontend (SPA)
│   ├── css/style.css             # Design system styles
│   ├── js/app.js                 # Frontend controller
│   └── index.html                # Main HTML markup
├── views/                        # Authenticated standalone pages
│   └── grok-debugger.html        # Grok Debugger (requires login)
├── extras/                       # Supplementary utilities
│   └── uptime_kuma_rest_api.py   # Uptime Kuma REST API wrapper (Python)
├── docs/                         # Internal documentation
├── data/                         # Runtime persistent storage (git-ignored)
├── docker-compose.yml            # Container orchestration
├── Dockerfile                    # Multi-stage production build
├── package.json                  # Dependencies and scripts
└── tsconfig.json                 # TypeScript configuration
```

---

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm
- PostgreSQL 15+ (or use Docker)
- Docker & Docker Compose (recommended)

### 1. Clone and install

```bash
git clone https://github.com/honet-labs/hephaestus.git
cd hephaestus
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
PORT=5000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173,https://your-domain.com

# PostgreSQL
PGHOST=localhost
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_password
PGDATABASE=hephaestus

# Grafana (optional)
GRAFANA_HOST=http://localhost:3000
GRAFANA_TOKEN=your_grafana_service_account_token
GRAFANA_DATASOURCE_UID=your_datasource_uid

# Prometheus (optional)
PROMETHEUS_CONFIG_PATH=/etc/prometheus/prometheus.yml
PROMETHEUS_RELOAD_URL=http://localhost:9090/-/reload
```

### 3. Database setup

Hephaestus auto-creates all tables on first startup. Ensure PostgreSQL is running and the database exists:

```sql
CREATE DATABASE hephaestus;
```

If the database does not exist, the application will attempt to create it automatically.

---

## Deployment

### Docker Compose (Recommended)

```bash
docker compose up -d
```

This launches:

| Container | Description | Port |
|-----------|-------------|------|
| `hephaestus-backend` | Node.js API server | 5000 |
| `hephaestus-postgres` | PostgreSQL 15 database | 5435 (host) |

Verify status:

```bash
docker compose ps
docker compose logs -f hephaestus-backend
```

### Manual Deployment

```bash
npm run build
npm start
```

The server listens on `http://localhost:5000` by default.

### Update

```bash
git pull
./update.sh
```

Or from the web UI: **Settings > System Update > Check for Updates**.

### Cloudflare Tunnel (Production)

To expose via Cloudflare Tunnel:

```bash
cloudflared tunnel --url http://localhost:5000
```

Or configure a named tunnel in your Cloudflare dashboard pointing to `localhost:5000`.

---

## Configuration

### First-Time Setup

1. Open the web UI in your browser.
2. The setup wizard appears automatically if no admin user exists.
3. Create an admin account (username, email, password).
4. Log in with the new admin credentials.

### Connection Registry

Navigate to **Settings** to add monitoring connections:

- **Grafana**: Provide Host URL, API Token, and optional Datasource UID.
- **Prometheus**: Choose `local` (read from filesystem) or `ssh` (remote via SSH/SFTP). Provide config file path and optional reload URL.
- **Uptime Kuma**: Provide the Uptime Kuma instance URL and optional credentials.

### SSH Configuration (Remote Prometheus)

For remote Prometheus config management:

1. Create an SSH key pair or use password authentication.
2. Ensure the SSH user has `sudo` access for:
   - `/usr/bin/systemctl` (service restart)
   - `/usr/bin/cp` (file copy)
   - `/usr/bin/rm` (temp file cleanup)

Add to `/etc/sudoers`:

```
username ALL=(ALL) NOPASSWD: /usr/bin/systemctl, /usr/bin/cp, /usr/bin/rm
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Server listen port |
| `ALLOWED_ORIGINS` | `http://localhost:3000,...` | Comma-separated CORS origins |
| `PGHOST` | `localhost` | PostgreSQL host |
| `PGPORT` | `5432` | PostgreSQL port |
| `PGUSER` | `postgres` | PostgreSQL user |
| `PGPASSWORD` | `postgres` | PostgreSQL password |
| `PGDATABASE` | `hephaestus` | PostgreSQL database name |
| `PGSSL` | `false` | Enable SSL for PostgreSQL |
| `HTTPS` | `false` | Enable HSTS headers |
| `GRAFANA_HOST` | -- | Default Grafana URL |
| `GRAFANA_TOKEN` | -- | Grafana API token |
| `PROMETHEUS_CONFIG_PATH` | `/etc/prometheus/prometheus.yml` | Prometheus config path |
| `PROMETHEUS_RELOAD_URL` | `http://localhost:9090/-/reload` | Prometheus reload endpoint |

---

## CLI Usage

Hephaestus includes a CLI for user management:

```bash
# Build CLI first
npm run build

# Create admin user
node dist/cli.js register

# Reset password
node dist/cli.js reset-password

# List all users
node dist/cli.js list-users

# Reset setup wizard
node dist/cli.js reset-setup
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/users/login` | No | Authenticate user |
| GET | `/api/v1/users/session` | No | Validate session |
| POST | `/api/v1/users/logout` | Yes | Destroy session |
| GET | `/api/v1/settings/overview` | ADMIN | Dashboard data |
| GET/POST | `/api/v1/settings/grafana` | ADMIN | Grafana CRUD |
| GET/POST | `/api/v1/prometheus/config` | ADMIN | Prometheus config |
| POST | `/api/v1/prometheus/config/validate` | ADMIN | YAML validation |
| GET | `/api/v1/query-explorer/panels` | Yes | List query panels |
| POST | `/api/v1/query-explorer/query-test` | Yes | Test Prometheus query |
| POST | `/api/v1/grok-debugger/test` | ADMIN | Test grok pattern |
| GET | `/api/v1/uptime-kuma/monitors` | Yes | List monitors |
| POST | `/api/v1/snmp/query` | Yes | SNMP GET/WALK |
| GET | `/api/v1/setup/status` | No | Check setup status |
| POST | `/api/v1/setup/create-admin` | No | Create initial admin |

---

## Development

```bash
npm run dev          # Start with hot-reload
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix lint issues
npm run format       # Format with Prettier
```

---

## License

MIT License. See [LICENSE](LICENSE) for details.
