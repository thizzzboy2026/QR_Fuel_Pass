const cron = require('node-cron');

const QUOTAS = {
  motorcycle: 4,
  car: 20,
  van: 30
};

function getQuotaForType(vehicleType) {
  return QUOTAS[vehicleType.toLowerCase()] || 20;
}

function resetAllQuotas() {
  const { run } = require('../db/connection');
  run('UPDATE vehicles SET remaining_quota = weekly_quota, last_quota_reset = CURRENT_TIMESTAMP');
  console.log('🔄 Weekly quotas have been reset at', new Date().toISOString());
}

function startQuotaResetCron() {
  // Every Monday at 00:00
  cron.schedule('0 0 * * 1', () => {
    resetAllQuotas();
  });
  console.log('⏰ Quota reset cron scheduled (every Monday 00:00)');
}

module.exports = { getQuotaForType, resetAllQuotas, startQuotaResetCron };
