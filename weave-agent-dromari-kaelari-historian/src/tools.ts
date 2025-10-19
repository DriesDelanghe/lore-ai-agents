// src/tools.ts
// Tool definitions for the Kaelari Historian agent

import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Schema for the lore lookup tool
export const LoreLookupSchema = z.object({
  query: z.string().describe('The search query to look up in the Kaelari lore database'),
  contentType: z.enum(['narrative', 'list', 'quote', 'mixed']).optional().describe('Filter by content type'),
  minImportance: z.number().min(0).max(1).optional().describe('Minimum importance score (0.0-1.0)'),
  maxResults: z.number().min(1).max(10).default(5).describe('Maximum number of results to return')
});

export type LoreLookupParams = z.infer<typeof LoreLookupSchema>;

export interface LoreLookupResult {
  success: boolean;
  results?: Array<{
    id: string;
    relevance_score: string;
    path: string;
    section: string;
    title: string;
    content_type: string;
    importance: string;
    entities: string[];
    concepts: string[];
    chunk: string;
  }>;
  totalFound?: number;
  error?: string;
}

/**
 * Execute a search in the Kaelari lore database using the weave-chunker CLI
 */
export async function lookupLore(params: LoreLookupParams): Promise<LoreLookupResult> {
  try {
    // Build the search command
    const args = [
      'weave-chunker', 
      'search',
      '--q', `"${params.query}"`,
      '--db', '/app/db/vec.db',
      '-k', params.maxResults.toString()
    ];

    // Add optional filters
    if (params.contentType) {
      args.push('--content-type', params.contentType);
    }
    if (params.minImportance !== undefined) {
      args.push('--min-importance', params.minImportance.toString());
    }

    const command = args.join(' ');
    console.log(`[Lore Lookup] Executing: ${command}`);
    
    const { stdout, stderr } = await execAsync(command);
    
    if (stderr) {
      console.warn(`[Lore Lookup] Warning: ${stderr}`);
    }

    // Parse the JSON response from weave-chunker
    const response = JSON.parse(stdout);
    
    return {
      success: true,
      results: response.hits?.map((hit: any) => ({
        id: hit.id,
        relevance_score: hit.relevance_score,
        path: hit.path,
        section: hit.section,
        title: hit.title,
        content_type: hit.content_type,
        importance: hit.importance,
        entities: hit.entities || [],
        concepts: hit.concepts || [],
        chunk: hit.full_chunk || hit.chunk
      })) || [],
      totalFound: response.results_found || 0
    };

  } catch (error) {
    console.error('[Lore Lookup] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Get database statistics and available content overview
 */
export async function analyzeLoreDatabase(): Promise<any> {
  try {
    const { stdout } = await execAsync('weave-chunker analyze --db /app/db/vec.db');
    
    // Parse the text output (analyze doesn't return JSON)
    const lines = stdout.split('\n');
    const analysis: any = {
      totalChunks: 0,
      files: [],
      topEntities: [],
      topConcepts: []
    };

    // Simple parsing of the analyze output
    for (const line of lines) {
      if (line.includes('Total chunks:')) {
        analysis.totalChunks = parseInt(line.match(/\d+/)?.[0] || '0');
      }
      // Could add more parsing here if needed
    }

    return analysis;
  } catch (error) {
    console.error('[Database Analysis] Error:', error);
    return { error: 'Failed to analyze database' };
  }
}