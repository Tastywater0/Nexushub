// ═══════════════════════════════════════════════════════════════
// NexusHub Approval Gate Middleware
// Intercepts non-superadmin writes to sensitive gated fields,
// routing them into the ChangeRequest approval queue.
// ═══════════════════════════════════════════════════════════════
import { sendViberAlert } from './viber.js'

export function withApproval(fastify, { entityType, gatedFields = [] }) {
  const prisma = fastify.prisma

  return async function handler(req, reply) {
    const role = req.user.role
    const isSuperadmin = ['SUPERADMIN', 'SUPERADMIN_DELEGATE'].includes(role)
    
    // Check if the request updates any gated fields
    const touchesGatedField = gatedFields.some(f => f in req.body)

    if (isSuperadmin || !touchesGatedField) {
      return null // Bypasses the queue, allows direct write
    }

    // Retrieve previous snapshot if it's an update (has ID parameter)
    let existing = null
    if (req.params.id) {
      if (entityType === 'EMPLOYEE') {
        existing = await prisma.employee.findUnique({
          where: { id: req.params.id }
        })
      }
    }

    // Create a new change request
    const cr = await prisma.changeRequest.create({
      data: {
        entityType,
        entityId: req.params.id || null,
        action: req.params.id ? 'UPDATE' : 'CREATE',
        proposedData: req.body,
        previousData: existing || null,
        proposedById: req.user.id,
      }
    })

    // Dispatch Viber alert to Superadmin
    try {
      await sendViberAlert(
        `🚨 NexusHub: New ${entityType} edit from ${req.user.name} requires your approval. View queue in Dashboard.`
      )
    } catch (err) {
      fastify.log.error('Failed to send Viber approval notification:', err.message)
    }

    // Return 202 Accepted to frontend indicating pending approval
    reply.code(202).send({
      status: 'PENDING_APPROVAL',
      changeRequestId: cr.id,
      message: 'Proposed changes submitted for Superadmin approval.'
    })

    return cr // Returns the change request, intercepting the direct database write
  }
}
