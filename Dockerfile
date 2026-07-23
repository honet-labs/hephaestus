# Stage 1: Build TypeScript to JavaScript
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency files first for efficient caching
COPY package*.json ./
RUN npm install

# Copy tsconfig, source files, and lint/format configurations
COPY tsconfig.json ./
COPY src/ ./src/
COPY .eslintrc.json ./
COPY .eslintignore ./
COPY .prettierrc ./
COPY .prettierignore ./

# Run linting check to ensure code quality before compiling
RUN npm run lint

# Compile TypeScript
RUN npm run build

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install system dependencies (snmpwalk + git for updates)
RUN apk add --no-cache net-snmp-tools git

# Create non-root user
RUN addgroup -g 1001 -S appgroup && adduser -u 1001 -S appuser -G appgroup

# Copy package descriptors and install production-only dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled build output from the builder stage
COPY --from=builder /app/dist ./dist

# Copy static Web UI files
COPY public/ ./public
COPY views/ ./views

# Create persistent data directory for fallback db.json storage (if used)
RUN mkdir -p /app/data/uploads && chown -R appuser:appgroup /app

USER appuser

EXPOSE 5000

CMD ["node", "dist/index.js"]
