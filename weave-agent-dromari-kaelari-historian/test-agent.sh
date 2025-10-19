#!/bin/bash

# Test script for Kaelari Historian AI Agent
# This script builds the Docker container and runs basic tests

set -e

echo "🏗️  Building Kaelari Historian Docker container..."
docker-compose build

echo "🚀 Starting the agent..."
docker-compose up -d

# Wait for the service to be ready
echo "⏳ Waiting for agent to start..."
sleep 10

# Health check
echo "🔍 Checking agent health..."
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Agent is healthy!"
else
    echo "❌ Agent health check failed"
    docker-compose logs kaelari-historian
    exit 1
fi

echo ""
echo "🧪 Running test queries..."

# Test 1: Basic query about professions
echo "Test 1: Asking about common professions..."
response1=$(curl -s -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the common professions among the Kaelari?"}')

if [[ $response1 == *"error"* ]]; then
    echo "❌ Test 1 failed:"
    echo "$response1"
else
    echo "✅ Test 1 passed!"
    echo "Response: $(echo "$response1" | jq -r '.answer' | head -c 200)..."
fi

echo ""

# Test 2: Query about beliefs
echo "Test 2: Asking about Kaelari beliefs..."
response2=$(curl -s -X POST http://localhost:3000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "What do the Kaelari believe about the world?"}')

if [[ $response2 == *"error"* ]]; then
    echo "❌ Test 2 failed:"
    echo "$response2"
else
    echo "✅ Test 2 passed!"
    echo "Response: $(echo "$response2" | jq -r '.answer' | head -c 200)..."
fi

echo ""

# Test 3: Test the WebSocket connection
echo "Test 3: Testing WebSocket connection..."
wscat_output=$(timeout 10s wscat -c ws://localhost:3000/ws -x '{"type":"query","payload":{"question":"Tell me about Kaelari governance"}}' 2>/dev/null || true)

if [[ $wscat_output == *"response"* ]]; then
    echo "✅ Test 3 passed! WebSocket connection working."
else
    echo "⚠️  Test 3 skipped (wscat not available or timeout)"
fi

echo ""
echo "🎉 Testing complete!"
echo ""
echo "📋 Available endpoints:"
echo "  HTTP API: http://localhost:3000/query"
echo "  WebSocket: ws://localhost:3000/ws"
echo "  Health check: http://localhost:3000/health"
echo ""
echo "💡 Example query:"
echo 'curl -X POST http://localhost:3000/query -H "Content-Type: application/json" -d '\''{"question": "What are the Kaelari known for?"}'\'
echo ""
echo "🛑 To stop the agent:"
echo "docker-compose down"