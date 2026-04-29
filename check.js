import 'dotenv/config';
import { UserClient, PrivateKeySigner } from '@croo-network/sdk';
import { config } from './config.js';

const signer = new PrivateKeySigner(process.env.WALLET_PRIVATE_KEY);
const client = new UserClient(config, signer);

await client.login();

const agents = await client.listAgents();
console.log('✅ Connected to CROO');
console.log('Your agents:', JSON.stringify(agents, null, 2));