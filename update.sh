#!/usr/bin/env bash
# update.sh - Hephaestus Grafana Integration Backend Update Script
set -eo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0;37m' # No Color

echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}   HEPHAESTUS Grafana Backend Service Update   ${NC}"
echo -e "${BLUE}===============================================${NC}"

# 1. Pull latest commits from Git
if [ -d .git ]; then
    echo -e "${YELLOW}[1/5] Pulling latest updates from Git...${NC}"
    git pull || git pull origin main || echo -e "${YELLOW}Warning: Git pull failed or branch not tracked. Proceeding with current local files.${NC}"
else
    echo -e "${BLUE}[1/5] Directory is not a git repository. Skipping git pull.${NC}"
fi

# 2. Run Gatekeeper Automation Checks (Local CI/CD Pipeline)
echo -e "${YELLOW}[2/6] Running Gatekeeper Automation Checks...${NC}"
if [ -f ./local-ci.sh ]; then
    chmod +x ./local-ci.sh
    if ! ./local-ci.sh; then
        echo -e "${RED}Error: Gatekeeper automation checks failed. Code is not safe to deploy! Aborting update.${NC}"
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
echo -e "${YELLOW}[3/6] Cleaning up legacy standalone containers...${NC}"
if docker ps -a --format '{{.Names}}' | grep -Eq "^hephaestus-backend$"; then
    docker stop hephaestus-backend || true
    docker rm hephaestus-backend || true
fi

# 5. Build and start services using Docker Compose
echo -e "${YELLOW}[4/6] Starting services using Docker Compose...${NC}"
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

# 6. Clean up dangling images
echo -e "${YELLOW}[5/6] Cleaning up unused Docker images to save space...${NC}"
docker image prune -f

# 7. Verify and output access details
echo -e "${GREEN}====================================================${NC}"
echo -e "${GREEN} SUCCESS: Services updated and restarted via Compose! ${NC}"
IP_ADDR=$(hostname -I | awk '{print $1}' || echo "localhost")
if [ -z "$IP_ADDR" ]; then IP_ADDR="localhost"; fi
echo -e "${GREEN} Backend API is accessible at: http://${IP_ADDR}:5000 ${NC}"
echo -e "${GREEN} Health endpoint: http://${IP_ADDR}:5000/health ${NC}"
echo -e "${GREEN}====================================================${NC}"
