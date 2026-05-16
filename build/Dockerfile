# Dockerfile.universal
FROM node:18-alpine AS pruner

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy everything for pruning
COPY . .

# Prune the monorepo to only what's needed
ARG SERVICE_NAME
RUN pnpm dlx turbo prune --scope=${SERVICE_NAME} --docker

# Ensure root tsconfig.json is available for TypeScript builds
# Copy essential root config files that turbo prune might miss
RUN for file in tsconfig.json turbo.json; do \
      if [ -f "/app/$file" ] && [ ! -f "/app/out/full/$file" ]; then \
        cp "/app/$file" "/app/out/full/$file" && \
        echo "✓ Copied root $file to pruned output"; \
      fi; \
    done

# After pruning, ensure critical root files are present
#RUN if [ ! -f /app/out/full/tsconfig.json ] && [ -f /app/tsconfig.json ]; then \
#      cp /app/tsconfig.json /app/out/full/tsconfig.json; \
#      echo "Copied root tsconfig.json to pruned output"; \
#    fi

# Build stage
FROM node:18-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy pruned lockfile and package.json files
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./

# Install dependencies (only what's needed!)
RUN pnpm install --frozen-lockfile --prefer-offline

# Copy pruned source code (now includes root tsconfig.json)
COPY --from=pruner /app/out/full/ .

# Build with turbo and clean up in same layer to reduce image size
ARG SERVICE_NAME
RUN pnpm turbo build --filter=${SERVICE_NAME}... && \
    pnpm store prune && \
    rm -rf /root/.pnpm-store

# Deploy the service to prepare for runtime
RUN pnpm --filter=${SERVICE_NAME} deploy --prod /app/deployed

# Runtime stage
FROM node:18-alpine

# Install wget for health checks
RUN apk add --no-cache wget

# Make entry point configurable
ARG ENTRY_POINT
ENV ENTRY_POINT=${ENTRY_POINT}

WORKDIR /app

# Copy the deployed service
COPY --from=builder /app/deployed ./

# Create config and secrets directories
RUN mkdir -p /config/shared /config/app /config/secrets /secrets/shared /secrets/app

# Create nodejs user and set ownership
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app /config /secrets

USER nodejs

EXPOSE 3000

# Health check using wget (works for all services)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use shell to expand the environment variable
CMD ["sh", "-c", "node ${ENTRY_POINT}"]