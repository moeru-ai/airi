import process from 'node:process'

import { Client } from 'openilink-sdk-node'

const client = new Client('')
client.loginWithQr({
  on_qrcode: (img) => {
    console.info('QR:', img)
    process.exit(0)
  },
}).catch(error => console.error(error))
