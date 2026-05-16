# Blueprint Project Tech Stack

## Core Technologies

### **Runtime & Language**
- **Node.js 20+** - JavaScript runtime
- **TypeScript** - Primary language with strict mode enabled
- **ESM/CommonJS** - Module system support

### **Package Management & Build**
- **pnpm** - Package manager with workspace support
- **Turborepo** - Monorepo build system and task runner
- **ESBuild** - Fast TypeScript/JavaScript bundler

> **⚠️ MONOREPO WARNING**
> 
> This is a **pnpm workspace monorepo**. Always run commands from the **root directory**:
> 
> ```bash
> # ✅ CORRECT: Install dependencies from root
> pnpm install
> 
> # ✅ CORRECT: Build specific package from root
> pnpm --filter @platform/core build
> pnpm --filter webhook-subscriber build
> 
> # ❌ WRONG: Don't run commands from individual package directories
> cd packages/core && pnpm install  # This breaks workspace links
> cd publishing/webhook-subscriber && pnpm build  # This may fail
> ```
> 
> **Why?** pnpm workspaces manage dependencies and builds from the root. Running commands in individual packages can break workspace symlinks and cause dependency resolution issues.

### **Testing**
- **Vitest** - Test runner (replacing Jest)
- **Node.js Test Runner** - Native testing capabilities
- **Custom Test Utilities** - Project-specific testing helpers

### **Development Tools**
- **TypeScript Compiler** - Type checking and compilation
- **ESLint** - Code linting and style enforcement
- **Prettier** - Code formatting
- **Husky** - Git hooks for quality gates

## Architecture & Patterns

### **Code Organization**
- **Monorepo Structure** - Multiple packages and services
- **Workspace Dependencies** - Internal package references
- **Barrel Exports** - Clean import/export patterns

### **Design Patterns**
- **Dependency Injection** - Constructor-based DI
- **Repository Pattern** - Data access abstraction
- **Result Pattern** - Explicit error handling without exceptions
- **Service Layer** - Business logic encapsulation

### **Configuration**
- **Environment Variables** - Runtime configuration
- **AWS Parameter Store** - Centralized configuration management
- **TypeScript Config Files** - Type-safe configuration definitions

## Infrastructure & Services

### **AWS Services**
- **S3** - File storage and static assets
- **SQS** - Message queuing
- **Parameter Store** - Configuration management
- **Secrets Manager** - Sensitive data storage
- **Lambda** - Serverless functions (where applicable)

### **Databases & Storage**
- **PostgreSQL** - Primary relational database
- **Redis** - Caching and session storage
- **Elasticsearch/OpenSearch** - Search and analytics

### **External Integrations**
- **HubSpot API** - CRM integration
- **acme API Gateway** - Internal service communication

## Development Environment

### **Required Versions**
```json
{
  "node": ">=20.18.0",
  "pnpm": ">=10.11.0",
  "typescript": "^5.3.0"
}
```

### **Key Configuration Files**
- `tsconfig.json` - TypeScript compiler configuration
- `turbo.json` - Turborepo task configuration
- `pnpm-workspace.yaml` - Workspace package definitions
- `vitest.config.ts` - Test configuration
- `.eslintrc.js` - Linting rules

### **Workspace Structure**
```
blueprint-turbo/
├── packages/           # Shared libraries
│   ├── core/          # Core utilities and types
│   ├── connectors/    # External service connectors
│   ├── services/      # Business logic services
│   └── connectors/ # Data access layer
└── services/          # Application services
    ├── contact-sync/  # File processing services
    ├── file-reader/# File discovery service
    └── webhook-reader/ # Webhook processing
```

## Code Quality & Standards

### **Type Safety**
- **Strict TypeScript** - All strict mode flags enabled
- **Explicit Return Types** - Required for public APIs
- **Interface Segregation** - Small, focused interfaces
- **Branded Types** - Type-safe IDs and values

### **Testing Strategy**
- **Unit Tests** - Colocated with source code
- **Integration Tests** - Separate test directories
- **Test Builders** - Fluent API for test data creation
- **Mock Strategy** - External dependencies only

### **Performance**
- **Streaming** - Large file processing
- **Parallel Operations** - Promise.all for concurrent tasks
- **Memory Management** - Careful handling of large datasets
- **Database Optimization** - Specific field selection, indexing

## Deployment & Operations

### **Build Process**
- **Multi-stage Docker** - Optimized container builds
- **ESBuild Bundling** - Fast production builds
- **Tree Shaking** - Unused code elimination

### **Monitoring & Observability**
- **Structured Logging** - JSON-formatted logs with context
- **OpenTelemetry** - Metrics and tracing (planned)
- **Health Checks** - Service health monitoring
- **Performance Metrics** - Operation timing and resource usage

### **Security**
- **Input Validation** - All external inputs validated
- **Secret Management** - AWS Secrets Manager integration
- **Encryption** - Sensitive data encryption at rest
- **Rate Limiting** - API protection

## Development Workflow

### **Code Review Process**
- **Pull Request Required** - All changes via PR
- **Automated Checks** - Linting, type checking, tests
- **Quality Gates** - Coverage and security requirements
- **Squash Merge** - Clean commit history

### **Continuous Integration**
```yaml
Pipeline Steps:
1. Install dependencies (pnpm)
2. Type checking (tsc)
3. Linting (eslint)
4. Testing (vitest)
5. Building (esbuild)
6. Security scanning
7. Deployment (staging/production)
```

## Getting Started

### **Prerequisites**
```bash
# Required tools
node --version  # Should be 20+
pnpm --version  # Should be 10+

# Clone and setup
git clone <repository>
cd blueprint-turbo
pnpm install
```

### **Common Commands**
```bash
# Development
pnpm dev          # Start development servers
pnpm build        # Build all packages
pnpm test         # Run all tests
pnpm lint         # Run linting
pnpm type-check   # TypeScript compilation

# Workspace commands
pnpm --filter @platform/core build
pnpm --filter webhook-subscriber test
```

---

This tech stack emphasizes **type safety**, **performance**, and **maintainability** while supporting rapid development and deployment in a cloud-native environment.
