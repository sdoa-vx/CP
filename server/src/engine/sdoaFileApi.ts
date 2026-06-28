import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type SdoaModuleType =
  | 'primitive'
  | 'workflow'
  | 'schema'
  | 'token'
  | 'engine';

export interface SdoaManifest {
  id: string;
  type: SdoaModuleType;
  layer: string;
  runtime: string;
  version: string;
  action_surface?: string[];
  commands?: string[];
  events?: string[];
  accepts?: string[];
  slots?: string[];
  dependencies?: string[];
  sovereign_lineage?: string;
  variant_of?: string | null;
  docs?: {
    description: string;
    last_modified: string;
  };
}

export interface SdoaModuleSpec {
  type: SdoaModuleType;
  id: string;
  description: string;
  changeSummary: string;
  codeBody: string; // the actual implementation (without header/manifest)
  dependencies?: string[];
  layer?: string;
  runtime?: string;
  variantOf?: string | null;
  targetDirOverride?: string; // optional explicit dir
}

// Gate 5
export function getDefaultDirForType(type: SdoaModuleType): string {
  switch (type) {
    case 'primitive':
      return path.join(process.cwd(), 'ui', 'primitives');
    case 'workflow':
      return path.join(process.cwd(), 'server', 'workflows');
    case 'schema':
      return path.join(process.cwd(), 'ui', 'data', 'schemas');
    case 'token':
      return path.join(process.cwd(), 'ui');
    case 'engine':
      return path.join(process.cwd(), 'substrate', 'engines');
    default:
      throw new Error(`Unknown SDOA type: ${type}`);
  }
}

export function enforcePlacement(spec: SdoaModuleSpec, filePath: string) {
  const expectedDir = spec.targetDirOverride ?? getDefaultDirForType(spec.type);
  const normalizedExpected = path.resolve(expectedDir);
  const normalizedActual = path.resolve(path.dirname(filePath));

  if (!normalizedActual.startsWith(normalizedExpected)) {
    throw new Error(
      `SDOA placement violation: ${filePath} is not under ${normalizedExpected}`,
    );
  }
}

// Gate 3
export function buildHeaderBlock(
  fileName: string,
  version: string,
  changeSummary: string,
  nowIso: string,
): string {
  return [
    '// ------------------------------------------------------------------',
    `// File:    ${fileName}`,
    `// Version: ${version}`,
    `// Updated: ${nowIso}`,
    `// Changes: ${changeSummary}`,
    '// SDOA compliance is required',
    '// ------------------------------------------------------------------',
    '',
  ].join('\n');
}

// Gate 3.5, Gate 7
export function buildManifest(spec: SdoaModuleSpec, version: string, nowIso: string): SdoaManifest {
  return {
    id: spec.id,
    type: spec.type,
    layer: spec.layer ?? 'application',
    runtime: spec.runtime ?? 'node',
    version,
    action_surface: [],
    commands: [],
    events: [],
    accepts: [],
    slots: [],
    dependencies: spec.dependencies ?? [],
    sovereign_lineage: spec.id,
    variant_of: spec.variantOf ?? null,
    docs: {
      description: spec.description,
      last_modified: nowIso,
    },
  };
}

export function validateManifest(manifest: SdoaManifest) {
  const requiredString = ['id', 'type', 'layer', 'runtime', 'version'] as const;

  for (const key of requiredString) {
    if (!manifest[key] || typeof manifest[key] !== 'string') {
      throw new Error(`Invalid MANIFEST: missing or invalid field "${key}"`);
    }
  }

  if (!manifest.docs?.description) {
    throw new Error('Invalid MANIFEST: docs.description is required');
  }

  if (!manifest.docs?.last_modified) {
    throw new Error('Invalid MANIFEST: docs.last_modified is required');
  }

  if (!Array.isArray(manifest.dependencies)) {
    throw new Error('Invalid MANIFEST: dependencies must be an array');
  }
}

// Gate 4
export function parseVersion(v: string): [number, number, number] {
  const [maj, min, patch] = v.split('.').map((n) => parseInt(n, 10) || 0);
  return [maj, min, patch];
}

export function incrementPatch(v: string): string {
  const [maj, min, patch] = parseVersion(v);
  return `${maj}.${min}.${patch + 1}`;
}

export function extractExistingManifest(source: string): SdoaManifest | null {
  const match = source.match(/export const MANIFEST\s*=\s*({[\s\S]*?});/);
  if (!match) return null;
  try {
    const jsonLike = match[1]
      .replace(/(\w+):/g, '"$1":')
      .replace(/'/g, '"');
    return JSON.parse(jsonLike) as SdoaManifest;
  } catch {
    return null;
  }
}

// Gate 6
export function validateDependencies(manifest: SdoaManifest) {
  for (const dep of manifest.dependencies ?? []) {
    if (typeof dep !== 'string' || dep.trim().length === 0) {
      throw new Error(`Invalid dependency entry: "${dep}"`);
    }
  }
  // TODO: integrate with registry to ensure existence, no cycles, etc.
}

// Gate 2 + Gate 9
export function writeAtomic(filePath: string, content: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

// Gate 8
export function runComplianceChecklist(
  filePath: string,
  header: string,
  manifest: SdoaManifest,
  fullSource: string,
) {
  if (!fullSource.startsWith(header)) {
    throw new Error('SDOA compliance failed: header block missing or altered');
  }

  if (!fullSource.includes('export const MANIFEST')) {
    throw new Error('SDOA compliance failed: MANIFEST export missing');
  }

  if (fullSource.split('\n').length > 500) {
    throw new Error('SDOA compliance failed: file exceeds 500 lines');
  }

  enforcePlacement({ type: manifest.type, id: manifest.id, description: '', changeSummary: '', codeBody: '' }, filePath);
  validateManifest(manifest);
  validateDependencies(manifest);
}

// Public API
export async function createSdoaModule(spec: SdoaModuleSpec): Promise<string> {
  const nowIso = new Date().toISOString();
  const version = '1.0.0';
  const fileName = `${spec.id}.ts`;

  const baseDir = spec.targetDirOverride ?? getDefaultDirForType(spec.type);
  const filePath = path.join(baseDir, fileName);

  enforcePlacement(spec, filePath);

  const header = buildHeaderBlock(fileName, version, spec.changeSummary, nowIso);
  const manifest = buildManifest(spec, version, nowIso);

  const manifestBlock = `export const MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;\n\n`;

  const fullSource = [header, manifestBlock, spec.codeBody.trim(), ''].join('\n');

  runComplianceChecklist(filePath, header, manifest, fullSource);
  writeAtomic(filePath, fullSource);

  return filePath;
}

export async function updateSdoaModule(
  existingPath: string,
  spec: Omit<SdoaModuleSpec, 'id' | 'type'> & { id?: string; type?: SdoaModuleType },
): Promise<string> {
  if (!fs.existsSync(existingPath)) {
    throw new Error(`Cannot update non‑existent module: ${existingPath}`);
  }

  const original = fs.readFileSync(existingPath, 'utf8');
  const existingManifest = extractExistingManifest(original);
  if (!existingManifest) {
    throw new Error('Existing file is not SDOA‑compliant (MANIFEST missing or invalid)');
  }

  const nowIso = new Date().toISOString();
  const newVersion = incrementPatch(existingManifest.version);

  const fileName = path.basename(existingPath);
  const header = buildHeaderBlock(fileName, newVersion, spec.changeSummary, nowIso);

  const updatedManifest: SdoaManifest = {
    ...existingManifest,
    version: newVersion,
    docs: {
      description: spec.description ?? existingManifest.docs?.description ?? '',
      last_modified: nowIso,
    },
    dependencies: spec.dependencies ?? existingManifest.dependencies ?? [],
  };

  validateManifest(updatedManifest);
  validateDependencies(updatedManifest);

  const manifestBlock = `export const MANIFEST = ${JSON.stringify(updatedManifest, null, 2)} as const;\n\n`;

  const fullSource = [header, manifestBlock, spec.codeBody.trim(), ''].join('\n');

  runComplianceChecklist(existingPath, header, updatedManifest, fullSource);
  writeAtomic(existingPath, fullSource);

  return existingPath;
}
