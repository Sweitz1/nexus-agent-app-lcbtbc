import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { db } from '../db.js'
import { signToken } from '../jwt.js'
import { requireAuth } from '../middleware/auth.js'
import { sendWelcome } from '../email/index.js'

const registerSchema = z.object({
  name:         z.string().min(1).max(100),
  email:        z.string().email(),
  password:     z.string().min(8).max(128),
  businessName: z.string().max(200).optional(),
  isShop:       z.boolean().optional(),
})

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post('/auth/register', async (req, reply) => {
    const result = registerSchema.safeParse(req.body)
    if (!result.success) {
      return reply.code(400).send({ error: result.error.errors[0]?.message ?? 'Invalid input' })
    }
    const { name, email, password, businessName, isShop } = result.data

    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) return reply.code(409).send({ error: 'Email already registered.' })

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await db.user.create({
      data: {
        name,
        email:        email.toLowerCase(),
        passwordHash,
        businessName: businessName ?? null,
        role:         isShop ? 'SHOP' : 'CONSUMER',
        subscription: { create: { tier: 'PAY_AS_YOU_GO', status: 'ACTIVE', credits: 0 } },
      },
    })

    await sendWelcome({ to: user.email, name: user.name ?? '' })

    const token = await signToken({ sub: user.id, email: user.email, role: user.role })
    reply
      .setCookie('token', token, { httpOnly: true, path: '/', secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7 })
      .code(201)
      .send({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token })
  })

  // POST /auth/login
  app.post('/auth/login', async (req, reply) => {
    const result = loginSchema.safeParse(req.body)
    if (!result.success) return reply.code(400).send({ error: 'Invalid input' })
    const { email, password } = result.data

    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (!user) return reply.code(401).send({ error: 'Invalid email or password.' })

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) return reply.code(401).send({ error: 'Invalid email or password.' })

    const token = await signToken({ sub: user.id, email: user.email, role: user.role })
    reply
      .setCookie('token', token, { httpOnly: true, path: '/', secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60 * 60 * 24 * 7 })
      .send({ user: { id: user.id, email: user.email, name: user.name, role: user.role }, token })
  })

  // GET /auth/me
  app.get('/auth/me', { preHandler: requireAuth }, async (req, reply) => {
    const user = await db.user.findUnique({
      where: { id: req.user!.sub },
      select: { id: true, email: true, name: true, role: true, businessName: true, subscription: true },
    })
    if (!user) return reply.code(404).send({ error: 'User not found' })
    return user
  })

  // POST /auth/logout
  app.post('/auth/logout', async (_req, reply) => {
    reply.clearCookie('token', { path: '/' }).send({ ok: true })
  })
}
