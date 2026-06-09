import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  const hash = await bcrypt.hash('password123', 12)

  // Admin user
  const admin = await db.user.upsert({
    where:  { email: 'admin@nexusunlock.com' },
    create: {
      email: 'admin@nexusunlock.com', name: 'Admin', passwordHash: hash, role: 'ADMIN',
      subscription: { create: { tier: 'ENTERPRISE', status: 'ACTIVE', credits: 99999 } },
    },
    update: {},
  })

  // Shop user
  const shop = await db.user.upsert({
    where:  { email: 'shop@repairpro.com' },
    create: {
      email: 'shop@repairpro.com', name: 'Jane Smith', businessName: 'Repair Pro', passwordHash: hash, role: 'SHOP',
      subscription: { create: { tier: 'STARTER', status: 'ACTIVE', credits: 68, renewsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } },
    },
    update: {},
  })

  // Consumer user
  const consumer = await db.user.upsert({
    where:  { email: 'user@example.com' },
    create: {
      email: 'user@example.com', name: 'Alex Johnson', passwordHash: hash, role: 'CONSUMER',
      subscription: { create: { tier: 'PAY_AS_YOU_GO', status: 'ACTIVE', credits: 0 } },
    },
    update: {},
  })

  // Sample orders for shop user
  const orders = [
    { imei: '357842103921045', carrier: 'AT&T',    deviceBrand: 'Apple',   deviceModel: 'iPhone 15 Pro Max', status: 'COMPLETED', unlockCode: '4821-7365-9024', priceUsd: 19.99 },
    { imei: '490154203237518', carrier: 'T-Mobile', deviceBrand: 'Samsung', deviceModel: 'Galaxy S24',        status: 'PROCESSING', priceUsd: 17.99 },
    { imei: '013862009123456', carrier: 'Verizon',  deviceBrand: null,      deviceModel: null,                status: 'COMPLETED', unlockCode: '3719-0482-6154', priceUsd: 19.99 },
    { imei: '864731058293746', carrier: 'MetroPCS', deviceBrand: 'Motorola',deviceModel: 'Moto G Power',      status: 'PENDING',   priceUsd: 12.99 },
    { imei: '351756051523999', carrier: 'Cricket Wireless', deviceBrand: 'Apple', deviceModel: 'iPhone 14',  status: 'COMPLETED', unlockCode: '7193-0482-6154', priceUsd: 12.99 },
  ]

  for (const o of orders) {
    await db.unlockOrder.create({
      data: {
        userId:       shop.id,
        imei:         o.imei,
        carrier:      o.carrier,
        deviceBrand:  o.deviceBrand,
        deviceModel:  o.deviceModel,
        status:       o.status as never,
        unlockCode:   o.unlockCode ?? null,
        completedAt:  o.status === 'COMPLETED' ? new Date() : null,
        priceUsd:     o.priceUsd,
        creditsCharged: 1,
        providerName: 'DemoProvider',
        providerOrderId: o.status === 'PROCESSING' ? `DEMO-${Date.now()}-test` : null,
      },
    })
  }

  console.log('✓ Seeded users:')
  console.log(`  admin@nexusunlock.com  / password123  (ADMIN)`)
  console.log(`  shop@repairpro.com     / password123  (SHOP)`)
  console.log(`  user@example.com       / password123  (CONSUMER)`)
  console.log(`✓ Seeded ${orders.length} sample orders`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
