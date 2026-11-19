import { fileURLToPath } from 'node:url'

import { PGlite } from '@electric-sql/pglite'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { expect, it } from 'vitest'

it('adds usage storage, then drops the settlement archive and request-log Flux column, without touching wallets or ledger rows', async () => {
  const client = new PGlite()
  try {
    const migrations = readMigrationFiles({ migrationsFolder: fileURLToPath(new URL('../../../../../drizzle', import.meta.url)) })
    // Later migrations must not move this test, so it finds its migrations by content.
    const usage = migrations.findIndex(migration => migration.sql.some(statement => statement.includes('CREATE TABLE "flux_usage"')))
    for (const migration of migrations.slice(0, usage)) {
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
    for (const statement of migrations[usage]!.sql)
      await client.exec(statement)
    expect((await client.query('SELECT flux, unsettled_micro_flux FROM user_flux')).rows).toEqual([{ flux: 7, unsettled_micro_flux: 0 }])
    expect((await client.query('SELECT billing_status, requested_flux, charged_flux, cost_usd FROM llm_request_settlement')).rows).toEqual([{ billing_status: 'settled', requested_flux: 3, charged_flux: 2, cost_usd: '0.0012' }])
    expect((await client.query('SELECT settlement_id, amount, balance_after FROM flux_transaction')).rows).toEqual([{ settlement_id: 'receipt', amount: 2, balance_after: 7 }])
    expect((await client.query('SELECT count(*)::int AS total FROM flux_usage')).rows).toEqual([{ total: 0 }])
    await client.exec('INSERT INTO flux_usage (id,user_id,source_type,source_id,amount_micro_flux) VALUES (\'usage\',\'historical\',\'llm\',\'request\',0)')
    await expect(client.exec('INSERT INTO flux_usage (id,user_id,source_type,source_id,amount_micro_flux) VALUES (\'duplicate\',\'historical\',\'llm\',\'request\',1)')).rejects.toThrow()
    await expect(client.exec('INSERT INTO flux_usage (id,user_id,source_type,source_id,amount_micro_flux) VALUES (\'negative\',\'historical\',\'llm\',\'other\',-1)')).rejects.toThrow()
    await expect(client.exec('UPDATE user_flux SET unsettled_micro_flux = -1')).rejects.toThrow()
    for (const migration of migrations.slice(usage + 1, usage + 3)) {
      for (const statement of migration.sql)
        await client.exec(statement)
    }
    await expect(client.query('SELECT 1 FROM llm_request_settlement')).rejects.toThrow()
    await expect(client.query('SELECT flux_consumed FROM llm_request_log')).rejects.toThrow()
    expect((await client.query('SELECT flux, unsettled_micro_flux FROM user_flux')).rows).toEqual([{ flux: 7, unsettled_micro_flux: 0 }])
    expect((await client.query('SELECT settlement_id, amount, balance_after FROM flux_transaction')).rows).toEqual([{ settlement_id: 'receipt', amount: 2, balance_after: 7 }])
  }
  finally {
    await client.close()
  }
})
