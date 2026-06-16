#!/bin/bash
set -e

# Native SDK E2E — runs the full pipeline locally or in CI.
# Usage: ./run-e2e.sh [--blocks-url URL]
#
# From the monorepo root, this script:
# 1. Generates the OpenRPC spec from test-apps/native-bindings
# 2. Runs Dart codegen to produce a typed client
# 3. Starts the local dev server (unless --blocks-url is provided)
# 4. Runs the E2E test suite
# 5. Stops the server

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND="$MONOREPO_ROOT/test-apps/native-bindings"
DART_SDK="$SCRIPT_DIR"
DART="${DART:-dart}"

BLOCKS_URL=""
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    echo "🛑 Stopping server (PID: $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --blocks-url) BLOCKS_URL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

echo "📦 Step 1: Generate OpenRPC spec from test-apps/native-bindings"
cd "$BACKEND"
npx blocks-generate-spec
SPEC_PATH="$BACKEND/aws-blocks/blocks.spec.json"
echo "   ✅ Spec: $SPEC_PATH"

echo ""
echo "🔧 Step 2: Run Dart codegen"
cd "$DART_SDK/packages/blocks_codegen"
$DART pub get --no-precompile 2>/dev/null
$DART run bin/blocks_codegen.dart \
  --spec "$SPEC_PATH" \
  --output "$DART_SDK/example/lib/blocks_client.dart"
echo "   ✅ Client: $DART_SDK/example/lib/blocks_client.dart"

echo ""
echo "🔍 Step 3: Verify generated client compiles"
cd "$DART_SDK/example"
$DART pub get --no-precompile 2>/dev/null
$DART analyze lib/blocks_client.dart
echo "   ✅ No compile errors"

if [ -z "$BLOCKS_URL" ]; then
  echo ""
  echo "🚀 Step 4: Start native-bindings dev server"
  cd "$BACKEND"
  npx tsx aws-blocks/scripts/server.ts > /tmp/blocks-e2e-server.log 2>&1 &
  SERVER_PID=$!
  BLOCKS_URL="http://localhost:3001/aws-blocks/api"

  # Wait for server
  for i in $(seq 1 30); do
    if curl -s -X POST "$BLOCKS_URL" \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"api.kvGet","params":{"key":"healthcheck"},"id":1}' 2>/dev/null | grep -q "result"; then
      echo "   ✅ Server ready at $BLOCKS_URL"
      break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
      echo "   ❌ Server failed to start. Logs:"
      cat /tmp/blocks-e2e-server.log
      exit 1
    fi
  done
else
  echo ""
  echo "🌐 Step 4: Using provided endpoint: $BLOCKS_URL"
fi

echo ""
echo "🧪 Step 5: Run E2E tests"
cd "$DART_SDK/example"
export BLOCKS_URL
$DART run bin/e2e_test.dart
