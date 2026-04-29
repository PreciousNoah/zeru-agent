import 'dotenv/config';
import { UserClient, PrivateKeySigner } from '@croo-network/sdk';
import { config } from './config.js';

const signer = new PrivateKeySigner(process.env.WALLET_PRIVATE_KEY);
const client = new UserClient(config, signer);

await client.login();
console.log('✅ Logged in');

const serviceId = 'f8368a2b-7e32-43ca-a298-fbfc94346ec0';

const updated = await client.updateService(serviceId, {
  name: 'AI Research Agent',
  description: 'Delivers structured research reports on any topic using live web data and AI analysis. Send your topic and receive a full report covering executive summary, key findings, current market state, key players, and outlook.',
});

console.log('✅ Service updated:', JSON.stringify(updated, null, 2));