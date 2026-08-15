// ═══════════════════════════════════════════════════════════════
// payroll.js — Payroll Calculations and Payslip Generation
// ═══════════════════════════════════════════════════════════════
import puppeteer from 'puppeteer'
import { computeSSS, computePhilHealth, computeHDMF, computeWithholdingTax, round2 } from '../lib/contributions.js'
import { renderPayslipHTML } from '../lib/payslipTemplate.js'

export default async function payrollRoutes(fastify, options) {
  const prisma = fastify.prisma

  // Helper middleware to ensure caller is Superadmin
  const requireSuperadmin = async (req, reply) => {
    const role = req.user.role
    if (!['SUPERADMIN', 'SUPERADMIN_DELEGATE'].includes(role)) {
      return reply.code(403).send({ error: 'Forbidden: Superadmin access required' })
    }
  }

  // GET /api/payroll — List payroll runs
  fastify.get('/', { preHandler: [fastify.requireAuth] }, async (req, reply) => {
    const user = req.user
    const isSuperadmin = ['SUPERADMIN', 'SUPERADMIN_DELEGATE'].includes(user.role)

    // Regular users can only see their own payslips
    const where = isSuperadmin ? {} : { employee: { employeeId: user.employeeId } }

    const runs = await prisma.payrollRun.findMany({
      where,
      include: {
        employee: {
          select: { id: true, employeeId: true, firstName: true, lastName: true, position: true }
        }
      },
      orderBy: { periodEnd: 'desc' }
    })
    return runs
  })

  // POST /api/payroll/generate — Generate single payroll run
  fastify.post('/generate', { preHandler: [fastify.requireAuth, requireSuperadmin] }, async (req, reply) => {
    const { employeeId, periodStart, periodEnd, lateUndertimeMins = 0, lateUndertimeAmt = 0, absenceDays = 0, absenceAmt = 0, deMinimis = 0 } = req.body

    if (!employeeId || !periodStart || !periodEnd) {
      return reply.code(400).send({ error: 'Missing required inputs: employeeId, periodStart, periodEnd' })
    }

    const emp = await prisma.employee.findUnique({ where: { id: employeeId } })
    if (!emp) {
      return reply.code(404).send({ error: 'Employee profile not found' })
    }

    // Check if payroll run already exists for this employee and period
    const start = new Date(periodStart)
    const end = new Date(periodEnd)
    const existing = await prisma.payrollRun.findUnique({
      where: {
        employeeId_periodStart_periodEnd: {
          employeeId,
          periodStart: start,
          periodEnd: end
        }
      }
    })

    if (existing) {
      return reply.code(409).send({ error: 'Payroll run already exists for this employee in this period' })
    }

    const basicSalary = parseFloat(emp.basicSalary)
    const allowance = parseFloat(emp.allowance)

    // Compute contributions based on monthly basic
    const { sssEe, sssMpf } = computeSSS(basicSalary)
    const philhealthEe = computePhilHealth(basicSalary)
    const hdmfEe = computeHDMF(basicSalary)

    // Deduct late, absence and contributions from basic salary to get taxable income
    const taxableIncome = basicSalary - sssEe - sssMpf - philhealthEe - hdmfEe - parseFloat(lateUndertimeAmt) - parseFloat(absenceAmt)
    const withholdingTax = computeWithholdingTax(taxableIncome)

    const totalComp = basicSalary + allowance + parseFloat(deMinimis)
    const totalDeductions = sssEe + sssMpf + philhealthEe + hdmfEe + withholdingTax + parseFloat(lateUndertimeAmt) + parseFloat(absenceAmt)
    const netPay = totalComp - totalDeductions

    const run = await prisma.payrollRun.create({
      data: {
        employeeId,
        payrollDate: new Date(),
        periodStart: start,
        periodEnd: end,
        basic: basicSalary,
        deMinimis: parseFloat(deMinimis),
        lateUndertimeMins: parseInt(lateUndertimeMins),
        lateUndertimeAmt: parseFloat(lateUndertimeAmt),
        absenceDays: parseFloat(absenceDays),
        absenceAmt: parseFloat(absenceAmt),
        allowance,
        sssEe,
        sssMpf,
        philhealthEe,
        hdmfEe,
        withholdingTax,
        totalComp: round2(totalComp),
        totalDeductions: round2(totalDeductions),
        netPay: round2(netPay)
      },
      include: { employee: true }
    })

    return run
  })

  // POST /api/payroll/generate-batch — Generate batch payroll runs
  fastify.post('/generate-batch', { preHandler: [fastify.requireAuth, requireSuperadmin] }, async (req, reply) => {
    const { periodStart, periodEnd } = req.body

    if (!periodStart || !periodEnd) {
      return reply.code(400).send({ error: 'Missing periodStart and periodEnd' })
    }

    const start = new Date(periodStart)
    const end = new Date(periodEnd)

    // Fetch all active employees
    const employees = await prisma.employee.findMany({
      where: { employmentStatus: { in: ['REGULAR', 'PROBATIONARY'] } }
    })

    const runs = []
    const skipped = []

    for (const emp of employees) {
      // Check if run already exists
      const existing = await prisma.payrollRun.findUnique({
        where: {
          employeeId_periodStart_periodEnd: {
            employeeId: emp.id,
            periodStart: start,
            periodEnd: end
          }
        }
      })

      if (existing) {
        skipped.push({ employeeId: emp.employeeId, reason: 'Already exists' })
        continue
      }

      const basicSalary = parseFloat(emp.basicSalary)
      const allowance = parseFloat(emp.allowance)

      const { sssEe, sssMpf } = computeSSS(basicSalary)
      const philhealthEe = computePhilHealth(basicSalary)
      const hdmfEe = computeHDMF(basicSalary)

      const taxableIncome = basicSalary - sssEe - sssMpf - philhealthEe - hdmfEe
      const withholdingTax = computeWithholdingTax(taxableIncome)

      const totalComp = basicSalary + allowance
      const totalDeductions = sssEe + sssMpf + philhealthEe + hdmfEe + withholdingTax
      const netPay = totalComp - totalDeductions

      const run = await prisma.payrollRun.create({
        data: {
          employeeId: emp.id,
          payrollDate: new Date(),
          periodStart: start,
          periodEnd: end,
          basic: basicSalary,
          allowance,
          sssEe,
          sssMpf,
          philhealthEe,
          hdmfEe,
          withholdingTax,
          totalComp: round2(totalComp),
          totalDeductions: round2(totalDeductions),
          netPay: round2(netPay)
        }
      })
      runs.push(run)
    }

    return { generatedCount: runs.length, skipped }
  })

  // GET /api/payroll/:id/payslip.pdf — Generate PDF payslip (Puppeteer)
  fastify.get('/:id/payslip.pdf', { preHandler: [fastify.requireAuth] }, async (req, reply) => {
    const user = req.user
    const isSuperadmin = ['SUPERADMIN', 'SUPERADMIN_DELEGATE'].includes(user.role)

    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.id },
      include: { employee: true }
    })

    if (!run) {
      return reply.code(404).send({ error: 'Payroll run not found' })
    }

    // Role safety check: employees can only view their own payslip
    if (!isSuperadmin && run.employee.employeeId !== user.employeeId) {
      return reply.code(403).send({ error: 'Forbidden: You can only view your own payslips' })
    }

    // Compute YTD Aggregates
    const currentYear = new Date(run.payrollDate).getFullYear()
    const startOfYear = new Date(`${currentYear}-01-01T00:00:00.000Z`)

    const ytd = await prisma.payrollRun.aggregate({
      where: {
        employeeId: run.employeeId,
        payrollDate: { gte: startOfYear }
      },
      _sum: {
        totalComp: true,
        withholdingTax: true,
        sssEe: true,
        sssMpf: true,
        philhealthEe: true,
        hdmfEe: true
      }
    })

    const html = renderPayslipHTML(run, ytd)

    // Render using Puppeteer
    let browser
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      })
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle0' })
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true
      })
      
      await browser.close()
      
      reply.type('application/pdf').send(pdf)
    } catch (err) {
      if (browser) await browser.close()
      fastify.log.error('Puppeteer rendering error:', err.message)
      return reply.code(500).send({ error: 'Failed to generate PDF payslip', details: err.message })
    }
  })
}
