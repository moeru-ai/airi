---
title: Configure web search
description: Use Tavily to let AIRI search for the latest in conversations
---

Web Search lets AIRI query the Internet when it needs the latest material or unfamiliar information. It uses your own Tavily API Key; when enabled, AIRI will invoke the search tool itself in the appropriate conversation and include the actual source link used in the answer.

## Prerequisites

- AIRI is installed and started.
- Already have a Tavily account and create an API Key from the [Tavily](https://tavily.com/) console.
- Configured chat providers and models that can be called using the tool. If AIRI cannot use the tool, please first change to a model that supports tool calling.

::: warning API Key Security
Tavily API Key should only be saved on the current device. Do not submit to the repository, send to others, or include in character cards, journals, and screenshots. If you suspect a key has been compromised, immediately revoke it and create a new key in the Tavily console.
:::

## Configuration steps

1. Open **Settings → Body Module → Network Search**.
2. Turn on "Enable web search".
3. Paste the API Key in "Tavily API Key".
4. When "Web search is ready" appears, you can return to the chat; the settings will be saved automatically, and there is no need to click the save button.

After turning off the switch or clearing the API Key, AIRI will no longer send search requests to Tavily.

## When will AIRI search?

AIRI prioritizes existing knowledge; it uses web searches only when you explicitly ask for a search or when the question involves rapidly changing information. Such as news, prices, recent releases, current activity, live charts or latest documents.

If you want it to search more accurately, please directly state the goal and scope, for example:

- "Search for the release notes for the latest stable version of AIRI and attach a link."
- "Find instructions about API Keys in Tavily's official documentation."
- "Search only the most recent week of updates on `github.com/moeru-ai/airi`."

Search results will include a link to the source. AIRI can only cite links that were actually queried; if the answer does not find enough information, the search should continue or the uncertainty should be clearly stated.

## Privacy, Reliability and Security

Each search sends the query text to Tavily. So don't include API keys, passwords, access tokens, private addresses, or other information that should not be provided to third parties in your search terms. Search results may also contain incorrect, outdated, or biased content.

::: warning Please verify important information
The search results are for AIRI reference only and will not automatically change your original question or operation goal. For content involving accounts, security, medical, legal or financial matters, please open the source link to verify it yourself, and give priority to official or primary sources.
:::

## FAQ

### Shows configured, but AIRI does not search

First confirm that the network search switch is still on, and confirm that the current chat model supports tool calls. Then directly ask for "search and attach source link" in the chat; if it is still not called, please check whether the model service provider allows the tool call request.

### Prompt API Key, permission or quota error

Return to the Tavily console to confirm that the key is complete and still valid, and to check the account's available credit or access rights. Do not include leading or trailing spaces or line breaks when copying; just return to AIRI and paste again after changing the key.

### Search results are inaccurate or not current enough

In your question, state the time frame, location, and sources you wish to use, such as "only check the past week" or "only use official documents." Open the attached links to check important conclusions; Internet searches are not a substitute for professional advice or independent judgment.
