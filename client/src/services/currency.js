const currencyFormatter = new Intl.NumberFormat('en-KE', {
  style: 'currency',
  currency: 'KES',
  maximumFractionDigits: 0
});

export function isCurrencyField(field) {
  return field.toLowerCase().includes('salary') ||
    [
      'budget', 'grossPay', 'baseSalary', 'allowances', 'bonuses', 'deductions', 'tax',
      'netPay', 'netSalary', 'otherDeductions', 'totalDeductions', 'nssfEmployee',
      'nssfEmployer', 'shif', 'housingLevyEmployee', 'housingLevyEmployer', 'taxablePay',
      'payeBeforeRelief', 'personalRelief', 'insuranceRelief', 'paye', 'insurancePremium'
    ].includes(field);
}

export function formatCurrency(value) {
  return currencyFormatter.format(value);
}
