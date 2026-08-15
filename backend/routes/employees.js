// ═══════════════════════════════════════════════════════════════
// employees.js — Detailed Employee & 201 File Drawer Routes
// ═══════════════════════════════════════════════════════════════
import fs from 'fs'
import path from 'path'
import { pipeline } from 'stream/promises'
import { withApproval } from '../lib/approvalGate.js'
import { decryptEmployee, encryptEmployee } from '../lib/encryption.js'
import { sendViberAlert } from '../lib/viber.js'

export default async function employeesRoutes(fastify, options) {
  const prisma = fastify.prisma

  // GET /api/employees — Fetch list of employees (Role-gated)
  fastify.get('/', { preHandler: [fastify.requireAuth] }, async (req, reply) => {
    const user = req.user
    const isSuperadmin = ['SUPERADMIN', 'SUPERADMIN_DELEGATE'].includes(user.role)
    const { branchId } = req.query

    const targetBranchId = isSuperadmin ? branchId : user.branchId

    const employees = await prisma.employee.findMany({
      where: {
        ...(targetBranchId ? { branchId: targetBranchId } : {})
      },
      include: {
        branch: { select: { name: true, code: true } }
      },
      orderBy: { lastName: 'asc' }
    })

    // Decrypt and mask sensitive details in list response
    return employees.map(emp => {
      const decrypted = decryptEmployee(emp)
      if (!isSuperadmin) {
        decrypted.basicSalary = 0
        decrypted.allowance = 0
        decrypted.bankAccountNo = null
        decrypted.bankAccountName = null
        decrypted.bankName = null
        decrypted.tin = null
        decrypted.sssNo = null
        decrypted.philhealthNo = null
        decrypted.hdmfNo = null
      }
      return decrypted
    })
  })

  // GET /api/employees/:id — Fetch full detail for Drawer (Masked for non-admins)
  fastify.get('/:id', { preHandler: [fastify.requireAuth] }, async (req, reply) => {
    const user = req.user
    const isSuperadmin = ['SUPERADMIN', 'SUPERADMIN_DELEGATE'].includes(user.role)

    const emp = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: {
        branch: true,
        documents: true
      }
    })

    if (!emp) {
      return reply.code(404).send({ error: 'Employee not found' })
    }

    const decrypted = decryptEmployee(emp)

    // Mask bank/salary details if caller is not superadmin
    if (!isSuperadmin) {
      decrypted.basicSalary = 0
      decrypted.allowance = 0
      decrypted.bankAccountName = null
      decrypted.bankName = null
      decrypted.bankAccountNo = decrypted.bankAccountNo ? `****${decrypted.bankAccountNo.slice(-4)}` : null
      decrypted.sssNo = decrypted.sssNo ? `***-***-${decrypted.sssNo.slice(-1)}` : null
      decrypted.philhealthNo = decrypted.philhealthNo ? `****-****-${decrypted.philhealthNo.slice(-2)}` : null
      decrypted.hdmfNo = decrypted.hdmfNo ? `****-****-${decrypted.hdmfNo.slice(-2)}` : null
      decrypted.tin = decrypted.tin ? `***-***-${decrypted.tin.slice(-3)}` : null
    }

    return decrypted
  })

  // POST /api/employees — Create a new employee (Superadmin only)
  fastify.post('/', { preHandler: [fastify.requireAuth, fastify.requireRole('SUPERADMIN')] }, async (req, reply) => {
    const encryptedBody = encryptEmployee(req.body)
    const { employeeId, firstName, lastName, position, department, dateHired, basicSalary } = encryptedBody

    if (!employeeId || !firstName || !lastName || !position || !department || !dateHired || !basicSalary) {
      return reply.code(400).send({ error: 'Missing required employee fields' })
    }

    const existing = await prisma.employee.findUnique({ where: { employeeId } })
    if (existing) {
      return reply.code(409).send({ error: 'Employee ID already exists' })
    }

    const newEmp = await prisma.employee.create({
      data: {
        ...encryptedBody,
        dateHired: new Date(dateHired),
        basicSalary: parseFloat(basicSalary),
        allowance: parseFloat(req.body.allowance || 0)
      }
    })

    // Log the creation
    await prisma.auditLog.create({
      data: {
        entityType: 'EMPLOYEE',
        entityId: newEmp.id,
        action: 'CREATE',
        changedData: req.body,
        changedById: req.user.id
      }
    })

    return newEmp
  })

  // PATCH /api/employees/:id — Update employee info (Gated with approvals)
  fastify.patch('/:id', { preHandler: [fastify.requireAuth] }, async (req, reply) => {
    // Intercept with the withApproval middleware for gated fields
    const gated = await withApproval(fastify, {
      entityType: 'EMPLOYEE',
      gatedFields: ['bankAccountNo', 'bankAccountName', 'bankName', 'basicSalary', 'allowance']
    })(req, reply)

    if (gated) return // Returns early if request was queued/intercepted

    // If we reach here: superadmin/delegate bypass, or edits were purely ungated (e.g. positions/status/IDs)
    const encryptedData = encryptEmployee(req.body)
    
    // Parse numeric/date values if provided in PATCH body
    if (encryptedData.basicSalary !== undefined) encryptedData.basicSalary = parseFloat(encryptedData.basicSalary)
    if (encryptedData.allowance !== undefined) encryptedData.allowance = parseFloat(encryptedData.allowance)
    if (encryptedData.dateHired !== undefined) encryptedData.dateHired = new Date(encryptedData.dateHired)
    if (encryptedData.dateSeparated !== undefined) encryptedData.dateSeparated = encryptedData.dateSeparated ? new Date(encryptedData.dateSeparated) : null

    const updated = await prisma.employee.update({
      where: { id: req.params.id },
      data: encryptedData
    })

    // Log to AuditLog
    await prisma.auditLog.create({
      data: {
        entityType: 'EMPLOYEE',
        entityId: req.params.id,
        action: 'UPDATE',
        changedData: req.body,
        changedById: req.user.id
      }
    })

    try {
      await sendViberAlert(
        `✍️ Employee Update: ${req.user.name} updated employee ${updated.employeeId}. Fields updated: ${Object.keys(req.body).join(', ')}`
      )
    } catch (err) {
      fastify.log.error('Failed to dispatch Viber notification on employee update:', err.message)
    }

    return updated
  })

  // POST /api/employees/:id/documents — Document Upload / 201 File
  fastify.post('/:id/documents', { preHandler: [fastify.requireAuth] }, async (req, reply) => {
    const data = await req.file()
    if (!data) {
      return reply.code(400).send({ error: 'No document file uploaded' })
    }

    const uploadDir = path.resolve('uploads')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const filename = `${Date.now()}-${data.filename}`
    const filePath = path.join(uploadDir, filename)
    
    // Stream save file to storage
    await pipeline(data.file, fs.createWriteStream(filePath))
    const fileUrl = `/uploads/${filename}`

    // Extract docType from fields
    const docType = data.fields?.docType?.value || 'OTHER'

    const doc = await prisma.employeeDocument.create({
      data: {
        employeeId: req.params.id,
        docType,
        fileUrl
      }
    })

    return doc
  })
}
