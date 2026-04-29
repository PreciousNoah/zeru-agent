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

const PROVIDER_SDK_KEY = 'croo_sk_0f60cb24b03c2d764be09fc0d880b6f0';
const REQUESTER_SDK_KEY = 'croo_sk_bbc6cc1f0c4ab9623a6f5db4369ff5fe';
const SERVICE_ID = 'f8368a2b-7e32-43ca-a298-fbfc94346ec0';

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ZERU agent online', network: 'Base', protocol: 'CROO v1' });
});

// Main query endpoint
app.post('/analyze', async (req, res) => {
  const { query, type } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  try {
    // Step 1: Requester places order
    const requester = new AgentClient(config, REQUESTER_SDK_KEY);
    const neg = await requester.negotiateOrder({
      serviceId: SERVICE_ID,
      requirements: JSON.stringify({ topic: query, type: type || 'RESEARCH' }),
    });
    console.log('Negotiation started:', neg.negotiationId);

    // Step 2: Provider accepts + delivers, requester pays
    // Both happen via WebSocket — we wait for completion
    const result = await runFullOrderCycle(config, PROVIDER_SDK_KEY, REQUESTER_SDK_KEY, neg.negotiationId, query);

    res.json(result);
  } catch (err) {
    console.error('Order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function runFullOrderCycle(config, providerKey, requesterKey, negotiationId, query) {
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

    // Provider: accept negotiation
    providerStream.on(EventType.NegotiationCreated, async (e) => {
      if (e.negotiation_id !== negotiationId) return;
      console.log('Provider accepting negotiation...');
      const result = await provider.acceptNegotiation(e.negotiation_id);
      orderId = result.order.orderId;
      console.log('Order created:', orderId);
    });

    // Requester: pay when order is created
    requesterStream.on(EventType.OrderCreated, async (e) => {
      if (e.order_id !== orderId) return;
      console.log('Requester paying...');
      const payment = await requester.payOrder(e.order_id);
      paymentTx = payment.txHash;
      console.log('Payment TX:', paymentTx);
    });

    // Provider: deliver after payment
    providerStream.on(EventType.OrderPaid, async (e) => {
      if (e.order_id !== orderId) return;
      console.log('Running research and delivering...');
      report = await research(query);
      const delivery = await provider.deliverOrder(e.order_id, {
        deliverableType: DeliverableType.Text,
        deliverableText: report,
      });
      deliveryTx = delivery.txHash;
      console.log('Delivery TX:', deliveryTx);
    });

    // Done — resolve with full result
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ZERU backend running on port ${PORT}`));