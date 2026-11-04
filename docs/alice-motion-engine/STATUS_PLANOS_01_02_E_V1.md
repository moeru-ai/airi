# Status dos Planos 01 e 02 e da sprint V1

**Data:** 04/11/2026
**Base:** commit `bced9a6` do `main` do `overcyber/airi` e commit `7eb3fd0` do `main` do `overcyber/MMM-avatar-3d`.
**Legenda:** **Feito** = no `main` e testado. **Parcial** = parte entregue, parte falta. **Falta** = nada entregue. **Adiado** = depende de mudar a NeoAlice, que está congelada até o novo avatar ser validado.

## 1. Plano 01 — Motion Director e Motion Mixer

| Fase | O que o plano pede | Estado | O que existe | O que falta |
| --- | --- | --- | --- | --- |
| Seção 5 | Contratos `MotionIntent` e `MotionCue` | Parcial | `packages/alice-motion` com Valibot e 15 testes. ADR `2026-11-04-alice-motion-contracts-v1.md`. | O ADR está "proposed": falta a sua aprovação. |
| P0 | Baseline, fixture, telemetria, vídeo antes e depois | Parcial | Versões e resultados de typecheck e testes registrados (S02). Fixture VRM Neptuna. Vídeo da V1. | Telemetria própria por quadro (`motion_trace.jsonl`, FPS, `mixer_ms`). Medição em hardware real. |
| P1 | MotionDirector com estados, fala, emoção e ações semânticas | Parcial | O diretor do xiaoke (V1) cobre os estados parada, pensando e falando para cabeça e tronco, com aleatoriedade injetável. | O director que recebe `MotionIntent` e escolhe ações semânticas (S03). Estados `listening`, `walking`, `acting`, `interrupted`. |
| P2 | Scheduler: prioridades, reserva de canais, interrupção | Falta | — | S04 inteira. |
| P3 | Máscaras por osso e mistura aditiva | Falta | — | V6 (gesto de braço sem parar o idle). |
| P4 | Voz, face, prosódia, gaze, física, foot lock | Parcial | Rosto de humor permanente, aceno nos acentos da fala, lip-sync e spring bones do AIRI. | Marcações de tempo do TTS (Kokoro `/dev/captioned_speech`), foot lock, teste de 100 interrupções. |
| P5 | Catálogo semântico e editor de camadas | Parcial | `defaultVrmMotionLibrary` com nome e descrição de cada emote. `playMotion(id)`. | Tela de catálogo, importação de VRMA, LLM escolhendo o emote (V2). |
| P6 | Adaptador VRM | Parcial | O VRM virou a base (Planejamento 04). A biblioteca de movimentos roda no VRM. | Eva GLB convertida para VRM (V4). Retarget dos FBX Mixamo (V5). |
| P7 | Gestos neurais (StreamTalk, ARDY) | Falta | — | S17. Depende das GPUs (D7). |
| Seção 9 | Integração com serviços locais | Parcial | Serviço `alice-companion` lê o MQTT da NeoAlice. | Ponte MQTT para o AIRI (S08). |
| Seção 11 | Testes que bloqueiam merge | Parcial | Semente fixa nos testes do diretor. Reconexão e duplicatas no serviço de companion. | `walk + sit`, gestos nos dois braços, 100 trocas de personagem, FPS 30/60/120. |

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
| B8 | Afeto para movimento | Parcial | O serviço publica `companion.affect.updated`. O AIRI já reage ao humor do LLM com o rosto permanente da V1. | O AIRI ler o afeto do serviço (depende da S08). |
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

**Não. O núcleo está feito e funcionando. Faltam 6 itens.**

### Feito e testado

| Item da V1 | Evidência |
| --- | --- |
| Pool de idles com os tempos do Utsuwa (troca após 1–2 voltas, transição de 1,2 s, sem repetir) | Teste do animador. Troca observada aos 19,9 s no vídeo. |
| Clipe de fala (0,3 s de transição) | Teste do animador. Fase "falando" no vídeo. |
| Emote único com saída limpa (1,5×, volta ao idle) | Teste do animador. Cumprimento no vídeo, termina aos 44,9 s. |
| Rosto de humor permanente no lugar do reset de 3 s | 5 testes de humor. Feliz e triste assentados em 0,42 no vídeo. |
| Toque como reação que volta ao humor | Teste de humor. |
| Cabeça e tronco do diretor do xiaoke (aceno, olhar, pensando) | 5 testes do diretor. Fases "pensando" e "falando" no vídeo. |
| Neptuna como modelo de teste | `packages/alice-motion/fixtures/vrm/neptuna/` |

### Falta na V1

| Item | Por quê |
| --- | --- |
| Testar dentro do app (`stage-web` e desktop) | A rede do ambiente de nuvem bloqueia `cubism.live2d.com` e `dist.ayaka.moe`. A validação usou um harness com o mesmo código. |
| Rosto feliz a 0,7 durante o emote, e piscar desligado no emote | O Utsuwa faz isso. Não foi portado. |
| Transição de humor igual à do Utsuwa | A V1 usa a transição do AIRI (mistura direta entre humores, peso de repouso fixo em 60%). O Utsuwa apaga o humor antigo antes do novo e usa um peso por humor (0,3 a 0,8). |
| Clipe de "pensando" | O Utsuwa não traz um. O suporte existe (`motionLibrary.thinking`), mas nenhum arquivo foi incluído. |
| Partes do diretor do xiaoke | As batidas de gesto na fala (3,4–6,2 s), as micro-expressões em repouso (5–12 s) e o "empurrão" depois da fala não foram portados. |
| Testes do monorepo inteiro depois da V1 | Rodei os testes do `stage-ui-three` e o typecheck do `stage-ui-three` e do `stage-ui`, mas não o `test:run` completo. |

## 5. Próximos passos, na ordem do plano

1. Fechar os itens que faltam na V1 (rosto e piscar no emote, transição de humor do Utsuwa, partes do diretor do xiaoke).
2. Rodar a V1 no app, numa máquina com internet ou depois de liberar os dois hosts no ambiente.
3. Aprovar os contratos v1 (ADR) e começar a S03 (director) e a S04 (scheduler).
4. V2: o LLM escolhe o emote, e a tela importa VRMA.
5. S08: ponte MQTT, para o AIRI receber os comandos e o humor da NeoAlice sem alterá-la.
