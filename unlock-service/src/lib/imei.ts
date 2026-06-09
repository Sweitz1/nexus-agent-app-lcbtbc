// Luhn algorithm — standard IMEI checksum validation
export function validateImei(imei: string): boolean {
  const cleaned = imei.replace(/\D/g, '')
  if (cleaned.length !== 15) return false

  let sum = 0
  for (let i = 0; i < 15; i++) {
    let digit = parseInt(cleaned[i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

// TAC (Type Allocation Code) is the first 8 digits — identifies manufacturer & model
const TAC_DATABASE: Record<string, { brand: string; model: string }> = {
  '35366910': { brand: 'Apple',   model: 'iPhone 15 Pro Max' },
  '35366911': { brand: 'Apple',   model: 'iPhone 15 Pro' },
  '35279610': { brand: 'Apple',   model: 'iPhone 15' },
  '35279611': { brand: 'Apple',   model: 'iPhone 15 Plus' },
  '35674113': { brand: 'Apple',   model: 'iPhone 14 Pro Max' },
  '35167210': { brand: 'Apple',   model: 'iPhone 14' },
  '35327210': { brand: 'Samsung', model: 'Galaxy S24 Ultra' },
  '35455511': { brand: 'Samsung', model: 'Galaxy S24+' },
  '35455510': { brand: 'Samsung', model: 'Galaxy S24' },
  '35259410': { brand: 'Samsung', model: 'Galaxy S23 Ultra' },
  '86751505': { brand: 'Google',  model: 'Pixel 8 Pro' },
  '86751504': { brand: 'Google',  model: 'Pixel 8' },
  '35399110': { brand: 'Motorola', model: 'Moto G Power' },
}

// Known brand prefixes from TAC ranges
const BRAND_PREFIXES: Array<{ prefix: string; brand: string }> = [
  { prefix: '35', brand: 'Apple' },      // Apple TAC range
  { prefix: '86', brand: 'Google' },
  { prefix: '35', brand: 'Samsung' },
  { prefix: '35', brand: 'Motorola' },
  { prefix: '86', brand: 'OnePlus' },
  { prefix: '35', brand: 'LG' },
]

export interface ImeiInfo {
  imei: string
  tac: string
  brand: string | null
  model: string | null
  valid: boolean
}

export function lookupImei(imei: string): ImeiInfo {
  const cleaned = imei.replace(/\D/g, '')
  const valid = validateImei(cleaned)
  const tac = cleaned.slice(0, 8)

  const known = TAC_DATABASE[tac]

  return {
    imei: cleaned,
    tac,
    brand: known?.brand ?? null,
    model: known?.model ?? null,
    valid,
  }
}
