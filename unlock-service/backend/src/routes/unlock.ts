import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'
import { validateImei } from '../imei.js'
import { getProvider } from '../providers/index.js'
import { sendOrderSubmitted } from '../email/index.js'

const CARRIER_PRICES: Record<string, number> = {
  'AT&T':            19.99,
  'T-Mobile':        17.99,
  'Verizon':         19.99,
  'Sprint':          14.99,
  'MetroPCS':        12.99,
  'Cricket Wireless':12.99,
  'Boost Mobile':    12.99,
  'US Cellular':     12.99,
  'Other':            9.99,
}

function priceForCarrier(carrier: string): number {
  const key = Object.keys(CARRIER_PRICES).find(k =>
    carrier.toLowerCase().includes(k.toLowerCase())
  ) ?? 'Other'
  return CARRIER_PRICES[key]!
}

const submitSchema = z.object({
  imei:        z.string().regex(/^\d{15}$/, 'IMEI must be 15 digits'),
  carrier:     z.string().min(1).max(100),
  deviceBrand: z.string().max(100).nullable().optional(),
  deviceModel: z.string().max(200).nullable().optional(),
})

export async function unlockRoutes(app: FastifyInstance) {
  // POST /unlock — submit a new order
  app.post('/unlock', { preHandler: requireAuth }, async (req, reply) => {
    const result = submitSchema.safeParse(req.body)
    if (!result.success) {
      return reply.code(400).send({ error: result.error.errors[0]?.message ?? 'Invalid input' })
    }
    const { imei, carrier, deviceBrand, deviceModel } = result.data

    if (!validateImei(imei)) return reply.code(400).send({ error: 'Invalid IMEI number.' })

    const userId = req.user!.sub
    const priceUsd = priceForCarrier(carrier)

    // Deduct credit if on a subscription plan
    const subscription = await db.subscription.findUnique({ where: { userId } })
    let creditsCharged = 0

    if (subscription && subscription.tier !== 'PAY_AS_YOU_GO') {
      const unlimited = subscription.tier === 'ENTERPRISE'
      if (!unlimited) {
        if (subscription.credits < 1) {
          return reply.code(402).send({ error: 'Insufficient credits. Please top up or upgrade.' })
        }
        await db.subscription.update({ where: { userId }, data: { credits: { decrement: 1 } } })
        creditsCharged = 1
      }
    }

    const order = await db.unlockOrder.create({
      data: { userId, imei, carrier, deviceBrand, deviceModel, status: 'PROCESSING', priceUsd, creditsCharged },
    })

    const provider = getProvider()
    const providerResult = await provider.submitOrder({
      imei, carrier, deviceBrand, deviceModel, orderId: order.id,
    })

    if (!providerResult.success) {
      await db.unlockOrder.update({ where: { id: order.id }, data: { status: 'FAILED', notes: providerResult.error } })
      if (creditsCharged > 0) {
        await db.subscription.update({ where: { userId }, data: { credits: { increment: creditsCharged } } })
      }
      return reply.code(502).send({ error: providerResult.error ?? 'Provider rejected order.' })
    }

    await db.unlockOrder.update({
      where: { id: order.id },
      data: { providerOrderId: providerResult.providerOrderId, providerName: provider.name, notes: providerResult.message },
    })

    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (user) {
      await sendOrderSubmitted({
        to: user.email, imei, carrier, orderId: order.id,
        estimatedMinutes: providerResult.estimatedMinutes,
      })
    }

    return reply.code(201).send({ orderId: order.id, estimatedMinutes: providerResult.estimatedMinutes })
  })

  // GET /unlock — list current user's orders
  app.get('/unlock', { preHandler: requireAuth }, async (req, reply) => {
    const query = req.query as { status?: string; page?: string; limit?: string }
    const page  = Math.max(1, parseInt(query.page  ?? '1',  10))
    const limit = Math.min(50, parseInt(query.limit ?? '20', 10))

    const where = {
      userId: req.user!.sub,
      ...(query.status ? { status: query.status as never } : {}),
    }

    const [orders, total] = await Promise.all([
      db.unlockOrder.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      db.unlockOrder.count({ where }),
    ])

    return { orders, total, page, pages: Math.ceil(total / limit) }
  })

  // GET /unlock/:id — get single order, trigger provider status sync
  app.get('/unlock/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const order = await db.unlockOrder.findFirst({ where: { id, userId: req.user!.sub } })
    if (!order) return reply.code(404).send({ error: 'Order not found' })

    // If still processing, sync with provider now
    if (order.status === 'PROCESSING' && order.providerOrderId) {
      const provider = getProvider()
      const status = await provider.checkStatus(order.providerOrderId)

      if (status.status === 'completed' && status.unlockCode) {
        const updated = await db.unlockOrder.update({
          where: { id: order.id },
          data: { status: 'COMPLETED', unlockCode: status.unlockCode, completedAt: new Date(), notes: status.message ?? null },
        })
        return updated
      }

      if (status.status === 'failed') {
        const updated = await db.unlockOrder.update({
          where: { id: order.id },
          data: { status: 'FAILED', notes: status.message ?? null },
        })
        return updated
      }
    }

    return order
  })
}
