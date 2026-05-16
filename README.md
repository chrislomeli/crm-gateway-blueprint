# HubSpot Webhook Processing Pipeline with Contact-Level Distributed Tracing

A production-ready Kubernetes infrastructure setup that provides enterprise-grade observability for HubSpot webhook processing with contact-centric distributed tracing.

## 🏗️ Architecture

This project demonstrates a complete HubSpot webhook processing pipeline with:

- **Contact-Level Distributed Tracing** - Track individual contacts through the entire processing pipeline
- **TypeScript Monorepo** with shared packages and services
- **HubSpot Integration** - Process webhook events and extract intents
- **Configurable Observability** - Support for Console, Datadog, and OpenTelemetry providers
- **AWS Services Integration** - SQS message processing with LocalStack for development
- **Production-Ready Infrastructure** - Health checks, graceful degradation, and comprehensive configuration

## 🚀 Quick Start

### Prerequisites

- Docker Desktop
- Kind (Kubernetes in Docker)
- kubectl
- pnpm`
- Node.js 18+

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone <your-repo-url>
   cd k8s.md-hello-world
   pnpm install
   ```

2. **Build packages:**
   ```bash
   pnpm build
   ```

3. **Create Kind cluster:**
   ```bash
   kind create cluster --name hello-cluster
   ```

4. **Deploy infrastructure:**
   ```bash
   # Deploy all services
   kubectl apply -f k8s.md/mysql/deployment.yaml
   kubectl apply -f k8s.md/elasticsearch/deployment.yaml
   kubectl apply -f k8s.md/kibana/deployment.yaml
   # Other services should already be deployed from previous sessions
   ```

5. **Set up port forwarding for external access:**
   ```bash
   # PostgreSQL (current active database)
   kubectl port-forward -n data-pipeline deployment/postgres 5432:5432 &

   # MySQL (for TurboGit migration)
   kubectl port-forward -n data-pipeline mysql-0 3307:3306 &

   # Elasticsearch
   kubectl port-forward -n data-pipeline deployment/elasticsearch 9200:9200 &

   # Kibana
   kubectl port-forward -n data-pipeline deployment/kibana 5601:5601 &
   ```

## 📊 Services Overview

### Core Processing Services

| Service | Purpose | Tracing |
|---------|---------|---------|
| **Simple Publisher** | Receives HubSpot webhooks, generates contactTraceId, sends to SQS | ✅ Contact-level spans |
| **Webhook Subscriber** | Processes SQS messages, validates and transforms webhook events | ✅ Contact-level spans |
| **Intent Subscriber** | Extracts intents from processed webhook events | ✅ Contact-level spans |

### Infrastructure Services

| Service | External Access | Purpose |
|---------|----------------|---------|
| **LocalStack** | `127.0.0.1:4566` | AWS service emulation (SQS, S3, Secrets Manager) |
| **PostgreSQL** | `127.0.0.1:5432` | Database for configuration and state |
| **MySQL** | `127.0.0.1:3307` | Secondary database for specific integrations |

### Observability Features

- **Contact-Level Tracing**: Each contact gets a unique `contactTraceId` for end-to-end tracking
- **Configurable Providers**: Console (dev), Datadog (prod), OpenTelemetry (future)
- **Health Monitoring**: Comprehensive health checks with graceful degradation
- **Business Context**: Rich span attributes with portal IDs, object IDs, and operation types

## 🔧 Development

### Connecting to Databases

```bash
# PostgreSQL (active database)
psql -h 127.0.0.1 -p 5432 -U pipeline_user -d pipeline

# MySQL (for new projects)
mysql -h 127.0.0.1 -P 3307 -u external -ppassword
```

### Accessing Web UIs

- **Kibana**: http://127.0.0.1:5601
- **Elasticsearch**: http://127.0.0.1:9200/_cluster/health

### Monitoring

```bash
# Check all pods
kubectl get pods -n data-pipeline

# View pipeline worker logs
kubectl logs -n data-pipeline -l app=pipeline-worker -f

# Check database connectivity
kubectl exec -n data-pipeline deployment/postgres -- psql -U pipeline_user -d pipeline -c "SELECT 1;"
```

## 📁 Project Structure

```
k8s-hello-world/
├── packages/                    # Shared TypeScript packages
│   ├── configuration/          # Configuration utilities
│   ├── database/               # Database client library
│   └── tsup-config/            # Build configuration
├── services/                   # Microservices
│   ├── helloworld/            # Example web service
│   └── pipeline-worker/       # Message processing service
├── k8s/                       # Kubernetes manifests
│   ├── mysql/                 # MySQL StatefulSet
│   ├── elasticsearch/         # Elasticsearch deployment
│   ├── kibana/               # Kibana deployment
│   └── pipeline-worker/      # Pipeline worker deployment
└── scripts/                  # Deployment and utility scripts
```

## 🛠️ Key Technologies

- **Kubernetes**: Container orchestration (Kind for local development)
- **TypeScript**: Type-safe application development
- **PostgreSQL**: Primary relational database
- **MySQL**: Secondary database for migrations
- **Elasticsearch**: Search and analytics engine
- **Kibana**: Data visualization
- **LocalStack**: AWS service emulation
- **SQS**: Message queuing
- **Docker**: Containerization
- **pnpm**: Package management
- **Turbo**: Monorepo build system

## 🔍 Troubleshooting

### Common Issues

1. **Port Conflicts**: If you have local MySQL/PostgreSQL running, they may conflict with port forwarding
2. **Kind Networking**: NodePorts don't work reliably on macOS - use port-forwarding instead
3. **MySQL Authentication**: Use MySQL 8.0 with `mysql_native_password` for client compatibility

### Useful Commands

```bash
# Restart port forwarding
pkill -f "kubectl port-forward"
# Then restart the port-forward commands above

# Reset MySQL if needed
kubectl delete statefulset mysql -n data-pipeline
kubectl delete pvc mysql-storage-mysql-0 -n data-pipeline
kubectl apply -f k8s.md/mysql/deployment.yaml

# Check service endpoints
kubectl get endpoints -n data-pipeline
```

## 🚀 Production Deployment

This setup is designed to be production-ready and can be deployed to EKS with minimal changes:

1. Replace `kubectl port-forward` with LoadBalancer services
2. Use managed databases (RDS) for production workloads
3. Configure proper secrets management
4. Set up monitoring and logging
5. Implement backup strategies

## 📝 Migration Notes

This infrastructure was specifically designed to support migrating from docker-compose setups (like TurboGit) to Kubernetes while maintaining the same development experience.

### Key Design Decisions

- **StatefulSets for databases**: Provides persistent storage and stable network identities
- **Port-forwarding over NodePorts**: More reliable on local Kind clusters
- **Multiple database support**: Allows gradual migration from PostgreSQL to MySQL or vice versa
- **Bundled TypeScript builds**: Solves monorepo module resolution issues in containers

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally with Kind
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details
