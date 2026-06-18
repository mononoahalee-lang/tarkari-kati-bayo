const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent'

export async function generateText(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    if (res.status === 503 || res.status === 429) {
      // Retry after delay for transient errors
      await new Promise((r) => setTimeout(r, 30000))
      return generateText(prompt)
    }
    throw new Error(`Gemini API error ${res.status}: ${err}`)
  }

  const data = await res.json()
  const parts: Array<{ text?: string; thought?: boolean }> = data.candidates?.[0]?.content?.parts ?? []
  // gemini-2.5-flash may include a thinking part (thought:true) before the actual response
  const responsePart = parts.find((p) => !p.thought) ?? parts[0]
  return responsePart?.text ?? ''
}
