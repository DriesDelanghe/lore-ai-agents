// src/index.ts
// Main entry point for the Kaelari Historian agent

import { KaelariHistorianHTTPServer } from './mcp-server';

async function main() {
  console.log('🧠 Starting Kaelari Historian Agent...');
  
  const port = parseInt(process.env.PORT || '3000');
  const server = new KaelariHistorianHTTPServer(port);
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🔔 Received shutdown signal, shutting down gracefully...');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🔔 Received termination signal, shutting down gracefully...');
    process.exit(0);
  });
  
  console.log('🏛 Kaelari Historian Agent is ready to serve!');
  console.log(`📡 HTTP/WebSocket server available at http://localhost:${port}`);
  console.log('🔍 Ready to answer questions about Kaelari lore, culture, and history');
}

// Start the server
main().catch((error) => {
  console.error('❌ Failed to start Kaelari Historian Agent:', error);
  process.exit(1);
});