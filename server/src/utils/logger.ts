import fs from "fs";
import path from "path";

const LOG_FILE = path.join(process.cwd(), ".sdoa-logs.jsonl");

export const logger = {
  info: (msg: string, meta: any = {}) => log("info", msg, meta),
  warn: (msg: string, meta: any = {}) => log("warn", msg, meta),
  error: (msg: string, meta: any = {}) => log("error", msg, meta)
};

function log(level: string, msg: string, meta: any) {
  const entry = { timestamp: new Date().toISOString(), level, msg, ...meta };
  const line = JSON.stringify(entry) + "\n";
  
  if (level === "error") console.error([ + level.toUpperCase() + ]  + msg, meta);
  else console.log([ + level.toUpperCase() + ]  + msg, meta);

  try {
    fs.appendFileSync(LOG_FILE, line);
  } catch(e) {}
}

export function tailLogs(lines: number = 50): string[] {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const content = fs.readFileSync(LOG_FILE, "utf-8").trim().split("\n");
    return content.slice(-lines);
  } catch(e) {
    return [];
  }
}
