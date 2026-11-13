import { sqliteTable, integer, text, real } from 'drizzle-orm/sqlite-core'

export const tasks = sqliteTable('tasks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const voiceEvents = sqliteTable('voice_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  utterance: text('utterance').notNull(),
  intent: text('intent').notNull(),
  summary: text('summary').notNull(),
  confidence: real('confidence').notNull(),
  latencyMs: real('latency_ms').notNull(),
  modelUsed: text('model_used').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export type Task = typeof tasks.$inferSelect
export type NewTask = typeof tasks.$inferInsert
export type VoiceEvent = typeof voiceEvents.$inferSelect
export type NewVoiceEvent = typeof voiceEvents.$inferInsert
