# CRM Migration Strategy: acme-crm → acme-mono

## Executive Summary

This document outlines the strategic migration of the CRM team's acme-crm project into the acme-mono monorepo. The migration preserves superior architectural patterns while ensuring team harmony and scalable growth.

## 🎯 Migration Goals

1. **Preserve Superior Architecture** - Keep proven patterns that are better than current monorepo implementations
2. **Team Harmony** - Respect existing team boundaries and workflows
3. **Gradual Adoption** - Allow organic discovery and adoption of superior patterns
4. **Scalable Organization** - Create patterns other teams can follow

## 📊 Architecture Quality Assessment

### Comparative Analysis Matrix

| **Category** | **acme-crm** | **acme-mono** | **CRM Should Use** | **Migration Strategy** |
|--------------|----------------------|----------------|--------------------|----------------------|
| **Logging System** | Pino-based, caller tracking, 292 lines | Basic console wrapper, 82 lines | ⬅️ **acme-crm**   | Migrate Logger |
| **Configuration** | Type-safe, templates, 366 lines | NestJS wrapper, 115 lines | ⬅️ **acme-crm**   | Migrate ConfigProvider |
| **Health Checks** | Pod/diagnostic separation | Simple boolean endpoints | ⬅️ **acme-crm**   | Migrate HealthChecker |
| **Service Startup** | Two-phase, retry logic | Basic NestJS startup | ⬅️ **acme-crm**   | Migrate startup patterns |
| **Observability & Resilience** | Sidecar wrappers, circuit breakers, retry, metrics | Basic logging, no resilience patterns | ⬅️ **acme-crm**   | Migrate @platform/infrastructure |
| **Build System** | Universal Dockerfile | Individual Dockerfiles | ⬅️ **acme-crm**   | Migrate build system |
| **Deployment** | Local Kind cluster only | Production EKS + GitHub Actions | ➡️ **acme-mono**  | Adopt their deployment |
| **CI/CD Pipeline** | Basic/incomplete | Multi-env, Slack notifications | ➡️ **acme-mono**  | Adopt their workflows |
| **Secrets Management** | Native config approach | External Secrets Operator | ➡️ **acme-mono**  | Adopt ESO pattern |
| **Semantic Versioning** | Concept only | Full implementation (.versionrc) | ➡️ **acme-mono**  | Adopt their versioning |
| **Local Development** | Complex setup, fragile | Robust NestJS dev experience | ➡️ **acme-mono**  | Improve k8s approach |

### 🏆 Preserve these patterns from acme-crm

#### 1. **Logging System** (@platform/core Logger)
- ✅ **Pino-based** with runtime format switching (JSON ↔ Pretty)
- ✅ **Caller info tracking** (file:line:column automatically)
- ✅ **Production-ready** with DataDog integration
- ✅ **292 lines of sophisticated functionality**

**vs acme-mono:** Basic console.log wrapper (82 lines)

#### 2. **Configuration Management** (ConfigProvider)
- ✅ **Type-safe configuration paths** with compile-time validation
- ✅ **Template resolution** (`{{env.VAR}}` syntax)
- ✅ **Multiple config sources** (YAML, env, secrets)
- ✅ **Health check separation** (pod vs diagnostic)
- ✅ **366 lines of sophisticated config management**

**vs acme-mono:** Basic NestJS wrapper with hard-coded getters (115 lines)

#### 3. **Health Check Architecture**
- ✅ **Pod health vs diagnostic health separation**
- ✅ **External dependency monitoring without pod impact**
- ✅ **Kubernetes best practices compliance**

**vs acme-mono:** Simple boolean health endpoints

#### 4. **Service Startup Patterns**
- ✅ **Two-phase startup** (health server + application logic)
- ✅ **Deterministic environment detection**
- ✅ **Retry logic with test/production modes**
- ✅ **Graceful shutdown handling**

**vs acme-mono:** Basic NestJS startup with tight coupling

#### 5. **Observability & Resilience Architecture** (@platform/infrastructure)
- ✅ **Sidecar wrapper pattern** - Automatic wrapping of functions with observability features
- ✅ **Circuit breaker integration** - Opossum-based circuit breaking with configurable thresholds
- ✅ **Retry mechanisms** - Exponential backoff with configurable retry policies
- ✅ **Rate limiting** - Built-in rate limiting with multiple strategies
- ✅ **Distributed tracing** - OpenTelemetry integration for request tracing
- ✅ **Metrics collection** - Automatic metrics gathering with multiple providers
- ✅ **Alerting integration** - DataDog, PagerDuty, Slack notifications
- ✅ **ObservableFunction template** - Declarative sidecar configuration

**Example Usage:**
```typescript
const getUser = resilience.templates.createObservableFunction({
  context: appContext,
  operationName: 'getUser',
  sidecarFeatures: {
    circuitBreaker: true,
    retry: true,
    metrics: true,
    spans: true,
    alerting: true,
    rateLimit: true
  },
  circuitBreakerConfig: { 
    enabled: true, 
    timeout: 5000, 
    errorThresholdPercentage: 50, 
    resetTimeout: 30000 
  },
  retryConfig: { 
    enabled: true, 
    retries: 3, 
    minTimeout: 100, 
    maxTimeout: 1000, 
    factor: 2 
  },
  alertConfig: { 
    enabled: true, 
    resourceName: 'UserService', 
    alertOnCircuitOpen: true, 
    alertOnRetryFailure: true, 
    alertOnOperationFailure: true 
  }
}, async (userId: string) => {
  // Business logic here - automatically wrapped with all sidecar features
  return await userRepository.findById(userId);
});
```

**vs acme-mono:** Basic logging with no resilience patterns, manual error handling, no circuit breakers or automatic retry logic

#### 6. **Universal Build System**
- ✅ **Multi-stage Docker builds** with Turbo prune optimization
- ✅ **Configurable entry points** - One Dockerfile for all services
- ✅ **Docker space management** and cleanup
- ✅ **ECR integration** and Kind cluster support

**vs acme-mono:** Individual Dockerfiles per service

### 🏆 Superior acme-mono Patterns (ADOPT THESE)

#### 1. **Production Deployment Infrastructure**
- ✅ **Multi-environment EKS clusters** (dev/qa/prod)
- ✅ **Terraform-managed infrastructure** with proper IAM
- ✅ **Complete Kubernetes manifests** (HPA, Ingress, ServiceAccount)
- ✅ **AWS integration** with proper security practices

**vs acme-crm:** Local Kind cluster only, no production deployment

#### 2. **CI/CD Pipeline Excellence**
- ✅ **Multi-environment workflows** with proper branching strategy
- ✅ **Slack notifications** for build status and deployment updates
- ✅ **Reusable workflow components** for deployment consistency
- ✅ **Proper secret management** in GitHub Actions
- ✅ **Build artifact management** with ECR integration

**vs acme-crm:** Basic/incomplete CI/CD setup

#### 3. **Secrets Management with ESO**
- ✅ **External Secrets Operator** integration with AWS Secrets Manager
- ✅ **Kubernetes-native secret refresh** (1h intervals)
- ✅ **Environment-specific secret stores** with proper IAM
- ✅ **Declarative secret management** via YAML manifests

**vs acme-crm:** Native config approach (less Kubernetes-native)

#### 4. **Semantic Versioning Implementation**
- ✅ **Complete .versionrc configuration** with conventional commits
- ✅ **Automated changelog generation** with proper categorization
- ✅ **Issue prefix support** (ENG-, CRM-, TEL-, etc.)
- ✅ **Release automation** with proper tagging strategy

**vs acme-crm:** Concept existed but not fully implemented

#### 5. **Local Development Robustness**
- ✅ **NestJS development server** with hot reload
- ✅ **Integrated testing framework** (Jest) with established patterns
- ✅ **Consistent development environment** across team members
- ✅ **Well-documented setup process** with fewer moving parts

**vs acme-crm:** Complex local setup that can be fragile

## 🏗️ Proposed Monorepo Structure

### Three-Tier Architecture with Domain Grouping

```
acme-mono/
├── packages/                           # PLATFORM UTILITIES
│   ├── shared-lib/                     # Existing (keep for compatibility)
│   └── crm-shared/                     # CRM platform packages
│       ├── @platform-core/             # Logger, types, errors
│       ├── @platform-config/           # ConfigProvider
│       ├── @platform-infrastructure/   # HealthChecker, observability
│       └── @platform-connectors/       # Database, ES, HTTP connectors
│
├── business/                           # BUSINESS LOGIC LAYER
│   └── crm/
│       └── @crm/hubspot/              # HubSpot integration logic
│
└── services/                          # TRANSPORT LAYER
    ├── crm/
    │   ├── build/                     # Universal build system
    │   │   ├── Dockerfile.universal
    │   │   ├── build-services.ts
    │   │   └── services.json
    │   ├── webhooks/                  # Real-time webhook flow
    │   │   ├── webhook-ingress/       # crm-hubspot-webhook-ingress
    │   │   ├── webhook-processor/     # crm-hubspot-webhook-processor
    │   │   └── signal-service/        # aio-hubspot-signal-service
    │   └── contact-sync/              # Batch synchronization flow
    │       ├── batch-importer/        # crm-hubspot-batch-importer
    │       ├── batch-service/         # crm-hubspot-batch-service
    │       └── batch-worker/          # crm-hubspot-batch-worker
    └── core/
        └── acme-aio/                 # Existing NestJS service
```

### Dependency Flow Rules

```
Services → Business Logic → Platform Packages
   ↓           ↓              ↓
Transport   Business       Common
 Layer       Logic          Code
```

**Allowed Dependencies:**
- ✅ Services can import from Business Logic + Platform Packages
- ✅ Business Logic can import from Platform Packages only
- ✅ Platform Packages can import from other Platform Packages (carefully)

**Forbidden Dependencies:**
- ❌ Platform Packages cannot import from Business Logic or Services
- ❌ Business Logic cannot import from Services
- ❌ No circular imports within same tier

## 📦 Package Organization Strategy

### Platform Package Naming Convention

Use `@platform-*` prefix to signal reusability:
- `@platform-core` - **Clearly reusable** (logger, error handling, types)
- `@platform-config` - **Clearly reusable** (configuration management)
- `@platform-infrastructure` - **Clearly reusable** (health checks, observability)
- `@platform-connectors` - **Clearly reusable** (database, ES, HTTP connectors)

### Workspace Configuration

```yaml
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'packages/**/*'      # Deep package discovery
  - 'services/**/*'      # Deep service discovery  
  - 'business/**/*'      # Business logic discovery
```

## 🔧 Dependency Management Strategy

### Root Package.json Organization

```json
{
  "devDependencies": {
    // === EXISTING acme-MONO DEPENDENCIES ===
    "@commitlint/cli": "^19.8.1",
    "@nestjs/cli": "^11.0.10", 
    "jest": "^30.1.3",
    "turbo": "^2.5.6",
    
    // === CRM PLATFORM DEPENDENCIES ===
    // Build tools (ESM-focused)
    "tsup": "^8.5.0",
    "tsx": "^4.7.0",
    "esbuild": "^0.20.0",
    
    // Testing (vitest for ESM)
    "vitest": "^3.2.4",
    
    // Logging
    "pino": "^8.17.2",
    "pino-pretty": "^10.3.1"
  }
}
```

**Key Principle:** Most dependencies are complementary, not conflicting. ESM/modern tooling coexists with CommonJS/traditional tooling.

## 🚀 Migration Phases

### Phase 1: Foundation Setup (Week 1-2)

#### 1.1 Create Directory Structure
```bash
mkdir -p packages/crm-shared
mkdir -p business/crm
mkdir -p services/crm/{build,webhooks,contact-sync}
```

#### 1.2 Migrate Platform Packages
- Move `@platform/core` → `packages/crm-shared/@platform-core/`
- Move `@platform/configuration` → `packages/crm-shared/@platform-config/`
- Move `@platform/infrastructure` → `packages/crm-shared/@platform-infrastructure/`
- Move `@platform/connectors` → `packages/crm-shared/@platform-connectors/`

#### 1.3 Update Package Names and Dependencies
```json
// Update package.json files
{
  "name": "@platform-core",
  "dependencies": {
    // Update internal references
  }
}
```

#### 1.4 Add CRM Dependencies to Root
- Add grouped dependencies to root `package.json`
- Test that existing builds still work
- Update `pnpm-workspace.yaml`

### Phase 2: Service Migration (Week 2-3)

#### 2.1 Migrate Universal Build System
- Copy `build/` folder → `services/crm/build/`
- Update `services.json` for new structure:

```json
{
  "services": [
    {
      "packageName": "@crm/webhook-ingress",
      "imageName": "crm-hubspot-webhook-ingress",
      "entryPoint": "dist/simple-publisher.js"
    },
    {
      "packageName": "@crm/webhook-processor", 
      "imageName": "crm-hubspot-webhook-processor",
      "entryPoint": "dist/webhook-handler.js"
    },
    {
      "packageName": "@crm/signal-service",
      "imageName": "aio-hubspot-signal-service", 
      "entryPoint": "dist/intent-handler.js"
    }
  ]
}
```

#### 2.2 Migrate Services with New Names
- `webhook-subscriber` → `services/crm/webhooks/webhook-processor/`
- `intent-subscriber` → `services/crm/webhooks/signal-service/`
- `simple-publisher` → `services/crm/webhooks/webhook-ingress/`

#### 2.3 Update Service Dependencies
```json
// Update imports in services
{
  "dependencies": {
    "@platform-core": "workspace:*",
    "@platform-config": "workspace:*",
    "@platform-infrastructure": "workspace:*",
    "@crm/hubspot": "workspace:*"
  }
}
```

### Phase 3: Business Logic Migration (Week 3-4)

#### 3.1 Migrate HubSpot Integration
- Move `@crm/hubspot` → `business/crm/@crm/hubspot/`
- Update dependencies to use new platform packages

#### 3.2 Update Import Statements
```typescript
// Update all imports across services
import { logger } from '@platform-core';
import { ConfigProvider } from '@platform-config';
import { HealthChecker } from '@platform-infrastructure';
import { HubspotProcessor } from '@crm/hubspot';
```

### Phase 4: CI/CD Integration (Week 4)

#### 4.1 Update GitHub Actions
- Modify workflows to use `services/crm/build/build-services.ts`
- Test build and deployment pipelines
- Update Kubernetes manifests with new image names

#### 4.2 Documentation and Training
- Document new structure and patterns
- Create migration guide for other teams
- Conduct team training sessions

## 🔍 Testing Strategy

### Validation Checkpoints

1. **Package Builds** - All platform packages build successfully
2. **Service Builds** - All services build with universal build system
3. **Integration Tests** - End-to-end webhook and batch flows work
4. **Deployment Tests** - Services deploy correctly in all environments
5. **Performance Tests** - No regression in build times or runtime performance

### Rollback Plan

- Keep k8s-no-observable repository until migration is fully validated
- Maintain parallel CI/CD pipelines during transition
- Document rollback procedures for each phase

## 📈 Success Metrics

### Technical Metrics
- **Build Time Improvement** - Universal build system efficiency
- **Code Reuse** - Platform packages adopted by other teams
- **Deployment Reliability** - Reduced deployment failures
- **Developer Velocity** - Faster feature development

### Organizational Metrics
- **Team Adoption** - Other teams using CRM platform packages
- **Knowledge Sharing** - Cross-team collaboration on platform utilities
- **Maintenance Overhead** - Reduced duplicate code and patterns

## 🎯 Long-term Vision

### Gradual Platform Evolution

1. **CRM Success** - Demonstrate superior patterns work at scale
2. **Organic Adoption** - Other teams discover and adopt platform packages
3. **Pattern Standardization** - Superior patterns become company standards
4. **Platform Team Formation** - Dedicated team for platform utilities

### Future Expansion

```
services/
├── crm/          # CRM team (established)
├── sales/        # Sales team (future)
├── billing/      # Billing team (future)
└── platform/     # Platform team (future)

packages/
├── @platform-*   # Shared platform utilities
├── @crm-*        # CRM-specific packages
├── @sales-*      # Sales-specific packages
└── @billing-*    # Billing-specific packages
```

## 🚨 Risk Mitigation

### Technical Risks
- **ESM/CommonJS Conflicts** - Mitigated by complementary tooling approach
- **Build System Complexity** - Mitigated by comprehensive documentation
- **Dependency Conflicts** - Mitigated by careful version management

### Organizational Risks
- **Team Resistance** - Mitigated by non-intrusive, domain-scoped approach
- **Knowledge Silos** - Mitigated by documentation and training
- **Maintenance Burden** - Mitigated by clear ownership boundaries

## 📚 References

### Key Architectural Decisions
- [Service Startup Patterns](./SERVICE_STARTUP_PATTERNS.md)
- [Health Check Architecture](./HEALTH_CHECK_ARCHITECTURE.md)
- [Universal Build System](./UNIVERSAL_BUILD_SYSTEM.md)
- [Configuration Management](./CONFIGURATION_MANAGEMENT.md)

### Migration Artifacts
- [Package Mapping](./PACKAGE_MAPPING.md)
- [Dependency Analysis](./DEPENDENCY_ANALYSIS.md)
- [Build System Comparison](./BUILD_SYSTEM_COMPARISON.md)

---

**Document Version:** 1.0  
**Last Updated:** 2025-09-09  
**Owner:** CRM Team  
**Reviewers:** Platform Architecture Team, DevOps Team
