# Coding Standards

## File Naming Conventions

### Source Files
- **TypeScript files**: `kebab-case.ts`
    - `user-service.ts`
    - `intent-property-parser.ts`
    - `webhook-validator.ts`

### Special Files
- **Type definitions**: `[name].types.ts` or `types.ts`
- **Constants**: `[name].constants.ts` or `constants.ts`
- **Configuration**: `[name].config.ts`
- **Interfaces**: Include in `.types.ts` files

## 🏗️ Code Organization: Package by Feature

**ALWAYS organize code by feature/domain, NOT by technical layer.**

```typescript
// ✅ REQUIRED: Package by Feature
src/
  users/
    user.service.ts
    user.repository.ts
    user.types.ts
    user.validator.ts
    dispatcher-api.ts
  orders/
    order.service.ts
    order.repository.ts
    order.types.ts
    dispatcher-api.ts
  payments/
    payment.service.ts
    payment.repository.ts
    payment.types.ts
    dispatcher-api.ts

// ❌ FORBIDDEN: Package by Layer
src/
  services/
    user.service.ts
    order.service.ts
    payment.service.ts
  repositories/
    user.repository.ts
    order.repository.ts
    payment.repository.ts
  types/
    user.types.ts
    order.types.ts
    payment.types.ts
```

**Why Package by Feature:**
- **Cohesion** - Related code stays together
- **Easier to find** - Everything for a feature is in one place
- **Easier to modify** - Changes to a feature are localized
- **Team ownership** - Teams can own entire feature directories
- **Easier to extract** - Features can become separate packages/services

## ⚠️ Critical Rule: No Import Side-Effects

**NEVER allow code to execute during import/require.**

```typescript
// ❌ FORBIDDEN: Code executes when module is imported
console.log('This runs on import!'); // Don't do this
const config = loadConfigFromFile(); // Don't do this
database.connect(); // Don't do this

// ❌ FORBIDDEN: Top-level async operations
await someAsyncOperation(); // Don't do this

// ❌ FORBIDDEN: Immediate function execution
(function() {
  // This runs on import
})();

// ✅ REQUIRED: Only declarations and exports at module level
export class UserService {
  // Implementation
}

export function createUser(data: UserData): User {
  // Implementation
}

// ✅ REQUIRED: Lazy initialization when needed
let configCache: Config | null = null;

export function getConfig(): Config {
  if (!configCache) {
    configCache = loadConfigFromFile(); // Only loads when called
  }
  return configCache;
}
```

**Why this matters:**
- **Predictable imports** - Importing a module should never cause side effects
- **Testability** - Tests can import modules without triggering unwanted behavior
- **Performance** - Avoids expensive operations during module loading
- **Debugging** - Makes it clear when and where code executes

## Code Naming Conventions

### Classes and Interfaces
- **PascalCase** for classes, interfaces, types
```typescript
class UserService { }
interface UserProfile { }
type UserRole = 'admin' | 'user';
```

### Functions and Variables
- **camelCase** for functions, methods, variables, and parameters
```typescript
function calculateTotal(items: Item[]): number { }
const userAge = 25;
let isActive = true;
```

### Constants
- **UPPER_SNAKE_CASE** for true constants
- **camelCase** for const objects/arrays
```typescript
const MAX_RETRY_ATTEMPTS = 3;
const API_TIMEOUT_MS = 5000;
const defaultConfig = { retries: 3 }; // mutable object
```

## Naming Standards (Enforceable Now)

### Variables & Functions
```typescript
// ✅ REQUIRED: camelCase for variables and functions
const userName = 'john_doe';
const fileCount = 42;

function processFile(filePath: string): Result<ProcessedFile> {}
async function validateUserInput(input: UserInput): Promise<ValidationResult> {}
```

### Classes & Interfaces
```typescript
// ✅ REQUIRED: PascalCase for classes and interfaces
class FileProcessor {
  constructor(private storage: StorageInterface) {}
}

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
}

// ✅ REQUIRED: Prefix interfaces with 'I' only if needed for disambiguation
interface IUserRepository {} // Only when you also have a UserRepository class
```

### Constants & Enums
```typescript
// ✅ REQUIRED: UPPER_SNAKE_CASE for module-level constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_TIMEOUT = 30000;

// ✅ PREFERRED: Use const objects instead of enums
const PROCESSING_STATUS = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
} as const;

// Create type from const object
type ProcessingStatus = typeof PROCESSING_STATUS[keyof typeof PROCESSING_STATUS];

// Usage
function updateStatus(status: ProcessingStatus) {
  if (status === PROCESSING_STATUS.COMPLETED) {
    // Handle completion
  }
}

// ❌ AVOID: TypeScript enums (we don't use these)
// enum ProcessingStatus {
//   PENDING = 'PENDING',
//   // ... Don't use enums
// }
```

### File & Directory Names
```typescript
// ✅ REQUIRED: kebab-case for files and directories
user-service.ts
file-processor.ts
webhook-handler.ts

// ✅ REQUIRED: Descriptive, specific names
email-validator.ts     // Not: validator.ts
user-repository.ts     // Not: repository.ts
payment-processor.ts   // Not: processor.ts
```

These standards prioritize clarity, maintainability, and type safety while staying practical for day-to-day development.
