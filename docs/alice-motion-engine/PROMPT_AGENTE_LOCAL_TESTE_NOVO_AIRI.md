# Prompt para o agente local da Eva/Alice: instalar, testar e ligar o novo AIRI

**Uso:** copie o bloco abaixo e envie ao agente que roda na máquina da Eva/Alice.

**Objetivo:** instalar o fork `overcyber/airi` com as sprints V1 e V2 e testar o avatar novo nesta máquina. Depois, mostrar o avatar novo num perfil de teste do MagicMirror. O perfil de produção (MMM-AvatarMQTT com TalkingHead) continua como está e é a volta garantida.

**Atenção:**

- A NeoAlice não muda nesta etapa. Ela só muda depois que o avatar novo funcionar por completo, com justificativa escrita.
- O relatório do agente tem hosts, portas e caminhos da sua rede. Não cole o relatório em issue, PR ou commit público.

---

```text
Você é o agente local da Eva/Alice. Sua tarefa é instalar e testar o novo AIRI (fork overcyber/airi, sprints V1 e V2) nesta máquina. Depois, ligue o avatar novo num perfil de TESTE do MagicMirror, sem tirar o perfil de produção.

REGRAS QUE VALEM PARA TODA A TAREFA
1. NeoAlice: SOMENTE LEITURA. Não edite código, configuração, banco, tópicos MQTT nem containers da NeoAlice. Não reinicie a NeoAlice. Se um passo pedir mudança na NeoAlice, pare e registre no relatório o que seria preciso e por quê.
2. Antes de cada fase que muda algo, faça backup. Depois da mudança, teste. Se o teste falhar, volte ao backup e registre a falha. Nenhuma fase começa com a anterior falhando.
3. Não apague nada. Para substituir um arquivo, renomeie o antigo com o sufixo .bkp-<data>.
4. Não use emojis nem ícones em código, logs, mensagens de commit ou no relatório.
5. Não mostre segredos. Troque o valor de token, senha ou chave de API por "***".
6. Informe só o que você verificou, com o comando e a saída. Se algo não funcionou, diga exatamente o erro. Não deduza resultados.
7. Responda em português.

FASE 0 - BACKUP DA PRODUÇÃO
1. No repositório MMM-avatar-3d, rode o backup da sprint S00 com o ID V2LOCAL:
   MM_DIR=<pasta do MagicMirror> MQTT_HOST=<broker> ./scripts/backup-producao.sh V2LOCAL
2. Confira que a pasta do backup tem o config.js do MagicMirror, o módulo MMM-AvatarMQTT (sem node_modules) e a gravação MQTT.
3. Rode o teste rápido da produção (scripts/smoke-test-mqtt.sh) e guarde o resultado como referência.

FASE 1 - INSTALAR O AIRI
1. Clone https://github.com/overcyber/airi (branch main) numa pasta nova, fora da pasta do MagicMirror. Se já existir um clone, faça git pull --rebase.
2. Siga a seção "Fork Alice: instalar e rodar localmente" do README.md do repositório:
   - Node.js 26.12.1 e pnpm 11.24.0 (arquivo .tool-versions, o mise instala os dois).
   - mise install e depois mise exec -- pnpm install.
3. Rode uma vez: mise exec -- pnpm dev. Na primeira vez, ele baixa 5 arquivos para o cache (SDK do Live2D e modelos de exemplo). Confira as linhas "downloaded" ou "already exists in cache" no log.
   - Se esta máquina não tiver internet, siga a seção "Rodar 100% local (sem internet)" do README.
4. Teste: abra http://localhost:5173 e confirme que a página carrega. Pare o servidor.

FASE 2 - TESTE AUTOMÁTICO DA V1 E DA V2 (sem LLM e sem TTS de verdade)
1. Leia docs/alice-motion-engine/teste-app/README.md.
2. Rode os 3 passos do README: o stage-web, o servidor falso (fake-openai-server.cjs) e o teste (teste-app-v1-v2.cjs). Use VIDEO=1 para gravar o vídeo.
3. O teste termina com código 0 quando as 9 verificações passam. Copie o conteúdo de resultado-checks.json no relatório.
   Rode também o teste da ponte NeoAlice (seção "Teste da ponte NeoAlice (S08)" do mesmo README), com um Mosquitto
   SÓ DE TESTE em 127.0.0.1 nas portas 11883 (mqtt) e 19001 (websockets), nunca o broker de produção, e rode com
   BRIDGE_WS_URL=ws://127.0.0.1:19001 PUBLISH_URL=mqtt://127.0.0.1:11883. As 6 verificações precisam passar,
   e o log desse Mosquitto não pode ter "Received PUBLISH from airi-neoalice-bridge".
4. Abra as capturas e o vídeo e confirme com os seus olhos:
   - Parada: ela troca de animação de espera a cada poucos segundos.
   - Esperando a resposta: mão no queixo.
   - Resposta com greeting: ela acena com o rosto feliz.
   - Fala: o clipe de fala entra (mão na cintura) e a boca mexe.
   - Humor triste: o rosto fica triste e continua triste depois da fala.
   - happy_spin: ela gira.
5. Se uma verificação falhar, NÃO siga para a fase 3. Registre a verificação, o console.txt e a captura.

FASE 3 - TESTE COM O LLM E A VOZ DE VERDADE
1. Use os endereços do inventário de serviços (inventario_servicos_voz_visao_humor_v0.md, fora do repositório público). Não invente endereços.
2. No AIRI (http://localhost:5173), configure:
   - LLM: um provedor "OpenAI Compatible" apontado para o LLM local que você usa para testes. Se o LLM da NeoAlice tiver uma API compatível com OpenAI, você pode só LER o endereço e apontar o AIRI para ele. Não mude nada na NeoAlice.
   - Voz: o Kokoro, se ele tiver a rota compatível com OpenAI (/v1/audio/speech). Escolha a voz da Alice que o inventário indica.
   - Modelo: importe a Neptuna (packages/alice-motion/fixtures/vrm/neptuna/neptuna.vrm) e escolha-a.
3. Converse em português por pelo menos 10 turnos. Inclua: um cumprimento, uma notícia triste, uma surpresa e um pedido de pose ("faz um sinal de paz", "mostra o corpo inteiro").
4. Registre, para cada turno: o texto enviado, os tokens ACT que o LLM devolveu (emotion e motion), o que o avatar fez e se a voz saiu.
5. Critério de aprovação: o avatar nunca congela, cada motion pedida pelo LLM toca, o humor fica até o próximo humor e o lip-sync acompanha a voz.
6. Importe um VRMA próprio na seção Motions (Configurações > Modelos), escreva uma descrição em inglês e confirme que o LLM o usa quando o pedido combina com a descrição.

FASE 4 - PERFIL DE TESTE NO MAGICMIRROR, SEM INTERNET (a produção continua igual)
Siga docs/alice-motion-engine/REVISAO_MAGICMIRROR_E_OFFLINE.md, seção 3.
1. Atualize o clone do MMM-avatar-3d (git pull --rebase) e rode:
   node --test tests/mood-map.test.mjs
   node --test tests/airi-stage.test.mjs
   node scripts/teste-offline-modulo.cjs <pasta do servidor TalkingHead> ./saida-offline
   O último precisa terminar com "PASSOU" e 0 requisições externas.
2. Faça o backup da produção (fase 0) e então atualize o módulo instalado MMM-AvatarMQTT com a versão do repositório
   (MMM-AvatarMQTT.js, package.json e node_modules/three). Reinicie o MagicMirror com a configuração de produção
   e confira que o avatar atual carrega. Teste também com a internet desligada.
3. Gere o build offline do AIRI: VITE_AIRI_OFFLINE=true mise exec -- pnpm -F @proj-airi/stage-web build
   Sirva apps/stage-web/dist com um servidor estático com fallback de SPA, por exemplo: npx serve -s apps/stage-web/dist -l 4173
   Rode: AIRI_URL=http://127.0.0.1:4173/ node scripts/teste-offline-airi-stage.cjs ./saida-airi-stage (no MMM-avatar-3d). Precisa terminar com "PASSOU".
4. Copie a pasta MMM-AiriStage do repositório para modules/ do MagicMirror. Não altere o MMM-AvatarMQTT além do passo 2.
5. Crie um arquivo NOVO, config/config.airi-teste.js, copiado do config.js de produção, trocando o MMM-AvatarMQTT
   pelo MMM-AiriStage (position "fullscreen_below", url http://localhost:4173/). Não edite o config.js de produção.
6. Inicie o MagicMirror com o perfil de teste: MM_CONFIG_FILE=config/config.airi-teste.js e o comando que a máquina usa.
7. No AIRI dentro do espelho, configure Configurações > Módulos > NeoAlice Bridge: o mesmo endereço WebSocket
   do broker que o MMM-AvatarMQTT usa (MQTT_BROKER_WS), o site do espelho, e Speech conforme a NeoAlice:
   "Play the audio that NeoAlice sends" se ela manda cmd/tts/audio, ou "Speak the text with the AIRI voice settings" com o Kokoro.
   Importe a Neptuna e escolha-a.
8. Teste no espelho, com a internet desligada: o avatar aparece, anima parado, pensa quando a NeoAlice recebe a fala
   (evt/stt/final), fala com a boca sincronizada, muda de humor e faz os gestos. Meça CPU, GPU e memória
   durante 5 minutos de conversa e compare com o TalkingHead da produção.
9. Volte à produção: pare o MagicMirror e inicie sem MM_CONFIG_FILE. Rode de novo o smoke-test-mqtt.sh
   e compare com a referência da fase 0. O resultado precisa ser igual.

O QUE NÃO FAZER AGORA
- Não publicar nada no MQTT a partir do AIRI. A ponte só lê, e o teste deve confirmar isso no log do broker.
- Não converter a Eva (GLB) para VRM. Isso é a sprint V4.
- Não trocar o perfil de produção do espelho.

RELATÓRIO FINAL (um arquivo .md, guardado fora do repositório público)
1. Versões: commit do overcyber/airi, Node, pnpm, navegador, sistema, GPU.
2. Fase 0: caminho do backup e resultado do smoke test de referência.
3. Fase 1: comandos e resultado. Diga se a instalação precisou de internet.
4. Fase 2: resultado-checks.json e as suas observações das capturas e do vídeo.
5. Fase 3: a tabela dos 10 turnos, os endereços usados (com segredos trocados por ***) e os problemas encontrados.
6. Fase 4: as saídas dos testes offline, o diff entre config.js e config.airi-teste.js, as medidas de CPU, GPU e memória, o teste com a internet desligada, e o resultado do smoke test depois de voltar à produção.
7. Uma lista do que falhou, com o erro exato e o passo para reproduzir.
8. O que a NeoAlice precisaria mudar para a próxima fase (só a descrição, sem mudar nada).
```
