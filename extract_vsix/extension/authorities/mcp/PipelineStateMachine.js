export class PipelineStateMachine {
  static MANIFEST = {
    id: "PipelineStateMachine.service",
    type: "service",
    version: "1.0.0",
    runtime: "NodeJS",
    capabilities: ["pipeline:transitions"],
    dependencies: [],
    docs: { description: "Enforces pipeline transitions" },
    last_modified: "2026-06-18T00:00:00Z",
    layer: 3,
    requires: [],
    dataFiles: [],
    lifecycle: ["init", "run", "dispose"],
    actions: { commands: {}, events: {}, accepts: {}, slots: {} },
    operationalRole: "conductor",
    optimization: { priority: "high", assertionSuite: "strict" }
  };

  constructor(registry) {
    this.registry = registry;
    this.phases = [
      'ANALYZE',
      'MAP',
      'REUSE',
      'INNOVATE',
      'PLAN',
      'PATCH',
      'AUDIT',
      'MIGRATE',
      'VERIFY'
    ];
  }

  init(registry) {
    this.registry = registry;
    return { ok: true, data: { status: 'PipelineStateMachine initialized' } };
  }

  run(payload) {
    const { action, ...params } = payload;
    switch (action) {
      case 'transition':
        return this.transition(params);
      case 'resume':
        return this.resume(params);
      case 'reset':
        return this.reset(params);
      default:
        return { ok: false, error: `Unknown action: ${action}` };
    }
  }

  dispose() {
    this.registry = null;
    return { ok: true };
  }

  transition(params) {
    const { currentPhase, nextPhase, auditPassed } = params;

    const currentIndex = this.phases.indexOf(currentPhase);
    const nextIndex = this.phases.indexOf(nextPhase);

    if (currentIndex === -1 || nextIndex === -1) {
      return { ok: false, error: 'Invalid phase names provided' };
    }

    if (nextIndex !== currentIndex + 1) {
      return { ok: false, error: 'Phases must run sequentially' };
    }

    if (nextPhase === 'MIGRATE' && !auditPassed) {
      return { ok: false, error: 'MIGRATE blocked: AUDIT did not pass' };
    }

    return { ok: true, data: { status: 'TRANSITION_ALLOWED', currentPhase: nextPhase } };
  }

  resume(params) {
    const { savedPhase } = params;
    if (!this.phases.includes(savedPhase)) {
      return { ok: false, error: 'Invalid saved phase' };
    }
    return { ok: true, data: { status: 'RESUMED', currentPhase: savedPhase } };
  }

  reset(params) {
    return { ok: true, data: { status: 'RESET', currentPhase: 'ANALYZE' } };
  }
}

export default PipelineStateMachine;
