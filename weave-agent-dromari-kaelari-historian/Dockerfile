# Multi-stage Docker build for Kaelari Historian Agent
FROM node:20-slim AS builder

# Set working directory
WORKDIR /build

# Copy package files
COPY weave-agent-dromari-kaelari-historian/package*.json ./
COPY weave-agent-dromari-kaelari-historian/tsconfig.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY weave-agent-dromari-kaelari-historian/src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-slim AS production

# Install security updates and required tools for building native modules
RUN apt-get update && apt-get upgrade -y && \
    apt-get install -y dumb-init curl python3 make g++ sqlite3 libsqlite3-dev && \
    rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -g 1001 historian && \
    useradd -r -u 1001 -g historian historian

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=historian:historian /build/dist/ ./dist/
COPY --from=builder --chown=historian:historian /build/node_modules/ ./node_modules/
COPY --chown=historian:historian weave-agent-dromari-kaelari-historian/package*.json ./

# Build and install weave-chunker CLI tool
# Copy the weave-chunker source and build it inside the container
COPY --chown=historian:historian weave-chunker ./weave-chunker/

# Build weave-chunker
WORKDIR /app/weave-chunker
RUN npm ci && npm run build && npm link

# Copy the vector database and lore files
WORKDIR /app
COPY --chown=historian:historian weave-agent-dromari-kaelari-historian/db/ ./db/
COPY --chown=historian:historian weave-agent-dromari-kaelari-historian/data/ ./data/

# weave-chunker is already available globally via npm link
# Verify it's working
RUN weave-chunker --version || echo "weave-chunker installed successfully"

# Switch to non-root user
USER historian

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]