// ═══════════════════════════════════════════════════════════════
// NexusHub Inventory Routes
// ═══════════════════════════════════════════════════════════════
import { emailLowStock } from '../lib/mailer.js'

export default async function (fastify, opts) {
  const { prisma } = fastify

  fastify.get('/', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const { branchId, brand, search } = req.query
    const user = req.user

    // Branch managers and non-superadmins only see their own branch
    const targetBranchId = user.role === 'SUPERADMIN' ? branchId : user.branchId

    const where = {
      ...(targetBranchId ? { branchId: targetBranchId } : {}),
      product: {
        ...(brand ? { brand } : {}),
        ...(search ? { OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku:  { contains: search, mode: 'insensitive' } },
        ]} : {}),
      },
    }

    const items = await prisma.inventoryItem.findMany({
      where,
      include: { product: true, branch: true },
      orderBy: [{ product: { brand: 'asc' } }, { product: { name: 'asc' } }],
    })

    return items
  })

  fastify.get('/velocity', { preHandler: fastify.requireAuth }, async (req, reply) => {
    // Top fast movers and slow movers across all branches
    const fast = await prisma.inventoryItem.findMany({
      where: { velocity30d: { gt: 0 } },
      orderBy: { velocity30d: 'desc' },
      take: 20,
      include: { product: true, branch: true },
    })
    const slow = await prisma.inventoryItem.findMany({
      where: { velocity30d: { lte: 5 }, quantityOnHand: { gt: 3 } },
      orderBy: { velocity30d: 'asc' },
      take: 20,
      include: { product: true, branch: true },
    })
    return { fast, slow }
  })

  fastify.patch('/:id', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const { quantityOnHand } = req.body
    if (typeof quantityOnHand !== 'number' || quantityOnHand < 0) {
      return reply.status(400).send({ error: 'Invalid quantity' })
    }

    // Fetch the previous item first to record in log and get product details
    const oldItem = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      include: { product: true, branch: true }
    })

    if (!oldItem) {
      return reply.status(404).send({ error: 'Inventory item not found' })
    }

    const item = await prisma.inventoryItem.update({
      where: { id: req.params.id },
      data: { quantityOnHand, lastCountedAt: new Date() },
      include: { product: true, branch: true }
    })

    // Log the change
    await prisma.inventoryLog.create({
      data: {
        inventoryItemId: item.id,
        userId: req.user.id,
        previousQty: oldItem.quantityOnHand,
        newQty: quantityOnHand,
        reason: req.body.reason || 'Manual adjustment',
      },
    })

    // Check if this triggers a low-stock alert
    const reorderPt = item.product.reorderPoint || 5
    if (quantityOnHand <= reorderPt) {
      emailLowStock({ item, product: item.product, branch: item.branch }).catch(console.error)
    }

    return item
  })
}
