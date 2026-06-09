import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe, PLANS, createOrGetStripeCustomer } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { planKey, priceId, oneTime, credits, priceUsd } = await req.json()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  try {
    const customerId = await createOrGetStripeCustomer(session.user.id, session.user.email)

    if (oneTime) {
      // One-time credit purchase
      const checkoutSession = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: `${credits} Unlock Credits` },
            unit_amount: Math.round(priceUsd * 100),
          },
          quantity: 1,
        }],
        metadata: { userId: session.user.id, credits: String(credits), type: 'CREDIT_PURCHASE' },
        success_url: `${appUrl}/dashboard/subscription?success=1`,
        cancel_url:  `${appUrl}/dashboard/subscription`,
      })
      return NextResponse.json({ url: checkoutSession.url })
    }

    // Subscription checkout
    const plan = PLANS[planKey as keyof typeof PLANS]
    if (!plan) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { userId: session.user.id, planKey, type: 'SUBSCRIPTION' },
      success_url: `${appUrl}/dashboard/subscription?success=1`,
      cancel_url:  `${appUrl}/dashboard/subscription`,
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (err) {
    console.error('Checkout error:', err)
    return NextResponse.json({ error: 'Failed to create checkout session.' }, { status: 500 })
  }
}
