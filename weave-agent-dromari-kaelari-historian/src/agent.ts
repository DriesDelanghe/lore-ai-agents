// src/agent.ts
// Kaelari Historian AI Agent - True Autonomous Function Calling

import { lookupLore, LoreLookupParams, LoreLookupResult } from './tools';

export interface KaelariHistorianQuery {
  question: string;
}

export interface KaelariHistorianResponse {
  answer: string;
  sources: Array<{
    title: string;
    section: string;
    relevance: number;
    path: string;
  }>;
  confidence: 'high' | 'medium' | 'low';
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  function: {
    name: string;
    arguments: any;
  };
}

interface OllamaChatResponse {
  content?: string;
  tool_calls?: ToolCall[];
}

/**
 * Kaelari Historian Agent - True Autonomous Research Assistant
 * 
 * This agent uses Ollama's native function calling capabilities to
 * autonomously decide when and how to query the vector database.
 */
export class KaelariHistorian {
  private readonly ollamaBaseUrl: string;
  private readonly modelName: string;

  constructor(
    ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434',
    modelName = process.env.OLLAMA_MODEL || 'llama3.2'
  ) {
    this.ollamaBaseUrl = ollamaBaseUrl;
    this.modelName = modelName;
  }

  /**
   * Process a query about Kaelari lore autonomously using function calling
   */
  async query(input: KaelariHistorianQuery): Promise<KaelariHistorianResponse> {
    try {
      console.log(`[Kaelari Historian] Processing autonomous query: "${input.question}"`);

      const response = await this.conductAutonomousResearch(input.question);

      console.log(`[Kaelari Historian] Autonomous query completed successfully`);
      return response;

    } catch (error) {
      console.error('[Kaelari Historian] Error processing autonomous query:', error);
      return {
        answer: "I apologize, but I encountered an error while researching your question. Please try rephrasing your question.",
        sources: [],
        confidence: 'low'
      };
    }
  }

  /**
   * Conduct autonomous research using Ollama's native function calling
   */
  private async conductAutonomousResearch(question: string): Promise<KaelariHistorianResponse> {
    const systemPrompt = `You are the Kaelari Historian, a specialized AI assistant with deep knowledge of the Kaelari civilization. You are an autonomous agent that can independently research and gather information to answer questions.

Your role is to:
1. Analyze user questions about Kaelari civilization
2. Independently determine what information you need to answer thoroughly
3. Use the search_lore function to gather relevant information from the database
4. You may call search_lore multiple times with different queries if needed
5. Synthesize comprehensive responses based on your research
6. Cite sources clearly and maintain scholarly accuracy

When responding:
- First determine what information you need to answer the question thoroughly
- Use the search_lore function autonomously to gather relevant data
- Make multiple searches with different queries if needed for comprehensive coverage
- Always cite your sources by referencing document title and section
- Be comprehensive but concise
- Distinguish between confirmed facts and reasonable speculation
- If multiple sources conflict, acknowledge the discrepancy

You have access to the search_lore function - use it whenever you need information from the database.`;

    const tools = [
      {
        type: 'function',
        function: {
          name: 'search_lore',
          description: 'Search the Kaelari lore database for information about their culture, history, governance, beliefs, technology, and society',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query to find relevant information in the lore database'
              },
              maxResults: {
                type: 'number',
                description: 'Maximum number of results to return (default: 5)',
                default: 5
              }
            },
            required: ['query']
          }
        }
      }
    ];

    const messages: OllamaMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question }
    ];

    let allSources: any[] = [];
    let maxIterations = 10;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      try {
        console.log(`[Autonomous Agent] Research iteration ${iteration}`);

        const response = await this.callOllamaChatWithTools(messages, tools);

        if (response.tool_calls && response.tool_calls.length > 0) {
          let hasValidToolCall = false;

          for (const toolCall of response.tool_calls) {
            if (toolCall.function.name === 'search_lore') {
              console.log(`[Autonomous Agent] Making tool call: search_lore(${JSON.stringify(toolCall.function.arguments)})`);

              const toolResult = await this.executeSearchTool(toolCall.function.arguments);
              if (toolResult.success && toolResult.result?.results) {
                allSources.push(...toolResult.result.results);
                hasValidToolCall = true;
              }

              messages.push({
                role: 'assistant',
                content: response.content || '',
                tool_calls: [toolCall]
              });

              messages.push({
                role: 'tool',
                content: JSON.stringify(toolResult),
                tool_call_id: toolCall.function.name
              });
            }
          }

          if (!hasValidToolCall) {
            console.log('[Autonomous Agent] No valid tool calls, ending research');
            break;
          }
        } else {
          console.log('[Autonomous Agent] Received final answer from agent');
          return {
            answer: response.content || 'I was unable to generate a response.',
            sources: this.formatSources(allSources),
            confidence: this.assessConfidenceFromSources(allSources)
          };
        }
      } catch (error) {
        console.error('[Autonomous Agent] Error during research iteration:', error);
        break;
      }
    }

    console.log(`[Autonomous Agent] Reached max iterations, requesting final synthesis`);
    messages.push({
      role: 'user',
      content: `Based on all the information you've gathered from your searches, please provide a comprehensive final answer to the original question: "${question}". Do not make any more tool calls - just synthesize your research into a complete response.`
    });

    try {
      const finalResponse = await this.callOllamaChatWithTools(messages, []);
      return {
        answer: finalResponse.content || 'I was unable to generate a final response.',
        sources: this.formatSources(allSources),
        confidence: this.assessConfidenceFromSources(allSources)
      };
    } catch (error) {
      return {
        answer: `Based on my research of ${allSources.length} sources, I encountered an issue completing the full analysis. Please try asking a more specific question.`,
        sources: this.formatSources(allSources),
        confidence: 'low'
      };
    }
  }

  private async executeSearchTool(args: any): Promise<{ success: boolean, result?: any, error?: string }> {
    try {
      const searchParams: LoreLookupParams = {
        query: args.query,
        maxResults: Math.max(1, args.maxResults || 5) // Ensure at least 1 result
      };

      const result = await lookupLore(searchParams);

      return {
        success: result.success,
        result: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private formatSources(sources: any[]): Array<{ title: string, section: string, relevance: number, path: string }> {
    return sources
      .filter(s => s && s.title && s.section)
      .map(s => ({
        title: s.title,
        section: s.section,
        relevance: parseFloat(s.relevance_score) || 0,
        path: s.path || ''
      }))
      .slice(0, 10);
  }

  private assessConfidenceFromSources(sources: any[]): 'high' | 'medium' | 'low' {
    if (sources.length === 0) return 'low';

    const hasHighRelevanceSource = sources.some(s => parseFloat(s.relevance_score || '0') > 1.5);
    const hasMultipleSources = sources.length > 2;

    if (hasHighRelevanceSource && hasMultipleSources) {
      return 'high';
    } else if (hasHighRelevanceSource || hasMultipleSources) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private async callOllamaChatWithTools(messages: OllamaMessage[], tools: any[]): Promise<OllamaChatResponse> {
    const requestBody: any = {
      model: this.modelName,
      messages: messages,
      stream: false,
      options: {
        temperature: 0.1,
        top_p: 0.9
      }
    };

    if (tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch(`${this.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Ollama Chat API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      content: data.message?.content,
      tool_calls: data.message?.tool_calls
    };
  }
}