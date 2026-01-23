const crypto = require('crypto');
const { TerraClient } = require('terra-api');
const { env } = require('../config/env');

const terraClient = new TerraClient({
  apiKey: env.terra.apiKey,
  devId: env.terra.devId,
});

function verifyTerraWebhookSignature(body, signature) {
  if (!signature || !env.terra.webhookSecret) return true;
  try {
    const [timestampPart, sigPart] = signature.split(',');
    const timestamp = timestampPart.split('=')[1];
    const receivedSignature = sigPart.split('=')[1];
    const payload = `${timestamp}.${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', env.terra.webhookSecret)
      .update(payload)
      .digest('hex');
    return receivedSignature === expectedSignature;
  } catch (error) {
    console.error('Error verifying Terra webhook signature:', error);
    return false;
  }
}

module.exports = { terraClient, verifyTerraWebhookSignature };
