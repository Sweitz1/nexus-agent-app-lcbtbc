import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { redirect } from 'next/navigation'
import { CheckCircle, CreditCard } from 'lucide-react'
import { PLANS } from '@/lib/stripe'
import { formatDate } from '@/lib/utils'
import { SubscribeButton } from './subscribe-button'

export const metadata = { title: 'Subscription' }

const PLAN_ENTRIES = Object.entries(PLANS) as [keyof typeof PLANS, typeof PLANS[keyof typeof PLANS]][]

export default async function SubscriptionPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const subscription = await db.subscription.findUnique({
    where: { userId: session.user.id },
  })

  const currentTier = subscription?.tier ?? 'PAY_AS_YOU_GO'
  const credits = subscription?.credits ?? 0

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Subscription</h1>
      <p className="text-gray-400 text-sm mb-8">Manage your plan and credits.</p>

      {/* Current status */}
      <div className="card mb-8">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-400 mb-1">Current Plan</div>
            <div className="text-lg font-bold text-white">{currentTier.replace('_', ' ')}</div>
            {subscription?.renewsAt && (
              <div className="text-xs text-gray-400 mt-1">Renews {formatDate(subscription.renewsAt)}</div>
            )}
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400 mb-1">Credits Remaining</div>
            <div className="text-3xl font-bold text-brand-400">
              {currentTier === 'ENTERPRISE' ? '∞' : credits}
            </div>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div className="grid sm:grid-cols-3 gap-6">
        {PLAN_ENTRIES.map(([key, plan]) => {
          const isCurrent = currentTier === key
          return (
            <div key={key} className={`card flex flex-col ${isCurrent ? 'border-brand-600 ring-1 ring-brand-600' : ''}`}>
              {isCurrent && (
                <div className="flex items-center gap-1.5 text-xs text-brand-400 font-medium mb-3">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Current Plan
                </div>
              )}
              <div className="mb-4">
                <h3 className="font-bold text-white">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-extrabold text-white">${plan.priceUsd}</span>
                  <span className="text-sm text-gray-400">/month</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {plan.credits === -1 ? 'Unlimited unlocks' : `${plan.credits} credits/month`}
                </p>
              </div>

              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <CheckCircle className="h-3.5 w-3.5 text-brand-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              <SubscribeButton
                planKey={key}
                priceId={plan.priceId}
                isCurrent={isCurrent}
                planName={plan.name}
              />
            </div>
          )
        })}
      </div>

      {/* Pay-per-unlock credits */}
      <div className="mt-8 card">
        <div className="flex items-center gap-3 mb-4">
          <CreditCard className="h-5 w-5 text-brand-400" />
          <h2 className="font-semibold text-white">Buy One-Time Credits</h2>
        </div>
        <p className="text-sm text-gray-400 mb-4">Need a few unlocks without a subscription? Buy credits as needed.</p>
        <div className="grid grid-cols-3 gap-3">
          {[
            { credits: 5,  price: 49.95,  label: '5 Credits — $49.95' },
            { credits: 15, price: 119.85, label: '15 Credits — $119.85' },
            { credits: 30, price: 209.70, label: '30 Credits — $209.70' },
          ].map(pkg => (
            <SubscribeButton
              key={pkg.credits}
              planKey="CREDITS"
              priceId=""
              isCurrent={false}
              planName={pkg.label}
              credits={pkg.credits}
              priceUsd={pkg.price}
              oneTime
            />
          ))}
        </div>
      </div>
    </div>
  )
}
