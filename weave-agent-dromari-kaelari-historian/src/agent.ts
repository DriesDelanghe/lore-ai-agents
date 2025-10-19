// src/agent.ts
// Kaelari Historian AI Agent implementation

import { lookupLore, LoreLookupParams, LoreLookupResult } from './tools';

export interface KaelariHistorianQuery {
  question: string;
  context?: string;
}

export interface KaelariHistorianResponse {
  answer: string;
  sources: Array<{
    title: string;
    section: string;
    relevance: string;
    path: string;
  }>;
  confidence: 'high' | 'medium' | 'low';
  speculation?: string;
}

/**
 * Kaelari Historian Agent
 * 
 * Acts as a knowledgeable historian of the Kaelari people, providing factual
 * information based on the lore database. Prioritizes accuracy and clearly
 * distinguishes between established facts and speculation.
 */
export class KaelariHistorian {
  private readonly systemPrompt = `You are a knowledgeable historian specializing in the Kaelari, a subspecies of the Dromari people in the Weave universe. 

Your role is to:
1. Provide ACCURATE information based solely on the lore database
2. NEVER hallucinate or invent facts not present in the sources
3. When uncertain, search the database multiple times with different queries
4. Clearly distinguish between established facts and your scholarly speculation
5. Always cite your sources by referencing the section titles and paths
6. If information is not available, state this clearly rather than guessing

Response format:
- Start with direct factual answers based on the sources
- Include relevant details from the database
- End with speculation (if any) clearly marked as "SPECULATION:"
- Always provide source citations

Remember: You are a historian, not a storyteller. Accuracy and source citation are paramount.`;

  private readonly ollamaBaseUrl: string;
  private readonly modelName: string;

  constructor(ollamaBaseUrl = 'http://host.docker.internal:11434', modelName = 'llama3') {
    this.ollamaBaseUrl = ollamaBaseUrl;
    this.modelName = modelName;
  }

  /**
   * Process a query about Kaelari lore
   */
  async query(input: KaelariHistorianQuery): Promise<KaelariHistorianResponse> {
    try {
      console.log(`[Kaelari Historian] Processing query: "${input.question}"`);
      
      // Step 1: Initial search based on the question
      const initialSearch = await this.performSearch(input.question);
      
      // Step 2: Analyze initial results and determine if additional searches are needed
      const additionalSearches = await this.planAdditionalSearches(input.question, initialSearch);
      
      // Step 3: Perform additional searches if needed
      const allResults: LoreLookupResult[] = [initialSearch];
      for (const searchQuery of additionalSearches) {
        const result = await this.performSearch(searchQuery);
        allResults.push(result);
      }

      // Step 4: Synthesize the response using the LLM
      const response = await this.synthesizeResponse(input.question, allResults);
      
      console.log(`[Kaelari Historian] Query completed successfully`);
      return response;

    } catch (error) {
      console.error('[Kaelari Historian] Error processing query:', error);
      return {
        answer: "I apologize, but I encountered an error while searching the lore database. Please try rephrasing your question.",
        sources: [],
        confidence: 'low'
      };
    }
  }

  /**
   * Perform a search in the lore database
   */
  private async performSearch(query: string, options?: Partial<LoreLookupParams>): Promise<LoreLookupResult> {
    const searchParams: LoreLookupParams = {
      query,
      maxResults: 5,
      ...options
    };

    return await lookupLore(searchParams);
  }

  /**
   * Determine if additional searches are needed based on initial results
   */
  private async planAdditionalSearches(originalQuery: string, initialResults: LoreLookupResult): Promise<string[]> {
    const additionalSearches: string[] = [];

    // If we got very few results, try broader searches
    if (!initialResults.results || initialResults.results.length < 2) {
      // Extract key terms and search for them individually
      const keyTerms = this.extractKeyTerms(originalQuery);
      additionalSearches.push(...keyTerms.slice(0, 2)); // Limit to 2 additional searches
    }

    // If results seem incomplete, try related searches
    if (initialResults.results && initialResults.results.length > 0) {
      const concepts = initialResults.results.flatMap(r => r.concepts).slice(0, 3);
      if (concepts.length > 0) {
        additionalSearches.push(concepts[0]); // Search for the top concept
      }
    }

    return additionalSearches.slice(0, 2); // Limit total additional searches
  }

  /**
   * Extract key terms from a query
   */
  private extractKeyTerms(query: string): string[] {
    // Simple keyword extraction - could be enhanced with NLP
    const stopWords = new Set(['what', 'how', 'when', 'where', 'why', 'who', 'are', 'is', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by']);
    const words = query.toLowerCase().split(/\s+/).filter(word => 
      word.length > 2 && !stopWords.has(word)
    );
    return words.slice(0, 3); // Return top 3 terms
  }

  /**
   * Synthesize a response using the LLM based on search results
   */
  private async synthesizeResponse(question: string, searchResults: LoreLookupResult[]): Promise<KaelariHistorianResponse> {
    // Compile all successful results
    const allResults = searchResults
      .filter(r => r.success && r.results)
      .flatMap(r => r.results!)
      .slice(0, 10); // Limit to top 10 most relevant results

    if (allResults.length === 0) {
      return {
        answer: "I could not find any information about this topic in the Kaelari lore database. The records may not contain details about this specific subject.",
        sources: [],
        confidence: 'low'
      };
    }

    // Build context for the LLM
    const context = allResults.map((result, index) => `
SOURCE ${index + 1}: ${result.title} (${result.section})
RELEVANCE: ${result.relevance_score}
CONTENT: ${result.chunk}
---`).join('\n');

    // Call the LLM
    const prompt = `${this.systemPrompt}

QUESTION: ${question}

AVAILABLE SOURCES:
${context}

Please provide a comprehensive answer based ONLY on the provided sources. Include source citations and clearly mark any speculation.`;

    try {
      const llmResponse = await this.callOllama(prompt);
      
      // Extract confidence level from response (simple heuristic)
      const confidence = this.assessConfidence(llmResponse, allResults);
      
      return {
        answer: llmResponse,
        sources: allResults.map(r => ({
          title: r.title,
          section: r.section,
          relevance: r.relevance_score,
          path: r.path
        })),
        confidence
      };

    } catch (error) {
      console.error('[Kaelari Historian] LLM call failed:', error);
      
      // Fallback: provide a basic factual summary
      const fallbackAnswer = this.createFallbackResponse(question, allResults);
      return {
        answer: fallbackAnswer,
        sources: allResults.map(r => ({
          title: r.title,
          section: r.section,
          relevance: r.relevance_score,
          path: r.path
        })),
        confidence: 'medium'
      };
    }
  }

  /**
   * Call Ollama LLM
   */
  private async callOllama(prompt: string): Promise<string> {
    const response = await fetch(`${this.ollamaBaseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelName,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1, // Low temperature for factual responses
          top_p: 0.9,
          max_tokens: 1000
        }
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.response || "I was unable to generate a response.";
  }

  /**
   * Assess confidence level based on response and sources
   */
  private assessConfidence(response: string, sources: any[]): 'high' | 'medium' | 'low' {
    const hasHighRelevanceSource = sources.some(s => parseFloat(s.relevance_score) > 1.5);
    const hasMultipleSources = sources.length > 2;
    const responseLength = response.length;

    if (hasHighRelevanceSource && hasMultipleSources && responseLength > 200) {
      return 'high';
    } else if (hasHighRelevanceSource || (hasMultipleSources && responseLength > 100)) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Create a fallback response when LLM fails
   */
  private createFallbackResponse(question: string, sources: any[]): string {
    if (sources.length === 0) {
      return "No information found in the lore database regarding this query.";
    }

    const topSource = sources[0];
    return `Based on the available records, here is what I found:

From "${topSource.title}" (${topSource.section}):
${topSource.chunk}

${sources.length > 1 ? `Additional relevant sources found: ${sources.slice(1, 3).map(s => s.title).join(', ')}` : ''}

This information is drawn directly from the Kaelari historical records.`;
  }
}