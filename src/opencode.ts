export interface OpenCodeHealth {
  connected: boolean;
  version?: string;
  detail?: string;
}

export async function openCodeHealth(baseUrl: string): Promise<OpenCodeHealth> {
  try {
    const response = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(1500) });
    if (!response.ok) return { connected: false, detail: `OpenCode returned ${response.status}` };
    const payload = (await response.json()) as { healthy?: boolean; version?: string };
    return payload.healthy
      ? { connected: true, version: payload.version }
      : { connected: false, detail: 'OpenCode health check was not healthy' };
  } catch {
    return { connected: false, detail: 'OpenCode server is not reachable' };
  }
}
