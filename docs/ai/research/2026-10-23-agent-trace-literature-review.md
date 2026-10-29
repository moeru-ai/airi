# Agent trace literature review

Date: 2026-10-23. Status: input to [the agent trace event stream ADR](../adr/2026-10-22-agent-trace-event-stream.md).

## Purpose

The draft ADR defines a trace event stream for AIRI. Design reviews found weak points in four areas:

- the time model
- an assumption of two parties in the voice profile
- the projection from records to view state
- extensibility outside the voice domain

This review collects the state of the art in five fields before the ADR is changed.

## Method

Five research agents each covered one field. They read papers, specifications, and source code, and checked links in
October 2026.

| Section | Field |
| --- | --- |
| [1](#tracing-data-models-and-time) | Trace data models and multi-clock time |
| [2](#multi-party-conversation-and-turn-taking) | Multi-party conversation and turn-taking |
| [3](#full-duplex-spoken-dialogue) | Full-duplex spoken dialogue systems and their evaluation |
| [4](#agent-observability-and-evaluation) | LLM agent observability, tracing standards, and evaluation from traces |
| [5](#event-sourcing-projections-and-replay) | Event sourcing, projections, stream time semantics, and replay |

Each section has its own numbered reference list. A citation such as [3] refers to the list of its own section. A
reference that was not read in this review is marked "(unverified)".

## Summary

These conclusions appear in more than one section:

1. **Name the clock of each time value.** Perfetto, CTF 2, Fuchsia, and Chrome trace all attach a clock to each
   timestamp. Readers convert with recorded correspondence points (Section 1). A bare `t` is a known defect.
2. **Keep event time and arrival time apart.** OTel logs, MCAP, Rerun, and the Dataflow model keep both. Late data
   needs a policy, not a silent re-sort (Sections 1 and 5).
3. **Order by causality, not by timestamps.** Dapper, X-Trace, Canopy, and ShiViz order events by IDs and sequence
   numbers. A viewer repairs broken order visibly, as Jaeger does (Sections 1 and 5).
4. **A conversation has N parties.** Turn-taking rules, voice activity models, and meeting corpora all use one
   channel for each party. A dialogue with two parties is a special case (Section 2).
5. **"When" and "who" are separate decisions.** Timing models decide when the floor changes. Addressee models decide
   who speaks next (Section 2).
6. **Some systems hide their decisions.** End-to-end speech models and commercial APIs do not expose internal
   decisions. A trace must mark a record as reported by the producer or derived from audio (Section 3).
7. **A small set of voice metrics is stable.** Response latency, stop latency, take-over rate for each context, the
   overlap behavior class, and gap and overlap statistics have the same definitions across benchmarks. Quality
   scores depend on the judge, so they stay annotations (Section 3).
8. **Agent tracing has a de facto minimum.** All surveyed tools have an agent run, a model call, a tool call, and an
   optional workflow. They group traces by a conversation key. They store an evaluation as a separate record with a
   score or label, an explanation, and an author kind (Section 4).
9. **Content capture is off by default in the standards.** OTel GenAI, Google ADK, and Mastra keep prompts and tool
   arguments out unless the user opts in (Section 4).
10. **State is a fold of an ordered log, and a late joiner gets a snapshot plus a tail.** Kafka compaction,
    EventStoreDB catch-up, XState snapshots, Perfetto keyframes, and Yjs state vectors all follow this pattern
    (Section 5).

## Decisions for the ADR

| Area | Change | Sections |
| --- | --- | --- |
| Time | Replace `t` with `ts` and a registered `clock`. Add a clock registry. | 1 |
| Time | Add `clock.snapshot` and `clock.discontinuity` records. Remove `monotonicOrigin`. | 1 |
| Time | Every source, including local windows and workers, runs a ping exchange with a min-RTT filter. The collector fits offset plus drift and converts at read time. | 1 |
| Time | Model audio capture and playout as clock domains with periodic snapshots. Audio records keep a frame position as their primary time. | 1 |
| Time | Add `observedTs` in the collector clock. | 1, 5 |
| Sources | Add an `epoch` to `source.started` and to `TraceRef`. A new epoch closes the open spans of the old one. | 5 |
| Collection | Keep a pinned set outside eviction: open spans, the latest state of each track, `source.started`, live streams, and profile declarations. Send it first to a late joiner. | 5 |
| Collection | Add watermarks, an allowed lateness, `gap` markers for evicted ranges, deduplication, and counters for late, orphan, and duplicate records. | 5 |
| Projection | Define a projection contract: `reset`, `handleEvent`, `finalize`, with no I/O and no clock. Timeline, pipeline, metrics, and event log are projections of one feed. Product UI does not read traces. | 5 |
| Voice profile | Replace `session.user` and `session.agent` with one track for each participant. | 2 |
| Voice profile | Make the floor a set of holders, with an optional `floor.id`. Keep the floor states of a direct chat as a derived view. | 2, 3 |
| Voice profile | Add who-to-whom fields: addressees, the selection type, interrupter and interrupted, and candidate sets on scheduler decisions. | 2, 3 |
| Voice profile | Define metrics for ordered pairs of participants. The dyadic metrics become cells of the matrix. | 2 |
| Voice profile | Split the barge-in gate into `overlap.intent` and `overlap.response` (`continue`, `adapt`, `yield`). | 3 |
| Voice profile | Mark records as `reported` or `observed`. Add a text track for model text that runs ahead of the audio. Record the VAD model and settings. | 3 |
| Agent profile | Map spans to `gen_ai.operation.name` on export. Use `CLIENT` for model calls and remote agents. | 4 |
| Agent profile | Export background work that outlives its turn as a new trace with a link to its cause. | 4 |
| Annotations | Add `explanation`, a registered `direction`, and targets at session and turn level. Map `by` to an author kind. | 4 |
| Content | Register the `gen_ai` content attributes in the content filter, because the `.content.` naming rule does not match them. Remove content from files and exports by default. Scrub secrets in other attributes. | 4 |
| Plugins | Carry W3C `traceparent` in plugin and MCP message metadata. | 4 |

## Conflicts between sections

- **Floor model.** Section 3 proposes the five floor states of a 2026 survey (`idle`, `listen`, `speak`, `wait`,
  `dual`). Section 2 proposes a set of holders. These fit together: each participant track has the five states, and
  the floor is the set of participants in `speak`. The ADR uses both.
- **Repair of late records.** The Dataflow model emits corrections. Perfetto and Chrome DevTools do not correct a live
  view. Section 5 recommends a provisional region behind the watermark and no re-layout after it.
- **Who keeps a snapshot.** Kafka and Perfetto make the producer re-emit state. Marten and Redux make the consumer
  store it. Section 5 recommends a pinned set in the collector, which is a consumer snapshot.
- **Handoffs.** The OpenAI Agents SDK has a handoff span. OTel has none. Section 4 recommends an instant with a cause
  link, so the export does not depend on an open OTel proposal.

## Open questions

- Which clock is the trace clock when there is no Electron main process, as in stage-web and stage-pocket.
- The interval of `clock.snapshot`, and the window of the drift fit.
- The allowed lateness for each source type.
- Who owns the scheduler decision of who speaks next in a group chat. The chat domain ADR has the same question.
- Whether audio recording is on by default, its storage limit, and audio before a wake word.

## Tracing data models and time

### State of the art

**Trace formats with explicit clock domains**

- **Perfetto** [1][2][3]. Each packet can name its clock in `timestamp_clock_id`. The default is `CLOCK_BOOTTIME`. A `ClockSnapshot` packet says "value X on clock A equals value Y on clock B". Applications can define sequence-scoped clocks (IDs 64 to 127) and global clocks (128 and up). The trace processor converts each timestamp at import time. It uses the latest snapshot at or before the timestamp, and a breadth-first search through the clock graph when no direct snapshot exists. For a clock that is not monotonic, it converts in one direction only. `RemoteClockSync` stores snapshot pairs from both sides of a relay, for multi-machine traces.
- **Chrome Trace Event Format** [4]. `ts` is in microseconds of one tracing clock. A `clock_sync` event (phase `c`) carries a `sync_id` and an `issue_ts`. Two agents record the same marker, and the viewer aligns their domains.
- **CTF 2 and LTTng** [5]. The metadata declares clock classes with `frequency`, `origin` (for example `unix-epoch`), and `offset-from-origin` in seconds plus cycles. It also has `precision` (random error) and `accuracy` (systematic error). Event records store raw cycles. Two clocks correlate only when they share an origin.
- **Fuchsia trace format** [6]. Records store 64-bit ticks. The initialization record gives ticks per second. The format does not guarantee timestamp order in a stream.
- **MCAP** [7]. Each message has `log_time` (when the recorder wrote it) and `publish_time` (when the sender published it). The epoch is "user-understood", for example Unix time or robot boot time.
- **Rerun** [8]. One event can sit on several timelines at once: `log_time`, an optional `log_tick` sequence, and custom timelines. A timeline is a sequence, a timestamp, or a duration.
- **OpenTelemetry logs** [9]. A record has `Timestamp` ("measured by the origin clock") and `ObservedTimestamp` ("when the event was observed by the collection system").

**Clock skew and causality in distributed tracing**

- **Dapper** [10] stores client and server annotations from different hosts. Its tools use the fact that a client sends before the server receives to bound skew.
- **Jaeger** [11] corrects skew at query time. If a child span on another host does not fit in its parent, it moves the child. It assumes that network latency splits equally between request and response. It skips shifts larger than `max_clock_skew_adjust` and adds a warning to the span.
- **X-Trace** [12], **Pivot Tracing** [13], and the workflow-centric tracing design study [14] model a trace as a happens-before graph. Pivot Tracing adds a "happened-before join" operator. Canopy [15] orders events in one process by sequence numbers and timestamps, and relates events across processes by IDs. It builds the trace model after collection, not in the producer.
- **Logical clocks**. Lamport clocks [16] give a total order that respects causality. ShiViz [17] draws time-space diagrams from vector timestamps only, without physical time. Hybrid logical clocks [18] keep a logical counter that stays close to NTP time.
- **Clock synchronization**. Cristian's algorithm [19] estimates offset from a request and reply, and bounds the error by half the round trip. NTP [20] filters samples and prefers low-delay samples. Huygens [21] uses many probes and rejects noisy ones to reach tens of nanoseconds. Poirier, Roy, and Dagenais [22] synchronize traces offline. They fit a convex hull over send and receive events and get a linear model with offset and drift.

**Media clocks**

- **RTP and RTCP** [23]. An RTCP sender report pairs an NTP timestamp with an RTP timestamp for the same instant. The receiver maps the media clock to wall time and does lip sync with it.
- **WebRTC stats** [24]. `estimatedPlayoutTimestamp` is the NTP time of the last playable sample, from that sender report mapping. `jitterBufferDelay` and `jitterBufferTargetDelay` expose the receive-side buffer.
- **GStreamer** [25][26]. `running_time` is `absolute_time - base_time` of the pipeline clock. Sinks wait for the clock before they render. An audio sink slaves to the master clock by `resample` or `skew`, with a `drift-tolerance`.
- **Web Audio** [27]. `getOutputTimestamp()` returns a `contextTime` and a `performanceTime` for the frame that the output device renders now. `outputLatency` estimates the delay to the device. The spec says that `currentTime - contextTime` is not a reliable latency estimate. `AudioPlaybackStats` adds underrun counts and latency minimum, average, and maximum. `AudioWorkletGlobalScope.currentFrame` gives the frame position of the block. Media Capture Extensions [28] add capture `latency` on `MediaStreamTrackAudioStats`.
- **Drift filtering**. Adriaensen [29] maps sample counts to system time with a delay-locked loop. JACK uses this method.

**Monotonic clocks and suspend**

- Linux `CLOCK_MONOTONIC` stops during suspend. `CLOCK_BOOTTIME` includes suspend [30].
- On macOS, `mach_absolute_time` stops during sleep. `mach_continuous_time` advances during sleep [31]. macOS `CLOCK_MONOTONIC` continues during sleep, which is the opposite of Linux.
- Windows QPC includes sleep, standby, and hibernate. Typical PC crystals are off by 30 to 50 ppm [32].
- HR Time [33] gives one monotonic clock per user agent, and `timeOrigin` differs per window and worker. The spec does not define behavior during system sleep. Issues #115 and #141 are still open [34][35]. MDN reports that only Windows browsers keep ticking during sleep [36].

### Consensus and disagreements

Consensus:

- A trace format names the clock of each timestamp. Perfetto, CTF 2, Fuchsia, and Chrome all do this. A bare number without a clock is a known defect.
- Event time and observe time are two fields. OTel, MCAP, and Rerun keep both.
- Producers write raw clock values. A reader converts them with recorded correspondence points. Perfetto, CTF 2, and Chrome `clock_sync` follow this model.
- Causal order comes from IDs and sequence numbers, not from timestamps. Dapper, X-Trace, Canopy, and ShiViz agree.
- Offset estimates use round trips and prefer the samples with the lowest delay [19][20][21].

Disagreements:

- **Conversion model.** Perfetto applies the nearest earlier snapshot, so the offset is piecewise constant and drift collects between snapshots. Poirier and colleagues fit offset plus drift. Adriaensen filters online with a loop.
- **Repair.** Jaeger moves spans to satisfy causality and marks them. ShiViz drops physical time. HLC merges both into one clock.
- **Where conversion happens.** OTel and MCAP expect a normalized epoch at the source. Perfetto and CTF keep raw domains and convert at read time.

### Open problems

- No web API gives a hardware timestamp for a captured microphone frame. Capture `latency` is new and has limited support.
- `outputLatency` is an estimate. Bluetooth sinks change it when the codec or route changes. No API reports when the estimate changes.
- Monotonic clocks in browsers behave differently during sleep on each OS. The specification issue is open.
- Most viewers show one point per event. Few show conversion uncertainty, although CTF 2 can store precision and accuracy.
- A JavaScript ping goes through event-loop queues. Scheduling jitter adds error to each sample. The min-RTT filter removes part of this error.

### Implications for AIRI

AIRI has at least five clock domains. One `t` per record cannot keep their relation. These are the recommendations:

1. **Store raw time and its clock.** Replace `t` with `ts` and `clock`. `clock` is a registered clock key, for example `mono:window:main`, `audio.capture:ctx1`, `audio.playout:ctx2`, or `wall:server:api`. Add `clock` as a sixth registry. This follows Perfetto [1] and CTF 2 [5].
2. **Add a `clock.snapshot` record.** It lists `{ clock, value }` pairs read at one instant, and an `uncertaintyMs`. A source emits it at start, every 10 to 30 seconds, after resume, on visibility change, and on audio device change. Remove `monotonicOrigin` from `source.started`.
3. **Select one trace clock.** Use the monotonic clock of the collector process. Show wall time as a label only. The collector computes trace time when it reads records, so a later snapshot can correct earlier records.
4. **Use offset plus drift, not offset only.** Fit a linear model over a sliding window of snapshots, as in [22] and [29]. A drift of 50 ppm adds 3 ms per minute. Turn timing and word timing for evaluation need better accuracy than that.
5. **Measure every source, not only remote sources.** Windows, workers, the main process, plugins, and the server all run a ping exchange. Keep the sample with the smallest round trip, as in Cristian [19] and NTP [20]. Record half the round trip as uncertainty.
6. **Handle suspend explicitly.** Listen to the Electron `powerMonitor` suspend and resume events. Emit a `clock.discontinuity` record and new snapshots. Do not join spans across a gap on a clock that stops during sleep.
7. **Model audio as clock domains.** Replace the single `stream.started` anchor with periodic snapshots. For capture, pair `currentFrame` from the AudioWorklet with `performance.now()`, and add capture `latency` when the browser has it. For playout, use `getOutputTimestamp()` plus `outputLatency`. Audio records keep a frame position as the primary time. Evaluation exports use frame positions directly, not converted `t`.
8. **Keep the observe time.** Add `observedTs` in the collector clock, as in OTel `ObservedTimestamp` [9]. The viewer uses it when a source has no snapshot yet.
9. **Repair visibly.** If converted times break a `causes` edge, the viewer clamps the effect after the cause. It marks the record, as Jaeger does [11]. It does not change stored values.

ADR parts to change:

- **Core, Records**: the `t` field, the `t` rules, `source.started.monotonicOrigin`, and `stream.started`. Add `clock.snapshot` and `clock.discontinuity`.
- **Core, Registries**: add the clock registry.
- **Collection**: replace the last paragraph. All sources get snapshots, and the collector runs the ping exchange.
- **Open questions**: close the item on the plugin and server clock offset. Use the ping exchange with min-RTT filtering.
- **Exports**: map clocks to Perfetto `ClockSnapshot` and Chrome `clock_sync`.
- **Context, item 7**: name the audio clock domains, not one audio anchor.

### References

1. Perfetto. "Synchronization of multiple clock domains." https://perfetto.dev/docs/concepts/clock-sync
2. Perfetto. `builtin_clock.proto` and `clock_snapshot.proto`. https://github.com/google/perfetto/tree/main/protos/perfetto
3. Perfetto. `remote_clock_sync.proto`. https://github.com/google/perfetto/blob/main/protos/perfetto/trace/remote_clock_sync.proto
4. N. Duca, D. Sinclair. "Trace Event Format." Google, 2016. https://docs.google.com/document/d/1CvAClvFfyA5R-PhYUmn5OOQtYMH4h6I0nSsKchNAySU
5. P. Proulx. "CTF2-SPEC-2.0rB: Common Trace Format version 2." EfficiOS and DiaMon, 22 May 2026. https://diamon.org/ctf/
6. Fuchsia. "Fuchsia trace format." https://fuchsia.dev/fuchsia-src/reference/tracing/trace-format
7. Foxglove. "MCAP format specification." https://mcap.dev/spec
8. Rerun. "Events and timelines." https://rerun.io/docs/concepts/timelines
9. OpenTelemetry. "Logs data model." https://opentelemetry.io/docs/specs/otel/logs/data-model/
10. B. H. Sigelman et al. "Dapper, a Large-Scale Distributed Systems Tracing Infrastructure." Google Technical Report dapper-2010-1, 2010. https://research.google.com/archive/papers/dapper-2010-1.pdf
11. Jaeger. `clockskew.go` adjuster. https://github.com/jaegertracing/jaeger/blob/main/cmd/jaeger/internal/extension/jaegerquery/internal/adjuster/clockskew.go
12. R. Fonseca, G. Porter, R. H. Katz, S. Shenker, I. Stoica. "X-Trace: A Pervasive Network Tracing Framework." NSDI 2007. https://www.usenix.org/legacy/event/nsdi07/tech/full_papers/fonseca/fonseca.pdf
13. J. Mace, R. Roelke, R. Fonseca. "Pivot Tracing: Dynamic Causal Monitoring for Distributed Systems." SOSP 2015. https://dl.acm.org/doi/10.1145/2815400.2815415
14. R. R. Sambasivan, I. Shafer, J. Mace, B. H. Sigelman, R. Fonseca, G. R. Ganger. "Principled workflow-centric tracing of distributed systems." SoCC 2016. https://www.semanticscholar.org/paper/5b60e599096044a5fed372950486ad8eb0ac94ae
15. J. Kaldor et al. "Canopy: An End-to-End Performance Tracing And Analysis System." SOSP 2017. https://cs.brown.edu/people/jcmace/papers/kaldor2017canopy.pdf
16. L. Lamport. "Time, Clocks, and the Ordering of Events in a Distributed System." CACM 21(7), 1978. https://doi.org/10.1145/359545.359563 (unverified in this session)
17. I. Beschastnikh, P. Liu, A. Xing, P. Wang, Y. Brun, M. D. Ernst. "Visualizing Distributed System Executions." ACM TOSEM, 2020. https://dl.acm.org/doi/10.1145/3375633
18. S. S. Kulkarni, M. Demirbas, D. Madappa, B. Avva, M. Leone. "Logical Physical Clocks." OPODIS 2014. https://link.springer.com/chapter/10.1007/978-3-319-14472-6_2
19. F. Cristian. "Probabilistic clock synchronization." Distributed Computing 3(3), 1989. https://doi.org/10.1007/BF01784024 (unverified in this session)
20. D. Mills, J. Martin, J. Burbank, W. Kasch. "Network Time Protocol Version 4." RFC 5905, 2010. https://www.rfc-editor.org/rfc/rfc5905 (unverified in this session)
21. Y. Geng et al. "Exploiting a Natural Network Effect for Scalable, Fine-grained Clock Synchronization." NSDI 2018. https://www.usenix.org/conference/nsdi18/presentation/geng
22. B. Poirier, R. Roy, M. Dagenais. "Accurate offline synchronization of distributed traces using kernel-level events." ACM SIGOPS OSR 44(3), 2010. https://dl.acm.org/doi/abs/10.1145/1842733.1842747
23. H. Schulzrinne, S. Casner, R. Frederick, V. Jacobson. "RTP: A Transport Protocol for Real-Time Applications." RFC 3550, 2003. https://www.rfc-editor.org/rfc/rfc3550 (unverified in this session)
24. W3C. "Identifiers for WebRTC's Statistics API." https://www.w3.org/TR/webrtc-stats/
25. GStreamer. "Synchronisation" design document. https://gstreamer.freedesktop.org/documentation/additional/design/synchronisation.html
26. GStreamer. `GstAudioBaseSink` properties. https://gstreamer.freedesktop.org/documentation/audio/gstaudiobasesink.html
27. W3C. "Web Audio API 1.1." Working Draft, 22 September 2026. https://www.w3.org/TR/webaudio-1.1/
28. W3C. "Media Capture and Streams Extensions." Editor's Draft. https://w3c.github.io/mediacapture-extensions/
29. F. Adriaensen. "Using a DLL to filter time." Linux Audio Conference 2005. https://kokkinizita.linuxaudio.org/papers/usingdll.pdf
30. Linux man-pages. `clock_gettime(2)`. https://man7.org/linux/man-pages/man2/clock_gettime.2.html
31. Apple. `mach/mach_time.h` (macOS SDK) and `clock_gettime(3)` manual page. Read on macOS 26 in this session.
32. Microsoft. "Acquiring high-resolution time stamps." https://learn.microsoft.com/en-us/windows/win32/sysinfo/acquiring-high-resolution-time-stamps
33. W3C. "High Resolution Time." https://w3c.github.io/hr-time/
34. w3c/hr-time issue #115. "Suggestions: ticking during sleep, comparison across contexts, ..." https://github.com/w3c/hr-time/issues/115
35. w3c/hr-time issue #141. "`timeOrigin` and skew over time from the system clock." https://github.com/w3c/hr-time/issues/141
36. MDN. "Performance: now() method." https://developer.mozilla.org/en-US/docs/Web/API/Performance/now

## Multi-party conversation and turn-taking

### State of the art

**Theory.**

- Sacks, Schegloff, and Jefferson give the base rules [1]. At a transition point, the current speaker selects the next speaker. If not, any party can self-select. If no one does, the current speaker can continue. These rules are defined for N parties. The dyad is a special case.
- Edelsky shows that a group can have more than one floor at a time [2]. A "collaborative floor" has several holders who talk together. Thus "who has the floor" is not always one actor.
- Stivers and colleagues measure answer timing in 10 languages [3]. The mode of the offset is 0 to 200 ms in all of them. Heldner and Edlund measure pauses, gaps, and overlaps [4]. They report a large share of speaker changes with overlap, and most gaps are short. The exact share is unverified. Levinson and Torreira use the floor transfer offset (FTO) [5]. FTO is the start of the next turn minus the end of the previous turn. A negative FTO is an overlap.

**Computational turn-taking.**

- Skantze reviews turn-taking for dialogue systems and robots, with a section on multi-party interaction [6]. Castillo-López and colleagues survey recent models [7]. They find that 72% of the works do not compare with earlier work.
- Voice Activity Projection (VAP) predicts the future voice activity of each speaker from audio [8]. The original model has two channels, one for each speaker.
- Laskowski models multi-party vocal activity on the ICSI corpus, with one binary channel for each participant [9].

**Multi-party models.**

- Triadic VAP extends VAP to three speakers on Japanese data (Interspeech 2025) [10]. It is the first VAP model for three parties.
- MuVAP adds face tracks to one audio stream and one camera (2026) [11]. Its "role-relative projection" maps N speakers to two roles: the current holder and the next holder.
- "Fast When, Careful Who" splits the task into two steps (2026) [12]. A fast trigger proposes a turn end. A verifier decides if the floor changes and who speaks next.
- Fukuda and colleagues test LLMs on addressee, turn change, and next speaker in AMI meetings (Interspeech 2026) [13]. LLMs beat humans on next speaker from text. They are worse than humans on addressee and turn change from raw signals.
- Addressee detection from text started with the Ubuntu IRC corpus [14]. A GPT-4o benchmark on multi-modal triads reports weak next-speaker accuracy [15].

**Human-robot groups.**

- Bohus and Horvitz use gaze, gesture, and speech to manage a multi-party agent [16].
- Skantze, Johansson, and Beskow analyze 373 three-party games with the Furhat robot [17]. The robot's gaze shapes who answers next.

**Agents in groups, by text and by voice.**

- MultiLIGHT shows that pairwise models fail at "when to talk" in groups [18].
- MMAgents applies the self-selection rules of [1] to LLM agents in a murder mystery game [19]. Explicit next-speaker selection reduces breakdowns.
- SpeechAgents lets up to 25 LLM agents talk to each other by speech [20].
- ModeratorLM decides when a voice agent speaks from its role in the group (Interspeech 2026) [21].
- MultiTalk scales a Moshi-type full-duplex model to 2 to 9 parties (2026) [22]. Data has one audio channel for each speaker. For training, it mixes all non-target speakers into the user channel.
- MP-Bench tests voice agents as group members (EMNLP 2026 Findings) [23]. Real-time agents stay near chance on multi-party turn-taking.
- Full-Duplex-Bench v1.5 includes a "talking to others" case [24]. The user speaks to a third party, and the agent must not reply.

**Meeting corpora and annotation.**

| Corpus | Setting | Speakers | Annotation |
| --- | --- | --- | --- |
| AMI [25] | Scenario meetings, English | 4 | Headset and array audio, video, words, dialogue acts, addressee subset |
| ICSI [26] | Real meetings, English | 3 to 10 | Headset and table mics, words, dialogue acts |
| CHiME-6 [27] | Dinner parties at home | 4 | Arrays, unsegmented diarization plus ASR |
| CHiME-8 DASR [28] | CHiME-6, DiPCo, Mixer 6, NOTSOFAR-1 | 2 to 8 | Array-agnostic diarization plus ASR |
| NOTSOFAR-1 [29] | Office meetings | 4 to 8 | 315 meetings, single and multi-channel |
| AliMeeting [30] | Mandarin meetings | 2 to 4 | 8-channel array plus headset, 120 h |
| MISP [31] | Chinese living room with TV | several | Audio-visual diarization and recognition |

Diarization uses RTTM files with one `SPEAKER` line for each segment. Scoring uses DER and JER from `dscore` [32]. DER counts false alarm, miss, and speaker confusion over the reference speech time. Recent challenges score overlapped speech with no collar.

### Consensus and disagreements

Consensus:

- Turn-taking is a property of the group, not of one pair. The per-party rules of [1] already cover N parties.
- The input to a model is one voice activity channel for each party [8, 9, 10, 22]. Per-party channels are the standard representation in corpora too [25, 26, 30].
- "When" and "who" are two separate decisions [12, 13]. Timing models answer "when". Addressee and context models answer "who".
- Overlap is normal, not an error [4, 5]. Meeting challenges score it [28, 29].

Disagreements:

- One floor or many. Most models assume one holder at a time [11, 12]. Edelsky's collaborative floor [2] and side talk [24] break this assumption.
- Fixed N or role projection. Triadic VAP trains for exactly three channels [10]. MuVAP and MultiTalk project N parties onto two roles [11, 22]. Projection is scalable but loses who-to-whom detail.
- Text or audio for "who". LLMs are strong on next speaker from transcripts but weak from raw audio [13, 15, 23].

### Open problems

- No standard metric set for N-party agent timing. Each benchmark defines its own [22, 23, 24].
- No shared turn ID or addressee field across datasets. AMI has addressee labels for only a subset [25].
- Agents that hear each other. An agent's playout is input to the other agents. Echo and self-hearing are not solved in published systems [20, 22].
- Side talk and parallel floors. Benchmarks test only "not addressed, stay silent" [23, 24].
- Real-time agents remain near chance on multi-party turn-taking [23].

### Implications for AIRI

The chat domain model is already actor-centric. It has `Actor`, `ChatMember`, `floor` events, and provisional speakers. The voice profile is dyadic. Change it so that the dyad is one case of the N-party model.

**1. One track for each participant.** Replace `session.user` and `session.agent` with `participant.<actorId>`. The states are the union: `initializing`, `idle`, `listening`, `thinking`, `speaking`, `away`. The `actor` key already exists. Each track has its own `speech` spans, `backchannel.detected`, and `thinking` state.

**2. The floor is a set.** Replace the `voice.floor` states (`speaking+user`) with a set of holders. Record `floor.taken` and `floor.released` with `actor`, and `floor.holders` as a list attribute. Overlap is a time where the set has two or more holders. Add an optional `floor.id` for parallel floors [2]. Keep the current states as a derived view for direct chats.

**3. Who-to-whom on each record.**

- Put `turn.addressees` (list of actor IDs) on each turn and speech span. The value can be `all`.
- Put `selection` on each floor transfer: `selected`, `self-selected`, or `continued` [1].
- Put `interrupter` and `interrupted` on `interrupt.started`. Put `listener` and `target` on a backchannel.
- Record each `schedule` decision with the candidate actors, the chosen actor, and the reason. This is the "who" decision [12, 13].

**4. One stream for each participant.** Each input source gets its own `stream.started`: the local mic, each remote user, and each agent playout. A mixed mic with diarization creates provisional actors. The existing `speaker-binding` event maps them later. All streams must use one clock. For each agent, record what it heard: the mixed input at that agent, not only the other actors' outputs. Then agent-to-agent voice is traceable. Mark playout of the same agent as self-audio, so that its VAD does not trigger on itself.

**5. Pairwise metrics.** Define each metric for an ordered pair (from, to), then aggregate:

| Metric | N-party definition | Dyadic case |
| --- | --- | --- |
| Floor transfer offset | For each transfer from A to B: B speech start minus A speech end. Matrix N×N. | The one user→agent cell |
| Response latency of agent B | FTO of transfers to B, split by "B was addressed" and "B self-selected" | User end → agent first audible |
| Overlap | Overlap time for each pair, and time with 3 or more holders | User-agent overlap |
| Interruption | Count, yield rate, and stop latency for each (interrupter, interrupted) pair | Two directions |
| Talk share | Speech time of each actor over total speech time | Talk ratio |
| Wrong take-over | B takes the floor when another actor was addressed | Take-over in a pause |
| Missed turn | B is addressed and does not respond in a budget | Not defined |

The current dyadic numbers are the cells of a 2×2 matrix. No dyadic metric is lost.

**6. Exports.**

- Make a multi-channel WAV or one WAV for each actor, plus RTTM with one speaker label for each actor. RTTM is already N-party [32].
- For Moshi and Full-Duplex-Bench, export a projection for one target agent. The target agent goes to one channel. All other actors are mixed into the other channel. This is the method of MultiTalk [22]. Record the projection in the export metadata.
- For smart-turn clips, add the target actor to each clip.

**7. ADR text.** Change "user speech end" to "end of the previous holder's speech". Remove the assumption of one agent from the Records table. Add the scheduler owner question to Open questions, with links to the chat domain ADR.

### References

1. H. Sacks, E. A. Schegloff, G. Jefferson. "A simplest systematics for the organization of turn-taking for conversation." Language 50(4):696–735, 1974. (unverified)
2. C. Edelsky. "Who's got the floor?" Language in Society 10(3):383–421, 1981.
3. T. Stivers et al. "Universals and cultural variation in turn-taking in conversation." PNAS 106(26):10587–10592, 2009. doi:10.1073/pnas.0903616106
4. M. Heldner, J. Edlund. "Pauses, gaps and overlaps in conversations." Journal of Phonetics 38(4):555–568, 2010. doi:10.1016/j.wocn.2010.08.002. (the overlap share is unverified)
5. S. C. Levinson, F. Torreira. "Timing in turn-taking and its implications for processing models of language." Frontiers in Psychology 6:731, 2015. doi:10.3389/fpsyg.2015.00731
6. G. Skantze. "Turn-taking in conversational systems and human-robot interaction: A review." Computer Speech & Language 67:101178, 2021.
7. G. Castillo-López, G. de Chalendar, N. Semmar. "A Survey of Recent Advances on Turn-taking Modeling in Spoken Dialogue Systems." IWSDS 2025. https://aclanthology.org/2025.iwsds-1.27/
8. E. Ekstedt, G. Skantze. "Voice Activity Projection: Self-supervised Learning of Turn-taking Events." Interspeech 2022. arXiv:2205.09812
9. K. Laskowski, M. Ostendorf, T. Schultz. "Modeling Vocal Interaction for Text-Independent Participant Characterization in Multi-Party Conversation." SIGDIAL 2008. https://aclanthology.org/W08-0124/ (Co-authors not checked.)
10. M. Elmers, K. Inoue, D. Lala, T. Kawahara. "Triadic Multi-party Voice Activity Projection for Turn-taking in Spoken Dialogue Systems." Interspeech 2025. arXiv:2507.07518
11. H. Qi, G. Skantze. "MuVAP: Multimodal Multiparty Voice Activity Projection for Turn-taking Prediction in the Wild." 2026. arXiv:2606.16731
12. R. A. Patamia et al. "Fast When, Careful Who: Dual-Process Multiparty Turn-Taking with Diffusion Augmentation." 2026. arXiv:2606.16568
13. R. Fukuda et al. "Evaluating Large Language Models Abilities for Addressee, Turn-change, and Next Speaker Prediction in Meetings." Interspeech 2026. arXiv:2606.17542
14. H. Ouchi, Y. Tsuboi. "Addressee and Response Selection for Multi-Party Conversation." EMNLP 2016. https://aclanthology.org/D16-1231/
15. "An LLM Benchmark for Addressee Recognition in Multi-modal Multi-party Dialogue." 2025. arXiv:2501.16643 (Authors not checked.)
16. D. Bohus, E. Horvitz. "Facilitating Multiparty Dialog with Gaze, Gesture, and Speech." ICMI-MLMI 2010.
17. G. Skantze, M. Johansson, J. Beskow. "Exploring Turn-taking Cues in Multi-party Human-robot Discussions about Objects." ICMI 2015. doi:10.1145/2818346.2820749
18. J. Wei et al. "Multi-Party Chat: Conversational Agents in Group Settings with Humans and Models." 2023. arXiv:2304.13835
19. "Who Speaks Next? Multi-party AI Discussion Leveraging the Systematics of Turn-taking in Murder Mystery Games." 2024. arXiv:2412.04937 (Authors not checked.)
20. D. Zhang et al. "SpeechAgents: Human-Communication Simulation with Multi-Modal Multi-Agent Systems." 2024. arXiv:2401.03945
21. S. Mitra et al. "Adaptive Turn-Taking for Real-time Multi-Party Voice Agents." Interspeech 2026. arXiv:2606.13544
22. K. Wang et al. "MultiTalk: Scaling Full-Duplex Speech Models to Long, Multi-Party, Bilingual Conversation." 2026. arXiv:2609.36903
23. Y.-J. Shih et al. "MP-Bench: Evaluating Voice Agents as a Multiparty Conversation Participant." EMNLP 2026 Findings. arXiv:2609.13076
24. G.-T. Lin et al. "Full-Duplex-Bench v1.5: Evaluating Overlap Handling for Full-Duplex Speech Models." ICASSP 2026. arXiv:2507.23159
25. J. Carletta et al. "The AMI Meeting Corpus: A Pre-announcement." MLMI 2005. (unverified)
26. A. Janin et al. "The ICSI Meeting Corpus." ICASSP 2003. (unverified)
27. S. Watanabe et al. "CHiME-6 Challenge: Tackling Multispeaker Speech Recognition for Unsegmented Recordings." CHiME 2020. arXiv:2004.09249
28. S. Cornell et al. "The CHiME-8 DASR Challenge for Generalizable and Array Agnostic Distant Automatic Speech Recognition and Diarization." 2024. arXiv:2407.16447
29. A. Vinnikov et al. "NOTSOFAR-1 Challenge: New Datasets, Baseline, and Tasks for Distant Meeting Transcription." Interspeech 2024. arXiv:2401.08887
30. F. Yu et al. "M2MeT: The ICASSP 2022 Multi-Channel Multi-Party Meeting Transcription Challenge." ICASSP 2022. arXiv:2110.07393
31. "The First Multimodal Information Based Speech Processing (MISP) Challenge: Data, Tasks, Baselines and Results." ICASSP 2022. https://mispchallenge.github.io/ (Authors not checked.)
32. N. Ryant. `dscore` diarization scoring tools. https://github.com/nryant/dscore

## Full-duplex spoken dialogue

### State of the art

Recent surveys sort systems by where the turn-taking decision is made [1][2][3][19]. Chen and Yu split "engineered" (modular) from "learned" (end-to-end) synchronization [1]. Lu et al. add a four-level hierarchy (L0 to L3) and a decision state machine with five states: IDLE, LISTEN, SPEAK, WAIT, DUAL [2].

**Cascaded pipelines.** VAD, streaming ASR, an end-of-turn detector, a text LLM, and streaming TTS run as separate stages. Pipecat and LiveKit Agents are the common frameworks [20][21]. Turn detection moved from silence timeouts to semantic detectors:

- Smart Turn v3 reads audio [22].
- The LiveKit turn detector reads the transcript and predicts an end-of-utterance token [23].
- OpenAI Realtime `semantic_vad` has an `eagerness` setting with 2 to 8 s timeouts [24].
- A 0.5B LLM emits four control tokens for turn-keep, turn-switch, and intentional or unintentional barge-in [14].

Kyutai Unmute wraps a text LLM with streaming STT, semantic VAD, and TTS [25]. Cascades still win on task accuracy and document grounding [16][18].

**Half-duplex end-to-end models.** These models take speech in and give speech out, but keep explicit turns.

- Mini-Omni and Mini-Omni2 generate text and audio tokens in parallel ("talk while thinking") [4][5].
- LLaMA-Omni and LLaMA-Omni2 attach a streaming speech decoder to an LLM [6][7].
- GLM-4-Voice interleaves text and speech tokens [8].
- VITA-Audio predicts several audio tokens per step to cut first-packet latency [9].
- Step-Audio, Step-Audio 2, and Kimi-Audio are large unified audio LLMs [10][11][12].
- Qwen2.5-Omni and Qwen3-Omni split the model into a "Thinker" (text) and a "Talker" (speech) [13][26].
- Freeze-Omni keeps the LLM frozen and adds a chunk-level state predictor for barge-in [15].

**Full-duplex end-to-end models.** These models listen and speak at the same time.

- dGSLM models two speaker channels without text [27].
- Moshi models user audio and its own audio as parallel streams. A time-aligned text "Inner Monologue" comes before its audio tokens. The practical latency is about 200 ms [28].
- PersonaPlex (NVIDIA) builds on Moshi and adds role and voice prompts [29].
- SyncLLM adds a real-time clock to Llama 3 and interleaves the two speakers in time slots [30].
- OmniFlatten flattens text and speech of both speakers into one sequence for a GPT backbone [31].
- SALMONN-omni is codec-free and predicts duplex state tokens [32].
- NemotronLabs VoiceChat has parallel output streams for agent text and function calls. It also has an RNN-T branch for user transcripts [33].

Commercial systems include OpenAI Realtime, Gemini Live, and Amazon Nova Sonic. Their public events include server VAD, `interrupted`, and audio truncation, as shown in [24][34]. Sesame CSM is a conversational TTS model that uses the dialogue context [35].

**Two modeling styles.** Time-multiplexed models (SyncLLM, OmniFlatten) alternate the two channels in fixed time chunks. Dual-stream models (Moshi, PersonaPlex) predict both channels at each frame. Thinker-talker models are a third shape. A text model plans and a speech model renders, so speculative and early speech starts before the plan is complete.

### Evaluation

| Benchmark | Measures |
| --- | --- |
| Full-Duplex-Bench v1 [16a] | Pause handling, backchannel, smooth turn-taking, user interruption. Take-over rate (TOR), response latency, backchannel frequency and JSD. |
| Full-Duplex-Bench v1.5 [16b] | Overlap: interruption, backchannel, talking to others, background speech. Behavior class (respond, resume, uncertain, unknown). Stop latency (user onset → agent stops). Response latency (user end → agent starts). Prosody change, UTMOSv2. |
| Full-Duplex-Bench v2 [16c] | Multi-turn, with an automated examiner over WebRTC. Fast and slow pacing. Daily, correction, entity tracking, safety. |
| Full-Duplex-Bench v3 [16] | Tool use under real disfluent speech. Pass@1, turn-taking, latency from listening to tool call to speech. |
| τ-Voice [17] | 278 tasks with a voice user simulator, noise, and accents. Voice agents keep only 30 to 45% of text task success. |
| Talking Turns [36] | A model trained on human turn-taking judges when the system speaks, backchannels, or interrupts. |
| MTR-DuplexBench [37], M3-DuplexBench [38] | Multi-round, turn-by-turn scoring. M3 adds Japanese. |
| Duplex-MPE [39], MP-Bench [40] | Multi-party: when to answer, stay silent, or stop |
| Duplex Cue [41] | Continue, adapt, or yield during overlap |
| VoiceBench [42], URO-Bench [43], Big Bench Audio [44] | Content quality from spoken input (half-duplex). Big Bench Audio also reports first-packet latency. |

All timing metrics are measured on the output audio with a VAD (Silero in [16b]), not on internal events. Human studies use MOS, comparative MOS, and naturalness and meaningfulness ratings [28][30]. LLM judges score content. The Artificial Analysis Speech to Speech Index combines Big Bench Audio, Full-Duplex-Bench, and τ-Voice [45].

### Consensus and disagreements

Consensus:

- Measure latency from the user speech end to the first agent audio. Measure stop latency from the user speech onset to the agent audio stop.
- Take-over rate is the main turn-taking statistic. Its target depends on the context. It is low after a pause or backchannel and high after a real turn end or interruption.
- Separate timing quality from content quality. The two-axis reward model [46] and Big Bench Audio [44] both do this.
- Voice agents lose task accuracy compared with text agents [17][18].

Disagreements:

- "Full-duplex" has no common definition [2].
- Systems take one of two strategies. "Responsive" systems yield fast. "Floor-holding" systems filter overlap [16b]. No benchmark says which strategy is correct.
- Overlap outcomes are binary (continue or stop) in most benchmarks. Duplex Cue adds a third outcome, "adapt" [41].
- Judges differ. Some benchmarks use a trained turn-taking model, others use an LLM, others use humans. Scores do not transfer between them.
- End-to-end models win on latency. Cascades win on accuracy, grounding, and tool use [16][18]. In FDB-v3, the cascade had perfect turn-taking but 10.12 s latency.

### Open problems

- Models believe they said text that the user never heard. "Self-listening" feeds the played audio back as an input stream [47].
- Models take the floor when asked, not when needed. They rarely correct false claims or warn of hazards [48].
- Multi-party addressing is near chance [39][40].
- Multi-turn consistency, entity tracking, and self-corrections fail often [16c][16][37].
- Synchronous training data is scarce [1][2].

### Implications for AIRI

**States to cover.** The trace must show the same states for both architectures:

| Concept | Cascaded source | End-to-end source |
| --- | --- | --- |
| Floor state (IDLE, LISTEN, SPEAK, WAIT, DUAL) | Controller state | Derived from the two audio channels, or from duplex state tokens [32] |
| User and agent speech | VAD spans | VAD on the input and playout streams |
| Text stream | ASR partials, LLM tokens | Inner monologue, Thinker output, user transcript branch |
| End-of-turn decision | `endpoint.decided` | Control tokens or provider events (`speech_stopped`, `activityEnd`) |
| Overlap outcome | Gate verdict | Derived from audio and transcripts |
| Truncation | `output.truncated` | Provider truncate events, played audio |
| Tool call | Tool span | Function-call stream [33] |

**Changes to the ADR.**

1. Map `voice.floor` to the five-state machine of [2]. Add `idle` and `wait`. Treat `dual` as the `+user` states.
2. Split the barge-in gate into two attributes. `overlap.intent` takes `interruption`, `backchannel`, `collaboration`, `side-talk`, `background`, `noise`. `overlap.response` takes `continue`, `adapt`, `yield`. This matches [16b] and [41].
3. Mark each record as `reported` (the producer emitted it) or `observed` (derived from audio). End-to-end and commercial systems do not expose internal decisions.
4. Add a `voice.text` track for model text that runs ahead of the audio. Keep "planned" and "heard" separate. This supports self-listening analysis [47].
5. Add `floor.take.reason` (`addressed`, `silence`, `self-select`, `tool-result`). Add an `addressee` attribute for multi-party scenes [39][48].
6. Add a filler-speech state during tool calls. FDB-v3 measures the time from listening to tool call to speech [16].
7. Record the VAD model and its settings on `stream.started`. Benchmark timing depends on the VAD.

**Metrics stable enough to standardize.** Response latency, stop latency, take-over rate for each context, and the overlap behavior class have identical definitions across [16a][16b][16]. Talk ratio, gaps, and overlaps from `speech` spans are also stable. Keep MOS, LLM-judge quality, and Talking Turns agreement as annotations. They depend on the judge.

### References

All entries below were checked against arXiv, GitHub, or the vendor page on 2026-10-23. None is unverified.

1. Y. Chen, H. Yu. "From Turn-Taking to Synchronous Dialogue: A Survey of Full-Duplex Spoken Language Models." arXiv 2509.14515, 2025. https://arxiv.org/abs/2509.14515
2. J. Lu et al. "A Survey of Full-Duplex Spoken Dialogue Systems: Architectural Hierarchy, Interaction Ontology, and Decision State Machine." arXiv 2606.19453, 2026. https://arxiv.org/abs/2606.19453
3. S. Ji et al. "WavChat: A Survey of Spoken Dialogue Models." arXiv 2411.13577, 2024. Also: S. Arora et al. "On The Landscape of Spoken Language Models." TMLR, arXiv 2504.08528, 2025. https://arxiv.org/abs/2411.13577
4. Z. Xie et al. "Mini-Omni." arXiv 2408.16725, 2024. https://arxiv.org/abs/2408.16725
5. Z. Xie et al. "Mini-Omni2." arXiv 2410.11190, 2024. https://arxiv.org/abs/2410.11190
6. Q. Fang et al. "LLaMA-Omni." ICLR 2025, arXiv 2409.06666. https://arxiv.org/abs/2409.06666
7. Q. Fang et al. "LLaMA-Omni2." arXiv 2505.02625, 2025. https://arxiv.org/abs/2505.02625
8. A. Zeng et al. "GLM-4-Voice." arXiv 2412.02612, 2024. https://arxiv.org/abs/2412.02612
9. Z. Long et al. "VITA-Audio." arXiv 2505.03739, 2025. https://arxiv.org/abs/2505.03739
10. A. Huang et al. (StepFun). "Step-Audio." arXiv 2502.11946, 2025. https://arxiv.org/abs/2502.11946
11. B. Wu et al. (StepFun). "Step-Audio 2 Technical Report." arXiv 2507.16632, 2025. https://arxiv.org/abs/2507.16632
12. Kimi Team. "Kimi-Audio Technical Report." arXiv 2504.18425, 2025. https://arxiv.org/abs/2504.18425
13. J. Xu et al. (Qwen). "Qwen2.5-Omni Technical Report." arXiv 2503.20215, 2025. https://arxiv.org/abs/2503.20215
14. H. Zhang et al. "LLM-Enhanced Dialogue Management for Full-Duplex Spoken Dialogue Systems." arXiv 2502.14145, 2025. https://arxiv.org/abs/2502.14145
15. X. Wang et al. "Freeze-Omni." arXiv 2411.00774, 2024. https://arxiv.org/abs/2411.00774
16. G.-T. Lin et al. "Full-Duplex-Bench-v3: Benchmarking Tool Use for Full-Duplex Voice Agents Under Real-World Disfluency." arXiv 2604.04847, 2026. https://arxiv.org/abs/2604.04847
    - 16a. "Full-Duplex-Bench." ASRU 2025, arXiv 2503.04721. https://arxiv.org/abs/2503.04721
    - 16b. "Full-Duplex-Bench v1.5." ICASSP 2026, arXiv 2507.23159. https://arxiv.org/abs/2507.23159
    - 16c. "Full-Duplex-Bench-v2." ACL 2026, arXiv 2510.07838. https://arxiv.org/abs/2510.07838
    - Code: https://github.com/DanielLin94144/Full-Duplex-Bench
17. S. Ray et al. "τ-Voice: Benchmarking Full-Duplex Voice Agents." arXiv 2603.13686, 2026. https://arxiv.org/abs/2603.13686
18. P. Mathur et al. "DuplexSpeechBench-Document Grounding." arXiv 2610.00316, 2026. https://arxiv.org/abs/2610.00316
19. W. Cui et al. "Recent Advances in Speech Language Models: A Survey." ACL 2025, arXiv 2410.03751. https://arxiv.org/abs/2410.03751
20. Pipecat. https://docs.pipecat.ai
21. LiveKit Agents. https://github.com/livekit/agents
22. Smart Turn. https://github.com/pipecat-ai/smart-turn and https://www.daily.co/blog/announcing-smart-turn-v3-with-cpu-inference-in-just-12ms/
23. LiveKit turn detector. https://huggingface.co/livekit/turn-detector
24. OpenAI Realtime API, client and server events. https://developers.openai.com/api/reference/resources/realtime/client-events
25. Kyutai Unmute. https://github.com/kyutai-labs/unmute
26. J. Xu et al. (Qwen). "Qwen3-Omni Technical Report." arXiv 2509.17765, 2025. https://arxiv.org/abs/2509.17765
27. T. A. Nguyen et al. "Generative Spoken Dialogue Language Modeling" (dGSLM). TACL 2023, arXiv 2203.16502. https://arxiv.org/abs/2203.16502
28. A. Défossez et al. (Kyutai). "Moshi: a speech-text foundation model for real-time dialogue." arXiv 2410.00037, 2024. https://arxiv.org/abs/2410.00037
29. NVIDIA. PersonaPlex. https://github.com/NVIDIA/personaplex and https://research.nvidia.com/labs/adlr/personaplex
30. B. Veluri et al. "Beyond Turn-Based Interfaces: Synchronous LLMs as Full-Duplex Dialogue Agents" (SyncLLM). EMNLP 2024, arXiv 2409.15594. https://arxiv.org/abs/2409.15594
31. Q. Zhang et al. "OmniFlatten." arXiv 2410.17799, 2024. https://arxiv.org/abs/2410.17799
32. W. Yu et al. "SALMONN-omni." arXiv 2411.18138, 2024. https://arxiv.org/abs/2411.18138
33. J. Balam et al. "NemotronLabs VoiceChat." arXiv 2609.21967, 2026. https://arxiv.org/abs/2609.21967
34. Gemini Live API reference. https://ai.google.dev/api/live
35. Sesame. CSM. https://github.com/SesameAILabs/csm
36. S. Arora et al. "Talking Turns." ICLR 2025, arXiv 2503.01174. https://arxiv.org/abs/2503.01174
37. H. Zhang et al. "MTR-DuplexBench." Findings of ACL 2026, arXiv 2511.10262. https://arxiv.org/abs/2511.10262
38. R. Fukuda et al. "M3-DuplexBench." arXiv 2607.29125, 2026. https://arxiv.org/abs/2607.29125
39. C. Ma et al. "Duplex-MPE." arXiv 2609.31948, 2026. https://arxiv.org/abs/2609.31948
40. Y.-J. Shih et al. "MP-Bench." arXiv 2609.13076, 2026. https://arxiv.org/abs/2609.13076
41. Y. Lu et al. "Continue, Adapt, or Yield" (Duplex Cue). arXiv 2609.13117, 2026. https://arxiv.org/abs/2609.13117
42. Y. Chen et al. "VoiceBench." arXiv 2410.17196, 2024. https://arxiv.org/abs/2410.17196
43. R. Yan et al. "URO-Bench." arXiv 2502.17810, 2025. https://arxiv.org/abs/2502.17810
44. Artificial Analysis. Big Bench Audio. https://github.com/huggingface/blog/blob/main/big-bench-audio-release.md
45. Artificial Analysis. Speech to Speech Index. https://artificialanalysis.ai/articles/announcing-the-artificial-analysis-speech-to-speech-index
46. Y. Chen et al. "Dual-Axis Generative Reward Model." arXiv 2604.14920, 2026. https://arxiv.org/abs/2604.14920
47. X. Zhou et al. "What Did I Just Say? Self-Listening for Full-Duplex Speech Models." arXiv 2609.05592, 2026. https://arxiv.org/abs/2609.05592
48. L. Peng et al. "Full-Duplex Speech Models Take the Floor When Asked, Not When Needed." arXiv 2609.19596, 2026. https://arxiv.org/abs/2609.19596

## Agent observability and evaluation

Sources were checked on 2026-10-23. The OTel GenAI facts come from `open-telemetry/semantic-conventions-genai` at commit `9ffc7e00` (2026-10-21).

### State of the art

**Standards.**

- OTel moved the GenAI conventions to their own repository on 2026-05-05 [1]. All spans, events, and attributes have Development stability. The repository has no schema URL yet.
- The well-known `gen_ai.operation.name` values are `chat`, `generate_content`, `text_completion`, `embeddings`, `retrieval`, `execute_tool`, `create_agent`, `invoke_agent`, `invoke_workflow`, `plan`, `fetch_response`, and the memory operations `create_memory`, `search_memory`, `update_memory`, `upsert_memory`, `delete_memory`, and two store operations [1][2].
- `invoke_agent` has a `CLIENT` form for a remote agent and an `INTERNAL` form for an in-process agent. Inference spans are `CLIENT`. Tool, plan, and workflow spans are `INTERNAL` [2].
- `invoke_workflow` is only for an entry point that the user sees. It is not for a runner that an agent starts to delegate to a sub-agent [2].
- There is no handoff span and no sub-agent span. A sub-agent is a nested `invoke_agent` span.
- Evaluations are a `gen_ai.evaluation.result` event with `gen_ai.evaluation.name`, `score.value`, `score.label`, and `explanation`. The event has the evaluated span as parent. Without a span, it carries `gen_ai.response.id` [3].
- Content is off by default and is opt-in [4]. Content attributes are `gen_ai.system_instructions`, `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.tool.call.arguments`, and `gen_ai.tool.call.result`. Production use can upload content through a hook and keep only a reference. The reference format is still "TODO". Streaming chunks are also "TODO".
- MCP spans propagate W3C `traceparent`, `tracestate`, and `baggage` in `params._meta`, not in the transport headers [5]. One MCP request can use many HTTP requests, so the two contexts are independent.
- A2A guidance tells agents to send W3C Trace Context on each call [6]. Its span conventions are an open proposal [7].
- OpenInference (Arize) uses `openinference.span.kind` with 11 values: `LLM`, `EMBEDDING`, `CHAIN`, `RETRIEVER`, `RERANKER`, `TOOL`, `AGENT`, `GUARDRAIL`, `EVALUATOR`, `PROMPT`, and `DECISION` [8]. Sessions use `session.id`, and graphs use `graph.node.id` and `graph.node.parent_id`.
- OpenLLMetry (Traceloop) uses `workflow`, `task`, `agent`, and `tool` span kinds [9].

**Frameworks and products.**

- OpenAI Agents SDK has trace-level `workflow_name` and `group_id`. The group ID links traces of one conversation [10]. Span types are `agent`, `generation`, `function`, `guardrail`, `handoff`, `transcription`, `speech`, `speech_group`, `task`, `turn`, and `custom`. Processors are pluggable. Sensitive data is on by default. Audio has its own switch.
- Google ADK emits OTel spans `invoke_agent`, `call_llm`, and `execute_tool`. Content capture is opt-in through `captureMessageContent` [11].
- Mastra uses `AGENT_RUN`, `MODEL_GENERATION`, `TOOL_CALL`, and workflow step spans. It has a sensitive data filter on by default. Exporters map these types to `gen_ai.invoke_agent`, `gen_ai.chat`, and `gen_ai.execute_tool` [12].
- Langfuse has 10 observation types: `span`, `generation`, `event`, `agent`, `tool`, `chain`, `retriever`, `evaluator`, `embedding`, and `guardrail` [13]. A score targets exactly one of a trace, an observation, a session, or a dataset run. Score sources are `API`, `EVAL`, and `ANNOTATION` [14].
- LangSmith has runs inside traces, and threads through a `thread_id` metadata key. Feedback is a key and score on one run [15].
- Arize Phoenix has span annotations with a label, a score, and an explanation. The annotator kind is `HUMAN`, `LLM`, or `CODE` [16].
- Braintrust span types are `llm`, `score`, `function`, `eval`, `task`, `tool`, and `review`. Scores in the range 0 to 1 attach to spans [17].
- Pydantic Logfire is OTel-native. It scrubs values with regex patterns, for example `password` and `api_key`, before export [18].

**Research.**

- AgentOps taxonomy (2024) lists the artifacts to trace across the agent lifecycle [19].
- MAST (2025) built a failure taxonomy from 150 traces with kappa 0.88. It has 14 failure modes in 3 groups: system design, inter-agent misalignment, and task verification. MAST-Data has 1600+ annotated traces from 7 frameworks [20].
- TRAIL (2025) has 148 traces with 841 annotated errors. The best model found only 11% of the error locations and categories correctly [21]. Long traces are hard for LLM judges.
- Agent-as-a-Judge (2024) judges each step of a trajectory, not only the final result [22].
- τ-bench (2024) defines pass^k, the chance that all k trials succeed. Its retail pass^8 for GPT-4o was below 25% [23]. Reliability needs many runs of one task.
- A 2026 survey on execution provenance models a run as a typed graph. It finds no benchmark that checks the full provenance chain [24].

### Consensus and disagreements

**Consensus.**

- A minimal span taxonomy exists: agent run, model call, tool call, and an optional workflow or chain. Every system above has these four.
- Retrieval, embedding, guardrail, and evaluator spans are common second-tier types.
- A conversation key groups traces: `gen_ai.conversation.id`, `session.id`, `thread_id`, or `group_id`.
- An evaluation is a separate record that points to a target. It has a name, a numeric score or a label, an explanation, and an author kind.
- Trace context crosses process boundaries in the W3C format, also inside MCP and A2A messages.

**Disagreements.**

- *Content default.* OTel, ADK, and Mastra keep content off or filtered. OpenAI Agents SDK keeps it on.
- *Handoff.* OpenAI has a `handoff` span. OTel has none. OTel issue 243 asks how to show many agents on one span, and it has no answer [25].
- *Score target level.* Langfuse allows session, trace, observation, and dataset run. OTel allows only a span or a response ID. OTel issue 590 proposes `gen_ai.evaluation.level` and `score.direction` [26].
- *Decisions.* Only OpenInference has a `DECISION` kind for a choice among candidates.
- *Workflow versus agent.* This boundary is still under debate in OTel issue 477 [27].

### Open problems

- **Async and durable work.** OTel has no events for pause, resume, or checkpoint. Issues 159 and 462 are open [28][29]. A parent span cannot hold work that ends after it.
- **Long sessions.** OTel has no session span. Realtime session and turn modeling is open in issue 567 and PR 394 [30]. Turn number (`gen_ai.agent.turn`) and conversation root are proposals.
- **Multi-agent identity.** A span records only the current agent. The root agent and the caller agent are lost.
- **Streaming.** Chunk events and time-to-chunk definitions are not settled.
- **Judge quality.** TRAIL shows that LLM judges miss most localized errors in long traces.
- **Provenance and tamper evidence.** Few systems sign or attest traces [24].

### Implications for AIRI

**Align with these.**

- Map agent profile spans to `gen_ai.operation.name` in the OTLP exporter:
  - a chat request to `chat`
  - a tool call to `execute_tool`
  - a sub-agent run to `invoke_agent`, with `gen_ai.agent.name` and `gen_ai.agent.id`
  - `memory.write` to `create_memory`, `update_memory`, or `delete_memory`
  - a memory search to `search_memory`
- Use the `gen_ai.memory.*` attributes for memory spans.
- Map the AIRI chat topic or session to `gen_ai.conversation.id`. Then Langfuse, Phoenix, and LangSmith group the traces.
- Fix the export table. The ADR exports all spans as `SPAN_KIND_INTERNAL`. OTel uses `CLIENT` for model calls and remote agents.
- Put the agent ID on every record of a sub-agent. All tools lose the caller agent otherwise.
- For plugins and MCP tools, carry W3C `traceparent` in the message metadata. Use the MCP `params._meta` keys.

**Avoid these.**

- Do not export background work as children of an ended turn span. Export a decision, a memory write, or a sub-agent that outlives its turn as a new OTLP trace. Give it a span link to the cause. OTel uses this pattern for messaging.
- Do not add a handoff span type. Record a handoff as an instant, for example `agent.handed_off`, with `causes`. OTel has no handoff span to map it to.
- Do not depend on OTel proposals that are still open, such as `gen_ai.agent.turn` or `gen_ai.evaluation.level`.

**Changes to the agent profile.**

- Add a registered end reason for an agent loop: `max-steps`, `handed-off`, and `awaiting-input`. OTel issue 171 proposes `gen_ai.agent.finish_reason` [31].
- Add `state` records on a sub-agent track for `running`, `paused`, `waiting`, and `done`. This covers the gap in OTel issue 159.
- Keep the `decision.*` attributes. On export, add `openinference.span.kind=DECISION`.

**Changes to annotations.**

- Add `explanation` to the `annotation` record. OTel, Phoenix, and Langfuse all have it.
- Allow a target at session, turn, or span level through `target.ids`, for example `{ topic }`. Export a session-level annotation as an OTLP log record with `gen_ai.conversation.id`, and no span parent.
- Map `by` to an author kind: `human` to `HUMAN`, `llm` to `LLM`, and `heuristic` to `CODE`. Keep the model ID in a separate field.
- Register a `direction` (`maximize` or `minimize`) with each annotation name.
- Reserve a namespace for failure labels, for example `failure.mast.<mode>`. Then MAST and TRAIL labels can become datasets.
- For pass^k, give each eval run a `run` ID key. Then many trials of one task group together.

**Content policy.**

- The `.content.` rule does not catch OTel content attributes. Register `gen_ai.system_instructions`, `gen_ai.input.messages`, `gen_ai.output.messages`, `gen_ai.tool.call.arguments`, `gen_ai.tool.call.result`, and `gen_ai.memory.query.text` as content in the filter.
- Proposed default: keep content in the live buffer. Remove content from files on disk and from all exports unless a developer setting is on. This matches OTel, ADK, and Mastra.
- Add value scrubbing for secrets in non-content attributes, like Logfire. Tool arguments can hold API keys.
- Store large content, such as audio or long prompts, by reference. Put a URI on the record. This follows the OTel upload hook.

**Exports.**

- Write the pinned semconv commit into the export metadata.
- Add an optional OpenInference attribute set, so Phoenix shows the span kinds.
- Add a trajectory export: ordered tool calls and messages for each turn. ADK trajectory match and Agent-as-a-Judge use this shape.

### References

1. OpenTelemetry. semantic-conventions-genai repository, 2026. https://github.com/open-telemetry/semantic-conventions-genai (read at commit `9ffc7e00`)
2. OpenTelemetry. GenAI agent and framework spans, 2026. https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md
3. OpenTelemetry. GenAI events, `gen_ai.evaluation.result`, 2026. https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-events.md
4. OpenTelemetry. GenAI spans, "Capturing instructions, inputs, and outputs", 2026. https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md
5. OpenTelemetry. Semantic conventions for MCP, context propagation, 2026. https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/mcp.md
6. A2A Project. Enterprise-ready features. https://github.com/a2aproject/A2A/blob/main/docs/topics/enterprise-ready.md (seen in search result only, unverified)
7. A2A Project. Issue 2103, "Distributed Tracing Semantic Conventions for A2A", 2026, open. https://github.com/a2aproject/A2A/issues/2103
8. Arize. OpenInference semantic conventions. https://github.com/Arize-ai/openinference/blob/main/spec/semantic_conventions.md
9. Traceloop. OpenLLMetry `TraceloopSpanKindValues`. https://github.com/traceloop/openllmetry/tree/main/packages/opentelemetry-semantic-conventions-ai
10. OpenAI. Agents SDK tracing. https://openai.github.io/openai-agents-python/tracing/
11. Google. ADK observability. https://adk.dev/observability/
12. Mastra. AI tracing overview and Datadog exporter. https://mastra.ai/docs/v0/observability/ai-tracing/overview and https://mastra.ai/reference/observability/tracing/exporters/datadog (exporter mapping from search summary, unverified)
13. Langfuse. Observation types. https://langfuse.com/docs/observability/features/observation-types
14. Langfuse. Scores data model. https://langfuse.com/docs/evaluation/evaluation-methods/data-model
15. LangChain. LangSmith observability concepts. https://docs.langchain.com/langsmith/observability-concepts
16. Arize. Phoenix annotations concepts. https://arize.com/docs/phoenix/tracing/concepts-tracing/annotations-concepts
17. Braintrust. Customize traces. https://www.braintrust.dev/docs/guides/traces/customize
18. Pydantic. Logfire scrubbing. https://pydantic.dev/docs/logfire/instrument/scrubbing/
19. Dong, Lu, Zhu. "AgentOps: Enabling Observability of LLM Agents", 2024. https://arxiv.org/abs/2411.05285 (abstract only)
20. Cemri, Pan, Yang, et al. "Why Do Multi-Agent LLM Systems Fail?", 2025. https://arxiv.org/abs/2503.13657
21. Deshpande, Gangal, et al. "TRAIL: Trace Reasoning and Agentic Issue Localization", Patronus AI, 2025. https://arxiv.org/abs/2505.08638
22. Zhuge, et al. "Agent-as-a-Judge: Evaluate Agents with Agents", 2024. https://arxiv.org/abs/2410.10934
23. Yao, Shinn, Razavi, Narasimhan. "τ-bench", 2024. https://arxiv.org/abs/2406.12045
24. Wang, et al. "From Agent Traces to Trust: A Survey of Evidence Tracing and Execution Provenance in LLM Agents", 2026. https://arxiv.org/abs/2606.04990
25. OpenTelemetry GenAI. Issue 243, "How to represent multiple agents on the same telemetry", open. https://github.com/open-telemetry/semantic-conventions-genai/issues/243
26. OpenTelemetry GenAI. Issue 590, "Evaluation result: score direction, result level, rating scale and tags", open. https://github.com/open-telemetry/semantic-conventions-genai/issues/590
27. OpenTelemetry GenAI. Issue 477, "Agent vs workflow", open. https://github.com/open-telemetry/semantic-conventions-genai/issues/477 (title only)
28. OpenTelemetry GenAI. Issue 159, async agent lifecycle events, open. https://github.com/open-telemetry/semantic-conventions-genai/issues/159
29. OpenTelemetry GenAI. Issue 462, durable agentic runtime execution, open. https://github.com/open-telemetry/semantic-conventions-genai/issues/462
30. OpenTelemetry GenAI. Issue 567 and PR 394, realtime session and turn modeling, open. https://github.com/open-telemetry/semantic-conventions-genai/issues/567
31. OpenTelemetry GenAI. Issue 171, `gen_ai.agent.finish_reason`, open. https://github.com/open-telemetry/semantic-conventions-genai/issues/171 (title only)

Not covered with a verified source: CrewAI, LangGraph Studio, W&B Weave (docs redirect failed), AgentBench, SWE-bench trajectory formats, and the OTel 2025 agent observability blog (search result only: https://opentelemetry.io/blog/2025/ai-agent-observability/).

## Event sourcing, projections, and replay

### State of the art

**Event sourcing and CQRS.** Fowler defines event sourcing as state that is a fold of an ordered event log [1]. Marten names three projection lifecycles: inline (in the write transaction), async (a background daemon with a checkpoint), and live (computed on demand, not stored) [2]. Marten and Greg Young treat schema change as an upcast on read: a function changes an old event shape into the current shape [3][4]. EventStoreDB (now Kurrent) catch-up subscriptions read history from a checkpoint, then switch to live mode and signal `CaughtUp` [5]. The subscriber, not the store, owns the checkpoint.

**Compaction and late joiners.** Kafka log compaction keeps at least the last value for each key in a partition. Offsets and order do not change. A tombstone deletes a key [6]. A new consumer rebuilds current state from the compacted topic. Kafka Streams reads such a topic as a `KTable`, which is a changelog with upsert semantics [7].

**Time semantics.** The Dataflow model separates event time from processing time [8]. A watermark is a heuristic lower bound on the event time of future input. Triggers decide when a window emits. Allowed lateness decides how long state stays open after the watermark. Retractions undo an earlier emitted result. Flink implements allowed lateness with a default of 0, re-fires a window for each late element, and sends later elements to a side output [9]. Differential dataflow keeps collections as timestamped diffs and updates outputs incrementally [10]. Materialize builds incremental view maintenance on it [11].

**UI and state machine debugging.** Redux DevTools records actions and states, replays actions through the reducer, and limits history with `maxAge` (default 50). `actionSanitizer` and `stateSanitizer` replace large or private values [12]. Elm 0.18 exported the message history and re-ran `update` on import to reproduce a session [13]. The export carried type metadata to reject an incompatible program. The Stately Inspector receives three event kinds: actor created, event sent, and snapshot changed [14]. A snapshot event lets a viewer show state without the full history. Vue DevTools has timeline layers with events and group IDs [15]. rr records only the non-deterministic inputs of a process and replays the rest deterministically [16]. Replay.io applies the same idea to the browser [U1].

**Trace viewers.** Perfetto packets can carry incremental state, as in video inter-frame coding [17]. After a loss, the service sets `previous_packet_dropped`. A reader skips packets on that sequence until one has `incremental_state_cleared` [17][18]. For ring buffers, `IncrementalStateConfig.clear_period_ms` makes producers drop interning tables and re-emit descriptors on a period [17]. Trace Processor counts losses in a `stats` table with severity `data_loss` [19]. The Chrome DevTools trace engine runs handlers with `reset`, `handleEvent`, `finalize`, and `data` over a sorted, complete trace [20]. Jaeger shows "invalid parent span" when a child arrives without its parent, and skips clock skew adjustment for that span [21]. MCAP puts a message index after each chunk and a chunk index in the summary section, so a reader seeks by time without a full scan [22]. Yjs syncs a late peer with a state vector: the peer sends what it has, and the other side sends only the missing updates [23].

### Consensus and disagreements

Consensus:

- State is a pure fold of an ordered log. The fold is deterministic, so replay gives the same state [1][13][16].
- A late joiner needs a snapshot plus a tail, not the full log. Each system gives this: compaction [6], catch-up with a checkpoint [5], snapshot events [14], periodic keyframes [17], and state vectors [23].
- Loss must be explicit. Perfetto marks dropped packets and keeps loss counters [17][19]. Jaeger marks missing parents [21].
- Event time and arrival time are different axes. Lateness needs a policy, not a silent re-sort [8][9].

Disagreements:

- **Retract or freeze.** The Dataflow model and Flink emit corrections [8][9]. Perfetto and Chrome DevTools build the model after ingest and do not correct a live view [19][20].
- **Snapshot source.** Kafka and Perfetto make the producer re-emit state [6][17]. Marten and Redux make the consumer compute and store snapshots [2][12].
- **Replay granularity.** Redux and Elm replay domain actions through user code [12][13]. rr replays at the system call level and needs no domain model [16].
- **Upcast or reject.** Marten upcasts old events [3]. Elm rejects a history from a different program [13].

### Open problems

- Watermarks for sources without a monotonic clock, for example a plugin over a network. The Dataflow paper accepts that heuristics can be too fast or too slow [8].
- Retractions in UI. A timeline that re-lays out on a late record breaks the user's focus. No surveyed viewer has a standard way to show "this changed after you saw it".
- Snapshot cost against keyframe rate. Perfetto leaves `clear_period_ms` to the user [17].
- Multi-writer state. Last-writer-wins needs a total order. CRDTs merge without one but define merge, not meaning [23].
- Deterministic replay of non-deterministic inputs, for example audio, model output, and timers, without a full rr-style recorder.

### Implications for AIRI

1. **Projection contract.** Define each view as `(state, record) => state`, as the voice-input Projection role does. Use Chrome's `reset`, `handleEvent`, `finalize` shape [20]. A projection has no I/O, no clock, and no Vue refs. The timeline, pipeline, metrics, and event log are four projections of one feed. The disk replay runs the same projections, so live and replay agree.
2. **Pinned state for late joiners.** A ring buffer that evicts a `span.begin` or the last `state` breaks the fold. Keep a pinned set outside the age and count limits: open spans, the latest `state` per track, `source.started`, and `stream.started`. Send it to a new viewer before the buffer, as a catch-up snapshot [5][6]. Mark evicted ranges with a `gap` marker, as Perfetto does [17].
3. **Source epochs.** `seq` restarts when a window reloads. Add `epoch` to `source.started` and to each `TraceRef`. Then `(source, epoch, seq)` is unique. A new epoch closes the open spans of the old epoch with status `cancelled` and reason `source.restarted`.
4. **Watermarks and lateness.** Each source reports a low watermark: no later record has `t` below it. The viewer lays out final geometry only behind the watermark. Ahead of it, items are provisional. A record behind the watermark by more than an allowed lateness goes to a `late` counter and the event log, not into a re-layout [8][9].
5. **Orphan and duplicate rules.** Drop a record with a `(source, epoch, seq)` seen before. Keep a `span.end` without a begin as an orphan item with a marker, as Jaeger does [21]. Hold an orphan for the allowed lateness, then show it. Count each case in a `stats` projection [19].
6. **Single writer per state track.** Register one owner source for each state track. Records from another source go to a warning, not to the state. This removes the need for merge semantics [23].
7. **Indexes.** Recorded files get a sidecar index per time block and track, modeled on MCAP [22]. Each block stores a snapshot of pinned state, so a seek reads one snapshot plus one block.
8. **Vue reactivity.** Keep projection state in plain objects and typed arrays, marked with `markRaw` or `shallowRef`. Publish a version counter at about 20 Hz. Components read through selectors keyed on that counter. Do not make records reactive.
9. **Deterministic replay.** Replay feeds records in `(source, epoch, seq)` order with the recorded receive time. Projections must not read `Date.now()`. Upcasters convert old `format` values on read [3]. A file with an unknown `format` is rejected, as Elm does [13].
10. **Sanitizers.** Apply the `.content.` filter as a sanitizer at the collector, before the buffer and disk [12].

ADR changes:

- **Records:** add `epoch` to `source.started` and `TraceRef`. Add a `watermark` record or field and a `gap` record.
- **Collection:** add the pinned set, the catch-up order (pinned set, buffer, live, `caughtUp`), deduplication, and the late and orphan counters. Change "a record that ends a span keeps its begin" to the pinned-set rule.
- **Viewer:** add the projection contract, the provisional region, the late-record policy, and the reactivity rules.
- **Registries:** add the owner source of each state track.
- **Exports and recording:** add the sidecar index, block snapshots, and `format` upcasters.

### References

1. Martin Fowler, "Event Sourcing", martinfowler.com, 2005. https://martinfowler.com/eaaDev/EventSourcing.html
2. JasperFx, "Projections", Marten documentation. https://martendb.io/events/projections/
3. JasperFx, "Events Versioning", Marten documentation. https://martendb.io/events/versioning.html
4. Greg Young, *Versioning in an Event Sourced System*, Leanpub, 2017. https://leanpub.com/esversioning
5. Kurrent (Event Store), "Catch-up Subscriptions", .NET client docs. https://docs.kurrent.io/clients/dotnet/legacy/v23.3/subscriptions
6. Apache Kafka, "Log Compaction", Kafka documentation, design section. https://kafka.apache.org/documentation/#compaction
7. Apache Kafka, "Kafka Streams: Duality of Streams and Tables" (KTable), Kafka Streams docs. https://kafka.apache.org/documentation/streams/ (unverified: exact page)
8. Tyler Akidau et al., "The Dataflow Model: A Practical Approach to Balancing Correctness, Latency, and Cost in Massive-Scale, Unbounded, Out-of-Order Data Processing", PVLDB 8(12), VLDB 2015. https://www.vldb.org/pvldb/vol8/p1792-Akidau.pdf
9. Apache Flink, "Windows: Allowed Lateness", Flink documentation. https://nightlies.apache.org/flink/flink-docs-master/docs/dev/datastream/operators/windows/
10. Frank McSherry, Derek G. Murray, Rebecca Isaacs, Michael Isard, "Differential Dataflow", CIDR 2013. https://www.microsoft.com/en-us/research/publication/differential-dataflow/
11. Materialize, "Materialize documentation". https://materialize.com/docs/ (unverified: not fetched)
12. reduxjs, "Redux DevTools Extension API: Arguments" (`maxAge`, `actionSanitizer`, `stateSanitizer`). https://github.com/reduxjs/redux-devtools/blob/main/extension/docs/API/Arguments.md
13. Evan Czaplicki, "The Perfect Bug Report" (Elm 0.18), elm-lang.org, 2016. https://elm-lang.org/news/the-perfect-bug-report
14. Stately, "Inspection" and "Stately Inspector", XState docs, 2024. https://stately.ai/docs/inspection
15. Vue.js, "Plugin API Reference" (`addTimelineLayer`, `addTimelineEvent`), Vue DevTools v6 docs. https://devtools-v6.vuejs.org/plugin/api-reference
16. Robert O'Callahan et al., "Engineering Record And Replay For Deployability", USENIX ATC 2017. https://www.usenix.org/system/files/conference/atc17/atc17-o_callahan.pdf
17. Google, "Buffers and dataflow", Perfetto docs. https://perfetto.dev/docs/concepts/buffers
18. Google, "TracePacket" (`previous_packet_dropped`, `sequence_flags`), Perfetto reference. https://perfetto.dev/docs/reference/trace-packet-proto
19. Google, "Trace Processor Stats", Perfetto docs. https://perfetto.dev/docs/analysis/sql-stats
20. ChromeDevTools, `front_end/models/trace` (handlers: `reset`, `handleEvent`, `finalize`, `data`), devtools-frontend. https://github.com/ChromeDevTools/devtools-frontend/tree/main/front_end/models/trace
21. jaegertracing, "invalid parent span IDs ... skipping clock skew adjustment", Jaeger issue #2121. https://github.com/jaegertracing/jaeger/issues/2121
22. Foxglove, "MCAP Format Specification" (chunk index, message index, summary). https://mcap.dev/spec
23. Yjs, "y-protocols sync protocol" (SyncStep1, SyncStep2, state vector). https://github.com/yjs/y-protocols/blob/master/PROTOCOL.md

Unverified:

- U1. Replay.io, "How Replay works", replay.io docs. https://docs.replay.io (unverified: not fetched)
