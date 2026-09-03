const { Safepay } = require('@sfpy/node-sdk');

const safepay = new Safepay({
  environment: process.env.SAFEPAY_ENVIRONMENT || 'sandbox',
  apiKey: process.env.SAFEPAY_API_KEY || 'dummy_api_key',
  v1Secret: process.env.SAFEPAY_V1_SECRET || 'dummy_v1_secret',
  webhookSecret: process.env.SAFEPAY_WEBHOOK_SECRET || 'dummy_webhook_secret',
});

const PLAN_IDS = {
  basic: {
    monthly: process.env.SAFEPAY_PLAN_BASIC_MONTHLY,
    yearly: process.env.SAFEPAY_PLAN_BASIC_YEARLY,
  },
  pro: {
    monthly: process.env.SAFEPAY_PLAN_PRO_MONTHLY,
    yearly: process.env.SAFEPAY_PLAN_PRO_YEARLY,
  },
  enterprise: {
    monthly: process.env.SAFEPAY_PLAN_ENTERPRISE_MONTHLY,
    yearly: process.env.SAFEPAY_PLAN_ENTERPRISE_YEARLY,
  },
};

function getPlanId(plan, billingCycle) {
  return PLAN_IDS[plan]?.[billingCycle];
}

module.exports = { safepay, getPlanId };
