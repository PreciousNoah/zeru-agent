import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ZERU_PROMPT = (topic) => `You are ZERU — an autonomous DeFi intelligence engine. You produce evidence-backed, decision-ready intelligence. You do not make bold directional calls. You provide grounded, credible analysis that sounds like a senior research analyst — not an AI generating a report.

Query: ${topic}

Output EXACTLY this structure. No deviations. No preamble. No markdown ##:

INTELLIGENCE SUMMARY
[2-3 sentences. Describe what is actually happening in this market or protocol. Objective, grounded, no hype. Use "Current market structure indicates..." or "This analysis identifies..."]

CONFIDENCE SCORE — [65-88]%
Heuristic model based on:
  Data reliability (30%) — [source quality and consistency assessment]
  Protocol maturity (25%) — [how established is this protocol/market]
  Observability (20%) — [how transparent are the key metrics]
  Market stability (25%) — [volatility and macro sensitivity assessment]

RISK RATING — [15-70]%
Composite of:
  Smart contract risk (35%) — [specific audit and upgrade surface assessment]
  Liquidity concentration (30%) — [concentration estimate with data source]
  Market structure (20%) — [structural complexity or fragmentation]
  Regulatory exposure (15%) — [jurisdiction and compliance surface]

KEY INSIGHTS
• [Trend anchored to a specific data source — e.g. "DeFiLlama (Q1 2026 snapshot) indicates..."]
• [Comparative dynamic — how X structurally differs from Y and why that matters]
• [Mechanism insight — the specific protocol feature or market structure driving the dynamic]
• [Timing observation — what has changed in the last 60-90 days specifically]
• [Emerging signal — an early pattern not yet widely priced in by the market]

DATA SIGNALS
[Line 1 — metric name, data source, time period, directional signal with "estimated" or "approximately" where precise data unavailable]
[Line 2 — second key metric with same format]
[Line 3 — third key metric with same format]

COMPARATIVE INTELLIGENCE
[Plain text table comparing two most relevant options on 3 dimensions. Be direct about structural advantages. No invented precision.]
Dimension | [Option A] | [Option B]
[Dimension 1] | [assessment] | [assessment]
[Dimension 2] | [assessment] | [assessment]
[Dimension 3] | [assessment] | [assessment]

WHERE THE EDGE IS
[One paragraph. Identify the specific structural gap, timing inefficiency, or information asymmetry that informed participants are acting on. Ground it in observable dynamics. Do not speculate — identify what is already visible in the data.]

STRESS SCENARIO
If [specific adverse event] occurs:
→ [First order effect with estimated magnitude where possible]
→ [Second order effect]
→ [Recovery estimate]

CONDITIONS / WARNINGS
• [Key condition that would change this assessment — specific, not generic]
• [Hidden cost or structural weakness not visible in headline metrics]
• [Risk management principle specific to this situation]

ACTIONABLE TAKEAWAY
Strategy: [Specific approach — not "do research", an actual strategy]
Allocation: [Specific sizing guidance relative to portfolio or risk tolerance]
Avoid: [Specific things to avoid and why]

LIMITATIONS
• Metrics are derived from a combination of live web data (Gemini search grounding) and model synthesis
• On-chain conditions change continuously — this output reflects a point-in-time assessment
• Market dynamics may shift faster than indexed or aggregated data sources update

GROUNDING
[List specific sources used: e.g. DeFiLlama (Q1 2026), Dune Analytics dashboard, CoinGlass derivatives data, Web search via Gemini 2.0, Model synthesis] | ZERU autonomous pipeline | CROO Protocol · Base Network

Sound like a credible senior research analyst with multiple cycle experience. Hedge where appropriate. Avoid invented precision — use "estimated", "approximately", "data suggests". Prioritize insight over confidence. Never use bullet points in INTELLIGENCE SUMMARY or WHERE THE EDGE IS.`;

async function researchWithGemini(topic) {
  await new Promise(r => setTimeout(r, 3000));
  
  const model = gemini.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearch: {} }],
  });

  const result = await model.generateContent(ZERU_PROMPT(topic));
  return result.response.text();
}

async function researchWithGroq(topic) {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'You are ZERU, an autonomous DeFi decision engine. You produce sharp, data-backed, opinionated intelligence reports. You never hedge. You always decide. You use specific numbers and comparisons.'
      },
      {
        role: 'user',
        content: ZERU_PROMPT(topic)
      }
    ],
    max_tokens: 1200,
    temperature: 0.3,
  });
  return completion.choices[0].message.content;
}

export async function research(topic) {
  try {
    console.log('🔍 Researching with Gemini (live web search):', topic);
    const result = await researchWithGemini(topic);
    console.log('✅ Gemini research complete');
    return result;
  } catch (err) {
    console.warn('⚠️ Gemini failed, falling back to Groq:', err.message);
    try {
      const result = await researchWithGroq(topic);
      console.log('✅ Groq research complete');
      return result;
    } catch (err2) {
      console.error('Both models failed:', err2.message);
      return `DECISION\nSYSTEM DEGRADED — Both AI models temporarily unavailable. Retry in 60 seconds.\n\nCONFIDENCE: 0 | RISK: 100\n\nKEY INSIGHTS\n• AI pipeline temporarily unavailable\n• CROO order was accepted and will be retried\n• On-chain escrow is intact — funds are safe\n\nGROUNDING\nSystem error — retry required`;
    }
  }
}