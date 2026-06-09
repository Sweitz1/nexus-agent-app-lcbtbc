import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
})

export const PLANS = {
  STARTER: {
    name: 'Starter Shop',
    priceId: process.env.STRIPE_PRICE_STARTER!,
    priceUsd: 99,
    credits: 100,
    description: 'Perfect for small repair shops',
    features: ['100 unlock credits/month', 'All carrier support', 'Email notifications', 'Order history'],
  },
  PRO: {
    name: 'Pro Shop',
    priceId: process.env.STRIPE_PRICE_PRO!,
    priceUsd: 249,
    credits: 300,
    description: 'For high-volume repair businesses',
    features: ['300 unlock credits/month', 'Priority processing', 'API access', 'Bulk IMEI upload', 'Dedicated support'],
  },
  ENTERPRISE: {
    name: 'Enterprise',
    priceId: process.env.STRIPE_PRICE_ENTERPRISE!,
    priceUsd: 499,
    credits: -1, // unlimited
    description: 'Unlimited unlocks for large operations',
    features: ['Unlimited unlocks', 'Fastest processing', 'White-label option', 'SLA guarantee', 'Phone support'],
  },
} as const

export const PAY_PER_UNLOCK_PRICES: Record<string, number> = {
  'AT&T':     19.99,
  'T-Mobile': 17.99,
  'Verizon':  19.99,
  'Sprint':   14.99,
  'MetroPCS': 12.99,
  'Cricket':  12.99,
  'Boost':    12.99,
  'Other':     9.99,
}

export async function createOrGetStripeCustomer(userId: string, email: string): Promise<string> {
  const { db } = await import('./db')
  const sub = await db.subscription.findUnique({ where: { userId } })

  if (sub?.stripeCustomerId) return sub.stripeCustomerId

  const customer = await stripe.customers.create({ email, metadata: { userId } })

  await db.subscription.upsert({
    where: { userId },
    create: { userId, stripeCustomerId: customer.id },
    update: { stripeCustomerId: customer.id },
  })

  return customer.id
}
