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

## Nova ordem proposta (substitui S06, S07 e S15 do Planejamento 03)

| Sprint | Entrega no `overcyber/airi` | Base |
|---|---|---|
| V1 | Presença fluida no VRM, com a Neptuna como modelo de teste: pool de idles com os tempos do Utsuwa, clipes de pensar e de falar, emotes com saída limpa, rosto de humor permanente com suavização (no lugar do reset de 3 s em `VRMModel.vue:1111`) e presença procedural do diretor do xiaoke. Novo `packages/stage-ui-three/src/composables/vrm/motion-library.ts`, chamado em `VRMModel.vue:827-846`. | Seção "Análise do código" abaixo |
| V2 | Emotes pelo LLM: estender o token ACT (`stage-ui/src/composables/queues.ts:23-60`, `Stage.vue:294-346`) com `motion`. Importação de VRMA com descrição na tela de modelo. | Padrão do Utsuwa, implementação própria |
| V3 | Realismo procedural no VRM: respiração, troca de pose e peso por humor, cabeça e contato visual. O humor deixa de ser só rosto (`expression.ts`, reset de 3 s). | Conceitos do TalkingHead (MIT) |
| V4 | Eva GLB → VRM, mantendo ARKit 52 + visemas como expressões customizadas, e lip-sync mapeado | D1 / antiga S15 |
| V5 | Conversão dos ~20 FBX Mixamo para VRMA (script de retarget e verificação visual) | `talkinghead-neoalice/animations_arkit` |
| V6 | Camadas no VRM: máscara por osso e mistura aditiva (gesto de braço sem parar o idle) | Plano 01 P3, agora no VRM |
| — | S03 (director) e S04 (scheduler) seguem válidos e passam a comandar V1–V6. A S08 (ponte MQTT) liga a NeoAlice sem alterá-la. | Contratos v1 (`packages/alice-motion`) |

Pendências que não verifiquei:

- As 13 animações VRMA do Utsuwa não têm licença própria no repositório dele. Os nomes `VRMA_01` a `VRMA_07` parecem ser amostras oficiais da VRoid. Elas não entram neste repositório público até a licença ser confirmada. Para a V1, as alternativas são as animações oficiais da VRoid com licença confirmada, ou animações próprias.
- A licença dos FBX Mixamo para redistribuição.

Até isso ser verificado, nenhum desses arquivos entra no repositório.
