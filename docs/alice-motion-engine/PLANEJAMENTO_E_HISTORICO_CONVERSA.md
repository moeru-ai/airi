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

<!-- HISTORICO_PENDENTE -->
