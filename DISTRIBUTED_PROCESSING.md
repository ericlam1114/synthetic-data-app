# Distributed Document Processing

This document explains the distributed document processing solution implemented for the Synthetic Data App.

## Overview

The application has been upgraded to use a distributed document processing system with the following components:

1. **MongoDB** - For persistent job storage and tracking
2. **Redis** - For robust job queueing with Bull
3. **Worker Process** - A separate process for handling document processing jobs

This approach solves several issues:
- Prevents API routes from timing out during long-running processes
- Improves memory management by isolating document processing
- Provides better error recovery and job resumption
- Enables scalability by allowing multiple workers

## Setup

### Prerequisites

- MongoDB (local or cloud instance)
- Redis (local or cloud instance)
- Node.js 16+

### Configuration

1. Copy `.env.local.example` to `.env.local` and configure:
   ```
   # MongoDB and Redis configuration
   MONGODB_URI=mongodb://localhost:27017/synthetic-data
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   
   # Other configurations...
   ```

### Running the Application

#### Development Mode

Run the application with the worker process:

```bash
npm run dev:with-worker
```

Or separately:

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run worker
```

#### Production Mode

For production:

```bash
npm run build
npm run start:with-worker
```

## Architecture

### Components

1. **API Routes**
   - `/api/process` - Queues document processing jobs
   - `/api/jobs/status` - Checks job status and performs actions

2. **Job Queue**
   - Uses Bull with Redis for robust job queuing
   - Handles retries, backoff, and job persistence

3. **Worker Process**
   - Processes jobs independently from the main application
   - Handles memory-intensive document processing

4. **MongoDB Storage**
   - Stores job details, status, and metadata
   - Enables job recovery and history tracking

### Job Lifecycle

1. **Job Creation**
   - Client uploads document or provides file key
   - API creates job in MongoDB and adds to Bull queue
   - Client receives job ID for tracking

2. **Job Processing**
   - Worker process picks up job from queue
   - Document is processed with regular progress updates
   - Results are stored in S3

3. **Status Tracking**
   - Client polls `/api/jobs/status` to check progress
   - UI shows progress updates in real-time

4. **Error Recovery**
   - Failed jobs can be retried
   - Bull handles automatic retries with exponential backoff
   - Manual intervention possible via API

## Scaling

This architecture can be scaled in several ways:

1. **Multiple Workers**
   - Run worker processes on separate servers
   - Increase worker count for parallel processing

2. **Queue Prioritization**
   - Priority levels for different job types
   - VIP users' jobs can be prioritized

3. **Horizontal Scaling**
   - Use MongoDB Atlas and Redis Cloud for managed databases
   - Deploy workers to multiple regions

## Monitoring

For production environments, consider:

1. **Queue Dashboard**
   - Use Bull Board for visual queue monitoring
   - Track job completion rates and failures

2. **Logging**
   - Implement structured logging
   - Use a service like Datadog or New Relic

## Troubleshooting

Common issues and solutions:

1. **Redis Connection Errors**
   - Verify Redis is running
   - Check credentials and firewall settings

2. **Jobs Stalling**
   - Increase worker timeout settings
   - Check for memory constraints

3. **MongoDB Issues**
   - Verify connection string
   - Ensure indices are created for job IDs 