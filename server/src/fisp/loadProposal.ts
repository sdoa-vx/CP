import { db } from './database';

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
