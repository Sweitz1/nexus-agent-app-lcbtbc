'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

const ROLES = ['CONSUMER', 'SHOP', 'ADMIN']

export function AdminUserActions({ userId, currentRole }: { userId: string; currentRole: string }) {
  const [loading, setLoading] = useState(false)

  async function changeRole(role: string) {
    if (role === currentRole) return
    setLoading(true)
    await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ role }),
    })
    setLoading(false)
    window.location.reload()
  }

  return (
    <div className="relative inline-block">
      <select
        className="appearance-none bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-300 pr-6 cursor-pointer"
        value={currentRole}
        onChange={e => void changeRole(e.target.value)}
        disabled={loading}
      >
        {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      <ChevronDown className="absolute right-1.5 top-1.5 h-3 w-3 text-gray-500 pointer-events-none" />
    </div>
  )
}
