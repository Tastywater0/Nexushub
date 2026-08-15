// ═══════════════════════════════════════════════════════════════
// NexusHub Reconciliation Routes (EOD closing)
// ═══════════════════════════════════════════════════════════════
import { emailDiscrepancy } from '../lib/mailer.js'

export default async function (fastify, opts) {
  const { prisma } = fastify

  fastify.get('/', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const { branchId, dateFrom, dateTo } = req.query
    const user = req.user
    const targetBranchId = user.role === 'SUPERADMIN' ? branchId : user.branchId

    return prisma.dailyReconciliation.findMany({
      where: {
        ...(targetBranchId ? { branchId: targetBranchId } : {}),
        ...(dateFrom || dateTo ? {
          date: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            ...(dateTo   ? { lte: new Date(dateTo)   } : {}),
          },
        } : {}),
      },
      include: {
        branch: true,
        reconciledBy: { select: { name: true, employeeId: true } },
        supervisor:   { select: { name: true, employeeId: true } },
        lineItems:    { include: { product: true } },
      },
      orderBy: { date: 'desc' },
      take: 90,
    })
  })

  fastify.post('/', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const { 
      branchId, 
      date, 
      shiftEnd, 
      cashExpected, 
      cashPhysical,
      digitalExpected, 
      digitalActual, 
      lineItems, 
      supervisorId, 
      supervisorNote, 
      supervisorSig 
    } = req.body

    if (!branchId || !date || !shiftEnd) {
      return reply.status(400).send({ error: 'Missing required EOD reconciliation fields' })
    }

    // Extract YYYY-MM-DD to check for duplicates on this calendar day
    const dateStr = new Date(date).toISOString().slice(0, 10)
    const startOfDay = new Date(`${dateStr}T00:00:00.000Z`)
    const endOfDay = new Date(`${dateStr}T23:59:59.999Z`)

    // Prevent duplicate EOD per branch per day
    const existing = await prisma.dailyReconciliation.findFirst({
      where: {
        branchId,
        date: { gte: startOfDay, lte: endOfDay },
        status: { not: 'DRAFT' },
      },
    })
    if (existing) {
      return reply.status(409).send({ error: 'EOD already submitted for this branch today' })
    }

    // Compute variances SERVER-SIDE — never trust the client
    const cashVariance    = Number(cashPhysical)   - Number(cashExpected)
    const digitalVariance = Number(digitalActual)  - Number(digitalExpected)
    
    // Line item expected vs physical check
    const skuVariances    = (lineItems || []).filter(i => Number(i.physicalQty) !== Number(i.expectedQty))
    const hasDiscrepancy  = cashVariance !== 0 || digitalVariance !== 0 || skuVariances.length > 0

    // Enforce business rule: discrepancy requires supervisor approval
    if (hasDiscrepancy) {
      if (!supervisorId || !supervisorSig) {
        return reply.status(400).send({ 
          error: 'An EOD variance was detected. A supervisor ID and signature are required to log the discrepancy.' 
        })
      }
    }

    const status = hasDiscrepancy ? 'ESCALATED' : 'SUBMITTED'

    const recon = await prisma.dailyReconciliation.create({
      data: {
        branchId,
        reconciledById: req.user.id,
        date: new Date(date),
        shiftEnd: new Date(shiftEnd),
        cashExpected:    Number(cashExpected),
        cashPhysical:    Number(cashPhysical),
        cashVariance,
        digitalExpected: Number(digitalExpected),
        digitalActual:   Number(digitalActual),
        digitalVariance,
        hasDiscrepancy,
        status,
        supervisorId:   supervisorId || null,
        supervisorNote: supervisorNote || null,
        supervisorSig:  supervisorSig || null,
        lineItems: {
          create: (lineItems || []).map(i => ({
            productId:   i.productId,
            expectedQty: Number(i.expectedQty),
            physicalQty: Number(i.physicalQty),
            variance:    Number(i.physicalQty) - Number(i.expectedQty),
          })),
        },
      },
      include: { 
        branch: true, 
        reconciledBy: { select: { name: true } },
        lineItems: { include: { product: true } } 
      },
    })

    // Fire discrepancy email if needed
    if (hasDiscrepancy) {
      emailDiscrepancy({ recon, cashVariance, digitalVariance, skuVariances }).catch(console.error)
    }

    return recon
  })
}
