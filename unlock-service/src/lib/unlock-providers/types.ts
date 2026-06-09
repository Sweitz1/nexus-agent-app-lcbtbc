export interface UnlockRequest {
  imei: string
  carrier: string
  deviceBrand?: string | null
  deviceModel?: string | null
  orderId: string
}

export interface UnlockResult {
  success: boolean
  providerOrderId?: string
  unlockCode?: string
  message?: string
  estimatedMinutes?: number
  error?: string
}

export interface ProviderStatusResult {
  providerOrderId: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  unlockCode?: string
  message?: string
}

export interface UnlockProvider {
  name: string
  submitOrder(request: UnlockRequest): Promise<UnlockResult>
  checkStatus(providerOrderId: string): Promise<ProviderStatusResult>
}
