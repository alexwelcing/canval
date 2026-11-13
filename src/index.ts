import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import { perfMiddleware } from './middleware/perf'
import { healthRoutes } from './routes/health'
import { taskRoutes } from './routes/tasks'
import { voiceRoutes, websocket } from './routes/voice'

const app = new Hono()
  .use('*', logger())
  .use('*', cors())
  .use('*', perfMiddleware)
  .route('/', healthRoutes)
  .route('/', taskRoutes)
  .route('/', voiceRoutes)
  .use('/public/*', serveStatic({ root: './' }))
  .get('/', serveStatic({ path: './public/index.html' }))
  .get('/app.js', serveStatic({ path: './public/app.js' }))
  .get('/app.css', serveStatic({ path: './public/app.css' }))

app.onError((err, c) => {
  return c.json({ error: err.message || 'Internal Server Error' }, 500)
})

export type AppType = typeof app

export default {
  port: Number(Bun.env.PORT ?? 3000),
  fetch: app.fetch,
  websocket,
  request: app.request.bind(app),
}
