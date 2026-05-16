---
description: Interactive end-to-end pipeline testing (Publish → Fulfill → Intent) with automated validation
---

# Interactive End-to-End Pipeline Testing

## 🎯 Why This Runbook Exists

**The Problem We're Solving:**
You have a complex 3-stage HubSpot webhook processing pipeline that needs thorough validation before your development team integrates with it. Manual testing is tedious and error-prone, but you need confidence that the entire flow works correctly.

**What This Runbook Does:**
This is an **interactive validation guide** designed to be executed with an AI assistant (like Cascade) who can run commands, validate outputs, and troubleshoot issues in real-time. It's not a script - it's a **guided conversation** that walks through your pipeline systematically.

**The Value:**
- **Catch integration issues early** before developers encounter them
- **Build confidence** in your pipeline architecture  
- **Enable rapid iteration** when making changes
- **Document the expected behavior** for future reference

## Pipeline Overview

**A. Publish Stage** 
- **Tool**: `tools/testing/local-simple-publisher.ts single`
- **Input**: HubSpot webhook events (simulated)
- **Output**: Re-formatted and grouped events → `aio-webhook-single` SQS queue (AWS)

**B. Fulfill Stage**
- **Tool**: `services/webhook-subscriber/src/test-webhook-handler.ts`
- **Transport**: SQS `aio-webhook-single` queue
- **Input**: Grouped HubSpot webhook events
- **Output**: 
  - OpenSearch `contact-***` index updated
  - Selected events → `aio-intent-queue` SQS queue

**C. Intent Stage**
- **Tool**: `services/intent-subscriber/` (needs runner investigation)
- **Transport**: SQS `aio-intent-queue` queue  
- **Input**: Selected grouped HubSpot events
- **Output**:
  - New row in `calls-db.intent` table
  - API call to decision URL (200/400/500 responses)

## 🤔 What You're Actually Doing Here

**This Is Not A Script** - It's a **guided validation conversation**. You're systematically walking through your pipeline to:

1. **Verify each stage works** - Publish → Fulfill → Intent
2. **Observe queue state changes** - Watch messages flow through SQS queues
3. **Validate data transformations** - Ensure data flows correctly from webhooks → OpenSearch → Database
4. **Build operational confidence** - Know your pipeline works before developers depend on it

**Why Interactive Mode Works Better:**
- **Real-time problem solving** - When something breaks, troubleshoot immediately
- **Context awareness** - AI remembers what happened in previous steps
- **Adaptive testing** - Try different scenarios based on what you discover
- **Learning opportunity** - Understand your pipeline behavior deeply

## Usage Modes

**🤖 Interactive Mode (Recommended):**
- Start a conversation: "Let's run the interactive pipeline test"
- AI executes commands, validates outputs, and troubleshoots issues
- Perfect for learning, debugging, and building confidence

**📋 Manual Mode:**
- Copy/paste commands independently
- Use when you want to run specific steps or scenarios

## Environment Setup

**🏗️ Two-Cluster Architecture:**
- **acme-local**: Uses containers (LocalStack, MySQL) to avoid hitting real AWS resources
- **acme-dev**: Minimal Docker setup, uses **real AWS resources** and requires VPN for database access

**This runbook is designed for `acme-dev` environment testing against real AWS resources.**

## Prerequisites

**Required Setup:**
- ✅ AWS credentials configured and connected to the right account
- ✅ VPN connection active (required for database access)
- ✅ Config maps pulled locally: `tools/scripts/setup.configs.sh`
- ✅ Services built and available (webhook-subscriber, intent-subscriber)

**Optional (for LocalStack testing):**
- ✅ Kind cluster running with LocalStack + MySQL (use `acme-local` setup)
- ✅ Infrastructure initialized (`InfrastructureManager.ts setup`)

---

## Stage A: Publish - HubSpot Event Publishing

> **💡 What We're Testing:** Can we simulate a HubSpot webhook event and get it properly formatted and queued for processing? This validates your event ingestion and initial processing logic.

### Step A1: Environment Preparation

**Why This Step:** Before testing the pipeline, we need to confirm our local infrastructure is healthy and ready. This prevents wasting time debugging pipeline issues when the problem is actually infrastructure.

**Step A1a: Check for Zombie Processes**

**Critical Issue:** Timed-out processes can continue running in background and silently consume SQS messages, making queues appear empty when they should have messages.

```bash
# Check for zombie pipeline processes that might be consuming messages
echo "🔍 Checking for zombie processes..."
ps aux | grep -E "(intent|webhook|hubspot)" | grep -v grep
```

**Expected Output:**
- ✅ No processes found (clean slate) OR
- ❌ Processes found - kill them: `kill -9 <PID>`

**🚨 If Zombie Processes Found:** Kill them immediately or they will consume your test messages before you can validate the pipeline.

**Step A1b: Verify AWS Connection and Queue Status**

Let's verify our AWS connection and pipeline queue status:

```bash
# Check initial pipeline queue state (before pipeline execution)
echo "📊 Initial pipeline queue state check..."
./tools/scripts/validation/check-pipeline-queues.sh
```

**Expected Output:**
- ✅ AWS credentials verified with account and identity info
- ✅ All 3 pipeline queues present and accessible
- ✅ Queue message counts displayed (baseline state)
- ✅ "Core pipeline queues are ready" confirmation

**🚨 If This Fails:** Check AWS credentials, VPN connection, or run `tools/scripts/setup.configs.sh` to pull config maps.


**Note:** This shows extensive information about all queues in your AWS account. Use the focused pipeline script above for normal testing.

### Step A2: Execute Publish Stage

**What We're Doing:** Simulating a real HubSpot webhook event (like a contact property change) and running it through your publisher logic. This tests whether your event formatting, validation, and SQS publishing works correctly.

**Why This Matters:** If this fails, nothing downstream will work. This is your pipeline's front door.

```bash
# Run the HubSpot publisher (single event mode)
NODE_ENV=development tsx  services/simple-publisher/src/test-simple-publisher.ts single
```

**Expected Output (Key Success Indicators):**
- ✅ "AWS Identity check successful" with your account ID
- ✅ Queue URLs resolved correctly (https://sqs.us-west-2.amazonaws.com/...)
- ✅ "Sent message to SQS" with MessageId
- ✅ Final line: "✅ Single Event - Success! Messages processed: 1"

**💡 Note:** The publisher script is verbose with debug logging. Look for the key success indicators above rather than trying to parse all the output.

### Step A3: Validate Publish Output

**What We're Checking:** Did the event actually make it to the SQS queue? We're comparing the queue state from Step A1 to see if our publish operation worked.

**Why This Validation:** Publishing can fail silently - the script might run without errors but not actually send the message. This step catches that.

** if it does not 'work' the first time - give it a second and run again - it sometimes takes a minute to show

```bash
# Check queue state after publishing (should see messages in webhook queue)
echo "📊 Post-publish queue state check..."
./tools/scripts/validation/check-pipeline-queues.sh
```



**Expected Output:**
- ✅ `aio-webhook-single` queue message count increased from Step A1
- ✅ Message preview shows formatted HubSpot event data (if available)
- ✅ Other pipeline queues remain unchanged

**🚨 If This Fails:** The publish stage isn't working. Check AWS credentials, queue permissions, and publisher logic.

---

## Stage B: Fulfill - Webhook Processing

> **💡 What We're Testing:** Can the webhook-subscriber consume the queued event, process it through your business logic, update OpenSearch, and forward relevant events to the intent queue? This is your core processing engine.

### Step B1: Prepare Webhook Subscriber
 - removed

### Step B2: Execute Fulfill Stage

**What We're Doing:** Processing the webhook events from the SQS queue. The webhook handler sometimes doesn't exit cleanly, so we use a timeout to prevent hanging.

**Why This Timeout:** The webhook handler can hang after processing due to open connections or event loops. The timeout ensures we can continue the pipeline test even if the handler doesn't exit gracefully.

```bash
# Run the webhook handler test with timeout protection (macOS compatible)
cd services/webhook-subscriber

# Method 1: Using Perl timeout (works on all macOS systems)
perl -e 'alarm 15; exec @ARGV' tsx src/test-webhook-handler.ts

# Method 2: Alternative - Background process with manual timeout
# tsx src/test-webhook-handler.ts &
# HANDLER_PID=$!
# sleep 30
# if kill -0 $HANDLER_PID 2>/dev/null; then
#   echo "⏰ Handler still running after 30s, terminating..."
#   kill $HANDLER_PID 2>/dev/null
#   wait $HANDLER_PID 2>/dev/null || true
#   echo "✅ Handler terminated due to timeout"
# else
#   echo "✅ Handler completed normally"
# fi

cd -
```

**Expected Output:**
- ✅ SQS message consumed successfully
- ✅ Event processing logged
- ✅ OpenSearch indexing confirmed
- ✅ Intent events forwarded to intent queue
- ⏰ May timeout after 30 seconds (this is normal and expected)

### Step B3: Validate Fulfill Outputs

Check queue state changes and OpenSearch updates:

```bash
# Check queue state after webhook processing (should see intent queue populated)
echo "📊 Post-fulfill queue state check..."
./tools/scripts/validation/check-sqs-queues.sh


```

**Expected Output:**
- ✅ `aio-webhook-single` queue processed (message count decreased)
- ✅ `aio-intent-queue` now has messages (filtered events forwarded)
- ✅ Message preview shows intent-ready event data
- ✅ OpenSearch shows new/updated contact document

---


### Step B4: Validate Pipeline Results

The HubSpot publisher will output validation commands after successful execution. Use these commands to verify the pipeline worked:

**Option 1: Quick Row Count Check (Fast)**
```bash
# Check current counts across all systems
tsx tools/runbooks/scripts/pipeline-validation.ts counts
```

**Option 2: Precise Trace ID Validation (Recommended)**
```bash
# Use the trace ID from the publisher output
tsx tools/runbooks/scripts/pipeline-validation.ts trace <TRACE_ID_FROM_PUBLISHER>
```

**Option 3: Contact ID Validation**
```bash
# Use the HubSpot contact ID from the publisher output
tsx tools/runbooks/scripts/pipeline-validation.ts contact <HUBSPOT_CONTACT_ID>
```

**Expected Results:**
- ✅ Contact found in OpenSearch with correct data
- ✅ Intent record found in calls.intent table with matching globalTraceId
- ✅ Row counts increased from baseline

### Step B5: Baseline Count Monitoring (Optional)

For volume testing, capture baseline counts before and after:

```bash
# Before processing
tsx tools/runbooks/scripts/pipeline-validation.ts counts > before.txt

# After processing  
tsx tools/runbooks/scripts/pipeline-validation.ts counts > after.txt

# Compare
diff before.txt after.txt
```

## Stage C: Intent - Intent Processing


### Step C1: Execute Intent Stage (Test Mode)

**What We're Doing:** Running the intent subscriber using the test pattern that loads local configuration. This processes messages from the intent queue and creates intent records in the database.

**Why Test Mode:** The test-intent-handler.ts loads configuration from the local `config/` directory, while the main intent-handler.ts expects Kubernetes-mounted `/config` directory.

```bash
# Run intent-subscriber test mode (processes available messages and exits)
cd services/intent-subscriber
tsx src/test-intent-handler.ts
cd -
```

**Expected Output:**
- ✅ Configuration initialized successfully
- ✅ Health checks configured
- ✅ SQS subscriber started in one-shot mode
- ✅ Messages processed from intent queue
- ✅ Intent processing logic executed
- ✅ Process exits with success code (0)

**Expected Output:**
- ✅ Intent queue message consumed
- ✅ Intent processing logic executed
- ✅ Database write confirmed
- ✅ Decision API call made

### Step C2: Validate Intent Outputs

**What We're Checking:** Did the intent subscriber successfully process the messages and create intent records in the database? We'll validate both queue processing and database writes.

**Why This Validation:** Intent processing can fail silently - the subscriber might consume messages but fail to write to the database or call the Decision API.

```bash
# Check final queue state (should see intent queue processed)
echo "📊 Post-intent queue state check..."
./tools/scripts/validation/check-pipeline-queues.sh
```

**Expected Output:**
- ✅ `aio-intent-queue` processed (message count decreased to 0)
- ✅ All queues back to baseline state

### Step C3: Validate Intent Database Records (by eventId)

**What We're Checking:** Verify that intent records were created in the database with the correct `eventId` for direct event validation.

**Why eventId Validation:** We added the `eventId` column to enable direct event-level validation instead of relying on trace ID searches, which can be unreliable when multiple events share the same parent trace.

```bash
# Check database for new intent records with eventId
echo "🔍 Validating intent records by eventId..."

# Get the eventId from the publisher output (use the HubSpot event ID)
# Example: tsx tools/runbooks/scripts/pipeline-validation.ts intent-by-eventid <EVENT_ID>

# Alternative: Check recent intent records to see eventId column populated
mysql -h 127.0.0.1 -P 30306 -u acme_user -pacme_password calls \
  -e "SELECT id, eventId, contact_id, event_type, globalTraceId, created_at FROM intent ORDER BY created_at DESC LIMIT 5;"
```

**Expected Output:**
- ✅ New row(s) in `intent` table with processed data
- ✅ `eventId` column populated with original HubSpot event ID
- ✅ `globalTraceId` matches the trace ID from webhook processing
- ✅ Recent timestamp showing fresh processing

### Step C4: End-to-End EventId Validation

**What We're Doing:** Using the pipeline validation script to verify the complete flow using the new eventId-based validation approach.

```bash
# Use the eventId from the intent table or publisher output for validation
# This validates that we can find the intent record directly by eventId
echo "🎯 End-to-end eventId validation..."

# Get eventId from recent intent record
RECENT_EVENT_ID=$(mysql -h 127.0.0.1 -P 30306 -u acme_user -pacme_password calls \
  -se "SELECT eventId FROM intent ORDER BY created_at DESC LIMIT 1;")

echo "📋 Using eventId: $RECENT_EVENT_ID"

# Validate using eventId (once validation script is updated)
# tsx tools/runbooks/scripts/pipeline-validation.ts intent-by-eventid $RECENT_EVENT_ID
```

**Expected Output:**
- ✅ Intent record found by eventId
- ✅ Event data matches original HubSpot event
- ✅ Complete pipeline validation successful

---

## Complete Pipeline Validation

### End-to-End Verification

Verify the complete pipeline flow with comprehensive queue analysis:

```bash
# Final comprehensive queue state check
echo "📊 Final pipeline completion verification..."
./tools/scripts/validation/check-sqs-queues.sh

# Verify data flow: Original event → OpenSearch → Database
echo ""
echo "🔍 Data Flow Verification:"
echo "=== OpenSearch Document ==="
curl -X GET "localhost:9200/contact-*/_search?pretty" \
  -H 'Content-Type: application/json' \
  -d '{"query": {"match_all": {}}, "size": 1}'

echo ""
echo "=== Database Intent Record ==="
mysql -h 127.0.0.1 -P 30306 -u acme_user -pacme_password calls \
  -e "SELECT id, contact_id, event_type, created_at FROM intent ORDER BY created_at DESC LIMIT 3;"
```

**Expected Output:**
- ✅ All queues back to baseline (processed completely)
- ✅ Queue message counts show complete pipeline flow
- ✅ Data consistency across OpenSearch and Database
- ✅ Timestamps show proper processing sequence

---

## Scenario Testing

### Test Scenario 1: Happy Path
- Single contact property change
- All stages process successfully
- Verify complete data flow

### Test Scenario 2: High Volume
```bash
# Publish multiple events
for i in {1..5}; do
  NODE_ENV=development tsx tools/testing/local-simple-publisher.ts single
  sleep 1
done
```

### Test Scenario 3: Error Handling
```bash
# Publish malformed event (if publisher supports it)
NODE_ENV=development tsx tools/testing/local-simple-publisher.ts single --malformed

# Monitor error handling in logs
kubectl logs -f -l app.kubernetes.io/name=webhook-subscriber
```

### Test Scenario 4: Different Event Types
```bash
# Test different property changes
NODE_ENV=development tsx tools/testing/local-simple-publisher.ts single --property=email
NODE_ENV=development tsx tools/testing/local-simple-publisher.ts single --property=phone
NODE_ENV=development tsx tools/testing/local-simple-publisher.ts single --property=company
```

---

## Troubleshooting

### Stage A Issues (Publish)
```bash
# Check publisher script issues
NODE_ENV=development tsx tools/testing/local-simple-publisher.ts single --debug

# Verify AWS credentials and endpoint
aws --endpoint-url=http://localhost:30568 sts get-caller-identity
```

### Stage B Issues (Fulfill)
```bash
# Check webhook-subscriber service logs
kubectl logs -l app.kubernetes.io/name=webhook-subscriber --tail=100

# Restart webhook-subscriber if needed
kubectl rollout restart deployment webhook-subscriber

# Check OpenSearch connectivity
curl -X GET "localhost:9200/_cluster/health?pretty"
```

### Stage C Issues (Intent)
```bash
# Check intent-subscriber service logs  
kubectl logs -l app.kubernetes.io/name=intent-subscriber --tail=100

# Verify database connectivity
mysql -h 127.0.0.1 -P 30306 -u acme_user -pacme_password calls -e "SELECT 1;"

# Check decision API endpoint availability
# (Command depends on decision API configuration)
```

### Queue Issues
```bash
# Purge queues to reset state
aws --endpoint-url=http://localhost:30568 sqs purge-queue \
  --queue-url http://localhost:30568/000000000000/aio-webhook-single

aws --endpoint-url=http://localhost:30568 sqs purge-queue \
  --queue-url http://localhost:30568/000000000000/aio-intent-queue

# Recreate queues if needed
AWS_ENDPOINT_URL=http://localhost:30568 tsx tools/infrastructure/InfrastructureManager.ts setup
```

---

## Interactive Mode Usage

When using this runbook with Cascade AI:

1. **Start the session**: "Let's run the interactive pipeline test"
2. **Cascade will**:
   - Execute each command automatically
   - Validate outputs against expected results
   - Highlight any issues or unexpected behavior
   - Suggest troubleshooting steps if needed
3. **You can**:
   - Request different test scenarios
   - Ask for deeper investigation of any stage
   - Skip stages or repeat specific steps
   - Modify test parameters on the fly

**Example interaction:**
```
User: "Run the pipeline test with a phone number change event"
Cascade: "Starting Stage A with phone property change..."
         [executes commands, validates outputs]
         "✅ Stage A complete. Moving to Stage B..."
         [continues through pipeline]
```

## Next Steps

After successful pipeline testing:
- **Performance Testing**: Run high-volume scenarios
- **Error Scenario Testing**: Test various failure modes  
- **Monitoring Setup**: Implement pipeline observability
- **Documentation**: Record common issues and solutions
- **Automation**: Convert manual steps to automated tests

This interactive approach provides confidence in your pipeline while enabling rapid iteration and troubleshooting.
