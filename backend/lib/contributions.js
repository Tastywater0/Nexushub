// ═══════════════════════════════════════════════════════════════
// NexusHub Philippine Payroll Contributions (2026 Brackets)
// Computes SSS, WISP/MPF, PhilHealth, Pag-IBIG (HDMF), and BIR Tax
// ═══════════════════════════════════════════════════════════════

export function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100
}

/**
 * Computes the SSS regular EE contribution and WISP (MPF) EE contribution.
 * 2026 EE rate: 4.5% of Monthly Salary Credit (MSC), WISP EE rate: 2.5% of MSC excess over 20k.
 * Regular SSS MSC Ceiling: 30,000. WISP Ceiling: 30,000.
 * @param {number} basic - Monthly basic salary
 * @returns {object} { sssEe, sssMpf }
 */
export function computeSSS(basic) {
  const boundedBasic = Math.max(3000, Math.min(basic, 30000))
  
  // SSS EE Regular Share: 4.5% of MSC
  const sssEe = boundedBasic * 0.045

  // WISP (MPF) EE Share: 2.5% of MSC above 20,000
  let sssMpf = 0
  if (basic > 20000) {
    const wispMsc = Math.min(basic, 30000) - 20000
    sssMpf = wispMsc * 0.025
  }

  return {
    sssEe: round2(sssEe),
    sssMpf: round2(sssMpf)
  }
}

/**
 * Computes PhilHealth Employee contribution.
 * 2026 Rate: 5% total premium, split 50/50 (2.5% EE share).
 * Salary Floor: 10,000, Ceiling: 100,000.
 * @param {number} basic - Monthly basic salary
 * @returns {number} Employee share
 */
export function computePhilHealth(basic) {
  const boundedBasic = Math.max(10000, Math.min(basic, 100000))
  const premium = boundedBasic * 0.05
  return round2(premium / 2) // 50% split
}

/**
 * Computes Pag-IBIG (HDMF) Employee contribution.
 * EE rate: 1% if basic <= 1,500; 2% if basic > 1,500.
 * Maximum Monthly Salary Credit: 10,000 (Maximum EE share: 200).
 * @param {number} basic - Monthly basic salary
 * @returns {number} Employee contribution
 */
export function computeHDMF(basic) {
  const rate = basic <= 1500 ? 0.01 : 0.02
  const msc = Math.min(basic, 10000)
  return round2(msc * rate)
}

/**
 * Computes monthly withholding tax based on BIR monthly tax table.
 * @param {number} taxableIncome - Monthly gross taxable income (Gross - EE Gov't Contributions)
 * @returns {number} Withholding tax amount
 */
export function computeWithholdingTax(taxableIncome) {
  if (taxableIncome <= 20833.33) {
    return 0
  } else if (taxableIncome <= 33333.33) {
    return round2((taxableIncome - 20833.33) * 0.15)
  } else if (taxableIncome <= 66667.00) {
    return round2(1875.00 + (taxableIncome - 33333.33) * 0.20)
  } else if (taxableIncome <= 166667.00) {
    return round2(8541.67 + (taxableIncome - 66667.00) * 0.25)
  } else if (taxableIncome <= 666667.00) {
    return round2(33541.67 + (taxableIncome - 166667.00) * 0.30)
  } else {
    return round2(183541.67 + (taxableIncome - 666667.00) * 0.35)
  }
}
