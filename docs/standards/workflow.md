# Workflow Standards

## Git Workflow & Branching

### 🧬 Branching Strategy

We use a branch naming convention that balances Jira ticket traceability, developer identity, and workflow clarity. **The Jira ticket ID must be the first component of the branch name**, as enforced by acme's tooling and expectations:

```
<jira-ticket>-<type>-<devname>-<short-description>
```

**Examples:**
```bash
BLUE-123-feature-alice-user-authentication
BLUE-456-bugfix-bob-memory-leak-fix
BLUE-789-hotfix-charlie-security-patch
```

**Branch Types:**
- `feature` - New functionality
- `bugfix` - Bug fixes
- `hotfix` - Critical production fixes
- `chore` - Maintenance tasks, dependency updates
- `docs` - Documentation changes

### 🔄 Git Flow Process

#### 1. Feature Development
```bash
# Start from latest develop
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b BLUE-123-feature-alice-user-auth

# Work and commit
git add .
git commit -m "feat(auth): implement JWT token validation"

# Push and create PR
git push origin BLUE-123-feature-alice-user-auth
```

#### 2. Code Review & Merge
- All changes require PR review
- Squash merge into `develop`
- Delete feature branch after merge

#### 3. Release Process
```bash
# Create release branch from develop
git checkout develop
git pull origin develop
git checkout -b release/v1.2.0

# Final testing and bug fixes on release branch
# Merge to main when ready
git checkout main
git merge --no-ff release/v1.2.0
git tag v1.2.0

# Merge back to develop
git checkout develop
git merge --no-ff release/v1.2.0
```

#### 4. Hotfix Process
```bash
# Create hotfix from main
git checkout main
git pull origin main
git checkout -b BLUE-002-hotfix-security-patch

# Fix and test
git commit -m "fix(security): patch XSS vulnerability"

# Merge to main and develop
git checkout main
git merge --squash BLUE-002-hotfix-security-patch
git push origin main

git checkout develop
git merge --squash BLUE-002-hotfix-security-patch
git push origin develop

# Clean up
git branch -d BLUE-002-hotfix-security-patch
```

## Commit Messages & Semantic Versioning

### 📝 Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/) to enable automated changelog generation and semantic versioning:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**
- `feat` - New feature (minor version bump)
- `fix` - Bug fix (patch version bump)
- `docs` - Documentation changes
- `style` - Code style changes (formatting, etc.)
- `refactor` - Code refactoring without feature changes
- `perf` - Performance improvements
- `test` - Adding or updating tests
- `chore` - Maintenance tasks, dependency updates
- `ci` - CI/CD changes

**Examples:**
```bash
feat(auth): add JWT token validation
fix(parser): handle malformed CSV headers
docs(api): update endpoint documentation
refactor(cache): extract Redis client to separate module
perf(query): optimize database query performance
test(user): add integration tests for user creation
chore(deps): update dependencies to latest versions
```

### 🏷️ Breaking Changes

For breaking changes, add `!` after the type or include `BREAKING CHANGE:` in the footer:

```bash
feat(api)!: remove deprecated user endpoints

BREAKING CHANGE: The /api/v1/users endpoint has been removed.
Use /api/v2/users instead.
```

