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

# 2. Build production Docker image
echo -e "${YELLOW}[1/4] Building production Docker image...${NC}"
docker build -t hephaestus-backend:latest .

# 3. Check and clean up existing container
echo -e "${YELLOW}[2/4] Checking for existing containers...${NC}"
if docker ps -a --format '{{.Names}}' | grep -Eq "^hephaestus-backend$"; then
    echo -e "${BLUE}Stopping and removing existing 'hephaestus-backend' container...${NC}"
    docker stop hephaestus-backend || true
    docker rm hephaestus-backend || true
fi

# 4. Handle persistence and environment variables
echo -e "${YELLOW}[3/4] Initializing docker volume and variables...${NC}"
docker volume create hephaestus-backend-data || true

ENV_FLAG=""
if [ -f .env ]; then
    echo -e "${GREEN}Found .env file. Passing environment variables to container.${NC}"
    ENV_FLAG="--env-file .env"
else
    echo -e "${YELLOW}Warning: No .env file found. Running with default configurations.${NC}"
fi

# Run the container (binding port 5000, setting restart policy, and mounting volume for storage)
docker run -d \
    --name hephaestus-backend \
    -p 5000:5000 \
    $ENV_FLAG \
    -v hephaestus-backend-data:/app/data \
    --restart unless-stopped \
    hephaestus-backend:latest

# 5. Verify deployment status
echo -e "${YELLOW}[4/4] Verifying backend deployment status...${NC}"
sleep 3

if [ "$(docker inspect -f '{{.State.Running}}' hephaestus-backend)" = "true" ]; then
    IP_ADDR=$(hostname -I | awk '{print $1}' || echo "localhost")
    if [ -z "$IP_ADDR" ]; then IP_ADDR="localhost"; fi
    echo -e "${GREEN}====================================================${NC}"
    echo -e "${GREEN} SUCCESS: hephaestus-backend is up and running!${NC}"
    echo -e "${GREEN} Backend API is accessible at: http://${IP_ADDR}:5000 ${NC}"
    echo -e "${GREEN} Health endpoint: http://${IP_ADDR}:5000/health ${NC}"
    echo -e "${GREEN}====================================================${NC}"
else
    echo -e "${RED}Error: Container failed to start. Run 'docker logs hephaestus-backend' for details.${NC}"
    exit 1
fi
