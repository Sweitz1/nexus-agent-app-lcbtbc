import { db } from '@/lib/db'
import { formatCurrency } from '@/lib/utils'
import { TrendingUp, Users, ShoppingBag, CheckCircle, AlertCircle, Clock } from 'lucide-react'

export const metadata = { title: 'Admin — Overview' }

export default async function AdminOverviewPage() {
  const cutoff30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalOrders, totalUsers, completed, processing, failed,
    revenue, newUsers30, orders30, recentOrders,
  ] = await Promise.all([
    db.unlockOrder.count(),
    db.user.count(),
    db.unlockOrder.count({ where: { status: 'COMPLETED' } }),
    db.unlockOrder.count({ where: { status: 'PROCESSING' } }),
    db.unlockOrder.count({ where: { status: 'FAILED' } }),
    db.transaction.aggregate({ _sum: { amountUsd: true }, where: { status: 'COMPLETED', type: { in: ['CREDIT_PURCHASE', 'SUBSCRIPTION'] } } }),
    db.user.count({ where: { createdAt: { gte: cutoff30 } } }),
    db.unlockOrder.count({ where: { createdAt: { gte: cutoff30 } } }),
    db.unlockOrder.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { user: { select: { email: true } } } }),
  ])

  const successRate = totalOrders > 0 ? Math.round((completed / totalOrders) * 100) : 0
  const totalRevenue = revenue._sum.amountUsd ?? 0

  const STAT_CARDS = [
    { label: 'Total Revenue',   value: formatCurrency(totalRevenue), icon: TrendingUp, color: 'text-green-400' },
    { label: 'Total Users',     value: totalUsers,                   icon: Users,      color: 'text-blue-400' },
    { label: 'Total Orders',    value: totalOrders,                  icon: ShoppingBag,color: 'text-purple-400' },
    { label: 'Success Rate',    value: `${successRate}%`,            icon: CheckCircle,color: 'text-emerald-400' },
    { label: 'In Progress',     value: processing,                   icon: Clock,      color: 'text-yellow-400' },
    { label: 'Failed',          value: failed,                       icon: AlertCircle,color: 'text-red-400' },
  ]

  const STATUS_COLORS: Record<string, string> = {
    COMPLETED:  'text-green-400',
    PROCESSING: 'text-yellow-400',
    PENDING:    'text-blue-400',
    FAILED:     'text-red-400',
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
        <p className="text-gray-400 text-sm mt-1">Last 30 days: {newUsers30} new users, {orders30} orders</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {STAT_CARDS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card">
            <Icon className={`h-5 w-5 ${color} mb-3`} />
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-xs text-gray-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 className="font-semibold text-white mb-4">Recent Orders</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left pb-3 font-medium">IMEI</th>
                <th className="text-left pb-3 font-medium">User</th>
                <th className="text-left pb-3 font-medium">Carrier</th>
                <th className="text-left pb-3 font-medium">Status</th>
                <th className="text-right pb-3 font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {recentOrders.map(order => (
                <tr key={order.id} className="hover:bg-gray-800/50">
                  <td className="py-3 font-mono text-xs text-white">{order.imei}</td>
                  <td className="py-3 text-gray-300">{order.user.email}</td>
                  <td className="py-3 text-gray-300">{order.carrier}</td>
                  <td className={`py-3 font-medium ${STATUS_COLORS[order.status] ?? 'text-gray-400'}`}>
                    {order.status}
                  </td>
                  <td className="py-3 text-right text-gray-300">{formatCurrency(order.priceUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
