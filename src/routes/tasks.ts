import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { tasks } from '../db/schema'

const createTaskSchema = z.object({
  title: z.string().min(1),
})

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  completed: z.boolean().optional(),
})

export const taskRoutes = new Hono()
  .basePath('/api/tasks')
  .get('/', async (c) => {
    const allTasks = await db.select().from(tasks)
    return c.json(allTasks)
  })
  .post('/', zValidator('json', createTaskSchema), async (c) => {
    const body = c.req.valid('json')
    const [created] = await db.insert(tasks).values({ title: body.title }).returning()
    return c.json(created, 201)
  })
  .patch('/:id', zValidator('json', updateTaskSchema), async (c) => {
    const id = Number(c.req.param('id'))
    const body = c.req.valid('json')
    const [updated] = await db
      .update(tasks)
      .set(body)
      .where(eq(tasks.id, id))
      .returning()

    if (!updated) {
      return c.json({ error: 'Task not found' }, 404)
    }

    return c.json(updated)
  })
