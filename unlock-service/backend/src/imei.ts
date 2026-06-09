// Luhn checksum — standard IMEI validation
export function validateImei(imei: string): boolean {
  const d = imei.replace(/\D/g, '')
  if (d.length !== 15) return false
  let sum = 0
  for (let i = 0; i < 15; i++) {
    let n = parseInt(d[i]!)
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9 }
    sum += n
  }
  return sum % 10 === 0
}

const TAC_DATABASE: Record<string, { brand: string; model: string }> = {
  '35366910': { brand: 'Apple',    model: 'iPhone 15 Pro Max' },
  '35366911': { brand: 'Apple',    model: 'iPhone 15 Pro' },
  '35279610': { brand: 'Apple',    model: 'iPhone 15' },
  '35279611': { brand: 'Apple',    model: 'iPhone 15 Plus' },
  '35674113': { brand: 'Apple',    model: 'iPhone 14 Pro Max' },
  '35167210': { brand: 'Apple',    model: 'iPhone 14' },
  '35327210': { brand: 'Samsung',  model: 'Galaxy S24 Ultra' },
  '35455511': { brand: 'Samsung',  model: 'Galaxy S24+' },
  '35455510': { brand: 'Samsung',  model: 'Galaxy S24' },
  '35259410': { brand: 'Samsung',  model: 'Galaxy S23 Ultra' },
  '86751505': { brand: 'Google',   model: 'Pixel 8 Pro' },
  '86751504': { brand: 'Google',   model: 'Pixel 8' },
  '35399110': { brand: 'Motorola', model: 'Moto G Power' },
}

export function lookupImei(imei: string) {
  const cleaned = imei.replace(/\D/g, '')
  const tac = cleaned.slice(0, 8)
  const known = TAC_DATABASE[tac]
  return {
    imei: cleaned,
    tac,
    valid: validateImei(cleaned),
    brand: known?.brand ?? null,
    model: known?.model ?? null,
  }
}
