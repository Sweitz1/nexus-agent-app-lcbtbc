import type { FastifyInstance } from 'fastify'
import Stripe from 'stripe'
import { db } from '../db.js'
import { requireAuth } from '../middleware/auth.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2023-10-16' })

const PLANS = {
  STARTER:    { priceId: process.env.STRIPE_PRICE_STARTER    ?? '', credits: 100, priceUsd: 99 },
  PRO:        { priceId: process.env.STRIPE_PRICE_PRO        ?? '', credits: 300, priceUsd: 249 },
  ENTERPRISE: { priceId: process.env.STRIPE_PRICE_ENTERPRISE ?? '', credits: -1,  priceUsd: 499 },
} as const

async function getOrCreateCustomer(userId: string, email: string): Promise<string> {
  const sub = await db.subscription.findUnique({ where: { userId } })
  if (sub?.stripeCustomerId) return sub.stripeCustomerId
  const customer = await stripe.customers.create({ email, metadata: { userId } })
  await db.subscription.upsert({
    where:  { userId },
    create: { userId, stripeCustomerId: customer.id },
    update: { stripeCustomerId: customer.id },
  })
  return customer.id
}

export async function subscriptionRoutes(app: FastifyInstance) {
  const appUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000'

  // GET /subscription — current user's subscription
  app.get('/subscription', { preHandler: requireAuth }, async (req) => {
    const sub = await db.subscription.findUnique({ where: { userId: req.user!.sub } })
    return sub ?? { tier: 'PAY_AS_YOU_GO', status: 'ACTIVE', credits: 0 }
  })

  // POST /subscription/checkout — create Stripe Checkout session
  app.post('/subscription/checkout', { preHandler: requireAuth }, async (req, reply) => {
    const { planKey, oneTime, credits, priceUsd } = req.body as {
      planKey?: string
      oneTime?: boolean
      credits?: number
      priceUsd?: number
    }

    const user = await db.user.findUnique({ where: { id: req.user!.sub }, select: { email: true } })
    if (!user) return reply.code(404).send({ error: 'User not found' })

    const customerId = await getOrCreateCustomer(req.user!.sub, user.email)

    if (oneTime && credits && priceUsd) {
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{ price_data: { currency: 'usd', product_data: { name: `${credits} Unlock Credits` }, unit_amount: Math.round(priceUsd * 100) }, quantity: 1 }],
        metadata: { userId: req.user!.sub, credits: String(credits), type: 'CREDIT_PURCHASE' },
        success_url: `${appUrl}/dashboard/subscription?success=1`,
        cancel_url:  `${appUrl}/dashboard/subscription`,
      })
      return { url: session.url }
    }

    const plan = PLANS[planKey as keyof typeof PLANS]
    if (!plan) return reply.code(400).send({ error: 'Invalid plan' })

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: plan.priceId, quantity: 1 }],
      metadata: { userId: req.user!.sub, planKey: planKey!, type: 'SUBSCRIPTION' },
      success_url: `${appUrl}/dashboard/subscription?success=1`,
      cancel_url:  `${appUrl}/dashboard/subscription`,
    })
    return { url: session.url }
  })

  // POST /subscription/portal — Stripe billing portal for self-serve cancel/update
  app.post('/subscription/portal', { preHandler: requireAuth }, async (req, reply) => {
    const sub = await db.subscription.findUnique({ where: { userId: req.user!.sub } })
    if (!sub?.stripeCustomerId) return reply.code(400).send({ error: 'No billing account found.' })

    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.stripeCustomerId,
      return_url: `${appUrl}/dashboard/subscription`,
    })
    return { url: session.url }
  })
}
