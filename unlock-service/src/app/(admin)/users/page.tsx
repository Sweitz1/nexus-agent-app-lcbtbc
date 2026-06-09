import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { AdminUserActions } from './actions'

export const metadata = { title: 'Admin — Users' }

const ROLE_COLORS: Record<string, string> = {
  ADMIN:    'text-yellow-400 bg-yellow-900/20 border-yellow-800',
  SHOP:     'text-purple-400 bg-purple-900/20 border-purple-800',
  CONSUMER: 'text-blue-400 bg-blue-900/20 border-blue-800',
}

const TIER_COLORS: Record<string, string> = {
  ENTERPRISE:    'text-yellow-400',
  PRO:           'text-purple-400',
  STARTER:       'text-blue-400',
  PAY_AS_YOU_GO: 'text-gray-400',
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { page?: string; search?: string; role?: string }
}) {
  const page  = Math.max(1, parseInt(searchParams.page ?? '1', 10))
  const limit = 25

  const where: Parameters<typeof db.user.findMany>[0]['where'] = {}
  if (searchParams.role)   where.role = searchParams.role as never
  if (searchParams.search) {
    where.OR = [
      { email: { contains: searchParams.search, mode: 'insensitive' } },
      { name:  { contains: searchParams.search, mode: 'insensitive' } },
    ]
  }

  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      select: {
        id: true, email: true, name: true, role: true,
        businessName: true, createdAt: true,
        subscription: { select: { tier: true, credits: true, status: true } },
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * limit,
      take:    limit,
    }),
    db.user.count({ where }),
  ])

  const pages = Math.ceil(total / limit)

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Users</h1>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-800">
              <th className="text-left pb-3 font-medium">Email</th>
              <th className="text-left pb-3 font-medium">Name</th>
              <th className="text-left pb-3 font-medium">Role</th>
              <th className="text-left pb-3 font-medium">Plan</th>
              <th className="text-right pb-3 font-medium">Credits</th>
              <th className="text-right pb-3 font-medium">Orders</th>
              <th className="text-right pb-3 font-medium">Joined</th>
              <th className="text-right pb-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {users.map(user => (
              <tr key={user.id} className="hover:bg-gray-800/30">
                <td className="py-3 text-white text-xs">{user.email}</td>
                <td className="py-3 text-gray-300 text-xs">{user.name ?? user.businessName ?? '—'}</td>
                <td className="py-3">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role] ?? ''}`}>
                    {user.role}
                  </span>
                </td>
                <td className={`py-3 text-xs font-medium ${TIER_COLORS[user.subscription?.tier ?? 'PAY_AS_YOU_GO'] ?? ''}`}>
                  {user.subscription?.tier?.replace('_', ' ') ?? '—'}
                </td>
                <td className="py-3 text-right text-gray-300">{user.subscription?.credits ?? 0}</td>
                <td className="py-3 text-right text-gray-300">{user._count.orders}</td>
                <td className="py-3 text-right text-gray-500 text-xs">{formatDate(user.createdAt)}</td>
                <td className="py-3 text-right">
                  <AdminUserActions userId={user.id} currentRole={user.role} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
        <span>{total} total users</span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={`/admin/users?${new URLSearchParams({ ...searchParams, page: String(page - 1) })}`} className="btn-secondary px-3 py-1.5 text-xs">← Prev</Link>
          )}
          <span className="px-3 py-1.5">Page {page} of {pages}</span>
          {page < pages && (
            <Link href={`/admin/users?${new URLSearchParams({ ...searchParams, page: String(page + 1) })}`} className="btn-secondary px-3 py-1.5 text-xs">Next →</Link>
          )}
        </div>
      </div>
    </div>
  )
}
