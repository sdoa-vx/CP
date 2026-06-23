import * as vscode from "vscode";
import { AIProvider } from "./aiCapabilityScanner";
import { InnovationPayload } from "../api/submitProposal";
import { getAiSystemPromptBlock } from "../../../server/src/engine/doctrine";

export const MANIFEST = {
  id: "semanticDecomposer.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "runSemanticDecomposition",
    "AuthModalView"
  ],
  dependencies: [
    "vscode",
    "./aiCapabilityScanner",
    "../api/submitProposal",
    "../../../server/src/engine/doctrine"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



export async function runSemanticDecomposition(doc: vscode.TextDocument, provider: AIProvider): Promise<InnovationPayload[] | null> {
  const content = doc.getText();
  
  const doctrinePrompt = getAiSystemPromptBlock();

  const systemPrompt = `You are an SDOA Architect. Your job is to semantically decompose legacy monoliths.
Extract the code into separate SDOA modules: Primitives (UI), Workflows (Logic), and Tokens (CSS).
Respond ONLY with a JSON array matching the InnovationPayload structure. Do not wrap in markdown blocks.
Example:
[
  {
    "type": "primitive",
    "name": "AuthModalView",
    "source": { "language": "tsx", "content": "export const AuthModalView = () => <div/>;" },
    "sdoa": { "layer": 2, "placement": "ui/primitives", "manifest": { "operationalRole": "detected-innovation", "optimization": { "priority": "speed" } } }
  }
]

${doctrinePrompt}
`;

  console.log(`[SDOA] Initiating Semantic Decomposition via ${provider.name}...`);

  try {
    let rawResponse = "";

    if (provider.type === "ollama") {
      const res = await fetch(provider.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: provider.model,
          system: systemPrompt,
          prompt: `Decompose this file:\n\n${content}`,
          stream: false,
          format: "json"
        })
      });
      const data = await res.json();
      rawResponse = data.response;
    } else if (provider.type === "openai") {
      const res = await fetch(provider.endpoint, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${provider.key}`
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Decompose this file:\n\n${content}` }
          ],
          response_format: { type: "json_object" }
        })
      });
      const data = await res.json();
      rawResponse = data.choices[0].message.content;
    }

    if (rawResponse) {
      const parsed: InnovationPayload[] = JSON.parse(rawResponse);
      return Array.isArray(parsed) ? parsed : null;
    }
  } catch (error) {
    console.error(`[SDOA] Semantic Decomposer failed on ${provider.name}:`, error);
    return null; // Force fallback
  }

  return null;
}
