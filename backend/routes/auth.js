// ═══════════════════════════════════════════════════════════════
// NexusHub Auth Routes
// ═══════════════════════════════════════════════════════════════
import bcrypt from 'bcrypt'

export default async function (fastify, opts) {
  const { prisma } = fastify

  fastify.post('/login', async (req, reply) => {
    const { employeeId, password } = req.body
    if (!employeeId || !password) {
      return reply.status(400).send({ error: 'employeeId and password required' })
    }

    const user = await prisma.user.findUnique({
      where: { employeeId },
      include: { branch: true },
    })

    if (!user || !user.isActive) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      return reply.status(401).send({ error: 'Invalid credentials' })
    }

    const token = fastify.jwt.sign(
      { 
        id: user.id, 
        employeeId: user.employeeId, 
        name: user.name,
        role: user.role, 
        branchId: user.branchId, 
        branchCode: user.branch.code 
      },
      { expiresIn: '12h' }
    )

    return { 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        role: user.role,
        branchCode: user.branch.code, 
        branchName: user.branch.name 
      } 
    }
  })

  fastify.post('/refresh', { preHandler: fastify.requireAuth }, async (req, reply) => {
    // Generate new token extending the session
    const token = fastify.jwt.sign(
      { 
        id: req.user.id, 
        employeeId: req.user.employeeId, 
        name: req.user.name,
        role: req.user.role, 
        branchId: req.user.branchId, 
        branchCode: req.user.branchCode 
      },
      { expiresIn: '12h' }
    )
    return { token }
  })
}
