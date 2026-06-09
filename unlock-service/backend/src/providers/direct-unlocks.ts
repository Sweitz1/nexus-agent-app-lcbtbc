import type { UnlockProvider, UnlockRequest, UnlockResult, ProviderStatusResult } from './types.js'

// DirectUnlocks reseller API — sign up at https://directunlocks.com/resellers
// Their API shape may differ slightly; adjust the field names to match their docs.
export class DirectUnlocksProvider implements UnlockProvider {
  name = 'DirectUnlocks'

  constructor(private readonly apiUrl: string, private readonly apiKey: string) {}

  async submitOrder(req: UnlockRequest): Promise<UnlockResult> {
    const res = await fetch(`${this.apiUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        imei:      req.imei,
        network:   req.carrier,
        brand:     req.deviceBrand ?? undefined,
        model:     req.deviceModel ?? undefined,
        reference: req.orderId,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      return { success: false, error: `Provider error ${res.status}: ${body}` }
    }

    const data = await res.json() as Record<string, unknown>
    return {
      success: true,
      providerOrderId: String(data['id'] ?? data['order_id'] ?? ''),
      estimatedMinutes: (data['estimated_time_minutes'] as number) ?? 60,
      message: data['message'] as string | undefined,
    }
  }

  async checkStatus(providerOrderId: string): Promise<ProviderStatusResult> {
    const res = await fetch(`${this.apiUrl}/orders/${providerOrderId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })

    if (!res.ok) {
      return { providerOrderId, status: 'failed', message: `Status check failed: ${res.status}` }
    }

    const data = await res.json() as Record<string, unknown>
    const statusMap: Record<string, ProviderStatusResult['status']> = {
      pending:    'pending',
      processing: 'processing',
      completed:  'completed',
      failed:     'failed',
      cancelled:  'failed',
    }

    return {
      providerOrderId,
      status: statusMap[String(data['status'])] ?? 'processing',
      unlockCode: (data['unlock_code'] ?? data['code']) as string | undefined,
      message: data['message'] as string | undefined,
    }
  }
}
