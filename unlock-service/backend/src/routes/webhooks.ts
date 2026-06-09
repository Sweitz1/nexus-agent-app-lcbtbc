import type { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { db } from '../db.js'
import { sendOrderCompleted, sendOrderFailed } from '../email/index.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2023-10-16' })

const CREDITS_MAP: Record<string, number> = { STARTER: 100, PRO: 300, ENTERPRISE: 99999 }
const TIER_MAP: Record<string, string>    = { STARTER: 'STARTER', PRO: 'PRO', ENTERPRISE: 'ENTERPRISE' }

export async function webhookRoutes(app: FastifyInstance) {
  // Stripe webhook — must receive raw body
  app.post('/webhooks/stripe', {
    config: { rawBody: true },
  }, async (req, reply) => {
    const sig = req.headers['stripe-signature'] as string
    let event: Stripe.Event

    try {
      event = stripe.webhooks.constructEvent(
        (req as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body)),
        sig,
        process.env.STRIPE_WEBHOOK_SECRET ?? '',
      )
    } catch {
      return reply.code(400).send({ error: 'Invalid webhook signature' })
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session
          const { userId, planKey, credits, type } = session.metadata ?? {}
          if (!userId) break

          if (type === 'CREDIT_PURCHASE') {
            const count = parseInt(credits ?? '0', 10)
            await db.subscription.upsert({
              where:  { userId },
              create: { userId, credits: count },
              update: { credits: { increment: count } },
            })
            await db.transaction.create({
              data: {
                userId, type: 'CREDIT_PURCHASE', amountUsd: (session.amount_total ?? 0) / 100,
                creditsAdded: count, stripeSessionId: session.id, status: 'COMPLETED',
              },
            })
          } else if (type === 'SUBSCRIPTION' && planKey) {
            const tier    = TIER_MAP[planKey] ?? 'PAY_AS_YOU_GO'
            const newCred = CREDITS_MAP[planKey] ?? 0
            await db.subscription.upsert({
              where:  { userId },
              create: { userId, tier: tier as never, status: 'ACTIVE', stripeSubscriptionId: session.subscription as string, credits: newCred },
              update: { tier: tier as never, status: 'ACTIVE', stripeSubscriptionId: session.subscription as string, credits: newCred },
            })
          }
          break
        }

        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice
          const subObj  = await stripe.subscriptions.retrieve(invoice.subscription as string)
          const userId  = subObj.metadata?.userId
          if (!userId) break
          const planKey    = subObj.metadata?.planKey
          const newCredits = CREDITS_MAP[planKey ?? ''] ?? 0
          if (newCredits > 0) {
            await db.subscription.update({
              where: { userId },
              data:  { credits: newCredits, renewsAt: new Date(subObj.current_period_end * 1000) },
            })
          }
          break
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice
          const subObj  = await stripe.subscriptions.retrieve(invoice.subscription as string)
          const userId  = subObj.metadata?.userId
          if (userId) {
            await db.subscription.update({ where: { userId }, data: { status: 'PAST_DUE' } })
          }
          break
        }

        case 'customer.subscription.deleted': {
          const sub    = event.data.object as Stripe.Subscription
          const userId = sub.metadata?.userId
          if (userId) {
            await db.subscription.update({
              where: { userId },
              data:  { tier: 'PAY_AS_YOU_GO', status: 'CANCELLED', credits: 0, cancelledAt: new Date() },
            })
          }
          break
        }
      }
    } catch (err) {
      app.log.error({ err }, 'Webhook handler error')
    }

    return { received: true }
  })

  // Provider push webhook — some providers POST status updates instead of requiring polling
  app.post('/webhooks/provider', async (req, reply) => {
    const body = req.body as {
      reference?: string      // our orderId
      order_id?:  string
      status?:    string
      unlock_code?: string
      code?:        string
      message?:     string
    }

    const orderId = body.reference ?? body.order_id
    if (!orderId) return reply.code(400).send({ error: 'Missing reference/order_id' })

    const order = await db.unlockOrder.findFirst({
      where:   { id: orderId },
      include: { user: { select: { email: true } } },
    })
    if (!order) return reply.code(404).send({ error: 'Order not found' })

    const unlockCode = body.unlock_code ?? body.code

    if (body.status === 'completed' && unlockCode) {
      await db.unlockOrder.update({
        where: { id: orderId },
        data:  { status: 'COMPLETED', unlockCode, completedAt: new Date(), notes: body.message ?? null },
      })
      await sendOrderCompleted({
        to:          order.user.email,
        imei:        order.imei,
        carrier:     order.carrier,
        deviceBrand: order.deviceBrand,
        deviceModel: order.deviceModel,
        unlockCode,
      })
    } else if (body.status === 'failed') {
      await db.unlockOrder.update({
        where: { id: orderId },
        data:  { status: 'FAILED', notes: body.message ?? null },
      })
      if (order.creditsCharged > 0) {
        await db.subscription.update({ where: { userId: order.userId }, data: { credits: { increment: order.creditsCharged } } })
      }
      await sendOrderFailed({ to: order.user.email, imei: order.imei, carrier: order.carrier, reason: body.message })
    }

    return { ok: true }
  })
}
