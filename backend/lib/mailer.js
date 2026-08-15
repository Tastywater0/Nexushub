// ═══════════════════════════════════════════════════════════════
// NexusHub Mailer — Nodemailer + Gmail SMTP
// Free tier: use a dedicated Gmail account (e.g. nexushub.alerts@gmail.com)
// Production upgrade: swap to Resend.com ($0 for 3k emails/mo)
// ═══════════════════════════════════════════════════════════════
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER, // nexushub.alerts@gmail.com
    pass: process.env.SMTP_PASS, // Gmail App Password (not your main password)
  },
})

const ADMIN_EMAIL   = process.env.ADMIN_EMAIL   || 'ryanne@boyztoys.com'
const SENDER_NAME   = 'NexusHub Alerts'
const SENDER_EMAIL  = process.env.SMTP_USER     || 'nexushub.alerts@gmail.com'

function peso(n) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2 })
}

// ── EOD DISCREPANCY ALERT ─────────────────────────────────────
export async function emailDiscrepancy({ recon, cashVariance, digitalVariance, skuVariances }) {
  const branchName = recon.branch?.name || recon.branchId
  const subject = `⚠ EOD Discrepancy — ${branchName} — ${recon.date.toISOString().slice(0, 10)}`

  const skuRows = skuVariances.map(i =>
    `<tr>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px">${i.productId}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${i.expectedQty}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;color:${i.physicalQty < i.expectedQty ? '#C03A38' : '#1D9E75'};font-weight:700">${i.physicalQty}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center;font-weight:700;color:#C03A38">${i.physicalQty - i.expectedQty}</td>
    </tr>`
  ).join('')

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto">
    <div style="background:#0D5C4A;padding:18px 24px;border-radius:8px 8px 0 0">
      <div style="color:#fff;font-size:18px;font-weight:700">NexusHub · EOD Discrepancy Report</div>
      <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:3px">${branchName} Branch</div>
    </div>
    <div style="background:#FCECEC;border:1px solid #F1B0AF;border-top:none;padding:14px 24px">
      <div style="color:#C03A38;font-weight:700;font-size:14px">⚠ Discrepancy detected — supervisor acknowledgment required</div>
    </div>
    <div style="border:1px solid #E0DED8;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">

      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="color:#888;font-size:12px;padding:5px 0">Report ID</td><td style="font-family:monospace;font-size:12px;font-weight:600">${recon.id}</td></tr>
        <tr><td style="color:#888;font-size:12px;padding:5px 0">Branch</td><td style="font-weight:600">${branchName}</td></tr>
        <tr><td style="color:#888;font-size:12px;padding:5px 0">Date</td><td>${recon.date.toISOString().slice(0, 10)}</td></tr>
        <tr><td style="color:#888;font-size:12px;padding:5px 0">Closed by</td><td>${recon.reconciledBy?.name || 'Unknown'}</td></tr>
      </table>

      <div style="font-size:13px;font-weight:700;color:#3A3A38;margin-bottom:8px">Cash variance</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
        <tr>
          <td style="padding:7px 10px;background:#F5F4F0">Expected</td>
          <td style="padding:7px 10px;background:#F5F4F0;font-weight:600">${peso(recon.cashExpected)}</td>
        </tr>
        <tr>
          <td style="padding:7px 10px;border-bottom:1px solid #eee">Physical</td>
          <td style="padding:7px 10px;border-bottom:1px solid #eee;font-weight:600">${peso(recon.cashPhysical)}</td>
        </tr>
        <tr>
          <td style="padding:7px 10px;font-weight:700">Variance</td>
          <td style="padding:7px 10px;font-weight:700;font-size:16px;color:${cashVariance === 0 ? '#1D9E75' : '#C03A38'}">${cashVariance >= 0 ? '+' : ''}${peso(cashVariance)}</td>
        </tr>
      </table>

      ${skuVariances.length > 0 ? `
      <div style="font-size:13px;font-weight:700;color:#3A3A38;margin-bottom:8px">SKU variances</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        <thead>
          <tr style="background:#F5F4F0">
            <th style="padding:7px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Product</th>
            <th style="padding:7px 10px;text-align:center;font-size:11px;text-transform:uppercase">Expected</th>
            <th style="padding:7px 10px;text-align:center;font-size:11px;text-transform:uppercase">Physical</th>
            <th style="padding:7px 10px;text-align:center;font-size:11px;text-transform:uppercase">Variance</th>
          </tr>
        </thead>
        <tbody>${skuRows}</tbody>
      </table>` : ''}

      <div style="background:#FDF2E0;border:1px solid #F5C97A;border-radius:6px;padding:12px 14px;font-size:13px;color:#8A5010;margin-bottom:16px">
        <strong>Action required:</strong> Review this discrepancy and clear the report in NexusHub within 24 hours.
      </div>

      <a href="${process.env.FRONTEND_URL || 'https://nexushub.vercel.app'}/reports" style="display:inline-block;background:#0D5C4A;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open in NexusHub →</a>
    </div>
    <div style="text-align:center;font-size:11px;color:#aaa;margin-top:12px">NexusHub · Boyztoys Corp · Pangasinan, Philippines</div>
  </div>`

  await transporter.sendMail({
    from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
    to: ADMIN_EMAIL,
    subject,
    html,
  })
}

// ── LOW STOCK ALERT ───────────────────────────────────────────
export async function emailLowStock({ item, product, branch }) {
  const subject = `📦 Low Stock Alert — ${product.name} · ${branch.code}`

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:500px;margin:0 auto">
    <div style="background:#0D5C4A;padding:16px 22px;border-radius:8px 8px 0 0">
      <div style="color:#fff;font-size:16px;font-weight:700">NexusHub · Low Stock Alert</div>
    </div>
    <div style="border:1px solid #E0DED8;border-top:none;padding:18px 22px;border-radius:0 0 8px 8px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr><td style="color:#888;padding:5px 0">Product</td><td style="font-weight:700">${product.name}</td></tr>
        <tr><td style="color:#888;padding:5px 0">SKU</td><td style="font-family:monospace;font-size:12px">${product.sku}</td></tr>
        <tr><td style="color:#888;padding:5px 0">Branch</td><td>${branch.code}</td></tr>
        <tr><td style="color:#888;padding:5px 0">On hand</td><td style="font-weight:700;font-size:16px;color:${item.quantityOnHand === 0 ? '#C03A38' : '#8A5010'}">${item.quantityOnHand} units</td></tr>
        <tr><td style="color:#888;padding:5px 0">Reorder point</td><td>${product.reorderPoint} units</td></tr>
        <tr><td style="color:#888;padding:5px 0">30d velocity</td><td>${item.velocity30d} units/month</td></tr>
      </table>
      <div style="margin-top:14px">
        <a href="${process.env.FRONTEND_URL || 'https://nexushub.vercel.app'}/velocity" style="display:inline-block;background:#0D5C4A;color:#fff;padding:9px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">View transfer options →</a>
      </div>
    </div>
  </div>`

  await transporter.sendMail({
    from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
    to: ADMIN_EMAIL,
    subject,
    html,
  })
}

// ── WEEKLY SUMMARY EMAIL ──────────────────────────────────────
export async function emailWeeklySummary({ branches, topSKUs, pendingTransfers, eodDiscrepancies }) {
  const subject = `📊 NexusHub Weekly Summary — Week of ${new Date().toLocaleDateString('en-PH')}`

  const branchRows = branches.map(b =>
    `<tr>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;font-weight:600">${b.name}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:right">${peso(b.weekRevenue)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center">${b.eodClean}/${b.eodTotal}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #eee;text-align:center;color:${b.lowStock > 3 ? '#C03A38' : '#1D9E75'}">${b.lowStock}</td>
    </tr>`
  ).join('')

  const html = `
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:580px;margin:0 auto">
    <div style="background:#0D5C4A;padding:18px 24px;border-radius:8px 8px 0 0">
      <div style="color:#fff;font-size:18px;font-weight:700">NexusHub · Weekly Summary</div>
      <div style="color:rgba(255,255,255,.7);font-size:13px;margin-top:3px">Boyztoys Corp · All 5 Branches</div>
    </div>
    <div style="border:1px solid #E0DED8;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px">
        <div style="background:#F5F4F0;border-radius:6px;padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#0D5C4A">${pendingTransfers}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">Pending transfers</div>
        </div>
        <div style="background:#F5F4F0;border-radius:6px;padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:${eodDiscrepancies > 0 ? '#C03A38' : '#1D9E75'}">${eodDiscrepancies}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">EOD discrepancies</div>
        </div>
        <div style="background:#F5F4F0;border-radius:6px;padding:12px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#1A4F8A">${topSKUs?.length || 0}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">Active SKUs</div>
        </div>
      </div>

      <div style="font-size:13px;font-weight:700;color:#3A3A38;margin-bottom:8px">Branch performance</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px">
        <thead>
          <tr style="background:#F5F4F0">
            <th style="padding:7px 10px;text-align:left;font-size:11px;text-transform:uppercase">Branch</th>
            <th style="padding:7px 10px;text-align:right;font-size:11px;text-transform:uppercase">Revenue</th>
            <th style="padding:7px 10px;text-align:center;font-size:11px;text-transform:uppercase">Clean EODs</th>
            <th style="padding:7px 10px;text-align:center;font-size:11px;text-transform:uppercase">Low stock</th>
          </tr>
        </thead>
        <tbody>${branchRows}</tbody>
      </table>

      <a href="${process.env.FRONTEND_URL || 'https://nexushub.vercel.app'}" style="display:inline-block;background:#0D5C4A;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open NexusHub →</a>
    </div>
    <div style="text-align:center;font-size:11px;color:#aaa;margin-top:12px">NexusHub · Boyztoys Corp · Auto-generated every Monday 7 AM</div>
  </div>`

  await transporter.sendMail({
    from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
    to: ADMIN_EMAIL,
    subject,
    html,
  })
}
