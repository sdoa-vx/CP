import { getDefaultDirForType } from '../sdoaFileApi';
import path from 'path';

export function validatePlacement(filePath: string, manifest: any, issues: string[], suggestions: string[]) {
  if (!manifest || !manifest.type) return;
  try {
    const expectedDir = getDefaultDirForType(manifest.type);
    const normalizedExpected = path.resolve(expectedDir);
    const normalizedActual = path.resolve(path.dirname(filePath));

    if (!normalizedActual.startsWith(normalizedExpected)) {
      issues.push(`Placement violation: File should be in ${normalizedExpected}`);
      suggestions.push(`Move file to ${normalizedExpected}`);
    }
  } catch (err) {
    issues.push(`Unknown or invalid SDOA type: ${manifest.type}`);
  }
}
