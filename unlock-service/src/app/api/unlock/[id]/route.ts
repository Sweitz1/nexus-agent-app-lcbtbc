import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getUnlockProvider } from '@/lib/unlock-providers'

// Poll order status and sync from provider if still processing
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const order = await db.unlockOrder.findFirst({
    where: { id: params.id, userId: session.user.id },
  })

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // If still processing and we have a provider order ID, poll for update
  if (order.status === 'PROCESSING' && order.providerOrderId) {
    const provider = getUnlockProvider()
    const status = await provider.checkStatus(order.providerOrderId)

    if (status.status === 'completed' && status.unlockCode) {
      const updated = await db.unlockOrder.update({
        where: { id: order.id },
        data: {
          status:      'COMPLETED',
          unlockCode:  status.unlockCode,
          completedAt: new Date(),
          notes:       status.message ?? order.notes,
        },
      })
      return NextResponse.json(updated)
    }

    if (status.status === 'failed') {
      const updated = await db.unlockOrder.update({
        where: { id: order.id },
        data: { status: 'FAILED', notes: status.message ?? 'Provider reported failure.' },
      })
      return NextResponse.json(updated)
    }
  }

  return NextResponse.json(order)
}
