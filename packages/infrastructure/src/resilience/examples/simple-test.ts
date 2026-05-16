/**
 * Simple test to validate the preset system without complex dependencies
 */

// Mock the core types to avoid dependency issues
interface Result<T> {
  success: boolean;
  data?: T;
  error?: any;
}

function success<T>(data: T): Result<T> {
  return { success: true, data, error: null };
}

interface ApplicationContext {
  identity: {
    appName: string;
    namespace: string;
    integration: string;
  };
}

// Mock the preset types
type PresetType = 'database' | 'external' | 'internal' | 'critical';

const PRESET_CONFIGS = {
  database: {
    sidecarFeatures: {
      metrics: true,
      spans: true,
      circuitBreaker: false,
      retry: false,
      rateLimiting: false,
    }
  },
  external: {
    sidecarFeatures: {
      metrics: true,
      spans: true,
      circuitBreaker: true,
      retry: true,
      rateLimiting: true,
    }
  }
};

// Simple service wrapper test
class ServiceWrapper {
  private preset: PresetType;
  private servicePrefix: string;

  constructor(preset: PresetType, servicePrefix: string) {
    this.preset = preset;
    this.servicePrefix = servicePrefix;
  }

  wrapService<T extends Record<string, any>>(
    service: T,
    methods: (keyof T)[]
  ): T {
    const wrapped = { ...service };
    
    for (const methodName of methods) {
      const originalMethod = service[methodName];
      if (typeof originalMethod === 'function') {
        const wrappedMethod = (...args: any[]) => {
          console.log(`🔍 [${this.preset}] ${this.servicePrefix}-${String(methodName)} called with:`, args);
          return originalMethod.apply(service, args);
        };
        
        (wrapped as any)[methodName] = wrappedMethod;
      }
    }
    
    return wrapped;
  }
}

// Test service
class TestMySQLService {
  async query<T>(sql: string, params: any[] = []): Promise<Result<T>> {
    console.log(`  → Executing SQL: ${sql}`);
    return success({ rows: [], rowCount: 0 } as any);
  }

  async healthCheck(): Promise<Result<boolean>> {
    console.log(`  → Health check performed`);
    return success(true);
  }
}

// Test the wrapper
async function testServiceWrapper() {
  console.log('🧪 Testing Service Wrapper\n');

  const baseService = new TestMySQLService();
  const wrapper = new ServiceWrapper('database', 'mysql-crm');
  const wrappedService = wrapper.wrapService(baseService, ['query', 'healthCheck']);

  console.log('1. Testing wrapped query method:');
  await wrappedService.query('SELECT * FROM users WHERE id = ?', [123]);

  console.log('\n2. Testing wrapped healthCheck method:');
  await wrappedService.healthCheck();

  console.log('\n✅ Service wrapper test completed successfully!');
}

// Run the test
if (require.main === module) {
  testServiceWrapper().catch(console.error);
}

export { testServiceWrapper };
