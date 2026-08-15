// ═══════════════════════════════════════════════════════════════
// NexusHub Stock Transfer Routes
// ═══════════════════════════════════════════════════════════════
import { generateVelocityTransfers } from '../lib/velocity.js'

export default async function (fastify, opts) {
  const { prisma } = fastify

  fastify.get('/', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const { status, fromBranchId, toBranchId } = req.query
    return prisma.stockTransfer.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(fromBranchId ? { fromBranchId } : {}),
        ...(toBranchId ? { toBranchId } : {}),
      },
      include: {
        fromBranch: true, 
        toBranch: true,
        lineItems: { include: { product: true } },
        approvedBy: { select: { name: true, employeeId: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  })

  fastify.post('/generate', {
    preHandler: fastify.requireRole('SUPERADMIN', 'BRANCH_MANAGER')
  }, async (req, reply) => {
    const created = await generateVelocityTransfers(prisma)
    return { created: created.length, transfers: created }
  })

  fastify.patch('/:id/approve', {
    preHandler: fastify.requireRole('SUPERADMIN', 'BRANCH_MANAGER')
  }, async (req, reply) => {
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: req.params.id },
      include: { lineItems: { include: { product: true } }, fromBranch: true, toBranch: true },
    })

    if (!transfer) return reply.status(404).send({ error: 'Transfer not found' })
    if (transfer.status !== 'PENDING') return reply.status(400).send({ error: 'Transfer is not pending' })

    const updated = await prisma.stockTransfer.update({
      where: { id: req.params.id },
      data: {
        status: 'APPROVED',
        approvedById: req.user.id,
        approvedAt: new Date(),
      },
    })

    return updated
  })

  fastify.patch('/:id/status', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const { status } = req.body
    const allowed = ['IN_TRANSIT', 'COMPLETED', 'CANCELLED']
    if (!allowed.includes(status)) {
      return reply.status(400).send({ error: 'Invalid status' })
    }

    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: req.params.id },
      include: { lineItems: true },
    })

    if (!transfer) {
      return reply.status(404).send({ error: 'Transfer not found' })
    }

    // Enforce status flow: PENDING -> APPROVED -> IN_TRANSIT -> COMPLETED
    const current = transfer.status
    if (status === 'IN_TRANSIT') {
      if (current !== 'APPROVED') {
        return reply.status(400).send({ error: 'Can only transition to IN_TRANSIT from APPROVED status' })
      }
    } else if (status === 'COMPLETED') {
      if (current !== 'IN_TRANSIT') {
        return reply.status(400).send({ error: 'Can only transition to COMPLETED from IN_TRANSIT status' })
      }
    } else if (status === 'CANCELLED') {
      if (current === 'COMPLETED' || current === 'CANCELLED') {
        return reply.status(400).send({ error: 'Cannot cancel a completed or already cancelled transfer' })
      }
    }

    // On COMPLETED: atomic inventory update
    if (status === 'COMPLETED') {
      const updated = await prisma.$transaction(async (tx) => {
        for (const item of transfer.lineItems) {
          // Deduct from donor
          const donorItem = await tx.inventoryItem.update({
            where: { productId_branchId: { productId: item.productId, branchId: transfer.fromBranchId } },
            data: { quantityOnHand: { decrement: item.quantity } }
          })
          // Add to receiver
          const receiverItem = await tx.inventoryItem.update({
            where: { productId_branchId: { productId: item.productId, branchId: transfer.toBranchId } },
            data: { quantityOnHand: { increment: item.quantity } }
          })

          // Log changes
          await tx.inventoryLog.create({
            data: {
              inventoryItemId: donorItem.id,
              userId: req.user.id,
              previousQty: donorItem.quantityOnHand + item.quantity,
              newQty: donorItem.quantityOnHand,
              reason: `Transfer Out (ID: ${transfer.id})`,
            },
          })

          await tx.inventoryLog.create({
            data: {
              inventoryItemId: receiverItem.id,
              userId: req.user.id,
              previousQty: receiverItem.quantityOnHand - item.quantity,
              newQty: receiverItem.quantityOnHand,
              reason: `Transfer In (ID: ${transfer.id})`,
            },
          })
        }

        return tx.stockTransfer.update({
          where: { id: req.params.id },
          data: { status, completedAt: new Date() }
        })
      })

      return updated
    } else {
      const updated = await prisma.stockTransfer.update({
        where: { id: req.params.id },
        data: { status }
      })
      return updated
    }
  })
}
