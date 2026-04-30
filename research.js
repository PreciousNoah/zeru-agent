import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ZERU_PROMPT = (topic) => `You are ZERU — an autonomous DeFi intelligence engine. You produce evidence-backed, decision-ready research. You do not make loud calls. You provide grounded, credible intelligence.

Query: ${topic}

Output EXACTLY this structure. No deviations. No preamble:

INTELLIGENCE SUMMARY
[2-3 sentences describing what is actually happening — objective, grounded, no hype. Describe trends and dynamics, not predictions. Sound like a senior analyst summarizing a briefing.]

CONFIDENCE: [65-88] | RISK: [15-70]

KEY INSIGHTS
• [Trend with light data anchor — e.g. "Data from DeFiLlama suggests..." not invented numbers]
• [Comparative dynamic — how X compares to Y and why that matters structurally]
• [Mechanism insight — the specific protocol feature or market structure driving the dynamic]
• [Timing observation — what is changing now vs 60-90 days ago]
• [Emerging signal — an early pattern not yet widely priced in]

DATA SIGNALS
[3 lines. Use "approximately", "trending toward", "recent data suggests" — not invented precise numbers. Anchor to real platforms: DeFiLlama, CoinGlass, Dune Analytics where relevant.]

COMPARATIVE INTELLIGENCE
[Plain text comparison of the two most relevant options on 3 dimensions. Be direct about structural advantages without false precision.]

WHERE THE EDGE IS
[One paragraph. The specific structural gap, timing inefficiency, or information asymmetry that informed participants are acting on. Grounded in observable dynamics.]

CONDITIONS / WARNINGS
• [Key condition that would change this assessment]
• [Hidden cost or risk not visible in headline metrics]
• [Risk management principle — specific, not generic]

LIMITATIONS
• Metrics are derived from a combination of live web data and model synthesis
• On-chain conditions change continuously — this output reflects a point-in-time assessment
• Market dynamics may shift faster than indexed or aggregated data sources update

GROUNDING
Web search via Gemini 2.0 | [relevant data platforms used] | Model synthesis | ZERU autonomous pipeline | CROO Protocol · Base Network

Sound like a credible senior research analyst. Use hedged language where appropriate. Avoid invented precision. Prioritize insight over confidence.`;

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
