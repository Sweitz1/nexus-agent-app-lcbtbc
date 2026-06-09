'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle, Info } from 'lucide-react'

const CARRIERS = [
  'AT&T', 'T-Mobile', 'Verizon', 'Sprint', 'MetroPCS',
  'Cricket Wireless', 'Boost Mobile', 'US Cellular', 'Other',
]

interface ImeiInfo {
  valid: boolean
  brand: string | null
  model: string | null
  tac: string
}

export default function NewUnlockPage() {
  const router = useRouter()

  const [imei, setImei] = useState('')
  const [carrier, setCarrier] = useState('')
  const [imeiInfo, setImeiInfo] = useState<ImeiInfo | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function checkImei(value: string) {
    if (value.replace(/\D/g, '').length !== 15) {
      setImeiInfo(null)
      return
    }
    setChecking(true)
    try {
      const res = await fetch(`/api/imei/check?imei=${value.replace(/\D/g, '')}`)
      const data = await res.json()
      setImeiInfo(data)
    } catch {
      // silent — not critical
    } finally {
      setChecking(false)
    }
  }

  function handleImeiChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    setImei(val)
    setImeiInfo(null)
    clearTimeout((window as unknown as { _imeiTimer?: ReturnType<typeof setTimeout> })._imeiTimer)
    ;(window as unknown as { _imeiTimer?: ReturnType<typeof setTimeout> })._imeiTimer = setTimeout(() => checkImei(val), 600)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!imeiInfo?.valid) {
      setError('Invalid IMEI number. Please check and try again.')
      return
    }

    setSubmitting(true)
    const res = await fetch('/api/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imei: imei.replace(/\D/g, ''),
        carrier,
        deviceBrand: imeiInfo?.brand,
        deviceModel: imeiInfo?.model,
      }),
    })

    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(data.error ?? 'Failed to submit order.')
      return
    }

    router.push(`/dashboard/orders?new=${data.orderId}`)
  }

  const price = carrier ? (
    carrier.includes('AT&T') || carrier.includes('Verizon') ? '$19.99' :
    carrier.includes('T-Mobile') ? '$17.99' : '$12.99'
  ) : null

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-white mb-2">New Unlock Order</h1>
      <p className="text-gray-400 text-sm mb-8">Enter the phone&apos;s IMEI and current carrier to get an unlock code.</p>

      <div className="card mb-4 flex gap-3 border-blue-800 bg-blue-950/20">
        <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-300">
          To find the IMEI, dial <strong>*#06#</strong> on the phone, or check Settings &rarr; About.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-5">
        {error && (
          <div className="flex gap-2 rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <div>
          <label className="label">IMEI Number</label>
          <div className="relative">
            <input
              type="text"
              className="input pr-10"
              placeholder="15-digit IMEI (dial *#06#)"
              value={imei}
              onChange={handleImeiChange}
              maxLength={17}
              required
            />
            {checking && (
              <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-gray-400" />
            )}
          </div>

          {imeiInfo && (
            <div className={`mt-2 rounded-lg border px-3 py-2 text-sm ${imeiInfo.valid
              ? 'border-green-800 bg-green-900/20 text-green-300'
              : 'border-red-800 bg-red-900/20 text-red-300'
            }`}>
              {imeiInfo.valid ? (
                <>
                  Valid IMEI
                  {imeiInfo.brand && <> &middot; <strong>{imeiInfo.brand}</strong></>}
                  {imeiInfo.model && <> {imeiInfo.model}</>}
                </>
              ) : (
                'Invalid IMEI — please check the number.'
              )}
            </div>
          )}
        </div>

        <div>
          <label className="label">Current Carrier (the one that locked it)</label>
          <select
            className="input"
            value={carrier}
            onChange={e => setCarrier(e.target.value)}
            required
          >
            <option value="">Select carrier...</option>
            {CARRIERS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {price && carrier && (
          <div className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400">Unlock price for {carrier}</span>
              <span className="font-semibold text-white">{price}</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Charged from your credits or card on file.</p>
          </div>
        )}

        <button
          type="submit"
          className="btn-primary w-full"
          disabled={submitting || !imeiInfo?.valid || !carrier}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitting ? 'Submitting...' : 'Submit Unlock Order'}
        </button>
      </form>
    </div>
  )
}
