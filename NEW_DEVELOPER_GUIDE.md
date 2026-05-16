# 🚀 New Developer Guide: Building Services in Our Monorepo

**Welcome to the team!** This guide will help you understand our monorepo architecture and how to add new services effectively. We'll explain not just *what* we use, but *why* we chose each technology.

## 🎯 Quick Start Checklist

Before diving deep, here's what you need to get started:

- [ ] Clone the repository
- [ ] Install Node.js 18+ and pnpm
- [ ] Run `pnpm install` (installs all workspace dependencies)
- [ ] Run `pnpm build` (builds all packages and services)
- [ ] Set up local Kubernetes with Kind: `kind create cluster`
- [ ] Deploy locally: `kubectl apply -k infrastructure/k8s/overlays/local/`

## 🏗️ Technology Stack: Why We Chose Each Tool

### **Monorepo Architecture**
**What:** Single repository containing multiple related packages and services  
**Why:** 
- **Shared Dependencies**: One version of TypeScript, testing tools, etc. across all projects
- **Atomic Changes**: Update a shared library and all dependent services in one commit
- **Simplified CI/CD**: Build and deploy related services together
- **Code Reuse**: Share types, utilities, and business logic across services
- **Developer Experience**: One `git clone`, one `pnpm install`, everything works

**Alternative:** Multiple repositories (polyrepo) - more complex dependency management, harder to coordinate changes

### **ESM (ECMAScript Modules)**
**What:** Modern JavaScript module system (`import`/`export`)  
**Why:**
- **Future-Proof**: Industry standard, supported natively by Node.js and browsers
- **Tree Shaking**: Bundlers can eliminate unused code for smaller builds
- **Static Analysis**: Better IDE support and tooling
- **Performance**: Faster loading and execution than CommonJS

**Alternative:** CommonJS (`require`/`module.exports`) - legacy, slower, less tooling support

### **pnpm Workspaces**
**What:** Package manager with workspace support for monorepos  
**Why:**
- **Disk Efficiency**: Shared dependencies stored once, linked everywhere
- **Fast Installs**: 2-3x faster than npm, especially in CI/CD
- **Strict Dependencies**: Prevents phantom dependencies (accessing packages not in package.json)
- **Workspace Protocol**: Easy cross-package dependencies with `workspace:*`

**Alternative:** npm/yarn workspaces - slower, less efficient disk usage

### **Turborepo**
**What:** Build system optimized for monorepos  
**Why:**
- **Incremental Builds**: Only rebuilds changed packages and their dependents
- **Parallel Execution**: Builds multiple packages simultaneously
- **Remote Caching**: Share build artifacts across team and CI/CD
- **Task Orchestration**: Handles complex dependency graphs automatically

**Alternative:** Manual build scripts - slow, error-prone, no caching

### **tsup**
**What:** TypeScript bundler built on esbuild  
**Why:**
- **Speed**: 10-100x faster than webpack/rollup for TypeScript
- **Zero Config**: Works out of the box for most TypeScript projects
- **Multiple Formats**: Generates both ESM and CommonJS outputs
- **Type Declarations**: Automatically generates .d.ts files

**Alternative:** tsc + webpack - slower, more configuration required

### **Kubernetes + Kind**
**What:** Container orchestration platform with local development cluster  
**Why:**
- **Production Parity**: Local environment matches production deployment
- **Service Discovery**: Services can find each other automatically
- **Health Checks**: Built-in liveness/readiness probes
- **Scaling**: Easy horizontal scaling of services
- **Kind**: Lightweight local Kubernetes for development

**Alternative:** Docker Compose - simpler but doesn't match production Kubernetes

## 📁 Monorepo Organization: Why This Structure Matters

```
├── build/                    # Universal build system
├── services/                 # Deployable containers
├── integrations/            # CRM business logic
├── packages/                # Shared libraries
├── infrastructure/          # Kubernetes configs
└── tools/                   # Development utilities
```

### **`build/` - Universal Build System**
**Purpose:** Single Dockerfile that can build any service  
**Why:** 
- **Consistency**: All services built the same way
- **Efficiency**: Shared base layers, faster builds
- **Maintenance**: One Dockerfile to maintain, not dozens

**Example:**
```dockerfile
# Builds any service by passing SERVICE_NAME
ARG SERVICE_NAME=@service/simple-publisher
ARG ENTRY_POINT=dist/simple-publisher.js
```

### **`services/` - Deployable Transport Layers**
**Purpose:** HTTP/SQS/event handlers that orchestrate business logic  
**Why Separate from Business Logic:**
- **Transport Independence**: Same business logic works with HTTP, SQS, or GraphQL
- **Testing**: Mock transport layer, test business logic in isolation
- **Scaling**: Scale transport and business logic independently

**Example Structure:**
```
services/simple-publisher/
├── src/simple-publisher.ts    # HTTP server + SQS sending
├── package.json               # Service-specific dependencies
└── Dockerfile -> ../../build/Dockerfile  # Uses universal build
```

### **`integrations/` - CRM Business Logic**
**Purpose:** Pure business logic for external systems (HubSpot, Salesforce, etc.)  
**Why Separate:**
- **Reusability**: Same HubSpot logic works in webhook handler, batch processor, admin UI
- **Testing**: Business logic tests don't need HTTP servers or databases
- **Domain Focus**: Developers can focus on business rules, not transport concerns

**Example Structure:**
```
integrations/hubspot/
├── src/
│   ├── webhooks/             # Webhook processing logic
│   ├── intents/              # Intent extraction logic
│   ├── repositories/         # Data access patterns
│   └── types/                # Business domain types
└── package.json              # Business logic dependencies only
```

### **`packages/` - Shared Libraries**
**Purpose:** Common functionality used across services and integrations  
**Why This Organization:**

#### **`packages/configuration/`**
- **Type-Safe Config**: Compile-time validation of configuration keys
- **Environment Support**: Dev/staging/prod configurations
- **Secret Management**: Integration with AWS Secrets Manager

#### **`packages/connectors/`**
- **Standardized Access**: Consistent interface to databases, HTTP APIs, message queues
- **Resilience**: Built-in retries, circuit breakers, timeouts
- **Observability**: Automatic tracing and metrics for all external calls

#### **`packages/core/`**
- **Common Patterns**: Result types, error handling, logging
- **Business Primitives**: Shared types and utilities
- **Framework Agnostic**: Works with any transport layer

#### **`packages/infrastructure/`**
- **Observability**: Tracing, metrics, health checks
- **Resilience**: Circuit breakers, retries, graceful degradation
- **Kubernetes Integration**: Health probes, configuration management

#### **`packages/framework/`**
- **Service Patterns**: Common service initialization and lifecycle
- **Middleware**: Request/response processing patterns
- **Testing Utilities**: Mocks and test helpers

## 🔧 Adding a New Service: Step-by-Step Guide

### **Step 1: Decide Service Type**

**Question:** What does your service do?
- **Transport Layer** → Add to `services/`
- **Business Logic** → Add to `integrations/`
- **Shared Library** → Add to `packages/`

### **Step 2: Create Service Structure**

**For a new transport service:**
```bash
# Create service directory
mkdir -p services/my-new-service/src

# Create package.json
cat > services/my-new-service/package.json << EOF
{
  "name": "@service/my-new-service",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  },
  "dependencies": {
    "@platform/core": "workspace:*",
    "@platform/infrastructure": "workspace:*",
    "@platform/configuration": "workspace:*"
  }
}
EOF

# Create TypeScript config
cat > services/my-new-service/tsconfig.json << EOF
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
EOF

# Create build config
cat > services/my-new-service/tsup.config.ts << EOF
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/my-new-service.ts'],
  format: ['esm'],
  target: 'node18',
  sourcemap: true,
  clean: true,
  dts: true
});
EOF
```

### **Step 3: Implement Service Pattern**

**Create main service file:**
```typescript
// services/my-new-service/src/my-new-service.ts
import { logger } from '@platform/core';
import { CONFIG, ConfigProvider } from '@platform/configuration';
import { HealthChecker } from '@platform/infrastructure';

async function main() {
  try {
    // Initialize configuration
    await ConfigProvider.initialize();
    
    // Initialize health checker
    const healthChecker = new HealthChecker({
      serviceName: 'my-new-service',
      port: 3001
    });
    await healthChecker.start();
    
    // Initialize observability
    const observabilityProvider = ConfigProvider.get(CONFIG.OBSERVABILITY_PROVIDER);
    await ObservabilityFactory.initialize({
      provider: observabilityProvider as 'console' | 'datadog' | 'opentelemetry',
      tracing: { enabled: true, type: observabilityProvider },
      metrics: { enabled: true, type: observabilityProvider }
    });
    
    // Your service logic here
    logger.info('Service started successfully');
    
  } catch (error) {
    logger.error({ error }, 'Failed to start service');
    process.exit(1);
  }
}

main();
```

### **Step 4: Add to Build System**

**Update root package.json:**
```json
{
  "workspaces": [
    "services/my-new-service"
  ]
}
```

**Update turbo.json:**
```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    }
  }
}
```

### **Step 5: Create Kubernetes Deployment**

**Create deployment manifest:**
```yaml
# infrastructure/k8s/base/my-new-service-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-new-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-new-service
  template:
    metadata:
      labels:
        app: my-new-service
    spec:
      containers:
      - name: my-new-service
        image: my-new-service:latest
        ports:
        - containerPort: 3000  # Main service port
        - containerPort: 3001  # Health check port
        env:
        - name: OBSERVABILITY_PROVIDER
          value: "console"
        livenessProbe:
          httpGet:
            path: /health/liveness
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 30
          failureThreshold: 5
        readinessProbe:
          httpGet:
            path: /health/readiness
            port: 3001
          initialDelaySeconds: 15
          periodSeconds: 15
          failureThreshold: 5
```

### **Step 6: Build and Deploy**

```bash
# Install dependencies
pnpm install

# Build your service
pnpm build --filter=@service/my-new-service

# Build Docker image
docker build \
  --build-arg SERVICE_NAME=@service/my-new-service \
  --build-arg ENTRY_POINT=dist/my-new-service.js \
  -t my-new-service:latest \
  -f build/Dockerfile .

# Deploy to local Kubernetes
kubectl apply -f infrastructure/k8s/base/my-new-service-deployment.yaml

# Check health
kubectl port-forward deployment/my-new-service 3001:3001
curl http://localhost:3001/health/readiness
```

## 🔐 Configuration and Secrets Management

### **Why Our Configuration System Matters**

**Problem:** Hard-coded values, runtime config errors, insecure secrets  
**Solution:** Type-safe, environment-aware, secure configuration

### **How to Use Configuration**

**1. Define Configuration Keys (Type-Safe)**
```typescript
// packages/configuration/src/config-keys.ts
export const CONFIG = {
  MY_SERVICE_API_URL: 'env.myService.apiUrl',
  MY_SERVICE_API_KEY: 'secrets.myService.apiKey'
} as const;
```

**2. Add Environment Schema**
```typescript
// packages/configuration/src/config/environment-provider.ts
const EnvironmentSchema = z.object({
  MY_SERVICE_API_URL: z.string().url(),
  MY_SERVICE_API_KEY: z.string().min(1)
});
```

**3. Use in Your Service**
```typescript
import { CONFIG, ConfigProvider } from '@platform/configuration';

// Type-safe - will fail at compile time if key doesn't exist
const apiUrl = ConfigProvider.get(CONFIG.MY_SERVICE_API_URL);
const apiKey = ConfigProvider.get(CONFIG.MY_SERVICE_API_KEY);
```

### **Environment-Specific Configuration**

**Development (local):**
```bash
# .env.local
MY_SERVICE_API_URL=http://localhost:8080
MY_SERVICE_API_KEY=dev-key-123
```

**Production (Kubernetes):**
```yaml
env:
- name: MY_SERVICE_API_URL
  value: "https://api.production.com"
- name: MY_SERVICE_API_KEY
  valueFrom:
    secretKeyRef:
      name: my-service-secrets
      key: api-key
```

## 🚨 Common Pitfalls for New Developers

### **1. Import Path Issues**
**Wrong:**
```typescript
import { logger } from '../../../packages/core/src/logger';
```
**Right:**
```typescript
import { logger } from '@platform/core';
```

### **2. Forgetting to Build Dependencies**
**Error:** `Cannot find module '@platform/core'`  
**Solution:** Run `pnpm build` to build all workspace dependencies

### **3. Mixing Transport and Business Logic**
**Wrong:** HTTP handling in business logic files  
**Right:** Keep HTTP in `services/`, business logic in `integrations/`

### **4. Not Using Type-Safe Configuration**
**Wrong:**
```typescript
const url = process.env.API_URL; // Runtime error if missing
```
**Right:**
```typescript
const url = ConfigProvider.get(CONFIG.API_URL); // Compile-time safety
```

### **5. Skipping Health Checks**
**Wrong:** No health endpoints  
**Right:** Always include health checker for Kubernetes probes

## 🎯 Next Steps

1. **Read the Code:** Start with `services/simple-publisher` as a reference
2. **Try the Patterns:** Create a simple "hello world" service following this guide
3. **Ask Questions:** The team is here to help!
4. **Contribute:** Improve this guide as you learn

## 📚 Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [pnpm Workspaces Guide](https://pnpm.io/workspaces)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [TypeScript ESM Guide](https://www.typescriptlang.org/docs/handbook/esm-node.html)

**Welcome to the team! 🚀**
