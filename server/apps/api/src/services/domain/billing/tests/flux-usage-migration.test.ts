import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { expect, it } from 'vitest'

it('migrates historical billing evidence without repricing or changing wallet balances', async () => {
  const client = new PGlite()
  try {
    const migrations = readMigrationFiles({ migrationsFolder: fileURLToPath(new URL('../../../../../drizzle', import.meta.url)) })
    for (const migration of migrations.slice(0, -1)) {
      for (const statement of migration.sql)
        await client.exec(statement)
    }
    await client.exec(`
      INSERT INTO user_flux (user_id, flux) VALUES ('historical', 7);
      INSERT INTO llm_request_settlement
        (id, user_id, request_id, model, method, billing_status, requested_flux, charged_flux, cost_usd)
        VALUES ('receipt', 'historical', 'request', 'model', 'provider_cost', 'settled', 3, 2, '0.0012');
      INSERT INTO flux_transaction
        (id, user_id, type, amount, balance_before, balance_after, description, settlement_id)
        VALUES ('debit', 'historical', 'debit', 2, 9, 7, 'llm_request', 'receipt');
    `)
    for (const statement of migrations.at(-1)!.sql)
      await client.exec(statement)
    const wallet = await client.query('SELECT flux, unsettled_micro_flux FROM user_flux')
    expect(wallet.rows).toEqual([{ flux: 7, unsettled_micro_flux: 0 }])
    const usage = await client.query('SELECT service, precision, cost_micro_flux, wallet_debit_flux, cost_usd FROM flux_usage')
    expect(usage.rows).toEqual([{ service: 'llm', precision: 'whole_flux', cost_micro_flux: 3_000_000, wallet_debit_flux: 2, cost_usd: '0.0012' }])
    const ledger = await client.query('SELECT usage_id, amount, balance_after FROM flux_transaction')
    expect(ledger.rows).toEqual([{ usage_id: 'receipt', amount: 2, balance_after: 7 }])
    await expect(client.exec('UPDATE user_flux SET unsettled_micro_flux = -1')).rejects.toThrow()
    await expect(client.exec('UPDATE flux_usage SET cost_micro_flux = -1')).rejects.toThrow()
  }
  finally {
    await client.close()
  }
})
