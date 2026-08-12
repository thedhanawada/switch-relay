export type RunStatus = 'queued' | 'running' | 'needs-review' | 'completed' | 'failed';

export interface WorkerRun {
  id: string;
  title: string;
  role: 'researcher' | 'builder' | 'reviewer' | 'qa';
  model: string;
  repository: string;
  parent?: string;
  parentRun?: string;
  branch?: string;
  sessionId?: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  costUsd?: number;
  notes?: string;
}

export interface SwitchRelayState {
  repository?: string;
  runs: WorkerRun[];
}
