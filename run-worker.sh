#!/bin/bash
# run-worker.sh

# Load environment variables from .env.local
set -a
source .env.local
set +a

# Print connection information
echo "Starting synthetic data processing worker..."
echo "Using MongoDB URI: $(echo $MONGODB_URI | sed 's/\(mongodb+srv:\/\/[^:]*\):[^@]*\(@.*\)/\1:****\2/')"
echo "Using Redis: $REDIS_HOST:$REDIS_PORT"

# Check if Redis is reachable first
if command -v redis-cli &> /dev/null; then
  echo "Checking Redis connection..."
  if redis-cli -h ${REDIS_HOST:-localhost} -p ${REDIS_PORT:-6379} ${REDIS_PASSWORD:+-a $REDIS_PASSWORD} ping > /dev/null 2>&1; then
    echo "Redis connection successful"
  else
    echo "⚠️  Warning: Could not connect to Redis at ${REDIS_HOST:-localhost}:${REDIS_PORT:-6379}"
    echo "Worker will attempt to reconnect automatically"
  fi
else
  echo "redis-cli not available, skipping Redis connection check"
fi

# Run the worker with increased memory and debug options
echo "Starting worker process..."
NODE_DEBUG=bull node --max-old-space-size=4096 --expose-gc scripts/worker.js 