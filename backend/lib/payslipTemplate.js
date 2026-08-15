// ═══════════════════════════════════════════════════════════════
// payslipTemplate.js — Payslip HTML/CSS Template
// Clones Ybalai/Boyztoys print layout pixel-perfectly
// ═══════════════════════════════════════════════════════════════

export function renderPayslipHTML(run, ytd) {
  // Safe number formatting helper
  const fmt = (val) => new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0)
  
  const payrollDateStr = new Date(run.payrollDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const periodStartStr = new Date(run.periodStart).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  const periodEndStr = new Date(run.periodEnd).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const sssTotal = run.sssEe + run.sssMpf
  const ytdSssTotal = ytd._sum.sssEe || 0

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payslip - ${run.employee.firstName} ${run.employee.lastName}</title>
  <style>
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #333333;
      margin: 0;
      padding: 0;
      font-size: 11px;
      line-height: 1.4;
      background-color: #ffffff;
    }
    .payslip-container {
      width: 190mm;
      margin: auto;
      padding: 10mm;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .company-logo {
      font-weight: 800;
      font-size: 20px;
      color: #0f172a;
      letter-spacing: -0.5px;
    }
    .company-logo span {
      color: #fb923c; /* INGCO Orange */
    }
    .document-title {
      font-weight: 700;
      font-size: 16px;
      color: #64748b;
      text-transform: uppercase;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      background-color: #f8fafc;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
    .meta-item {
      display: flex;
      justify-content: space-between;
    }
    .meta-label {
      font-weight: 600;
      color: #64748b;
    }
    .meta-value {
      font-weight: 500;
      color: #0f172a;
    }
    .payslip-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    .column-box {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      overflow: hidden;
    }
    .column-header {
      background-color: #f1f5f9;
      font-weight: 700;
      color: #334155;
      padding: 8px 12px;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #e2e8f0;
    }
    .column-body {
      padding: 10px 12px;
    }
    .item-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      border-bottom: 1px dashed #f1f5f9;
    }
    .item-row:last-child {
      border-bottom: none;
    }
    .item-label {
      color: #475569;
    }
    .item-value {
      font-weight: 600;
      color: #0f172a;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 12px;
      background-color: #f8fafc;
      font-weight: 700;
      border-top: 1px solid #e2e8f0;
    }
    .netpay-section {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      color: #ffffff;
      padding: 16px 20px;
      border-radius: 6px;
      margin-bottom: 20px;
    }
    .netpay-label {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .netpay-amount {
      font-size: 24px;
      font-weight: 800;
      color: #fb923c;
    }
    .legend-footer {
      font-size: 9px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      text-align: center;
      line-height: 1.6;
    }
    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .payslip-container {
        border: none;
        padding: 0;
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="payslip-container">
    <div class="header">
      <div class="company-logo">Boyztoys<span>Corp</span></div>
      <div class="document-title">Official Payslip</div>
    </div>
    
    <div class="meta-grid">
      <div>
        <div class="meta-item" style="margin-bottom: 6px;">
          <span class="meta-label">Employee Name:</span>
          <span class="meta-value">${run.employee.firstName} ${run.employee.lastName}</span>
        </div>
        <div class="meta-item" style="margin-bottom: 6px;">
          <span class="meta-label">Employee ID:</span>
          <span class="meta-value">${run.employee.employeeId}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Position:</span>
          <span class="meta-value">${run.employee.position} (${run.employee.department})</span>
        </div>
      </div>
      <div>
        <div class="meta-item" style="margin-bottom: 6px;">
          <span class="meta-label">Payroll Date:</span>
          <span class="meta-value">${payrollDateStr}</span>
        </div>
        <div class="meta-item" style="margin-bottom: 6px;">
          <span class="meta-label">Pay Period:</span>
          <span class="meta-value">${periodStartStr} - ${periodEndStr}</span>
        </div>
        <div class="meta-item">
          <span class="meta-label">Employment Status:</span>
          <span class="meta-value" style="text-transform: uppercase;">${run.employee.employmentStatus}</span>
        </div>
      </div>
    </div>

    <div class="payslip-grid">
      <!-- COMPENSATION -->
      <div class="column-box">
        <div class="column-header">Compensation</div>
        <div class="column-body">
          <div class="item-row">
            <span class="item-label">Basic Salary</span>
            <span class="item-value">₱${fmt(run.basic)}</span>
          </div>
          <div class="item-row">
            <span class="item-label">Allowance</span>
            <span class="item-value">₱${fmt(run.allowance)}</span>
          </div>
          <div class="item-row">
            <span class="item-label">De Minimis</span>
            <span class="item-value">₱${fmt(run.deMinimis)}</span>
          </div>
        </div>
        <div class="total-row">
          <span>Gross Comp</span>
          <span>₱${fmt(run.totalComp)}</span>
        </div>
      </div>

      <!-- DEDUCTIONS -->
      <div class="column-box">
        <div class="column-header">Deductions</div>
        <div class="column-body">
          <div class="item-row">
            <span class="item-label">SSS Premium</span>
            <span class="item-value">₱${fmt(sssTotal)}</span>
          </div>
          <div class="item-row">
            <span class="item-label">PhilHealth</span>
            <span class="item-value">₱${fmt(run.philhealthEe)}</span>
          </div>
          <div class="item-row">
            <span class="item-label">PAG-IBIG (HDMF)</span>
            <span class="item-value">₱${fmt(run.hdmfEe)}</span>
          </div>
          <div class="item-row">
            <span class="item-label">Withholding Tax</span>
            <span class="item-value">₱${fmt(run.withholdingTax)}</span>
          </div>
          <div class="item-row">
            <span class="item-label">Late/Undertime</span>
            <span class="item-value">₱${fmt(run.lateUndertimeAmt)}</span>
          </div>
          <div class="item-row">
            <span class="item-label">Absences</span>
            <span class="item-value">₱${fmt(run.absenceAmt)}</span>
          </div>
        </div>
        <div class="total-row">
          <span>Total Deductions</span>
          <span>₱${fmt(run.totalDeductions)}</span>
        </div>
      </div>

      <!-- YEAR-TO-DATE (YTD) -->
      <div class="column-box">
        <div class="column-header">Year-To-Date (YTD)</div>
        <div class="column-body">
          <div class="item-row">
            <span class="item-label">YTD Gross Earnings</span>
            <span class="item-value">₱${fmt(ytd._sum.totalComp)}</span>
          </div>
          <div class="item-row">
            <span class="item-label">YTD Withholding Tax</span>
            <span class="item-value">₱${fmt(ytd._sum.withholdingTax)}</span>
          </div>
          <div class="item-row">
            <span class="item-label">YTD SSS Contribution</span>
            <span class="item-value">₱${fmt(ytdSssTotal)}</span>
          </div>
          <div class="item-row">
            <span class="item-label">YTD PhilHealth</span>
            <span class="item-value">₱${fmt(ytd._sum.philhealthEe)}</span>
          </div>
          <div class="item-row">
            <span class="item-label">YTD Pag-IBIG</span>
            <span class="item-value">₱${fmt(ytd._sum.hdmfEe)}</span>
          </div>
        </div>
        <div class="total-row" style="color: transparent; border-top: 1px solid #e2e8f0;">
          <span>YTD summary</span>
          <span>-</span>
        </div>
      </div>
    </div>

    <div class="netpay-section">
      <div class="netpay-label">Net Take-Home Pay</div>
      <div class="netpay-amount">₱${fmt(run.netPay)}</div>
    </div>

    <div class="legend-footer">
      This is a system-generated document. For questions, contact Human Resources.
      <br>
      Boyztoys Corp — Pangasinan, Philippines
    </div>
  </div>
</body>
</html>
  `
}
