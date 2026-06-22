import path from "node:path";

export function planCanonicalPath(proposal: any) {
  const type = proposal?.type;
  const name = (proposal?.name || "Extracted").replace(/\s+/g, "");

  const validTypes = ["primitive", "workflow", "validator", "schema"];
  if (!validTypes.includes(type)) {
    const err = new Error(`Invalid proposal type: ${type}`);
    (err as any).statusCode = 400;
    throw err;
  }

  const dirName = type + "s";
  const dir = `server/src/${dirName}`;
  return path.join(process.cwd(), dir, `${name}.ts`);
}
