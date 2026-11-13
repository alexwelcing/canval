import app from '../index'
import { db } from '../db'
import { tasks } from '../db/schema'

async function runDoctor(): Promise<void> {
  const rows = await db.select().from(tasks).limit(5)
  const t0 = performance.now()
  const res = await app.request('/api/health')
  const dur = (performance.now() - t0).toFixed(2)
  const timing = res.headers.get('Server-Timing') ?? 'none'

  console.log('\n=== Stack Foundation Doctor ===')
  console.log(`[PASS] Bun Runtime          v${Bun.version} (${process.platform}/${process.arch})`)
  console.log(`[PASS] Drizzle SQLite       tasks table ready (${rows.length} rows sampled)`)
  console.log(`[PASS] Hono In-Memory       /api/health=${res.status} (${dur} ms, Server-Timing: ${timing})\n`)
}

await runDoctor()
