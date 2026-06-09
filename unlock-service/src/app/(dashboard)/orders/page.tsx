import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CheckCircle, Clock, AlertCircle, RefreshCw } from 'lucide-react'

export const metadata = { title: 'My Orders' }

const STATUS_META: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  PENDING:    { label: 'Pending',    color: 'text-blue-400 bg-blue-900/30 border-blue-800',    icon: Clock },
  PROCESSING: { label: 'Processing', color: 'text-yellow-400 bg-yellow-900/30 border-yellow-800', icon: RefreshCw },
  COMPLETED:  { label: 'Completed',  color: 'text-green-400 bg-green-900/30 border-green-800', icon: CheckCircle },
  FAILED:     { label: 'Failed',     color: 'text-red-400 bg-red-900/30 border-red-800',       icon: AlertCircle },
  REFUNDED:   { label: 'Refunded',   color: 'text-gray-400 bg-gray-800 border-gray-700',       icon: RefreshCw },
}

export default async function OrdersPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const orders = await db.unlockOrder.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-8">My Orders</h1>

      {orders.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-gray-400">No orders yet. Submit your first unlock to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => {
            const meta = STATUS_META[order.status] ?? STATUS_META.PENDING
            const Icon = meta.icon
            return (
              <div key={order.id} className="card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${meta.color}`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                      <span className="text-xs text-gray-500">{formatDate(order.createdAt)}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
                      <div>
                        <span className="text-gray-400">IMEI: </span>
                        <span className="font-mono text-white">{order.imei}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Carrier: </span>
                        <span className="text-white">{order.carrier}</span>
                      </div>
                      {order.deviceBrand && (
                        <div>
                          <span className="text-gray-400">Device: </span>
                          <span className="text-white">{order.deviceBrand} {order.deviceModel}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-400">Price: </span>
                        <span className="text-white">{formatCurrency(order.priceUsd)}</span>
                      </div>
                    </div>

                    {order.status === 'COMPLETED' && order.unlockCode && (
                      <div className="mt-4 rounded-lg border border-green-800 bg-green-900/20 px-4 py-3">
                        <div className="text-xs text-green-400 font-medium mb-1">Unlock Code</div>
                        <div className="font-mono text-lg font-bold text-white tracking-wider">
                          {order.unlockCode}
                        </div>
                        {order.providerName === 'DemoProvider' && (
                          <div className="text-xs text-green-600 mt-1">Demo mode — replace with real provider for production</div>
                        )}
                      </div>
                    )}

                    {order.notes && (
                      <p className="mt-3 text-sm text-gray-400">{order.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
