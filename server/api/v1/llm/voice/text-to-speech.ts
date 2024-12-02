// import { ElevenLabsClient } from 'elevenlabs'

// export default defineEventHandler(async (event) => {
//   const body = await readBody<{ text: string, apiKey: string }>(event)
//   const client = new ElevenLabsClient({
//     apiKey: body.apiKey,
//   })

//   const res = await client.generate({
//     // voice: 'ShanShan',
//     // Quite good for English
//     voice: 'Myriam',
//     // Beatrice is not 'childish' like the others
//     // voice: 'Beatrice',
//     text: body.text,
//     stream: true,
//     model_id: 'eleven_multilingual_v2',
//     voice_settings: {
//       stability: 0.4,
//       similarity_boost: 0.5,
//     },
//   })

//   // Set headers for streaming
//   event.node.res.setHeader('Content-Type', 'audio/mpeg')
//   event.node.res.setHeader('Transfer-Encoding', 'chunked')

//   // res is NodeJS.ReadableStream
//   return sendStream(event, res)
// })
