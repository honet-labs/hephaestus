#!/usr/bin/env bash
# deploy.sh - Hephaestus Grafana Integration Backend Deploy Script
set -eo pipefail

# Text colors for clean formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0;37m' # No Color

echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}   HEPHAESTUS Grafana Backend Service Deploy   ${NC}"
echo -e "${BLUE}===============================================${NC}"

# 1. Verify Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed or not in PATH.${NC}"
    echo -e "${YELLOW}Please install Docker and try again.${NC}"
    exit 1
fi

# 2. Run Gatekeeper Automation Checks (Local CI/CD Pipeline)
echo -e "${YELLOW}Running Gatekeeper Automation Checks...${NC}"
if [ -f ./local-ci.sh ]; then
    chmod +x ./local-ci.sh
    if ! ./local-ci.sh; then
        echo -e "${RED}Error: Gatekeeper automation checks failed. Code is not safe to deploy! Aborting deploy.${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}Warning: 'local-ci.sh' not found. Skipping gatekeeper checks.${NC}"
fi

# 2b. Check and Install Host Dependencies (snmpwalk, nmap)
if command -v apt-get &> /dev/null; then
    echo -e "${YELLOW}Checking host system dependencies (snmpwalk, nmap)...${NC}"
    DEPS_TO_INSTALL=()
    if ! command -v snmpwalk &> /dev/null; then
        DEPS_TO_INSTALL+=("snmp")
    fi
    if ! command -v nmap &> /dev/null; then
        DEPS_TO_INSTALL+=("nmap")
    fi

    if [ ${#DEPS_TO_INSTALL[@]} -gt 0 ]; then
        echo -e "${YELLOW}Installing missing dependencies on host: ${DEPS_TO_INSTALL[*]}...${NC}"
        sudo apt-get update -y
        sudo apt-get install -y "${DEPS_TO_INSTALL[@]}"
    else
        echo -e "${GREEN}All host system dependencies (snmpwalk, nmap) are already installed.${NC}"
    fi
fi

# 3. Create .env if not exists
if [ ! -f .env ] && [ -f .env.example ]; then
    echo -e "${YELLOW}Creating default .env from .env.example...${NC}"
    cp .env.example .env
fi

# 4. Stop and remove legacy standalone container if it exists
echo -e "${YELLOW}[1/4] Cleaning up legacy standalone containers...${NC}"
if docker ps -a --format '{{.Names}}' | grep -Eq "^hephaestus-backend$"; then
    docker stop hephaestus-backend || true
    docker rm hephaestus-backend || true
fi

# 5. Build and start services using Docker Compose
echo -e "${YELLOW}[2/4] Starting services using Docker Compose...${NC}"
COMPOSE_CMD="docker compose"
if ! docker compose version &>/dev/null; then
    if command -v docker-compose &>/dev/null; then
        COMPOSE_CMD="docker-compose"
    else
        echo -e "${RED}Error: Neither 'docker compose' nor 'docker-compose' command was found.${NC}"
        exit 1
    fi
fi

$COMPOSE_CMD down || true
$COMPOSE_CMD up -d --build

# 6. Verify deployment status
echo -e "${YELLOW}[3/4] Verifying backend deployment status...${NC}"
sleep 5

if [ "$($COMPOSE_CMD ps -q hephaestus-backend | wc -l)" -gt 0 ]; then
    IP_ADDR=$(hostname -I | awk '{print $1}' || echo "localhost")
    if [ -z "$IP_ADDR" ]; then IP_ADDR="localhost"; fi
    echo -e "${GREEN}====================================================${NC}"
    echo -e "${GREEN} SUCCESS: hephaestus services are up and running!${NC}"
    echo -e "${GREEN} Backend API is accessible at: http://${IP_ADDR}:5000 ${NC}"
    echo -e "${GREEN} Health endpoint: http://${IP_ADDR}:5000/health ${NC}"
    echo -e "${GREEN}====================================================${NC}"
else
    echo -e "${RED}Error: Services failed to start. Run 'docker compose logs' for details.${NC}"
    exit 1
fi
