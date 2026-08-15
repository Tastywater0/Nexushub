// ═══════════════════════════════════════════════════════════════
// NexusHub Backend — Fastify + Prisma + PostgreSQL
// ═══════════════════════════════════════════════════════════════
import Fastify from 'fastify'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import { PrismaClient } from '@prisma/client'
import cron from 'node-cron'
import { generateVelocityTransfers } from './lib/velocity.js'

// Import modular routes
import authRoutes from './routes/auth.js'
import branchesRoutes from './routes/branches.js'
import inventoryRoutes from './routes/inventory.js'
import transfersRoutes from './routes/transfers.js'
import reconciliationsRoutes from './routes/reconciliations.js'
import auditsRoutes from './routes/audits.js'
import employeesRoutes from './routes/employees.js'
import dashboardRoutes from './routes/dashboard.js'
import payrollRoutes from './routes/payroll.js'
import approvalsRoutes from './routes/approvals.js'
import multipart from '@fastify/multipart'
import fs from 'fs'
import path from 'path'

const prisma = new PrismaClient()
const app = Fastify({ logger: true })

// ── DECORATORS & MIDDLEWARES ─────────────────────────────────
app.decorate('prisma', prisma)

// Auth Verification
async function requireAuth(request, reply) {
  try {
    if (request.query && request.query.token) {
      request.headers.authorization = `Bearer ${request.query.token}`
    }
    await request.jwtVerify()
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' })
  }
}
app.decorate('requireAuth', requireAuth)

// Role Check Verification
function requireRole(...roles) {
  return async (request, reply) => {
    await requireAuth(request, reply)
    if (!roles.includes(request.user.role)) {
      reply.status(403).send({ error: 'Forbidden' })
    }
  }
}
app.decorate('requireRole', requireRole)

// ── REGISTER PLUGINS ──────────────────────────────────────────
await app.register(cors, {
  origin: [
    process.env.FRONTEND_URL || 'https://nexushub.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173', // standard Vite default port
  ],
  credentials: true,
})

await app.register(jwt, {
  secret: process.env.JWT_SECRET || 'change-this-in-production-min-32-chars',
})

await app.register(multipart)

// ── REGISTER ROUTES ───────────────────────────────────────────
await app.register(authRoutes, { prefix: '/api/auth' })
await app.register(branchesRoutes, { prefix: '/api/branches' })
await app.register(inventoryRoutes, { prefix: '/api/inventory' })
await app.register(transfersRoutes, { prefix: '/api/transfers' })
await app.register(reconciliationsRoutes, { prefix: '/api/reconciliations' })
await app.register(auditsRoutes, { prefix: '/api/audits' })
await app.register(employeesRoutes, { prefix: '/api/employees' })
await app.register(dashboardRoutes, { prefix: '/api/dashboard' })
await app.register(payrollRoutes, { prefix: '/api/payroll' })
await app.register(approvalsRoutes, { prefix: '/api/approvals' })

// ── UPLOADS STATIC ROUTE ──────────────────────────────────────
app.get('/uploads/:filename', async (request, reply) => {
  const filePath = path.join(path.resolve('uploads'), request.params.filename)
  if (fs.existsSync(filePath)) {
    const stream = fs.createReadStream(filePath)
    return reply.send(stream)
  }
  return reply.code(404).send({ error: 'File not found' })
})

// ── HEALTH CHECK ──────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))
app.get('/api/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

// ── NIGHTLY CRON JOBS ─────────────────────────────────────────

// Recompute velocity30d for all inventory items every night at 1 AM
cron.schedule('0 1 * * *', async () => {
  app.log.info('Running nightly velocity recalculation...')
  try {
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const items = await prisma.inventoryItem.findMany({ select: { id: true, productId: true, branchId: true } })

    for (const item of items) {
      // In production this queries POS sales / transactions
      const soldCount = await prisma.saleLineItem?.aggregate?.({
        where: {
          productId: item.productId,
          sale: { branchId: item.branchId, createdAt: { gte: thirtyDaysAgo } },
        },
        _sum: { quantity: true },
      }).catch(() => ({ _sum: { quantity: 0 } }))

      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { velocity30d: soldCount?._sum?.quantity || 0 },
      })
    }
    app.log.info('Velocity recalculation complete.')
  } catch (err) {
    app.log.error(err, 'Error in nightly velocity cron job')
  }
})

// Generate transfer recommendations every morning at 6 AM
cron.schedule('0 6 * * *', async () => {
  app.log.info('Running auto transfer recommendation engine...')
  try {
    const created = await generateVelocityTransfers(prisma)
    app.log.info(`Created ${created.length} transfer recommendations.`)
  } catch (err) {
    app.log.error(err, 'Error in auto transfer cron job')
  }
})

// ── START ─────────────────────────────────────────────────────
try {
  await app.listen({ port: parseInt(process.env.PORT || '8080'), host: '0.0.0.0' })
  console.log(`NexusHub API running on port ${process.env.PORT || 8080}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
