// npx prisma db seed
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding NexusHub database...')

  // ── BRANCHES ──────────────────────────────────────────────
  const branches = await Promise.all([
    prisma.branch.upsert({ where: { code: 'DG' }, update: {}, create: { code:'DG', name:'Dagupan',    address:'Dagupan City, Pangasinan',    region:'Region I - Ilocos' }}),
    prisma.branch.upsert({ where: { code: 'SC' }, update: {}, create: { code:'SC', name:'San Carlos', address:'San Carlos City, Pangasinan',  region:'Region I - Ilocos' }}),
    prisma.branch.upsert({ where: { code: 'LG' }, update: {}, create: { code:'LG', name:'Lingayen',   address:'Lingayen, Pangasinan',         region:'Region I - Ilocos' }}),
    prisma.branch.upsert({ where: { code: 'AL' }, update: {}, create: { code:'AL', name:'Alaminos',   address:'Alaminos City, Pangasinan',    region:'Region I - Ilocos' }}),
    prisma.branch.upsert({ where: { code: 'ML' }, update: {}, create: { code:'ML', name:'Malasiqui',  address:'Malasiqui, Pangasinan',        region:'Region I - Ilocos' }}),
  ])
  const [DG, SC, LG, AL, ML] = branches
  console.log('✓ Branches seeded')

  // ── PRODUCTS ──────────────────────────────────────────────
  const productData = [
    { sku:'INGCO-AG800-2',  name:'INGCO AG800 Angle Grinder 800W',     brand:'INGCO',  category:'Power Tools',   srp:2850,  reorderPoint:5,  isHighValue:true  },
    { sku:'INGCO-TD1058',   name:'INGCO TD1058 Cordless Drill 10.8V',  brand:'INGCO',  category:'Power Tools',   srp:3200,  reorderPoint:5,  isHighValue:true  },
    { sku:'INGCO-CS1235',   name:'INGCO CS1235 Circular Saw 1200W',    brand:'INGCO',  category:'Power Tools',   srp:4500,  reorderPoint:4,  isHighValue:true  },
    { sku:'INGCO-JIG4501',  name:'INGCO JS4501 Jigsaw 450W',           brand:'INGCO',  category:'Power Tools',   srp:2400,  reorderPoint:4,  isHighValue:true  },
    { sku:'INGCO-RT8501',   name:'INGCO RT8501 Router 850W',           brand:'INGCO',  category:'Power Tools',   srp:5200,  reorderPoint:3,  isHighValue:true  },
    { sku:'INGCO-SDS0502',  name:'INGCO SDS0502 Rotary Hammer 500W',   brand:'INGCO',  category:'Power Tools',   srp:6800,  reorderPoint:3,  isHighValue:true  },
    { sku:'INGCO-WLD200',   name:'INGCO WLD200 Inverter Welder 200A',  brand:'INGCO',  category:'Welding',       srp:7500,  reorderPoint:3,  isHighValue:true  },
    { sku:'INGCO-BS1002',   name:'INGCO BS1002 Band Saw 350W',         brand:'INGCO',  category:'Power Tools',   srp:8900,  reorderPoint:2,  isHighValue:true  },
    { sku:'WADFOW-WCA1128', name:'WADFOW WCA1128 Claw Hammer 28oz',    brand:'WADFOW', category:'Hand Tools',    srp:480,   reorderPoint:10, isHighValue:false },
    { sku:'WADFOW-WSP0102', name:'WADFOW WSP0102 Spray Painter 650W',  brand:'WADFOW', category:'Finishing',     srp:1850,  reorderPoint:4,  isHighValue:true  },
    { sku:'WADFOW-WML0601', name:'WADFOW WML0601 Multi-Level Laser',   brand:'WADFOW', category:'Measuring',     srp:3400,  reorderPoint:4,  isHighValue:false },
    { sku:'WADFOW-WHS1103', name:'WADFOW WHS1103 Heat Shrink Gun',     brand:'WADFOW', category:'Electrical',    srp:920,   reorderPoint:6,  isHighValue:false },
    { sku:'WADFOW-WTB0810', name:'WADFOW WTB0810 Tile Breaker 750W',   brand:'WADFOW', category:'Construction',  srp:1200,  reorderPoint:5,  isHighValue:false },
    { sku:'WADFOW-WDS1001', name:'WADFOW WDS1001 Disc Sander 250W',    brand:'WADFOW', category:'Finishing',     srp:1650,  reorderPoint:4,  isHighValue:false },
    { sku:'INGCO-VCS1003',  name:'INGCO VCS1003 Vacuum Cleaner 1000W', brand:'INGCO',  category:'Cleaning',      srp:2200,  reorderPoint:4,  isHighValue:false },
  ]

  const products = []
  for (const p of productData) {
    const prod = await prisma.product.upsert({
      where: { sku: p.sku }, update: {}, create: { ...p, srp: p.srp }
    })
    products.push(prod)
  }
  console.log('✓ Products seeded')

  // ── INVENTORY (initial quantities) ────────────────────────
  const inventoryMatrix = {
    'INGCO-AG800-2':  { DG:0,  SC:14, LG:5,  AL:3,  ML:8  },
    'INGCO-TD1058':   { DG:3,  SC:8,  LG:18, AL:2,  ML:6  },
    'INGCO-CS1235':   { DG:7,  SC:5,  LG:3,  AL:4,  ML:2  },
    'INGCO-JIG4501':  { DG:4,  SC:1,  LG:6,  AL:9,  ML:5  },
    'INGCO-RT8501':   { DG:2,  SC:11, LG:8,  AL:5,  ML:7  },
    'INGCO-SDS0502':  { DG:1,  SC:6,  LG:4,  AL:2,  ML:3  },
    'INGCO-WLD200':   { DG:2,  SC:3,  LG:1,  AL:0,  ML:2  },
    'INGCO-BS1002':   { DG:1,  SC:2,  LG:3,  AL:1,  ML:1  },
    'WADFOW-WCA1128': { DG:32, SC:6,  LG:4,  AL:18, ML:22 },
    'WADFOW-WSP0102': { DG:5,  SC:2,  LG:8,  AL:3,  ML:4  },
    'WADFOW-WML0601': { DG:1,  SC:9,  LG:12, AL:6,  ML:8  },
    'WADFOW-WHS1103': { DG:16, SC:13, LG:14, AL:10, ML:9  },
    'WADFOW-WTB0810': { DG:8,  SC:4,  LG:7,  AL:12, ML:6  },
    'WADFOW-WDS1001': { DG:6,  SC:8,  LG:5,  AL:7,  ML:4  },
    'INGCO-VCS1003':  { DG:4,  SC:7,  LG:6,  AL:3,  ML:5  },
  }

  const velocity30dMatrix = {
    'INGCO-AG800-2':  { DG:28, SC:1,  LG:12, AL:8,  ML:14 },
    'INGCO-TD1058':   { DG:31, SC:9,  LG:2,  AL:15, ML:10 },
    'INGCO-CS1235':   { DG:22, SC:18, LG:15, AL:11, ML:18 },
    'INGCO-JIG4501':  { DG:17, SC:17, LG:10, AL:3,  ML:8  },
    'INGCO-RT8501':   { DG:8,  SC:5,  LG:6,  AL:4,  ML:6  },
    'INGCO-SDS0502':  { DG:12, SC:8,  LG:7,  AL:5,  ML:7  },
    'INGCO-WLD200':   { DG:6,  SC:4,  LG:5,  AL:8,  ML:4  },
    'INGCO-BS1002':   { DG:4,  SC:3,  LG:5,  AL:3,  ML:3  },
    'WADFOW-WCA1128': { DG:7,  SC:14, LG:14, AL:9,  ML:11 },
    'WADFOW-WSP0102': { DG:11, SC:11, LG:5,  AL:8,  ML:7  },
    'WADFOW-WML0601': { DG:5,  SC:4,  LG:3,  AL:5,  ML:4  },
    'WADFOW-WHS1103': { DG:3,  SC:4,  LG:4,  AL:3,  ML:3  },
    'WADFOW-WTB0810': { DG:9,  SC:7,  LG:8,  AL:6,  ML:7  },
    'WADFOW-WDS1001': { DG:7,  SC:6,  LG:7,  AL:5,  ML:6  },
    'INGCO-VCS1003':  { DG:10, SC:9,  LG:8,  AL:7,  ML:8  },
  }

  for (const product of products) {
    for (const branch of branches) {
      const qty = inventoryMatrix[product.sku]?.[branch.code] ?? 5
      const vel = velocity30dMatrix[product.sku]?.[branch.code] ?? 5
      await prisma.inventoryItem.upsert({
        where: { productId_branchId: { productId: product.id, branchId: branch.id } },
        update: { quantityOnHand: qty, velocity30d: vel },
        create: {
          productId: product.id,
          branchId:  branch.id,
          quantityOnHand: qty,
          velocity30d: vel,
          lastCountedAt: new Date(),
        },
      })
    }
  }
  console.log('✓ Inventory seeded')

  // ── EMPLOYEES ──────────────────────────────────────────────
  const employeesData = [
    { employeeId:'ADMIN001', firstName: 'Ryanne', lastName: 'Admin', position: 'Super Admin', department: 'Executive', dateHired: new Date('2020-01-01'), basicSalary: 75000, allowance: 5000, branchId: DG.id },
    { employeeId:'E001', firstName: 'Maria', lastName: 'Santos', position: 'Branch Manager', department: 'Operations', dateHired: new Date('2022-03-15'), basicSalary: 28000, allowance: 2000, branchId: DG.id },
    { employeeId:'E002', firstName: 'Juan', lastName: 'dela Cruz', position: 'Shift Supervisor', department: 'Operations', dateHired: new Date('2022-07-01'), basicSalary: 22000, allowance: 1000, branchId: DG.id },
    { employeeId:'E003', firstName: 'Mila', lastName: 'Reyes', position: 'Sales Staff', department: 'Operations', dateHired: new Date('2023-01-10'), basicSalary: 17000, allowance: 500, branchId: DG.id },
    { employeeId:'E004', firstName: 'Ana', lastName: 'Bautista', position: 'Branch Manager', department: 'Operations', dateHired: new Date('2021-06-05'), basicSalary: 28000, allowance: 2000, branchId: SC.id },
    { employeeId:'E005', firstName: 'Ramon', lastName: 'Santiago', position: 'Shift Supervisor', department: 'Operations', dateHired: new Date('2021-11-20'), basicSalary: 22000, allowance: 1000, branchId: SC.id },
    { employeeId:'E006', firstName: 'Liza', lastName: 'Fernandez', position: 'Branch Manager', department: 'Operations', dateHired: new Date('2020-09-12'), basicSalary: 28000, allowance: 2000, branchId: LG.id },
    { employeeId:'E007', firstName: 'Carlo', lastName: 'Mendoza', position: 'Sales Staff', department: 'Operations', dateHired: new Date('2023-05-18'), basicSalary: 17000, allowance: 500, branchId: LG.id },
    { employeeId:'E008', firstName: 'Grace', lastName: 'Tan', position: 'Branch Manager', department: 'Operations', dateHired: new Date('2022-04-22'), basicSalary: 28000, allowance: 2000, branchId: AL.id },
    { employeeId:'E009', firstName: 'Ben', lastName: 'Cruz', position: 'Sales Staff', department: 'Operations', dateHired: new Date('2024-01-08'), basicSalary: 17000, allowance: 500, branchId: AL.id },
    { employeeId:'E010', firstName: 'Pedro', lastName: 'Villanueva', position: 'Branch Manager', department: 'Operations', dateHired: new Date('2021-12-01'), basicSalary: 28000, allowance: 2000, branchId: ML.id },
  ]

  for (const emp of employeesData) {
    await prisma.employee.upsert({
      where: { employeeId: emp.employeeId },
      update: {},
      create: emp
    })
  }
  console.log('✓ Employees seeded')

  // ── USERS ──────────────────────────────────────────────────
  const users = [
    { employeeId:'ADMIN001', name:'Ryanne Admin',      email:'admin@boyztoys.com',   role:'SUPERADMIN',      branchId:DG.id, password:'nexushub2026!' },
    { employeeId:'E001',     name:'Maria Santos',      email:'maria@boyztoys.com',   role:'BRANCH_MANAGER',  branchId:DG.id, password:'dagupan2026' },
    { employeeId:'E002',     name:'Juan dela Cruz',    email:'juan@boyztoys.com',    role:'SHIFT_SUPERVISOR',branchId:DG.id, password:'dagupan2026' },
    { employeeId:'E003',     name:'Mila Reyes',        email:'mila@boyztoys.com',    role:'SALES_STAFF',     branchId:DG.id, password:'dagupan2026' },
    { employeeId:'E004',     name:'Ana Bautista',      email:'ana@boyztoys.com',     role:'BRANCH_MANAGER',  branchId:SC.id, password:'sancarlo2026' },
    { employeeId:'E005',     name:'Ramon Santiago',    email:'ramon@boyztoys.com',   role:'SHIFT_SUPERVISOR',branchId:SC.id, password:'sancarlo2026' },
    { employeeId:'E006',     name:'Liza Fernandez',    email:'liza@boyztoys.com',    role:'BRANCH_MANAGER',  branchId:LG.id, password:'lingayen2026' },
    { employeeId:'E007',     name:'Carlo Mendoza',     email:'carlo@boyztoys.com',   role:'SALES_STAFF',     branchId:LG.id, password:'lingayen2026' },
    { employeeId:'E008',     name:'Grace Tan',         email:'grace@boyztoys.com',   role:'BRANCH_MANAGER',  branchId:AL.id, password:'alamino2026' },
    { employeeId:'E009',     name:'Ben Cruz',          email:'ben@boyztoys.com',     role:'SALES_STAFF',     branchId:AL.id, password:'alamino2026' },
    { employeeId:'E010',     name:'Pedro Villanueva',  email:'pedro@boyztoys.com',   role:'BRANCH_MANAGER',  branchId:ML.id, password:'malasiq2026' },
  ]

  for (const u of users) {
    const passwordHash = await bcrypt.hash(u.password, 12)
    await prisma.user.upsert({
      where: { employeeId: u.employeeId },
      update: {},
      create: { employeeId:u.employeeId, name:u.name, email:u.email, role:u.role, branchId:u.branchId, passwordHash, isActive:true },
    })
  }
  console.log('✓ Users seeded')

  // ── AUDIT TEMPLATES ─────────────────────────────────────────
  const auditTemplates = [
    { auditType: 'ROUTINE', itemLabel: 'Petty cash drawer matches log sheet', sortOrder: 1 },
    { auditType: 'ROUTINE', itemLabel: 'Verify cash receipts and GCash payment reference logs', sortOrder: 2 },
    { auditType: 'ROUTINE', itemLabel: 'INGCO display stock faced forward and priced correctly', sortOrder: 3 },
    { auditType: 'EVENT_PROMO', itemLabel: 'Promo banners and marketing standees visible at entrance', sortOrder: 1 },
    { auditType: 'EVENT_PROMO', itemLabel: 'High-volume promo SKUs fully stocked', sortOrder: 2 },
    { auditType: 'COMPLIANCE', itemLabel: 'All staff are wearing correct uniforms and employee badges', sortOrder: 1 },
    { auditType: 'COMPLIANCE', itemLabel: 'Verify fire extinguisher inspection dates', sortOrder: 2 },
    { auditType: 'COMPLIANCE', itemLabel: 'Store exits and emergency lights functional', sortOrder: 3 },
    { auditType: 'COMPLIANCE', itemLabel: 'CCTV cameras are operational, clean, and recording properly', sortOrder: 4 },
  ]

  await prisma.auditChecklistTemplate.deleteMany()
  for (const t of auditTemplates) {
    await prisma.auditChecklistTemplate.create({
      data: t
    })
  }
  console.log('✓ Audit templates seeded')
  console.log('\n✅ Seed complete. Login with ADMIN001 / nexushub2026!')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())

