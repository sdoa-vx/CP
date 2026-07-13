import * as fs from "node:fs";
import * as path from "node:path";
import { Chronicle } from "./Chronicle.service";
import { logger } from "../utils/logger";

export class WorkspaceWatcherService {
  private watcher: fs.FSWatcher | null = null;
  private isRunning = false;
  
  // Debounce tracking
  private debounceMap = new Map<string, NodeJS.Timeout>();
  private sizeMap = new Map<string, number>();
  private readonly DEBOUNCE_MS = 500;

  // Paths to explicitly ignore from tracking
  private readonly IGNORED_PATHS = [
    'node_modules',
    '.git',
    'dist',
    '.sqlite',
    '.sqlite-journal',
    '.db',
    '.db-journal',
    '.vscode',
    'package-lock.json',
    '.system_generated',
    'chronicle.json',
    '.sdoa-logs.jsonl'
  ];

  async init() {
    // Initialization setup if needed
  }

  async run() {
    if (this.isRunning) return { status: "already_running" };

    const workspaceRoot = process.cwd();
    logger.info(`[WorkspaceWatcher] Initializing filesystem watcher on ${workspaceRoot}...`);

    try {
      this.watcher = fs.watch(workspaceRoot, { recursive: true }, (eventType, filename) => {
        if (!filename) return;

        // Convert path separators to standard forward slashes for matching
        const normalizedFilename = filename.replace(/\\/g, '/');

        // Check if the file is in an ignored directory/file
        if (this.isIgnored(normalizedFilename)) {
          return;
        }

        this.handleFileEvent(normalizedFilename, eventType);
      });

      this.isRunning = true;
      return { status: "watching", path: workspaceRoot };
    } catch (err) {
      logger.error("[WorkspaceWatcher] Failed to start filesystem watcher:", err);
      return { status: "error", error: String(err) };
    }
  }

  async dispose() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.debounceMap.forEach(clearTimeout);
    this.debounceMap.clear();
    this.sizeMap.clear();
    this.isRunning = false;
  }

  private isIgnored(filename: string): boolean {
    return this.IGNORED_PATHS.some(ignorePattern => {
      // Ignore if the file path contains the ignored directory name or exact file name
      return filename.includes(ignorePattern);
    });
  }

  private handleFileEvent(filename: string, eventType: string) {
    // Clear any existing debounce timer for this specific file
    if (this.debounceMap.has(filename)) {
      clearTimeout(this.debounceMap.get(filename)!);
    }

    // Set a new debounce timer
    const timer = setTimeout(() => {
      this.debounceMap.delete(filename);
      this.recordChangeEvent(filename, eventType);
    }, this.DEBOUNCE_MS);

    this.debounceMap.set(filename, timer);
  }

  private recordChangeEvent(filename: string, eventType: string) {
    // Get basic stats if possible to verify it's a file and not a deleted item
    const fullPath = path.join(process.cwd(), filename);
    let size = 0;
    
    try {
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) return; // Don't log directory changes directly
        size = stats.size;
      } else {
        eventType = 'deleted';
      }
    } catch (err) {
      // File might have been moved/deleted too fast
      eventType = 'deleted';
    }

    const prevSize = this.sizeMap.get(filename) || 0;
    if (eventType !== 'deleted') {
      this.sizeMap.set(filename, size);
    } else {
      this.sizeMap.delete(filename);
    }

    // Record the change directly into the Sovereign Chronicle so TimeMachine picks it up!
    Chronicle.recordEvent("filesystem:change", {
      file: filename,
      action: eventType,
      sizeBytes: size,
      prevSizeBytes: prevSize,
      source: "Manual Edit"
    }, "WorkspaceWatcher");
    
    logger.info(`[WorkspaceWatcher] Logged ${eventType} for ${filename}`);
  }
}

export const WorkspaceWatcher = new WorkspaceWatcherService();
