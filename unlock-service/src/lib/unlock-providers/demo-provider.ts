import type { UnlockProvider, UnlockRequest, UnlockResult, ProviderStatusResult } from './types'

// Simulates a real unlock provider for development/testing.
// Replace this with a real provider integration (e.g. DirectUnlocks, UnlockBase).
export class DemoProvider implements UnlockProvider {
  name = 'DemoProvider'

  async submitOrder(request: UnlockRequest): Promise<UnlockResult> {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 800))

    const providerOrderId = `DEMO-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

    return {
      success: true,
      providerOrderId,
      estimatedMinutes: 5,
      message: 'Order submitted. Demo mode — unlock code will be simulated.',
    }
  }

  async checkStatus(providerOrderId: string): Promise<ProviderStatusResult> {
    await new Promise(r => setTimeout(r, 300))

    // In demo mode, orders placed > 30s ago are "completed"
    const timestampStr = providerOrderId.split('-')[1]
    const timestamp = parseInt(timestampStr ?? '0', 10)
    const ageSeconds = (Date.now() - timestamp) / 1000

    if (ageSeconds > 30) {
      return {
        providerOrderId,
        status: 'completed',
        unlockCode: `DEMO-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        message: 'Unlock code generated (DEMO)',
      }
    }

    return { providerOrderId, status: 'processing', message: 'Processing order...' }
  }
}
