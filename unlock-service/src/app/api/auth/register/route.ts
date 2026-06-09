import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '@/lib/db'

const schema = z.object({
  name:         z.string().min(1).max(100),
  email:        z.string().email(),
  password:     z.string().min(8).max(128),
  businessName: z.string().max(200).optional(),
  isShop:       z.boolean().optional(),
  plan:         z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const data = schema.parse(body)

    const existing = await db.user.findUnique({ where: { email: data.email.toLowerCase() } })
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(data.password, 12)

    const user = await db.user.create({
      data: {
        email:        data.email.toLowerCase(),
        name:         data.name,
        passwordHash,
        businessName: data.businessName,
        role:         data.isShop ? 'SHOP' : 'CONSUMER',
        subscription: {
          create: {
            tier:    'PAY_AS_YOU_GO',
            status:  'ACTIVE',
            credits: 0,
          },
        },
      },
    })

    return NextResponse.json({ userId: user.id }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0]?.message ?? 'Invalid input' }, { status: 400 })
    }
    console.error('Register error:', err)
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 })
  }
}
