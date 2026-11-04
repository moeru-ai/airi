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

FASE 4 - PERFIL DE TESTE NO MAGICMIRROR (a produção continua igual)
1. Gere o build do AIRI: mise exec -- pnpm -F @proj-airi/stage-web build. Sirva a pasta apps/stage-web/dist com um servidor estático local (por exemplo: npx serve -s apps/stage-web/dist -l 5174). Teste no navegador da máquina do espelho.
2. Crie um módulo NOVO e mínimo, MMM-AiriStage, numa pasta nova dentro de modules/ do MagicMirror. Ele só mostra um iframe com a URL do AIRI, em tela cheia, com a permissão de microfone e autoplay (allow="autoplay; microphone"). Não altere o MMM-AvatarMQTT.
3. Crie um arquivo de configuração NOVO, config/config.airi-teste.js, copiado do config.js de produção, trocando o MMM-AvatarMQTT pelo MMM-AiriStage. Não edite o config.js de produção.
4. Inicie o MagicMirror com o perfil de teste: MM_CONFIG_FILE=config/config.airi-teste.js npm run start (ou o comando que a máquina usa, com a mesma variável).
5. Teste no espelho: o avatar aparece, anima parado, responde a uma conversa e a voz sai pela saída de áudio do espelho. Meça o uso de CPU, GPU e memória durante 5 minutos de conversa e compare com o TalkingHead da produção.
6. Volte à produção: pare o MagicMirror e inicie sem MM_CONFIG_FILE. Rode de novo o smoke-test-mqtt.sh e compare com a referência da fase 0. O resultado precisa ser igual.

O QUE NÃO FAZER AGORA
- Não ligar o AIRI aos tópicos MQTT da NeoAlice. A ponte MQTT é a sprint S08 e ainda não existe. O teste do espelho usa o chat do próprio AIRI.
- Não converter a Eva (GLB) para VRM. Isso é a sprint V4.
- Não trocar o perfil de produção do espelho.

RELATÓRIO FINAL (um arquivo .md, guardado fora do repositório público)
1. Versões: commit do overcyber/airi, Node, pnpm, navegador, sistema, GPU.
2. Fase 0: caminho do backup e resultado do smoke test de referência.
3. Fase 1: comandos e resultado. Diga se a instalação precisou de internet.
4. Fase 2: resultado-checks.json e as suas observações das capturas e do vídeo.
5. Fase 3: a tabela dos 10 turnos, os endereços usados (com segredos trocados por ***) e os problemas encontrados.
6. Fase 4: o código do MMM-AiriStage, o diff entre config.js e config.airi-teste.js, as medidas de CPU, GPU e memória, e o resultado do smoke test depois de voltar à produção.
7. Uma lista do que falhou, com o erro exato e o passo para reproduzir.
8. O que a NeoAlice precisaria mudar para a próxima fase (só a descrição, sem mudar nada).
```
