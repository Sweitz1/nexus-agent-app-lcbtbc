import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import { Smartphone, LayoutDashboard, PlusCircle, List, CreditCard, LogOut } from 'lucide-react'

const NAV = [
  { href: '/dashboard',           label: 'Dashboard',   icon: LayoutDashboard },
  { href: '/dashboard/new-unlock', label: 'New Unlock',  icon: PlusCircle },
  { href: '/dashboard/orders',     label: 'My Orders',   icon: List },
  { href: '/dashboard/subscription', label: 'Subscription', icon: CreditCard },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen flex bg-gray-950">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 border-r border-gray-800 flex flex-col bg-gray-900">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-gray-800">
          <Smartphone className="h-5 w-5 text-brand-400" />
          <span className="font-bold text-white">Nexus Unlock</span>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition"
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <div className="text-xs text-gray-500 truncate mb-3">{session.user.email}</div>
          <Link href="/api/auth/signout" className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition">
            <LogOut className="h-4 w-4" />
            Sign Out
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 p-8">
        {children}
      </main>
    </div>
  )
}
