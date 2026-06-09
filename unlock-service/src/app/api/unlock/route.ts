import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { validateImei } from '@/lib/imei'
import { getUnlockProvider } from '@/lib/unlock-providers'
import { PAY_PER_UNLOCK_PRICES } from '@/lib/stripe'

const schema = z.object({
  imei:        z.string().regex(/^\d{15}$/, 'IMEI must be exactly 15 digits'),
  carrier:     z.string().min(1).max(100),
  deviceBrand: z.string().max(100).nullable().optional(),
  deviceModel: z.string().max(200).nullable().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const data = schema.parse(body)

    if (!validateImei(data.imei)) {
      return NextResponse.json({ error: 'Invalid IMEI number.' }, { status: 400 })
    }

    // Determine price
    const carrierKey = Object.keys(PAY_PER_UNLOCK_PRICES).find(k =>
      data.carrier.toLowerCase().includes(k.toLowerCase())
    ) ?? 'Other'
    const priceUsd = PAY_PER_UNLOCK_PRICES[carrierKey] ?? PAY_PER_UNLOCK_PRICES['Other']!

    // Check/deduct credits if on subscription
    const subscription = await db.subscription.findUnique({ where: { userId: session.user.id } })
    let creditsCharged = 0

    if (subscription && subscription.tier !== 'PAY_AS_YOU_GO') {
      const isUnlimited = subscription.tier === 'ENTERPRISE'
      if (!isUnlimited) {
        if (subscription.credits < 1) {
          return NextResponse.json({
            error: 'Insufficient credits. Please top up or upgrade your plan.',
          }, { status: 402 })
        }
        await db.subscription.update({
          where: { userId: session.user.id },
          data: { credits: { decrement: 1 } },
        })
        creditsCharged = 1
      }
    }

    // Create order
    const order = await db.unlockOrder.create({
      data: {
        userId:        session.user.id,
        imei:          data.imei,
        carrier:       data.carrier,
        deviceBrand:   data.deviceBrand,
        deviceModel:   data.deviceModel,
        status:        'PROCESSING',
        priceUsd,
        creditsCharged,
      },
    })

    // Submit to unlock provider
    const provider = getUnlockProvider()
    const result = await provider.submitOrder({
      imei:        order.imei,
      carrier:     order.carrier,
      deviceBrand: order.deviceBrand,
      deviceModel: order.deviceModel,
      orderId:     order.id,
    })

    if (!result.success) {
      await db.unlockOrder.update({
        where: { id: order.id },
        data: { status: 'FAILED', notes: result.error },
      })
      // Refund credit if charged
      if (creditsCharged > 0) {
        await db.subscription.update({
          where: { userId: session.user.id },
          data: { credits: { increment: creditsCharged } },
        })
      }
      return NextResponse.json({ error: result.error ?? 'Provider rejected the order.' }, { status: 502 })
    }

    await db.unlockOrder.update({
      where: { id: order.id },
      data: {
        providerOrderId: result.providerOrderId,
        providerName:    provider.name,
        notes:           result.message,
      },
    })

    return NextResponse.json({ orderId: order.id, estimatedMinutes: result.estimatedMinutes }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    console.error('Unlock submit error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
