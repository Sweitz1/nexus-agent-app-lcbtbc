import { db } from '@/lib/db'
import { formatDate, formatCurrency } from '@/lib/utils'
import { AdminOrderActions } from './actions'
import Link from 'next/link'

export const metadata = { title: 'Admin — Orders' }

const STATUS_COLORS: Record<string, string> = {
  COMPLETED:  'text-green-400',
  PROCESSING: 'text-yellow-400',
  PENDING:    'text-blue-400',
  FAILED:     'text-red-400',
  REFUNDED:   'text-gray-400',
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string; search?: string }
}) {
  const page  = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const limit = 25

  const where: Parameters<typeof db.unlockOrder.findMany>[0]['where'] = {}
  if (searchParams.status) where.status = searchParams.status as never
  if (searchParams.search) {
    where.OR = [
      { imei: { contains: searchParams.search } },
      { user: { email: { contains: searchParams.search, mode: 'insensitive' } } },
    ]
  }

  const [orders, total] = await Promise.all([
    db.unlockOrder.findMany({
      where,
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    db.unlockOrder.count({ where }),
  ])

  const pages = Math.ceil(total / limit)
  const STATUSES = ['', 'COMPLETED', 'PROCESSING', 'PENDING', 'FAILED', 'REFUNDED']

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">All Orders</h1>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {STATUSES.map(s => (
          <Link
            key={s || 'all'}
            href={`/admin/orders?${new URLSearchParams({ ...(s ? { status: s } : {}), page: '1' })}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
              (searchParams.status ?? '') === s
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-gray-700 text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            {s || 'All'}
          </Link>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left pb-3 font-medium">IMEI</th>
              <th className="text-left pb-3 font-medium">User</th>
              <th className="text-left pb-3 font-medium">Carrier</th>
              <th className="text-left pb-3 font-medium">Device</th>
              <th className="text-left pb-3 font-medium">Status</th>
              <th className="text-left pb-3 font-medium">Code</th>
              <th className="text-right pb-3 font-medium">Price</th>
              <th className="text-right pb-3 font-medium">Date</th>
              <th className="text-right pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {orders.map(order => (
              <tr key={order.id} className="hover:bg-gray-800/30">
                <td className="py-3 font-mono text-xs text-white">{order.imei}</td>
                <td className="py-3 text-gray-300 text-xs">{order.user.email}</td>
                <td className="py-3 text-gray-300 text-xs">{order.carrier}</td>
                <td className="py-3 text-gray-300 text-xs">{order.deviceBrand} {order.deviceModel}</td>
                <td className={`py-3 text-xs font-medium ${STATUS_COLORS[order.status] ?? 'text-gray-400'}`}>
                  {order.status}
                </td>
                <td className="py-3 font-mono text-xs text-green-400">{order.unlockCode ?? '—'}</td>
                <td className="py-3 text-right text-gray-300">{formatCurrency(order.priceUsd)}</td>
                <td className="py-3 text-right text-gray-500 text-xs">{formatDate(order.createdAt)}</td>
                <td className="py-3 text-right">
                  <AdminOrderActions orderId={order.id} currentStatus={order.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
        <span>{total} total orders</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={`/admin/orders?${new URLSearchParams({ ...searchParams, page: String(page - 1) })}`} className="btn-secondary px-3 py-1.5 text-xs">
              ← Prev
            </Link>
          )}
          <span className="px-3 py-1.5">Page {page} of {pages}</span>
          {page < pages && (
            <Link href={`/admin/orders?${new URLSearchParams({ ...searchParams, page: String(page + 1) })}`} className="btn-secondary px-3 py-1.5 text-xs">
              Next →
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}
