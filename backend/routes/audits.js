// ═══════════════════════════════════════════════════════════════
// audits.js — Configurable Field Audit and Templates Routes
// ═══════════════════════════════════════════════════════════════

const STANDARD_ITEMS = {
  ROUTINE: [
    { category: 'Storefront', text: 'Exterior signage is clean and entrance path is clear' },
    { category: 'Merchandising', text: 'INGCO and WADFOW products are neatly aligned and free of dust' },
    { category: 'Merchandising', text: 'All items on display have visible, correct price tags' },
    { category: 'Safety & Compliance', text: 'Fire extinguishers are in place and fully inspected' },
    { category: 'Safety & Compliance', text: 'Emergency exits are completely unblocked' },
    { category: 'Cash Operations', text: 'POS area is tidy and till registers have no unauthorized cash' },
  ],
  EVENT_PROMO: [
    { category: 'Promotions', text: 'Promo banners and marketing standees are visible at storefront' },
    { category: 'Inventory', text: 'High-volume promotional SKUs are fully stocked on endcaps' },
    { category: 'Pricing', text: 'Clearance tag prices exactly match active database POS prices' },
    { category: 'Personnel', text: 'Staff are briefed on current promotions and bundle discounts' },
  ],
  COMPLIANCE: [
    { category: 'Personnel', text: 'All staff are wearing correct uniforms and employee badges' },
    { category: 'Legal & Admin', text: 'Business permits and safety inspection certificates are posted' },
    { category: 'Security', text: 'CCTV cameras are operational, clean, and recording properly' },
    { category: 'Security', text: 'Back-office and stockroom keys are securely stored' },
  ]
}

export default async function (fastify, opts) {
  const { prisma } = fastify

  // Helper middleware to ensure caller is Superadmin
  const requireSuperadmin = async (req, reply) => {
    const role = req.user.role
    if (!['SUPERADMIN', 'SUPERADMIN_DELEGATE'].includes(role)) {
      return reply.code(403).send({ error: 'Forbidden: Superadmin access required' })
    }
  }

  // GET /api/audits — Fetch all audits
  fastify.get('/', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const user = req.user
    return prisma.auditChecklist.findMany({
      where: user.role === 'SUPERADMIN' ? {} : { branchId: user.branchId },
      include: { 
        branch: true, 
        auditor: { select: { name: true, employeeId: true } }, 
        items: true 
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  })

  // GET /api/audits/templates — Get list of audit checklist templates
  fastify.get('/templates', { preHandler: fastify.requireAuth }, async (req, reply) => {
    return prisma.auditChecklistTemplate.findMany({
      orderBy: [{ auditType: 'asc' }, { sortOrder: 'asc' }]
    })
  })

  // POST /api/audits/templates — Create new checklist template item (Superadmin only)
  fastify.post('/templates', { preHandler: [fastify.requireAuth, requireSuperadmin] }, async (req, reply) => {
    const { auditType, itemLabel, sortOrder, active } = req.body
    if (!auditType || !itemLabel) {
      return reply.code(400).send({ error: 'Missing auditType or itemLabel' })
    }
    return prisma.auditChecklistTemplate.create({
      data: { auditType, itemLabel, sortOrder: parseInt(sortOrder || 0), active: active !== false }
    })
  })

  // PATCH /api/audits/templates/:id — Update checklist template item (Superadmin only)
  fastify.patch('/templates/:id', { preHandler: [fastify.requireAuth, requireSuperadmin] }, async (req, reply) => {
    const { auditType, itemLabel, sortOrder, active } = req.body
    const updateData = {}
    if (auditType !== undefined) updateData.auditType = auditType
    if (itemLabel !== undefined) updateData.itemLabel = itemLabel
    if (sortOrder !== undefined) updateData.sortOrder = parseInt(sortOrder)
    if (active !== undefined) updateData.active = active

    return prisma.auditChecklistTemplate.update({
      where: { id: req.params.id },
      data: updateData
    })
  })

  // DELETE /api/audits/templates/:id — Delete template item (Superadmin only)
  fastify.delete('/templates/:id', { preHandler: [fastify.requireAuth, requireSuperadmin] }, async (req, reply) => {
    await prisma.auditChecklistTemplate.delete({ where: { id: req.params.id } })
    return { success: true }
  })

  // POST /api/audits — Create checklist (uses DB templates if no custom items sent)
  fastify.post('/', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const { branchId, auditType, eventName, checklistItems } = req.body
    const type = auditType || 'ROUTINE'

    let itemsToCreate = []
    if (checklistItems && checklistItems.length > 0) {
      itemsToCreate = checklistItems.map(i => ({ category: i.category || type, text: i.text || i.itemText }))
    } else {
      // Query templates from database
      const templates = await prisma.auditChecklistTemplate.findMany({
        where: { auditType: type, active: true },
        orderBy: { sortOrder: 'asc' }
      })
      itemsToCreate = templates.map(t => ({ category: t.auditType, text: t.itemLabel }))
    }

    // Fallback if no templates are found in database
    if (itemsToCreate.length === 0) {
      const fallback = STANDARD_ITEMS[type] || STANDARD_ITEMS.ROUTINE
      itemsToCreate = fallback.map(i => ({ category: i.category, text: i.text }))
    }

    return prisma.auditChecklist.create({
      data: {
        branchId: branchId || req.user.branchId,
        auditorId: req.user.id,
        auditType: type,
        eventName: eventName || null,
        date: new Date(),
        status: 'IN_PROGRESS',
        items: {
          create: itemsToCreate.map(i => ({
            category: i.category,
            itemText: i.text,
            status: 'PENDING',
          })),
        },
      },
      include: { items: true, branch: true },
    })
  })

  // PATCH /api/audits/:id/items/:itemId — Update audit item state
  fastify.patch('/:id/items/:itemId', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const { status, notes, photoUrl } = req.body
    
    const allowedStatus = ['PENDING', 'PASS', 'FAIL', 'NA']
    if (status && !allowedStatus.includes(status)) {
      return reply.status(400).send({ error: 'Invalid check item status' })
    }

    return prisma.auditChecklistItem.update({
      where: { id: req.params.itemId },
      data: { 
        status, 
        notes: notes || null, 
        photoUrl: photoUrl || null 
      },
    })
  })

  // PATCH /api/audits/:id/submit — Submit audit and calculate compliance score
  fastify.patch('/:id/submit', { preHandler: fastify.requireAuth }, async (req, reply) => {
    const audit = await prisma.auditChecklist.findUnique({
      where: { id: req.params.id },
      include: { items: true },
    })

    if (!audit) {
      return reply.status(404).send({ error: 'Audit checklist not found' })
    }

    const pass = audit.items.filter(i => i.status === 'PASS').length
    const total = audit.items.filter(i => i.status !== 'NA').length
    const score = total > 0 ? Math.round((pass / total) * 100) : 0

    return prisma.auditChecklist.update({
      where: { id: req.params.id },
      data: { 
        status: 'SUBMITTED', 
        score 
      },
      include: { items: true, branch: true }
    })
  })
}
