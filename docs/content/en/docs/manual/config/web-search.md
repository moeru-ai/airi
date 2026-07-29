---
title: Configure web search
description: Use Tavily to let AIRI search for the latest in conversations
---

Web Search lets AIRI query the internet for current or unfamiliar information. It uses your Tavily API Key. When the tool is enabled and the selected chat model supports tool calls, AIRI can search during a conversation and cite the returned sources.

## Prerequisites

- AIRI is installed and running.
- You have a Tavily account and an API key from the [Tavily](https://tavily.com/) console.
- The selected chat provider and model support tool calling.

::: warning API Key Security
Tavily API Key should only be saved on the current device. Do not submit to the repository, send to others, or include in character cards, journals, and screenshots. If you suspect a key has been compromised, immediately revoke it and create a new key in the Tavily console.
:::

## Configuration steps

1. Open **Settings → Modules → Web Search**.
2. Turn on **Enable Web Search**.
3. Paste the API key in **Tavily API Key**.
4. When **Web search is ready to use!** appears, you can return to the chat. The settings are saved automatically; there is no separate save button.

After turning off the switch or clearing the API Key, AIRI will no longer send search requests to Tavily.

## When will AIRI search?

AIRI may search when you ask it to or when a question requires current information, such as news, prices, recent releases, live data, or updated documentation.

For more focused results, state the goal and scope explicitly:

- "Search for the release notes for the latest stable version of AIRI and attach a link."
- "Find instructions about API Keys in Tavily's official documentation."
- "Search only the most recent week of updates on `github.com/moeru-ai/airi`."

Search results include source links. If the available results are insufficient, AIRI should search further or clearly state the uncertainty.

## Privacy, Reliability and Security

Each search sends the query text to Tavily. Do not include API keys, passwords, access tokens, private addresses, or other sensitive information. Search results may be incorrect, outdated, or biased.

::: warning Please verify important information
Search results are provided to AIRI as reference material only and do not change your original request. For medical, legal, or financial information, review the linked sources yourself and consult official guidance or a qualified professional.
:::

## FAQ

### Tavily shows configured, but AIRI does not search

Confirm that **Enable Web Search** is on and that the selected chat model supports tool calls. Then ask AIRI to “search and include source links.” If it still does not search, check the provider's tool-calling support.

### Got API Key, permission or quota error

Return to the Tavily console to confirm that the key is correct and still valid, and check the account's available credit or access rights. Do not include leading or trailing spaces or line breaks when copying. If you changed the key, paste the new key into AIRI.

### Search results are inaccurate or not current enough

State the time frame, location, and preferred sources, such as “only check the past week” or “use only official documentation.” Open the cited links to verify important information; search results are not a substitute for professional advice or independent judgment.
