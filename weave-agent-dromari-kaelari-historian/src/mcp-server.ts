// src/mcp-server.ts  
// Model Context Protocol server for the Kaelari Historian agent

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
  type ListToolsRequest
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { KaelariHistorian, KaelariHistorianQuery } from './agent';

// Schema for the historian query tool
const HistorianQuerySchema = z.object({
  question: z.string().describe('The question to ask the Kaelari historian'),
  context: z.string().optional().describe('Additional context for the query')
});

/**
 * MCP Server for the Kaelari Historian Agent
 */
export class KaelariHistorianMCPServer {
  private server: Server;
  private historian: KaelariHistorian;

  constructor() {
    this.historian = new KaelariHistorian();
    this.server = new Server(
      {
        name: 'kaelari-historian',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
        }
      }
    );

    this.setupTools();
  }

  private setupTools() {
    // Register the historian query tool
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'query_kaelari_lore',
            description: 'Query the Kaelari Historian for information about Kaelari culture, history, and society. The historian will search the lore database and provide factual, source-cited responses.',
            inputSchema: {
              type: 'object',
              properties: {
                question: {
                  type: 'string',
                  description: 'The question to ask about Kaelari lore, culture, history, or society'
                },
                context: {
                  type: 'string',
                  description: 'Optional additional context to help the historian understand the query better'
                }
              },
              required: ['question']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;

      if (name === 'query_kaelari_lore') {
        try {
          // Validate input
          const query = HistorianQuerySchema.parse(args);
          
          console.log(`[MCP Server] Received historian query: "${query.question}"`);
          
          // Call the historian
          const response = await this.historian.query(query);
          
          // Format response for MCP
          const formattedResponse = {
            answer: response.answer,
            confidence: response.confidence,
            sources: response.sources,
            total_sources: response.sources.length
          };

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(formattedResponse, null, 2)
              }
            ]
          };

        } catch (error) {
          console.error('[MCP Server] Error processing historian query:', error);
          
          return {
            content: [
              {
                type: 'text', 
                text: JSON.stringify({
                  error: 'Failed to process historian query',
                  details: error instanceof Error ? error.message : 'Unknown error'
                }, null, 2)
              }
            ],
            isError: true
          };
        }
      }

      throw new Error(`Unknown tool: ${name}`);
    });
  }

  /**
   * Start the MCP server
   */
  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('[MCP Server] Kaelari Historian MCP server started');
  }
}

// HTTP/WebSocket server wrapper for network access
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

export class KaelariHistorianHTTPServer {
  private app: express.Application;
  private historian: KaelariHistorian;

  constructor(port = 3000) {
    this.app = express();
    this.historian = new KaelariHistorian();
    
    this.setupRoutes();
    this.setupWebSocket(port);
  }

  private setupRoutes() {
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'kaelari-historian' });
    });

    // REST endpoint for historian queries
    this.app.post('/query', async (req, res) => {
      try {
        const query = HistorianQuerySchema.parse(req.body);
        console.log(`[HTTP Server] Received query: "${query.question}"`);
        
        const response = await this.historian.query(query);
        res.json(response);
        
      } catch (error) {
        console.error('[HTTP Server] Error:', error);
        res.status(400).json({
          error: 'Invalid request',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Get available tools (MCP compatibility)
    this.app.get('/tools', (req, res) => {
      res.json({
        tools: [
          {
            name: 'query_kaelari_lore',
            description: 'Query the Kaelari Historian for information about Kaelari culture, history, and society.',
            inputSchema: {
              type: 'object',
              properties: {
                question: { type: 'string', description: 'The question to ask about Kaelari lore' },
                context: { type: 'string', description: 'Optional additional context' }
              },
              required: ['question']
            }
          }
        ]
      });
    });
  }

  private setupWebSocket(port: number) {
    const server = createServer(this.app);
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
      console.log('[WebSocket] Client connected');

      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.type === 'query' && message.payload) {
            const query = HistorianQuerySchema.parse(message.payload);
            const response = await this.historian.query(query);
            
            ws.send(JSON.stringify({
              type: 'response',
              id: message.id,
              payload: response
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'error',
              id: message.id,
              error: 'Invalid message format'
            }));
          }
        } catch (error) {
          ws.send(JSON.stringify({
            type: 'error',
            error: error instanceof Error ? error.message : 'Unknown error'
          }));
        }
      });

      ws.on('close', () => {
        console.log('[WebSocket] Client disconnected');
      });
    });

    server.listen(port, () => {
      console.log(`[HTTP Server] Kaelari Historian server running on port ${port}`);
      console.log(`[WebSocket] WebSocket server ready for connections`);
    });
  }

  start() {
    // HTTP server starts automatically in constructor
    console.log('[HTTP Server] Kaelari Historian HTTP/WebSocket server initialized');
  }
}