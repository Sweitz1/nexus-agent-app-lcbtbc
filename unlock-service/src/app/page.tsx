import Link from 'next/link'
import { Smartphone, Shield, Zap, Users, CheckCircle, Star } from 'lucide-react'

const FEATURES = [
  { icon: Zap,      title: 'Fast Turnaround',     desc: 'Most unlocks delivered within 1–24 hours. Priority processing for shop plans.' },
  { icon: Shield,   title: '100% Legal & Safe',   desc: 'Official carrier database unlocks. No jailbreaks, no software exploits — your device stays clean.' },
  { icon: Smartphone, title: 'All Major Carriers', desc: 'AT&T, T-Mobile, Verizon, Sprint, MetroPCS, Cricket, Boost, and more.' },
  { icon: Users,    title: 'Repair Shop Friendly', desc: 'Monthly credit plans for high-volume shops. Bulk IMEI uploads, order tracking, team access.' },
]

const PLANS = [
  {
    name: 'Pay-Per-Unlock',
    price: 'From $9.99',
    period: 'per unlock',
    highlight: false,
    description: 'Perfect for individual customers. Pay only when you need it.',
    features: ['No subscription required', 'All US carriers supported', 'Email delivery of unlock code', 'Order status tracking'],
    cta: 'Get Started Free',
    href: '/register',
  },
  {
    name: 'Starter Shop',
    price: '$99',
    period: '/month',
    highlight: true,
    description: 'For small repair shops. 100 unlock credits per month.',
    features: ['100 unlock credits/month', 'All carrier support', 'Email notifications', 'Order history & dashboard', 'Priority email support'],
    cta: 'Start Free Trial',
    href: '/register?plan=starter',
  },
  {
    name: 'Pro Shop',
    price: '$249',
    period: '/month',
    highlight: false,
    description: 'High-volume shops. 300 credits + API access.',
    features: ['300 unlock credits/month', 'Bulk IMEI upload (CSV)', 'REST API access', 'Fastest processing priority', 'Dedicated support'],
    cta: 'Start Free Trial',
    href: '/register?plan=pro',
  },
]

const CARRIERS = ['AT&T', 'T-Mobile', 'Verizon', 'Sprint', 'MetroPCS', 'Cricket', 'Boost Mobile', 'US Cellular']

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-6 w-6 text-brand-400" />
            <span className="text-lg font-bold text-white">Nexus Unlock</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray-400 hover:text-white transition">Sign In</Link>
            <Link href="/register" className="btn-primary text-xs px-4 py-2">Get Started</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-800 bg-brand-950/50 px-4 py-1.5 text-sm text-brand-300 mb-6">
          <Star className="h-3.5 w-3.5 fill-current" />
          Trusted by 500+ repair shops
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold text-white tracking-tight mb-6">
          Unlock Any Phone<br />
          <span className="text-brand-400">From Any Carrier</span>
        </h1>
        <p className="max-w-2xl mx-auto text-xl text-gray-400 mb-10">
          Fast, legal carrier unlock service. Submit an IMEI, get an unlock code. Works on Windows, Mac, or run on a Raspberry Pi as a local shop server.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/register" className="btn-primary text-base px-8 py-3">
            Unlock a Phone — Starting at $9.99
          </Link>
          <Link href="#pricing" className="btn-secondary text-base px-8 py-3">
            Shop Plans
          </Link>
        </div>

        {/* Carrier logos */}
        <div className="mt-14 flex flex-wrap items-center justify-center gap-3">
          {CARRIERS.map(c => (
            <span key={c} className="rounded-full border border-gray-700 bg-gray-800 px-3 py-1 text-xs font-medium text-gray-400">
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="card">
            <Icon className="h-8 w-8 text-brand-400 mb-4" />
            <h3 className="font-semibold text-white mb-2">{title}</h3>
            <p className="text-sm text-gray-400">{desc}</p>
          </div>
        ))}
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-12">How It Works</h2>
        <div className="grid sm:grid-cols-3 gap-8">
          {[
            { step: '1', title: 'Enter Your IMEI', desc: 'Dial *#06# on any phone to get the IMEI number. Enter it along with your current carrier.' },
            { step: '2', title: 'We Process It',   desc: 'Our system submits your IMEI to the official carrier database. Most orders complete in 1–24 hours.' },
            { step: '3', title: 'Enter the Code',  desc: 'Receive your unlock code by email and in your dashboard. Follow the simple instructions to unlock.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
                {step}
              </div>
              <h3 className="font-semibold text-white mb-2">{title}</h3>
              <p className="text-sm text-gray-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-3xl font-bold text-white text-center mb-4">Simple Pricing</h2>
        <p className="text-center text-gray-400 mb-12">No hidden fees. Cancel anytime.</p>
        <div className="grid sm:grid-cols-3 gap-6">
          {PLANS.map(plan => (
            <div key={plan.name} className={`card relative flex flex-col ${plan.highlight ? 'border-brand-600 ring-1 ring-brand-600' : ''}`}>
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold text-white">
                  Most Popular
                </span>
              )}
              <div className="mb-6">
                <h3 className="font-bold text-white text-lg">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-white">{plan.price}</span>
                  <span className="text-sm text-gray-400">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-gray-400">{plan.description}</p>
              </div>
              <ul className="space-y-2.5 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-300">
                    <CheckCircle className="h-4 w-4 text-brand-400 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href={plan.href} className={plan.highlight ? 'btn-primary' : 'btn-secondary'}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 mt-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Smartphone className="h-4 w-4 text-brand-400" />
            <span className="font-semibold text-white">Nexus Unlock</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6 text-sm text-gray-400">
            <Link href="/login" className="hover:text-white transition">Sign In</Link>
            <Link href="/register" className="hover:text-white transition">Register</Link>
            <a href="mailto:support@nexusunlock.com" className="hover:text-white transition">Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
