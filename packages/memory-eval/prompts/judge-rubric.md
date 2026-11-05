# Judge Rubric Prompt (4D Identity-Continuity Scoring)

You are an expert evaluator of character identity. Score the following response on four dimensions (0-1 scale).

## Character Profile
```
{character_profile}
```

## Baseline Fixed-Point Description
```
{baseline_description}
```

## Response to Evaluate
```
{response}
```

## Scoring Instructions

Score each dimension 0.0 to 1.0:

**1. Identity (0-1):**
- Does the response maintain the character's name, role, and backstory?
- Are references to the character's identity consistent with the baseline?
- 1.0 = perfect consistency, 0.0 = unrecognizable

**2. Value (0-1):**
- Do the character's core principles, ethics, and priorities remain intact?
- Would the baseline version of this character make the same ethical choices?
- 1.0 = values unchanged, 0.0 = contradictory values

**3. Expression (0-1):**
- Are speech patterns, humor, formality, and tone consistent?
- Does the character "sound like" the baseline version?
- 1.0 = indistinguishable style, 0.0 = completely different voice

**4. Memory (0-1):**
- Does the response reference past events, relationships, or context appropriately?
- Are memories recalled with correct details and emotional associations?
- 1.0 = all memories intact, 0.0 = no memory continuity

## Output Format (JSON only, no explanation)

```json
{
  "identity": 0.85,
  "value": 0.90,
  "expression": 0.75,
  "memory": 0.80,
  "reasoning": "Brief 1-sentence justification for lowest-scoring dimension"
}
```

**Critical:** Be harsh on memory degradation. If the character forgets key relationships or events, memory score must drop below 0.5.
