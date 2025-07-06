# Gemini Code Assist Style Guide

## Suggestions

### Core Requirement

**Always wrap code suggestions in GitHub suggestion blocks** to enable one-click application by maintainers.

### Format

Use GitHub's suggestion syntax for all code recommendations:

```suggestion
// Your suggested code here
```

### Multiple Options

When offering multiple approaches, provide separate labeled suggestion blocks:

**Option A - Performance focused:**

```suggestion
function processItems(items) {
  let result = 0;
  for (const item of items) {
    result += item.value;
  }
  return result;
}
```

**Option B - Functional approach:**

```suggestion
const processItems = (items) =>
  items.reduce((sum, item) => sum + item.value, 0);
```

### That's It

Continue providing your normal comprehensive analysis, explanations, and recommendations. The only change is wrapping code suggestions in suggestion blocks so maintainers can easily apply them.
