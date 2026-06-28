import { extractPrimitive } from './primitives';
import { extractWorkflow } from './workflows';
import { extractSchema } from './schemas';
import { extractToken } from './tokens';
import { extractEngine } from './engines';
import { submitProposal } from '../api/submitProposal';

export async function runExtraction(type: string, hits: any[]) {
  if (!hits || hits.length === 0) return;

  switch (type) {
    case 'primitive':
      await extractPrimitive(hits);
      break;
    case 'workflow':
      await extractWorkflow(hits);
      break;
    case 'schema':
      await extractSchema(hits);
      break;
    case 'token':
      await extractToken(hits);
      break;
    case 'engine':
      await extractEngine(hits);
      break;
    default:
      console.warn(`Unknown extraction type: ${type}`);
      return;
  }

  // Queue the new module for Supabase sync
  for (const hit of hits) {
    const name = hit.name || hit.tokenName || "ExtractedModule";
    await submitProposal({
      name,
      type,
      source: { language: 'typescript', content: `// Extracted ${type} module`, path: hit.filePath },
      sdoa: { layer: 2, placement: "application" },
      metadata: { usageCount: hits.length, projectsObserved: 1, confidence: 1.0 }
    }).catch(err => console.error("Error queuing extracted module for sync:", err));
  }
}
