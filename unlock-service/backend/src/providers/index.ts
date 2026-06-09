import type { UnlockProvider } from './types.js'
import { DemoProvider } from './demo.js'
import { DirectUnlocksProvider } from './direct-unlocks.js'

export * from './types.js'

let _provider: UnlockProvider | null = null

export function getProvider(): UnlockProvider {
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
