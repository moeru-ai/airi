# Prompt para o agente local da Eva/Alice — inventário dos serviços em uso

**Uso:** copie o bloco abaixo e envie ao agente que roda na máquina da Eva/Alice.
**Objetivo:** levantar os caminhos e as configurações reais de Kokoro, STT, TTS, visão computacional e da fonte do humor. A resposta alimenta as sprints S01 (inventário do humor), S02 (contratos) e S09 (voz e prosódia) do Planejamento 03.
**Atenção:** a resposta contém hosts, portas e caminhos da sua rede. Não cole a resposta em issue, PR ou commit público.

---

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
