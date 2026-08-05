---
title: DevLog @ 2025.04.14
category: DevLog
date: 2025-04-14
---

## Introduction

[Last time](../DevLog-2025.04.06/#memory-system-memory-system) we discussed AIRI's memory system. Today, let's dive deeper into how to implement such a complex memory system and explore future prospects.

## Starting with Search Engines

Search engines have high requirements for retrieval performance. To address this, the system implements a two-stage sorting process:

- **Basic Sorting (Coarse Ranking)**
- **Business Sorting (Fine Ranking)**

Basic sorting serves as the initial screening, quickly identifying high-quality documents from search results, extracting the top N results, and then performing detailed scoring through fine ranking to ultimately return the optimal results to users.

**This shows that basic sorting has a significant impact on performance, while business sorting affects the final ranking effectiveness.**

Therefore, basic sorting should be as simple and effective as possible, extracting only the key factors from business sorting. Currently, both basic and business sorting are configured through sorting expressions.

### OpenSearch / Wentian Engine DSL [^1]

Let's use Alibaba Cloud OpenSearch, which Neko has extensively used, as an example. Search engines have built-in functions for reordering:

#### `static_bm25`

Static text relevance, traditional NLP, used to measure the match between query and document.
Similar to RAG's _similarity score_
Value range: 0～1

#### `exact_match_boost`

Gets the maximum weight of user-specified query terms, also known as score boost function.
If the input keywords, before tokenization, hit the "content" in document fields (such as title, body).
For example, when searching "How to make Neurosama", documents and pages containing the exact phrase "Neurosama" should score higher than those with "Neuro" and "sama" appearing separately.

#### `timeliness`, `timeliness_ms`

Timeliness score, newer content is more relevant.

### How is Data Stored?

Search engines, whether Alibaba Cloud's OpenSearch, Grafana's built-in Loki, or earlier ElasticSearch engines (some video websites were developed based on ElasticSearch), all require data to be **reprocessed in separate data structures** within these search engines before they can be used.

How is this reprocessing implemented? This requires DTS.

#### DTS [^2]

Let's further introduce the concept of **DTS**.

Data Transformation Services is a system for **communication and data synchronization** between business databases and Search Engine Instances.

Implementation principle: Uses MySQL and Postgres's native watch and subscribe event capabilities to monitor table modifications, then synchronizes data to the search engine. During this process, data is serialized into the desired format, undergoing data structure transformation (ETL: extract, transform, load).

When performing coarse ranking searches, is it somewhat like searching in a database _view_? Like a virtual table? This understanding is somewhat correct, except that views typically use the same underlying data structure as the database (B+ trees), while search engines can have many other specialized data structures, such as graphs or specialized index key-value databases.

### Tokenization?

For traditional search engines, a Chinese document input goes through this process:

- Sentence segmentation (breaking large paragraphs into sentences)
- Word segmentation (breaking sentences into words/characters, nouns, verbs, etc.)
- Pinyin conversion
- Can map and override previous results based on current dictionary coverage configuration
- Perform basic vectorization and feature extraction
- Write to storage layer

English also requires tokenization, but it's much simpler - spaces serve as word boundaries.

### How to Optimize Performance?

- Compute-intensive
- Multiple internal task schedulers to slowly index data
- Traditional NLP techniques like Hamming distance and cosine distance can be precomputed and stored
- Hot words can cache tokenization and sorting results
- Data lakehouse? Commonly used on AWS, generally for aggregate queries across multiple databases or data sources, very slow, basically only used for data analysis and BI

### What is Recall?

Recall (retrieval) means whether the expected document can be retrieved when keywords are input.

Difference from search? Search is "user-initiated operation", while recall is "what the machine does to respond to search".

### What is Reranking?

The significance of reranking is that if we only rely on vector distance sorting using ANN (Approximate Nearest Neighbor) and KNN (K-Nearest Neighbor) based on embedding model vectors, there will actually be biases.

Because the exact_match_boost and timeliness functions introduced earlier in OpenSearch would no longer exist.

What if you want to add sorting based on other fields and steps to the retrieved documents?

RAG now popularizes a new process called reranking model, which essentially **uses a separate expert model to automatically re-sort the first round of retrieved data**.

However, reranking still cannot solve many problems of the memory layer: forgetting curves, memory reinforcement, random memory recall, and emotionally influenced reranking scores - these are not things reranking models can handle.

To build a good memory layer for AIRI, we need to establish a good reranking mechanism, combining RAG basic capabilities with past search engine reranking experience.

## Memory Layer Experimental Platform

[Project AIRI Memory Driver @duckdb/duckdb-wasm Playground](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-decay)

![](./assets/memory-driver.avif)

The highlighted "half life" on the left is the memory's half-life.

By default, time passes at 1 second = 1 day, so after 7 seconds, the memory score will be halved.

What is memory score? Memory score is primarily controlled by this:
![](./assets/memory-controler.avif)

The resulting score is the current score.

What is original? It's the score at initialization.

Example: Original score is 523, its current score is actually gradually decreasing:
![](./assets/memory-decay.avif)

Before continuing, let me explain that this forgetting curve SQL is stateless.

What does stateless mean? Stateless means it doesn't require real-time database task execution to update scores, but directly applies a forgetting function based on "current time" to calculate the score.

So, what if the current score drops? To solve this problem, we need ways to **reinforce memory**.

## Analogous to Human Memory Systems

Based on the forgetting curve mentioned in spaced repetition and the basic working principles of memory systems in psychology [^3]

We know that human memory can be divided into several types:

- Working memory
- Short-term memory
- Long-term memory
- Muscle memory

Working memory is the least important to remember.

Short-term memory gradually decays in strength (score) according to the forgetting curve. At this point, we need a short-term memory simulation function to model this process.

Long-term memory is important, with a long half-life, evolved from short-term memory.

Finally, muscle memory - rather than calling it a type of memory, it's more like a conditioned reflex that has been formed.

## How Should AIRI Be Designed?

From this, we can glimpse AIRI's implementation principles:

- Working memory is like the messages array
- Short-term memory is like RAG memory entries that are less easily recalled, newer ones are easier to recall
- Long-term memory is like RAG entries that are easily recalled but become fuzzy, with higher recall counts from the past being easier to recall
- Muscle memory is like fixed patterns - when A appears, ActionA and MemoryA appear together, more like an exact matching mechanism

But is this design correct?

Clearly, we've only introduced two dimensions here: temporal relevance and retrieval count. When you start pursuing more complex systems, this will become limiting.

### Quick Review

Let's review the sorting expressions mentioned in the DevLog, which should help understanding.

![](./assets/review-1.avif)

Cosine distance is "relevance", the most basic coarse ranking:
![](./assets/review-2.avif)

Now we need time to participate, so we add another field to store time distance, then create a separate field to store the combined score `(1.2 * similarity) + (0.2 * time_relevance)`, where semantic relevance has 1.2x weight (amplification factor, not required to be less than 1), and time distance relevance has 0.2x weight.

This cleverly implements stateless multi-field relevance sorting SQL while making it parameter-adjustable (1.2 and 0.2).

On the memory detail card, you can click "simulate retrieval", which actively triggers a memory recall.
![](./assets/memory-retrieval.avif)

In the current demo, this is implemented by simply using UPDATE statements to add +1 to the retrieval count field in the original table.

There's an implicit pitfall here: this is still single-dimensional calculation, equivalent to recalling equals reinforcing.

But the real world isn't like this. Memories can be sad, happy - sadness brings negative feedback, happiness brings positive feedback.

So this is the part I haven't completed yet.

## Emotions?

https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-simulator

This new simulator includes emotion-related simulations:
![](./assets/memory-emotional-simulator.avif)

### Are Emotions Related to Memory?

Wanting to eat candy but not getting it is a straightforward problem - not getting it definitely makes one unhappy.

Then you'll discover that emotions are actually related to memory.

If "happy about a past memory and hoping to experience it again", but "temporarily unable to recreate the scenario from that memory", so feeling "unhappy about not getting it".

Can store "joy" and "disgust" scores in the memory database:
![](./assets/memory-emotional-score.avif)

### PTSD?

PTSD typically involves two words: "trigger" and "flashback". Clearly, PTSD-related memories should be suppressed, with high disgust and trauma scores.

But actually, PTSD-related memories can suddenly emerge. From a bionic and data simulation perspective, we can implement this effect using random numbers.

Can reference the emotional model at https://yutsuki.moe/2019/09/a0d0fa1b/

![](./assets/memory-emotional-model.avif)

## Still Much Work to Do...

For example, what are ReLU's current emotions? Does ReLU have any bad memories about anyone?

Do memories appear as polarized entries of happiness and sadness together?

What about desires? Would we need to create a wish system?

Create a dreaming agent or subconscious agent, similar to _background tasks_, processing and indexing each occurred memory one by one, and modifying various scores of past memories based on recent experiences.

But we don't necessarily need a "dreaming" process, just a "background task".

From a re-indexing perspective, dreaming agents and subconscious agents are like rebuilding indexes.

At this point, you'll find that libraries like [Mem0](https://docs.mem0.ai/overview) or [Zep Memory](https://help.getzep.com/memory) are completely useless in role-playing and emotional AI :(

The road ahead is long, and we still need to continue working hard.

## References

[^1]: https://help.aliyun.com/zh/open-search/industry-algorithm-edition/rough-sort-functions

[^2]: https://help.aliyun.com/zh/open-search/industry-algorithm-edition/configure-dts-real-time-synchronization

[^3]: https://zh.wikipedia.org/wiki/%E9%81%97%E5%BF%98%E6%9B%B2%E7%BA%BF
