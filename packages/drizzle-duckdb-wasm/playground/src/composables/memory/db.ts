import { buildDSN } from '../../../../src/dsn'
import { drizzle } from '../../../../src/index'
import * as schema from '../../../db/schema'

export async function connectToDatabase() {
  return drizzle(buildDSN({
    scheme: 'duckdb-wasm:',
    bundles: 'import-url',
    logger: true,
  }), { schema })
}

export async function createSchema(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS currentscores (
      storyid VARCHAR,
      score DOUBLE,
      lastupdate TIMESTAMP,
      last_retrieved_at TIMESTAMP,
      retrieval_count INTEGER DEFAULT 0
    )
  `)
}

export async function loadSampleData(db) {
  const now = new Date()
  const sampleData = []

  for (let i = 1; i <= 20; i++) {
    const daysAgo = Math.random() * 60
    const lastUpdate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000))
    const retrievalCount = Math.floor(Math.random() * 10)
    let retrievalDaysAgo = retrievalCount > 0 ? Math.random() * daysAgo * (1 - retrievalCount / 15) : daysAgo
    retrievalDaysAgo = Math.max(0, retrievalDaysAgo)
    const lastRetrievedAt = new Date(now.getTime() - (retrievalDaysAgo * 24 * 60 * 60 * 1000))
    const score = Math.floor(Math.random() * 900) + 100

    sampleData.push({
      storyid: `story-${i}`,
      score,
      lastupdate: lastUpdate.toISOString(),
      last_retrieved_at: lastRetrievedAt.toISOString(),
      retrieval_count: retrievalCount,
    })
  }

  for (const item of sampleData) {
    await db.execute(`
      INSERT INTO currentscores (storyid, score, lastupdate, last_retrieved_at, retrieval_count)
      VALUES ('${item.storyid}', ${item.score}, '${item.lastupdate}', '${item.last_retrieved_at}', ${item.retrieval_count})
    `)
  }
}

export async function generateDecayQuery(db, {
  simulatedTimeOffset,
  decayRate,
  timeUnitInSeconds,
  longTermMemoryEnabled,
  longTermMemoryThreshold,
  longTermMemoryStability,
  retrievalBoost,
  retrievalDecaySlowdown,
}) {
  const simulatedTimestamp = `(CAST(now() AS TIMESTAMP) + INTERVAL '${simulatedTimeOffset} seconds')`

  const ltmFactorClause = longTermMemoryEnabled
    ? `
      CASE
        WHEN retrieval_count >= ${longTermMemoryThreshold}
        THEN 1.0 - ((${longTermMemoryStability}) ^ (retrieval_count / ${longTermMemoryThreshold}))
        ELSE 0
      END AS ltm_factor,
    `
    : ''

  const ltmDecayModifier = longTermMemoryEnabled
    ? `* (1 - ltm_factor)`
    : ''

  const query = `
  SELECT
    storyid,
    score,
    lastupdate,
    last_retrieved_at,
    retrieval_count,
    CAST(lastupdate AS VARCHAR) as lastupdate_str,
    CAST(last_retrieved_at AS VARCHAR) as last_retrieved_str,
    (EXTRACT(EPOCH FROM (${simulatedTimestamp} - lastupdate))) as age_in_seconds,
    (EXTRACT(EPOCH FROM (${simulatedTimestamp} - last_retrieved_at))) as time_since_retrieval,
    ${ltmFactorClause}
    score *
      exp(-${decayRate} * (EXTRACT(EPOCH FROM (${simulatedTimestamp} - lastupdate)))/(${timeUnitInSeconds}) ${ltmDecayModifier}) *
      (1 + (retrieval_count * ${retrievalBoost} *
            exp(-${decayRate * retrievalDecaySlowdown} *
                (EXTRACT(EPOCH FROM (${simulatedTimestamp} - last_retrieved_at)))/(${timeUnitInSeconds}))))
    as decayed_score
  FROM currentscores
  ORDER BY decayed_score DESC
  `

  return query
}

export async function simulateRetrieval(db, storyId, simulatedTime) {
  const simulatedTimestamp = simulatedTime.toISOString()

  await db.execute(`
    UPDATE currentscores
    SET last_retrieved_at = '${simulatedTimestamp}',
        retrieval_count = retrieval_count + 1
    WHERE storyid = '${storyId}'
  `)
}
