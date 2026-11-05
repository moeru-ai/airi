# Planejamento 04 — Revisão dos movimentos: Utsuwa x AIRI x avatar3d

**Projeto:** Alice / fork [overcyber/airi](https://github.com/overcyber/airi)
**Data:** 04/11/2026
**Natureza:** revisão do Planejamento 03. Somente documentação. Os Planos 01 e 02 não mudam.
**Método:** leitura do código. AIRI e TalkingHead lidos no disco. Utsuwa lido no GitHub (`main`, versão 0.21.3), arquivo por arquivo, sem listagem completa da árvore.

## Contexto

O responsável disse que a análise anterior não foi profunda: o Utsuwa tem mais movimentos que o AIRI, o avatar3d (TalkingHead + Eva) é mais realista, e o pedido era alterar e atualizar o próprio `overcyber/airi`. Ele pediu **apenas a revisão**.

A auditoria do código confirmou as duas afirmações. O erro do Planejamento 03 foi seguir o Plano 01 (PMX/MMD primeiro), sem medir o movimento real do AIRI:

- o renderer VRM tem 1 animação;
- o MMD não traz nenhuma animação;
- o avatar3d e o Utsuwa estão à frente.

O fork já está em dia com o upstream: o merge `2d4c53d` contém o `4f0cb5c` (v0.15.0), que é o topo atual do `moeru-ai/airi`. Então "atualizar" significa levar para dentro do AIRI o que o Utsuwa e o avatar3d fazem melhor.

Execução desta revisão: **só documentação**. Nenhum código muda até a nova ordem ser aprovada.

## Fatos verificados

| Recurso | AIRI-VRM | AIRI-MMD | Utsuwa (VRM) | avatar3d (TalkingHead) |
|---|---|---|---|---|
| Animações de corpo incluídas | 1 (`idle_loop.vrma`) | 0 | 13 VRMA: 5 idle, 7 emotes, 1 fala | ~20 FBX Mixamo |
| Idle variado | não | não | sim (alterna 5 idles, não repete) | sim (13 poses, troca 5–30 s por humor) |
| Clipe de fala | não | não | sim (`talking.vrma`) | gestos de mão com IK (`speakWithHands`) |
| Gestos/emotes | 0 | só se o nome do VMD bater | 7 emotes escolhidos pelo LLM (JSON `action`) | 13 gestos + 50 macros de emoji, via MQTT |
| Importar movimento novo | não | VMD | VRMA ≤25 MB/60 s, com descrição para o LLM | FBX por URL |
| Humor → corpo | só rosto, reset em 3 s | rosto + VMD opcional | rosto (12 humores → 5 presets, intensidade) | pose, respiração, cabeça, voz |
| Blendshapes faciais | presets VRM | morphs japoneses | ~21 nomes VRM | 72 (ARKit 52 + 15 visemas) |
| Respiração / balanço | não / só o idle | não | não / só o idle | sim / sim |
| Piscar e olhar | sim, sacadas simples | sim | piscar sim, sem sacadas | sim, com contato visual |
| Lip-sync | wLipSync, 5 vogais | wLipSync | bandas de áudio, 5 vogais + jaw | 15 visemas do texto. **O pt-BR é cópia do inglês.** |
| Física | spring bones | Ammo | spring bones ajustável + reação à câmera | dynamic bones existem, desligados |
| Camadas/máscaras | não | não | não (só crossfade) | gesto sobre pose |
| Licença | MIT | MIT | **AGPL-3.0** (MIT até 0.12.0) | MIT (TalkingHead) |

Limites do Utsuwa:

- recarga de 20 s por ação e de 8 s global;
- no máximo 1 ação por resposta;
- os 6 gestos de fala (`gesture_segment`) parecem não chegar ao avatar (não totalmente verificado).

Fontes:

- AIRI: `packages/stage-ui-three/src/components/Model/VRMModel.vue:466-524,827-846`, `composables/vrm/expression.ts:53-98`, `packages/stage-ui-mmd/src/composables/mmd/animation-manager.ts:120-201`.
- Utsuwa: `src/lib/services/avatar/avatar-animator.ts`, `src/lib/stores/animation-library-parser.ts:39-65`, `src/lib/engine/action-gate.ts:14`, `src/lib/engine/expression-compose.ts`, `src/lib/services/avatar/body-motion.ts`.
- TalkingHead: `talkinghead.mjs:200-329,409-468,449-649`, `eva-ruiva-arkit.glb` (72 morphs, 67 juntas).

## Conclusões da revisão

1. **Base do avatar no AIRI = renderer VRM**, não MMD. Isso fica coerente com a D1 já decidida (VRMs do responsável e Eva convertida para VRM). O caminho PMX das S06/S07 sai da frente.
2. **Do Utsuwa vem a biblioteca de movimentos**, implementada de forma própria (AGPL, sem copiar código):
   - várias animações VRMA de idle, alternando;
   - clipe de fala;
   - emotes escolhidos pelo LLM;
   - importação de VRMA com descrição.
   - Sem a recarga rígida de 20 s / 8 s: a S04 (scheduler) cuida das prioridades.
3. **Do avatar3d vem o realismo procedural.** O TalkingHead é MIT, então dá para portar com aviso de licença:
   - respiração;
   - troca de pose por humor;
   - balanço com troca de peso;
   - contato visual com cabeça;
   - humor mudando o corpo, não só o rosto.
   - Também vem a Eva com as 72 expressões ARKit preservadas como expressões customizadas do VRM.
4. **Os 20 FBX Mixamo** precisam ser convertidos para VRMA, para não perder o repertório que já existe.
5. A camada com máscaras e mistura aditiva (Plano 01, P3) passa a ser feita no **VRM**. Nem o Utsuwa nem o AIRI têm isso: é aí que o AIRI passa os dois.
6. **A NeoAlice continua congelada.** O AIRI recebe os comandos atuais por MQTT (S08).

## Análise do código: por que o Utsuwa parece mais fluido

Fonte: `main` do Utsuwa, lido arquivo por arquivo: `src/lib/services/avatar/avatar-animator.ts`, `src/lib/engine/expression-compose.ts`, `src/lib/engine/mood-expression.ts` e `src/lib/components/vrm/VrmModel.svelte`. O Utsuwa é AGPL-3.0. Por isso só os conceitos e os tempos entram no AIRI, com implementação própria.

| Situação | Utsuwa | AIRI hoje |
| --- | --- | --- |
| Parado | Pool de idles: sorteia um diferente do último, troca depois de 1 a 2 voltas (`duração × (1 + aleatório)`), crossfade de 1,2 s. Adia a troca enquanto fala, pensa ou faz emote. | Um clipe só, sem troca (`clipAction(clip).play()`, `VRMModel.vue:844-845`) |
| Recebe texto | Clipe de pensar entra em 0,3 s enquanto espera a resposta. Clipe de falar entra em 0,3 s durante a fala (sem TTS: texto ÷ 15 caracteres/s, mínimo 1 s). Volta ao idle em 0,3 s. | Nenhum clipe de pensar ou falar. Só o rosto mexe. |
| Emote | Entra em 0,2 s, toca uma vez a 1,5×, trava no último quadro e solta em 0,3 s antes de voltar ao idle. Rosto feliz a 0,7. | Não existe no VRM |
| Muda de humor | Rosto permanente, com suavização exponencial (`delta × 1,5`). O humor antigo sai por completo antes do novo. Peso = escala × intensidade (0,3 a 0,8). Uma reação passa por cima: entra em 0,25 s, segura 2,5 s (até 8 s enquanto fala), sai em 0,8 s. | O rosto some depois de 3 s (`setEmotionWithResetAfter(expression, 3000)`, `VRMModel.vue:1111`) |
| Piscar | A cada 2–6 s, cerca de 0,125 s, fecha rápido (30%) e abre devagar (70%) | A cada 1–6 s, 0,2 s |
| Física | Spring bones com delta limitado a 1/30 s e balanço quando a câmera gira | Spring bones |

## O que o xiaoke acrescenta

Fonte: `companion/frontend/src/engine/director.ts` do xiaoke (Apache-2.0). Como a licença permite, o código pode ser portado com aviso de licença (NOTICE). O diretor tem 4 estados: idle, listening, thinking e speaking.

- **Falando:**
  - aceno nos acentos da boca (pausa de 0,55–1,0 s, decaimento `exp(−6·dt)`);
  - o tronco acompanha a boca;
  - 20% de chance de desviar o olhar;
  - um gesto de fala a cada 3,4–6,2 s.
- **Pensando:** desvia o olhar por 1,8–4,2 s.
- **Parado:** micro-alvos de cabeça, troca de expressão a cada 5–12 s e um movimento do pool a cada 8–18 s.
- **Depois de falar ou pensar:** um "empurrão" de idle de 1,4–2,8 s.

Isso preenche o que falta ao Utsuwa: cabeça e tronco vivos entre os clipes.

## Ordem de investigação do histórico (seção 7 do Plano 01)

O histórico mandava investigar **Utsuwa primeiro, xiaoke segundo e AIRI terceiro**, com um "motor híbrido de movimento: Utsuwa ou AIRI + StreamTalk/ARDY + procedural". O Planejamento 03 inverteu essa ordem. Esta revisão a restabelece:

- **Utsuwa:** movimento de corpo e rosto;
- **xiaoke:** presença procedural;
- **AIRI:** plataforma.
- StreamTalk e ARDY continuam no fim (S17).

## Modelo padrão de teste: Neptuna

| Item | Valor |
| --- | --- |
| Arquivo | `packages/alice-motion/fixtures/vrm/neptuna/neptuna.vrm` |
| Formato | VRM 0.x, 31 MB, 247 malhas, sem animações |
| Expressões | No arquivo: a, i, u, e, o, blink, blink_l, blink_r, angry, fun, joy, sorrow, neutral, unknown. No three-vrm 3.5.5 do AIRI: neutral, aa, ih, ou, ee, oh, blink, blinkLeft, blinkRight, angry, relaxed, happy, sad, Surprised. |
| Física | 98 juntas de spring bone (cabelo e roupa) e 54 ossos humanoides |
| Validação | Carregado e renderizado em 04/11/2026 com o three 0.185.1 e o three-vrm 3.5.5 do AIRI, num Chromium sem interface, sem erros |
| Licença | VRoid Hub, do autor Mijuuri. Redistribuição, modificação e uso comercial permitidos. Crédito obrigatório. Uso sexual proibido. |

A tabela de humor do Utsuwa usa `joy`, `fun` e `sorrow` como alternativa para VRM 0.x. Por isso a Neptuna recebe humor sem mapeamento extra. Os presets do AIRI não mudam (D1).

## Estado da V1 (concluída em 04/11/2026)

O responsável autorizou copiar o código e as animações do Utsuwa e resolve a licença com o autor. Por isso a V1 porta o código, em vez de só reproduzir os conceitos.

| Entrega | Arquivo |
| --- | --- |
| 13 animações do Utsuwa (5 idles, fala, 7 emotes) e aviso de origem | `packages/stage-ui-three/src/assets/vrm/animations/utsuwa/` |
| Biblioteca de movimentos (`defaultVrmMotionLibrary`) | `packages/stage-ui-three/src/assets/vrm/animations/index.ts` |
| Animador portado do Utsuwa. A troca de idle conta o tempo do quadro em vez de `setTimeout` (regra de render loop do AIRI). | `packages/stage-ui-three/src/composables/vrm/avatar-animator.ts` |
| Diretor portado do xiaoke: cabeça e tronco | `packages/stage-ui-three/src/composables/vrm/performance-director.ts` |
| Rosto de humor do Utsuwa (`MoodFace`): humor permanente, humor antigo sai antes do novo, peso por humor, reação, piscar, rosto feliz no emote | `packages/stage-ui-three/src/composables/vrm/mood-face.ts` |
| Pose de "pensando" (mão no queixo), gerada a partir do idle do palco | `packages/stage-ui-three/src/composables/vrm/thinking-pose.ts` |
| Ligação no renderer: props `thinking` e `motionLibrary`, funções `playMotion`, `motions` e `reactExpression` | `VRMModel.vue`, `ThreeScene.vue`, `vrm-instance-cache.ts` |
| "Pensando" ligado ao envio da mensagem e toque como reação | `packages/stage-ui/src/components/scenes/Stage.vue` |

Testes:

- 53 testes do `stage-ui-three` passam: 8 do animador, 5 do diretor e 5 do humor são novos.
- Typecheck do `stage-ui-three` e do `stage-ui`: sem erros.

Validação com a Neptuna: Chromium sem interface, o código real da V1, o three e o three-vrm do AIRI, num roteiro de 50 s. Folha de capturas em `evidencias/V1/v1-resumo.png` e métricas em `evidencias/V1/metricas.json`.

| Fase | Resultado |
| --- | --- |
| Parada (0–25 s) | Troca de idle aos 19,9 s. Velocidade máxima da cabeça: 0,6 rad/s. O corpo quase não se move fora da animação. |
| Pensando (25–30 s) | A cabeça vira para um lado (até 1,5 rad/s). O corpo continua no idle. |
| Falando com humor feliz (30–38 s) | O clipe de fala entra (mão na cintura) e a cabeça inclina e acena. O rosto fica feliz. |
| Fim da fala (38 s) | Volta ao idle. O feliz assenta no tom de repouso e não volta ao neutro. |
| Emote de cumprimento (40 s) | Acena com as duas mãos a 1,5x, termina aos 44,9 s e volta ao idle. |
| Humor triste (46 s) | O triste substitui o feliz (`sad` = 0,42, `happy` = 0). |

Defeito encontrado e corrigido na validação: com `reAnchorRootPositionTrack`, o cumprimento levantava o corpo inteiro para fora do quadro. As animações da biblioteca agora tocam com a trilha de quadril do `createVRMAnimationClip`, como no Utsuwa. Só o idle do palco continua reancorado (`// NOTICE:` em `VRMModel.vue`).

### Fechamento da V1 (segunda rodada, 04/11/2026)

A primeira rodada deixou 6 itens abertos (ver `STATUS_PLANOS_01_02_E_V1.md`). Esta rodada fechou 5 deles:

| Item | O que mudou |
| --- | --- |
| Rosto e piscar no emote | `MoodFace` põe o rosto feliz a 0,7 e desliga o piscar enquanto o emote toca. |
| Transição de humor do Utsuwa | `MoodFace` usa a suavização `delta × 1,5`, apaga o humor antigo antes do novo e usa o peso por humor (0,3 a 0,8). O `expression.ts` voltou ao original do AIRI. |
| Clipe de "pensando" | O Utsuwa não tem um. A V1 gera o clipe a partir do idle do palco, com a mão direita no queixo e o braço esquerdo cruzado. |
| Partes do diretor do xiaoke | Batida de fala a cada 3,4–6,2 s, micro-expressão parada a cada 5–12 s, e troca de idle antecipada depois da fala (1,6–2,8 s) e do pensar (1,4–2,4 s). |
| Testes do monorepo inteiro | `turbo run test:run` e `turbo run typecheck` completos. Resultado em `STATUS_PLANOS_01_02_E_V1.md`. |

Defeito encontrado nesta rodada: o `VRMModel.vue` da primeira rodada nunca chamava `setTalking` nem `startThinking`. No app, os clipes de fala e de pensar não entravam. O harness da primeira rodada chamava o animador direto e não viu o defeito. Agora dois `watch` ligam `speechActive` e `thinking` ao animador.

Validação com a Neptuna, no mesmo harness, com o `VRMModel` corrigido. Capturas em `evidencias/V1/rodada-2/v1-resumo.png` e métricas em `evidencias/V1/rodada-2/metricas.json`:

| Fase | Resultado |
| --- | --- |
| Parada | Micro-expressões aos 4,1 s, 9,3 s, 14,5 s e 21,4 s. |
| Pensando (25 s) | O clipe de pensar entra: mão no queixo e cabeça para o lado. |
| Falando | Batida de fala aos 32,4 s. |
| Fim da fala (38 s) | O diretor pede a troca de idle em 1,75 s. A troca acontece aos 39,8 s. |
| Emote | Rosto feliz a 0,7, sem piscar. |
| Humor triste | `sad` assenta em 0,58 e `happy` vai a 0. |

### Teste dentro do app (terceira rodada, 04/11/2026)

O `stage-web` real rodou neste ambiente de nuvem. Os dois hosts bloqueados foram substituídos por arquivos locais, só para o teste:

- O `live2dcubismcore.min.js` veio do pacote npm `live2dcubismcore`, porque o registro npm está liberado.
- Os modelos de `dist.ayaka.moe` foram trocados por arquivos locais no cache. O teste usa a Neptuna, então eles não importam.

Um servidor falso, compatível com OpenAI, fez o papel do LLM e do TTS. O kit está em `teste-app/` e roda na sua máquina do mesmo jeito.

Resultado na Neptuna, dentro do app (folha em `evidencias/V2/app-resumo.png`):

| Fase | Resultado |
| --- | --- |
| Parada | Idles do Utsuwa com troca. |
| Esperando a resposta | Clipe de pensar (mão no queixo) com o balão "..." do app. |
| Resposta com `{"emotion":"happy","motion":"greeting"}` | Acena com rosto feliz. Console: `VRM motion played greeting`. |
| Fala | O app chamou o TTS e o clipe de fala entrou (mão na cintura). |
| Resposta com `{"emotion":"sad"}` | Rosto triste durante e depois da fala. |

Com isso, a V1 está completa.

## Estado da V2 (concluída em 04/11/2026)

A V2 faz o LLM escolher os emotes e deixa o responsável importar novos movimentos VRMA, como no Utsuwa.

| Entrega | Arquivo |
| --- | --- |
| O ACT `motion` toca o emote no VRM. Antes, só o Live2D usava o campo. | `packages/stage-ui/src/components/scenes/Stage.vue` |
| O prompt lista os emotes com a descrição, só quando o palco VRM está ativo | `packages/stage-ui/src/composables/use-airi-runtime-prompt.ts`, `packages/stage-ui/src/stores/stage-motion-catalog.ts`, chave `base.prompt.motions` |
| O nome do emote aceita variações: `Peace Sign`, `peace-sign` e `peace_sign` | `packages/stage-ui-three/src/composables/vrm/emote-cue.ts` |
| Biblioteca de movimentos: os do Utsuwa mais os VRMA importados, guardados no aparelho (IndexedDB) | `packages/stage-ui/src/stores/vrm-motions.ts`, `packages/stage-ui/src/database/repos/vrm-motions.repo.ts` |
| Seção **Motions** na configuração VRM: importar `.vrma`, editar nome e descrição, tocar, remover, e ver os emotes do Utsuwa | `packages/stage-ui/src/components/scenarios/settings/model-settings/vrm-motions.vue` |

Testes:

- 16 testes novos: 5 do `findVrmEmote`, 2 do prompt, 2 do repositório e 7 do store.
- Typecheck do `stage-ui-three` e do `stage-ui`: sem erros.

Validação dentro do app (folhas em `evidencias/V2/`):

| Fase | Resultado |
| --- | --- |
| Importar `Happy Spin.vrma` e escrever a descrição | O movimento aparece na seção **Motions** e toca com **Play**. |
| Prompt enviado ao LLM | Lista os 7 emotes do Utsuwa e `- happy_spin (Spin around with joy)`. |
| Resposta com `{"motion":"happy_spin"}` | Ela gira. Console: `VRM motion played happy_spin`. |

O kit `teste-app/` confere tudo isso sozinho. Na última rodada, as 9 verificações passaram (`evidencias/V2/verificacoes.json`).

Limite: no app desktop, o chat e o palco podem rodar em janelas diferentes. A lista de emotes do prompt vem do palco da mesma janela. Isso não foi testado no desktop.

## Estado da S03, da S04, da S08 e da V3 (05/11/2026)

O responsável aprovou os contratos v1 em 05/11/2026, com o limite de 4096 bytes por mensagem de movimento. Isso liberou a S03, a S04 e a S08.

| Sprint | Entrega | Testes |
| --- | --- | --- |
| S03 | `MotionDirector` em `packages/alice-motion`: estados do Plano 01, relógio do chamador, semente fixa, sem LLM, sessão encerrada nunca volta. Catálogo semântico com as ações do diretor, da biblioteca VRM e dos gestos e poses da NeoAlice. | 14 testes |
| S04 | `MotionScheduler`: prioridade, canais, TTL, idempotência por ID, cancelamento por sessão, fala alinhada ao áudio tocado. Casos do plano: walk + wave, walk + sit, dois gestos no mesmo braço, um gesto em cada braço, reconexão com sessão antiga. | 15 testes |
| S08 | Ponte NeoAlice somente leitura. `NeoAliceTranslator` (pacote `alice-motion`), store MQTT por WebSocket, runtime do palco com diretor e scheduler, tela **Configurações > Módulos > NeoAlice Bridge**. | 9 testes do tradutor, 6 do store, 6 do runtime, e 6 de 6 verificações no app com um Mosquitto real |
| V3 | `MoodBody` no VRM: respiração, inclinação do tronco, cabeça, ombros e balanço por humor, e contato visual por humor. Conceitos do TalkingHead (MIT). | 8 testes e comparação visual |

Decisões tomadas nesta etapa:

- Um gesto de um braço reserva só o canal daquele braço, com a mão dele. O canal `hands` passou a significar as duas mãos juntas. Assim um gesto em cada braço toca junto, como o plano pede.
- A tabela de humores saiu de `services/alice-companion` e foi para `packages/alice-motion`, para a ponte usar a mesma tabela. O ADR registra a mudança.
- No VRM, os gestos da NeoAlice sem clipe próprio usam o emote mais próximo: `index` toca `shoot` e `wave` toca `greeting`. Os outros, como `namaste`, ficam registrados no console como `no renderer clip`. A V5 (FBX para VRMA) traz os clipes que faltam.
- As ações procedurais do diretor reservam canais no scheduler, mas o VRM continua usando a camada procedural própria (xiaoke e V3). A P3 (máscaras e mistura aditiva) é que vai desenhar essas ações.

Defeitos encontrados pelos testes e corrigidos:

- No navegador, o build ESM do MQTT.js só tem export `default`. A ponte não conectava. Agora ela usa o `connect` do `default` quando o export nomeado não existe (comentário `NOTICE` no código).
- Um cue vencido ainda segurava o canal até o próximo `update` do scheduler. Agora o `submit` encerra os cues vencidos antes de decidir.
- Os campos de configuração reconectavam a ponte a cada tecla. Agora a ponte espera 500 ms de pausa.

Evidências:

- `evidencias/S08/`: sequência do vídeo no app, verificações e a contagem de publicações no log do broker. Zero publicações saíram da ponte, e 16 mensagens foram entregues a ela.
- `evidencias/V3/humores-postura.png`: a Neptuna no mesmo quadro do idle em neutro, feliz, triste e bravo, de frente e de lado.

## Nova ordem proposta (substitui S06, S07 e S15 do Planejamento 03)

| Sprint | Entrega no `overcyber/airi` | Base |
|---|---|---|
| V1 (**concluída em 04/11/2026**, ver "Estado da V1" e "Teste dentro do app") | Presença fluida no VRM, com a Neptuna como modelo de teste: pool de idles com os tempos do Utsuwa, clipes de pensar e de falar, emotes com saída limpa, rosto de humor permanente com suavização (no lugar do reset de 3 s em `VRMModel.vue:1111`) e presença procedural do diretor do xiaoke. Novo `packages/stage-ui-three/src/composables/vrm/motion-library.ts`, chamado em `VRMModel.vue:827-846`. | Seção "Análise do código" abaixo |
| V2 (**concluída em 04/11/2026**, ver "Estado da V2") | Emotes pelo LLM: estender o token ACT (`stage-ui/src/composables/queues.ts:23-60`, `Stage.vue:294-346`) com `motion`. Importação de VRMA com descrição na tela de modelo. | Padrão do Utsuwa, implementação própria |
| V3 (**concluída em 05/11/2026**) | Realismo procedural no VRM: respiração, troca de pose e peso por humor, cabeça e contato visual. O humor deixa de ser só rosto (`expression.ts`, reset de 3 s). | Conceitos do TalkingHead (MIT) |
| V4 | Eva GLB → VRM, mantendo ARKit 52 + visemas como expressões customizadas, e lip-sync mapeado | D1 / antiga S15 |
| V5 | Conversão dos ~20 FBX Mixamo para VRMA (script de retarget e verificação visual) | `talkinghead-neoalice/animations_arkit` |
| V6 | Camadas no VRM: máscara por osso e mistura aditiva (gesto de braço sem parar o idle) | Plano 01 P3, agora no VRM |
| — | S03 (director) e S04 (scheduler) **concluídas em 05/11/2026**. A S08 (ponte MQTT) **concluída em 05/11/2026**: liga a NeoAlice sem alterá-la. | Contratos v1 (`packages/alice-motion`) |

Pendências que não verifiquei:

- As 13 animações VRMA do Utsuwa não têm licença própria no repositório dele. Os nomes `VRMA_01` a `VRMA_07` parecem ser amostras oficiais da VRoid. Elas não entram neste repositório público até a licença ser confirmada. Para a V1, as alternativas são as animações oficiais da VRoid com licença confirmada, ou animações próprias.
- A licença dos FBX Mixamo para redistribuição.

Até isso ser verificado, nenhum desses arquivos entra no repositório.
