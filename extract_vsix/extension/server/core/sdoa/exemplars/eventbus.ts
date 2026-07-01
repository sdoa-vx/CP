// Last modified: 2026-06-09 08:31 UTC
// eventbus.ts — SDOAv5.0 Universal EventBus

export type EventHandler = (data: any, event: string) => void;
export type AnyEventHandler = (event: string, data: any) => void;

interface ListenerEntry {
  handler: EventHandler;
  once: boolean;
}

export class EventBus {
  static MANIFEST = {
    id: "EventBus.service",
    type: "service",
    layer: 3,
    runtime: "Universal",
    version: "5.0.0",
    operationalRole: "savant"
  };

  private listeners = new Map<string, Set<ListenerEntry>>();
  private anyListeners = new Set<AnyEventHandler>();
  private commands = new Map<string, Function>();
  private history: Array<{ event: string; data: any; ts: number }> = [];
  private maxHistory = 50;
  private debug = false;
  private registry: any;

  constructor(registry?: any) {
    this.registry = registry;
  }

  async init(registry: any): Promise<void> {
    this.registry = registry;
  }

  on(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const entry = { handler, once: false };
    this.listeners.get(event)!.add(entry);
    return () => this.off(event, handler);
  }

  once(event: string, handler: EventHandler): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const entry = { handler, once: true };
    this.listeners.get(event)!.add(entry);
    return () => this.off(event, handler);
  }

  off(event: string, handler: EventHandler): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const entry of set) {
      if (entry.handler === handler) {
        set.delete(entry);
        break;
      }
    }
  }

  onAny(handler: AnyEventHandler): void {
    this.anyListeners.add(handler);
  }

  offAny(handler: AnyEventHandler): void {
    this.anyListeners.delete(handler);
  }

  emit(event: string, data: any): void {
    if (this.debug) {
      console.log(`[EventBus] ${event}`, data);
    }

    this.history.push({ event, data, ts: Date.now() });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    // Fire specific listeners
    this.fire(event, data);

    // Fire wildcard listeners on "*"
    if (event !== "*") {
      this.fire("*", { event, data });
    }

    // Fire onAny listeners
    for (const anyHandler of this.anyListeners) {
      try {
        anyHandler(event, data);
      } catch (err: any) {
        console.error(`[EventBus] onAny listener error for "${event}":`, err);
      }
    }
  }

  private fire(event: string, data: any): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;

    const toRemove: ListenerEntry[] = [];
    for (const entry of set) {
      try {
        entry.handler(data, event);
      } catch (err: any) {
        console.error(`[EventBus] Listener error on "${event}":`, err);
        // Prevent infinite loops when reporting error
        if (event !== "bus:error") {
          this.emit("bus:error", { event, error: err.message });
        }
      }
      if (entry.once) {
        toRemove.push(entry);
      }
    }
    toRemove.forEach(e => set.delete(e));
  }

  command(module: string, cmd: string, payloadOrHandler: any): any {
    const key = `${module}:${cmd}`;
    if (typeof payloadOrHandler === "function") {
      this.commands.set(key, payloadOrHandler);
      return;
    }

    const handler = this.commands.get(key);
    if (!handler) {
      // If we have a registry, try calling the module method directly
      if (this.registry) {
        try {
          const instance = this.registry.get(module);
          if (instance && typeof instance[cmd] === "function") {
            return Promise.resolve(instance[cmd](payloadOrHandler));
          }
        } catch (_) {}
      }
      console.warn(`[EventBus] No command handler registered: ${key}`);
      return Promise.resolve(null);
    }

    try {
      return Promise.resolve(handler(payloadOrHandler));
    } catch (err) {
      console.error(`[EventBus] Command error "${key}":`, err);
      return Promise.reject(err);
    }
  }

  async commandAsync(module: string, cmd: string, payload: any): Promise<any> {
    return this.command(module, cmd, payload);
  }

  bridge(moduleId: string, instance: any): void {
    if (!instance || typeof instance.emit !== "function") {
      console.warn(`[EventBus] Cannot bridge "${moduleId}" — no emit() method`);
      return;
    }

    const originalEmit = instance.emit.bind(instance);
    instance.emit = (event: string, data: any) => {
      originalEmit(event, data);
      this.emit(`${moduleId}:${event}`, data);
    };
  }

  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  getHistory(): Array<{ event: string; data: any; ts: number }> {
    return [...this.history];
  }

  listListeners(event: string): number {
    return this.listeners.get(event)?.size || 0;
  }
}
