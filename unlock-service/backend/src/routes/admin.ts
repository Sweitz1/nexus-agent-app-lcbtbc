import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

export async function adminRoutes(app: FastifyInstance) {
  // All admin routes require ADMIN role
  app.addHook('preHandler', requireAdmin)

  // GET /admin/stats — platform overview
  app.get('/admin/stats', async () => {
    const [totalOrders, totalUsers, completedOrders, processingOrders, failedOrders, revenue] = await Promise.all([
      db.unlockOrder.count(),
      db.user.count(),
      db.unlockOrder.count({ where: { status: 'COMPLETED' } }),
      db.unlockOrder.count({ where: { status: 'PROCESSING' } }),
      db.unlockOrder.count({ where: { status: 'FAILED' } }),
      db.transaction.aggregate({ _sum: { amountUsd: true }, where: { status: 'COMPLETED', type: { in: ['CREDIT_PURCHASE', 'SUBSCRIPTION'] } } }),
    ])

    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const [newUsers30, orders30] = await Promise.all([
      db.user.count({ where: { createdAt: { gte: last30Days } } }),
      db.unlockOrder.count({ where: { createdAt: { gte: last30Days } } }),
    ])

    return {
      totalOrders,
      totalUsers,
      completedOrders,
      processingOrders,
      failedOrders,
      successRate: totalOrders > 0 ? Math.round((completedOrders / totalOrders) * 100) : 0,
      totalRevenue: revenue._sum.amountUsd ?? 0,
      last30Days: { newUsers: newUsers30, orders: orders30 },
    }
  })

  // GET /admin/orders — all orders, paginated + filterable
  app.get('/admin/orders', async (req) => {
    const q     = req.query as { status?: string; page?: string; search?: string }
    const page  = Math.max(1, parseInt(q.page ?? '1', 10))
    const limit = 25

    const where: Record<string, unknown> = {}
    if (q.status) where['status'] = q.status
    if (q.search) {
      where['OR'] = [
        { imei: { contains: q.search } },
        { user: { email: { contains: q.search, mode: 'insensitive' } } },
      ]
    }

    const [orders, total] = await Promise.all([
      db.unlockOrder.findMany({
        where: where as never,
        include: { user: { select: { email: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      db.unlockOrder.count({ where: where as never }),
    ])

    return { orders, total, page, pages: Math.ceil(total / limit) }
  })

  // PUT /admin/orders/:id — manually update order (add unlock code, change status)
  app.put('/admin/orders/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const schema = z.object({
      status:     z.enum(['PENDING','PROCESSING','COMPLETED','FAILED','REFUNDED']).optional(),
      unlockCode: z.string().optional(),
      notes:      z.string().optional(),
    })
    const result = schema.safeParse(req.body)
    if (!result.success) return reply.code(400).send({ error: 'Invalid input' })

    const data: Record<string, unknown> = {}
    if (result.data.status)     data['status']      = result.data.status
    if (result.data.unlockCode) data['unlockCode']   = result.data.unlockCode
    if (result.data.notes)      data['notes']        = result.data.notes
    if (result.data.status === 'COMPLETED') data['completedAt'] = new Date()

    const order = await db.unlockOrder.update({ where: { id }, data: data as never })
    return order
  })

  // GET /admin/users — all users, paginated
  app.get('/admin/users', async (req) => {
    const q     = req.query as { page?: string; search?: string; role?: string }
    const page  = Math.max(1, parseInt(q.page ?? '1', 10))
    const limit = 25

    const where: Record<string, unknown> = {}
    if (q.role)   where['role'] = q.role
    if (q.search) where['OR'] = [
      { email: { contains: q.search, mode: 'insensitive' } },
      { name:  { contains: q.search, mode: 'insensitive' } },
    ]

    const [users, total] = await Promise.all([
      db.user.findMany({
        where: where as never,
        select: { id: true, email: true, name: true, role: true, businessName: true, createdAt: true, subscription: true, _count: { select: { orders: true } } },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      db.user.count({ where: where as never }),
    ])

    return { users, total, page, pages: Math.ceil(total / limit) }
  })

  // PUT /admin/users/:id/role — change user role
  app.put('/admin/users/:id/role', async (req, reply) => {
    const { id }  = req.params as { id: string }
    const { role } = req.body as { role: string }
    if (!['CONSUMER','SHOP','ADMIN'].includes(role)) {
      return reply.code(400).send({ error: 'Invalid role' })
    }
    const user = await db.user.update({ where: { id }, data: { role: role as never } })
    return { id: user.id, role: user.role }
  })

  // POST /admin/users/:id/credits — manually add credits to a user
  app.post('/admin/users/:id/credits', async (req, reply) => {
    const { id }      = req.params as { id: string }
    const { credits } = req.body as { credits: number }
    if (typeof credits !== 'number' || credits <= 0) {
      return reply.code(400).send({ error: 'credits must be a positive number' })
    }
    const sub = await db.subscription.upsert({
      where:  { userId: id },
      create: { userId: id, credits },
      update: { credits: { increment: credits } },
    })
    return { credits: sub.credits }
  })

  // GET /admin/transactions — revenue log
  app.get('/admin/transactions', async (req) => {
    const q     = req.query as { page?: string }
    const page  = Math.max(1, parseInt(q.page ?? '1', 10))
    const limit = 50

    const [rows, total] = await Promise.all([
      db.transaction.findMany({
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      db.transaction.count(),
    ])

    return { transactions: rows, total, page, pages: Math.ceil(total / limit) }
  })
}
