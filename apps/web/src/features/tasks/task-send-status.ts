export type SendJobResult = {
  status: string
  error_code?: string | null
}

export async function waitForSendJobResult<T extends SendJobResult>(
  load: () => Promise<T>,
  options: { maxAttempts?: number; intervalMs?: number; sleep?: (delay: number) => Promise<void> } = {},
) {
  const maxAttempts = options.maxAttempts ?? 45
  const intervalMs = options.intervalMs ?? 1_000
  const sleep = options.sleep ?? ((delay: number) => new Promise<void>((resolve) => setTimeout(resolve, delay)))
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const job = await load()
    if (['succeeded', 'failed', 'cancelled'].includes(job.status)) return job
    if (attempt + 1 < maxAttempts) await sleep(intervalMs)
  }
  return null
}
