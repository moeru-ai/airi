# Histórico das saídas da sessão de 03 e 04/11/2026

**Conteúdo:** as quatro respostas finais desta sessão de trabalho, na íntegra e em ordem. A única mudança de forma é um nível a mais nos títulos (`##` virou `###`), exigido pelo lint do repositório.
**Aviso:** a Saída 3 recomendava enviar ao agente local um prompt que altera a NeoAlice. **Essa recomendação foi revogada.** O motivo e a regra nova estão na Saída 4 e em `JUSTIFICATIVA_ALTERACOES_NEOALICE.md`.

| Saída | Pedido do responsável | Resultado principal |
| --- | --- | --- |
| 1 | Analisar o Plano 01 e o Plano 02 e ordenar as sprints com backup, teste e validação | `PLANEJAMENTO_03_ANALISE_E_ROADMAP_DE_SPRINTS.md` |
| 2 | Aprovar D1, implementar D2 e D3, e gerar um prompt de inventário para o agente local | `services/alice-companion` e `PROMPT_INVENTARIO_SERVICOS_LOCAIS.md` |
| 3 | Inventário do agente local enviado | Sprints S00 e S01 no `MMM-avatar-3d`, ajustes no serviço e Parte E do Planejamento 03 |
| 4 | Salvar as saídas e justificar a alteração da NeoAlice | Este arquivo, a justificativa e a regra de bloqueio |

---

## Saída 1 — Análise dos planos e ordem das sprints

Analisei os dois planos e conferi cada um contra o código real do AIRI, do `MMM-avatar-3d` e do `talkinghead-neoalice`. O resultado está num terceiro documento, que não altera os Planos 01 e 02:

`docs/alice-motion-engine/PLANEJAMENTO_03_ANALISE_E_ROADMAP_DE_SPRINTS.md`, no branch `claude/magical-clarke-wy5vee` (commit `e28fc9b`, já no GitHub).

Uma observação antes: o repositório `TalkingHead-1KH` que estava nesta sessão é um conjunto de vídeos da NVIDIA, sem relação com o avatar. Anexei o `talkinghead-neoalice` e analisei esse.

### Análise dos dois planos

**O que está correto:** todos os arquivos do AIRI citados nos planos existem. As descrições também conferem com o código: o MMD toca uma animação por vez com transição suave, o loop segue a ordem animação, IK, física, e já existe memória longa. Os planos também acertam em não substituir o AIRI, em separar a intenção do LLM da execução do movimento e em ter uma única fonte de humor.

**Lacunas mais importantes:**
1. **O formato do avatar não bate.** O Plano 01 começa com modelos PMX/MMD. A Alice hoje é GLB (padrão Mixamo, com expressões ARKit), com 21 animações FBX e gestos próprios. Nada disso funciona no MMD sem conversão.
2. **Nenhum plano liga o AIRI ao MQTT.** O AIRI não tem cliente MQTT, e o espelho e o NeoAlice só falam MQTT.
3. **Existem três listas de humor diferentes.** NeoAlice, TalkingHead e AIRI usam nomes diferentes. Por exemplo, o teste de aceite do Plano 01 usa `curious`, que o TalkingHead não tem.
4. **Falha que já existe hoje:** a função `mapMood` (em `MMM-AvatarMQTT.js` e em `js/avatar-controller.js`) não reconhece `love`, `fear` e `disgust`. Esses humores viram `neutral`, mesmo que a sua documentação diga que `love` funciona.
5. **O humor que chega hoje só tem o nome.** Não vem intensidade, causa nem energia, que o Plano 02 exige.
6. **Estado em dois aparelhos.** O AIRI guarda dados no navegador, e o espelho é outro aparelho. O estado do relacionamento precisa ficar num só lugar.
7. **Os planos não preveem backup, volta atrás nem teste do espelho em produção.**

### Ordem das sprints

Cada sprint segue os mesmos passos: **backup → teste antes → alteração → teste depois → validação → marca de concluída** (ou volta ao backup). O documento traz os comandos prontos: marcas de backup no git, cópia da configuração do MagicMirror, cópia da imagem Docker e gravação do tráfego MQTT. Traz também um teste rápido do espelho por MQTT.

| Ordem | Sprint | Mexe no espelho? |
|---|---|---|
| S00 | Backup geral e registro do comportamento atual (com vídeo) | Só leitura |
| S01 | Levantar o sistema de humor atual + corrigir `mapMood` | Sim, mudança pequena |
| S02 | Testar o AIRI como está, fechar os formatos de dados e a lista única de humores | Não |
| S03–S05 | Diretor de movimento, agendador e motor de estado/relacionamento (pacotes novos, isolados) | Não |
| S06–S07 | Modelo de teste, medições e combinação de movimentos por parte do corpo | Não |
| S08 | Ponte MQTT para o AIRI, só observando (com `siteId` próprio) | Só leitura |
| S09–S14 | Voz/rosto, painel de estado, relacionamento, memória, eventos, ligação humor → movimento, catálogo | Não |
| S15 | Eva convertida para VRM | Não |
| S16 | Mudança do espelho, com caminho de volta testado | Sim |
| S17 | Movimento gerado por IA (experimental) | Não |

O espelho continua com o TalkingHead até a S16.

### Decisões que preciso de você

- **D1, formato do avatar no AIRI:** recomendo usar um PMX para construir o motor de movimento e trazer a Eva em VRM na S15. Isso bloqueia a S06, não o começo.
- **D2, onde guardar o estado do relacionamento:** recomendo um serviço único que publique por MQTT. Bloqueia a S05.
- **D3, biblioteca MQTT para o AIRI:** as regras do repositório pedem sua aprovação antes de adicionar uma dependência nova.

### Verificações

Só escrevi documentação, então não rodei testes nem typecheck. O `pnpm lint` também não rodou, porque as dependências do AIRI não estão instaladas nesta sessão. Conferi que o documento não tem IPs nem caminhos reais e usei marcadores no lugar, como pedem as regras do AIRI.

Se quiser, começo pela S00 e pela S01: o script de teste rápido no `MMM-avatar-3d` e a correção do `mapMood`.

---

## Saída 2 — D1, D2 e D3, e prompt de inventário

Fiz as três coisas e o prompt está no final. Tudo está no branch `claude/magical-clarke-wy5vee` do `overcyber/airi` (commits `7310306` e `3a6f849`, já enviados). O espelho em produção não foi alterado.

### D1: formato do avatar (só registrado no plano)
- Os modelos que vêm com a AIRI ficam intactos: Hiyori (Live2D) e AvatarSample A/B (VRM).
- Os seus modelos VRM serão os modelos de teste. Eles não entram no repositório.
- A Eva (GLB) será convertida para VRM na S15.
- **Consequência:** a AIRI não traz nenhum modelo PMX. Se não escolhermos um PMX com licença livre (D4), a combinação de movimentos por parte do corpo começa no VRM. O diretor e o agendador de movimento não mudam com isso.

### D2: serviço único do estado do relacionamento (implementado)
Ficou em `services/alice-companion`. É um serviço Node que conversa só por MQTT:

- **Lê o humor do NeoAlice sem alterá-lo.** O NeoAlice continua sendo a fonte do humor. O serviço nunca publica em `evt/mood`.
- **Conta os turnos de conversa.** Aceita um evento explícito de fim de turno ou deduz o turno quando um `evt/stt/final` é seguido de `cmd/tts/say` no mesmo site. Se um site passar a enviar o evento explícito, a dedução para nesse site, para não contar duas vezes.
- **Guarda:** humor, energia, as cinco métricas, dias juntos, interações e sequência de dias, num arquivo `state.json`. Antes de cada gravação ele faz uma cópia `.bak`. Cada decisão fica num log de auditoria, e uma trava impede duas instâncias ao mesmo tempo.
- **Publica** num site próprio (`neoalice/v1/companion/evt/companion/...`):
  - `state`: o estado completo, retido no broker.
  - `affect`: o humor atual, para o diretor de movimento.
  - `status`: online ou offline.
- **O estado traz o humor em dois vocabulários:** o nome para o TalkingHead e o nome para a AIRI. Nessa tabela, `love`, `fear` e `disgust` funcionam. O `mapMood` do MagicMirror continua com a falha, que será corrigida na S01.

**Atenção:** as métricas só mudam por "propostas" enviadas ao tópico `cmd/companion/proposal`, e cada proposta precisa apontar para um turno já contado. Hoje nada envia propostas, então as métricas ficam em 0 até o NeoAlice começar a enviá-las. Isso é intencional: conversar repetidamente não infla o afeto.

Para rodar ao lado do seu broker sem afetar o espelho:

```bash
pnpm install
```

```bash
ALICE_COMPANION_MQTT_URL=mqtt://<broker>:1883 ALICE_COMPANION_DATA_DIR=/var/lib/alice-companion pnpm -F @proj-airi/alice-companion start
```

```bash
mosquitto_sub -h <broker> -v -t 'neoalice/v1/companion/#'
```

### D3: biblioteca MQTT (adicionada)
Adicionei `mqtt` 5.16.1 (MQTT.js), a mesma biblioteca que o seu módulo do MagicMirror já usa. O lockfile só ganhou linhas novas: a primeira instalação mudou pacotes sem relação (`better-auth`), então desfiz e gerei de novo.

### Verificações que rodei
- Typecheck do serviço: OK.
- Testes do serviço: 57 de 57 passaram, rodados de novo no commit final.
- ESLint nos arquivos alterados: OK. Ele também apontou um erro de formatação no Planejamento 03 do commit anterior (mais de um título de nível 1), que corrigi.
- Teste de ponta a ponta com um Mosquitto local, que confirmou:
  - humor `love` preservado;
  - turno deduzido contado;
  - proposta limitada (pedido de +50 em confiança virou +2);
  - proposta repetida recusada;
  - segunda instância recusada;
  - estado mantido após reiniciar;
  - trava liberada ao parar.

  Esse teste revelou dois erros, que corrigi: o status `online` não era publicado e o mesmo turno podia ser contado duas vezes.

**Não rodei:** o `pnpm typecheck` da raiz, os testes de todos os pacotes afetados e o `pnpm lint` completo.

**Validação que falta no seu ambiente:** deixe o serviço rodar 1 dia ligado ao broker real. Depois confira no `audit.jsonl` se os turnos deduzidos batem com as conversas reais.

### Prompt para o seu agente local

Também está salvo em `docs/alice-motion-engine/PROMPT_INVENTARIO_SERVICOS_LOCAIS.md`. Além do que você pediu, ele pergunta de onde vem o humor (S01) e se já existe um evento de fim de turno. Com essa resposta posso desligar a dedução de turnos. A resposta do agente vai conter IPs e caminhos da sua rede, então não a coloque no GitHub.

```text
Você é o agente local da Eva/Alice. Faça um inventário SOMENTE DE LEITURA dos serviços de voz, visão e humor que já estão em uso nesta máquina e nas máquinas que você alcança.

REGRAS
1. Não altere, reinicie, pare, atualize ou reinstale nada. Não edite arquivos. Não rode docker compose up/down, systemctl restart, pip install ou npm install.
2. Não mostre segredos. Substitua o valor de qualquer token, senha, chave de API ou credencial por "***". Mostre só o nome da variável.
3. Informe só o que você verificou. Para cada item, diga como verificou (arquivo lido, comando executado, processo encontrado). Se não encontrou, escreva "NÃO ENCONTRADO" e onde procurou. Não deduza.
4. Não use emojis nem ícones na resposta.

O QUE LEVANTAR, PARA CADA SERVIÇO
- Nome e função (Kokoro, STT, TTS, visão, humor, outros relacionados).
- Estado: rodando, parado ou só instalado.
- Como roda: container Docker (nome da imagem e tag), serviço systemd, processo manual, PM2.
- Diretório de instalação e diretório de trabalho.
- Arquivo de configuração e arquivo de compose/unit, com o caminho completo.
- Comando de início exato.
- Modelo usado: nome, versão, idioma, voz, e caminho completo dos pesos no disco.
- Hardware: GPU usada (índice e modelo), VRAM ocupada agora, ou CPU.
- Interface: protocolo (HTTP, WebSocket, gRPC, MQTT), host, porta e rotas ou tópicos.
- Formato de entrada e de saída (por exemplo: texto -> WAV 24 kHz mono; áudio PCM 16 kHz -> texto).
- Se o TTS devolve marcações de tempo por palavra, fonema ou visema. Mostre um exemplo de resposta, sem dados pessoais.
- Quem chama o serviço (qual componente da NeoAlice) e quem consome a saída.
- Tópicos MQTT que o serviço publica e assina, com um exemplo de payload de cada um.
- Arquivo de log e health check, se existirem.

ITENS ESPECÍFICOS
A. Kokoro: confirme se é o TTS principal ou alternativo. Liste as vozes instaladas e a voz configurada para a Alice.
B. STT: motor (Faster-Whisper, Whisper.cpp, SenseVoice, Vosk, Rhasspy, outro), modelo, idioma, VAD usado, e o tópico onde o texto final sai (por exemplo neoalice/v1/<site>/evt/stt/final ou hermes/asr/textCaptured).
C. TTS: todos os motores configurados (Kokoro, Google Cloud TTS, Piper, outro), qual está ativo, e como o áudio chega ao avatar (cmd/tts/say com texto ou cmd/tts/audio com base64).
D. Visão computacional: modelo (YOLO, MediaPipe, InsightFace, modelo multimodal, outro), câmera usada, frequência de análise, o que é detectado (presença, rosto, identidade, emoção, gesto) e onde o resultado é publicado. Diga se alguma imagem é gravada em disco ou enviada para fora da máquina.
E. Sistema de humor da Alice: qual serviço calcula o humor, caminho do código, lista completa de valores possíveis, se existe intensidade, causa ou energia, com que frequência publica, e em quais tópicos (neoalice/v1/<site>/evt/mood, neoalice/v1/<site>/cmd/evt/mood ou outro).
F. Fim de turno de conversa: existe algum evento que indica que um turno terminou (pergunta do usuário respondida por completo)? Se existir, informe o tópico e o payload. Se não existir, informe em que ponto do código da NeoAlice esse evento poderia ser publicado.
G. LLM (resumo curto): endpoint, servidor (vLLM, Ollama, outro), modelo e GPU.
H. Broker MQTT: host, portas TCP e WebSocket, se usa usuário e senha (sem mostrar a senha), e se existe arquivo de ACL (caminho).

COMANDOS SUGERIDOS (somente leitura; adapte ao sistema)
- docker ps --format '{{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'
- docker compose ls
- docker inspect <container> --format '{{json .Mounts}}'
- systemctl list-units --type=service --state=running
- pm2 ls
- ss -tlnp
- nvidia-smi
- ps aux | grep -Ei 'kokoro|whisper|tts|stt|vision|yolo|mediapipe|insightface|vllm|ollama|mood|neoalice|rhasspy'
- find / -xdev \( -iname '*kokoro*' -o -iname '*whisper*' -o -iname '*.onnx' -o -iname '*.pt' -o -iname '*.safetensors' -o -iname '*.gguf' \) 2>/dev/null | head -200
- timeout 60 mosquitto_sub -h <broker> -v -t 'neoalice/v1/#' (para ver tópicos e formatos reais; não copie conteúdo pessoal das mensagens)

FORMATO DA RESPOSTA
1. Uma tabela-resumo com as colunas: Serviço | Estado | Como roda | Host:porta | Modelo | Caminho dos pesos | GPU | Tópicos MQTT.
2. Uma seção por serviço (A a H) com todos os campos pedidos e a evidência de cada um.
3. Um bloco JSON com a mesma informação, neste formato:
{
  "geradoEm": "<data e hora>",
  "servicos": [
    {
      "id": "kokoro",
      "funcao": "tts",
      "estado": "rodando",
      "execucao": { "tipo": "docker", "imagem": "", "container": "", "comando": "" },
      "caminhos": { "instalacao": "", "config": "", "compose": "", "pesos": [], "logs": "" },
      "modelo": { "nome": "", "versao": "", "idioma": "", "voz": "" },
      "hardware": { "gpu": "", "vramMiB": null },
      "interface": { "protocolo": "", "host": "", "porta": null, "rotas": [] },
      "mqtt": { "publica": [], "assina": [], "exemplos": {} },
      "marcacoesDeTempo": "nenhuma | palavra | fonema | visema",
      "evidencia": []
    }
  ],
  "humor": { "servico": "", "codigo": "", "valores": [], "temIntensidade": false, "temCausa": false, "temEnergia": false, "topicos": [] },
  "fimDeTurno": { "existe": false, "topico": "", "payload": {}, "pontoSugeridoNoCodigo": "" },
  "naoEncontrado": []
}
4. Uma lista final "Dúvidas e lacunas" com o que você não conseguiu verificar.
```

Quando o agente responder, me envie o resultado (pode tirar IPs e senhas) e eu sigo para a S00 e a S01.

---

## Saída 3 — Inventário, S00 e S01

> **Aviso de 04/11/2026:** o item 4 de "O que falta você fazer" e o prompt no final desta saída **alteram a NeoAlice**. Essa recomendação foi revogada. O prompt está bloqueado. Ver Saída 4.

O inventário mudou algumas premissas dos planos. Com ele, fiz as sprints S00 e S01 e adaptei o serviço de estado ao seu NeoAlice real. O espelho em produção continua igual até você copiar o arquivo corrigido.

### O que o inventário mudou
- **Sem GPU NVIDIA na máquina principal.** É uma placa RK3588 com NPU. O Plano 01 conta com as RTX 3090 e 4060 Ti. Onde elas estão? (D7)
- **O humor tem 14 estados.** Cinco deles (`reflective`, `cozy`, `melancholic`, `mischief`, `grouchy`) caíam em `neutral`, junto com `love`, `fear` e `disgust`.
- **Intensidade, causa e fadiga já existem dentro do MoodSystem**, mas a mensagem MQTT só leva o nome do humor.
- **O `affinity_score` do MoodSystem já é um "afeto".** Ele conflita com a métrica `affection` do serviço (D6).
- **Não existe evento de fim de turno.** O serviço continua deduzindo o turno da sequência fala reconhecida → áudio no mesmo site, o que funciona com o seu fluxo.
- **O TTS ativo é o Kokoro, não o Google.** A rota usada não tem marcações de tempo, mas `/dev/captioned_speech` tem por palavra. Isso é útil para sincronizar gestos com a fala na S09.
- **Segurança:** o broker aceita conexões anônimas e não tem ACL. Qualquer aparelho da rede pode enviar `cmd/companion/reset`. Além disso, as fotos da câmera ficam em disco e o modo VLM em nuvem pode enviá-las para fora (D8).

### O que fiz

**`overcyber/airi`** (commit `3657f63`):
- O serviço agora reconhece os 14 humores.
- Ele aceita `evt/dialog/turn_end` no formato que o seu agente sugeriu. Só `status: "completed"` conta, e o `turn_id` impede contagem dupla.
- Adicionei ao Planejamento 03 a Parte E, com os achados e as decisões D6 a D8. Ela não contém IPs, caminhos nem `user_id`.
- Criei um segundo prompt para o seu agente: `docs/alice-motion-engine/PROMPT_BACKEND_FIM_DE_TURNO_E_HUMOR.md`.

**`overcyber/MMM-avatar-3d`** (commit `85c7807`):
- **S00:**
  - `scripts/backup-producao.sh` copia `config.js`, o módulo, a configuração do Mosquitto e uma tag da imagem Docker, e grava o tráfego MQTT.
  - `scripts/smoke-test-mqtt.sh` envia fala, os humores, um gesto, uma pose e uma animação, e falha se o heartbeat não aparecer.
- **S01:** `mapMood` corrigido nos 3 arquivos onde ele existe, com a mesma tabela do serviço. Também passou a aceitar espaços e maiúsculas e a recusar nomes como `constructor`. O passo a passo de implantação e de volta atrás está em `SPRINTS_S00_S01.md`.

### Verificações
- Serviço: typecheck OK, 74 de 74 testes passaram e o lint não deu erro.
- Espelho:
  - `node --test tests/`: com o código antigo, 9 falhas, o que confirma que o teste pega o problema. Com a correção, 12 de 12 passaram.
  - `node --check` sem erro nos 3 arquivos, e as duas cópias do módulo continuam idênticas.
- Os dois scripts rodaram contra um Mosquitto local, simulando o espelho só com o heartbeat. Ainda não rodaram no seu ambiente.

### O que falta você fazer
1. **S01 no espelho:**
   1. Rodar o backup e o teste rápido.
   2. Copiar `MMM-AvatarMQTT/MMM-AvatarMQTT.js` para o MagicMirror e reiniciar.
   3. Rodar o teste rápido de novo e conferir `love`, `fear` e `disgust`.
2. **Decidir D6:** recomendo que o `affinity_score` seja a autoridade do afeto, do mesmo jeito que já fizemos com a energia.
3. **Responder D7:** onde estão as RTX?
4. **Enviar o prompt abaixo ao seu agente.** Ele adiciona o evento de fim de turno e os campos `energy` e `cause` ao humor, com backup, teste antes e depois, e volta atrás se algo falhar. **(Revogado em 04/11/2026. Não enviar.)**
5. **Não publicar o inventário no GitHub.** Ele tem IPs, o usuário da câmera e um `user_id`. Não copiei nenhum desses dados para os repositórios.

Mapeei os 5 humores novos para o nome mais próximo, por exemplo `cozy` → `happy` e `reflective` → `neutral`. Se quiser outro mapeamento, a tabela está em `mood-vocabulary.ts` e em `SPRINTS_S00_S01.md`.

> **BLOQUEADO. NÃO ENVIAR.** O prompt abaixo altera a NeoAlice. Ele fica aqui só como registro da saída original.

```text
Você é o agente local da Eva/Alice. Implemente DUAS mudanças pequenas no backend NeoAlice. Siga o protocolo abaixo sem pular passos. Não use emojis nem ícones em código, logs ou na resposta.

PROTOCOLO OBRIGATÓRIO
1. Backup: antes de editar, crie um ponto de restauração do código do backend (commit e tag git "backup/turn-end-pre", ou cópia datada dos arquivos que vai alterar). Registre o caminho do backup.
2. Teste antes: rode os testes existentes do backend e guarde a saída. Grave 2 minutos de tráfego real:
   timeout 120 mosquitto_sub -h <broker> -v -t 'neoalice/v1/#' > mqtt-antes.log
3. Alteração: faça só as mudanças A e B. Não remova nem renomeie campos existentes. Os consumidores atuais (MagicMirror, satélites) devem continuar iguais.
4. Teste depois: rode os mesmos testes. Grave de novo o tráfego com uma conversa real (mqtt-depois.log).
5. Validação: confira cada critério de aceite abaixo e mostre a evidência.
6. Rollback: se algum critério falhar, restaure o backup, reinicie só o container afetado e confirme que o tráfego voltou ao formato de mqtt-antes.log.
7. Pergunte antes de reiniciar qualquer container em produção.

MUDANÇA A — evento de fim de turno
- Publique em neoalice/v1/{site_id}/evt/dialog/turn_end, QoS 1, sem retain, uma vez por turno de conversa.
- Ponto de publicação: logo depois de DIALOG_TURN_SAVED (STREAM, FAST_PATH e SLOW PATH, no orchestrator) ou logo depois do despacho de cmd/tts/audio no satellite_gateway. Escolha UM ponto, para não publicar duas vezes. Explique a escolha.
- site_id: o mesmo site que recebeu a pergunta (o site do evt/stt/final).
- Payload:
  {
    "v": 1,
    "type": "evt.dialog.turn_end",
    "ts": "<ISO 8601 UTC>",
    "site_id": "<site>",
    "turn_id": "<UUID novo e único por turno>",
    "session_id": "<sessão>",
    "intent": "<intent, se existir>",
    "status": "completed | interrupted | cancelled | failed"
  }
- status "completed" só quando a resposta foi gerada e o áudio foi despachado. Use "interrupted" quando o usuário interrompeu, "cancelled" quando o turno foi descartado, "failed" em erro.
- Não inclua o texto da conversa nem user_id neste payload.
- Coloque a publicação atrás de uma variável de ambiente, por exemplo NEOALICE_MQTT__PUBLISH_TURN_END, com padrão true.

MUDANÇA B — humor completo no payload
- Nos payloads já publicados em neoalice/v1/{site_id}/evt/mood e cmd/evt/mood, ACRESCENTE campos. Não mude o campo "mood".
- "energy": número de 0 a 100, igual a round((1 - total_fatigue) * 100), usando o total_fatigue do MoodSystem.
- "cause": texto curto (até 200 caracteres) com o motivo da última mudança de humor, quando o MoodSystem tiver esse motivo. Não invente uma causa. Se não houver, não envie o campo.
- "intensity": número de 0 a 100 SOMENTE se o MoodSystem tiver uma intensidade real do humor atual. NÃO use affinity_score nem interaction_quality como intensidade: eles medem outra coisa. Se não houver intensidade real, não envie o campo e diga isso na resposta.
- "eventId": UUID único por publicação de humor.
- "origin": "neoalice-mood-system".
- Não envie affinity_score ainda. Ele depende da decisão D6 do Planejamento 03.

CRITÉRIOS DE ACEITE
1. Cada conversa completa gera exatamente um evt/dialog/turn_end com status "completed". Mostre 3 exemplos reais de mqtt-depois.log.
2. Um comando que não é conversa (por exemplo, automação) gera turn_end ou não. Diga qual é o caso e por quê.
3. Uma conversa interrompida gera status "interrupted" (se for possível testar sem afetar ninguém).
4. O payload de humor mantém "mood" com o mesmo valor de antes e ganha "energy" e "eventId".
5. O MagicMirror continua mudando de humor, falando e fazendo gestos como antes.
6. Os testes do backend passam antes e depois. Mostre o comando e o resultado.
7. Nenhum segredo, token ou user_id aparece nos novos campos.

FORMATO DA RESPOSTA
- Arquivos alterados, com caminho e linhas.
- Caminho do backup.
- Comandos de teste e resultados (antes e depois).
- Trechos de mqtt-antes.log e mqtt-depois.log que provam cada critério de aceite (sem user_id e sem texto pessoal).
- Lista de pendências e do que não foi possível validar.
```

---

## Saída 4 — Justificativa e regra de bloqueio da NeoAlice

**Nenhuma linha da NeoAlice foi alterada nesta sessão.** O código do backend NeoAlice nunca esteve nesta sessão. Os repositórios privados do backend NeoAlice existem na conta, mas não foram anexados, lidos nem alterados. A sessão roda na nuvem, sem acesso à sua rede nem ao seu broker.

O erro foi outro: na Saída 3 eu **propus** quatro mudanças que alterariam a NeoAlice e **recomendei** enviar o prompt ao agente local:

1. evento `evt/dialog/turn_end` no orchestrator ou no satellite_gateway;
2. campos `energy`, `cause`, `intensity` e `eventId` no humor publicado pelo MoodSystem;
3. ACL no Mosquitto, que é um container da NeoAlice;
4. `affinity_score` como autoridade do afeto (D6), que exige um campo novo publicado pela NeoAlice.

Isso contradizia o próprio Planejamento 03 (produção igual até a S16), vinha antes de existir qualquer avatar novo validado, e punha risco no caminho da voz da Alice para ganhar algo que o serviço de companion não precisa para funcionar.

Correções feitas:

- `PROMPT_BACKEND_FIM_DE_TURNO_E_HUMOR.md` bloqueado com aviso no topo.
- Planejamento 03: regra de bloqueio da NeoAlice nas regras gerais (B5). Itens 2, 4 e 11 da Parte E e a decisão D6 adiados até a liberação.
- README do serviço deixou de recomendar ACL no broker.
- Justificativa completa, com evidências e as condições de liberação, em `JUSTIFICATIVA_ALTERACOES_NEOALICE.md`.

Regra nova: a NeoAlice só muda depois de S16 concluída, critérios de S06 a S16 com evidência, período em paralelo sem regressão, volta ao avatar antigo testada, backup e plano de volta da mudança específica, e aprovação escrita do responsável.
