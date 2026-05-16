# Team Onboarding Documentation

Welcome to the k8s-hello-world project! This documentation will help your team get up to speed with our modern TypeScript monorepo architecture.

## 📚 Documentation Overview

### 🚀 Start Here
- **[Team Onboarding Guide](./team-onboarding.md)** - Complete introduction to the project architecture, tools, and concepts
- **[Quick Reference](./quick-reference.md)** - Essential commands, patterns, and troubleshooting

### 📖 Detailed Guides  
- **[Development Workflows](./development-workflows.md)** - Day-to-day development patterns, testing, and best practices

### 🏗️ Architecture Documentation
- **[Architecture Overview](./architecture/)** - System design and architectural decisions
- **[Batch Processing](./batch-processing/)** - Batch processing pipeline documentation
- **[Analysis](./analysis/)** - Technical analysis and comparisons

## 🎯 Learning Path

### Day 1: Get Running (30 minutes)
1. Read the **Quick Start** section in [Team Onboarding Guide](./team-onboarding.md)
2. Clone the repo and run `pnpm install && pnpm build`
3. Bookmark the [Quick Reference](./quick-reference.md)

### Week 1: Core Concepts
1. Complete the **Essential Concepts** section in [Team Onboarding Guide](./team-onboarding.md)
2. Practice the **Daily Development Workflows** from [Development Workflows](./development-workflows.md)
3. Watch the recommended videos in the **Learning Resources** section

### Week 2: Advanced Usage
1. Try creating a new package following the patterns
2. Practice the **Testing Strategies** from [Development Workflows](./development-workflows.md)
3. Explore the **Advanced Patterns** section

## 🛠️ Key Technologies

This project uses a modern TypeScript monorepo stack:

- **[pnpm](https://pnpm.io/)** - Fast, efficient package manager with workspace support
- **[Turborepo](https://turbo.build/)** - Build system for JavaScript/TypeScript monorepos
- **[tsup](https://tsup.egoist.dev/)** - Fast TypeScript bundler powered by esbuild
- **[Vitest](https://vitest.dev/)** - Fast unit testing framework
- **[Kubernetes](https://kubernetes.io/)** - Container orchestration (deployment target)

## 🆘 Getting Help

### Quick Help
- **Build issues**: Check [Quick Reference - Troubleshooting](./quick-reference.md#-debugging-checklist)
- **Common errors**: See [Development Workflows - Troubleshooting Guide](./development-workflows.md#-troubleshooting-guide)

### Learning Resources
- **pnpm workspaces**: https://pnpm.io/workspaces
- **Turborepo docs**: https://turbo.build/repo/docs
- **TypeScript handbook**: https://www.typescriptlang.org/docs/

### Team Support
- Ask questions in team chat with specific error messages
- Look at existing packages (`packages/configuration`, `packages/core`) for patterns
- Reference the troubleshooting sections in our documentation

## 🎉 Success Indicators

You'll know you're ready to be productive when:

- ✅ You can run `pnpm build` and `pnpm dev` successfully
- ✅ You understand the difference between packages and services
- ✅ You can add dependencies using `workspace:*` protocol
- ✅ Auto-imports work in Windsurf for both external and internal packages
- ✅ You can create a simple new package following our patterns

## 🔄 Keeping Up to Date

This documentation evolves with the project. Key things to watch:

- **New packages**: Follow established patterns in `packages/` directory
- **Build changes**: Check `turbo.json` and package.json scripts
- **Dependencies**: Use `pnpm outdated` to check for updates
- **Architecture decisions**: Documented in `docs/architecture/`

---

**Remember**: This k8s-hello-world project is a stepping stone toward our production Kubernetes deployment with Helm and Terraform. The patterns you learn here will directly apply to our final architecture.
