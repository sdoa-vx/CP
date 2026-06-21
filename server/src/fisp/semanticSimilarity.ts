import { db } from './database';

function getTokens(code: string): Set<string> {
  const clean = code.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '').replace(/[^\w\s]/g, ' ');
  const words = clean.split(/\s+/).filter(w => w.length > 2).map(w => w.toLowerCase());
  return new Set(words);
}

function calculateJaccard(setA: Set<string>, setB: Set<string>): number {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

async function queryOllamaSimilarity(inputCode: string, targetCode: string): Promise<number | null> {
  try {
    const prompt = `You are a structural code analyzer. Compare the following two code snippets. Do they perform the exact same core function or architectural role? Answer ONLY with a number between 0.0 and 1.0 representing the semantic similarity.\n\nCode 1:\n${inputCode}\n\nCode 2:\n${targetCode}`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3 second max wait to prevent blocking VS Code

    const response = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3', // Common default model
        prompt: prompt,
        stream: false
      }),
      signal: controller.signal as any
    });
    
    clearTimeout(timeout);
    
    if (!response.ok) return null;
    
    const data: any = await response.json();
    const match = data.response.match(/0\.\d+|1\.0/);
    if (match) return parseFloat(match[0]);
    return null;
  } catch (err) {
    return null; // Silent fallback if Ollama is offline or times out
  }
}

export async function checkSemanticSimilarity(innovation: any) {
  try {
    const inputCode = innovation.code || JSON.stringify(innovation);
    const inputTokens = getTokens(inputCode);

    if (inputTokens.size === 0) return { merged: false, id: '' };

    const rows = db.prepare('SELECT id, manifestJson FROM modules').all() as any[];
    const candidates = [];

    // Pre-filter with fast Jaccard
    for (const row of rows) {
      const manifest = JSON.parse(row.manifestJson || '{}');
      const targetCode = manifest.code || manifest.description || JSON.stringify(manifest);
      const targetTokens = getTokens(targetCode);

      const score = calculateJaccard(inputTokens, targetTokens);
      candidates.push({ id: row.id, code: targetCode, score });
    }

    candidates.sort((a, b) => b.score - a.score);
    
    if (candidates.length > 0) {
      const best = candidates[0];
      
      // Try backend AI Server (Ollama)
      const llmScore = await queryOllamaSimilarity(inputCode, best.code);
      
      if (llmScore !== null) {
        // AI Server responded
        if (llmScore >= 0.80) {
          return { merged: true, id: best.id, suggestion: `// Recommended Replacement Component: ${best.id}\n${best.code}` };
        }
      } else {
        // AI Server Offline - Fallback to Jaccard
        if (best.score >= 0.80) {
          return { merged: true, id: best.id, suggestion: `// Recommended Replacement Component: ${best.id}\n${best.code}` };
        }
      }
    }

    return { merged: false, id: '' };
  } catch (err) {
    console.error("Semantic Similarity Error:", err);
    return { merged: false, id: '' };
  }
}
