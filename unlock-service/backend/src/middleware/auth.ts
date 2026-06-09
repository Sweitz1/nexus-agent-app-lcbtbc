import type { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken } from '../jwt.js'

// Attaches user to request if valid JWT provided (via cookie or Authorization header)
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const token =
    req.cookies?.['token'] ??
    req.headers.authorization?.replace(/^Bearer\s+/, '')

  if (!token) return reply.code(401).send({ error: 'Unauthorized' })

  try {
    const payload = await verifyToken(token)
    req.user = payload
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' })
  }
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requireAuth(req, reply)
  if (req.user?.role !== 'ADMIN') {
    return reply.code(403).send({ error: 'Forbidden' })
  }
}

// Extend Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    user?: import('../jwt.js').TokenPayload
  }
}
