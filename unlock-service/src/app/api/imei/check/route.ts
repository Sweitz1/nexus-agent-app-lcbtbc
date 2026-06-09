import { NextRequest, NextResponse } from 'next/server'
import { lookupImei } from '@/lib/imei'

export async function GET(req: NextRequest) {
  const imei = req.nextUrl.searchParams.get('imei') ?? ''
  const info = lookupImei(imei)
  return NextResponse.json(info)
}
