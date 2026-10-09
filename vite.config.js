import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { GoogleGenAI } from '@google/genai'

function apiPlugin() {
  return {
    name: 'api-server',
    configureServer(server) {
      server.middlewares.use('/api/chat', (req, res, next) => {
        if (req.method !== 'POST') {
          return next()
        }

        let body = ''
        req.on('data', (chunk) => {
          body += chunk
        })

        req.on('end', async () => {
          try {
            const env = loadEnv(server.config.mode, process.cwd(), '')
            let apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY
            if (apiKey && apiKey.endsWith(';')) {
              apiKey = apiKey.slice(0, -1).trim()
            }

            if (!apiKey) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ error: 'Missing Gemini API key. Please check your .env file.' }))
              return
            }

            const parsedBody = JSON.parse(body || '{}')
            const rawMessages = parsedBody.messages || []
            const model = parsedBody.model || 'gemini-3.8-flash'

            const contents = []
            for (const msg of rawMessages) {
              if (msg.role === 'system') continue
              contents.push({
                role: msg.role === 'assistant' || msg.role === 'model' ? 'model' : 'user',
                parts: [{ text: msg.content || msg.text || '' }],
              })
            }

            if (contents.length === 0 && parsedBody.prompt) {
              contents.push({
                role: 'user',
                parts: [{ text: parsedBody.prompt }],
              })
            }

            const ai = new GoogleGenAI({ apiKey })
            const response = await ai.models.generateContent({
              model,
              contents,
              config: {
                systemInstruction: 'You are a helpful, knowledgeable, and polite AI assistant.',
              },
            })

            const content = response.text || 'No response generated.'
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ message: content }))
          } catch (err) {
            console.error('Gemini API Middleware Error:', err)
            res.writeHead(err.status || 500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiPlugin()],
})

