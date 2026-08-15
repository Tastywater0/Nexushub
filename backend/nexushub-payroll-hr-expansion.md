# NexusHub — Audit, Employee 201 File, and Payslip Automation

## Executive Summary
Three additions to the existing Fastify + Prisma + React stack:
1. **Audit module** → make checklist items configurable per audit type instead of hardcoded, plus new audit categories you're likely missing.
2. **Employee Management** → click-through drawer with Gov't IDs, Bank Details, Employment, and 201 file (documents) tabs.
3. **Payslip automation** → a `payroll_runs` table + auto-computed SSS/PhilHealth/HDMF/tax + a Puppeteer-rendered PDF matching your current Ybalai payslip layout exactly (logo, YTD columns, legend).

All three ride on your existing Prisma schema — additive, no breaking migrations.

---

## Recommendation
Build in this order (each is independently shippable):
| Priority | Module | Why first |
|---|---|---|
| 1 | Employee 201 expansion | Unlocks payroll automation (needs SSS/bank fields to exist) |
| 2 | Payslip automation | Highest ROI — kills manual Excel payslip work every cutoff |
| 3 | Audit line-item config | Lower urgency, mostly UX/config work |

---

## 1. Prisma Schema Additions

```prisma
model Employee {
  id              String   @id @default(cuid())
  employeeId      String   @unique   // ADMIN001 style
  firstName       String
  lastName        String
  branchId        String?
  branch          Branch?  @relation(fields: [branchId], references: [id])
  position        String
  department      String
  dateHired       DateTime
  employmentStatus String  @default("REGULAR") // PROBATIONARY | REGULAR | RESIGNED | TERMINATED
  dateSeparated   DateTime?

  // Gov't IDs — encrypt at column level (see Risks)
  tin             String?
  sssNo           String?
  philhealthNo    String?
  hdmfNo          String?

  // Bank details
  bankName        String?
  bankAccountName String?
  bankAccountNo   String?

  basicSalary     Decimal  @db.Decimal(10,2)
  allowance       Decimal  @default(0) @db.Decimal(10,2)

  documents       EmployeeDocument[]
  payrollRuns     PayrollRun[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model EmployeeDocument {
  id          String   @id @default(cuid())
  employeeId  String
  employee    Employee @relation(fields: [employeeId], references: [id])
  docType     String   // CONTRACT | RESUME | VALID_ID | NBI_CLEARANCE | MEDICAL | OTHER
  fileUrl     String   // S3/local storage path
  uploadedAt  DateTime @default(now())
}

model PayrollRun {
  id                String   @id @default(cuid())
  employeeId        String
  employee          Employee @relation(fields: [employeeId], references: [id])
  payrollDate       DateTime
  periodStart       DateTime
  periodEnd         DateTime

  basic             Decimal @db.Decimal(10,2)
  deMinimis         Decimal @default(0) @db.Decimal(10,2)
  lateUndertimeMins Int     @default(0)
  lateUndertimeAmt  Decimal @default(0) @db.Decimal(10,2)
  absenceDays       Decimal @default(0) @db.Decimal(4,2)
  absenceAmt        Decimal @default(0) @db.Decimal(10,2)
  allowance         Decimal @default(0) @db.Decimal(10,2)

  sssEe             Decimal @default(0) @db.Decimal(10,2)
  sssMpf            Decimal @default(0) @db.Decimal(10,2)
  philhealthEe      Decimal @default(0) @db.Decimal(10,2)
  hdmfEe            Decimal @default(0) @db.Decimal(10,2)
  withholdingTax    Decimal @default(0) @db.Decimal(10,2)

  totalComp         Decimal @db.Decimal(10,2)
  totalDeductions   Decimal @db.Decimal(10,2)
  netPay            Decimal @db.Decimal(10,2)

  createdAt         DateTime @default(now())
  @@unique([employeeId, periodStart, periodEnd])
}

model AuditChecklistTemplate {
  id          String   @id @default(cuid())
  auditType   String   // ROUTINE | EVENT_PROMO | COMPLIANCE | CASH_COUNT | SAFETY | MERCHANDISING
  itemLabel   String
  sortOrder   Int      @default(0)
  active      Boolean  @default(true)
}
```

**Audit categories you're likely missing** (add as `AuditChecklistTemplate` rows, not new tables):
- Petty cash / cash count reconciliation
- Price tag / SRP compliance
- Fire extinguisher + safety signage check
- Expired / damaged stock pull
- Planogram / merchandising compliance
- CCTV functional check per branch
- Delivery receiving spot-check (PO vs actual)

---

## 2. Employee Drawer — Route Additions (`routes/employees.js`)

```javascript
// GET /employees/:id  — full detail for drawer
fastify.get('/employees/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
  const emp = await prisma.employee.findUnique({
    where: { id: req.params.id },
    include: { branch: true, documents: true }
  });
  if (!emp) return reply.code(404).send({ error: 'Not found' });

  // Mask bank/SSS for non-superadmin roles
  if (req.user.role !== 'SUPERADMIN') {
    emp.bankAccountNo = emp.bankAccountNo ? `****${emp.bankAccountNo.slice(-4)}` : null;
  }
  return emp;
});

// PATCH /employees/:id — update gov't IDs / bank details / employment info
fastify.patch('/employees/:id', { preHandler: [fastify.authenticate, fastify.requireRole('SUPERADMIN')] },
  async (req, reply) => {
    const updated = await prisma.employee.update({
      where: { id: req.params.id },
      data: req.body // { tin, sssNo, philhealthNo, hdmfNo, bankName, bankAccountName, bankAccountNo, position, employmentStatus }
    });
    return updated;
});

// POST /employees/:id/documents — 201 file upload
fastify.post('/employees/:id/documents', { preHandler: [fastify.authenticate] }, async (req, reply) => {
  const data = await req.file(); // multipart
  const fileUrl = await saveToStorage(data); // local disk or S3
  const doc = await prisma.employeeDocument.create({
    data: { employeeId: req.params.id, docType: req.body.docType, fileUrl }
  });
  return doc;
});
```

**Frontend**: clicking a row opens a drawer with tabs — `Personal | Gov't IDs | Bank Details | Employment | 201 File`. Gate the Bank Details tab render behind `role === 'SUPERADMIN'`.

---

## 3. Payslip Automation (`lib/payroll.js` + `routes/payroll.js`)

### 3a. 2026 contribution tables (hardcode, update yearly)
```javascript
// lib/contributions.js
function computeSSS(basic) {
  // Bracket lookup — replace with full 2026 SSS table
  const eeShare = Math.min(basic, 30000) * 0.045; // employee share ~4.5%
  const mpf = basic > 20000 ? Math.min((basic - 20000) * 0.025, 500) : 0;
  return { sssEe: round2(eeShare), sssMpf: round2(mpf) };
}
function computePhilHealth(basic) {
  const premium = basic * 0.05; // 5% total, split 50/50
  return round2(premium / 2);
}
function computeHDMF(basic) {
  return round2(Math.min(basic, 10000) * 0.02); // capped at 200
}
function computeWithholdingTax(taxableIncome) {
  // Plug BIR 2026 semi-monthly table here
}
module.exports = { computeSSS, computePhilHealth, computeHDMF, computeWithholdingTax };
```

### 3b. Generate + PDF render (Puppeteer, matches your current layout 1:1)
```javascript
// routes/payroll.js
fastify.post('/payroll/generate', { preHandler: [fastify.authenticate, fastify.requireRole('SUPERADMIN')] },
  async (req, reply) => {
    const { employeeId, periodStart, periodEnd } = req.body;
    const emp = await prisma.employee.findUnique({ where: { id: employeeId } });

    const { sssEe, sssMpf } = computeSSS(emp.basicSalary);
    const philhealthEe = computePhilHealth(emp.basicSalary);
    const hdmfEe = computeHDMF(emp.basicSalary);
    const tax = computeWithholdingTax(emp.basicSalary - sssEe - philhealthEe - hdmfEe);

    const totalDeductions = sssEe + sssMpf + philhealthEe + hdmfEe + tax;
    const netPay = emp.basicSalary + emp.allowance - totalDeductions;

    const run = await prisma.payrollRun.create({
      data: { employeeId, periodStart, periodEnd, payrollDate: new Date(),
        basic: emp.basicSalary, allowance: emp.allowance,
        sssEe, sssMpf, philhealthEe, hdmfEe, withholdingTax: tax,
        totalComp: emp.basicSalary + emp.allowance,
        totalDeductions, netPay }
    });
    return run;
});

fastify.get('/payroll/:id/payslip.pdf', { preHandler: [fastify.authenticate] }, async (req, reply) => {
  const run = await prisma.payrollRun.findUnique({
    where: { id: req.params.id }, include: { employee: true }
  });
  const ytd = await prisma.payrollRun.aggregate({
    where: { employeeId: run.employeeId, payrollDate: { gte: startOfYear(run.payrollDate) } },
    _sum: { totalComp: true, withholdingTax: true, sssEe: true, philhealthEe: true, hdmfEe: true }
  });

  const html = renderPayslipHTML(run, ytd); // Handlebars template matching your Ybalai layout
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html);
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();

  reply.type('application/pdf').send(pdf);
});
```

### 3c. Template
Build `templates/payslip.hbs` as a static HTML/CSS clone of your current payslip (logo top-left, 3-column COMPENSATION / DEDUCTIONS / YEAR-TO-DATE grid, legend footer). Reuse the exact table structure — Puppeteer will rasterize it pixel-for-pixel same as your current phone-screenshot version, but now auto-populated instead of manually typed.

Batch mode: `POST /payroll/generate-batch` loops all active employees for a `periodStart/periodEnd`, then a background job (n8n, since you already run it) zips the PDFs and pushes to Viber/email per branch manager — this is your "Sprout copy" running fully unattended every cutoff.

---

## 4. Approval Workflow — Everything Editable, Nothing Applied Without Your Sign-Off

One generic layer, reused across Employee, Payroll, Audit Templates, and any future module — not a separate system per module.

### 4a. Role Matrix

| Role | Can propose edits | Auto-applies (no approval) | Typical scope |
|---|---|---|---|
| **SUPERADMIN (you)** | Yes | **Yes — bypasses queue entirely** | Everything |
| **SUPERADMIN_DELEGATE** (e.g. brother, trusted #2) | Yes | **Yes — bypasses queue** | Same as SUPERADMIN, minus ability to add/remove other delegates |
| Overall Manager | Yes | No | Employee ops fields, transfers |
| HR Admin | Yes | No | Employee 201, gov't IDs, bank details |
| Auditor | Yes | No | Audit templates, findings |
| Finance Tracker | Yes | No | Payroll run inputs |
| Branch Supervisor | Yes (self-scoped) | No | Own branch inventory/EOD only |

Only SUPERADMIN and SUPERADMIN_DELEGATE write directly. Every other role's PATCH/POST becomes a **pending proposal** until one of you approves it. Delegates see the same approval queue and can approve each other's proposals — but a delegate can't promote themselves or add new delegates (that stays SUPERADMIN-only, one field: `canManageDelegates`).

### 4b. Hybrid scope — you chose gate-only-bank/salary, log everything else
At 3-5 users you don't need a hard stop on most edits — you'd see it anyway. Only money/bank fields block; everything else applies immediately but writes an audit log entry + Viber ping so you still have full visibility without becoming the bottleneck.

| Gated (blocks until you/delegate approve) | Logged only (applies instantly, you're notified) |
|---|---|
| `basicSalary`, `allowance` | Employment status changes |
| `bankName`, `bankAccountName`, `bankAccountNo` | SSS/PhilHealth/HDMF/TIN number edits |
| | Audit checklist template changes |
| | New employee creation |
| | Employee termination |

This means `gatedFields` in the middleware below is intentionally short — just the 5 money/bank fields. Everything else writes directly to `AuditLog` (new lightweight table, not `ChangeRequest`) and fires the same Viber alert, no blocking.

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  entityType  String
  entityId    String
  action      String   // CREATE | UPDATE | DELETE
  changedData Json
  changedById String
  changedBy   User     @relation(fields: [changedById], references: [id])
  createdAt   DateTime @default(now())
}
```

### 4c. Schema — one table covers every module
```prisma
model ChangeRequest {
  id            String   @id @default(cuid())
  entityType    String   // EMPLOYEE | PAYROLL_RUN | AUDIT_TEMPLATE | INVENTORY_ADJUSTMENT
  entityId      String?  // null if this is a CREATE
  action        String   // CREATE | UPDATE | DELETE
  proposedData  Json     // the diff/patch being requested
  previousData  Json?    // snapshot of current state, for diff display
  proposedById  String
  proposedBy    User     @relation("proposer", fields: [proposedById], references: [id])
  status        String   @default("PENDING") // PENDING | APPROVED | REJECTED
  reviewedById  String?
  reviewedBy    User?    @relation("reviewer", fields: [reviewedById], references: [id])
  reviewNote    String?
  createdAt     DateTime @default(now())
  reviewedAt    DateTime?
}
```

### 4d. Middleware — wrap gated endpoints, don't duplicate logic per module
```javascript
// lib/approvalGate.js
async function withApproval(fastify, { entityType, gatedFields = [] }) {
  return async function handler(req, reply) {
    const isSuperadmin = ['SUPERADMIN', 'SUPERADMIN_DELEGATE'].includes(req.user.role);
    const touchesGatedField = gatedFields.some(f => f in req.body);

    if (isSuperadmin || !touchesGatedField) {
      return null; // caller proceeds with direct write
    }

    const existing = entityType === 'EMPLOYEE'
      ? await prisma.employee.findUnique({ where: { id: req.params.id } })
      : null;

    const cr = await prisma.changeRequest.create({
      data: {
        entityType,
        entityId: req.params.id ?? null,
        action: req.params.id ? 'UPDATE' : 'CREATE',
        proposedData: req.body,
        previousData: existing ?? null,
        proposedById: req.user.id,
      }
    });

    await sendViberAlert(YOUR_VIBER_ID, `New ${entityType} change request from ${req.user.name} — pending your approval.`);
    reply.code(202).send({ status: 'PENDING_APPROVAL', changeRequestId: cr.id });
    return cr; // caller returns early, does not apply write
  };
}
module.exports = { withApproval };
```

Usage inside an existing route — one extra line, no restructuring:
```javascript
// routes/employees.js
fastify.patch('/employees/:id', { preHandler: [fastify.authenticate] }, async (req, reply) => {
  const gated = await withApproval(fastify, {
    entityType: 'EMPLOYEE',
    gatedFields: ['bankAccountNo', 'bankAccountName', 'bankName', 'basicSalary', 'allowance']
  })(req, reply);
  if (gated) return; // reply already sent as 202 PENDING

  // Superadmin, delegate, or ungated field — apply directly, then log
  const updated = await prisma.employee.update({ where: { id: req.params.id }, data: req.body });
  await prisma.auditLog.create({
    data: { entityType: 'EMPLOYEE', entityId: req.params.id, action: 'UPDATE', changedData: req.body, changedById: req.user.id }
  });
  await sendViberAlert(YOUR_VIBER_ID, `${req.user.name} updated employee ${updated.employeeId} — ${Object.keys(req.body).join(', ')}`);
  return updated;
});
```

### 4e. Approval queue routes
```javascript
// routes/approvals.js
fastify.get('/approvals', { preHandler: [fastify.authenticate, fastify.requireRole('SUPERADMIN')] },
  async (req) => prisma.changeRequest.findMany({
    where: { status: 'PENDING', entityType: req.query.entityType || undefined },
    include: { proposedBy: true },
    orderBy: { createdAt: 'asc' }
  })
);

fastify.post('/approvals/:id/approve', { preHandler: [fastify.authenticate, fastify.requireRole('SUPERADMIN')] },
  async (req, reply) => {
    const cr = await prisma.changeRequest.findUnique({ where: { id: req.params.id } });
    if (!cr || cr.status !== 'PENDING') return reply.code(404).send({ error: 'Not found or already reviewed' });

    // Apply the proposed change to the real entity
    if (cr.entityType === 'EMPLOYEE') {
      await prisma.employee.update({ where: { id: cr.entityId }, data: cr.proposedData });
    }
    // add branches per entityType as you gate more modules

    await prisma.changeRequest.update({
      where: { id: cr.id },
      data: { status: 'APPROVED', reviewedById: req.user.id, reviewedAt: new Date() }
    });
    return { status: 'APPROVED' };
});

fastify.post('/approvals/:id/reject', { preHandler: [fastify.authenticate, fastify.requireRole('SUPERADMIN')] },
  async (req, reply) => {
    await prisma.changeRequest.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', reviewedById: req.user.id, reviewedAt: new Date(), reviewNote: req.body.note }
    });
    return { status: 'REJECTED' };
});
```

### 4f. Frontend
- Add a **"Pending Approvals"** badge/counter on your dashboard header (SUPERADMIN view only) — pulls `GET /approvals`.
- Approval card shows a before/after diff (use `previousData` vs `proposedData`) so you approve on sight, not by re-checking the whole record.
- One-tap Approve/Reject buttons; reject requires a short note (goes back to proposer via Viber).

---

## 5. Hosting — Staying Free For Now
Your instinct is right at this scale: don't pay for infra until this proves itself day-to-day.

| Layer | Free option | Catch |
|---|---|---|
| Postgres | Keep local Docker | Zero cost, but only as durable as your laptop — hence backup section below is non-negotiable |
| App hosting (when you outgrow local) | Railway free tier (you already have `railway.toml`) | Sleeps after inactivity on free tier, ~$5/mo minimum once you need it always-on |
| Alt DB (if you want cloud DB now, still free) | Supabase or Neon free tier Postgres | 500MB-1GB free, plenty for 3-5 users' worth of data |
| File storage (payslip PDFs, 201 docs) | Google Drive (you're already connected) via n8n's Drive node | Manual folder org, but zero setup cost |

**Recommendation:** stay local for the app + DB, but don't stay local for backups (see below) — that's the one place "free and local" becomes a real liability.

## 6. Backup & Disaster Recovery — Priority Fix (your #1 pick)
You have zero recovery path today. At your data volume (3-5 users, a few hundred records) this is cheap and fast to close — no excuse to leave it open.

**Use n8n, since it's already running, to automate this — no new tool needed:**

```
[Cron: daily 11PM] → [Execute Command: pg_dump] → [Google Drive: Upload] → [Execute Command: prune >30 days]
```

- **Execute Command node**: `docker exec nexushub-db pg_dump -U postgres -Fc nexushub > /backups/nexushub_$(date +\%F).dump`
- **Google Drive node**: upload the dump file to a dedicated "NexusHub Backups" folder (you're already connected to Drive)
- **Prune step**: delete local dump files older than 30 days so disk doesn't fill up; Drive keeps the long-term copies
- Add a second n8n workflow: **alert (Viber) if the backup step fails** — a silent broken backup is worse than no backup, because you think you're covered when you're not

**Belt-and-suspenders, 5 minutes a week:** once a month, manually download the latest Drive backup to a USB stick. Costs nothing, means a Google account issue doesn't kill your only copy either.

This closes the DR gap without any paid service or new infrastructure. Do this before building anything else in this doc — employee 201, payroll, and approval data all become things you can't currently afford to lose.

---

## Implementation Steps
1. **n8n backup workflow first** — pg_dump → Google Drive → prune, with failure alert. Do this today, before anything else, since it protects everything you build after.
2. `npx prisma migrate dev --name employee_201_payroll_audit_approvals` with schema above (incl. `ChangeRequest`, `AuditLog`)
3. Build `lib/approvalGate.js` + `routes/approvals.js` — gated fields limited to bank/salary per your call
4. Seed `AuditChecklistTemplate` with your existing + new categories
5. Build employee drawer UI (4 tabs) + wire PATCH endpoint through `withApproval`
6. Build `lib/contributions.js` — verify against actual 2026 SSS/PhilHealth/HDMF brackets before trusting output
7. Build `templates/payslip.hbs` + Puppeteer render route
8. Add "Pending Approvals" + "Recent Activity" dashboard widgets
9. Force-reset the default superadmin password (`ADMIN001`) — don't ship with it live
10. Wire n8n workflow: cron on 5th/20th → call `/payroll/generate-batch` → Viber push per branch

## Risks
- **PII exposure**: SSS/TIN/bank fields are sensitive — encrypt at rest (Postgres `pgcrypto` or app-level AES) and mask in API responses for non-superadmin roles as shown above.
- **Contribution tables go stale** — SSS/PhilHealth/HDMF brackets and BIR withholding tables change; don't hardcode without a version/effective-date field so old payroll runs stay reproducible.
- **Puppeteer in Docker** — needs `--no-sandbox` + chromium deps in your Dockerfile; test in the same container you deploy to Railway, not just locally.

## Pro Tips
- Add an `effectiveDate` to a separate `ContributionTable` model instead of hardcoding — lets you re-run historical payslips correctly when brackets change.
- Store PDFs in object storage (Railway volume or S3) with the `PayrollRun.id` as key — don't regenerate on every view, generate once and cache.
- Give the Auditor/Finance Tracker roles read-only access to `PayrollRun` but not `Employee` bank fields — separation of duties.
- Don't gate everything — over-gating trains people to route around it (verbal approvals, screenshots). Gate money/identity fields only; keep operational logging (audit checks, EOD counts) fast and ungated.
- Add a `SUPERADMIN_DELEGATE` role later for a trusted #2 (e.g. your brother, per the Finance Tracker approval chain) so approvals don't bottleneck on you alone when traveling.
