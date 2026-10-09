import http from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { GoogleGenAI } from '@google/genai'

// Load environment variables from .env
if (existsSync('.env')) {
  const envContent = readFileSync('.env', 'utf-8')
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if (val.endsWith(';')) val = val.slice(0, -1).trim()
      process.env[key] = val
    }
  }
}

const PORT = process.env.PORT || 3001
let apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY
if (apiKey && apiKey.endsWith(';')) {
  apiKey = apiKey.slice(0, -1).trim()
}

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    return res.end()
  }

  if (req.url === '/api/chat' && req.method === 'POST') {
    if (!ai) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'Missing GEMINI_API_KEY in .env' }))
    }

    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })

    req.on('end', async () => {
      try {
        const { messages = [], model = 'gemini-3.8-flash', prompt } = JSON.parse(body || '{}')
        const contents = []
        for (const msg of messages) {
          if (msg.role === 'system') continue
          contents.push({
            role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
            parts: [{ text: msg.content || msg.text || '' }],
          })
        }
        if (contents.length === 0 && prompt) {
          contents.push({ role: 'user', parts: [{ text: prompt }] })
        }

        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: 'You are a helpful, knowledgeable, and polite AI assistant.',
          },
        })

        const reply = response.text || 'No response generated.'
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: reply }))
      } catch (err) {
        console.error('Gemini Server error:', err)
        res.writeHead(err.status || 500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: err.message || 'Server error' }))
      }
    })
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not Found' }))
})

server.listen(PORT, () => {
  console.log(`Gemini Chatbot backend server running on http://localhost:${PORT}`)
})
