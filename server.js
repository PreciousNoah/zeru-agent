import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { AgentClient, EventType, DeliverableType } from '@croo-network/sdk';
import { research } from './research.js';

const app = express();
app.use(cors());
app.use(express.json());

const config = {
  baseURL: process.env.CROO_API_URL,
  wsURL: process.env.CROO_WS_URL,
  rpcURL: 'https://mainnet.base.org',
  logger: console,
};

const PROVIDER_SDK_KEY = process.env.CROO_SDK_KEY || 'croo_sk_0f60cb24b03c2d764be09fc0d880b6f0';
const REQUESTER_SDK_KEY = 'croo_sk_bbc6cc1f0c4ab9623a6f5db4369ff5fe';
const STORE_SDK_KEY = process.env.CROO_STORE_SDK_KEY;
const SERVICE_ID = 'f8368a2b-7e32-43ca-a298-fbfc94346ec0';

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ZERU agent online',
    network: 'Base',
    protocol: 'CROO v1',
    marketplace: 'agent.croo.network',
    agentId: '1b301682-55f4-4ca2-8fb6-deff838ab9fe',
  });
});

// Manual query endpoint (from UI)
app.post('/analyze', async (req, res) => {
  const { query, type } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    const requester = new AgentClient(config, REQUESTER_SDK_KEY);
    const neg = await requester.negotiateOrder({
      serviceId: SERVICE_ID,
      requirements: JSON.stringify({ topic: query, type: type || 'RESEARCH' }),
    });
    console.log('Negotiation started:', neg.negotiationId);

    const result = await runFullOrderCycle(
      PROVIDER_SDK_KEY,
      REQUESTER_SDK_KEY,
      neg.negotiationId,
      query
    );

    res.json(result);
  } catch (err) {
    console.error('Order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Full order cycle handler
async function runFullOrderCycle(providerKey, requesterKey, negotiationId, query) {
  return new Promise(async (resolve, reject) => {
    const provider = new AgentClient(config, providerKey);
    const requester = new AgentClient(config, requesterKey);

    const providerStream = await provider.connectWebSocket();
    const requesterStream = await requester.connectWebSocket();

    let paymentTx = '';
    let deliveryTx = '';
    let orderId = '';
    let report = '';

    const timeout = setTimeout(() => {
      providerStream.close();
      requesterStream.close();
      reject(new Error('Order timed out after 120s'));
    }, 120000);

    providerStream.on(EventType.NegotiationCreated, async (e) => {
      if (e.negotiation_id !== negotiationId) return;
      console.log('Accepting negotiation...');
      const result = await provider.acceptNegotiation(e.negotiation_id);
      orderId = result.order.orderId;
      console.log('Order created:', orderId);
    });

    requesterStream.on(EventType.OrderCreated, async (e) => {
      if (e.order_id !== orderId) return;
      console.log('Paying order...');
      const payment = await requester.payOrder(e.order_id);
      paymentTx = payment.txHash;
      console.log('Payment TX:', paymentTx);
    });

    providerStream.on(EventType.OrderPaid, async (e) => {
      if (e.order_id !== orderId) return;
      console.log('Researching and delivering...');
      report = await research(query);
      const delivery = await provider.deliverOrder(e.order_id, {
        deliverableType: DeliverableType.Text,
        deliverableText: report,
      });
      deliveryTx = delivery.txHash;
      console.log('Delivery TX:', deliveryTx);
    });

    requesterStream.on(EventType.OrderCompleted, async (e) => {
      if (e.order_id !== orderId) return;
      clearTimeout(timeout);
      providerStream.close();
      requesterStream.close();
      resolve({
        orderId,
        paymentTx,
        deliveryTx,
        report,
        network: 'Base Mainnet',
        agentId: '1b301682-55f4-4ca2-8fb6-deff838ab9fe',
        serviceId: SERVICE_ID,
      });
    });
  });
}

// Agent Store provider listener — handles orders from agent.croo.network
async function startStoreProvider() {
  if (!STORE_SDK_KEY) {
    console.log('No CROO_STORE_SDK_KEY set — skipping Agent Store listener');
    return;
  }

  console.log('Starting Agent Store provider listener...');
  const storeProvider = new AgentClient(config, STORE_SDK_KEY);
  const stream = await storeProvider.connectWebSocket();
  console.log('✅ Agent Store WebSocket connected');

  stream.on(EventType.NegotiationCreated, async (e) => {
    console.log('📨 Agent Store negotiation received:', e.negotiation_id);
    try {
      const result = await storeProvider.acceptNegotiation(e.negotiation_id);
      console.log('✅ Accepted, order:', result.order.orderId);
    } catch (err) {
      console.error('Accept error:', err.message);
    }
  });

  stream.on(EventType.OrderPaid, async (e) => {
    console.log('💰 Agent Store payment received:', e.order_id);
    try {
      const order = await storeProvider.getOrder(e.order_id);
      const requirements = JSON.parse(order.requirement || '{}');
      const topic = requirements.topic || requirements.text || requirements.task || order.requirement || 'DeFi market analysis';

      console.log('🔬 Researching topic:', topic);
      const report = await research(topic);

      const delivery = await storeProvider.deliverOrder(e.order_id, {
        deliverableType: DeliverableType.Text,
        deliverableText: report,
      });

      console.log('📦 Delivered to Agent Store buyer:', delivery.txHash);
    } catch (err) {
      console.error('Delivery error:', err.message);
    }
  });

  stream.on(EventType.OrderCompleted, (e) => {
    console.log('🎉 Agent Store order settled:', e.order_id);
  });

  // Reconnect on disconnect
  stream.on('close', async () => {
    console.log('Agent Store WebSocket closed — reconnecting in 5s...');
    setTimeout(startStoreProvider, 5000);
  });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ ZERU backend running on port ${PORT}`);
  await startStoreProvider();
});