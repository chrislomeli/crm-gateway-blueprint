# HubSpot Webhook Processor - Architecture Design

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          AWS Cloud                                   │
│                                                                      │
│  ┌──────────────┐        ┌──────────────┐       ┌────────────────┐ │
│  │   HubSpot    │        │ API Gateway  │       │   SQS Queue    │ │
│  │  Webhooks    │───────▶│              │──────▶│                │ │
│  └──────────────┘        └──────────────┘       └───────┬────────┘ │
│                                                          │          │
│                              ECS Fargate Cluster         ▼          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                                                             │   │
│  │  ┌─────────────────────────────────────────────────────┐  │   │
│  │  │                 ECS Container                        │  │   │
│  │  │                                                      │  │   │
│  │  │  ┌─────────────┐   ┌──────────────────────────┐    │  │   │
│  │  │  │   Message    │   │   Concurrent Processor   │    │  │   │
│  │  │  │   Poller     │──▶│   (10 messages max)     │    │  │   │
│  │  │  │ (SQS Client) │   └────────────┬─────────────┘    │  │   │
│  │  │  └─────────────┘                 │                  │  │   │
│  │  │                                   ▼                  │  │   │
│  │  │  ┌─────────────────────────────────────────────┐    │  │   │
│  │  │  │            Route Decision                   │    │  │   │
│  │  │  │         (Check Redis Cache)                 │    │  │   │
│  │  │  └──────────────┬────────────┬─────────────────┘    │  │   │
│  │  │                  │            │                      │  │   │
│  │  │         Route A  │            │  Route B            │  │   │
│  │  │        (No API)  │            │  (AI API)           │  │   │
│  │  │                  ▼            ▼                      │  │   │
│  │  │  ┌──────────────────┐  ┌─────────────────────┐     │  │   │
│  │  │  │ Normal Process   │  │  Bottleneck (5 max) │     │  │   │
│  │  │  │                  │  │         ↓           │     │  │   │
│  │  │  └──────────┬───────┘  │  Opossum (Circuit) │     │  │   │
│  │  │             │          │         ↓           │     │  │   │
│  │  │             │          │   REST Client       │     │  │   │
│  │  │             │          │   (Retry logic)     │     │  │   │
│  │  │             │          └─────────┬───────────┘     │  │   │
│  │  │             │                    │                  │  │   │
│  │  │             ▼                    ▼                  │  │   │
│  │  │  ┌─────────────────────────────────────────────┐    │  │   │
│  │  │  │           Database Writer                   │    │  │   │
│  │  │  │        (All messages saved)                 │    │  │   │
│  │  │  └─────────────────────────────────────────────┘    │  │   │
│  │  │                                                      │  │   │
│  │  └──────────────────────────────────────────────────────┘  │   │
│  │                                                             │   │
│  │  Auto-scaling: 10-200 containers based on queue depth      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────┐       ┌──────────────┐      ┌────────────────┐  │
│  │    Redis      │       │   RDS/Aurora │      │  CloudWatch    │  │
│  │              │       │              │      │   Logs         │  │
│  │ • Route Cache│       │ • Results    │      │ • All outcomes │  │
│  │ • Rate Limits│       │              │      │                │  │
│  └──────────────┘       └──────────────┘      └────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Basic Outline

### 1. **Webhook Ingestion**
- HubSpot sends webhooks to API Gateway
- API Gateway validates and forwards to SQS
- SQS acts as buffer for burst traffic

### 2. **ECS Processing Service**
- **Container Configuration**
    - 2GB RAM, 1 vCPU per container
    - Auto-scales 10-200 containers based on queue depth
    - Each container processes up to 10 messages concurrently

- **Message Processing Flow**
  ```
  For each message:
  1. Check Redis cache for routing decision
  2. If Route A (no AI needed):
     - Process immediately
     - Write to database
  3. If Route B (AI needed):
     - Enter Bottleneck queue (max 5 concurrent)
     - Opossum circuit breaker check
     - REST client makes API call with retries
     - Write to database
  ```

### 3. **Concurrency Management**
- **Bottleneck**: Limits to 5 concurrent AI API calls per container
- **Opossum**: Circuit breaker prevents calls when API is down
- **REST Client**: Handles retry logic with exponential backoff

### 4. **Data Storage**
- **Redis**: Routing cache + Bottleneck rate limiting
- **RDS/Aurora**: Final processed results
- **CloudWatch Logs**: All processing outcomes

### 5. **Error Handling**
- SQS retry: 3 attempts before Dead Letter Queue
- Circuit breaker: Fails fast when API is down
- All failures logged to CloudWatch

## Key Design Decisions

1. **Single Queue Architecture** (MVP approach)
    - Simpler to implement in 3 weeks
    - All routing logic in one service
    - Can evolve to multi-queue later

2. **In-Container Concurrency**
    - 10 messages processed in parallel
    - Only 5 AI API calls at once
    - Non-AI messages never blocked

3. **Existing Package Usage**
    - Bottleneck for concurrency control
    - Opossum for circuit breaking
    - Your existing REST client for retries

4. **Shared Redis**
    - One Redis instance for all caching needs
    - Namespaced keys for different purposes
    - Cost-effective and simple

## Performance Characteristics

- **Throughput**:
    - 100 containers × 10 messages = 1,000 concurrent messages
    - AI API limited to 500 concurrent calls (100 × 5)

- **Latency**:
    - Route A: ~50-100ms (DB write only)
    - Route B: 1-30s (depends on AI API)

- **Scalability**:
    - Horizontal scaling via ECS
    - Can handle significant bursts via SQS buffering

## Next Steps for Implementation

1. Set up SQS queue with DLQ
2. Create ECS task definition with environment variables
3. Implement message processor with Bottleneck/Opossum
4. Add Redis caching layer
5. Set up auto-scaling policies
6. Add CloudWatch monitoring

This design balances simplicity with performance, allowing you to ship in 3 weeks while maintaining good architectural practices.