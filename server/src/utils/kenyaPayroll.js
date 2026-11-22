// Update these effective Kenyan statutory rates and limits here when gazetted.
const KENYA_PAYROLL_CONFIG = Object.freeze({
  nssf: Object.freeze({
    employeeRate: 0.06,
    employerRate: 0.06,
    lowerEarningsLimit: 9000,
    upperEarningsLimit: 108000
  }),
  shif: Object.freeze({ rate: 0.0275, minimum: 300 }),
  housingLevy: Object.freeze({ employeeRate: 0.015, employerRate: 0.015 }),
  paye: Object.freeze({
    bands: Object.freeze([
      Object.freeze({ limit: 24000, rate: 0.10 }),
      Object.freeze({ limit: 32333, rate: 0.25 }),
      Object.freeze({ limit: 500000, rate: 0.30 }),
      Object.freeze({ limit: 800000, rate: 0.325 }),
      Object.freeze({ limit: Infinity, rate: 0.35 })
    ]),
    personalRelief: 2400,
    insuranceReliefRate: 0.15,
    maximumMonthlyInsuranceRelief: 5000
  })
});

const roundMoney = (amount) => Math.round((amount + Number.EPSILON) * 100) / 100;
const nonNegative = (amount) => Math.max(0, Number(amount) || 0);

function calculateNssf(pensionablePay, exempt = false) {
  if (exempt) return { employee: 0, employer: 0, tierI: 0, tierII: 0 };
  const pay = nonNegative(pensionablePay);
  const tierI = Math.min(pay, KENYA_PAYROLL_CONFIG.nssf.lowerEarningsLimit);
  const tierII = Math.min(
    Math.max(0, pay - KENYA_PAYROLL_CONFIG.nssf.lowerEarningsLimit),
    KENYA_PAYROLL_CONFIG.nssf.upperEarningsLimit - KENYA_PAYROLL_CONFIG.nssf.lowerEarningsLimit
  );
  const employee = roundMoney(
    tierI * KENYA_PAYROLL_CONFIG.nssf.employeeRate +
    tierII * KENYA_PAYROLL_CONFIG.nssf.employeeRate
  );
  const employer = roundMoney(
    tierI * KENYA_PAYROLL_CONFIG.nssf.employerRate +
    tierII * KENYA_PAYROLL_CONFIG.nssf.employerRate
  );
  return {
    employee,
    employer,
    tierI: roundMoney(tierI * KENYA_PAYROLL_CONFIG.nssf.employeeRate),
    tierII: roundMoney(tierII * KENYA_PAYROLL_CONFIG.nssf.employeeRate)
  };
}

function calculatePaye(taxablePay) {
  let remaining = nonNegative(taxablePay);
  let previousLimit = 0;
  let tax = 0;
  for (const band of KENYA_PAYROLL_CONFIG.paye.bands) {
    const taxableInBand = Math.max(0, Math.min(remaining, band.limit - previousLimit));
    tax += taxableInBand * band.rate;
    remaining -= taxableInBand;
    previousLimit = band.limit;
    if (remaining <= 0) break;
  }
  return roundMoney(tax);
}

function calculateKenyaPayroll({
  baseSalary = 0,
  allowances = 0,
  bonuses = 0,
  grossPay: suppliedGrossPay,
  otherDeductions,
  deductions = 0,
  insurancePremium = 0,
  nssfExempt = false,
  shifExempt = false,
  housingLevyExempt = false,
  payeExempt = false
} = {}) {
  const grossPay = roundMoney(suppliedGrossPay === undefined
    ? nonNegative(baseSalary) + nonNegative(allowances) + nonNegative(bonuses)
    : nonNegative(suppliedGrossPay));
  const nssf = calculateNssf(grossPay, nssfExempt);
  const shif = shifExempt || grossPay === 0
    ? 0
    : roundMoney(Math.max(KENYA_PAYROLL_CONFIG.shif.minimum, grossPay * KENYA_PAYROLL_CONFIG.shif.rate));
  const housingLevyEmployee = housingLevyExempt
    ? 0
    : roundMoney(grossPay * KENYA_PAYROLL_CONFIG.housingLevy.employeeRate);
  const housingLevyEmployer = housingLevyExempt
    ? 0
    : roundMoney(grossPay * KENYA_PAYROLL_CONFIG.housingLevy.employerRate);
  const taxablePay = roundMoney(Math.max(0, grossPay - nssf.employee - shif - housingLevyEmployee));
  const payeBeforeRelief = calculatePaye(taxablePay);
  const requestedInsuranceRelief = Math.min(
    nonNegative(insurancePremium) * KENYA_PAYROLL_CONFIG.paye.insuranceReliefRate,
    KENYA_PAYROLL_CONFIG.paye.maximumMonthlyInsuranceRelief
  );
  const personalRelief = payeExempt
    ? 0
    : roundMoney(Math.min(payeBeforeRelief, KENYA_PAYROLL_CONFIG.paye.personalRelief));
  const insuranceRelief = payeExempt
    ? 0
    : roundMoney(Math.min(Math.max(0, payeBeforeRelief - personalRelief), requestedInsuranceRelief));
  const paye = payeExempt
    ? 0
    : roundMoney(Math.max(0, payeBeforeRelief - personalRelief - insuranceRelief));
  const customDeductions = nonNegative(otherDeductions === undefined ? deductions : otherDeductions);
  const totalDeductions = roundMoney(
    nssf.employee + shif + housingLevyEmployee + paye + customDeductions
  );

  return {
    grossPay,
    nssfEmployee: nssf.employee,
    nssfEmployer: nssf.employer,
    shif,
    housingLevyEmployee,
    housingLevyEmployer,
    taxablePay,
    payeBeforeRelief,
    personalRelief,
    insuranceRelief,
    paye,
    otherDeductions: roundMoney(customDeductions),
    totalDeductions,
    netPay: roundMoney(Math.max(0, grossPay - totalDeductions))
  };
}

module.exports = { KENYA_PAYROLL_CONFIG, calculateNssf, calculatePaye, calculateKenyaPayroll };
