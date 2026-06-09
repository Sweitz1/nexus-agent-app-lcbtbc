import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PlusCircle, CheckCircle, Clock, AlertCircle, CreditCard } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'

export const metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [orders, subscription] = await Promise.all([
    db.unlockOrder.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.subscription.findUnique({ where: { userId: session.user.id } }),
  ])

  const allOrders = await db.unlockOrder.findMany({ where: { userId: session.user.id } })
  const stats = {
    total:      allOrders.length,
    completed:  allOrders.filter(o => o.status === 'COMPLETED').length,
    pending:    allOrders.filter(o => ['PENDING', 'PROCESSING'].includes(o.status)).length,
    credits:    subscription?.credits ?? 0,
  }

  const STATUS_STYLES: Record<string, string> = {
    COMPLETED:  'text-green-400 bg-green-900/30 border-green-800',
    PROCESSING: 'text-yellow-400 bg-yellow-900/30 border-yellow-800',
    PENDING:    'text-blue-400 bg-blue-900/30 border-blue-800',
    FAILED:     'text-red-400 bg-red-900/30 border-red-800',
    REFUNDED:   'text-gray-400 bg-gray-800 border-gray-700',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Welcome back, {session.user.name ?? session.user.email}</p>
        </div>
        <Link href="/dashboard/new-unlock" className="btn-primary">
          <PlusCircle className="h-4 w-4" />
          New Unlock
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Orders',     value: stats.total,     icon: Clock,       color: 'text-blue-400' },
          { label: 'Completed',        value: stats.completed, icon: CheckCircle, color: 'text-green-400' },
          { label: 'In Progress',      value: stats.pending,   icon: AlertCircle, color: 'text-yellow-400' },
          { label: 'Credits Remaining', value: stats.credits,  icon: CreditCard,  color: 'text-brand-400' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card">
            <Icon className={`h-5 w-5 ${color} mb-3`} />
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white">Recent Orders</h2>
          <Link href="/dashboard/orders" className="text-sm text-brand-400 hover:text-brand-300">View all</Link>
        </div>

        {orders.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">No unlock orders yet.</p>
            <Link href="/dashboard/new-unlock" className="btn-primary text-sm">
              Submit Your First Unlock
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => (
              <div key={order.id} className="flex items-center justify-between rounded-lg bg-gray-800 px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-white font-mono">{order.imei}</div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {order.carrier} · {order.deviceBrand ?? 'Unknown device'} · {formatDate(order.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-400">{formatCurrency(order.priceUsd)}</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[order.status] ?? ''}`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upgrade prompt for users without subscription */}
      {(!subscription || subscription.tier === 'PAY_AS_YOU_GO') && (
        <div className="mt-6 card border-brand-800 bg-brand-950/20">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Running a repair shop?</h3>
              <p className="text-sm text-gray-400 mt-1">Get 100+ unlocks/month for a flat rate. Save up to 70% vs pay-per-unlock.</p>
            </div>
            <Link href="/dashboard/subscription" className="btn-primary shrink-0 ml-4">
              View Plans
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
