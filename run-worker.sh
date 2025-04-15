#!/bin/bash
# run-worker.sh

# Load environment variables from .env.local
set -a
source .env.local
set +a

# Print MongoDB URI (with redacted password)
echo "Using MongoDB URI: $(echo $MONGODB_URI | sed 's/\(mongodb+srv:\/\/[^:]*\):[^@]*\(@.*\)/\1:****\2/')"
echo "Using Redis: $REDIS_HOST:$REDIS_PORT"

# Run the worker
node --max-old-space-size=4096 --expose-gc scripts/worker.js 