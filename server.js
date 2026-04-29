import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { AgentClient, UserClient, PrivateKeySigner, EventType, DeliverableType } from '@croo-network/sdk';
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

// Track active orders
const pendingOrders = new Map();

// ─── START PROVIDER LISTENER ON BOOT ───
async function startProvider() {
  console.log('Starting provider agent...');
  const provider = new AgentClient(config, PROVIDER_SDK_KEY);

  let providerStream;

  async function connect() {
    try {
      providerStream = await provider.connectWebSocket();
      console.log('✅ Provider agent online and listening for orders');

      providerStream.on(EventType.NegotiationCreated, async (e) => {
        console.log('📨 Negotiation received:', e.negotiation_id);
        try {
          const result = await provider.acceptNegotiation(e.negotiation_id);
          const orderId = result.order.orderId;
          console.log('✅ Negotiation accepted, order:', orderId);

          // Store negotiation → order mapping
          if (pendingOrders.has(e.negotiation_id)) {
            const pending = pendingOrders.get(e.negotiation_id);
            pending.orderId = orderId;
            pendingOrders.set(orderId, pending);
          }
        } catch (err) {
          console.error('Accept error:', err.message);
        }
      });

      providerStream.on(EventType.OrderPaid, async (e) => {
        console.log('💰 Payment received for order:', e.order_id);
        try {
          const pending = pendingOrders.get(e.order_id);
          const topic = pending?.query || 'General DeFi market analysis';

          console.log('🔬 Researching topic:', topic);
          const report = await research(topic);

          const delivery = await provider.deliverOrder(e.order_id, {
            deliverableType: DeliverableType.Text,
            deliverableText: report,
          });

          console.log('📦 Delivered! TX:', delivery.txHash);

          if (pending) {
            pending.deliveryTx = delivery.txHash;
            pending.report = report;
          }
        } catch (err) {
          console.error('Deliver error:', err.message);
        }
      });

      providerStream.on(EventType.OrderCompleted, (e) => {
        console.log('🎉 Order completed:', e.order_id);
        const pending = pendingOrders.get(e.order_id);
        if (pending?.resolve) {
          pending.resolve({
            orderId: e.order_id,
            paymentTx: pending.paymentTx,
            deliveryTx: pending.deliveryTx,
            report: pending.report,
          });
        }
        pendingOrders.delete(e.order_id);
      });

    } catch (err) {
      console.error('Provider connection error:', err.message);
      console.log('Retrying in 5s...');
      setTimeout(connect, 5000);
    }
  }

  await connect();
}

// ─── HEALTH CHECK ───
app.get('/', (req, res) => {
  res.json({ status: 'ZERU agent online', network: 'Base', protocol: 'CROO v1' });
});

// ─── ANALYZE ENDPOINT ───
app.post('/analyze', async (req, res) => {
  const { query, type } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });

  console.log('New analysis request:', query);

  try {
    const requester = new AgentClient(config, REQUESTER_SDK_KEY);
    const requesterStream = await requester.connectWebSocket();

    const result = await new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        requesterStream.close();
        reject(new Error('Order timed out after 120s'));
      }, 120000);

      let orderId = '';
      let paymentTx = '';

      // Requester: pay when order is created
      requesterStream.on(EventType.OrderCreated, async (e) => {
        orderId = e.order_id;
        console.log('📋 Order created, paying:', orderId);
        try {
          const payment = await requester.payOrder(orderId);
          paymentTx = payment.txHash;
          console.log('💳 Payment TX:', paymentTx);

          // Update pending order with payment info
          const pending = pendingOrders.get(orderId);
          if (pending) pending.paymentTx = paymentTx;
        } catch (err) {
          clearTimeout(timeout);
          requesterStream.close();
          reject(err);
        }
      });

      // Requester: order completed
      requesterStream.on(EventType.OrderCompleted, async (e) => {
        if (e.order_id !== orderId) return;
        clearTimeout(timeout);
        requesterStream.close();

        // Get delivery details
        try {
          const delivery = await requester.getDelivery(orderId);
          const pending = pendingOrders.get(orderId);
          resolve({
            orderId,
            paymentTx,
            deliveryTx: pending?.deliveryTx || '',
            report: delivery.deliverableText || pending?.report || '',
            network: 'Base Mainnet',
            agentId: '1b301682-55f4-4ca2-8fb6-deff838ab9fe',
            serviceId: SERVICE_ID,
          });
        } catch (err) {
          reject(err);
        }
      });

      // Place the negotiation
      const neg = await requester.negotiateOrder({
        serviceId: SERVICE_ID,
        requirements: JSON.stringify({ topic: query, type: type || 'RESEARCH' }),
      });

      console.log('🤝 Negotiation started:', neg.negotiationId);

      // Register in pending orders so provider can find it
      pendingOrders.set(neg.negotiationId, {
        negotiationId: neg.negotiationId,
        query,
        resolve,
        reject,
      });
    });

    res.json(result);
  } catch (err) {
    console.error('Order error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── START ───
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`ZERU backend running on port ${PORT}`);
  await startProvider(); // Start provider listener immediately
});