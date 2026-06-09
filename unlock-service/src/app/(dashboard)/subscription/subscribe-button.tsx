'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  planKey: string
  priceId: string
  isCurrent: boolean
  planName: string
  credits?: number
  priceUsd?: number
  oneTime?: boolean
}

export function SubscribeButton({ planKey, priceId, isCurrent, planName, credits, priceUsd, oneTime }: Props) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    const res = await fetch('/api/subscription/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planKey, priceId, credits, priceUsd, oneTime }),
    })
    const data = await res.json()
    if (data.url) {
      window.location.href = data.url
    } else {
      alert(data.error ?? 'Failed to start checkout.')
      setLoading(false)
    }
  }

  if (isCurrent) {
    return (
      <button disabled className="btn-secondary w-full opacity-60 cursor-default">
        Current Plan
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={oneTime ? 'btn-secondary w-full text-sm py-2' : 'btn-primary w-full'}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {loading ? 'Redirecting...' : oneTime ? planName : `Subscribe to ${planName}`}
    </button>
  )
}
