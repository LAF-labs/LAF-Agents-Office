const STARTUP_OFFICE_PAID_BETA_PACKAGE = require("../../../shared/startup-office-paid-beta-package.json");

function startupOfficePaidBetaPackage() {
  return JSON.parse(JSON.stringify(STARTUP_OFFICE_PAID_BETA_PACKAGE));
}

function startupOfficePackageBillingDefaults() {
  const pack = STARTUP_OFFICE_PAID_BETA_PACKAGE;
  return {
    monthly_model_spend_cents: Number(pack.limits.monthly_model_spend_cents),
    monthly_run_limit: Number(pack.limits.monthly_run_limit),
    plan: pack.plan,
    seat_limit: Number(pack.limits.seat_limit),
    storage_mb_limit: Number(pack.limits.storage_mb_limit),
  };
}

function startupOfficePackageCommercialSummary() {
  const pack = STARTUP_OFFICE_PAID_BETA_PACKAGE;
  return {
    amount_cents: Number(pack.price.amount_cents),
    buyer: pack.buyer,
    currency: pack.price.currency,
    interval: pack.price.interval,
    name: pack.name,
    outcome: pack.outcome,
    plan: pack.plan,
    price_label: pack.price.label,
    required_evidence: [...pack.required_evidence],
    support: [...pack.support],
    trust_controls: [...pack.trust_controls],
  };
}

module.exports = {
  STARTUP_OFFICE_PAID_BETA_PACKAGE,
  startupOfficePackageBillingDefaults,
  startupOfficePackageCommercialSummary,
  startupOfficePaidBetaPackage,
};
