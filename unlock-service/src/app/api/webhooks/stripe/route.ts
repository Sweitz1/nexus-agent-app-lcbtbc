import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { db } from '@/lib/db'
import type Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('Webhook signature error:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const { userId, planKey, credits, type } = session.metadata ?? {}

        if (!userId) break

        if (type === 'CREDIT_PURCHASE') {
          const creditCount = parseInt(credits ?? '0', 10)
          await db.subscription.upsert({
            where: { userId },
            create: { userId, credits: creditCount },
            update: { credits: { increment: creditCount } },
          })
          await db.transaction.create({
            data: {
              userId,
              type: 'CREDIT_PURCHASE',
              amountUsd: (session.amount_total ?? 0) / 100,
              creditsAdded: creditCount,
              stripeSessionId: session.id,
              status: 'COMPLETED',
            },
          })
          break
        }

        if (type === 'SUBSCRIPTION' && planKey) {
          const tierMap: Record<string, string> = {
            STARTER: 'STARTER', PRO: 'PRO', ENTERPRISE: 'ENTERPRISE',
          }
          const tier = tierMap[planKey] ?? 'PAY_AS_YOU_GO'
          const creditsMap: Record<string, number> = { STARTER: 100, PRO: 300, ENTERPRISE: -1 }
          const newCredits = creditsMap[planKey] ?? 0

          await db.subscription.upsert({
            where: { userId },
            create: {
              userId,
              tier: tier as never,
              status: 'ACTIVE',
              stripeSubscriptionId: session.subscription as string,
              credits: newCredits === -1 ? 99999 : newCredits,
            },
            update: {
              tier: tier as never,
              status: 'ACTIVE',
              stripeSubscriptionId: session.subscription as string,
              credits: newCredits === -1 ? 99999 : newCredits,
            },
          })
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string)
        const userId = sub.metadata?.userId
        if (!userId) break

        // Refresh credits on renewal
        const planKey = sub.metadata?.planKey
        const creditsMap: Record<string, number> = { STARTER: 100, PRO: 300, ENTERPRISE: 99999 }
        const renewCredits = creditsMap[planKey ?? ''] ?? 0
        if (renewCredits > 0) {
          await db.subscription.update({
            where: { userId },
            data: { credits: renewCredits, renewsAt: new Date(sub.current_period_end * 1000) },
          })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const userId = sub.metadata?.userId
        if (userId) {
          await db.subscription.update({
            where: { userId },
            data: { tier: 'PAY_AS_YOU_GO', status: 'CANCELLED', credits: 0, cancelledAt: new Date() },
          })
        }
        break
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
  }

  return NextResponse.json({ received: true })
}
