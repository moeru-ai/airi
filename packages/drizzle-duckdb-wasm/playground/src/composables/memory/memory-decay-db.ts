import { buildDSN } from '../../../../src/dsn'
import { drizzle } from '../../../../src/index'
import * as schema from '../../../db/schema'

export async function connectToDatabase() {
  return drizzle(buildDSN({
    scheme: 'duckdb-wasm:',
    bundles: 'import-url',
    logger: false,
  }), { schema })
}

export async function createSchema(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS memories_decay_test_table (
      id VARCHAR,
      score DOUBLE,
      updated_at TIMESTAMP,
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
      id: `story-${i}`,
      score,
      updated_at: lastUpdate.toISOString(),
      last_retrieved_at: lastRetrievedAt.toISOString(),
      retrieval_count: retrievalCount,
    })
  }

  for (const item of sampleData) {
    await db.execute(`
      INSERT INTO memories_decay_test_table (id, score, updated_at, last_retrieved_at, retrieval_count)
      VALUES ('${item.id}', ${item.score}, '${item.updated_at}', '${item.last_retrieved_at}', ${item.retrieval_count})
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
    id,
    score,
    updated_at,
    last_retrieved_at,
    retrieval_count,
    CAST(updated_at AS VARCHAR) as updated_at_str,
    CAST(last_retrieved_at AS VARCHAR) as last_retrieved_str,
    (EXTRACT(EPOCH FROM (${simulatedTimestamp} - updated_at))) as age_in_seconds,
    (EXTRACT(EPOCH FROM (${simulatedTimestamp} - last_retrieved_at))) as time_since_retrieval,
    ${ltmFactorClause}
    score *
      exp(-${decayRate} * (EXTRACT(EPOCH FROM (${simulatedTimestamp} - updated_at)))/(${timeUnitInSeconds}) ${ltmDecayModifier}) *
      (1 + (retrieval_count * ${retrievalBoost} *
            exp(-${decayRate * retrievalDecaySlowdown} *
                (EXTRACT(EPOCH FROM (${simulatedTimestamp} - last_retrieved_at)))/(${timeUnitInSeconds}))))
    as decayed_score
  FROM memories_decay_test_table
  ORDER BY decayed_score DESC
  `

  return query
}

export async function simulateRetrieval(db, storyId, simulatedTime) {
  const simulatedTimestamp = simulatedTime.toISOString()

  await db.execute(`
    UPDATE memories_decay_test_table
    SET last_retrieved_at = '${simulatedTimestamp}',
        retrieval_count = retrieval_count + 1
    WHERE id = '${storyId}'
  `)
}

export async function generateEmotionalDecayQuery(db, {
  simulatedTimeOffset,
  decayRate,
  timeUnitInSeconds,
  longTermMemoryEnabled,
  longTermMemoryThreshold,
  longTermMemoryStability,
  retrievalBoost,
  retrievalDecaySlowdown,
  joyBoostFactor,
  joyDecaySteepness,
  aversionSpikeFactor,
  aversionStability,
  randomRecallProbability,
  flashbackIntensity,
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

  // New emotional memory components
  const emotionalComponents = `
    -- Random recall probability (flashback effect)
    (CASE WHEN RANDOM() < ${randomRecallProbability} THEN ${flashbackIntensity} ELSE 1 END) *

    -- Joy/euphoria boost with steep decay
    (1 + (joy_score * ${joyBoostFactor} * EXP(-${joyDecaySteepness} *
          (EXTRACT(EPOCH FROM (${simulatedTimestamp} - last_retrieved_at)))/(${timeUnitInSeconds})))) *

    -- Aversion spike for traumatic memories
    (1 + (aversion_score * ${aversionSpikeFactor} *
          POWER(${aversionStability}, CEIL((retrieval_count / 5)))))
  `

  const query = `
  SELECT
    id,
    score,
    updated_at,
    last_retrieved_at,
    retrieval_count,
    joy_score,
    aversion_score,
    CAST(updated_at AS VARCHAR) as updated_at_str,
    CAST(last_retrieved_at AS VARCHAR) as last_retrieved_str,
    (EXTRACT(EPOCH FROM (${simulatedTimestamp} - updated_at))) as age_in_seconds,
    (EXTRACT(EPOCH FROM (${simulatedTimestamp} - last_retrieved_at))) as time_since_retrieval,
    ${ltmFactorClause}
    score *
      exp(-${decayRate} * (EXTRACT(EPOCH FROM (${simulatedTimestamp} - updated_at)))/(${timeUnitInSeconds}) ${ltmDecayModifier}) *
      (1 + (retrieval_count * ${retrievalBoost} *
            exp(-${decayRate * retrievalDecaySlowdown} *
                (EXTRACT(EPOCH FROM (${simulatedTimestamp} - last_retrieved_at)))/(${timeUnitInSeconds})))) *
      ${emotionalComponents} as decayed_score
  FROM emotional_memories_test_table
  ORDER BY decayed_score DESC
  `

  return query
}

export async function createEmotionalSchema(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS emotional_memories_test_table (
      id VARCHAR,
      score DOUBLE,
      updated_at TIMESTAMP,
      last_retrieved_at TIMESTAMP,
      retrieval_count INTEGER DEFAULT 0,
      joy_score DOUBLE DEFAULT 0,
      aversion_score DOUBLE DEFAULT 0
    )
  `)
}

export async function loadEmotionalSampleData(db) {
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

    // Generate emotional scores
    const joyScore = Math.random() * (i % 3 === 0 ? 0.8 : 0.3)
    const aversionScore = Math.random() * (i % 4 === 0 ? 0.7 : 0.2)

    sampleData.push({
      id: `memory-${i}`,
      score,
      updated_at: lastUpdate.toISOString(),
      last_retrieved_at: lastRetrievedAt.toISOString(),
      retrieval_count: retrievalCount,
      joy_score: joyScore.toFixed(2),
      aversion_score: aversionScore.toFixed(2),
    })
  }

  for (const item of sampleData) {
    await db.execute(`
      INSERT INTO emotional_memories_test_table
      (id, score, updated_at, last_retrieved_at, retrieval_count, joy_score, aversion_score)
      VALUES
      ('${item.id}', ${item.score}, '${item.updated_at}', '${item.last_retrieved_at}',
       ${item.retrieval_count}, ${item.joy_score}, ${item.aversion_score})
    `)
  }
}

export async function simulateEmotionalRetrieval(db, memoryId, simulatedTime, { joyModifier = 0, aversionModifier = 0 }) {
  const simulatedTimestamp = simulatedTime.toISOString()

  await db.execute(`
    UPDATE emotional_memories_test_table
    SET last_retrieved_at = '${simulatedTimestamp}',
        retrieval_count = retrieval_count + 1,
        joy_score = CASE
          WHEN joy_score + ${joyModifier} < 0 THEN 0
          WHEN joy_score + ${joyModifier} > 1 THEN 1
          ELSE joy_score + ${joyModifier}
        END,
        aversion_score = CASE
          WHEN aversion_score + ${aversionModifier} < 0 THEN 0
          WHEN aversion_score + ${aversionModifier} > 1 THEN 1
          ELSE aversion_score + ${aversionModifier}
        END
    WHERE id = '${memoryId}'
  `)
}
