# Blueprint Project: Getting Started Guide

This document provides a comprehensive guide to getting started with the Blueprint project. It covers the essential steps for setting up and working with the core components of the system.

## Learning Path

For the best learning experience, we recommend following this progression:

1. **Environment Setup**
   - Set up your local development environment with Docker and LocalStack
   - Understand the project structure and core components
   - Learn about Blueprint's configuration management approach

2. **Configuration Management**
   - Deploy and validate configuration for shared infrastructure and applications
   - Work with secrets and understand secret resolution
   - Learn how to test and troubleshoot configuration issues

3. **Application Development**
   - Create a new application with proper context providers
   - Understand how applications access and use configuration
   - Build and run your application locally

4. **Batch Processing Pipeline**
   - Learn about the batch processing architecture
   - Implement batch importers for CRM data
   - Use the file discovery service to scan for new files
   - Create file processors to transform and store data

5. **Advanced Topics**
   - Work with pub/sub pipelines
   - Implement webhooks and external integrations
   - Explore observability and monitoring features

## Table of Contents

### 1. Setting up a New Application
- [Complete Guide to Setting Up a New Application](building-an-application.md)
  - Environment setup with Docker
  - Creating a context provider
  - Configuration management
  - Building and running your application

### 2. Configuration Management
- [Configuration Workshop](configuration-workshop.md)
  - Understanding Blueprint's configuration architecture
  - Deploying and modifying configuration
  - Working with secrets management
  - Troubleshooting configuration issues
  - Extending configuration for new features
- [Configuration Strategy Overview](configuration-strategy.md)
  - High-level overview of Blueprint's configuration approach
  - Key principles and design decisions
  - Integration with AWS services

### 3. Setting up a Batch Importer
- [Guide to implementing a Batch Importer](batch-importer-guide.md)
  - Prerequisites for batch processing
  - Creating a new Batch Importer class that extends BaseExporter
  - Implementing tenant discovery with getTenants()
  - Downloading data from external systems with downloadOneTenant()
  - Orchestrating the batch process with run()
  - Storing data in S3 with proper partitioning

### 4. Using the File Discovery Service
- [Guide to the File Discovery Service](file-reader-guide.md)
  - Understanding the file discovery workflow
  - Scanning S3 for files uploaded by batch importers
  - Updating file metadata and row counts
  - Monitoring file discovery operations
  - Troubleshooting common issues

### 5. Creating a File Processor
- [Guide to the File Processor Service](file-processor-guide.md)
  - File processor architecture
  - Creating a new processor for a specific CRM
  - Processing data from S3
  - Updating Elasticsearch with processed data
  - Error handling and retry strategies

## Interactive Workflows with Slash Commands

Blueprint provides interactive workflows that you can run with Cascade to automate common tasks. Use these slash commands to execute specific workflows:

### System Commands
- `/system`: Apply standard development preferences and guidelines

### Configuration Management Commands
| Command | Description | When to Use |
|---------|-------------|-------------|
| `/config-workshop` | Learn configuration management through hands-on exercises | When you want a guided, hands-on learning experience |
| `/config-quick-check` | Quick end-to-end verification of the configuration system | To quickly verify your configuration setup is working |

### Batch Processing Commands
| Command | Description | When to Use |
|---------|-------------|-------------|
| `/demo-batch-end-to-end` | Complete end-to-end batch processing pipeline demo | For a guided walkthrough with standard explanations |
| `/demo-batch-end-to-end teach` | Educational walkthrough of the batch pipeline | For learning with comprehensive explanations |
| `/demo-batch-end-to-end quick` | Quick execution of the batch pipeline | For rapid execution with minimal explanations |

### Pub/Sub Pipeline Commands
| Command | Description | When to Use |
|---------|-------------|-------------|
| `/demo-pubsub-init` | Initialize the pub/sub pipeline demo environment | Before running any pub/sub demos |
| `/demo-pubsub-start` | Start the pub/sub pipeline services | To start the pub/sub service containers |
| `/demo-pubsub-generate` | Generate test events for the pub/sub pipeline | To simulate event generation |
| `/demo-pubsub-verify` | Verify the results of the pub/sub pipeline demo | To check if events were processed correctly |

## Recommended Learning Sequences

### For New Developers
1. Start with `/system` to set up your development environment


### For Setting up a new Batch application 
1. `/config-workshop` to learn configuration management
2. `/config-quick-check` to verify your configuration

### For Batch Processing
1. `/demo-batch-end-to-end` to see the complete batch processing pipeline

## Full Batch Processing Pipeline Demo

To run a complete automated demo of the batch processing pipeline, use one of the following commands based on your needs:

1. **Standard Demo** (with basic explanations):
   ```
   /demo-batch-end-to-end
   ```
   This will run the complete pipeline with standard explanations.

2. **Educational Walkthrough** (with detailed explanations):
   ```
   /demo-batch-end-to-end teach
   ```
   This will run the pipeline with comprehensive explanations before each step, ideal for learning.

3. **Quick Execution** (with minimal explanations):
   ```
   /demo-batch-end-to-end quick
   ```
   This will run the pipeline with minimal explanations, focusing on rapid execution.

The end-to-end workflow will automatically perform all necessary steps:
- Initialize the environment (start Docker containers, bootstrap configuration)
- Run the batch importer to simulate downloading data from CRMs
- Simulate webhook file creation
- Run the file discovery service to scan S3 for new files
- Run the file processor to process the discovered files
- Verify the results at each step

## Additional Resources

- [Batch Processing Overview](batch-processing.md) - Comprehensive guide to the batch processing system
- [Configuration Strategy](configuration-strategy.md) - Details on the Blueprint configuration management approach
- [Superseded Documentation](decrement.md) - List of older documentation that has been replaced
