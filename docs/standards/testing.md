# Testing Standards

## Test Organization

### Unit Tests
**Option 1 - Colocated (Recommended)**
```
src/
  users/
    user.service.ts
    user.service.test.ts
    user.repository.ts
    user.repository.test.ts
```

**Option 2 - Separate test folder**
```
src/
  users/
    user.service.ts
    test/
      user.service.test.ts
```

### Integration & E2E Tests
Always in separate test directories:
```
test/
  integration/
    user-flow.int.ts
    database-operations.int.ts
  e2e/
    complete-journey.e2e.ts
  fixtures/
    sample-users.json
  helpers/
    test-database.ts
```

## File Naming Conventions

### Test Files
- **Unit tests**: `[name].test.ts` (colocated with source)
    - `user-service.test.ts`
- **Integration tests**: `[name].int.ts` (in test/ directory)
    - `user-flow.int.ts`
- **E2E tests**: `[name].e2e.ts` (in test/e2e/ directory)
    - `complete-journey.e2e.ts`

---

These testing standards focus on file organization and naming conventions specific to our project structure.
