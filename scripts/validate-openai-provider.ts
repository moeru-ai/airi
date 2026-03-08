import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { message } from '@xsai/utils-chat'

const API_KEY = process.env.AIRI_TEST_API_KEY || ''
const BASE_URL = process.env.AIRI_TEST_BASE_URL || ''

if (!API_KEY || !BASE_URL) {
  console.error('❌ Error: AIRI_TEST_API_KEY and AIRI_TEST_BASE_URL environment variables are required.')
  process.exit(1)
}

async function validateProvider() {
  console.log(`\n🚀 Starting validation for: ${BASE_URL}`)
  console.log(`🔑 API Key: ${API_KEY.substring(0, 4)}...${API_KEY.substring(API_KEY.length - 4)}`)

  const errors: string[] = []

  // 1. Model List Check
  console.log('\n📡 [1/2] Checking Model List...')
  try {
    const models = await listModels({
      apiKey: API_KEY,
      baseURL: BASE_URL,
    })
    console.log(`✅ Success: Found ${models.length} models.`)
    if (models.length > 0) {
      console.log(`   First model: ${models[0].id}`)
    }
    else {
      errors.push('Model list is empty')
    }
  }
  catch (e: any) {
    console.error(`❌ Failed: ${e.message}`)
    errors.push(`Model list check failed: ${e.message}`)
  }

  // 2. Health Check (Text Generation)
  console.log('\n📡 [2/2] Checking Health (Text Generation)...')
  try {
    // Attempt to auto-detect a model or use a fallback
    let testModel = 'gpt-3.5-turbo' // common fallback
    try {
      const models = await listModels({ apiKey: API_KEY, baseURL: BASE_URL })
      if (models.length > 0)
        testModel = models[0].id
    }
    catch {}

    console.log(`   Targeting model: ${testModel}`)

    const response = await generateText({
      apiKey: API_KEY,
      baseURL: BASE_URL,
      model: testModel,
      messages: message.messages(message.user('ping')),
      max_tokens: 5,
    })
    console.log(`✅ Success: Received response.`)
    console.log(`   Response: "${response.text.trim()}"`)
  }
  catch (e: any) {
    console.error(`❌ Failed: ${e.message}`)
    errors.push(`Health check failed: ${e.message}`)
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

// Run in a loop to catch intermittent issues
const ITERATIONS = Number.parseInt(process.env.AIRI_TEST_ITERATIONS || '1')
const DELAY = Number.parseInt(process.env.AIRI_TEST_DELAY || '0')

async function run() {
  for (let i = 0; i < ITERATIONS; i++) {
    if (ITERATIONS > 1)
      console.log(`\n🔄 Iteration ${i + 1}/${ITERATIONS}`)
    await validateProvider()
    if (i < ITERATIONS - 1 && DELAY > 0) {
      console.log(`\n😴 Waiting ${DELAY}ms...`)
      await new Promise(resolve => setTimeout(resolve, DELAY))
    }
  }
}

run().catch(console.error)
