import type { FastifyInstance } from 'fastify'
import { lookupImei } from '../imei.js'

export async function imeiRoutes(app: FastifyInstance) {
  // GET /imei/check?imei=XXX
  app.get('/imei/check', async (req, reply) => {
    const { imei } = req.query as { imei?: string }
    if (!imei) return reply.code(400).send({ error: 'imei query param required' })
    return lookupImei(imei)
  })
}
