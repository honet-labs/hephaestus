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

# 3. Rebuild the Docker image
echo -e "${YELLOW}[3/6] Rebuilding Docker image...${NC}"
docker build -t hephaestus-backend:latest .

# 4. Stop and remove active container
echo -e "${YELLOW}[4/6] Stopping and removing running container...${NC}"
if docker ps -a --format '{{.Names}}' | grep -Eq "^hephaestus-backend$"; then
    docker stop hephaestus-backend || true
    docker rm hephaestus-backend || true
else
    echo -e "${BLUE}No active container named 'hephaestus-backend' found. Proceeding with clean run.${NC}"
fi

# 5. Start updated container with persistent volume
echo -e "${YELLOW}[5/6] Starting updated container with persistent volume...${NC}"
docker volume create hephaestus-backend-data || true

ENV_FLAG=""
if [ -f .env ]; then
    echo -e "${GREEN}Found .env file. Passing environment variables to container.${NC}"
    ENV_FLAG="--env-file .env"
else
    echo -e "${YELLOW}Warning: No .env file found. Running with default configurations.${NC}"
fi

docker run -d \
    --name hephaestus-backend \
    -p 5000:5000 \
    $ENV_FLAG \
    -v hephaestus-backend-data:/app/data \
    --restart unless-stopped \
    hephaestus-backend:latest

# 6. Clean up dangling images
echo -e "${YELLOW}[6/6] Cleaning up unused Docker images to save space...${NC}"
docker image prune -f

# 7. Verify and output access details
echo -e "${GREEN}====================================================${NC}"
echo -e "${GREEN} SUCCESS: Backend updated and container restarted!  ${NC}"
IP_ADDR=$(hostname -I | awk '{print $1}' || echo "localhost")
if [ -z "$IP_ADDR" ]; then IP_ADDR="localhost"; fi
echo -e "${GREEN} Backend API is accessible at: http://${IP_ADDR}:5000 ${NC}"
echo -e "${GREEN} Health endpoint: http://${IP_ADDR}:5000/health ${NC}"
echo -e "${GREEN}====================================================${NC}"
