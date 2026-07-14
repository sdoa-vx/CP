// SDOA v1.2 compliant — Native Component
// Last modified: 2026-07-13T00:00:00Z
import { useBackend } from "../hooks/useBackend"; // Custom hook for BackendConnector

const MANIFEST = {
    id:      "HealthView.dashboard",
    type:    "dashboard",
    layer:   3,
    runtime: "Browser",
    version: "1.0.1",
    requires: ["BackendConnector.ui"],
    dependencies: ["BackendConnector.ui"],
    capabilities: [
        "dashboard:render",
        "dashboard:triggerMaintenance"
    ],
    docs: {
        description: "React dashboard component that displays LLM tier and Bun runtime health indicators and lets an operator trigger the sys_provision_bun maintenance workflow via BackendConnector.",
        author: "ProtoAI Team"
    },
    last_modified: "2026-07-13T00:00:00Z"
};

export const HealthView = () => {
  const { runWorkflow, status } = useBackend();
  const [metrics, setMetrics] = useState({ llm: "active", bun: "healthy" });

  const triggerMaintenance = async () => {
    await runWorkflow("sys_provision_bun");
    this.refresh();
  };

  return (
    <div className={`sdoa-status-${status}`}>
      <h3>System Health</h3>
      <div className="indicator">LLM Tier: {metrics.llm}</div>
      <button onClick={triggerMaintenance}>Repair Bun Runtime</button>
    </div>
  );
};
