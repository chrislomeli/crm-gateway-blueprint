3. Deploy applications:
   ```bash
   kubectl apply -k k8s/overlays/sandbox/
eks-deployment/
├── terraform/           # Infrastructure as Code
├── k8s/                # Kubernetes manifests
│   ├── base/           # Base configurations
│   └── overlays/       # Environment-specific configs
└── .github/            # CI/CD workflows
