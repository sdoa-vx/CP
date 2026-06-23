import { db } from './database';

export const MANIFEST = {
  id: "loadProposal.ts",
  type: "module",
  layer: 4,
  runtime: "TypeScript",
  version: "1.0.0",
  operationalRole: "infrastructure",
  optimization: { priority: "stability" },
  capabilities: [
    "loadProposal",
    "updateProposalStatus"
  ],
  dependencies: [
    "./database"
  ],
  docs: "Auto-generated enriched SDOA manifest via static analysis"
};



export async function loadProposal(id: string) {
  try {
    const row = db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as any;
    if (!row) return null;
    return JSON.parse(row.data);
  } catch (err) {
    return null;
  }
}

export async function updateProposalStatus(id: string, status: string, notes: string = "") {
  try {
    db.prepare('UPDATE proposals SET status = ?, notes = ? WHERE id = ?').run(status, notes, id);
  } catch (err) {
    console.error("Failed to update proposal status:", err);
  }
}
