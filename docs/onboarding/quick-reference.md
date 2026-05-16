# Quick Reference Guide

## 🚀 Essential Commands

### Daily Development
```bash
# Start everything in development mode
pnpm dev

# Build everything
pnpm build

# Clean everything and start fresh
pnpm clean && pnpm install && pnpm build

# Run tests across all packages
pnpm test
```

### Package-Specific Operations
```bash
# Work on specific package
pnpm --filter @platform/configuration build
pnpm --filter @platform/configuration test
pnpm --filter webhook-subscriber dev

# Add dependency to specific package
cd packages/configuration
pnpm add lodash
pnpm add @platform/core@workspace:*
```

### Troubleshooting
```bash
# Module not found errors
pnpm build

# Type errors from dependencies  
pnpm clean && pnpm install && pnpm build

# Changes not reflected
pnpm dev  # Make sure you're in watch mode

# Check what's in the workspace
pnpm list --depth=0
```

---

## 📁 Project Structure Cheat Sheet

```
k8s-hello-world/
├── packages/                    # Shared libraries
│   ├── configuration/          # @platform/configuration - Config management
│   ├── core/                   # @platform/core - Logging, utilities
│   ├── connectors/          # @platform/connectors - Database access
│   ├── services/               # @platform/services - AWS services
│   └── tsup-config/            # @platform/tsup-config - Build config
├── services/                   # Applications
│   ├── webhook-subscriber/     # Webhook processing service
│   └── batch-loader/           # Batch processing service
├── k8s/                        # Kubernetes manifests
├── scripts/                    # Utility scripts
└── docs/                       # Documentation
```

---

## 🔧 Package.json Patterns

### Library Package Template
```json
{
  "name": "@crm/my-package",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup",
    "clean": "rm -rf dist node_modules",
    "test": "vitest"
  },
  "dependencies": {
    "@platform/core": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.5.0",
    "typescript": "^5.3.3"
  }
}
```

### Service Package Template
```json
{
  "name": "my-service",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "tsup",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "clean": "rm -rf dist node_modules"
  },
  "dependencies": {
    "@platform/configuration": "workspace:*",
    "@platform/core": "workspace:*"
  }
}
```

---

## 🎯 Import Patterns

### Correct Import Examples
```typescript
// ✅ Local packages
import { ConfigProvider } from '@platform/configuration';
import { Logger } from '@platform/core';
import { MySQLService } from '@platform/connectors';

// ✅ External packages
import express from 'express';
import { z } from 'zod';

// ✅ Relative imports within package
import { helper } from './utils/helper.js';
import type { MyType } from '../types/index.js';
```

### Common Mistakes
```typescript
// ❌ Don't use relative paths to other packages
import { ConfigProvider } from '../../../packages/configuration/src/index.js';

// ❌ Don't forget .js extension for relative imports
import { helper } from './utils/helper';

// ❌ Don't use old CommonJS syntax
const { ConfigProvider } = require('@platform/configuration');
```

---

## 🔍 Debugging Checklist

### Build Failures
1. ✅ Check if all dependencies are installed: `pnpm install`
2. ✅ Check if workspace dependencies exist: `pnpm list --depth=0`
3. ✅ Verify package names match directory names
4. ✅ Check for TypeScript errors: `pnpm build`
5. ✅ Clean and rebuild: `pnpm clean && pnpm install && pnpm build`

### Runtime Errors
1. ✅ Check if packages are built: `pnpm build`
2. ✅ Verify import paths are correct
3. ✅ Check for missing `.js` extensions in relative imports
4. ✅ Ensure you're using ESM syntax (`import`/`export`)

### IDE Issues
1. ✅ Restart TypeScript server in Windsurf
2. ✅ Check if workspace is properly configured
3. ✅ Verify `tsconfig.json` paths are correct
4. ✅ Reload window if auto-imports aren't working

---

## 📋 File Templates

### New Package Index File
```typescript
// src/index.ts
export * from './config-provider.js';
export * from './types/index.js';
export { default as MyClass } from './my-class.js';
```

### tsup.config.ts
```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/**/*.ts'],
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    bundle: true,
    splitting: false,
    target: 'node18',
});
```

### Basic Test File
```typescript
// src/test/my-feature.test.ts
import { describe, it, expect } from 'vitest';
import { MyClass } from '../my-class.js';

describe('MyClass', () => {
    it('should work correctly', () => {
        const instance = new MyClass();
        expect(instance.method()).toBe('expected');
    });
});
```

---

## 🎨 Windsurf IDE Tips

### Keyboard Shortcuts
- **Ctrl/Cmd + P**: Quick file finder
- **Ctrl/Cmd + Shift + P**: Command palette
- **Ctrl/Cmd + Shift + F**: Search across all files
- **F12**: Go to definition (works across packages!)
- **Shift + F12**: Find all references

### Workspace Features
- **Multi-root workspace**: Each package can have its own settings
- **Integrated terminal**: Run commands from any package directory
- **Auto-imports**: Suggests imports from both local and external packages
- **Type checking**: Real-time errors across entire monorepo

### Extensions to Enable
- **TypeScript and JavaScript Language Features** (built-in)
- **ESLint** (if you add it to the project)
- **GitLens** (for better git integration)

---

## 🆘 Getting Help

### Error Message Patterns
```bash
# Module not found
Error: Cannot find module '@platform/configuration'
→ Run: pnpm build

# Type errors
Type error: Property 'x' does not exist
→ Check: Import paths and package builds

# Build failures
Build failed with exit code 1
→ Check: TypeScript errors, missing dependencies
```

### Useful Commands for Debugging
```bash
# See what packages are available
pnpm list --depth=0

# Check specific package dependencies
pnpm list --filter @platform/configuration

# See build output
pnpm build --verbose

# Check workspace configuration
cat pnpm-workspace.yaml
```

### Resources
- **Project docs**: `docs/` folder
- **Package examples**: Look at `packages/configuration` for patterns
- **Turborepo docs**: https://turbo.build/repo/docs
- **pnpm docs**: https://pnpm.io/
- **tsup docs**: https://tsup.egoist.dev/
