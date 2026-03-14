import type { FlowRun, StudioFlow, StudioSession } from "@paddie-studio/types";
import { randomUUID } from "node:crypto";

export class StudioStore {
  private flows = new Map<string, StudioFlow>();
  private runs = new Map<string, FlowRun>();
  private sessions = new Map<string, StudioSession>();

  listFlows(): StudioFlow[] { return Array.from(this.flows.values()); }
  getFlow(id: string): StudioFlow | undefined { return this.flows.get(id); }
  saveFlow(flow: Omit<StudioFlow, "id" | "createdAt" | "updatedAt"> & { id?: string }): StudioFlow {
    const existing = flow.id ? this.flows.get(flow.id) : undefined;
    const now = new Date().toISOString();
    const saved: StudioFlow = { ...flow, id: flow.id ?? randomUUID(), createdAt: existing?.createdAt ?? now, updatedAt: now } as StudioFlow;
    this.flows.set(saved.id, saved);
    return saved;
  }
  deleteFlow(id: string): boolean { return this.flows.delete(id); }
  saveRun(run: FlowRun): FlowRun { this.runs.set(run.id, run); return run; }
  listRuns(flowId: string): FlowRun[] { return Array.from(this.runs.values()).filter((run) => run.flowId === flowId); }
  getRun(runId: string): FlowRun | undefined { return this.runs.get(runId); }
  saveSession(session: StudioSession): StudioSession { this.sessions.set(session.id, session); return session; }
  getSession(id: string): StudioSession | undefined { return this.sessions.get(id); }
  deleteSession(id: string): void { this.sessions.delete(id); }
}

export const studioStore = new StudioStore();
