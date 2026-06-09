import type { UnlockProvider } from './types'
import { DemoProvider } from './demo-provider'
import { DirectUnlocksProvider } from './direct-unlocks-provider'

export * from './types'

let _provider: UnlockProvider | null = null

export function getUnlockProvider(): UnlockProvider {
  if (_provider) return _provider

  if (process.env.DEMO_MODE === 'true' || !process.env.UNLOCK_PROVIDER_API_KEY) {
    _provider = new DemoProvider()
    return _provider
  }

  _provider = new DirectUnlocksProvider(
    process.env.UNLOCK_PROVIDER_API_URL!,
    process.env.UNLOCK_PROVIDER_API_KEY!,
  )
  return _provider
}
