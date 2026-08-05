---
title: Configure Web Search
description: Use Tavily to let AIRI search for up-to-date information in conversations
---


Web search lets AIRI query the internet when it needs the latest information or unfamiliar facts. It uses your own Tavily API key; once enabled, AIRI calls the search tool on its own in suitable conversations and includes the source links it actually used in its answers.


## Prerequisites


- AIRI is installed and running.
- You have a Tavily account and have created an API key from the [Tavily](https://tavily.com/) console.
- You have configured a chat provider and model that support tool calling. If AIRI cannot use tools, switch to a model that supports tool calling first.


::: warning API Key Security


The Tavily API key should only be stored on the current device. Do not commit it to the repository, share it with others, or put it in character cards, logs, or screenshots. If you suspect the key has leaked, revoke it immediately in the Tavily console and create a new one.


:::


## Configuration Steps


1. Open **Settings → Modules → Web Search**.
2. Turn on "Enable Web Search".
3. Paste the API key into "Tavily API Key".
4. Once "Web search is ready" appears, you can return to chat; settings are saved automatically, so no separate save button is needed.


After turning off the toggle or clearing the API key, AIRI will no longer send search requests to Tavily.


## When AIRI Searches


AIRI prefers its existing knowledge; it only uses web search when you explicitly ask it to, or when the question involves information that changes quickly — such as news, prices, recently released versions, current events, live rankings, or the latest documentation.


To make its searches more accurate, state the target and scope directly, for example:


- "Search for the release notes of the latest stable version of AIRI and include links."
- "Find the instructions about API keys in Tavily's official documentation."
- "Only search `github.com/moeru-ai/airi` for updates from the past week."


Search results include source links. AIRI can only cite the links it actually retrieved; if the answer does not find enough material, it should continue searching or clearly state what it is unsure about.


## Privacy, Reliability, and Security


Each search sends the query text to Tavily. Therefore, do not include API keys, passwords, access tokens, private addresses, or other information that should not be shared with third parties in your search terms. Search results may also contain incorrect, outdated, or biased content.


::: warning Verify Important Information


Search results are for AIRI's reference only and do not automatically change your original question or goal. For content involving accounts, security, medical, legal, or financial matters, open the source links and verify them yourself, preferring official or primary sources.


:::


## Common Issues


### It says configured, but AIRI does not search


First confirm the web search toggle is still on, and that the current chat model supports tool calling. Then explicitly ask in chat to "search and include source links"; if it still does not call the tool, check whether the model provider allows tool calling requests.


### API key, permission, or credit errors


Return to the Tavily console to confirm the key is complete and still valid, and check the account's available credits or access. Do not copy stray spaces or newlines around the key; after changing the key, paste the new one into AIRI.


### Search results are inaccurate or not recent


State the time range, location, and preferred sources in your question, e.g. "only look at the past week" or "use official documentation only". Open the attached links to verify important conclusions; web search cannot replace professional advice or independent judgment.

