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

// Track orders by negotiation ID and order ID
const ordersByNegId = new Map(); // negotiationId -> orderData
const ordersByOrdId = new Map(); // orderId -> orderData

// ─── PROVIDER LISTENER ───
async function startProvider() {
  console.log('Starting provider agent...');
  const provider = new AgentClient(config, PROVIDER_SDK_KEY);

  async function connect() {
    try {
      const stream = await provider.connectWebSocket();
      console.log('✅ Provider agent online and listening');

      stream.on(EventType.NegotiationCreated, async (e) => {
        console.log('📨 Negotiation received:', e.negotiation_id);
        try {
          const result = await provider.acceptNegotiation(e.negotiation_id);
          const orderId = result.order.orderId;
          console.log('✅ Accepted, order:', orderId);

          // Link negotiation to order
          const data = ordersByNegId.get(e.negotiation_id);
          if (data) {
            data.orderId = orderId;
            ordersByOrdId.set(orderId, data);
            console.log('🔗 Linked neg', e.negotiation_id, '→ order', orderId);
          } else {
            // Create entry even if requester hasn't registered yet
            const newData = { orderId, negotiationId: e.negotiation_id };
            ordersByOrdId.set(orderId, newData);
            ordersByNegId.set(e.negotiation_id, newData);
          }
        } catch (err) {
          console.error('Accept error:', err.message);
        }
      });

      stream.on(EventType.OrderPaid, async (e) => {
        console.log('💰 Payment confirmed for order:', e.order_id);
        try {
          const data = ordersByOrdId.get(e.order_id);
          const topic = data?.query || 'General DeFi market analysis 2026';
          console.log('🔬 Researching:', topic);

          const report = await research(topic);
          const delivery = await provider.deliverOrder(e.order_id, {
            deliverableType: DeliverableType.Text,
            deliverableText: report,
          });

          console.log('📦 Delivered! TX:', delivery.txHash);

          if (data) {
            data.deliveryTx = delivery.txHash;
            data.report = report;
          }
        } catch (err) {
          console.error('Deliver error:', err.message);
        }
      });

      stream.on(EventType.OrderCompleted, (e) => {
        console.log('🎉 Order completed:', e.order_id);
        const data = ordersByOrdId.get(e.order_id);
        if (data?.resolve) {
          data.resolve({
            orderId: e.order_id,
            paymentTx: data.paymentTx || '',
            deliveryTx: data.deliveryTx || '',
            report: data.report || '',
            network: 'Base Mainnet',
            agentId: '1b301682-55f4-4ca2-8fb6-deff838ab9fe',
            serviceId: SERVICE_ID,
          });
        }
        ordersByOrdId.delete(e.order_id);
      });

      stream.on('close', () => {
        console.log('Provider stream closed, reconnecting in 5s...');
        setTimeout(connect, 5000);
      });

    } catch (err) {
      console.error('Provider connection error:', err.message);
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

  console.log('📥 New query:', query);

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

      // Requester listens for order created then pays
      requesterStream.on(EventType.OrderCreated, async (e) => {
        orderId = e.order_id;
        console.log('📋 Requester sees order created:', orderId);

        // Make sure this order is in our map
        const existing = ordersByOrdId.get(orderId) || ordersByNegId.get(e.negotiation_id);
        if (existing) {
          existing.orderId = orderId;
          existing.resolve = resolve;
          existing.reject = reject;
          existing.query = query;
          ordersByOrdId.set(orderId, existing);
        }

        try {
          console.log('💳 Paying order:', orderId);
          const payment = await requester.payOrder(orderId);
          paymentTx = payment.txHash;
          console.log('✅ Payment TX:', paymentTx);

          const data = ordersByOrdId.get(orderId);
          if (data) data.paymentTx = paymentTx;
        } catch (err) {
          clearTimeout(timeout);
          requesterStream.close();
          reject(err);
        }
      });

      // Requester listens for completion
      requesterStream.on(EventType.OrderCompleted, async (e) => {
        if (orderId && e.order_id !== orderId) return;
        clearTimeout(timeout);
        requesterStream.close();
        console.log('✅ Requester sees order completed:', e.order_id);

        try {
          const delivery = await requester.getDelivery(e.order_id);
          const data = ordersByOrdId.get(e.order_id);
          resolve({
            orderId: e.order_id,
            paymentTx: paymentTx,
            deliveryTx: data?.deliveryTx || '',
            report: delivery.deliverableText || data?.report || '',
            network: 'Base Mainnet',
            agentId: '1b301682-55f4-4ca2-8fb6-deff838ab9fe',
            serviceId: SERVICE_ID,
          });
        } catch (err) {
          reject(err);
        }
      });

      // Place the negotiation AFTER listeners are set up
      console.log('🤝 Placing negotiation...');
      const neg = await requester.negotiateOrder({
        serviceId: SERVICE_ID,
        requirements: JSON.stringify({ topic: query, type: type || 'RESEARCH' }),
      });

      console.log('📝 Negotiation ID:', neg.negotiationId);

      // Register in maps so provider can find it
      const orderData = {
        negotiationId: neg.negotiationId,
        query,
        resolve,
        reject,
      };
      ordersByNegId.set(neg.negotiationId, orderData);

      // If provider already accepted before we registered, link it now
      const existing = ordersByNegId.get(neg.negotiationId);
      if (existing?.orderId) {
        ordersByOrdId.set(existing.orderId, orderData);
      }
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
  await startProvider();
});