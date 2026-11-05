# Status dos Planos 01 e 02 e das sprints V1 e V2

**Data:** 04/11/2026
**Base:** commit `bced9a6` do `main` do `overcyber/airi` e commit `7eb3fd0` do `main` do `overcyber/MMM-avatar-3d`.
**Legenda:** **Feito** = no `main` e testado. **Parcial** = parte entregue, parte falta. **Falta** = nada entregue. **Adiado** = depende de mudar a NeoAlice, que está congelada até o novo avatar ser validado.

## 1. Plano 01 — Motion Director e Motion Mixer

| Fase | O que o plano pede | Estado | O que existe | O que falta |
| --- | --- | --- | --- | --- |
| Seção 5 | Contratos `MotionIntent` e `MotionCue` | Feito | `packages/alice-motion` com Valibot e 15 testes. ADR `2026-11-04-alice-motion-contracts-v1.md`, aprovado pelo responsável em 05/11/2026, com o limite de 4096 bytes por mensagem registrado na seção "Message size limit". | — |
| P0 | Baseline, fixture, telemetria, vídeo antes e depois | Parcial | Versões e resultados de typecheck e testes registrados (S02). Fixture VRM Neptuna. Vídeo da V1. | Telemetria própria por quadro (`motion_trace.jsonl`, FPS, `mixer_ms`). Medição em hardware real. |
| P1 | MotionDirector com estados, fala, emoção e ações semânticas | Feito | `MotionDirector` (S03, 05/11/2026) com os 7 estados, semente fixa e relógio do chamador. No VRM, o diretor do xiaoke (V1) e o `MoodBody` (V3) desenham cabeça, tronco e respiração. | — |
| P2 | Scheduler: prioridades, reserva de canais, interrupção | Feito | `MotionScheduler` (S04, 05/11/2026). Liga ao palco pela ponte da S08. | As ações procedurais só reservam canais. Desenhá-las é a P3. |
| P3 | Máscaras por osso e mistura aditiva | Falta | — | V6 (gesto de braço sem parar o idle). |
| P4 | Voz, face, prosódia, gaze, física, foot lock | Parcial | Rosto de humor permanente, aceno nos acentos da fala, lip-sync e spring bones do AIRI. | Marcações de tempo do TTS (Kokoro `/dev/captioned_speech`), foot lock, teste de 100 interrupções. |
| P5 | Catálogo semântico e editor de camadas | Parcial | `MotionCatalog` (S03). Importação de VRMA com descrição e LLM escolhendo o emote (V2). | Editor de máscara e prévia por camada. |
| P6 | Adaptador VRM | Parcial | O VRM virou a base (Planejamento 04). A Eva converte para VRM 1.0 (V4, `packages/alice-avatar-tools`) e roda no AIRI com a V1 a V3. | Retarget dos FBX Mixamo (V5). |
| P7 | Gestos neurais (StreamTalk, ARDY) | Falta | — | S17. Depende das GPUs (D7). |
| Seção 9 | Integração com serviços locais | Feito | Serviço `alice-companion` e ponte MQTT somente leitura no AIRI (S08, 05/11/2026). | Rodar contra o broker real (prompt do agente local). |
| Seção 11 | Testes que bloqueiam merge | Parcial | Semente fixa, `walk + wave`, `walk + sit`, mesmo braço, um gesto em cada braço, interrupção e reconexão (S03, S04). | 100 trocas de personagem, FPS 30/60/120, 100 interrupções com física. |

## 2. Plano 02 — Estado afetivo, relacionamento e companion

| Fase | O que o plano pede | Estado | O que existe | O que falta |
| --- | --- | --- | --- | --- |
| B0 | Auditoria do humor e do AIRI | Feito | Inventário do agente local (Planejamento 03, Parte E). | — |
| B1 | Contrato de estado e MoodAdapter | Feito | `services/alice-companion` lê o humor da NeoAlice sem escrever nele. Vocabulário de 14 humores. | — |
| B2 | Métricas, tempo, reducer | Feito | 5 métricas, energia, dias, interações, sequência, auditoria, idempotência, fuso, trava de instância única. 74 testes. | Validação de 1 dia no broker real. |
| B3 | Painel "Estado agora / Relacionamento / Convivência" | Falta | — | S10. |
| B4 | Estágios e modos | Parcial | Modos `companion`, `relationship` e `dating_sim` com consentimento. | Estágios com histerese (S11). |
| B5 | Fatos, sessões, busca semântica | Falta | — | S11. |
| B6 | Eventos e marcos | Falta | — | S12. |
| B7 | Proatividade | Falta | — | S13. |
| B8 | Afeto para movimento | Feito | O serviço publica o estado e o afeto. A ponte da S08 lê os dois, e o AIRI mostra o humor no rosto (V1) e no corpo (V3). | — |
| B9 | Grafo, álbum, toque, cenas | Parcial | O toque virou reação que volta ao humor (V1). | Grafo, álbum, cenas. |
| B10 | Hardening | Parcial | Testes por pacote, lint, busca de dados privados a cada commit. | Testes de carga e de segurança. |
| — | Campos de humor e fim de turno publicados pela NeoAlice | Adiado | O serviço já aceita os campos. O prompt está bloqueado. | Liberação da NeoAlice. |

## 3. Avatar atual (MagicMirror e TalkingHead)

| Sprint | Estado | Observação |
| --- | --- | --- |
| S00 Backup e teste rápido | Parcial | Scripts prontos e testados localmente. Falta rodar na máquina do espelho. |
| S01 `mapMood` | Parcial | Corrigido e validado no navegador com o TalkingHead real (20 de 20). Falta instalar no espelho. |
| S01b Lip-sync em português | Falta | `lipsync-pt-br.mjs` é cópia do inglês. |

## 4. A sprint V1 foi feita por completo?

**Sim. A V1 está completa: código, testes e teste dentro do app real (`stage-web`) com a Neptuna.**

A primeira rodada deixou 6 itens abertos. A segunda rodada fechou 5. Detalhes em `PLANEJAMENTO_04_REVISAO_UTSUWA_AIRI_AVATAR3D.md`, seção "Fechamento da V1".

### Feito e testado

| Item da V1 | Evidência |
| --- | --- |
| Pool de idles com os tempos do Utsuwa (troca após 1–2 voltas, transição de 1,2 s, sem repetir) | Testes do animador. Troca observada no harness. |
| Clipe de fala (0,3 s de transição) | Teste do animador. Fase "falando" no harness. |
| Clipe de "pensando": mão no queixo, gerado a partir do idle | 2 testes da pose. Fase "pensando" no harness. |
| Emote único com saída limpa (1,5×, volta ao idle) | Teste do animador. Cumprimento no harness. |
| Rosto de humor do Utsuwa: permanente, o antigo sai antes do novo, peso por humor | 9 testes do `MoodFace`. `sad` assenta em 0,58 no harness. |
| Rosto feliz a 0,7 e sem piscar durante o emote | Teste do `MoodFace`. Captura do emote no harness. |
| Piscar a cada 2–6 s, fechar rápido e abrir devagar | Teste do `MoodFace`. |
| Toque como reação que volta ao humor | Teste do `MoodFace`. |
| Diretor do xiaoke: cabeça e tronco, batidas de fala (3,4–6,2 s), micro-expressões paradas (5–12 s), troca de idle antecipada depois da fala e do pensar | 8 testes do diretor. Batidas e troca antecipada medidas no harness. |
| Ligação no `VRMModel`: `speechActive` liga a fala, `thinking` liga o pensar | Corrigido nesta rodada. Na primeira rodada, o app nunca ligava esses clipes. |
| Neptuna como modelo de teste | `packages/alice-motion/fixtures/vrm/neptuna/` |
| Testes do monorepo inteiro | Ver "Resultado dos testes" abaixo. |

### Teste dentro do app

O `stage-web` real rodou na nuvem com a Neptuna, com um LLM e um TTS falsos (kit em `teste-app/`). Ela pensa com a mão no queixo, acena com rosto feliz pelo ACT, fala com o clipe de fala e fica triste com o humor triste. Folha em `evidencias/V2/app-resumo.png`. Detalhes no Planejamento 04, seção "Teste dentro do app".

Na sua máquina, o mesmo kit roda com o comando do `teste-app/README.md`.

### Resultado dos testes

- `pnpm -F @proj-airi/stage-ui-three exec vitest run`: 12 arquivos, 64 testes, todos passam.
- `vue-tsc` do `stage-ui-three`: sem erros.
- `eslint` nos arquivos alterados: 0 erros.
- `turbo run typecheck` do monorepo inteiro (Node 26): 67 de 67 tarefas passam.
- `turbo run test:run` do monorepo inteiro (Node 26): 74 de 78 tarefas passam. As 4 falhas são do ambiente, não da V1:

| Tarefa | Causa | Prova |
| --- | --- | --- |
| `stage-web`, `stage-tamagotchi` | A rede da nuvem bloqueia `cubism.live2d.com`. A configuração do Vitest não carrega. | `getaddrinfo ENOTFOUND cubism.live2d.com` |
| `stage-ui` (30 de 1998) | No Node 26, `localStorage` fica indefinido sem `--localstorage-file`. Um teste de navegador passou do tempo sob carga. | Com o Node 22, os 4 arquivos passam (31 testes). Sozinho, `session-store.browser.test.ts` passa (15 testes). |
| `auth-server` (1 de 171) | O container não tem IPv6 (`listen EAFNOSUPPORT ::1`). | Teste de IPv6 fora da V1. |

## 5. A sprint V2

**Feita.** O LLM escolhe o emote pelo ACT `motion`, o prompt lista os emotes com descrição, e a configuração VRM importa VRMA. Testada com 16 testes novos e dentro do app: o VRMA importado `happy_spin` tocou quando o LLM o pediu. Detalhes no Planejamento 04, seção "Estado da V2".

Verificações da V2:

- `pnpm -F @proj-airi/stage-ui-three exec vitest run`: 13 arquivos, 69 testes, todos passam.
- `pnpm -F @proj-airi/stage-ui exec vitest run` (Node 22): 2008 de 2009 passam. A falha é `chat.contract.test.ts`, porque o Node 22 não tem `navigator.locks`. Com o Node 26, esse arquivo passa (60 testes).
- `pnpm -F @proj-airi/i18n exec vitest run`: 20 testes passam.
- Typecheck do `stage-ui-three`, do `stage-ui` e do `stage-web`: sem erros.
- Kit `teste-app/` no `stage-web` real: 9 de 9 verificações passam.

Falta testar o app desktop. Lá, o chat e o palco podem rodar em janelas diferentes.

## 6. MagicMirror e funcionamento sem internet (05/11/2026)

**Feito.** Inventário, mudanças e provas em `REVISAO_MAGICMIRROR_E_OFFLINE.md`.

- Avatar atual do espelho: three.js local no `MMM-AvatarMQTT`, inclusive para os endereços `esm.sh` do servidor TalkingHead. Carregou sem internet, com 0 requisições externas.
- AIRI: build `VITE_AIRI_OFFLINE=true` sem chamada à nuvem e com fontes locais. 0 requisições externas.
- Módulo novo `MMM-AiriStage` (repositório `MMM-avatar-3d`): mostra o AIRI offline no espelho. Testado sem internet.
- Fica online: o Google TTS do texto de `cmd/tts/say`. Sem internet, a NeoAlice precisa mandar o áudio do Kokoro, o que depende de liberar a NeoAlice.

## 7. Próximos passos, na ordem do plano

1. Rodar o kit `teste-app/` na sua máquina, e depois com o seu LLM e o Kokoro de verdade.
2. Contratos v1 aprovados em 05/11/2026. S03 (director) e S04 (scheduler) em andamento.
3. S08: ponte MQTT, para o AIRI receber os comandos e o humor da NeoAlice sem alterá-la.
4. V3: respiração, pose e peso por humor, e contato visual (conceitos do TalkingHead).
