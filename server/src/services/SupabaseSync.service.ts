import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { subscribe, unsubscribe, emit } from "../engine/events";
import { PrimeDiscovery } from "./PrimeDiscovery.service";
import { Chronicle } from "./Chronicle.service";
import { ConfigSovereign } from "./ConfigSovereign.service";

export class SupabaseSyncService {
  private _busUnsub: Array<() => void> = [];
  private supabase: any = null;
  private exportPath = path.resolve(process.cwd(), "server", "data", "prime_export.json");
  private syncState: "Pending" | "Synced" | "Failed (local report available)" = "Pending";

  async init() {
    const config = ConfigSovereign.getLogicalConfig();
    const supabaseUrl = config?.supabase?.url || "";
    const supabaseKey = ConfigSovereign.resolveSecret("supabase") || "";
    
    if (supabaseUrl && supabaseKey) {
      try {
        this.supabase = createClient(supabaseUrl, supabaseKey);
      } catch (e) {
        console.error("Failed to init Supabase client:", e);
      }
    }
    
    const dataDir = path.dirname(this.exportPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this._subscribeEvents();
  }

  async run() {
    return { status: "ready", syncState: this.syncState };
  }

  async dispose() {
    this._unsubscribeEvents();
  }
  
  getSyncStatus() {
    return this.syncState;
  }

  private async _handleSync() {
    try {
      const db = PrimeDiscovery.getDatabase();
      if (!db) return;

      this.syncState = "Pending";
      Chronicle.recordEvent("prime:sync_started", {}, "SupabaseSync");

      // Gather report data
      const artifacts = db.prepare(`
        SELECT a.*, c.classification, c.confidence, c.reasoning 
        FROM prime_artifacts a 
        JOIN prime_classifications c ON a.id = c.artifact_id
      `).all();

      const report = {
        generatedAt: new Date().toISOString(),
        machineId: "local-node",
        artifacts
      };

      let syncSuccess = false;

      if (this.supabase) {
        try {
          const { error } = await this.supabase
            .from("sdoa_prime_reports")
            .insert([report]);

          if (!error) {
            syncSuccess = true;
          } else {
            console.error("Supabase insert error:", error.message);
          }
        } catch (err) {
          console.error("Supabase network error:", err);
        }
      }

      if (syncSuccess) {
        this.syncState = "Synced";
        Chronicle.recordEvent("prime:sync_success", {}, "SupabaseSync");
        emit("prime:sync_completed", { success: true });
      } else {
        // Graceful fallback
        this.syncState = "Failed (local report available)";
        try {
          fs.writeFileSync(this.exportPath, JSON.stringify(report, null, 2), "utf-8");
        } catch (e) {
          console.error("Failed to write fallback report:", e);
        }
        Chronicle.recordEvent("prime:sync_failed", { reason: "Supabase unreachable/unauthorized", fallback: this.exportPath }, "SupabaseSync");
        emit("prime:sync_completed", { success: false, fallback: this.exportPath });
      }
    } catch (err) {
      console.error("[SupabaseSync] Unhandled exception during sync:", err);
    }
  }

  private _subscribeEvents() {
    const onClassified = () => {
      this._handleSync();
    };

    subscribe("prime:classification_completed", onClassified);
    this._busUnsub.push(() => unsubscribe("prime:classification_completed", onClassified));
  }

  private _unsubscribeEvents() {
    this._busUnsub.forEach(fn => fn());
    this._busUnsub = [];
  }
}

export const SupabaseSync = new SupabaseSyncService();
