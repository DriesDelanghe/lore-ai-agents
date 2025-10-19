// src/analyze.ts
// Database analysis and statistics for understanding indexed content

import Database from "better-sqlite3";

export async function analyzeDatabase(dbPath: string, debug = false) {
  try {
    const db = new Database(dbPath, { readonly: true });
    
    // Basic stats
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_chunks,
        COUNT(DISTINCT metadata) as unique_metadata,
        AVG(LENGTH(chunk)) as avg_chunk_length,
        MIN(LENGTH(chunk)) as min_chunk_length,
        MAX(LENGTH(chunk)) as max_chunk_length
      FROM chunks
    `).get() as any;
    
    console.log("=== DATABASE OVERVIEW ===");
    console.log(`Total chunks: ${stats.total_chunks}`);
    console.log(`Average chunk length: ${Math.round(stats.avg_chunk_length)} chars`);
    console.log(`Chunk length range: ${stats.min_chunk_length} - ${stats.max_chunk_length} chars`);
    console.log();
    
    // Files breakdown
    const fileStats = db.prepare(`
      SELECT 
        path,
        COUNT(*) as chunk_count,
        AVG(LENGTH(chunk)) as avg_length
      FROM chunks 
      GROUP BY path 
      ORDER BY chunk_count DESC
    `).all() as any[];
    
    console.log("=== FILES BREAKDOWN ===");
    fileStats.forEach(f => {
      console.log(`${f.path}: ${f.chunk_count} chunks, avg ${Math.round(f.avg_length)} chars`);
    });
    console.log();
    
    // Metadata analysis
    const chunks = db.prepare(`SELECT metadata FROM chunks WHERE metadata IS NOT NULL`).all() as any[];
    
    if (chunks.length > 0) {
      const metadataStats = {
        content_types: new Map<string, number>(),
        universes: new Map<string, number>(),
        species: new Map<string, number>(),
        subspecies: new Map<string, number>(),
        importance_scores: [] as number[],
        entities: new Map<string, number>(),
        concepts: new Map<string, number>(),
      };
      
      for (const row of chunks) {
        try {
          const meta = JSON.parse(row.metadata);
          
          if (meta.content_type) {
            metadataStats.content_types.set(meta.content_type, 
              (metadataStats.content_types.get(meta.content_type) || 0) + 1);
          }
          
          if (meta.universe) {
            metadataStats.universes.set(meta.universe,
              (metadataStats.universes.get(meta.universe) || 0) + 1);
          }
          
          if (meta.species) {
            metadataStats.species.set(meta.species,
              (metadataStats.species.get(meta.species) || 0) + 1);
          }
          
          if (meta.subspecies) {
            metadataStats.subspecies.set(meta.subspecies,
              (metadataStats.subspecies.get(meta.subspecies) || 0) + 1);
          }
          
          if (typeof meta.importance_score === 'number') {
            metadataStats.importance_scores.push(meta.importance_score);
          }
          
          if (meta.entities) {
            meta.entities.forEach((entity: string) => {
              metadataStats.entities.set(entity,
                (metadataStats.entities.get(entity) || 0) + 1);
            });
          }
          
          if (meta.concepts) {
            meta.concepts.forEach((concept: string) => {
              metadataStats.concepts.set(concept,
                (metadataStats.concepts.get(concept) || 0) + 1);
            });
          }
          
        } catch (e) {
          if (debug) console.warn("Failed to parse metadata:", e);
        }
      }
      
      console.log("=== CONTENT ANALYSIS ===");
      
      if (metadataStats.content_types.size > 0) {
        console.log("Content Types:");
        Array.from(metadataStats.content_types.entries())
          .sort(([,a], [,b]) => b - a)
          .forEach(([type, count]) => {
            console.log(`  ${type}: ${count} chunks`);
          });
        console.log();
      }
      
      if (metadataStats.universes.size > 0) {
        console.log("Universes:");
        metadataStats.universes.forEach((count, universe) => {
          console.log(`  ${universe}: ${count} chunks`);
        });
        console.log();
      }
      
      if (metadataStats.species.size > 0) {
        console.log("Species:");
        metadataStats.species.forEach((count, species) => {
          console.log(`  ${species}: ${count} chunks`);
        });
        console.log();
      }
      
      if (metadataStats.importance_scores.length > 0) {
        const scores = metadataStats.importance_scores;
        const avgImportance = scores.reduce((a, b) => a + b, 0) / scores.length;
        const sortedScores = scores.sort((a, b) => a - b);
        const medianImportance = sortedScores[Math.floor(sortedScores.length / 2)];
        
        console.log("Importance Scores:");
        console.log(`  Average: ${avgImportance.toFixed(3)}`);
        console.log(`  Median: ${medianImportance.toFixed(3)}`);
        console.log(`  Range: ${sortedScores[0].toFixed(3)} - ${sortedScores[sortedScores.length - 1].toFixed(3)}`);
        console.log();
      }
      
      if (metadataStats.entities.size > 0) {
        console.log("Top Entities:");
        Array.from(metadataStats.entities.entries())
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .forEach(([entity, count]) => {
            console.log(`  ${entity}: ${count} occurrences`);
          });
        console.log();
      }
      
      if (metadataStats.concepts.size > 0) {
        console.log("Top Concepts:");
        Array.from(metadataStats.concepts.entries())
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .forEach(([concept, count]) => {
            console.log(`  ${concept}: ${count} occurrences`);
          });
        console.log();
      }
    }
    
    // Section path analysis
    const sectionStats = db.prepare(`
      SELECT 
        json_extract(metadata, '$.section_path') as section_path,
        json_extract(metadata, '$.section_title') as section_title,
        COUNT(*) as chunk_count
      FROM chunks 
      WHERE metadata IS NOT NULL
      GROUP BY section_path
      ORDER BY chunk_count DESC
      LIMIT 20
    `).all() as any[];
    
    if (sectionStats.length > 0) {
      console.log("=== TOP SECTIONS ===");
      sectionStats.forEach(s => {
        const title = s.section_title ? ` (${s.section_title})` : '';
        console.log(`${s.section_path}${title}: ${s.chunk_count} chunks`);
      });
    }
    
    db.close();
    
  } catch (error) {
    console.error("Error analyzing database:", error);
    process.exit(1);
  }
}