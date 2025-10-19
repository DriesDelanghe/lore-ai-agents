# Kaelari Historian AI Agent

A stateless AI agent that serves as a historian for the Kaelari species, built using the Model Context Protocol (MCP) and enhanced with the weave-chunker CLI tool for accurate lore lookup.

## Features

- **Stateless Operation**: Each query is independent, no session state maintained
- **Fact-First Approach**: Prioritizes factual information over hallucination  
- **Multi-Protocol Access**: Both MCP server and HTTP/WebSocket endpoints
- **Enhanced Search**: Uses improved weave-chunker with entity extraction and relevance scoring
- **Containerized**: Runs in a hardened Docker container with security best practices
- **Local LLM**: Integrates with Ollama for private, offline AI responses

## Quick Start

1. **Prerequisites**:
   - Docker and Docker Compose
   - Ollama running on your host machine (port 11434)
   - A Kaelari-compatible language model loaded in Ollama (e.g., `llama3.2`)

2. **Run the test script**:
   ```bash
   ./test-agent.sh
   ```

   This will build the container, start the agent, and run basic tests.

3. **Manual testing**:
   ```bash
   # Build and start
   docker-compose up -d
   
   # Query the agent
   curl -X POST http://localhost:3000/query \
     -H "Content-Type: application/json" \
     -d '{"query": "What are the common professions among the Kaelari?"}'
   
   # Check health
   curl http://localhost:3000/health
   
   # Stop
   docker-compose down
   ```

## API Endpoints

### HTTP REST API

- **POST /query**: Submit a query to the historian
  ```json
  {
    "query": "What do the Kaelari believe about magic?"
  }
  ```

- **GET /health**: Health check endpoint

### WebSocket API

- **WS /ws**: Real-time queries via WebSocket
  ```json
  {
    "type": "query",
    "payload": {
      "query": "Tell me about Kaelari governance"
    }
  }
  ```

### MCP Server

The agent also exposes an MCP (Model Context Protocol) server for integration with MCP-compatible clients.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Client Query   │───▶│  Kaelari Agent   │───▶│  weave-chunker  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │                         │
                               ▼                         ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   Ollama LLM     │    │  Vector Store   │
                       └──────────────────┘    └─────────────────┘
```

- **Agent**: Orchestrates searches and synthesizes responses
- **weave-chunker**: Enhanced CLI tool for semantic search and fact retrieval
- **Ollama**: Local language model for generating historically accurate responses
- **Vector Store**: Semantic embeddings of Kaelari lore and history

## Development

### Project Structure

```
weave-agent-dromari-kaelari-historian/
├── src/
│   ├── agent.ts         # Core KaelariHistorian class
│   ├── mcp-server.ts    # MCP and HTTP server implementations  
│   ├── tools.ts         # weave-chunker CLI integration
│   └── index.ts         # Main entry point
├── data/                # Kaelari lore files
├── db/                  # Vector database
├── Dockerfile           # Multi-stage container build
├── docker-compose.yml   # Service orchestration
└── package.json         # Dependencies and scripts
```

### Local Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run locally (requires Ollama)
npm start

# Run in development mode
npm run dev
```

## Configuration

Environment variables:

- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `OLLAMA_BASE_URL`: Ollama API endpoint (default: http://localhost:11434)

## Security

The Docker container implements several security hardening measures:

- Non-root user execution
- Read-only root filesystem (where possible)
- Minimal attack surface with distroless final image
- No shell access in production container
- Resource limits and health checks

## Troubleshooting

### Agent won't start
```bash
# Check logs
docker-compose logs kaelari-historian

# Verify Ollama is accessible
curl http://localhost:11434/api/tags
```

### Search not finding results
```bash
# Check if vector database exists
ls -la weave-agent-dromari-kaelari-historian/db/

# Test weave-chunker directly
cd weave-chunker
npm run build
node dist/cli.js search "your query here"
```

### TypeScript compilation issues
```bash
# Clean build
rm -rf dist/
npm run build
```

## License

MIT License - see LICENSE file for details.