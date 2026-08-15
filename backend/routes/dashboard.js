// ═══════════════════════════════════════════════════════════════
// NexusHub Dashboard Routes
// ═══════════════════════════════════════════════════════════════

export default async function (fastify, opts) {
  const { prisma } = fastify

  fastify.get('/', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const branchId = req.user.role === 'SUPERADMIN' ? undefined : req.user.branchId
    const today = new Date(); today.setHours(0,0,0,0)
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)

    const [pendingTransfers, todayEODs, lowStockCount, stockoutCount] = await Promise.all([
      prisma.stockTransfer.count({ where: { status: 'PENDING' } }),
      prisma.dailyReconciliation.count({
        where: { 
          date: { gte: today, lt: tomorrow }, 
          status: { not: 'DRAFT' } 
        }
      }),
      prisma.inventoryItem.count({
        where: {
          ...(branchId ? { branchId } : {}),
          quantityOnHand: { gt: 0, lte: 5 }, // Assume general reorder point limit of 5 for KPI count
        }
      }),
      prisma.inventoryItem.count({
        where: { 
          ...(branchId ? { branchId } : {}), 
          quantityOnHand: 0 
        }
      }),
    ])

    return { 
      pendingTransfers, 
      todayEODs, 
      lowStockCount, 
      stockoutCount, 
      branchCount: 5, 
      totalEODs: 5 
    }
  })
}
