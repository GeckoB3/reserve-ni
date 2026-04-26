/**
 * Optional server-side timing for API routes and heavy server functions.
 * Set `DEBUG_PERF_API=1` in the environment to log duration in ms.
 */
export function perfApiStart(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}

export function logApiPerfIfEnabled(label: string, startedAt: number): void {
  if (process.env.DEBUG_PERF_API !== '1') return;
  const ms = typeof performance !== 'undefined' ? Math.round(performance.now() - startedAt) : 0;
  console.info(`[perf] ${label}`, { ms });
}
