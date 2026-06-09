import { db } from '../db.js'
import { getProvider } from '../providers/index.js'
import { sendOrderCompleted, sendOrderFailed } from '../email/index.js'

const POLL_INTERVAL_MS = 60_000   // poll every 60 seconds
const MAX_AGE_HOURS    = 48       // fail orders older than 48h still processing

let timer: ReturnType<typeof setInterval> | null = null

export function startOrderProcessor() {
  if (timer) return
  console.log('[OrderProcessor] Starting — polling every 60s')
  // Run once immediately, then on interval
  void processOrders()
  timer = setInterval(() => { void processOrders() }, POLL_INTERVAL_MS)
}

export function stopOrderProcessor() {
  if (timer) { clearInterval(timer); timer = null }
  console.log('[OrderProcessor] Stopped')
}

async function processOrders() {
  const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000)

  const pending = await db.unlockOrder.findMany({
    where: {
      status: 'PROCESSING',
      providerOrderId: { not: null },
    },
    include: { user: { select: { email: true } } },
  })

  if (pending.length === 0) return
  console.log(`[OrderProcessor] Checking ${pending.length} processing order(s)`)

  const provider = getProvider()

  for (const order of pending) {
    try {
      // Auto-fail very old orders
      if (order.createdAt < cutoff) {
        await failOrder(order.id, order, 'Order expired — exceeded maximum processing time.')
        continue
      }

      const result = await provider.checkStatus(order.providerOrderId!)

      if (result.status === 'completed' && result.unlockCode) {
        await db.unlockOrder.update({
          where: { id: order.id },
          data: {
            status:      'COMPLETED',
            unlockCode:  result.unlockCode,
            completedAt: new Date(),
            notes:       result.message ?? null,
          },
        })

        console.log(`[OrderProcessor] ✓ Order ${order.id} completed`)

        await sendOrderCompleted({
          to:          order.user.email,
          imei:        order.imei,
          carrier:     order.carrier,
          deviceBrand: order.deviceBrand,
          deviceModel: order.deviceModel,
          unlockCode:  result.unlockCode,
        })
      } else if (result.status === 'failed') {
        await failOrder(order.id, order, result.message)
      }
      // pending/processing → do nothing, check again next tick
    } catch (err) {
      console.error(`[OrderProcessor] Error checking order ${order.id}:`, err)
    }
  }
}

async function failOrder(
  orderId: string,
  order: { userId: string; creditsCharged: number; user: { email: string }; imei: string; carrier: string },
  reason?: string | null,
) {
  await db.unlockOrder.update({
    where: { id: orderId },
    data: { status: 'FAILED', notes: reason ?? 'Provider could not complete unlock.' },
  })

  // Auto-refund credits
  if (order.creditsCharged > 0) {
    await db.subscription.update({
      where: { userId: order.userId },
      data: { credits: { increment: order.creditsCharged } },
    })
  }

  console.log(`[OrderProcessor] ✗ Order ${orderId} failed — credits refunded`)

  await sendOrderFailed({
    to:      order.user.email,
    imei:    order.imei,
    carrier: order.carrier,
    reason:  reason ?? undefined,
  })
}
