# Justificativa — alterações propostas na NeoAlice e nova regra de bloqueio

**Data:** 04/11/2026
**Motivo deste documento:** o responsável pelo projeto perguntou por que a IA NeoAlice estava sendo alterada, já que ela não deveria ser.
**Regra decidida pelo responsável:** a NeoAlice só pode ser alterada depois que houver certeza de que o novo avatar funciona. Antes disso, nada nela muda.

---

## 1. Resposta direta

**Nenhuma linha da NeoAlice foi alterada nesta sessão.** O erro foi outro: eu **propus** uma alteração na NeoAlice e **recomendei** que você a enviasse ao seu agente local. Essa recomendação estava errada e foi revogada (seção 4).

## 2. Evidências de que a NeoAlice não foi alterada

| Verificação | Resultado |
| --- | --- |
| Repositórios anexados à sessão | `overcyber/airi`, `overcyber/MMM-avatar-3d`, `overcyber/TalkingHead-1KH`, `overcyber/talkinghead-neoalice`. Nenhum deles é o backend NeoAlice. |
| Repositórios do backend na conta | Existem dois repositórios privados do backend NeoAlice na conta. Nenhum foi anexado, clonado, lido ou alterado. |
| Código Python da NeoAlice no disco da sessão | Nenhum arquivo `mood_system.py`, `orchestrator.py` ou `satellite_gateway.py` foi encontrado. Não houve como alterar esse código. |
| Acesso à sua máquina e ao broker | A sessão roda num container na nuvem, sem acesso à sua rede. Nada foi publicado no seu broker MQTT. |
| `overcyber/talkinghead-neoalice` | Clonado só para leitura. Zero commits. |
| `overcyber/TalkingHead-1KH` | Zero commits. |

Commits feitos e o que cada um toca:

| Repositório | Commit | Conteúdo | Toca a NeoAlice? |
| --- | --- | --- | --- |
| `airi` | `e28fc9b` | Planejamento 03 (só documentação) | Não |
| `airi` | `7310306` | Serviço novo `services/alice-companion`, entrada `mqtt` no catálogo, ADR | Não. É um processo separado. Ver seção 3. |
| `airi` | `3a6f849` | Prompt de inventário (somente leitura) | Não. O prompt proibia qualquer alteração. |
| `airi` | `3657f63` | Vocabulário de 14 humores no serviço, leitura opcional de `evt/dialog/turn_end`, Parte E do plano, **prompt que pede alteração no backend** | O código não toca. **O prompt pede para tocar.** Esse é o erro. |
| `MMM-avatar-3d` | `85c7807` | Correção do `mapMood`, testes e scripts de backup e teste rápido | Não é a NeoAlice. É o módulo do avatar atual. Está só no branch e não foi instalado no espelho. |

## 3. O serviço `alice-companion` não altera a NeoAlice

Ele é um processo novo e independente. Se você o rodar ligado ao seu broker, o comportamento é este:

| O que ele faz | Tópicos | Efeito na NeoAlice |
| --- | --- | --- |
| Lê | `evt/mood`, `cmd/evt/mood`, `evt/stt/final`, `cmd/tts/say`, `cmd/tts/audio`, `evt/dialog/turn_end`, `evt/companion/interaction`, `cmd/companion/+` | Nenhum. Assinar um tópico não muda quem publica nele. |
| Publica | Só em `neoalice/v1/companion/evt/companion/state`, `.../affect` e `.../status` | Nenhum componente da NeoAlice nem do espelho assina esses tópicos. |
| Nunca publica | `evt/mood`, `cmd/evt/mood`, `cmd/tts/*`, `cmd/avatar/*` | O humor, a fala e os gestos continuam vindo só da NeoAlice. |

Evidência no código:

- `services/alice-companion/src/mqtt-gateway.ts`, função `companionTopics`: os três únicos tópicos de saída.
- O mesmo arquivo, método `route`: mensagens no site do próprio serviço são ignoradas, então não há laço.
- `services/alice-companion/src/companion-state.ts`, função `applyMood`: só copia o humor recebido. Não calcula humor.

Efeitos reais, mesmo sem alterar a NeoAlice:

- Mais um cliente conectado ao broker.
- Mensagens retidas novas em `neoalice/v1/companion/#`.
- O serviço recebe os áudios em base64 de `cmd/tts/audio` (mais tráfego de rede no broker).

Se você quiser zero contato com o broker de produção, rode o serviço primeiro contra um broker de teste com o tráfego gravado pelo `scripts/backup-producao.sh` do `MMM-avatar-3d`.

## 4. O que eu propus que alteraria a NeoAlice, e por que estava errado

### 4.1. As quatro propostas

| Proposta | Onde | O que mudaria na NeoAlice |
| --- | --- | --- |
| Evento `evt/dialog/turn_end` | `PROMPT_BACKEND_FIM_DE_TURNO_E_HUMOR.md`, mudança A | Código do orchestrator ou do satellite_gateway |
| Campos `energy`, `cause`, `intensity` e `eventId` no humor | O mesmo prompt, mudança B | Código do MoodSystem e da publicação MQTT |
| ACL no Mosquitto | Planejamento 03, Parte E, item 11, e README do serviço | Configuração do broker, que é um container da NeoAlice. Satélites, espelho e câmera precisariam de credenciais novas. |
| `affinity_score` como autoridade do afeto (D6) | Planejamento 03, Parte D | Publicação de um campo novo pela NeoAlice |

### 4.2. Por que eu propus

- O inventário mostrou que não existe evento de fim de turno e que intensidade, causa e fadiga não são publicadas.
- Com esses dados, o serviço de companion contaria turnos sem dedução e teria humor completo.
- O broker anônimo permite que qualquer aparelho da rede envie `cmd/companion/reset`.

### 4.3. Por que estava errado

1. **Contradiz o próprio Planejamento 03.** A regra B5 diz que o sistema em produção continua igual até a S16, e que nenhuma sprint mistura alteração em produção com alteração no AIRI. A NeoAlice é produção.
2. **O novo avatar ainda não existe.** Nenhuma das sprints de avatar (S03, S04, S06 a S16) foi feita. Não havia nada validado que justificasse mexer na fonte do humor, da voz e dos gestos.
3. **O serviço não precisa disso para funcionar.** Ele já deduz os turnos do tráfego existente e aceita humor sem intensidade. As mudanças eram melhorias, não requisitos.
4. **O risco caía no lugar errado.** O orchestrator e o satellite_gateway fazem parte do caminho da voz. Um erro ali afeta a Alice inteira: fala, satélites e espelho. O ganho era só para um serviço novo e ainda não validado.
5. **A ACL quebraria clientes.** Com o broker anônimo, satélites, espelho e câmera conectam sem senha. Uma ACL exige credenciais em todos eles ao mesmo tempo.
6. **Eu recomendei enviar o prompt sem destacar que ele alterava produção.** A resposta dizia "envie o prompt" no meio da lista de próximos passos. Isso não deixava claro que a ação mudava a sua IA.

### 4.4. O que foi feito para corrigir

| Item | Estado agora |
| --- | --- |
| `PROMPT_BACKEND_FIM_DE_TURNO_E_HUMOR.md` | **Bloqueado.** O arquivo começa com um aviso para não enviar. Ele só serve como registro até a condição da seção 5 ser cumprida. |
| Planejamento 03, Parte E, itens 2, 4 e 11 | Mudados para "adiado até a liberação da NeoAlice". |
| Planejamento 03, D6 | Adiada. Até lá, a métrica `affection` do serviço fica parada, porque nada envia propostas. |
| Planejamento 03, regras B5 | Nova regra de bloqueio da NeoAlice. |
| README do serviço | Deixou de recomendar ACL no broker. Agora explica o risco e a regra. |
| Código do serviço | Não muda. A leitura de `evt/dialog/turn_end` só tem efeito se um dia a NeoAlice publicar esse tópico. Sem isso, o código fica parado. |

## 5. Regra de bloqueio da NeoAlice

A NeoAlice (backend, MoodSystem, orchestrator, satélites, visão, broker e seus containers) **não é alterada** até que todos os itens abaixo sejam verdadeiros:

1. A sprint S16 está concluída: o novo avatar roda no espelho com os comandos atuais da NeoAlice, sem nenhuma mudança na NeoAlice.
2. Os critérios de aceite de S06 a S16 passaram e têm evidência (logs, vídeos e medições).
3. O novo avatar rodou em paralelo com o atual por um período definido por você, sem regressão no teste rápido (`smoke-test-mqtt.sh`).
4. A volta ao avatar antigo foi testada uma vez e funcionou.
5. Existe backup da NeoAlice e um plano de volta para a mudança específica.
6. Você aprovou por escrito a mudança específica, depois de ler o que ela altera.

Observação honesta: "certeza absoluta" não é verificável em software. Os seis itens acima são a forma objetiva de chegar o mais perto disso. Se você quiser critérios mais rígidos, eles entram nesta lista.

Até a liberação, toda integração com a NeoAlice é **somente leitura**: assinar tópicos, gravar tráfego e ler documentação.

## 6. O que ainda pode mexer em produção, e precisa da sua decisão

A correção do `mapMood` (S01) não é a NeoAlice, mas é o módulo do avatar que está no espelho hoje. Ela está só no branch `claude/magical-clarke-wy5vee` do `MMM-avatar-3d`. Nada foi instalado. Você decide se ela entra antes do novo avatar ou se espera junto com o resto.
