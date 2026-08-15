// ═══════════════════════════════════════════════════════════════
// approvals.js — Approval Queue Routes for Superadmin
// ═══════════════════════════════════════════════════════════════
import { sendViberAlert } from '../lib/viber.js'
import { encryptEmployee } from '../lib/encryption.js'

export default async function approvalsRoutes(fastify, options) {
  const prisma = fastify.prisma

  // Helper middleware to ensure caller is Superadmin
  const requireSuperadmin = async (req, reply) => {
    const role = req.user.role
    if (!['SUPERADMIN', 'SUPERADMIN_DELEGATE'].includes(role)) {
      return reply.code(403).send({ error: 'Forbidden: Superadmin access required' })
    }
  }

  // GET /api/approvals — Fetch all pending change requests
  fastify.get('/approvals', { preHandler: [fastify.requireAuth, requireSuperadmin] }, async (req, reply) => {
    const { entityType } = req.query
    const pendingRequests = await prisma.changeRequest.findMany({
      where: {
        status: 'PENDING',
        entityType: entityType || undefined
      },
      include: {
        proposedBy: {
          select: { id: true, name: true, employeeId: true, role: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    })
    return pendingRequests
  })

  // POST /api/approvals/:id/approve — Approve a pending change request
  fastify.post('/approvals/:id/approve', { preHandler: [fastify.requireAuth, requireSuperadmin] }, async (req, reply) => {
    const cr = await prisma.changeRequest.findUnique({
      where: { id: req.params.id },
      include: { proposedBy: true }
    })

    if (!cr || cr.status !== 'PENDING') {
      return reply.code(404).send({ error: 'Change request not found or already processed' })
    }

    // Apply the proposed change based on entityType
    if (cr.entityType === 'EMPLOYEE') {
      const data = encryptEmployee(cr.proposedData)
      if (cr.action === 'UPDATE') {
        await prisma.employee.update({
          where: { id: cr.entityId },
          data
        })
      } else if (cr.action === 'CREATE') {
        await prisma.employee.create({
          data
        })
      }
    } else {
      return reply.code(400).send({ error: `Unsupported entity type: ${cr.entityType}` })
    }

    // Update ChangeRequest status
    const updatedCr = await prisma.changeRequest.update({
      where: { id: cr.id },
      data: {
        status: 'APPROVED',
        reviewedById: req.user.id,
        reviewedAt: new Date()
      }
    })

    // Log the action to AuditLog
    await prisma.auditLog.create({
      data: {
        entityType: cr.entityType,
        entityId: cr.entityId || 'new-entity',
        action: `APPROVE_${cr.action}`,
        changedData: cr.proposedData,
        changedById: req.user.id
      }
    })

    // Notify the proposer via Viber if possible
    try {
      await sendViberAlert(
        `✅ Edit request for ${cr.entityType} (${cr.entityId || 'New'}) has been APPROVED by Superadmin.`
      )
    } catch (err) {
      fastify.log.error('Failed to send Viber approval notification to proposer:', err.message)
    }

    return { status: 'APPROVED', changeRequest: updatedCr }
  })

  // POST /api/approvals/:id/reject — Reject a pending change request
  fastify.post('/approvals/:id/reject', { preHandler: [fastify.requireAuth, requireSuperadmin] }, async (req, reply) => {
    const { note } = req.body || {}
    const cr = await prisma.changeRequest.findUnique({
      where: { id: req.params.id },
      include: { proposedBy: true }
    })

    if (!cr || cr.status !== 'PENDING') {
      return reply.code(404).send({ error: 'Change request not found or already processed' })
    }

    // Update ChangeRequest status to REJECTED
    const updatedCr = await prisma.changeRequest.update({
      where: { id: cr.id },
      data: {
        status: 'REJECTED',
        reviewedById: req.user.id,
        reviewedAt: new Date(),
        reviewNote: note || null
      }
    })

    // Log the rejection
    await prisma.auditLog.create({
      data: {
        entityType: cr.entityType,
        entityId: cr.entityId || 'new-entity',
        action: `REJECT_${cr.action}`,
        changedData: { proposed: cr.proposedData, note },
        changedById: req.user.id
      }
    })

    // Notify proposer
    try {
      await sendViberAlert(
        `❌ Edit request for ${cr.entityType} has been REJECTED by Superadmin. Reason: ${note || 'No reason specified.'}`
      )
    } catch (err) {
      fastify.log.error('Failed to send Viber rejection notification:', err.message)
    }

    return { status: 'REJECTED', changeRequest: updatedCr }
  })
}
