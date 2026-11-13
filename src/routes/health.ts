import { Hono } from 'hono'

export const healthRoutes = new Hono()
  .basePath('/api/health')
  .get('/', (c) => c.json({ status: 'ok' }))
