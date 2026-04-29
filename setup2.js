import 'dotenv/config';
import { UserClient, PrivateKeySigner } from '@croo-network/sdk';
import { config } from './config.js';
import fs from 'fs';

const signer = new PrivateKeySigner(process.env.WALLET_PRIVATE_KEY);
const client = new UserClient(config, signer);

await client.login();
console.log('✅ Logged in');

// List all your existing agents
const agents = await client.listAgents();
console.log('All your agents:', JSON.stringify(agents, null, 2));

// Get SDK keys for each agent
for (const agent of agents) {
  const keys = await client.listSDKKeys(agent.agentId);
  console.log(`Agent ${agent.agentId} (${agent.name}) keys:`, JSON.stringify(keys, null, 2));
}