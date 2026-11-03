# Alice Motion Engine: plano de integração AIRI + PerformanceDirector + Layered Motion Mixer

**Repositório:** [overcyber/airi](https://github.com/overcyber/airi)  
**Local:** \`docs/alice-motion-engine/PLANEJAMENTO_E_HISTORICO_CONVERSA.md\`  
**Data:** 03/11/2026  
**Estado:** PLANEJAMENTO; não representa implementação, execução de testes ou benchmark em hardware.  
**Escopo:** preservar AIRI como plataforma; introduzir direção de performance contínua e composição simultânea de movimento 3D (PMX/MMD primeiro, VRM depois); integrar serviços de IA locais e tornar possível acrescentar geradores neurais.  
**Histórico completo da pesquisa:** seção II, ao final deste arquivo.

---

# PARTE I — PLANEJAMENTO DE ENGENHARIA

## 1. Objetivo verificável

Evoluir Alice de *um avatar que reproduz um clipe por vez* para *um personagem articulado que caminha, usa uma mão para gesticular, orienta cabeça e olhos ao interlocutor, fala com expressão facial, mantém física de cabelo/roupa e interrompe/retoma ações sem saltos visuais*.

**Cenário mínimo de aceitação:** locomotion/walk (membros inferiores) + explain_left (braço e mão esquerda) + gaze_at_user (pescoço/olhos) + speech (morphs labiais) + mood=curious (morphs não labiais) + física secundária, todos simultaneamente em 60 FPS de renderização desejados (30 FPS mínimo de referência) e sem redes remotas. FPS e latência são metas, não resultados medidos.

**Não objetivos da primeira etapa:** treinar um Ani-2 do zero; afirmar paridade com Ani-2; trocar AIRI por xiaoke; controlar cada osso diretamente com tokens de LLM; transformar todos os arquivos GLB automaticamente em PMX. O planejamento deixa essas questões explícitas para não esconder incompatibilidades.

## 2. Evidências do código de origem

| Componente existente | Caminho real / capacidade | Lacuna |
|---|---|---|
| AIRI runtime MMD | \`packages/stage-ui-mmd/src/composables/mmd/animation-manager.ts\`: \`registerClip\`, \`availableClips\`, \`playAction\`, \`playIdle\`, \`setIdleMotion\`; \`AnimationMixer\`, IK, grant, física | Orientado à reprodução de uma ação corrente; ainda não expõe composição por máscaras como contrato público |
| AIRI cena | \`packages/stage-ui-mmd/src/components/scenes/MMD.vue\`: \`syncMotions\`, \`setEmotion\`, \`oneShotAction\`, \`renderLoop\` | Precisará receber comandos de camadas sem violar o loop atual |
| AIRI store | \`packages/stage-ui-mmd/src/stores/mmd.ts\`: store Pinia, broadcast \`mmd-play-one-shot\`, persistência VMD em IndexedDB | Criar eventos tipados para camadas e estados, sem quebrar ações existentes |
| AIRI configurações | \`packages/stage-ui/src/components/scenarios/settings/model-settings/mmd.vue\`: importação, prévia, remoção, morphs e associação de gesto à emoção | Adicionar editor de máscara/camadas, catálogo com metadados e visualização de conflitos |
| AIRI motor Live2D procedural | \`packages/motion-driver-magic\`: VAR/AR-HMM, geração de frames normalizados, crossfade | Não equivale a geração 3D; usar como referência de interface/procedural |
| AIRI VRM | \`packages/stage-ui-three/src/components/Model/VRMModel.vue\` | Carrega idle VRMA e sincroniza expressões/lábios; compositor de múltiplas camadas por desenvolver |
| xiaoke direção | \`companion/frontend/src/engine/director.ts\`: \`PerformanceDirector\`, estados idle/listening/thinking/speaking, foco de cabeça, ênfase vocal, gestos de espera | Há exclusão de controle procedural quando VMD está ativo: adaptar, não copiar de modo ingênuo |
| xiaoke orquestração | \`companion/frontend/src/features/performance/orchestrator.ts\`, \`repertoire.ts\`, \`motion.ts\`, \`stage.ts\` | Acoplamento aos eventos/estado do xiaoke; evitar levar backend e stores inteiras |
| xiaoke modelo 3D | \`stage.ts\` carrega PMX/VRM/GLB, mas \`MotionPlayer\` VMD é anexado ao PMX | Usar PMX/MMD como primeira plataforma para VMD e física |
| Utsuwa | \`src/lib/engine/action-gate.ts\`, \`src/content/docs/guides/animations.md\` | Limites de emote 20 s por gesto e 8 s global; não adotar essa arbitragem rígida |

Fontes de implementação:
- [AIRI stage-ui-mmd README](https://github.com/moeru-ai/airi/blob/main/packages/stage-ui-mmd/README.md)
- [AIRI MMDAnimationManager](https://github.com/moeru-ai/airi/blob/main/packages/stage-ui-mmd/src/composables/mmd/animation-manager.ts)
- [AIRI MMD.vue](https://github.com/moeru-ai/airi/blob/main/packages/stage-ui-mmd/src/components/scenes/MMD.vue)
- [AIRI MMD store](https://github.com/moeru-ai/airi/blob/main/packages/stage-ui-mmd/src/stores/mmd.ts)
- [xiaoke director](https://github.com/liupig/xiaokeai/blob/master/companion/frontend/src/engine/director.ts)
- [xiaoke orchestrator](https://github.com/liupig/xiaokeai/blob/master/companion/frontend/src/features/performance/orchestrator.ts)
- [xiaoke motion](https://github.com/liupig/xiaokeai/blob/master/companion/frontend/src/engine/motion.ts)
- [Three.js AnimationMixer](https://threejs.org/manual/en/animation-system.html), [AnimationAction](https://threejs.org/docs/#api/en/animation/AnimationAction), [AnimationUtils](https://threejs.org/docs/#api/en/animation/AnimationUtils).

## 3. Decisão arquitetural

**Não substituir AIRI.** Adicionar subsistema independente \`alice-motion\` com quatro responsabilidades separadas:

1. \`MotionDirector\`: observa fala, audição, pensamento, emoção, interação, contexto, intenção e seleciona objetivos de movimento.
2. \`MotionScheduler\`: resolve prioridades, cooldowns contextuais, concorrência, interrupções, timeouts, idempotência, *lookahead* de áudio e transições.
3. \`LayeredMotionMixer\`: combina movimentos simultâneos por máscaras articulares e *additive blending*, com pesos contínuos e normalização de pose.
4. \`MotionAdapter\`: executa o resultado no renderizador AIRI (PMX/MMD inicialmente, VRM posteriormente), preservando a ordem de IK/grant/física e propriedade facial.

A lógica conversacional permanece no AIRI; o diretor não é um segundo chatbot. O controlador recebe intenções de movimento e eventos de áudio, não texto bruto de modelos além do classificador/opcional.

### Diagrama

\`\`\`mermaid
flowchart TB
  A[AIRI: sessões / LLM / voz / percepção] --> B[Motion Event Bus]
  A --> C[Catálogo semântico / perfil de personagem]
  B --> D[MotionDirector / máquina de estados]
  C --> D
  D --> E[MotionScheduler / prioridades e tempo]
  E --> F[LayeredMotionMixer]
  G[VMD / biblioteca de poses] --> F
  H[Gestos procedurais] --> F
  I[Movimento neural opcional] --> F
  F --> J[PMX/MMD Adapter]
  F -. extensão futura .-> K[VRM Adapter]
  J --> L[AIRI: AnimationMixer + IK + Grant + Physics]
  K --> M[AIRI: VRM renderer]
  L --> N[Render e telemetria]
  M --> N
\`\`\`

## 4. Formatos e prioridades

| Fase | Formato | Razão | Condição |
|---|---|---|---|
| P0–P5 | PMX/PMD + VMD | Já há renderer, física, IK e importação VMD nativos no AIRI | Modelo com morphs, ossos e texturas funcionais |
| P6 | VRM + VRMA / retargeting | Portabilidade de avatares e padrão de humanoide | Adaptador dedicado, sem simular suporte VMD direto |
| P7 | GLB humanoide opcional | Exportação genérica | Mapeamento explícito de rig, skinning, morphs e testes |
| Laboratório | StreamTalk/ARDY | Poses geradas e condicionadas por áudio/comandos | Checkpoints e conversão para esqueleto alvo; nunca pressupor plug-and-play |

**Decisão para primeira demo:** Alice em PMX/MMD, sem migração forçada do GLB existente; o rig existente pode ser preservado em paralelo até o retargeting estar validado.

## 5. Contratos de dados propostos

O protocolo define **intenção** separada de **execução**. Um LLM nunca publica rotações arbitrárias no loop de 60 FPS sem validação.

\`\`\`ts
export type MotionChannel =
  | 'locomotion' | 'posture' | 'torso'
  | 'leftArm' | 'rightArm' | 'hands'
  | 'head' | 'gaze' | 'facial' | 'secondary';

export type MotionState = 'idle' | 'listening' | 'thinking'
  | 'speaking' | 'walking' | 'acting' | 'interrupted';

export interface MotionIntent {
  schemaVersion: 1;
  id: string;
  timestampMs: number;
  source: 'llm' | 'audio' | 'vision' | 'user' | 'procedural' | 'neural';
  state?: MotionState;
  semanticAction: string;          // exemplo: explain_left_hand
  emotion?: string;
  intensity?: number;              // validar 0...1
  requestedChannels?: MotionChannel[];
  offsetFromSpeechMs?: number;
  requestedDurationMs?: number;
  priority?: number;               // faixa validada pela política
  interruptible?: boolean;
}
export interface MotionCue {
  id: string;
  clipId?: string;
  generatorId?: string;
  startAtMs: number;
  weight: number;                  // 0...1
  fadeInMs: number;
  fadeOutMs: number;
  mode: 'normal' | 'additive';
  channels: MotionChannel[];
  priority: number;
  expiresAtMs?: number;
}
\`\`\`

**Validação:** \`schemaVersion\`, whitelist de \`semanticAction\`, normalização de campos, tamanho máximo de mensagens, rate limit, TTL, deduplicação por \`id\` e tratamento de comandos desconhecidos sem exceção fatal.

Evento de referência:

\`\`\`json
{
  "schemaVersion": 1,
  "id": "alice-motion-0001",
  "timestampMs": 0,
  "source": "llm",
  "state": "speaking",
  "semanticAction": "explain_left_hand",
  "emotion": "curious",
  "intensity": 0.65,
  "requestedChannels": ["torso", "leftArm", "hands"],
  "offsetFromSpeechMs": 750,
  "requestedDurationMs": 1600,
  "priority": 40,
  "interruptible": true
}
\`\`\`

## 6. MotionDirector: comportamento contínuo

Portar **conceitos selecionados**, não o aplicativo xiaoke completo:

- Estado observável \`idle / listening / thinking / speaking\`, adicionalmente \`walking / acting / interrupted\`.
- \`idle\`: respiração, deslocamento discreto de peso, variação de postura, piscadas, saccades, mudança de foco com distribuição não perfeitamente periódica.
- \`listening\`: olhar ao interlocutor, inclinação leve da cabeça, pausas; sem repetir aceno a cada frase.
- \`thinking\`: desviar olhar com duração variável; preservar postura.
- \`speaking\`: acompanhar segmentos TTS, ênfases de prosódia, gestos semânticos moderados, movimento de mãos e tronco sem desestabilizar as pernas.
- \`walking\`: locomoção prioritária em quadril/pernas/pés; permitir gestos parciais em membros superiores.
- \`acting\`: ação integral (sentar, levantar, dança) pode reservar articulações; lidar com conflito e saída limpa.
- \`interrupted\`: cancelar gestos de fala por \`sessionId\`, reduzir pesos e manter respiração/locomoção.

Um relógio monotônico do motor de renderização controla os envelopes; modelos externos apenas publicam cues com timestamps. Geradores de números aleatórios devem aceitar semente para reproduzir testes.

### Catálogo semântico

Cada animação registra \`clipId\`, origem, licença, formato, rig-alvo, duração, máscara padrão, pose de referência, canais, labels de emoção, ação semântica, \`loop\`, peso máximo, pontos de contato, janela de cancelamento, nível de confiança e verificação de integridade. O nome do arquivo VMD não é suficiente.

## 7. Layered Motion Mixer: solução central

### 7.1. Canais

- **BASE:** locomotion/walk/idle; prioridade global, root e pernas.
- **POSTURE:** coluna, quadril/ombros e shifting; só se não interferir com contato dos pés.
- **GESTURE_LEFT / GESTURE_RIGHT:** ombro, braço, antebraço, punho e mãos respectivos.
- **HEAD / GAZE:** pescoço, cabeça e olhos; orientação final após animação base.
- **FACE:** morphs faciais não labiais; manter visemas com dono exclusivo enquanto TTS ativa.
- **SECONDARY:** simulação de cabelos, tecido e acessórios, não aplicar transformação esquelética sobre o resultado da física no fim do frame.

### 7.2. Máscara por osso e pesos

Na importação VMD, resolver nome de trilha → osso canônico (tabela de alias japonês/inglês), separar tracks por máscara e rejeitar trilhas sem osso compatível. Não assumir que o mesmo arquivo possui bone names idênticos entre PMX.

Para uma animação limitada ao braço esquerdo, criar \`AnimationClip\` novo contendo **somente** tracks de braço e mão, sem root/quadril/pernas/face. A camada direita e a de locomoção podem rodar ao mesmo tempo.

\`\`\`ts
// Pseudocódigo ilustrativo: não inserir sem testes de mapping!
function maskClip(clip: AnimationClip, allowedNames: Set<string>) {
  const selected = clip.tracks.filter(track => {
    const bone = resolveBoneFromTrackName(track.name);
    return bone !== undefined && allowedNames.has(bone);
  }).map(track => track.clone());
  return new AnimationClip(clip.name + ':masked', clip.duration, selected);
}
\`\`\`

### 7.3. Mistura normal vs aditiva

**Normal blending** mescla poses absolutas com pesos \`w\` para articulações que possuem trilha; transição gradual (crossfade) entre fontes.

**Additive blending** representa um deslocamento relativo à pose de referência (não uma pose absoluta). Para rotações, usar composição de quaternions e, quando aplicável, \`AnimationUtils.makeClipAdditive\` e \`AdditiveAnimationBlendMode\` da versão instalada do Three.js. Validar referência, espaços locais, rig de repouso, normalização e ordem.

Forma conceitual, para uma articulação \`b\`:

\`\`\`text
q_final(b) = normalize( q_base(b) × Π_i slerp(identity, Δq_i(b), w_i) )
\`\`\`

A ordem de multiplicação é relevante; não tratar quaternions como vetores que se somam. Diferentes canais podem exigir modos distintos. Para evitar *overshoot*, usar envelopes C1/C2 e limites anatômicos.

### 7.4. Propriedade de cada transform

- \`hips\` e root: locomotion ou ação full-body, nunca gesto de braço.
- Pés e pernas: locomotion e foot-lock, com conflitos explícitos para sentar/dançar.
- Cabeça: movimento base + camada gaze (offset local limitado).
- Boca: TTS/lip-sync durante fala; emote não sobrescreve visemas.
- Olhos/pálpebras: gaze/blink e emoção com mecanismo de prioridade.
- Cabelo/roupa: física executada depois do mixer e IK, sem reset em todo frame.

Se dois cues normais usam o mesmo osso e a mesma prioridade, o scheduler deve aplicar política estável e determinística; não permitir competição imprevisível.

### 7.5. Ordem por frame

Preservar a cadeia existente documentada no AIRI MMD (\`mixer → IK → grant → física\`). Proposta:

\`\`\`text
event ingest / clock
  → MotionDirector.update()
  → MotionScheduler.resolve()
  → envelopes de peso / seleção de clips mascarados
  → AnimationMixer.update(dt) [base+normal+aditivo]
  → IK / append-bone grants / physics do MMD
  → expressões / blink / lip-sync
  → gaze/head final com limites (revalidar interação com IK)
  → render
\`\`\`

**Ponto crítico:** não invocar \`AnimationMixer.update()\` duas vezes por frame. O manager existente precisa expor controle de ações ou receber uma composição interna. Não escrever quaternions depois da física indiscriminadamente, pois isso pode violar o resultado do solver.

### 7.6. Locomoção e contato

- \`root motion\` vs \`in-place\`: escolher política por clipe e documentar.
- Foot locking: travar posição do pé no período de contato sem forçar o quadril a teleportar.
- Ao mudar direção/velocidade, ajustar cadência e blending da passada.
- Conflito: dança/sentar pode reservar o corpo todo e suspender locomoção mantendo face/olhar quando seguro.

## 8. Mudanças propostas no fork

Novo pacote independente (paths propostos; verificar convenções de \`pnpm-workspace.yaml\` e Turbo antes de criar):

\`\`\`packages/alice-motion/
├── package.json
├── src/
│   ├── types.ts
│   ├── event-bus.ts
│   ├── director/
│   │   ├── motion-director.ts
│   │   ├── state-machine.ts
│   │   ├── prosody-beats.ts
│   │   └── idle-policy.ts
│   ├── scheduler/
│   │   ├── arbiter.ts
│   │   ├── cue-clock.ts
│   │   └── interruptions.ts
│   ├── mixer/
│   │   ├── layered-mixer.ts
│   │   ├── bone-mask.ts
│   │   ├── additive.ts
│   │   ├── retarget.ts
│   │   └── contact-constraints.ts
│   ├── catalog/
│   │   ├── manifest.ts
│   │   └── validation.ts
│   ├── adapters/
│   │   ├── mmd-adapter.ts
│   │   └── vrm-adapter.ts
│   └── telemetry/
│       ├── metrics.ts
│       └── trace.ts
└── tests/
    ├── director.test.ts
    ├── scheduler.test.ts
    ├── masks.test.ts
    ├── additive.test.ts
    ├── constraints.test.ts
    ├── interrupts.test.ts
    └── frame-order.test.ts
\`\`\`

Alterações previstas, por ordem de menor risco:

1. \`packages/stage-ui-mmd/src/composables/mmd/animation-manager.ts\`: fornecer API de ações por camada, preservar API atual, mascarar tracks e testar pesos/mixer. **Não substituir a física ou o solver.**
2. \`packages/stage-ui-mmd/src/components/scenes/MMD.vue\`: atualizar director/scheduler no loop, aplicar cues antes da atualização do mixer, teardown seguro e observabilidade.
3. \`packages/stage-ui-mmd/src/stores/mmd.ts\`: eventos tipados \`motion-intent\`, \`motion-cue\` e \`motion-cancel\`, idempotência/seq, propagação entre janelas sem duplicar execução.
4. \`packages/stage-ui/src/components/scenarios/settings/model-settings/mmd.vue\`: editor de catálogo, layers, limites de amplitude/velocidade, prioridades, habilitar/desabilitar diretor.
5. Serviço opcional \`services/alice-motion-neural\` com inferência por GPU e transporte WebSocket; não criar nesse primeiro PR.
6. \`packages/stage-ui-three\`: integrar adaptador VRM após estabilizar e verificar retargeting.

Não incluir em commits de planejamento códigos copiados indiscriminadamente do xiaoke, nem modelos PMX/VMD de terceiros sem licença.

## 9. Integração com infraestrutura local

| Subsistema | Planejamento |
|---|---|
| LLM | Endpoint local OpenAI-compatible do vLLM; resposta textual em canal separado das intenções de movimento |
| STT | Serviço local Faster-Whisper/SenseVoice, sem depender do diretório do renderer |
| TTS | Qwen3-TTS ou GPT-SoVITS com áudio e timestamps/segmentos; voz continua válida se motion falhar |
| Memória | Estado conversacional e preferências em serviço próprio; não persistir posição de ossos como memória semântica |
| Visão | Câmera/percepção publica eventos de foco e atenção; política de opt-in explícito para câmera |
| Transporte | Eventos tipados + WebSocket local para serviços externos; \`BroadcastChannel\` só no escopo já usado por AIRI |
| Render | Desktop ou browser com PMX/MMD e física; Dockerizar serviços de IA, não presumir renderização acelerada dentro de contêiner headless |
| GPUs | RTX 3090 24 GB: geração neural experimental; RTX 4060 Ti 16 GB: TTS/ASR/serviços auxiliares conforme carga. **Exige medição de VRAM.** |

Modos de falha: serviço neural desconectado → clips/procedural; TTS atrasou → gestos acompanham áudio efetivamente tocado, não tokens antecipados; interrupção → cancelar cues antigos por \`sessionId\`; frame lento → acumulação de \`dt\` limitada para estabilidade de física.

## 10. Backlog e fases com critérios de aceite

### Fase P0 — baseline, fixtures e telemetria
**Entrega:** fixture PMX com VMD idle/walk/wave, harness de reprodução determinística, logs de VRAM/FPS, latência, pose e física. **Aceite:** os testes existentes do AIRI continuam passando e os três VMD são executados sem regressões; criar vídeo antes/depois. Registrar versão exata do Three.js e \`@moeru/three-mmd\`.

### Fase P1 — MotionDirector independente
**Entrega:** estados e policy contínua, eventos de fala, idle/listening/thinking/speaking, microgestos, emoção e ações semânticas. **Aceite:** testes com relógio simulado e seed fixa; interrupção e reinício não duplicam gestos; nenhuma chamada LLM no loop por frame.

### Fase P2 — Scheduler de camadas
**Entrega:** cues com duração, prioridade, reserva de canais, transições e arbitragem. **Aceite:** \`walk+wave\` coexistem sem barrar a locomoção; ação full-body obtém prioridade definida e libera os canais ao terminar; sem clipes órfãos.

### Fase P3 — máscaras e composição aditiva
**Entrega:** mapeamento de ossos, clip filtering, normal/additive mixing, fade, editor simplificado. **Aceite:** \`walk + left_arm_wave + gaze\` simultâneos, sem movimento indevido de hips/legs por gesto; retorno à pose base suave; comparação de quaternions dentro das tolerâncias de teste.

### Fase P4 — voz, face, prosódia e física
**Entrega:** timestamp TTS, microbeats vocais, morph priority, gaze final, foot locking inicial. **Aceite:** boca segue voz; cabeça e olhos não travam; física de cabelos/roupas continua sem instabilidade após 100 interrupções; silêncio preserva idle.

### Fase P5 — UX e catálogo semântico
**Entrega:** painel de catálogo, edição de máscara, preview por camada, conflitos e métricas. **Aceite:** qualquer VMD novo compatível pode ser importado, descrito, testado e associado a um evento sem alterar código; assets inválidos são rejeitados com mensagem específica.

### Fase P6 — adaptador VRM/VRMA
**Entrega:** humanoid mapping PMX↔VRM, associação de clips, conversor de canais. **Aceite:** cenário básico de andar/gesticular/olhar/falar funciona em dois rigs diferentes sem alterações no director.

### Fase P7 — gestos neurais
**Entrega:** interface \`MotionStreamProvider\` e protótipos StreamTalk (fala) / ARDY (movimento por intenção). **Aceite:** geração offline local, métricas de tempo e VRAM, fallback determinístico, limite de aceleração e continuidade entre janelas de pose. Não afirmar desempenho igual ao Ani-2 sem ensaios.

## 11. Testes que bloqueiam merge

| Teste | Resultado esperado |
|---|---|
| \`walk + wave_left + gaze + speech\` | Todos ativos sem ultrapassar máscara e sem reescrever visemas |
| \`walk + sit\` | Scheduler reserva pernas/root e executa transição sem deslizamento abrupto |
| Dois gestos no mesmo braço | Política estável: prioridade/crossfade, sem overwrites imprevisíveis |
| Um gesto em cada braço | Coexistência se rig e clipes permitem |
| Interrupção no meio do TTS | Cancela gesto da fala anterior e preserva idle/locomotion |
| 100 trocas de personagem | Sem vazamento de AnimationAction, event listeners, física ou GPU |
| Reconexão WebSocket | Cues com sessão antiga descartados; sem executar gesto duplicado |
| VMD com ossos ausentes | Falha recuperável, diagnóstico com lista de tracks não mapeadas |
| FPS 30/60/120 + variação de \`dt\` | Movimento temporalmente equivalente e física estável |
| Random seed fixa | Trajetórias procedurais reproduzíveis nos testes |
| Quantização/prosódia | Gestos sincronizados ao áudio tocado, não ao texto recebido |
| Licenças | Asset e trechos externos com atribuição, licença e NOTICE conforme necessário |

Metas iniciais (devem ser calibradas após P0): 60 FPS em cena de referência na GPU de render, queda inferior a 10% do baseline em mixer sem gerador neural, p95 de despacho de comando inferior a 50 ms no processo renderer, descontinuidade visual perceptível zero nos cenários de aceite, foot slip medido e decrescente. Essas metas são parâmetros de projeto **não medidos**.

## 12. Instrumentação

Capturar por frame: \`frame_time_ms\`, \`mixer_ms\`, \`physics_ms\`, \`director_ms\`, \`scheduler_ms\`, contagem de \`AnimationAction\`, clips em cache, ossos conflitantes, graus articulares, \`contact_slip_m\`, timestamp do áudio, desvio áudio↔gesto, memória JS e GPU se disponível. Salvar \`motion_trace.jsonl\` com IDs de sessão/cue e seed; opção de gravar vídeo reproduzível. Testes com série temporal de 30 minutos.

## 13. Riscos e mitigação

1. **Acoplamento a renderer:** interfaces/adapter claros; sem acesso global a Three.js pelo director.
2. **Disputa mixer/IK/física:** composição no manager antes da etapa de IK; testes de ordem por quadro.
3. **Diferenças de rigs PMX:** catálogo de bone aliases e validação; não presumir traduções uniformes.
4. **Aditivo mal calibrado:** converter contra pose de referência correta; limitar pesos/ângulos; testes visuais.
5. **Direitos autorais de assets:** não importar PMX/VMD/Live2D proprietários sem autorização.
6. **Licenças de código:** AIRI MIT; xiaoke Apache-2.0. Se reutilizar código, manter copyright, avisos, arquivo NOTICE quando aplicável e histórico de alterações. Conferir licença dos arquivos individualmente.
7. **Neural insuficientemente rápido:** inferência assincrônica, buffer temporal, fallback procedural sem paralisar frame.
8. **Docker/GPU:** serviços independentes com health checks, versões e limites de VRAM; renderer deve permanecer funcional offline.
9. **Regressão no upstream:** testes nas interfaces e rebase incremental; preferir extensões em pacote independente.
10. **Qualidade não medida:** registrar vídeos e métricas por fase, sem anunciar conclusão antes dos testes.

## 14. Critérios de pronto para implementação

- [ ] Testar baseline AIRI atual em Linux e registrar commit e versão.
- [ ] Selecionar modelo PMX e assets VMD com licença verificada para fixture.
- [ ] Confirmar convenções de pacote, testes e APIs do \`@moeru/three-mmd\`.
- [ ] Congelar schema \`MotionIntent\`/\`MotionCue\` versão 1.
- [ ] Aprovar mapeamento de ossos, máscara base e política de ownership facial.
- [ ] Implementar P1 e P2 antes de integrar qualquer modelo neural.
- [ ] Medir P0/P3/P4 e só então avaliar alteração de renderer.
- [ ] Preservar atual UI, TTS, integrações e fluxo de importação do AIRI.

## 15. Referências gerais e decisões

- [Fork AIRI](https://github.com/overcyber/airi) e [documentação AIRI](https://airi.moeru.ai/docs/en/docs/overview/)
- [AIRI upstream](https://github.com/moeru-ai/airi)
- [xiaoke.ai](https://github.com/liupig/xiaokeai), licença Apache-2.0
- [Utsuwa](https://github.com/JuiceBoxxGames/utsuwa)
- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)
- [Riko](https://github.com/rayenfeng/riko_project)
- [StreamTalk](https://github.com/Xiangyue-Zhang/StreamTalk)
- [ARDY](https://github.com/nv-tlabs/ardy)
- [AnimationMixer](https://threejs.org/manual/en/animation-system.html)
- [AnimationAction](https://threejs.org/docs/pages/AnimationAction.html)
- [AnimationUtils](https://threejs.org/docs/pages/AnimationUtils.html)

---

# PARTE II — HISTÓRICO TEXTUAL DAS SAÍDAS ANTERIORES DESTA CONVERSA

Esta parte registra, em ordem cronológica, a pesquisa anterior sobre Ani-2, plataformas de companheiros virtuais, auditoria dos sete repositórios e comparação final. **Preserva a informação textual, as tabelas, os links, os códigos e as conclusões; elementos visuais carregados dinamicamente pelo chat são representados pelas legendas/descrições, não como binários incorporados.** O planejamento acima é novo e não representa uma execução dos passos abaixo.


## Registro 1 — Pesquisa Ani-2 e alternativas locais (primeira saída)

# Pesquisa técnica: alternativas locais ao Ani-2 para avatares 3D em tempo real

Pesquisa em 3 de novembro de 2026 | Análise do vídeo enviado e dos projetos de código aberto.

### 1. O que é o Ani-2 e qual tecnologia precisamos reproduzir?

O **Ani-2** é um modelo proprietário da [Animation Inc.](https://www.animation.inc/) desenvolvido para gerar movimentos corporais tridimensionais em tempo real, diretamente no dispositivo.

A empresa anuncia:

- Geração de movimentos de corpo inteiro sem captura de movimento tradicional.
- Inferência local, sem necessidade de processamento na nuvem.
- Movimentos que respondem à interação do personagem.
- Inferência declarada de **2,5 ms por quadro**, sem divulgar um benchmark independente que permita reproduzir esse resultado.

O modelo não é apresentado publicamente como um projeto de código aberto. Também não encontrei documentação pública suficiente para reproduzir seu treinamento, arquitetura ou desempenho.

### 2. Análise do vídeo enviado

Examinei os aproximadamente 9,6 segundos do vídeo, com resolução de 320 × 694 pixels e taxa próxima de 30 FPS.

> Elemento visual da resposta original: referência ilustrativa ao avatar anime demonstrado para o Ani-2; não é incluído como arquivo binário neste Markdown.

O personagem apresenta um conjunto de características que precisam ser reproduzidas conjuntamente:

| Componente | Comportamento observado |
|---|---|
| Cabeça e pescoço | Inclinações e rotações suaves |
| Tronco | Oscilações e mudanças de postura |
| Braços e mãos | Gestos coordenados e posicionamento natural |
| Quadril e pernas | Ajustes discretos de pose e transferência de peso |
| Rosto | Mudanças expressivas associadas ao movimento |
| Cabelos e roupas | Movimentos secundários que aumentam a naturalidade |
| Continuidade | Transições progressivas, sem cortes aparentes entre as poses |

**O ponto importante:** a fluidez não depende apenas de um modelo de IA que produz posições das articulações. Ela resulta da combinação entre geração de movimento, continuidade temporal, animação facial, deformação do modelo 3D e movimentos secundários.

Portanto, substituir o Ani-2 por um simples gerador de gestos, uma biblioteca de animações prontas ou um sistema de lip-sync não reproduz integralmente o efeito apresentado.

### 3. As melhores alternativas encontradas

A comparação abaixo considera quatro requisitos: execução local, geração de movimento, funcionamento contínuo em tempo real e integração com avatares 3D personalizados.

| Projeto | Principal capacidade | Código e pesos | Adequação |
|---|---|---|---|
| **StreamTalk (2026)** | Gestos corporais e faciais gerados a partir da fala, em streaming | Disponíveis | Muito alta |
| **ARDY, NVIDIA (2026)** | Movimento 3D contínuo condicionado por texto e restrições espaciais | Disponíveis | Muito alta |
| **FloodDiffusion 2 (2026)** | Geração contínua de movimento corporal com controle de trajetória | Disponíveis | Alta |
| **EMAGE / PantoMatrix** | Corpo, mãos e rosto a partir de áudio | Disponíveis | Alta, mas não é streaming nativo |
| **DLP3D / Digital Life Project 2** | Avatar conversacional completo com movimentos, rosto e física | Código disponível; requer assets | Muito alta como plataforma |
| **TalkingHead + MotionEngine** | Gestos, expressões, lip-sync e animação procedural | Disponíveis | Muito alta para implementação |
| **GestureFAR (2026)** | Gestos generativos associados à fala em tempo real | Repositório ainda vazio | Promissora, não pronta |
| **LiveGesture (CVPR 2026)** | Geração causal de gestos de corpo inteiro | Publicação disponível; implementação não confirmada | Promissora |

Os projetos mais interessantes são os seguintes.

#### 3.1. StreamTalk

**Minha primeira escolha para gerar movimentos naturalmente associados à fala.**

ECCV 2026 · Universidade de Tóquio e Alibaba Tongyi Lab.

- [Código-fonte](https://github.com/Xiangyue-Zhang/StreamTalk)
- [Pesos do modelo](https://huggingface.co/X-Zhang/StreamTalk)

O StreamTalk utiliza geração por janelas de movimento, busca de poses plausíveis e refinamento das transições. Isso reduz o acúmulo de erros durante animações prolongadas.

O projeto informa **76 FPS em uma NVIDIA V100 de 16 GB**. Trata-se de desempenho relatado pelos autores, não de uma medição em RTX 3090. Os movimentos são produzidos em representação SMPL-X, com sequências exportáveis a 30 FPS.

Os pesos e o código de inferência foram disponibilizados. Entretanto, a instalação exige WavLM, o modelo SMPL-X e dados de referência BEAT2 para recuperação de poses.

**Limitação:** gera principalmente gestos relacionados à fala. Não substitui sozinho um controlador de comportamento autônomo para momentos de silêncio, espera ou exploração do ambiente.

#### 3.2. ARDY

**Melhor opção para gerar novos movimentos corporais a partir de comandos.**

NVIDIA e ETH Zürich · SIGGRAPH 2026.

- [GitHub](https://github.com/nv-tlabs/ardy)
- [Demonstrações oficiais](https://research.nvidia.com/labs/sil/projects/ardy/)

O ARDY é particularmente interessante porque não se limita a recuperar animações preexistentes. Ele gera movimento autoregressivo a partir de condicionamento textual e cinemático, incluindo trajetórias, posições de articulações e poses completas.

A implementação disponibiliza uma demonstração interativa. Em outubro de 2026, também foram publicados checkpoints SOMA com saída de **30 FPS**, além de modelos anteriores de 20 e 25 FPS.

O código utiliza Apache 2.0, enquanto os checkpoints estão sob licença NVIDIA Open Model. Os testes publicados pelos desenvolvedores utilizaram principalmente RTX 4090.

**Limitação:** não é um modelo especializado em sincronização de fala com rosto e gestos. Deve funcionar como gerador complementar de movimentos corporais.

#### 3.3. FloodDiffusion 2

**Alternativa de pesquisa mais interessante em velocidade de inferência.**

2026 · Movimento contínuo condicionado por texto e trajetória.

- [Código e instalação](https://github.com/caiyy17/FloodDiffusion2)
- [Artigo](https://arxiv.org/abs/2609.33167)

O FloodDiffusion 2 incorpora atenção parcial, cache KV e condicionamento de trajetória. Os autores relatam **2,303 ms por atualização** em sequências longas na RTX 4090, com configuração experimental específica.

Esse resultado chama atenção por ser numericamente próximo dos 2,5 ms/quadro anunciados para o Ani-2, mas **não representa uma comparação direta**. Os modelos executam tarefas e procedimentos de medição diferentes.

Há código, checkpoints e instruções de instalação. A dependência do encoder UMT5-XXL e a necessidade de integrar o fluxo de poses tornam a implementação mais complexa.

**Limitação:** seu condicionamento é principalmente textual e espacial. Não produz automaticamente gestos conversacionais sincronizados com áudio.

#### 3.4. EMAGE

O projeto [PantoMatrix / character-policy](https://github.com/haiyangliu0/character-policy) reúne implementações e referências para geração de animações faciais e corporais a partir de áudio.

O EMAGE produz parâmetros do corpo e do rosto, incluindo mãos e expressões, utilizando SMPL-X e FLAME. Possui pesos e ferramentas de integração com Blender.

É uma boa base para produzir animações naturais e estudar retargeting, mas não é a minha primeira escolha para geração contínua de baixa latência. Seu fluxo original é orientado à geração por segmentos, e não a streaming causal nativo.

#### 3.5. DLP3D

> Elemento visual da resposta original: demonstração do Digital Life Project 2 (DLP3D), avatar conversacional 3D.

SIGGRAPH Asia 2025 · Sistema conversacional 3D completo.

[Repositório](https://github.com/dlp3d-ai/dlp3d.ai)

O DLP3D reúne interface 3D, agentes conversacionais, animação facial, movimento corporal e mecanismos de reprodução sincronizada.

A diferença importante é que seu Speech2Motion utiliza principalmente **seleção de movimentos baseada em conteúdo, palavras-chave e banco de animações**, com interpolação e blending. Não é equivalente a um modelo que sintetiza cada nova pose corporal neuralmente.

Há documentação de implantação local e imagens Docker para serviços específicos, mas a configuração padrão admite provedores externos de ASR, LLM e TTS. Para funcionar inteiramente offline, esses serviços precisam ser substituídos ou configurados localmente.

#### 3.6. TalkingHead + MotionEngine

**O caminho mais prático para reproduzir rapidamente o visual do vídeo.**

- [TalkingHead](https://github.com/met4citizen/talkinghead)
- [MotionEngine](https://github.com/lhupyn/motion-engine)

O TalkingHead suporta GLB, animação corporal, lip-sync, expressões faciais e simulação de cabelos com Dynamic Bones.

O MotionEngine acrescenta uma camada semântica para selecionar movimentos, expressões e gestos durante o diálogo.

Entretanto, **não equivale a um gerador neural de movimento**: os gestos são baseados em animações e poses configuradas.

O MotionEngine utiliza um classificador remoto por padrão, mas permite substituí-lo por um classificador local. O TalkingHead também pode receber TTS externo local no lugar do serviço de nuvem utilizado nos exemplos.

### 4. Qual escolher para reproduzir o vídeo?

Considerando que seu objetivo é um avatar 3D próprio, personalizado e exportável em GLB, utilizaria duas camadas de animação: uma para a presença contínua do personagem e outra para movimentos gerativos.

| Requisito | Solução que eu utilizaria |
|---|---|
| Movimentação natural quando está em silêncio | Procedural idle + MotionEngine |
| Gestos gerados durante a fala | StreamTalk |
| Movimentos acionados por comandos | ARDY |
| Animação facial e boca | TalkingHead ou DLP3D Audio2Face |
| Física de cabelos e roupas | Dynamic Bones ou simulação própria |
| Renderização do avatar | Three.js com GLB |
| Exportação e personalização | Blender |
| Conversação e decisões | LLM local |
| Infraestrutura | Docker e WebSocket local |

**Não escolheria apenas StreamTalk ou ARDY isoladamente.** O aspecto mais convincente do vídeo é a combinação de microgestos contínuos, movimentos suaves de cabeça e tronco, expressões e simulação secundária.

Esses elementos precisam continuar funcionando mesmo quando o modelo generativo não está produzindo um movimento novo.

### 5. Arquitetura proposta para o seu avatar Alice

\`\`\`text
LLM local + controlador de comportamento
    | intenção / emoção / diálogo / estado / comandos
    +-- StreamTalk ------ gestos gerativos de fala
    +-- ARDY ------------ movimento condicionado por comandos
    +-- MotionEngine ---- idle, posturas e microgestos
    +-- Audio2Face ------ lip-sync e expressões faciais
             |
       Motion Mixer / Retargeting
       interpolação, quaternions, IK, foot locking
             |
          Alice.glb
       Three.js / Blender + física de cabelo e roupas
\`\`\`

A vantagem dessa arquitetura é separar a geração de movimento da renderização. Assim, os modelos de IA trabalham em frequências próprias, enquanto o avatar continua sendo atualizado a 30 ou 60 FPS, com interpolação no mecanismo de animação.

Para manter a qualidade do vídeo, o Motion Mixer deve tratar especificamente a continuidade de velocidade e aceleração, limites articulares, transições entre animações e movimentos dos pés em contato com o solo.

#### Distribuição nas suas GPUs

Considerando sua RTX 3090 de 24 GB e RTX 4060 Ti de 16 GB, proponho inicialmente:

| Hardware | Função |
|---|---|
| RTX 3090 24 GB | Inferência StreamTalk, testes com ARDY ou FloodDiffusion 2 |
| RTX 4060 Ti 16 GB | LLM auxiliar, TTS e/ou animação facial |
| CPU + navegador | Three.js, controlador de estados, interpolação e física leve |

Essa é uma proposta de alocação, não uma configuração já validada. ARDY e FloodDiffusion 2 podem exigir ajustes consideráveis de memória, principalmente em seus encoders textuais. Não assumiria execução simultânea de todos os modelos sem medir VRAM, latência e utilização da GPU.

#### Integração com Blender e GLB

É fundamental preparar o avatar com uma armadura humanoide consistente, mãos articuladas, morph targets faciais e ossos auxiliares para cabelo e roupas.

O TalkingHead documenta um rig compatível com Mixamo, 52 blendshapes ARKit e 15 visemas Oculus. Para um avatar criado no Blender, essas convenções oferecem uma base objetiva para integração.

Os modelos que geram parâmetros SMPL-X precisarão de retargeting para a armadura da Alice. Os dados não podem ser simplesmente aplicados a um GLB qualquer.

Também existe uma restrição de licenciamento: o pacote acadêmico SMPL-X possui limitações de uso, especialmente comercial. Isso deve ser verificado antes de distribuir o sistema ou os assets derivados.

### 6. Projetos que merecem acompanhamento

**GestureFAR**, apresentado em setembro de 2026, é especialmente relevante por utilizar geração autoregressiva em espaço latente contínuo, com destilação para reduzir o custo de inferência em streaming. O artigo relata resultados superiores em determinadas métricas de gestos conversacionais. Entretanto, o repositório GitHub associado ainda está vazio, portanto não é uma alternativa imediatamente instalável.

**LiveGesture**, publicado na CVPR 2026, oferece outra abordagem relevante: geração de gestos corporais a partir de áudio em fluxo causal, sem olhar para amostras futuras. A proposta é tecnicamente adequada para um avatar conversacional, mas não confirmei a disponibilização pública de uma implementação completa e pesos utilizáveis.

### 7. Conclusão

**A alternativa local mais próxima do que você busca não é um único modelo, mas uma arquitetura híbrida.**

Minha escolha para começar seria **StreamTalk + TalkingHead + MotionEngine**, adicionando o ARDY para movimentos condicionados por comandos. Essa combinação oferece um caminho verificável para ter um avatar fluido e independente de serviços de nuvem.

Se a prioridade for aproximar a pesquisa do funcionamento do Ani-2, eu concentraria os experimentos no **ARDY e no FloodDiffusion 2**, pois ambos trabalham diretamente com geração contínua de movimento, em vez de depender exclusivamente de uma biblioteca de animações.

A distinção é importante: conseguimos identificar componentes locais capazes de reproduzir boa parte do comportamento visual e funcional, mas **não há evidência suficiente para afirmar que algum deles, isoladamente, iguala a qualidade ou a eficiência computacional do Ani-2**.


## Registro 2 — Kindroid, Character.AI e plataformas de IA companion (segunda saída)

# Pesquisa: sistemas de companheiros virtuais com IA, avatares animados e memória

Análise das três páginas fornecidas e pesquisa complementar | Novembro de 2026.

### 1. Principal descoberta: Kindroid já oferece avatar animado em chamadas ao vivo

O recurso mais importante para o seu projeto Alice não é apenas a conversa com personagens virtuais, mas a combinação de **personalidade persistente, voz, expressões faciais e movimentos corporais em tempo real**.

**Kindroid — sistema comercial, nuvem, personalização de personagens.**

O sistema oferece personagens com personalidade configurável, memória de longo prazo, vozes personalizadas, selfies e videochamadas. [Site oficial](https://kindroid.ai/).

**Recurso Live Avatar:** desde a atualização documentada de outubro de 2026, o Kindroid permite animar um personagem durante chamadas, com sincronização labial, gestos espontâneos, expressões reativas e movimentos solicitados pelo usuário.

O usuário pode fornecer uma imagem personalizada para o avatar. A documentação recomenda imagem frontal da cintura para cima, com mãos visíveis. Existem modalidades Standard e Premium, ambas baseadas em créditos de áudio e disponíveis para assinantes.

Isso faz do Kindroid uma referência particularmente relevante para o comportamento conversacional que você deseja reproduzir.

Existe, contudo, uma diferença técnica: o Kindroid descreve seu Live Avatar como um sistema que anima uma imagem fornecida. **Não há comprovação pública de que disponibilize um personagem 3D articulado, com esqueleto exportável em GLB, ou um motor de movimento neural instalável localmente.**

> Elemento visual da resposta original: imagem de demonstração do Kindroid Live Avatar.

### 2. Leitura integral do artigo AI Companion Guides

O artigo [Best AI Anime Girlfriend Apps in 2026](https://aicompanionguides.com/blog/best-ai-anime-girlfriend-apps-2026/), publicado em 28 de fevereiro de 2026, compara oito plataformas. Examinei as classificações, as análises individuais, a metodologia dos testes, as recomendações, as perguntas frequentes e a conclusão.

A classificação publicada é a seguinte:

| Plataforma | Nota do artigo | Principal diferencial |
|---|---:|---|
| Character.AI | 4,5/5 | Conversação e diversidade de personagens |
| Candy AI | 4,2/5 | Imagens personalizadas |
| SpicyChat AI | 4,1/5 | Interpretação de personagens |
| Kindroid | 4,0/5 | Personalização de personalidade e voz |
| CrushOn.AI | 3,8/5 | Conversação com poucos filtros |
| Nomi AI | 3,7/5 | Memória e continuidade |
| Talkie | 3,5/5 | Personagens estilizados |
| OurDream.ai | 3,3/5 | Geração de imagens de personagens |

Essas são avaliações subjetivas do autor, não resultados de um benchmark acadêmico. O artigo também informa que contém links de afiliados.

#### O que o artigo efetivamente avaliou

Os cinco critérios foram fidelidade à personalidade, qualidade visual de anime, profundidade do roleplay, personalização e custo-benefício.

**Ele não avaliou** geração de poses 3D, latência de animação, FPS, cinemática inversa, sincronização corporal ou execução local.

Portanto, a classificação não identifica necessariamente os melhores sistemas para reproduzir o Ani-2.

Outro ponto importante: algumas descrições e preços de fevereiro já estão desatualizados. A documentação atual do Kindroid, por exemplo, registra novos recursos de Live Avatar e alterações no acesso gratuito.

### 3. Character.AI: conversa, vídeo generativo e uma mudança importante em 2026

**Character.AI — plataforma proprietária, chat, voz e geração de vídeo.**

- [Site oficial](https://character.ai/)
- [Pesquisa TalkingMachines](https://blog.character.ai/character-ais-real-time-video-breakthrough/)

A página principal não disponibilizou conteúdo textual legível ao mecanismo de consulta, então examinei a documentação oficial, os artigos técnicos e os comunicados da empresa.

A tecnologia de vídeo da Character.AI é mais avançada do que o artigo comparativo indica.

**AvatarFX**, anunciado em abril de 2025, utiliza modelos generativos para animar personagens a partir de imagens e produzir vídeo sincronizado com áudio. A plataforma passou a oferecer criação de vídeos AvatarFX, além de chamadas de voz, Scenes e Streams.

Mais importante para sua pesquisa é o **TalkingMachines**, anunciado em julho de 2025.

#### Arquitetura do TalkingMachines

| Item | Descrição |
|---|---|
| Base generativa | Diffusion Transformer (DiT) |
| Condicionamento | Imagem + áudio em tempo real |
| Aceleração | Destilação para duas etapas |
| Continuidade | Atenção causal esparsa |

Segundo os autores, o sistema gera vídeo de forma autoregressiva, acompanhando fala, silêncio, movimento dos olhos, cabeça e gestos. A demonstração de tempo real utiliza duas GPUs, sem especificar que o desempenho se mantém em hardware doméstico.

Essa abordagem é diferente da geração de um esqueleto 3D, mas pode produzir uma aparência de personagem muito fluido na tela. Os modelos completos do AvatarFX e TalkingMachines não foram disponibilizados para instalação local nas fontes oficiais examinadas.

#### Situação atual da empresa

Em **12 de outubro de 2026**, a Character.AI entrou voluntariamente com pedido de proteção judicial sob o Chapter 11 nos Estados Unidos, iniciando um processo de venda de ativos. A plataforma continua operando, mas a própria empresa reconheceu que poderá encerrá-la caso a venda não viabilize sua continuidade.

Isso torna a Character.AI uma referência técnica relevante, porém uma base arriscada para construir um produto que dependa permanentemente de sua infraestrutura.

> Elemento visual da resposta original: demonstração Character.AI AvatarFX.

### 4. Outros sistemas comerciais semelhantes

Além das plataformas presentes no artigo, encontrei produtos relevantes para comparar animação, voz e comportamento.

#### Replika

Avatar 3D personalizável, memória, conversas por voz, realidade aumentada e suporte a dispositivos Meta Quest. É uma das melhores referências comerciais para um personagem com corpo 3D dentro de um ambiente interativo.

[Site oficial](https://replika.com/).

#### Ayra / Kizuna

Companheira virtual com modelo VRM 3D, lip-sync, expressões, memória persistente e capacidade de assistir a vídeos e reagir com o usuário. É mais próxima da estética anime que você procura do que várias plataformas de chat tradicionais.

[Experimentar Ayra](https://kizuna.ayraverse.com/).

#### Nomi AI

Destaca-se pelo modelo de memória, adaptação de personalidade, conversação por voz, mensagens proativas, conversas em grupo e selfies contextualizadas.

É uma boa referência para o comportamento cognitivo da Alice, embora não ofereça a mesma proposta de personagem 3D articulado do Replika.

[Site oficial](https://nomi.ai/).

O artigo comparativo contém uma informação incorreta ou desatualizada sobre o Nomi: afirma que não oferece geração de imagens, enquanto o site oficial documenta selfies geradas a partir do contexto da conversa.

> Elementos visuais da resposta original: imagens de demonstração de Replika, Ayra/Kizuna e Nomi AI.

### 5. Os projetos de código aberto mais relevantes para a Alice

Esta foi a parte mais produtiva da pesquisa. Encontrei alternativas que oferecem **avatar 3D real, código-fonte, memória persistente e integração com modelos locais**.

#### 5.1. Utsuwa — melhor ponto de partida no Linux

Avatar 3D com expressões, gestos e integração de voz.

[GitHub](https://github.com/JuiceBoxxGames/utsuwa).

O Utsuwa é um dos projetos mais completos encontrados. Possui suporte oficial a Linux, Windows e macOS, além de uma aplicação de navegador.

Os recursos incluem avatar VRM, memória semântica local, expressões emocionais, movimento de cabelos e roupas, reconhecimento de fala, TTS local e controle de movimentos por meio de arquivos \`.vrma\`.

O mecanismo de animação permite definir movimentos de espera, reflexão e gestos selecionados de acordo com o contexto da resposta. Também pode receber um LLM por API compatível com OpenAI, incluindo vLLM.

**Vantagens para seu projeto:**

- Aplicação de desktop com janela transparente.
- Suporte a modelos 3D personalizados.
- Integração com LLM local e armazenamento próprio.
- Biblioteca de movimentos expansível.
- Serviço OmniVoice com instalação documentada em Docker.
- Licença AGPL-3.0 para as versões atuais.

**Limitação:** seus gestos dependem principalmente de animações registradas e controle semântico. Não possui, por padrão, geração neural equivalente ao Ani-2.

[Instaladores para Linux](https://www.utsuwa.ai/download) · [Docker do OmniVoice](https://www.utsuwa.ai/docs/guides/omnivoice).

> Elemento visual da resposta original: captura do Utsuwa com avatar 3D.

#### 5.2. Project AIRI — melhor plataforma extensível

O [Project AIRI](https://github.com/moeru-ai/airi) é desenvolvido como alternativa auto-hospedada a assistentes virtuais como Grok Companion e VTubers interativos.

A documentação atual confirma suporte a Live2D, VRM 3D, Spine, MMD e personagens estilizados. A plataforma utiliza tecnologias WebGPU, WebAudio e WebSocket, com aplicações para navegador e desktop.

Possui conversação por voz, compatibilidade com serviços locais de inferência e experimentos de agentes capazes de interagir com aplicações e jogos.

É particularmente interessante como base arquitetural de um agente multimodal. Por outro lado, ainda está em desenvolvimento ativo, e nem todos os recursos do roadmap devem ser tratados como completos.

> Elemento visual da resposta original: demonstração AIRI desktop.

#### 5.3. xiaoke.ai — melhor compatibilidade direta com GLB

Um dos projetos mais interessantes para reaproveitar seu avatar atual.

[Repositório GitHub](https://github.com/liupig/xiaokeai).

O xiaoke.ai implementa um palco 3D com suporte a arquivos **VRM, PMX e GLB**, animação facial, movimentos, câmera, memória de longo prazo e conversação por voz.

Sua arquitetura utiliza Vue 3, Three.js, FastAPI, Electron, mem0 e armazenamento vetorial local. Também implementa reconhecimento de fala offline com SenseVoice e síntese de voz local com Qwen3-TTS.

Há suporte adicional a movimentos VMD, física de roupas/cabelos e captura de movimento por MediaPipe. Essa última funcionalidade é opcional; não significa que o sistema dependa de captura para todas as animações.

**Pontos de atenção:** os modelos e as animações de terceiros não são distribuídos com o código, e a documentação de execução está fortemente orientada ao Windows. Não encontrei um pacote Linux validado equivalente ao disponibilizado pelo Utsuwa.

> Elemento visual da resposta original: captura de avatar xiaoke.ai.

#### 5.4. Outras opções locais

| Projeto | Tecnologia | Diferencial |
|---|---|---|
| [Amica](https://github.com/semperai/amica) | Three.js / VRM | Base leve para avatar 3D com voz e expressões |
| [Miko](https://github.com/danukim/Miko) | Unity / Ollama | Avatar 3D de desktop com GPT-SoVITS local |
| [Aikeya](https://github.com/aikeyaorg/aikeya) | VRM / Tauri | Personalidade, memória e relacionamento, com desktop inicialmente focado em macOS |
| [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) | Live2D | Conversação por voz e interrupções em tempo real |
| [ARPA AVATAR](https://github.com/ARPAHLS/avatar) | VRM / VRMA | Avatar animado que reage ao áudio do computador |

### 6. Comparação final para seu objetivo

A tabela diferencia a presença de um corpo 3D real da mera geração de imagens ou vídeos.

| Sistema | Avatar 3D articulado | Movimento ao vivo | Execução local |
|---|---|---|---|
| Kindroid Live Avatar | Não confirmado | Sim, vídeo generativo | Não |
| Character.AI | Não como modelo exportável | Vídeo gerativo; TalkingMachines demonstrado | Não |
| Replika | Sim | Sim, animação 3D | Não |
| Ayra | Sim, VRM | Sim | Não documentada |
| Utsuwa | Sim, VRM | Sim, animação por gestos | Sim |
| AIRI | Sim, VRM | Sim, animação de avatar | Sim |
| xiaoke.ai | Sim, VRM/GLB/PMX | Sim, animação e movimentos | Sim |
| Miko | Sim, VRM/Unity | Sim | Sim, configuração específica |

“Movimento ao vivo” indica animação durante a interação, não necessariamente geração neural inédita de poses em tempo real. As capacidades são as documentadas pelos desenvolvedores; não realizei benchmarks locais de latência e FPS.

### 7. Arquitetura que recomendo investigar para sua Alice

Para alcançar o comportamento do Kindroid, a presença tridimensional do Replika e a fluidez do Ani-2 sem depender de infraestrutura proprietária, a combinação mais promissora é:

\`\`\`text
Alice: personalidade + memória
LLM local via vLLM + memória vetorial/estruturada
                |
     Voz e Comportamento
     ASR local / TTS / lip-sync
     Emoção / intenção / gesto / estado
                |
   Motor híbrido de movimento
   Utsuwa ou AIRI + StreamTalk/ARDY + procedural
                |
             Alice 3D
Blender -> VRM/GLB -> Three.js, física, renderização
\`\`\`

A distinção fundamental é que **Utsuwa, AIRI e xiaoke.ai oferecem a infraestrutura do personagem**, enquanto os modelos de movimento estudados anteriormente podem acrescentar geração neural de gestos e poses. Essa integração ainda exige engenharia e validação, especialmente para retargeting, sincronização e controle de latência.

Para seu ambiente com RTX 3090 e RTX 4060 Ti, minha ordem de investigação seria **Utsuwa primeiro, xiaoke.ai segundo e AIRI terceiro**. O Utsuwa apresenta o caminho mais bem documentado para Linux, API vLLM e TTS em Docker; o xiaoke.ai oferece compatibilidade GLB direta e uma estrutura de animação mais diversificada.

**Conclusão:** o Kindroid e o TalkingMachines são as melhores referências comerciais de animação conversacional generativa encontradas nesta pesquisa. Para construir uma alternativa verdadeiramente local, o Utsuwa é a base de software mais adequada, mas será necessário complementar seu motor de movimento para alcançar a fluidez corporal do Ani-2.


## Registro 3 — Auditoria técnica dos repositórios AIRI, xiaoke, Utsuwa e alternativas (terceira saída)

# Auditoria técnica: qual projeto permite mais gestos e melhor integração com a Alice?

Pesquisa em 3 de novembro de 2026 | Repositórios, documentação e implementação dos motores de animação.

### 1. Resultado inicial da auditoria

**Para variedade de gestos e movimentos corporais, o xiaoke.ai é o mais interessante dos projetos analisados. Para construir uma plataforma extensível de IA local, o AIRI oferece uma base arquitetural mais ampla.**

Entretanto, existe uma distinção fundamental:

- **Mais movimentos disponíveis:** capacidade de carregar bibliotecas extensas de animações.
- **Mais liberdade de movimento:** capacidade de combinar poses, controlar articulações e gerar novos movimentos dinamicamente.

Nenhum dos sete projetos demonstrou, em sua implementação padrão, liberdade de movimento neural equivalente ao Ani-2. Todos dependem, em algum grau, de animações existentes, controle procedural, modelos preparados ou captura de movimento.

#### Classificação técnica preliminar

| Projeto | Variedade de gestos | Integração com IA local | Avaliação |
|---|---|---|---|
| [xiaoke.ai](https://github.com/liupig/xiaokeai) | Muito alta com biblioteca MMD/VMD | Alta | Melhor motor de performances |
| [Seu AIRI](https://github.com/overcyber/airi) | Extensível, exige trabalho para ampliar a expressividade | Muito alta | Melhor base arquitetural |
| [Utsuwa](https://github.com/JuiceBoxxGames/utsuwa) | Biblioteca VRMA expansível, com restrições de acionamento | Muito alta | Melhor solução VRM pronta |
| [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) | Dependente dos movimentos do modelo Live2D | Muito alta | Melhor alternativa 2D |
| [Riko](https://github.com/rayenfeng/riko_project) | Muito limitada na edição pública | Média | Protótipo simples |
| [LLM-Live2D Desktop](https://github.com/ylxmf2005/LLM-Live2D-Desktop-Assitant) | Dependente do rig Live2D | Não recomendada | Repositório bloqueado |

Classificação qualitativa de capacidade de extensão e recursos documentados, não benchmark de qualidade visual, FPS ou quantidade de animações incluídas.

### 2. Seu repositório AIRI: estado real

Consultei o repositório [overcyber/airi](https://github.com/overcyber/airi) e comparei sua árvore com a origem [moeru-ai/airi](https://github.com/moeru-ai/airi).

A verificação identificou:

| Propriedade | Resultado |
|---|---|
| Repositório | \`overcyber/airi\` |
| Origem | \`moeru-ai/airi\` |
| Branch | \`main\` |
| Criação do fork | 03/11/2026 |
| Commits exclusivos no fork | 0 |
| Commits pendentes da origem na consulta | 1 |
| Licença principal | MIT |

Portanto, **seu fork ainda corresponde praticamente ao AIRI original**. Não encontrei alterações próprias no motor de animação. Isso é positivo para desenvolver a integração sem precisar resolver divergências prévias.

O AIRI já trabalha com VRM, Live2D, Spine e um renderer Godot experimental. A documentação de outubro de 2026 confirma esses formatos e ressalta que o renderer Godot ainda está em desenvolvimento.

> Observação editorial de novembro de 2026: os números da tabela descrevem a consulta histórica feita *antes* dos novos commits de planejamento; após a criação deste documento, o fork naturalmente possui commits próprios.

### 3. Descoberta importante: o AIRI já possui suporte MMD nativo

Isso muda a estratégia de integração.

O projeto AIRI implementou suporte a MMD/PMX em agosto de 2026. A documentação atual confirma importação de modelos \`.pmx\` e \`.pmd\`, além de VRM, Live2D e Spine.

Ao examinar o código de \`packages/stage-ui-mmd\`, identifiquei:

- Importação e registro de animações VMD.
- Execução de animações únicas e em loop.
- Transições entre movimentos utilizando *crossfade*.
- Retorno à animação de espera ao finalizar um gesto.
- Controle de cinemática inversa (IK).
- Controle de *append bones* e gravidade.
- Física de cabelos e roupas via Ammo.
- Expressões faciais e lip-sync.
- Associação entre emoções do personagem e movimentos corporais.
- Solicitações de animação através de um barramento de ações, inclusive entre janelas Electron.

Os principais pontos de implementação são:

- [animation-manager.ts](https://github.com/moeru-ai/airi/blob/main/packages/stage-ui-mmd/src/composables/mmd/animation-manager.ts): Registry, playAction, playIdle, crossfade, IK e física.
- [MMD.vue](https://github.com/moeru-ai/airi/blob/main/packages/stage-ui-mmd/src/components/scenes/MMD.vue): Pipeline de renderização, expressões, VMD e animação.
- [stores/mmd.ts](https://github.com/moeru-ai/airi/blob/main/packages/stage-ui-mmd/src/stores/mmd.ts): Solicitações de animação, BroadcastChannel e persistência.

#### O problema que ainda existe no AIRI

O mecanismo MMD possui os recursos para reproduzir movimentos variados, mas ainda não oferece um diretor conversacional tão sofisticado quanto o xiaoke.ai.

Atualmente, o \`MMD.vue\` pode selecionar uma animação associada a uma emoção e receber solicitações de execução pelo barramento interno. Isso não equivale a gerar gestos espontâneos continuamente a partir da fala.

No renderer VRM, a limitação é mais evidente. O \`VRMModel.vue\` carrega uma animação de espera \`.vrma\` e inicia um \`AnimationMixer\`. Há expressões, movimentos oculares e lip-sync, mas não um compositor completo de gestos corporais conversacionais.

[Examinar implementação VRM](https://github.com/moeru-ai/airi/blob/main/packages/stage-ui-three/src/components/Model/VRMModel.vue).

**Consequência:** manter seu fork AIRI e ampliar o mecanismo MMD é tecnicamente mais interessante do que abandonar toda a plataforma para utilizar outro projeto.

### 4. xiaoke.ai: o sistema com o comportamento corporal mais elaborado

> Elemento visual da resposta original: demonstração do xiaoke.ai usando avatar PMX/MMD.

O xiaoke.ai não oferece apenas uma lista de gestos. Ele possui uma camada chamada \`PerformanceDirector\`, responsável por controlar continuamente a presença do personagem.

#### Mecanismos encontrados no código

| Mecanismo | Implementação identificada |
|---|---|
| Estados comportamentais | \`idle\`, \`listening\`, \`thinking\`, \`speaking\` |
| Cabeça | Inclinações, rotações e pequenos acenos |
| Olhar | Desvios temporários, retorno ao observador |
| Fala | Pequenos movimentos associados à intensidade do áudio |
| Expressões | Intensidade emocional variável e decaimento |
| Gestos | Acionamento por intenção, por eventos ou por nome |
| Espera | Movimentos escolhidos periodicamente de um repertório |
| Interação física | Reações procedurais ao toque |
| Dança | Animação VMD com música e câmera |
| Transições | Interpolação de posições e quaternions |

Esses mecanismos estão implementados em [director.ts](https://github.com/liupig/xiaokeai/blob/master/companion/frontend/src/engine/director.ts), [motion.ts](https://github.com/liupig/xiaokeai/blob/master/companion/frontend/src/engine/motion.ts) e [orchestrator.ts](https://github.com/liupig/xiaokeai/blob/master/companion/frontend/src/features/performance/orchestrator.ts).

O diretor acrescenta, por exemplo, pequenos acenos em pontos de maior intensidade vocal, olhar desviado durante o pensamento e novos gestos em intervalos variáveis durante a fala.

#### Uma limitação relevante descoberta no código

A leitura de \`stage.ts\` mostra que o mecanismo de reprodução VMD (\`MotionPlayer\`) é vinculado diretamente ao \`SkinnedMesh\` MMD durante \`setupMMD()\`.

Para modelos VRM e GLB, o sistema utiliza outros adaptadores de esqueleto, expressões e movimento procedural, mas **não registra o mesmo MotionPlayer VMD**.

Na prática:

| Formato | Movimento procedural | Reprodução VMD pelo MotionPlayer |
|---|---|---|
| PMX/MMD | Sim | Sim |
| VRM | Sim | Não, na implementação examinada |
| GLB | Sim, com rig compatível | Não, na implementação examinada |

Portanto, se escolhermos xiaoke.ai pelo repertório de movimentos, **eu utilizaria um avatar PMX**, e não um GLB carregado diretamente.

Essa diferença não aparece claramente no marketing do projeto. Ela é importante para evitar uma integração que carrega o personagem corretamente, mas não consegue executar as animações esperadas.

### 5. Utsuwa: amplo catálogo VRMA, mas com limites no uso automático

**Utsuwa — SvelteKit, Tauri, VRM e VRMA.**

- [Repositório](https://github.com/JuiceBoxxGames/utsuwa)
- [Documentação de animações](https://github.com/JuiceBoxxGames/utsuwa/blob/main/src/content/docs/guides/animations.md)

O Utsuwa permite carregar movimentos VRMA personalizados, descrevê-los para que o LLM compreenda quando utilizá-los e configurar animações de espera, pensamento e fala.

A documentação confirma **sete emotes incluídos e cinco animações de espera**, além da possibilidade de importar outros arquivos. Cada animação importada deve ter até 25 MB e duração máxima de 60 segundos.

Entretanto, o mecanismo de acionamento possui restrições explícitas:

| Restrição | Comportamento |
|---|---|
| Gestos automáticos por resposta | Um emote por resposta |
| Repetição do mesmo gesto | Intervalo mínimo de 20 segundos |
| Execução de outro emote | Intervalo global de 8 segundos |
| Emote em execução | Nova solicitação pode ser descartada |
| Controle corporal simultâneo | Limitado pela lógica de reprodução existente |

O código também possui uma ferramenta de gestos sincronizados a segmentos de fala, mas ela utiliza apenas seis categorias: \`smile\`, \`laugh\`, \`surprise\`, \`nod\`, \`shake_head\` e \`wave\`. Essas categorias não equivalem ao catálogo completo de animações VRMA.

O Utsuwa, portanto, **não é limitado a sete animações**, mas a organização atual do comportamento conversacional restringe a frequência e a combinação dos gestos.

Para modificar isso, seria necessário alterar \`action-gate.ts\`, o agendador da fala e a política de concorrência entre as animações.

O ponto positivo é que sua integração com LLM e voz locais é bastante direta, e existe suporte a Linux. O ponto negativo para desenvolvimento de um sistema próprio é o licenciamento AGPL-3.0 da versão atual, que exige cuidados adicionais caso você distribua uma versão modificada ou disponibilize o software como serviço.

### 6. Open-LLM-VTuber: excelente infraestrutura de voz, menor liberdade corporal

O [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) utiliza modelos Live2D em vez de personagens tridimensionais com esqueleto humanoide completo.

> Elemento visual da resposta original: captura do Open-LLM-VTuber.

A implementação oferece integração direta com provedores OpenAI-compatible, vLLM, Ollama, Faster-Whisper, sherpa-onnx, GPT-SoVITS e outros mecanismos de TTS. Possui comunicação em tempo real, percepção de câmera ou tela e interrupção da fala.

No código de \`src/open_llm_vtuber/live2d_model.py\`, o sistema traduz marcadores emocionais em expressões configuradas no modelo Live2D. Os movimentos corporais dependem dos parâmetros, deformadores, expressões e animações que o artista criou no rig.

Isso significa que um personagem Live2D bem preparado pode parecer muito natural, especialmente em enquadramentos de rosto e tronco. Entretanto, a quantidade de movimentos disponíveis é limitada pela estrutura artística e pelos parâmetros do modelo.

**Não o escolheria para a Alice se o requisito prioritário for movimento tridimensional de corpo inteiro**, mas é uma alternativa válida se você optar por personagens 2D com expressividade facial elevada e menor custo computacional de renderização.

#### AIRI + MAGIC pode superar o Live2D convencional?

Há uma possibilidade interessante no seu fork AIRI.

O pacote [motion-driver-magic](https://github.com/moeru-ai/airi/blob/main/packages/motion-driver-magic/README.md) implementa geração procedural baseada em modelos VAR e AR-HMM, com transições entre perfis de movimento.

Diferentemente de simplesmente repetir uma animação fixa, o MAGIC pode produzir variações contínuas de parâmetros Live2D aprendidos a partir de sequências previamente fornecidas.

Isso pode reduzir a sensação de repetição durante períodos prolongados de espera e conversação, mas **não cria movimentos 3D inéditos** nem substitui um gerador generativo corporal.

### 7. Riko e LLM-Live2D-Desktop-Assitant

#### Riko Project

[Riko Project](https://github.com/rayenfeng/riko_project) — Python, Three.js, VRM, Faster-Whisper e GPT-SoVITS.

A edição pública do Riko é deliberadamente um protótipo pequeno. Ao verificar seu \`client/index.html\`, encontrei um avatar VRM com posicionamento estático dos braços e sincronização labial baseada na amplitude do áudio.

Não encontrei um controlador de gestos corporais autônomos nessa implementação pública.

A própria documentação esclarece que as versões mais recentes, com expressões e animações escolhidas pelo personagem, fazem parte das versões Full Source e Desktop distribuídas separadamente pelo desenvolvedor.

É apropriado para aprender a integração básica entre Python, voz e VRM, mas não para ser a base do projeto de animação mais avançado.

> Elemento visual da resposta original: demonstração do Riko.

#### LLM-Live2D-Desktop-Assitant

O acesso ao repositório foi bloqueado pelo GitHub com status HTTP 451 devido a uma reclamação de direitos autorais apresentada pela Live2D Inc. em julho de 2026.

A reclamação aponta redistribuição não autorizada de arquivos proprietários do SDK Cubism e de materiais do modelo de exemplo Shizuku. Trata-se de uma alegação registrada no processo DMCA, não de uma decisão judicial que eu tenha verificado.

Além disso, a documentação anteriormente indexada informa que o autor pretendia transferir seus recursos Electron para o projeto Open-LLM-VTuber principal e provavelmente interromperia sua manutenção.

**Eu excluiria esse repositório da arquitetura da Alice.**

### 8. Comparação específica de liberdade de movimento

Esta é a classificação que considero mais relevante para sua decisão.

| Capacidade | AIRI MMD | xiaoke PMX | Utsuwa VRM | AIRI Live2D + MAGIC | Open-LLM-VTuber |
|---|---|---|---|---|---|
| Importar movimentos adicionais | Sim, VMD | Sim, VMD | Sim, VRMA | Perfis e motions Live2D | Dependente do rig |
| Gestos disparados pelo LLM | Parcial, via emoção/ações | Sim, eventos e intenção | Sim, com restrições | Via controle e eventos | Principalmente expressões |
| Microgestos durante a fala | Limitados por padrão | Sim | Alguns | Sim, procedural | Dependente do rig |
| Movimento de cabeça/olhar contínuo | Sim | Sim | Sim | Sim | Sim |
| Física de cabelo/roupa | Sim | Sim, PMX | Sim | Deformação 2D | Física 2D, conforme rig |
| Controle corporal completo | Via VMD/IK | Via VMD/IK | Via VRMA | Não 3D | Não 3D |
| Criação neural de novas poses | Não | Não | Não | Não 3D | Não |
| Facilidade de ampliar animações | Alta | Muito alta | Alta | Alta, exige perfis | Dependente da modelagem |

**Resultado:** xiaoke.ai possui a melhor direção de performance conversacional pronta. AIRI MMD possui infraestrutura suficiente para implementar uma direção equivalente sem substituir sua plataforma inteira.

Há, porém, uma limitação comum aos dois: a execução tradicional de uma animação de corpo inteiro pode interromper temporariamente os microgestos procedurais. No xiaoke, por exemplo, o \`PerformanceDirector\` evita disputar ossos com o VMD enquanto uma animação está ativa.

Para atingir a fluidez do Ani-2, eu não me limitaria a copiar o seletor de movimentos. Implementaria também um compositor de movimento por regiões do corpo.

### 9. Arquitetura recomendada para integrar tudo ao seu AIRI

\`\`\`text
AIRI: interface e agente conversacional
seu fork overcyber/airi — chat, personalidade, contexto e eventos
                   |
        +-----------------------+
        |                       |
    Serviços de IA        Motion Director
    vLLM, STT, TTS,       estados, emoções, gestos,
    memória, visão        prioridades, comportamento
        |                       |
        +-----------------------+
                   |
       Motion Mixer: novo módulo
       camadas corporais, crossfade, IK,
       estabilização de pés, interpolação
                   |
          Renderer AIRI MMD
          PMX + VMD + morphs + física +
          áudio + renderização local
\`\`\`

#### Etapa 1: aproveitar os módulos existentes

AIRI já possui um registro de movimentos no \`MMDAnimationManager\`. Não precisaria criar outro mecanismo básico de leitura VMD.

Eu acrescentaria um serviço \`MotionDirector\` com a lógica comportamental adaptada do xiaoke, responsável por observar o estado do diálogo, a intensidade da voz, as intenções reconhecidas, a emoção predominante e as animações disponíveis.

A comunicação com o mecanismo atual poderia utilizar \`useMMD().playOneShotAction(...)\`, cujo caminho de execução foi confirmado na store MMD e no \`MMD.vue\`.

#### Etapa 2: adicionar combinação por partes do corpo

Essa é a melhoria técnica com maior impacto visual.

| Camada | Comportamento |
|---|---|
| Camada base | Respiração e postura |
| Cabeça e olhos | Olhar e atenção |
| Braços e mãos | Gestos conversacionais |
| Rosto | Emoção e lip-sync |

O compositor aplicaria máscaras articulares e prioridades de animação para evitar que uma camada sobrescreva indevidamente outra.

O resultado esperado é permitir que Alice mantenha a postura corporal, mova a cabeça, olhe para o observador, gesticule com uma das mãos e fale, simultaneamente.

Isso exige trabalho adicional porque não basta executar dois arquivos VMD completos. É necessário decompor os movimentos em camadas, identificar ossos afetados, normalizar as poses e resolver conflitos cinemáticos.

#### Etapa 3: usar eventos estruturados, não apenas palavras-chave

Em vez de depender exclusivamente de marcadores como \`[act:wave]\`, o agente enviaria eventos semânticos ao controlador.

Exemplo de contrato proposto:

\`\`\`json
{
  "event": "motion.intent",
  "state": "speaking",
  "emotion": "curious",
  "intensity": 0.65,
  "gesture": "explain_left_hand",
  "start_offset_ms": 750,
  "duration_ms": 1600,
  "priority": 40,
  "body_mask": ["spine", "left_arm", "left_hand"],
  "blend_in_ms": 220,
  "blend_out_ms": 350
}
\`\`\`

O LLM decidiria **o que o personagem pretende expressar**, não a rotação exata de cada osso. O Motion Director decidiria como representar essa intenção com segurança e continuidade.

Isso também evita utilizar o LLM para controlar diretamente todos os quadros de animação, o que seria computacionalmente caro e sensível à latência de geração de tokens.

### 10. Como ultrapassar o limite das bibliotecas VMD e VRMA?

Se o requisito final for criar continuamente movimentos corporais novos, apenas ampliar uma biblioteca não será suficiente.

A próxima camada seria um serviço dedicado à geração neural, mantendo o AIRI responsável pela renderização.

#### ARDY

Gera movimento corporal condicionado por texto, trajetória e restrições articulares. O repositório fornece checkpoints, geração autoregressiva e demonstração interativa.

[Código-fonte](https://github.com/nv-tlabs/ardy).

#### StreamTalk

Especializado em gerar gestos relacionados ao áudio. É mais adequado que ARDY para movimentos espontâneos durante conversas.

[Código-fonte](https://github.com/Xiangyue-Zhang/StreamTalk).

Ambos exigem uma camada adicional de **retargeting de esqueleto** antes de enviar os movimentos para um personagem PMX, VRM ou GLB. Também precisam ser testados na RTX 3090 e integrados ao mecanismo de animação; a existência de um checkpoint não demonstra compatibilidade direta com AIRI.

Eu priorizaria StreamTalk para gestos durante a fala e ARDY para movimentos comandados, como caminhar, mudar de postura, sentar e executar ações corporais mais longas.

### 11. Compatibilidade com seus serviços locais

| Subsistema | Implementação proposta | Decisão |
|---|---|---|
| Interface e identidade | Seu fork AIRI | Manter |
| Modelo conversacional | vLLM local | Manter serviço separado |
| Memória persistente | Sistema local de memória estruturada/vetorial | Integrar via API |
| STT | Faster-Whisper ou SenseVoice | Serviço separado |
| TTS | Qwen3-TTS ou GPT-SoVITS | Serviço separado |
| Renderização | AIRI MMD, usando PMX | Adotar inicialmente |
| Direção de gestos | Adaptar PerformanceDirector do xiaoke | Implementar no AIRI |
| Biblioteca de movimentos | VMD, com catálogo semântico | Expandir |
| Geração neural | StreamTalk/ARDY | Experimento posterior |
| Transporte | WebSocket/eventos locais | Padronizar |
| Empacotamento | Docker para IA e backend; desktop/browser para renderer | Separar responsabilidades |

Os serviços de inferência podem ser distribuídos entre suas GPUs, mas a compatibilidade real dependerá dos modelos carregados simultaneamente. Eu não presumiria que StreamTalk, ARDY, vLLM e TTS poderão compartilhar as duas GPUs sem um planejamento de memória e testes de latência.

Para testar a evolução, utilizaria medições de FPS, tempo entre áudio e gesto, latência de acionamento, utilização de GPU, sobreposição de animações, deslizamento dos pés, descontinuidades articulares e repetição de gestos em sessões longas.

### 12. Decisão final

**BASE DEFINITIVA RECOMENDADA: AIRI + MMD + Motion Director**

Aproveitar seu fork, manter a infraestrutura conversacional e desenvolver a fluidez corporal no renderer MMD.

**REFERÊNCIA DE ANIMAÇÃO: xiaoke.ai**

Reutilizar conceitos e, quando apropriado, partes do código do diretor de performance, sincronização de movimentos e seleção de repertório.

**Eu não substituiria seu AIRI pelo Utsuwa, Riko ou Open-LLM-VTuber.** O xiaoke é o único que justificaria uma migração completa se sua prioridade absoluta fosse aproveitar imediatamente seu motor de performances em PMX, com menos desenvolvimento próprio.

Mas seu AIRI já possui MMD, VMD, física, IK, controle facial e integração modular com IA. A maior lacuna está na **orquestração contínua e na composição dos movimentos**, e não na ausência de um renderer adequado.

O caminho mais eficiente é preservar a plataforma AIRI, incorporar a lógica de comportamento do xiaoke e construir um Motion Mixer por camadas. Depois, integrar um gerador neural para ultrapassar a limitação das animações prontas.

**Limite desta auditoria:** examinei documentação, configuração e arquivos específicos de implementação dos repositórios, mas não executei os aplicativos nem fiz benchmarks na sua máquina. As classificações refletem capacidades verificadas no código e esforço estimado de integração, não medições empíricas de qualidade visual.


## Registro 4 — Qual projeto já tem orquestração contínua e composição de movimentos? (quarta saída)

**O xiaoke.ai é o que já possui a orquestração contínua de movimentos mais completa entre os projetos analisados.** Entretanto, nenhum deles implementa integralmente uma composição corporal por camadas equivalente a um Motion Mixer avançado.

| Projeto | Orquestração contínua | Composição simultânea de movimentos |
|---|---|---|
| **xiaoke.ai** | Sim, avançada | Parcial |
| **AIRI MMD** | Parcial | Parcial |
| **AIRI Live2D + MAGIC** | Sim, procedural | Sim, limitada aos parâmetros 2D |
| **Utsuwa** | Sim, baseada em estados | Limitada |
| **Open-LLM-VTuber** | Parcial | Dependente do rig Live2D |
| **Riko Project** | Não, na versão pública | Não |

### O que já funciona no xiaoke.ai

O \`PerformanceDirector\` implementa continuamente:

- Movimentos de cabeça, olhar, tronco e microexpressões.
- Gestos relacionados à intensidade da fala.
- Comportamentos distintos para esperar, escutar, pensar e falar.
- Reações ao toque e seleção de animações a partir do contexto.
- Interpolação de poses e transições suaves entre animações.

**Limitação importante:** quando uma animação VMD assume o controle corporal, o diretor procedural deixa de controlar os ossos correspondentes, evitando conflitos. Isso não é composição simultânea independente de várias animações.

O código está em [director.ts](https://github.com/liupig/xiaokeai/blob/master/companion/frontend/src/engine/director.ts) e [motion.ts](https://github.com/liupig/xiaokeai/blob/master/companion/frontend/src/engine/motion.ts).

### Diferença principal

O **xiaoke.ai** já combina estados comportamentais, microgestos e animações VMD. Mas, para alcançar composição simultânea avançada, ainda precisaria implementar máscaras articulares e mistura aditiva, permitindo, por exemplo, que uma mão gesticule enquanto as pernas caminham e a cabeça acompanha a conversa.

O **AIRI MMD** já possui \`AnimationMixer\`, transições, física e IK, mas sua direção automática de movimentos ainda é menos elaborada. O **AIRI Live2D + MAGIC** gera variações procedurais contínuas para personagens 2D.

**Minha escolha para uso imediato:** xiaoke.ai com avatar PMX.

**Minha escolha para evolução do seu sistema:** manter o AIRI e integrar o \`PerformanceDirector\` do xiaoke, acrescentando um Motion Mixer por camadas.

---

## Nota sobre a integridade do arquivo

Este arquivo reúne em um único Markdown o planejamento novo e **as quatro saídas informativas anteriores** sobre o tema nesta conversa: pesquisa Ani-2; plataformas comerciais e locais; auditoria detalhada dos repositórios; comparação final. Tabelas, textos, comandos, URLs e conclusões estão documentados. Elementos multimodais dinâmicos do chat (imagens geradas por pesquisa, cartões de entidade e widgets) são descritos textualmente; não é possível incorporar diretamente o estado visual desses componentes a um arquivo Markdown estático.

As recomendações evoluíram durante a pesquisa. Em especial, a recomendação preliminar de Utsuwa/AIRI como base mudou após a verificação do código MMD nativo do AIRI, que fundamenta o planejamento da Parte I. Informações históricas não devem ser confundidas com estado de implementação já concluída.

**Próximo passo técnico:** implementar P0 (baseline/telemetria) e P1 (MotionDirector) em commits separados, sem modificar os contratos de renderização antes dos testes de regressão.




