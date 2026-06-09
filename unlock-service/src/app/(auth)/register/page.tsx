'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Smartphone, Loader2 } from 'lucide-react'

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter Shop — $99/mo',
  pro: 'Pro Shop — $249/mo',
  enterprise: 'Enterprise — $499/mo',
}

export default function RegisterPage() {
  const router = useRouter()
  const params = useSearchParams()
  const selectedPlan = params?.get('plan') ?? ''

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    businessName: '',
    isShop: selectedPlan !== '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function update(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, plan: selectedPlan }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Registration failed.')
      return
    }

    router.push('/login?registered=1')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <Smartphone className="h-6 w-6 text-brand-400" />
            <span className="text-lg font-bold text-white">Nexus Unlock</span>
          </Link>
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
          {selectedPlan && (
            <p className="text-sm text-brand-400 mt-1">{PLAN_LABELS[selectedPlan]}</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="label">Full Name</label>
            <input
              type="text"
              className="input"
              placeholder="Jane Smith"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              placeholder="you@example.com"
              value={form.email}
              onChange={e => update('email', e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={e => update('password', e.target.value)}
              required
              minLength={8}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="isShop"
              type="checkbox"
              className="rounded border-gray-700 bg-gray-800 text-brand-600"
              checked={form.isShop}
              onChange={e => update('isShop', e.target.checked)}
            />
            <label htmlFor="isShop" className="text-sm text-gray-300">I run a repair shop</label>
          </div>

          {form.isShop && (
            <div>
              <label className="label">Business Name</label>
              <input
                type="text"
                className="input"
                placeholder="My Phone Repair Shop"
                value={form.businessName}
                onChange={e => update('businessName', e.target.value)}
              />
            </div>
          )}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-400 mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-brand-400 hover:text-brand-300 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
