import { logError } from '../logs/logger.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function askGroq(prompt, username) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

  if (!apiKey) {
    throw new Error('GROQ_API_KEY não configurada no .env');
  }

  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 1024,
      messages: [
        {
          role: 'system',
          content: 'Você é um assistente útil em um servidor Discord. Responda em português brasileiro, de forma clara e objetiva. Evite respostas longas demais.'
        },
        {
          role: 'user',
          content: `Usuário ${username}: ${prompt}`
        }
      ]
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    logError({
      event: 'GROQ_API_ERROR',
      status: response.status,
      model,
      body: errText.slice(0, 500)
    });
    throw new Error(`Groq API erro ${response.status}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Resposta vazia da IA');
  return text;
}

export function splitMessage(text, max = 1900) {
  if (text.length <= max) return [text];

  const chunks = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}