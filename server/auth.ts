import crypto from 'node:crypto'
import type { Request, Response, NextFunction } from 'express'

const JWT_SECRET = process.env.JWT_SECRET || 'gantt-secret-key-ufma-arq-comp-2026'

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(':')
    if (!salt || !hash) return false
    const computed = crypto.scryptSync(password, salt, 64).toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'))
  } catch {
    return false
  }
}

export interface TokenPayload {
  userId: string
  isMaster?: boolean
  exp?: number
}

export function signToken(payload: { userId: string; isMaster?: boolean }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })).toString('base64url')
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${signature}`
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [header, body, signature] = parts
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url')
    if (signature !== expectedSig) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload
    if (payload.exp && payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export interface AuthenticatedRequest extends Request {
  userId?: string
  isMaster?: boolean
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Não autorizado: token ausente ou inválido.' })
    return
  }
  const token = authHeader.slice(7).trim()
  const payload = verifyToken(token)
  if (!payload) {
    res.status(401).json({ error: 'Sessão expirada ou token inválido. Faça login novamente.' })
    return
  }
  req.userId = payload.userId
  req.isMaster = payload.isMaster ?? false
  next()
}

export function masterMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.isMaster) {
    res.status(403).json({ error: 'Acesso negado: requer privilégios de Administrador Master.' })
    return
  }
  next()
}
