import { Router } from "../utils/Router";
import { Provisioner } from "../services/Provisioner.service";
import { LifecycleManager } from "../services/LifecycleManager.service";
import { TransportArbitration } from "../services/TransportArbitration.service";

const router = new Router();

router.get("/api/mesh/topology", (req, res) => {
  try {
    const registry = Provisioner.getRegistry();
    const states = LifecycleManager.getStates();
    const routes = TransportArbitration.getRoutingTable();

    const nodes: any[] = [];
    const links: any[] = [];

    // 1. Create Nodes for abstract Modules
    registry.forEach(entry => {
      nodes.push({
        id: entry.moduleId,
        type: "module",
        group: 1,
        radius: 15,
        name: entry.moduleId
      });

      // 2. Create Nodes for concrete Sleeves (Versions)
      entry.versions.forEach(version => {
        // Determine health/state
        let healthColor = "#9ca3af"; // inactive/gray
        const state = states.find(s => s.moduleId === entry.moduleId);
        const route = routes.find(r => r.moduleId === entry.moduleId);

        let isActive = state?.activeVersionId === version.versionId;
        let isRouted = route?.activeSleeveId === version.versionId;

        if (isActive) healthColor = "#3b82f6"; // blue
        if (isRouted) {
          if (route?.driftStatus === "critical") healthColor = "#ef4444";
          else if (route?.driftStatus === "degraded") healthColor = "#f59e0b";
          else healthColor = "#10b981"; // green (routed and healthy)
        }

        nodes.push({
          id: version.versionId,
          type: "sleeve",
          group: 2,
          radius: isActive ? 12 : 8,
          name: version.versionId.substring(0, 8) + "...",
          color: healthColor
        });

        // Link Module -> Sleeve (Lineage link)
        links.push({
          source: entry.moduleId,
          target: version.versionId,
          type: "lineage",
          value: 1
        });

        // Link Arbitration Routing (if routed to this sleeve)
        if (isRouted) {
          links.push({
            source: "Arbitration_Brain",
            target: version.versionId,
            type: "route",
            value: 3
          });
        }
      });
    });

    // Add Arbitration Brain Node
    if (nodes.length > 0) {
      nodes.push({
        id: "Arbitration_Brain",
        type: "brain",
        group: 0,
        radius: 20,
        name: "Routing Brain",
        color: "#8b5cf6" // purple
      });
    }

    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, topology: { nodes, links } }));
  } catch (err: any) {
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

export default router;
