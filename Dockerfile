# Stage 1: Build TypeScript to JavaScript
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependency files first for efficient caching
COPY package*.json ./
RUN npm ci

# Copy tsconfig and source files
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# Stage 2: Production Runner
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy package descriptors and install production-only dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy compiled build output from the builder stage
COPY --from=builder /app/dist ./dist

# Create persistent data directory for fallback db.json storage (if used)
RUN mkdir -p /app/data

EXPOSE 5000

CMD ["node", "dist/index.js"]
