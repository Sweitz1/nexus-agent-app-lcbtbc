'use client'

import { useState } from 'react'
import { Edit2, Check, X } from 'lucide-react'

export function AdminOrderActions({ orderId, currentStatus }: { orderId: string; currentStatus: string }) {
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="text-gray-500 hover:text-white transition p-1">
        <Edit2 className="h-3.5 w-3.5" />
      </button>
    )
  }

  async function save() {
    if (!code.trim()) { setEditing(false); return }
    setLoading(true)
    await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: 'COMPLETED', unlockCode: code.trim() }),
    })
    setLoading(false)
    setEditing(false)
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        className="w-28 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white font-mono"
        placeholder="Unlock code"
        value={code}
        onChange={e => setCode(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') void save() }}
        autoFocus
      />
      <button onClick={save} disabled={loading} className="text-green-400 hover:text-green-300 p-1">
        <Check className="h-3.5 w-3.5" />
      </button>
      <button onClick={() => setEditing(false)} className="text-gray-500 hover:text-white p-1">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
