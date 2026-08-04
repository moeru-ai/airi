---
title: DevLog @ 2025.04.14
category: DevLog
date: 2025-04-14
---


## Intro


[Last time](../DevLog-2025.04.06/#memory-system) we talked about AIRI's memory system. This time, let's go deeper: how to implement such a complex memory system, and our outlook for the future.


## Start with Search Engines


Search engines have high requirements for retrieval performance. For this reason, the system offers a two-stage ranking process:


- **Basic ranking (coarse ranking)**
- **Business ranking (fine ranking)**


Basic ranking is the mass screening: quickly find high-quality documents from the retrieval results, take the TOP N results, and then score them in detail with fine ranking, finally returning the best results to the user.


**As you can see, basic ranking has a bigger impact on performance, while business ranking has a bigger impact on the final ranking quality.**


Therefore, basic ranking should be as simple and effective as possible — it only needs to extract the key factors of business ranking. Currently, both basic and business ranking are configured through ranking expressions.


### OpenSearch / WenTian Engine DSL [^1]


Let me use Alibaba Cloud OpenSearch, which Neko used extensively, as an example. Search engines have some built-in functions for re-ranking:


#### `static_bm25`


Static text relevance, traditional NLP, used to measure how well a query matches a document.


Similar to RAG's _similarity score_.


Ranges from 0 to 1.


#### `exact_match_boost`


Gets the maximum weight of the user-specified query terms, also called the score boost function.


If the input keyword matches the "content" in the document (for example, in the title or body fields) before tokenization.


For example, when searching "how to make Neurosama", documents and pages where "Neurosama" appears as a whole should score higher than where "Neuro" and "sama" appear separately.


#### `timeliness`, `timeliness_ms`


Recency score: the newer, the more relevant.


### How Is the Data Stored?


Whether it is Alibaba Cloud OpenSearch, a search engine like Grafana's built-in Loki, or the earlier ElasticSearch engine from before the Grafana era (a certain video site was built by customizing ElasticSearch), all search engines require data to be **reprocessed into a separate data structure** before it can be used.


How is the reprocessing implemented? This requires DTS.


#### DTS [^2]


Let me introduce the concept of **DTS**.


Data Transformation Services is a system used for **communication and data synchronization** between business databases and Search Engine Instances.


Implementation principle: use MySQL and Postgres's native watch and subscribe event capabilities to listen for table modifications, then sync the data to the search engine. During this process, the data is serialized into the expected format and undergoes structural transformation (ETL — extract, transform, load).


So when a search engine does a coarse-ranked search, is it in some sense like looking for things in a database _view_? Like a virtual table? You can think of it that way — except that views usually use the same underlying data structure as the database, i.e. a B+ tree, while search engines can have many other specialized data structures, such as graphs or specialized index KV stores.


### Tokenization?


For traditional search engines, a Chinese document goes through this process:


- Sentence splitting (breaking large passages into sentences)
- Word segmentation (splitting sentences into words, nouns, verbs, etc.)
- Pinyin conversion
- Optionally mapping and overriding previous results based on the current dictionary coverage configuration
- Basic vectorization and feature extraction
- Writing to the storage layer


English also needs tokenization, but it is very simple: spaces are the tokenization.


### How to Optimize Performance?


- Compute-intensive
- Multiple internal task schedulers index the data slowly
- In traditional NLP, Hamming distance and cosine distance can be computed simply first and pre-stored
- Hot words: cache the tokenization results and ranking results
- Data lakehouse? Commonly used on AWS, generally for aggregation queries that can query several databases or several data sources; it is quite slow and basically only used for data analysis and BI


### What Is Retrieval?


Retrieval means: after a keyword is entered, can the expected documents be retrieved back.


What is the difference from search? Search is "an operation issued by the user", while retrieval is "what the machine does to respond to the search".


### What Is Re-ranking?


The point of reranking is that if we only use the vectors from an embedding model for ANN (Approximate Nearest Neighbor) and KNN (K-Nearest Neighbor) vector distance ranking, the results would actually be biased.


Because functions like `exact_match_boost` and `timeliness` introduced earlier in the OpenSearch section no longer exist.


What if you want to rank the retrieved documents based on other fields and other ranking steps?


RAG now has a popular new flow: the reranking model — essentially **using a separate expert model to automatically re-rank the first-round retrieved data**.


But reranking still cannot solve many problems of the memory layer: the forgetting curve, memory reinforcement, random recall of memories, and emotion-interfered ranking scores — none of these are things a reranking model can do.


If we want to build a good memory layer for AIRI, we need to build a good reranking mechanism, blending the basic RAG capabilities with past search-engine reranking experience.


## Memory Layer Experiment Platform


[Project AIRI Memory Driver @duckdb/duckdb-wasm Playground](https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-decay)


![](/blog/DevLog-2025.04.14/assets/memory-driver.avif)


The highlighted "half life" on the left is the memory's half-life.


By default, time flows at 1 second = 1 day, so after 7 seconds, the memory score halves.


What is a memory score? It is basically controlled by this:


![](/blog/DevLog-2025.04.14/assets/memory-controler.avif)


The resulting score is the current score.


What is "original"? It is the score at initialization.


Example: with an original score of 523, its current score actually decreases slowly:


![](/blog/DevLog-2025.04.14/assets/memory-decay.avif)


Before continuing, let me explain: this forgetting-curve SQL is stateless.


What does stateless mean? It means there is no need to run tasks in the database in real time to update scores; instead, a forgetting function is computed directly from "the current time" and the score is applied to it.


So what happens when the current score drops? To solve this, we need a way to **reinforce memory**.


## An Analogy to the Human Memory System


According to the forgetting curve mentioned in spaced repetition and the basic way the memory system works in psychology [^3],


we know that human memory can be divided into several types:


- Working memory
- Short-term memory
- Long-term memory
- Muscle memory


Working memory is what we need to remember the least.


Short-term memory slowly decays in strength, i.e. score, according to the forgetting curve. At this point, we need a simulation function for short-term memory to model this process.


Long-term memory is very important; its half-life is very long, and it evolves from short-term memory.


Finally, muscle memory — rather than being a memory, it has already formed a conditioned reflex.


## How Should AIRI Be Designed?


In fact, we can get a glimpse of AIRI's implementation principles:


- Working memory is like the messages array.
- Short-term memory is like RAG memory entries that are not so easy to recall, but the newer the easier to recall.
- Long-term memory is like RAG entries that are easy to recall but become fuzzy; the more they were recalled in the past, the easier to recall.
- Muscle memory is like a fixed pairing: when A appears, ActionA and MemoryA appear too — more like an exact-match mechanism.


But is this design right?


Obviously, we have actually only introduced two dimensions: temporal relevance and retrieval count. If you start pursuing more complex systems, you will be limited.


### A Quick Review


Let's review the ranking expressions mentioned in the DevLog; it should help understanding.


![](/blog/DevLog-2025.04.14/assets/review-1.avif)


Cosine distance is "relevance", the most basic coarse ranking:


![](/blog/DevLog-2025.04.14/assets/review-2.avif)


Now we need time to participate. We just add another field to store the time distance, and then create a separate field to store the merged score `(1.2 * similarity) + (0.2 * time_relevance)`, where semantic relevance takes a 1.2x weight (a multiplier factor, not required to be less than 1) and time-distance relevance takes a 0.2x weight.


This way, we cleverly implemented a stateless multi-field relevance ranking SQL, and made its parameters (1.2 and 0.2) adjustable.


On the memory detail card, you can click "simulate retrieval", which proactively triggers a memory recall.


![](/blog/DevLog-2025.04.14/assets/memory-retrieval.avif)


In the current demo, this is done by directly writing a +1 to the retrieval count field of the original table with an UPDATE statement.


There is an implicit pitfall here: this is still a single-dimension calculation — recalling is equivalent to reinforcing.


But the real world is not like that. Memories can be sad or happy; sad ones bring negative feedback, happy ones bring positive feedback.


So that is the part I have not finished yet.


## Emotion?


https://drizzle-orm-duckdb-wasm.netlify.app/#/memory-simulator


This new simulator includes emotion-related simulation:


![](/blog/DevLog-2025.04.14/assets/memory-emotional-simulator.avif)


### Are Emotions Related to Memory?


Wanting a lollipop but not getting one is a very direct problem — not getting it is bound to make you unhappy.


Then you will find that emotions are actually related to memory.


If you are "happy about a past memory and want to experience it again", but "the scenario in that memory cannot be realized for now", you feel "sad because you cannot have it".


You can store "joy" and "aversion" scores in the memory database:


![](/blog/DevLog-2025.04.14/assets/memory-emotional-score.avif)


### PTSD?


PTSD usually involves two words: "trigger" and "flashback". Clearly, PTSD-related memories should be repressed, and their aversion and trauma scores should be very high.


But in reality, PTSD-related memories suddenly surface. From a biomimetic and data-simulation perspective, we can use random numbers to achieve this effect.


You can refer to the emotion model in https://yutsuki.moe/2019/09/a0d0fa1b/.


![](/blog/DevLog-2025.04.14/assets/memory-emotional-model.avif)


## There Is Still a Lot to Do…


For example, what is ReLU's current emotion? What bad memories does ReLU have about anyone?


Do memories come up in pairs of happy and sad poles?


What about desires? Will we need a wish system?


Build a dreaming agent or a subconscious agent — like a _background task_ — that processes and indexes past memories one by one, and modifies the various scores of past memories based on recent experiences.


But we do not necessarily need a "dreaming" process; it is just a "background task".


From a re-indexing perspective, the dreaming agent and the subconscious agent are like rebuilding an index.


At this point, you will find that libraries like [Mem0](https://docs.mem0.ai/overview) or [Zep Memory](https://help.getzep.com/memory) are completely useless for roleplay and emotional AI :(


The road is long, and we still need to keep working.


## References


[^1]: https://help.aliyun.com/zh/open-search/industry-algorithm-edition/rough-sort-functions


[^2]: https://help.aliyun.com/zh/open-search/industry-algorithm-edition/configure-dts-real-time-synchronization


[^3]: https://zh.wikipedia.org/wiki/%E9%81%97%E5%BF%98%E6%9B%B2%E7%BA%BF

