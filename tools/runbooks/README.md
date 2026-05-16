# Testing Framework

This directory contains organized testing utilities and scripts for sanity testing the k8s-hello-world project.

## Structure

```
testing/
├── infrastructure/     # Infrastructure component testing (pods, services, networking)
├── configuration/      # Configuration and secret management testing
├── batch-processing/   # Batch processing pipeline testing
└── shared/            # Common utilities and helper functions
```

## Usage

Testing scripts are referenced by Windsurf workflows in `.windsurf/workflows/`:
- `/test-infrastructure` → Uses scripts from `testing/infrastructure/`
- `/test-configuration` → Uses scripts from `testing/configuration/`
- `/test-batch-dispatcher` → Uses scripts from `testing/batch-processing/`

## Design Principles

- **Separation of Concerns**: Control plane (workflows) separate from implementation (scripts)
- **Reusability**: Scripts can be used by multiple workflows or run independently
- **Production Ready**: All utilities designed for eventual CI/CD integration
- **Discoverability**: Clear organization makes testing utilities easy to find

## Running Tests

Each script is designed to be run independently or as part of a workflow:

```bash
# Run individual test
./testing/configuration/dump-secrets.ts

# Run via workflow
# In Windsurf: "Let's open up the configuration test"
```
