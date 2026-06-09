import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import { Shield, BarChart3, List, Users, DollarSign, LogOut } from 'lucide-react'

const NAV = [
  { href: '/admin',              label: 'Overview',     icon: BarChart3 },
  { href: '/admin/orders',       label: 'All Orders',   icon: List },
  { href: '/admin/users',        label: 'Users',        icon: Users },
  { href: '/admin/transactions', label: 'Revenue',      icon: DollarSign },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== 'ADMIN') redirect('/dashboard')

  return (
    <div className="min-h-screen flex bg-gray-950">
      <aside className="w-56 shrink-0 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-800">
          <Shield className="h-5 w-5 text-yellow-400" />
          <span className="font-bold text-white text-sm">Admin Panel</span>
        </div>
        <nav className="flex-1 py-3 px-2 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition">
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-800">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition">
            <LogOut className="h-4 w-4" />
            Back to App
          </Link>
        </div>
      </aside>
      <main className="flex-1 p-8 min-w-0">{children}</main>
    </div>
  )
}
