import type { UnlockProvider, UnlockRequest, UnlockResult, ProviderStatusResult } from './types'

// DirectUnlocks reseller API integration.
// Sign up at https://directunlocks.com/resellers to get an API key.
// Their API docs will be provided after reseller account approval.
export class DirectUnlocksProvider implements UnlockProvider {
  name = 'DirectUnlocks'

  constructor(
    private readonly apiUrl: string,
    private readonly apiKey: string,
  ) {}

  async submitOrder(request: UnlockRequest): Promise<UnlockResult> {
    const res = await fetch(`${this.apiUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        imei: request.imei,
        network: request.carrier,
        brand: request.deviceBrand,
        model: request.deviceModel,
        reference: request.orderId,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return { success: false, error: `Provider error: ${res.status} — ${err}` }
    }

    const data = await res.json()
    return {
      success: true,
      providerOrderId: String(data.id ?? data.order_id),
      estimatedMinutes: data.estimated_time_minutes ?? 60,
      message: data.message,
    }
  }

  async checkStatus(providerOrderId: string): Promise<ProviderStatusResult> {
    const res = await fetch(`${this.apiUrl}/orders/${providerOrderId}`, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
    })

    if (!res.ok) {
      return { providerOrderId, status: 'failed', message: `Status check failed: ${res.status}` }
    }

    const data = await res.json()
    const statusMap: Record<string, ProviderStatusResult['status']> = {
      pending:    'pending',
      processing: 'processing',
      completed:  'completed',
      failed:     'failed',
      cancelled:  'failed',
    }

    return {
      providerOrderId,
      status: statusMap[data.status] ?? 'processing',
      unlockCode: data.unlock_code ?? data.code,
      message: data.message,
    }
  }
}
