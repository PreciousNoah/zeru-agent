import 'dotenv/config';
import { AgentClient, EventType, DeliverableType } from '@croo-network/sdk';
import { config } from './config.js';
import { research } from './research.js';

const sdkKey = 'croo_sk_0f60cb24b03c2d764be09fc0d880b6f0';
const client = new AgentClient(config, sdkKey);

console.log('Connecting to WebSocket...');
const stream = await client.connectWebSocket();
console.log('✅ Research Agent online, waiting for orders...');

stream.on(EventType.NegotiationCreated, async (e) => {
  console.log('📨 Negotiation received:', e.negotiation_id);
  try {
    const result = await client.acceptNegotiation(e.negotiation_id);
    console.log('✅ Negotiation accepted, order:', result.order.orderId);
  } catch (err) {
    console.error('Accept error:', err.message);
  }
});

stream.on(EventType.OrderPaid, async (e) => {
  console.log('💰 Payment received, starting research for order:', e.order_id);
  try {
    // Get order details to extract the research topic
    const order = await client.getOrder(e.order_id);
    const requirements = JSON.parse(order.requirement || '{}');
    const topic = requirements.topic || requirements.task || 'General market analysis';

    console.log('📚 Research topic:', topic);

    // Run the research
    const report = await research(topic);

    // Deliver the report
    await client.deliverOrder(e.order_id, {
      deliverableType: DeliverableType.Text,
      deliverableText: report,
    });

    console.log('📦 Research report delivered!');
  } catch (err) {
    console.error('Research/delivery error:', err.message);
  }
});

stream.on(EventType.OrderCompleted, (e) => {
  console.log('🎉 Order completed and settled:', e.order_id);
});

process.on('SIGINT', () => {
  stream.close();
  process.exit(0);
});