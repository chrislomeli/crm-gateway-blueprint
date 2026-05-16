# Development Workflows & Best Practices

## 🔄 Common Development Scenarios

### Starting a New Feature
```bash
# 1. Get latest code and clean state
git pull origin main
pnpm clean && pnpm install && pnpm build

# 2. Create feature branch
git checkout -b feature/my-new-feature

# 3. Start development mode
pnpm dev
```

### Working Across Multiple Packages
```bash
# Scenario: Adding a new service that uses existing packages

# 1. Create new service directory
mkdir services/my-new-service
cd services/my-new-service

# 2. Initialize package.json (copy from existing service)
cp ../webhook-subscriber/package.json .
# Edit name, dependencies, etc.

# 3. Add dependencies to your new service
pnpm add @platform/configuration@workspace:*
pnpm add @platform/core@workspace:*
pnpm add express

# 4. From root, rebuild everything
cd ../..
pnpm build

# 5. Start development
pnpm dev
```

### Making Changes to Shared Packages
```bash
# Scenario: Updating @platform/configuration used by multiple services

# 1. Make changes to packages/configuration/src/
# 2. Build the package
cd packages/configuration
pnpm build

# 3. Test the package
pnpm test

# 4. From root, rebuild dependent services
cd ../..
pnpm build

# 5. Test affected services
pnpm --filter webhook-subscriber test
```

---

## 🧪 Testing Strategies

### Unit Testing Individual Packages
```bash
# Test specific package
cd packages/configuration
pnpm test

# Test in watch mode while developing
pnpm test:watch

# Run integration tests
pnpm test:integration
```

### Integration Testing Across Packages
```bash
# From root - test everything
pnpm test

# Test specific service that depends on multiple packages
pnpm --filter webhook-subscriber test

# Test with verbose output
pnpm test --reporter=verbose
```

### Manual Testing with Development Server
```bash
# Start all services in dev mode
pnpm dev

# Test specific endpoints
curl http://localhost:3000/health
curl -X POST http://localhost:3000/webhook -d '{"test": "data"}'
```

---

## 🔧 Dependency Management

### Adding External Dependencies
```bash
# Add to specific package
cd packages/configuration
pnpm add lodash
pnpm add -D @types/lodash

# Add to service
cd services/webhook-subscriber  
pnpm add express
pnpm add -D @types/express
```

### Adding Internal Dependencies
```bash
# Service depending on package
cd services/my-service
pnpm add @platform/configuration@workspace:*

# Package depending on another package
cd packages/my-package
pnpm add @platform/core@workspace:*
```

### Updating Dependencies
```bash
# Update all external dependencies
pnpm update

# Update specific dependency
pnpm update lodash

# Check for outdated dependencies
pnpm outdated
```

---

## 🏗️ Build Optimization

### Understanding Build Dependencies
```bash
# See build order
pnpm build --dry-run

# Build specific package and its dependencies
pnpm --filter @platform/configuration... build

# Build everything that depends on a package
pnpm --filter ...@platform/configuration build
```

### Incremental Development
```bash
# Only rebuild what changed
pnpm build

# Force rebuild everything
pnpm clean && pnpm build

# Build in parallel (default)
pnpm build --parallel
```

### Debugging Build Issues
```bash
# Verbose build output
pnpm build --verbose

# Check what Turborepo is doing
pnpm build --dry-run --graph

# Clear Turborepo cache
rm -rf .turbo
pnpm build
```

---

## 🐛 Debugging Workflows

### TypeScript Errors
```bash
# Check TypeScript errors without building
npx tsc --noEmit

# Check specific package
cd packages/configuration
npx tsc --noEmit

# Build with detailed error output
pnpm build --verbose
```

### Runtime Debugging
```typescript
// Use built-in debugging in services
import { Logger } from '@platform/core';

const logger = new Logger('my-service');
logger.debug('Debug information');
logger.error('Error details', { error });
```

### Package Resolution Issues
```bash
# Check what packages are linked
pnpm list --depth=0

# Check specific package resolution
pnpm why @platform/configuration

# Verify workspace configuration
cat pnpm-workspace.yaml
```

---

## 🚀 Deployment Preparation

### Pre-commit Checklist
```bash
# 1. Clean build
pnpm clean && pnpm install && pnpm build

# 2. Run all tests
pnpm test

# 3. Check TypeScript
npx tsc --noEmit

# 4. Verify services start
pnpm dev
# Ctrl+C after confirming startup

# 5. Check for unused dependencies
pnpm dlx depcheck
```

### Production Build Verification
```bash
# Build for production
NODE_ENV=production pnpm build

# Test production builds
cd services/webhook-subscriber
node dist/index.js

# Check bundle sizes
ls -la dist/
```

---

## 📊 Performance Monitoring

### Build Performance
```bash
# Time builds
time pnpm build

# Analyze build cache
pnpm build --summarize

# Check Turborepo performance
pnpm build --profile
```

### Development Performance
```bash
# Monitor file watching
pnpm dev --verbose

# Check memory usage
ps aux | grep node

# Profile TypeScript compilation
npx tsc --extendedDiagnostics
```

---

## 🔄 Git Workflows

### Feature Development
```bash
# Start feature
git checkout -b feature/my-feature
pnpm clean && pnpm install && pnpm build

# Regular commits
git add .
git commit -m "feat: add new configuration option"

# Before pushing
pnpm test
pnpm build
git push origin feature/my-feature
```

### Handling Merge Conflicts in Lockfiles
```bash
# If pnpm-lock.yaml has conflicts
git checkout --theirs pnpm-lock.yaml
pnpm install
git add pnpm-lock.yaml
git commit
```

### Updating from Main
```bash
# Update feature branch
git checkout main
git pull origin main
git checkout feature/my-feature
git rebase main

# Rebuild after rebase
pnpm install
pnpm build
```

---

## 🎯 IDE Optimization

### Windsurf Configuration
```json
// .vscode/settings.json (if using VS Code features)
{
  "typescript.preferences.includePackageJsonAutoImports": "on",
  "typescript.suggest.autoImports": true,
  "typescript.workspaceSymbols.scope": "allOpenProjects"
}
```

### Multi-Package Development
- **Use split editor**: Keep package and service files open side-by-side
- **Terminal per package**: Open terminals in specific package directories
- **Search scope**: Use Ctrl/Cmd+Shift+F with folder filters

### Debugging in IDE
```typescript
// Use debugger statements
debugger;

// Console logging with context
console.log('[webhook-subscriber]', 'Processing webhook:', data);

// Structured logging
import { Logger } from '@platform/core';
const logger = new Logger('webhook-subscriber');
logger.info('Webhook received', { webhookId, payload });
```

---

## 🚨 Troubleshooting Guide

### "Module not found" Errors
1. Check if package is built: `pnpm --filter @platform/configuration build`
2. Verify workspace dependency: `pnpm list --depth=0`
3. Check import path: Ensure you're using `@crm/package-name`
4. Rebuild everything: `pnpm clean && pnpm install && pnpm build`

### "Cannot resolve dependency" Errors
1. Check `pnpm-workspace.yaml` includes the package directory
2. Verify package name in `package.json` matches import
3. Ensure dependency uses `workspace:*` protocol
4. Run `pnpm install` from root

### Build Cache Issues
1. Clear Turborepo cache: `rm -rf .turbo`
2. Clear node_modules: `pnpm clean && pnpm install`
3. Force rebuild: `pnpm build --force`

### Performance Issues
1. Check for circular dependencies: `npx madge --circular src/`
2. Analyze bundle size: `npx bundlesize`
3. Profile builds: `pnpm build --profile`
4. Use `pnpm dev` for faster iteration

---

## 📈 Advanced Patterns

### Conditional Package Loading
```typescript
// Lazy load packages for better performance
const loadConfigProvider = async () => {
  const { ConfigProvider } = await import('@platform/configuration');
  return ConfigProvider;
};
```

### Package-Specific Scripts
```bash
# Run script in all packages
pnpm -r run lint

# Run script in packages matching pattern
pnpm --filter "@crm/*" run test

# Run script with environment
NODE_ENV=test pnpm --filter webhook-subscriber run test
```

### Custom Build Pipelines
```json
// turbo.json - custom pipeline
{
  "pipeline": {
    "build:production": {
      "dependsOn": ["^build:production"],
      "env": ["NODE_ENV"],
      "outputs": ["dist/**"]
    }
  }
}
```
