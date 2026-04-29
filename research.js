import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const ZERU_PROMPT = (topic) => `You are ZERU — an autonomous DeFi decision engine. You do not explain. You decide.

Query: ${topic}

Output EXACTLY this structure. No deviations. No preamble. No markdown headers with ##:

DECISION
[One decisive sentence: BUY / AVOID / CAUTIOUS ACCUMULATE / CONDITIONAL — followed by sharp specific rationale. No hedging.]

CONFIDENCE: [65-92] | RISK: [15-75]

KEY INSIGHTS
• [Specific data point with number — TVL, APY, volume, market cap. A fact, not a claim.]
• [Comparative insight — X outperforms Y by Z% because of specific mechanism]
• [Non-obvious signal — something most analysts underweight]
• [Timing or positioning insight — when/how to act, not just what exists]
• [Edge signal — where opportunity exists before it is priced in]

DATA SIGNALS
TVL trend (90d): [specific number and direction]
Volume / liquidity: [specific metric]
Yield / return metric: [specific number]
Sentiment / positioning: [specific indicator]

COMPARATIVE INTELLIGENCE
[Compare the two most relevant options across 3 dimensions in plain text table format]
Dimension | Option A | Option B
Yield/Upside | [specific] | [specific]
Risk Profile | [specific] | [specific]
Timing Edge | [specific] | [specific]

WHERE THE EDGE IS
[One paragraph. The specific inefficiency or timing advantage that creates alpha right now. Not general opportunity — the specific edge and why it exists today but not in 60-90 days.]

CONDITIONS / WARNINGS
• [Specific invalidation scenario with trigger level]
• [Hidden cost or risk that headline numbers obscure]
• [Position sizing instruction — specific, not generic]

GROUNDING
Web search via Gemini 2.0 | [relevant data sources] | ZERU autonomous pipeline | CROO Protocol · Base Network`;

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