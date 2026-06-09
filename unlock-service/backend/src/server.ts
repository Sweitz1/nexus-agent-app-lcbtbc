import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'

import { authRoutes }         from './routes/auth.js'
import { imeiRoutes }         from './routes/imei.js'
import { unlockRoutes }       from './routes/unlock.js'
import { subscriptionRoutes } from './routes/subscription.js'
import { webhookRoutes }      from './routes/webhooks.js'
import { adminRoutes }        from './routes/admin.js'

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    },
  })

  // Plugins
  await app.register(cors, {
    origin:      process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  })

  await app.register(cookie, {
    secret: process.env.JWT_SECRET ?? 'dev-cookie-secret',
  })

  await app.register(rateLimit, {
    max:      100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  })

  // Tighter rate limit on auth endpoints to prevent brute-force
  await app.register(async (instance) => {
    await instance.register(rateLimit, {
      max:        10,
      timeWindow: '15 minutes',
      keyGenerator: (req) => req.ip,
      errorResponseBuilder: () => ({ error: 'Too many attempts. Try again in 15 minutes.' }),
    })
    await instance.register(authRoutes)
  }, { prefix: '/api' })

  // Standard routes
  await app.register(imeiRoutes,         { prefix: '/api' })
  await app.register(unlockRoutes,       { prefix: '/api' })
  await app.register(subscriptionRoutes, { prefix: '/api' })
  await app.register(webhookRoutes,      { prefix: '/api' })
  await app.register(adminRoutes,        { prefix: '/api/admin' })

  // Health check
  app.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }))

  return app
}
