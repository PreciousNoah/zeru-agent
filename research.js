import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function researchWithGemini(topic) {
  await new Promise(r => setTimeout(r, 8000));
  const model = gemini.getGenerativeModel({
    model: 'gemini-2.0-flash',
    tools: [{ googleSearch: {} }],
  });

  const prompt = `
You are a professional research analyst. Research the following topic thoroughly using current web data:

Topic: ${topic}

Provide a structured research report with:
1. Executive Summary (2-3 sentences)
2. Key Findings (3-5 bullet points with current data)
3. Current Market/Industry State
4. Key Players or Developments
5. Implications & Outlook

Be specific, cite recent data where possible, and keep it concise but substantive.
  `;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

async function researchWithGroq(topic) {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      {
        role: 'system',
        content: 'You are a professional research analyst. Provide structured, concise, and insightful research reports.'
      },
      {
        role: 'user',
        content: `Research this topic and provide a structured report with executive summary, key findings, current state, key players, and outlook: ${topic}`
      }
    ],
    max_tokens: 1024,
  });
  return completion.choices[0].message.content;
}

export async function research(topic) {
  try {
    console.log('🔍 Researching with Gemini (web search):', topic);
    const result = await researchWithGemini(topic);
    console.log('✅ Gemini research complete');
    return result;
  } catch (err) {
    console.warn('⚠️ Gemini failed, falling back to Groq:', err.message);
    const result = await researchWithGroq(topic);
    console.log('✅ Groq research complete');
    return result;
  }
}