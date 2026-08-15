// ═══════════════════════════════════════════════════════════════
// NexusHub Branches Routes
// ═══════════════════════════════════════════════════════════════

export default async function (fastify, opts) {
  const { prisma } = fastify

  fastify.get('/', { preHandler: fastify.requireAuth }, async (req, reply) => {
    return prisma.branch.findMany({ 
      where: { isActive: true }, 
      orderBy: { name: 'asc' } 
    })
  })
}
