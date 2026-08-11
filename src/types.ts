export type RunStatus = 'queued' | 'running' | 'needs-review' | 'completed' | 'failed';

export interface WorkerRun {
  id: string;
  title: string;
  role: 'researcher' | 'builder' | 'reviewer' | 'qa';
  model: string;
  repository: string;
  branch?: string;
  sessionId?: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  costUsd?: number;
  notes?: string;
}

export interface AgentRelayState {
  repository?: string;
  runs: WorkerRun[];
}
