export type SdoaLayer = 1 | 2 | 3;

export type SdoaType =
  | "primitive"
  | "feature"
  | "adapter"
  | "service"
  | "workflow"
  | "repository"
  | "engine"
  | "schema"
  | "rule"
  | "exemplar";

export interface InnovationPayload {
  id: string;
  type: SdoaType;
  name: string;
  version: string;

  source: {
    language: string;
    content: string;
    path: string;
  };

  sdoa: {
    layer: SdoaLayer;
    placement: string;
    manifest: {
      operationalRole:
        | "registrar"
        | "captain"
        | "conductor"
        | "coach"
        | "probation-officer"
        | "assembly-line"
        | "triage"
        | "savant";
      optimization: {
        priority: "speed" | "safety" | "readability" | "memory-footprint";
        assertionSuite?: string;
      };
    };
  };

  metrics: {
    usageCount: number;
    projectsObserved: number;
    confidence: number;
  };
}

export interface FispProposalEnvelope {
  proposalId: string;
  origin: string;
  timestamp: string;
  innovations: InnovationPayload[];
  summary?: string;
  motivation?: string;
  tags?: string[];
  signature?: string;
}
