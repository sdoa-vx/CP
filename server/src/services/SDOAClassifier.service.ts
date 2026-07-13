import { subscribe, unsubscribe, emit } from "../engine/events";
import { PrimeDiscovery } from "./PrimeDiscovery.service";
import { Chronicle } from "./Chronicle.service";

export class SDOAClassifierService {
  private _busUnsub: Array<() => void> = [];

  async init() {
    this._subscribeEvents();
  }

  async run() {
    return { status: "ready" };
  }

  async dispose() {
    this._unsubscribeEvents();
  }

  public classifyArtifacts() {
    const db = PrimeDiscovery.getDatabase();
    if (!db) return;

    Chronicle.recordEvent("prime:classification_started", {}, "SDOAClassifier");

    const artifacts = db.prepare(`SELECT * FROM prime_artifacts`).all() as any[];
    const insertClass = db.prepare(`INSERT OR REPLACE INTO prime_classifications (artifact_id, classification, confidence, reasoning) VALUES (?, ?, ?, ?)`);
    
    db.transaction(() => {
      let count = 0;
      for (const artifact of artifacts) {
        let classification = "unknown";
        let confidence = 0;
        let reasoning = "";

        // Heuristics for classification
        if (artifact.has_manifest === 1 && artifact.type === "service") {
          classification = "recognized_component";
          confidence = 100;
          reasoning = "Has MANIFEST and follows Service class pattern.";
        } else if (artifact.has_manifest === 1) {
          classification = "recognized_component";
          confidence = 80;
          reasoning = "Has MANIFEST but is not a standard service class.";
        } else if (artifact.type === "service") {
          classification = "potential_component";
          confidence = 60;
          reasoning = "Follows Service pattern but lacks MANIFEST.";
        } else if (artifact.name.includes("Manager") || artifact.name.includes("Engine") || artifact.name.includes("Controller")) {
          classification = "innovation_candidate";
          confidence = 70;
          reasoning = "Structural pattern suggests sovereign management behavior.";
        } else if (artifact.raw_content && (artifact.raw_content.includes("spawn(") || artifact.raw_content.includes("worker"))) {
          classification = "innovation_candidate";
          confidence = 90;
          reasoning = "Contains process orchestration logic suitable for autonomous modules.";
        }

        if (classification !== "unknown") {
          insertClass.run(artifact.id, classification, confidence, reasoning);
          count++;
        }
      }
      
      Chronicle.recordEvent("prime:classification_completed", { classifiedCount: count }, "SDOAClassifier");
      emit("prime:classification_completed", { classifiedCount: count });
    })();
  }

  private _subscribeEvents() {
    const onDiscovery = (payload: any) => {
      this.classifyArtifacts();
    };

    subscribe("prime:discovery_completed", onDiscovery);
    this._busUnsub.push(() => unsubscribe("prime:discovery_completed", onDiscovery));
  }

  private _unsubscribeEvents() {
    this._busUnsub.forEach(fn => fn());
    this._busUnsub = [];
  }
}

export const SDOAClassifier = new SDOAClassifierService();
