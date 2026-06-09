import type { UnlockProvider, UnlockRequest, UnlockResult, ProviderStatusResult } from './types.js'

// Simulates a real provider. Replace with DirectUnlocksProvider when ready.
export class DemoProvider implements UnlockProvider {
  name = 'DemoProvider'

  async submitOrder(req: UnlockRequest): Promise<UnlockResult> {
    await delay(600)
    const providerOrderId = `DEMO-${Date.now()}-${rnd()}`
    console.log(`[DemoProvider] Order submitted for IMEI ${req.imei} → ${providerOrderId}`)
    return {
      success: true,
      providerOrderId,
      estimatedMinutes: 2,
      message: 'Demo mode — unlock code simulated after 30s',
    }
  }

  async checkStatus(providerOrderId: string): Promise<ProviderStatusResult> {
    await delay(200)
    const timestamp = parseInt(providerOrderId.split('-')[1] ?? '0', 10)
    const ageSeconds = (Date.now() - timestamp) / 1000

    if (ageSeconds > 30) {
      return {
        providerOrderId,
        status: 'completed',
        unlockCode: rnd(10).toUpperCase(),
        message: 'Unlock complete (DEMO)',
      }
    }
    return { providerOrderId, status: 'processing', message: 'Processing...' }
  }
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
const rnd = (len = 8) => Math.random().toString(36).slice(2, 2 + len)
