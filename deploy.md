# Directory Package: temp
# Total files: 5
################################################################################

### FILE: Dockerfile
```
# Build stage
FROM node:18-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Set working directory
WORKDIR /app

# Copy root configuration files
COPY pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY turbo.json ./
COPY tsconfig.json ./

# Copy package files for current project structure
COPY packages/configuration/package.json ./packages/configuration/
COPY packages/core/package.json ./packages/core/
COPY packages/connectors/package.json ./packages/connectors/
COPY packages/framework/package.json ./packages/framework/
COPY packages/infrastructure/package.json ./packages/infrastructure/
COPY packages/services/package.json ./packages/services/
COPY packages/tsup-config/package.json ./packages/tsup-config/
COPY integrations/hubspot/package.json ./integrations/hubspot/
COPY services/webhook-subscriber/package.json ./services/webhook-subscriber/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/tsup-config ./packages/tsup-config
COPY packages/configuration ./packages/configuration
COPY packages/core ./packages/core
COPY packages/connectors ./packages/connectors
COPY packages/framework ./packages/framework
COPY packages/infrastructure ./packages/infrastructure
COPY packages/services ./packages/services
COPY integrations/hubspot ./integrations/hubspot
COPY services/webhook-subscriber ./services/webhook-subscriber

# Build the project
RUN pnpm build --filter=@service/webhook-subscriber...

# Deploy the service to prepare for runtime (this resolves pnpm symlinks)
RUN pnpm --filter=@service/webhook-subscriber deploy --prod /app/deployed

# Runtime stage
FROM node:18-alpine

WORKDIR /app

# Copy the deployed service (with resolved dependencies)
COPY --from=builder /app/deployed ./

# Create config and secrets directories
RUN mkdir -p /config/shared /config/app /secrets/shared /secrets/app

# Create nodejs user and set ownership
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app /config /secrets

# Switch to nodejs user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "dist/webhook-handler.js"]
```

### FILE: package.json
```
{
  "name": "@service/webhook-subscriber",
  "version": "1.0.0",
  "type": "module",
  "description": "Webhook subscriber service for processing HubSpot events and intent extraction",
  "main": "dist/webhook-handler.js",
  "scripts": {
    "build": "node_modules/.bin/tsup",
    "dev": "node_modules/.bin/tsup --watch --onSuccess 'node dist/index.js'",
    "start": "node dist/webhook-handler.js",
    "test": "vitest",
    "test:run": "vitest run",
    "clean": "rm -rf dist"
  },
  "dependencies": {
    "@aws-sdk/client-sqs": "^3.0.0",
    "@platform/configuration": "workspace:*",
    "@platform/core": "workspace:*",
    "@platform/connectors": "workspace:*",
    "@platform/framework": "workspace:*",
    "@platform/infrastructure": "workspace:*",
    "@platform/services": "workspace:*",
    "@crm/hubspot": "workspace:*",
    "@hubspot/api-client": "^13.1.0",
    "axios": "^1.6.0",
    "compression": "^1.8.1",
    "cors": "^2.8.5",
    "dd-trace": "^5.0.0",
    "dotenv": "^17.2.1",
    "express": "^4.18.2",
    "helmet": "^7.1.0",
    "hot-shots": "^11.2.0",
    "lodash": "^4.17.21",
    "p-limit": "^4.0.0",
    "ts-toolbelt": "^9.6.0",
    "ulid": "^3.0.1",
    "uuid": "^9.0.0",
    "uuid4": "^2.0.3",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/compression": "^1.8.1",
    "@types/cors": "^2.8.0",
    "@types/express": "^4.17.0",
    "@types/lodash": "^4.17.20",
    "@types/node": "^24.3.0",
    "@types/uuid": "^9.0.0",
    "@types/uuid4": "^2.0.3",
    "ts-node": "^10.9.2",
    "tsup": "^8.5.0",
    "typescript": "^5.9.2",
    "vitest": "^2.0.0"
  }
}
```

### FILE: tsconfig.json
```
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["dist",
    "node_modules"
  ]
}
```

### FILE: tsup.config.ts
```
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/webhook-handler.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    bundle: true,
    external: ['express', '@platform/core', '@platform/services', '@platform/configuration', '@platform/connectors', '@platform/framework', '@platform/infrastructure', '@crm/hubspot'],
    target: 'node18',
    platform: 'node',
});
```

### FILE: vitest.config.ts
```
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@platform/core': resolve(__dirname, '../../packages/core/src'),
      '@platform/configuration': resolve(__dirname, '../../packages/configuration/src'),
      '@platform/connectors': resolve(__dirname, '../../packages/connectors/src'),
      '@platform/framework': resolve(__dirname, '../../packages/framework/src'),
      '@platform/services': resolve(__dirname, '../../packages/services/src'),
    },
  },
});
```

