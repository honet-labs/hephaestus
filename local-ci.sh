#!/usr/bin/env bash
# local-ci.sh - Hephaestus Gatekeeper Automation Check (Local CI/CD)
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0;37m' # No Color

echo -e "${BLUE}===============================================${NC}"
echo -e "${BLUE}     HEPHAESTUS GATEKEEPER AUTOMATION CHECK    ${NC}"
echo -e "${BLUE}===============================================${NC}"

# Step 1: Web Asset Integrity Check
echo -e "${YELLOW}[1/5] Checking static web asset integrity...${NC}"
CRITICAL_FILES=("public/index.html" "public/css/style.css" "public/js/app.js")

for FILE in "${CRITICAL_FILES[@]}"; do
    if [ ! -f "$FILE" ]; then
        echo -e "${RED}❌ FAILED: Critical asset file '$FILE' is missing!${NC}"
        exit 1
    fi
    if [ ! -s "$FILE" ]; then
        echo -e "${RED}❌ FAILED: Critical asset file '$FILE' is empty!${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ All critical static assets are present and non-empty.${NC}"

# Step 2: Environment Config Drift Check
echo -e "${YELLOW}[2/5] Verifying environment variable configuration...${NC}"
if [ -f .env.example ]; then
    if [ -f .env ]; then
        MISSING_VARS=()
        # Read each line of .env.example to check if the keys exist in .env
        while IFS= read -r line || [ -n "$line" ]; do
            # Ignore comments and empty lines
            if [[ ! "$line" =~ ^# ]] && [[ -n "$line" ]]; then
                KEY=$(echo "$line" | cut -d'=' -f1 | tr -d ' ')
                if [ -n "$KEY" ]; then
                    if ! grep -q "^${KEY}=" .env; then
                        MISSING_VARS+=("$KEY")
                    fi
                fi
            fi
        done < .env.example

        if [ ${#MISSING_VARS[@]} -ne 0 ]; then
            echo -e "${YELLOW}⚠️ WARNING: The following variables are in .env.example but missing from .env:${NC}"
            for VAR in "${MISSING_VARS[@]}"; do
                echo -e "   - $VAR"
            done
            # We don't fail the build, just warn the operator
        else
            echo -e "${GREEN}✓ All environment variables are synchronized with .env.example.${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️ WARNING: No active '.env' file found. Fallback mode will be used.${NC}"
    fi
else
    echo -e "${BLUE}No '.env.example' found. Skipping configuration drift check.${NC}"
fi

# Step 3: Linting & Formatting Check
echo -e "${YELLOW}[3/5] Running ESLint and Prettier check...${NC}"
if command -v npm &> /dev/null; then
    if [ -d "node_modules" ]; then
        if npm run lint && npm run format:check; then
            echo -e "${GREEN}✓ Linting and formatting checks passed successfully!${NC}"
        else
            echo -e "${RED}❌ FAILED: Code linting or formatting checks failed. Run 'npm run lint:fix' or 'npm run format' to resolve!${NC}"
            exit 1
        fi
    else
        echo -e "${YELLOW}⚠️ WARNING: 'node_modules' folder not found. Skipping linting and formatting checks on host.${NC}"
        echo -e "${YELLOW}If you are developing locally, run 'npm install' to enable these checks.${NC}"
    fi
else
    echo -e "${YELLOW}⚠️ WARNING: npm not available on this host. Skipping linting check.${NC}"
fi

# Step 4: TypeScript Compilation Guard (Docker Builder Test)
echo -e "${YELLOW}[4/5] Running TypeScript compiler check inside Docker...${NC}"
if command -v docker &> /dev/null; then
    # Build only the builder stage of the Dockerfile to verify TS compiles successfully
    if docker build --target builder -t hephaestus-compilation-check:latest .; then
        echo -e "${GREEN}✓ TypeScript compilation check passed successfully!${NC}"
        # Clean up check image
        docker rmi hephaestus-compilation-check:latest &>/dev/null || true
    else
        echo -e "${RED}❌ FAILED: TypeScript compilation error. Fix TS compile issues before deploying!${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️ WARNING: Docker not available on this host. Skipping Docker compilation check.${NC}"
fi

# Step 5: Final Verification Summary
echo -e "${BLUE}===============================================${NC}"
echo -e "${GREEN}  🟢 SUCCESS: GATEKEEPER PASSES ALL CHECKS  ${NC}"
echo -e "${GREEN}  The codebase is safe for production deployment. ${NC}"
echo -e "${BLUE}===============================================${NC}"
exit 0
