import { defineConfig } from 'drizzle-kit'

// Note: drizzle-kit CLI runs in Node by default unless invoked with `bun --bun`,
// and requires `file:` prefix when using @libsql/client for `drizzle-kit push`.
// Runtime (src/db/index.ts) uses native `bun:sqlite` directly.
const dbFile = (typeof Bun !== 'undefined' ? Bun.env.DB_FILE_NAME : process.env.DB_FILE_NAME) ?? 'local.db'

export default defineConfig({
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: dbFile.startsWith('file:') ? dbFile : `file:${dbFile}`,
  },
})
