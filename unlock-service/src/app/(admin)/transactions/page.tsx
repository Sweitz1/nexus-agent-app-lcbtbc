import { db } from '@/lib/db'
import { formatDate, formatCurrency } from '@/lib/utils'
import Link from 'next/link'

export const metadata = { title: 'Admin — Revenue' }

const TYPE_COLORS: Record<string, string> = {
  SUBSCRIPTION:    'text-purple-400',
  CREDIT_PURCHASE: 'text-blue-400',
  UNLOCK_CHARGE:   'text-orange-400',
  REFUND:          'text-red-400',
}

export default async function TransactionsPage({ searchParams }: { searchParams: { page?: string } }) {
  const page  = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const limit = 50

  const [rows, total, aggregate] = await Promise.all([
    db.transaction.findMany({
      include: { user: { select: { email: true } } },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    db.transaction.count(),
    db.transaction.aggregate({ _sum: { amountUsd: true }, where: { status: 'COMPLETED' } }),
  ])

  const pages = Math.ceil(total / limit)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Revenue</h1>
        <div className="card py-3 px-5 text-right">
          <div className="text-xs text-gray-400">Total Revenue</div>
          <div className="text-xl font-bold text-green-400">{formatCurrency(aggregate._sum.amountUsd ?? 0)}</div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left pb-3 font-medium">Date</th>
              <th className="text-left pb-3 font-medium">User</th>
              <th className="text-left pb-3 font-medium">Type</th>
              <th className="text-right pb-3 font-medium">Credits</th>
              <th className="text-right pb-3 font-medium">Amount</th>
              <th className="text-right pb-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {rows.map(tx => (
              <tr key={tx.id} className="hover:bg-gray-800/30">
                <td className="py-3 text-gray-400 text-xs">{formatDate(tx.createdAt)}</td>
                <td className="py-3 text-gray-300 text-xs">{tx.user.email}</td>
                <td className={`py-3 text-xs font-medium ${TYPE_COLORS[tx.type] ?? 'text-gray-400'}`}>
                  {tx.type.replace('_', ' ')}
                </td>
                <td className="py-3 text-right text-gray-300">
                  {tx.creditsAdded > 0 ? `+${tx.creditsAdded}` : '—'}
                </td>
                <td className="py-3 text-right font-medium text-white">
                  {formatCurrency(tx.amountUsd)}
                </td>
                <td className={`py-3 text-right text-xs font-medium ${tx.status === 'COMPLETED' ? 'text-green-400' : 'text-red-400'}`}>
                  {tx.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
        <span>{total} transactions</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={`/admin/transactions?page=${page - 1}`} className="btn-secondary px-3 py-1.5 text-xs">← Prev</Link>
          )}
          <span className="px-3 py-1.5">Page {page} of {pages}</span>
          {page < pages && (
            <Link href={`/admin/transactions?page=${page + 1}`} className="btn-secondary px-3 py-1.5 text-xs">Next →</Link>
          )}
        </div>
      </div>
    </div>
  )
}
