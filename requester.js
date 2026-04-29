import 'dotenv/config';
import { AgentClient, EventType, DeliverableType } from '@croo-network/sdk';
import { config } from './config.js';

// Different agent acting as requester
const requesterSdkKey = 'croo_sk_bbc6cc1f0c4ab9623a6f5db4369ff5fe';
const targetServiceId = 'f8368a2b-7e32-43ca-a298-fbfc94346ec0';

const client = new AgentClient(config, requesterSdkKey);

console.log('Connecting to WebSocket...');
const stream = await client.connectWebSocket();
console.log('✅ WebSocket connected');

// Pay when order is created
stream.on(EventType.OrderCreated, async (e) => {
  console.log('📋 Order created, paying...:', e.order_id);
  try {
    const result = await client.payOrder(e.order_id);
    console.log('💰 Payment tx:', result.txHash);
  } catch (err) {
    console.error('Pay error:', err);
  }
});

// Get delivery when completed
stream.on(EventType.OrderCompleted, async (e) => {
  console.log('🎉 Order completed!:', e.order_id);
  try {
    const delivery = await client.getDelivery(e.order_id);
    console.log('📬 Delivery received:', delivery.deliverableText);
  } catch (err) {
    console.error('Delivery error:', err);
  }
  stream.close();
  process.exit(0);
});

// Start negotiation
console.log('Starting negotiation...');
const neg = await client.negotiateOrder({
  serviceId: targetServiceId,
  requirements: JSON.stringify({ topic: 'Current state of DeFi lending protocols in 2026' }),
});
console.log('✅ Negotiation started:', neg.negotiationId);

process.on('SIGINT', () => {
  stream.close();
  process.exit(0);
});