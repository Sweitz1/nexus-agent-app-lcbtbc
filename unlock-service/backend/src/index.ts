import 'dotenv/config'
import { buildServer }         from './server.js'
import { startOrderProcessor } from './jobs/order-processor.js'
import { db }                  from './db.js'

const PORT = parseInt(process.env.PORT ?? '4000', 10)
const HOST = process.env.HOST ?? '0.0.0.0'

async function main() {
  // Verify DB connection
  try {
    await db.$connect()
    console.log('✓ Database connected')
  } catch (err) {
    console.error('✗ Database connection failed:', err)
    process.exit(1)
  }

  const app = await buildServer()

  await app.listen({ port: PORT, host: HOST })
  console.log(`✓ Server running on http://${HOST}:${PORT}`)

  // Start background order processor
  startOrderProcessor()
  console.log('✓ Order processor started')

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down...`)
    await app.close()
    await db.$disconnect()
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT',  () => void shutdown('SIGINT'))
}

main().catch(err => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
