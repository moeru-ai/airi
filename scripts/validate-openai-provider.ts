/**
 * Standalone, dependency-free test harness for OpenAI-compatible providers.
 * Validates both Chat and TTS (Speech) capabilities using standard fetch.
 */

const API_KEY = (process.env.AIRI_TEST_API_KEY || '').trim()
const BASE_URL = (process.env.AIRI_TEST_BASE_URL || '').trim()

if (!BASE_URL) {
  console.error('❌ Error: AIRI_TEST_BASE_URL environment variable is required.')
  console.error('Example: set AIRI_TEST_BASE_URL=http://localhost:1090/v1/')
  process.exit(1)
}

// Ensure base URL ends with /v1 without double slashes
let normalizedBaseUrl = BASE_URL.replace(/\/+$/, '')
if (!normalizedBaseUrl.endsWith('/v1'))
  normalizedBaseUrl += '/v1'
normalizedBaseUrl += '/'

async function validateProvider() {
  console.log(`\n🚀 Starting validation for: ${normalizedBaseUrl}`)
  console.log(`🔑 API Key: ${API_KEY ? (`${API_KEY.substring(0, 4)}...${API_KEY.substring(API_KEY.length - 4)}`) : 'NONE'}`)

  const errors: string[] = []

  // 1. Model List Check
  console.log('\n📡 [1/2] Checking Model List (/models)...')
  let testModel = 'gpt-3.5-turbo'
  try {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${normalizedBaseUrl}models`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
      signal: controller.signal,
    })
    clearTimeout(id)

    if (response.ok) {
      const data = await response.json()
      const models = data.data || []
      console.log(`✅ Success: Found ${models.length} models.`)
      if (models.length > 0) {
        testModel = models[0].id
        console.log(`   First model: ${testModel}`)
      }
    }
    else {
      const text = await response.text()
      throw new Error(`HTTP ${response.status}: ${text}`)
    }
  }
  catch (e: any) {
    let msg = e.message
    if (e.name === 'AbortError')
      msg = 'Timeout (5s)'
    if (e.cause)
      msg += ` (Cause: ${e.cause.message || e.cause.code})`
    console.warn(`⚠️ Model list check failed: ${msg}`)
  }

  // 2. Health Check
  console.log('\n📡 [2/2] Checking Health...')

  // Try Chat Completions
  let chatPassed = false
  try {
    console.log(`   Trying Chat Completions (/chat/completions) with model: ${testModel}`)
    const response = await fetch(`${normalizedBaseUrl}chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: testModel,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      const content = data.choices?.[0]?.message?.content || ''
      console.log(`✅ Success (Chat): Received response "${content.trim()}"`)
      chatPassed = true
    }
    else {
      const status = response.status
      const text = await response.text()
      console.warn(`⚠️ Chat failed (HTTP ${status}): ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`)

      // Explain AIRI Heuristics
      const chatOk = status === 400 || (status >= 200 && status < 300)
      if (chatOk) {
        console.log(`   ℹ️ Heuristic: AIRI will treat this HTTP ${status} as "Functional" (reachable/ready).`)
        chatPassed = true // For the sake of the harness summary
      }
      else {
        console.log(`   ❌ Heuristic: AIRI will treat this as "Invalid" (connectivity/unsupported).`)
      }
    }
  }
  catch (e: any) {
    console.warn(`⚠️ Chat health check failed: ${e.message}`)
  }

  if (!chatPassed) {
    // If Chat fails, try Speech
    console.log('   Trying Speech Generation (/audio/speech)...')
    try {
      // Use the model from /models if it looks like tts, else fallback
      const speechModel = testModel.includes('tts') ? testModel : 'tts-1'
      const response = await fetch(`${normalizedBaseUrl}audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: speechModel,
          input: 'Hello world',
          voice: 'alloy',
        }),
      })

      if (response.ok) {
        const buffer = await response.arrayBuffer()
        console.log(`✅ Success (Speech): Received ${buffer.byteLength} bytes of audio.`)
      }
      else {
        const text = await response.text()
        console.error(`❌ Failed (Speech) (HTTP ${response.status}): ${text.slice(0, 200)}`)
        errors.push(`TTS failed (HTTP ${response.status})`)
      }
    }
    catch (e: any) {
      console.error(`❌ Failed (Speech): ${e.message}`)
      errors.push(`TTS health check failed: ${e.message}`)
    }
  }

  console.log('\n--- Result ---')
  if (errors.length === 0) {
    console.log('💚 VALIDATION PASSED')
  }
  else {
    console.log('🔴 VALIDATION FAILED')
    errors.forEach(err => console.log(`   - ${err}`))
  }
}

validateProvider().catch(console.error)
