# Team Onboarding Guide: Modern TypeScript Monorepo

## 🚀 Quick Start (5 minutes)

### Prerequisites
- **Node.js 18+** (check with `node --version`)
- **pnpm** (install with `npm install -g pnpm`)
- **Windsurf IDE** (you already have this!)

### Get Running
```bash
# Clone and setup
git clone <repo-url>
cd k8s.md-hello-world

# Install all dependencies (this is different from npm!)
pnpm install

# Build everything
pnpm build

# Start development mode
pnpm dev
```

**🎉 That's it!** The monorepo will build all packages and services automatically.

---

## 🧠 Mental Model: What's Different Here

If you're coming from traditional Node.js projects, here are the key mindset shifts:

### 1. **One Repo, Many Packages** (Monorepo)
```
k8s-hello-world/
├── packages/           # Shared libraries
│   ├── configuration/  # @platform/configuration
│   ├── core/          # @platform/core  
│   └── connectors/ # @platform/connectors
└── services/          # Applications
    ├── webhook-subscriber/
    └── batch-loader/
```

**Key Insight**: Each folder in `packages/` and `services/` is its own npm package with its own `package.json`.

### 2. **pnpm Instead of npm**
- **Faster**: Shared dependencies across packages
- **Efficient**: No duplicate `node_modules`
- **Workspace-aware**: Handles internal package dependencies automatically

### 3. **Turborepo Orchestration**
- **Smart builds**: Only rebuilds what changed
- **Dependency-aware**: Builds packages in correct order
- **Parallel execution**: Runs multiple builds simultaneously

### 4. **tsup for Lightning-Fast TypeScript**
- **No webpack complexity**: Simple, fast TypeScript compilation
- **ESM-first**: Modern JavaScript modules
- **Type definitions**: Automatic `.d.ts` generation

---

## 📚 Essential Concepts

### Package Dependencies: `workspace:*`

In any `package.json`, you'll see:
```json
{
  "dependencies": {
    "@platform/configuration": "workspace:*",
    "@platform/core": "workspace:*"
  }
}
```

**What this means**: "Use the local version of this package from our monorepo"

### Import Paths
```typescript
// ✅ Import from local packages
import { ConfigProvider } from '@platform/configuration';
import { Logger } from '@platform/core';

// ✅ Relative imports within same package
import { helper } from './utils/helper';
```

### Build Pipeline
```bash
pnpm build    # Builds all packages in dependency order
pnpm dev      # Starts all services in watch mode
pnpm clean    # Removes all build artifacts
```

---

## 🛠️ Daily Development Workflows

### Working on a Single Package
```bash
# Navigate to specific package
cd packages/configuration

# Run package-specific commands
pnpm build        # Build just this package
pnpm test         # Test just this package
pnpm test:watch   # Test in watch mode
```

### Adding Dependencies

**External dependency** (like lodash):
```bash
cd packages/configuration
pnpm add lodash
pnpm add -D @types/lodash  # TypeScript types
```

**Internal dependency** (another package in monorepo):
```bash
cd services/webhook-subscriber
pnpm add @platform/configuration@workspace:*
```

### Creating New Packages

1. **Create folder structure**:
```bash
mkdir packages/my-new-package
cd packages/my-new-package
```

2. **Create `package.json`** (copy from existing package and modify):
```json
{
  "name": "@crm/my-new-package",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "clean": "rm -rf dist node_modules"
  }
}
```

3. **Create `tsup.config.ts`** (copy from existing package)

4. **Run `pnpm install`** from root to register the new package

### Debugging Build Issues

**Problem**: "Module not found"
```bash
# Solution: Rebuild dependencies
pnpm build
```

**Problem**: "Type errors in imported package"
```bash
# Solution: Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

**Problem**: "Changes not reflected"
```bash
# Solution: Check if you're in dev mode
pnpm dev  # This watches for changes
```

---

## 🎯 Windsurf IDE Tips

### Workspace Navigation
- **Ctrl/Cmd + P**: Quick file finder works across all packages
- **Ctrl/Cmd + Shift + F**: Search across entire monorepo
- **Go to Definition**: Works seamlessly across package boundaries

### TypeScript Integration
- **Auto-imports**: Windsurf automatically suggests imports from local packages
- **Type checking**: Real-time errors across all packages
- **Refactoring**: Rename/move works across package boundaries

### Terminal Integration
```bash
# Run commands from any directory
pnpm --filter @platform/configuration build
pnpm --filter webhook-subscriber test
```

---

## 📖 Learning Resources

### Essential Reading (30 minutes total)

1. **pnpm Workspaces** (10 min): https://pnpm.io/workspaces
   - Focus on: workspace protocol, filtering commands

2. **Turborepo Basics** (10 min): https://turbo.build/repo/docs/core-concepts/monorepos
   - Focus on: pipeline configuration, caching

3. **tsup Quick Start** (10 min): https://tsup.egoist.dev/
   - Focus on: configuration options, ESM output

### Video Resources
- **"Monorepos Explained"** by Fireship (5 min): https://youtu.be/9iU_IE6vnJ8
- **"pnpm vs npm"** comparison (8 min): https://youtu.be/hiTmX2dW84E

### When You Need Help
1. **Check existing packages**: Look at `packages/configuration` or `packages/core` for patterns
2. **Turborepo docs**: https://turbo.build/repo/docs
3. **pnpm CLI reference**: https://pnpm.io/cli/add
4. **Team Slack/Discord**: Ask for help with specific error messages

---

## 🚨 Common Gotchas

### 1. **Don't use `npm` commands**
```bash
# ❌ Wrong
npm install
npm run build

# ✅ Correct  
pnpm install
pnpm build
```

### 2. **Package names must match directory structure**
```bash
# ❌ Wrong
packages/config/package.json → "name": "@platform/configuration"

# ✅ Correct
packages/configuration/package.json → "name": "@platform/configuration"
```

### 3. **Always use `workspace:*` for internal dependencies**
```json
// ❌ Wrong
"@platform/core": "1.0.0"

// ✅ Correct
"@platform/core": "workspace:*"
```

### 4. **Build order matters**
If package A depends on package B, build B first. Turborepo handles this automatically with `pnpm build`.

---

## 🎉 Success Indicators

You'll know you're getting it when:

- ✅ You can navigate between packages seamlessly in Windsurf
- ✅ Auto-imports work for both external and internal packages  
- ✅ You understand when to use `pnpm --filter` vs regular `pnpm`
- ✅ Build errors make sense (usually missing dependencies or build order)
- ✅ You can create new packages following the established patterns

---

## 🔄 Next Steps

1. **Week 1**: Get comfortable with basic workflows (build, test, add dependencies)
2. **Week 2**: Try creating a simple new package
3. **Week 3**: Understand the build pipeline and optimization
4. **Ongoing**: Contribute to architecture decisions and patterns

**Remember**: This is a stepping stone to production Kubernetes deployment. The patterns you learn here will directly apply to our final Helm/Terraform architecture.
