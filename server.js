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

const PROVIDER_SDK_KEY  = process.env.CROO_SDK_KEY || 'croo_sk_0f60cb24b03c2d764be09fc0d880b6f0';
const REQUESTER_SDK_KEY = 'croo_sk_bbc6cc1f0c4ab9623a6f5db4369ff5fe';
const STORE_SDK_KEY     = process.env.CROO_STORE_SDK_KEY;
const SERVICE_ID        = 'f8368a2b-7e32-43ca-a298-fbfc94346ec0';
const RENDER_URL        = process.env.RENDER_EXTERNAL_URL || 'https://zeru-agent-iz16.onrender.com';

// ─── HEALTH CHECK ────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    status:      'ZERU agent online',
    network:     'Base',
    protocol:    'CROO v1',
    marketplace: 'agent.croo.network',
    agentId:     '1b301682-55f4-4ca2-8fb6-deff838ab9fe',
    uptime:      process.uptime(),
    endpoints: {
      research: 'GET /research/:projectName',
      analyze:  'POST /analyze',
    },
  });
});

// ─── RESEARCH API ─────────────────────────────────────────────────────
// This is what VERIS calls for A2A composability.
// GET /research/:projectName
// GET /research/:projectName?depth=quick|deep
//
// Returns structured JSON so VERIS (and any other agent) can consume
// ZERU's research without going through a CROO order cycle.

app.get('/research/:projectName', async (req, res) => {
  const projectName = req.params.projectName.trim();
  const depth       = req.query.depth || 'quick'; // quick = summary only, deep = full

  console.log(`\n🔬 ZERU Research API: ${projectName} (depth: ${depth})`);

  try {
    // Run ZERU's existing research pipeline
    const rawReport = await research(projectName);

    // Parse the text report into structured JSON
    const structured = parseResearchReport(rawReport, projectName);

    res.json({
      project:   projectName,
      depth,
      ...structured,
      rawReport: depth === 'deep' ? rawReport : undefined,
      timestamp: new Date().toISOString(),
      source:    'ZERU Research Agent',
      agentId:   '1b301682-55f4-4ca2-8fb6-deff838ab9fe',
    });
  } catch (err) {
    console.error('Research API error:', err.message);
    res.status(500).json({ error: err.message, project: projectName });
  }
});

// Parse ZERU's text report into structured fields VERIS can consume
function parseResearchReport(report, projectName) {
  if (!report) return { summary: null, risks: [], sentiment: 'unknown', sources: [] };

  // Extract summary — first substantive paragraph
  const lines   = report.split('\n').map(l => l.trim()).filter(Boolean);
  const summaryLines = [];
  for (const line of lines) {
    if (line.startsWith('#') || line.startsWith('═') || line.startsWith('─')) continue;
    if (line.length > 60) { summaryLines.push(line); if (summaryLines.length >= 3) break; }
  }
  const summary = summaryLines.join(' ').substring(0, 500) || null;

  // Extract risks — lines containing risk keywords
  const riskKeywords = ['risk', 'concern', 'warning', 'hack', 'exploit', 'vulnerability',
                        'fraud', 'scam', 'regulatory', 'lawsuit', 'SEC', 'CFTC', 'centrali'];
  const risks = lines
    .filter(l => riskKeywords.some(k => l.toLowerCase().includes(k)) && l.length > 20)
    .slice(0, 5)
    .map(l => l.replace(/^[-•*]\s*/, '').trim());

  // Extract competitors — lines containing "vs", "competitor", "alternative", "compared to"
  const competitors = lines
    .filter(l => /\bvs\.?\b|competitor|alternative|compared to/i.test(l) && l.length > 10)
    .slice(0, 3)
    .map(l => l.replace(/^[-•*]\s*/, '').trim());

  // Sentiment — look for positive/negative signal words
  const text = report.toLowerCase();
  const positiveWords = ['strong', 'legitimate', 'trusted', 'audited', 'established', 'leading', 'dominant', 'secure'];
  const negativeWords = ['risk', 'concern', 'hack', 'fraud', 'scam', 'collapse', 'failed', 'lawsuit', 'SEC'];
  const posScore = positiveWords.filter(w => text.includes(w)).length;
  const negScore = negativeWords.filter(w => text.includes(w)).length;
  const sentiment = negScore > posScore + 2 ? 'negative'
                  : posScore > negScore + 2 ? 'positive'
                  : 'neutral';

  // Extract URLs as sources
  const sources = [...report.matchAll(/https?:\/\/[^\s\)\"]+/g)]
    .map(m => m[0])
    .filter(u => !u.includes('...'))
    .slice(0, 10);

  return { summary, risks, competitors, sentiment, sources };
}

// ─── MANUAL QUERY ENDPOINT (from UI / direct calls) ──────────────────
app.post('/analyze', async (req, res) => {
  const { query, type } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });
  try {
    const requester = new AgentClient(config, REQUESTER_SDK_KEY);
    const neg = await requester.negotiateOrder({
      serviceId:    SERVICE_ID,
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

// ─── FULL ORDER CYCLE ────────────────────────────────────────────────
async function runFullOrderCycle(providerKey, requesterKey, negotiationId, query) {
  return new Promise(async (resolve, reject) => {
    const provider  = new AgentClient(config, providerKey);
    const requester = new AgentClient(config, requesterKey);

    const providerStream  = await provider.connectWebSocket();
    const requesterStream = await requester.connectWebSocket();

    let paymentTx = '', deliveryTx = '', orderId = '', report = '';

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
        network:   'Base Mainnet',
        agentId:   '1b301682-55f4-4ca2-8fb6-deff838ab9fe',
        serviceId: SERVICE_ID,
      });
    });
  });
}

// ─── AGENT STORE PROVIDER LISTENER ───────────────────────────────────
let reconnectAttempts = 0;

async function startStoreProvider() {
  if (!STORE_SDK_KEY) {
    console.log('No CROO_STORE_SDK_KEY set — skipping Agent Store listener');
    return;
  }
  try {
    console.log(`Starting Agent Store provider listener... (attempt ${reconnectAttempts + 1})`);
    const storeProvider = new AgentClient(config, STORE_SDK_KEY);
    const storeStream   = await storeProvider.connectWebSocket();
    reconnectAttempts   = 0;
    console.log('✅ Agent Store WebSocket connected');

    storeStream.on(EventType.NegotiationCreated, async (e) => {
      console.log('📨 Agent Store negotiation received:', e.negotiation_id);
      try {
        const result = await storeProvider.acceptNegotiation(e.negotiation_id);
        console.log('✅ Accepted, order:', result.order.orderId);
      } catch (err) { console.error('Accept error:', err.message); }
    });

    storeStream.on(EventType.OrderPaid, async (e) => {
      console.log('💰 Agent Store payment received:', e.order_id);
      try {
        const order        = await storeProvider.getOrder(e.order_id);
        const requirements = JSON.parse(order.requirement || '{}');
        const topic        = requirements.topic || requirements.text || requirements.task
                          || order.requirement || 'DeFi market analysis';
        console.log('🔬 Researching topic:', topic);
        const report   = await research(topic);
        const delivery = await storeProvider.deliverOrder(e.order_id, {
          deliverableType: DeliverableType.Text,
          deliverableText: report,
        });
        console.log('📦 Delivered:', delivery.txHash);
      } catch (err) { console.error('Delivery error:', err.message); }
    });

    storeStream.on(EventType.OrderCompleted, (e) => {
      console.log('🎉 Agent Store order settled:', e.order_id);
    });

    storeStream.on('close', () => {
      reconnectAttempts++;
      const delay = Math.min(5000 * reconnectAttempts, 30000);
      console.log(`Agent Store closed — reconnecting in ${delay / 1000}s`);
      setTimeout(startStoreProvider, delay);
    });

    storeStream.on('error', (err) => console.error('Agent Store WS error:', err.message));
  } catch (err) {
    reconnectAttempts++;
    const delay = Math.min(5000 * reconnectAttempts, 30000);
    console.error(`Agent Store failed: ${err.message} — retrying in ${delay / 1000}s`);
    setTimeout(startStoreProvider, delay);
  }
}

// ─── KEEP-ALIVE ──────────────────────────────────────────────────────
setInterval(async () => {
  try   { await fetch(RENDER_URL); console.log('✅ Keep-alive ping'); }
  catch (e) { console.log('Keep-alive failed:', e.message); }
}, 14 * 60 * 1000);

// ─── START ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`✅ ZERU backend running on port ${PORT}`);
  await startStoreProvider();
});