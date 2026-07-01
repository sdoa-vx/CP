// C:\MCP\tracksdoa-v2\src\agents\sdoa_agent.ts
import { handleLlmRequest } from "C:\\MCP\\mesh\\looking_glass\\looking_glass";

export async function sdoaAgent(task: string, input: string) {
  const response = await handleLlmRequest({
    task: task as any,
    input
  });

  if (!response.sdoaAligned) {
    // Optionally reject or route to governance
    throw new Error("Response not SDOA-aligned");
  }

  return response;
}
