# Revisão do MagicMirror e da cópia offline (05/11/2026)

Este documento responde a dois pedidos do responsável:

1. O que deve mudar no MagicMirror para o avatar novo (AIRI).
2. Tudo que precisa de endereço online deve ganhar uma cópia offline.

Ele prepara a S16 (transição do espelho) do Planejamento 03. A NeoAlice não muda.

## 1. Inventário do que acessa a internet

| Componente | Endereço online | Uso | Situação |
| --- | --- | --- | --- |
| `MMM-AvatarMQTT` | `cdn.jsdelivr.net/npm/three@0.161.0` | three.js do avatar atual | **Resolvido.** Cópia local em `node_modules/three` do módulo. |
| `MMM-AvatarMQTT` | `cdn.jsdelivr.net/gh/met4citizen/TalkingHead@1.2` | Reserva do TalkingHead | **Resolvido.** A reserva no CDN agora é opcional (`allowCdnFallback`, desligada). |
| `MMM-AvatarMQTT` | `models.readyplayer.me` | Avatar padrão | **Resolvido.** O Ready Player Me encerrou o serviço. O padrão passou a ser o avatar do servidor TalkingHead local. |
| Servidor TalkingHead local (`talkinghead-neoalice`) | `esm.sh/three@0.161.0` dentro de `modules/talkinghead.mjs` | three.js do avatar atual | **Resolvido sem mexer no servidor.** O importmap do módulo redireciona esses endereços para a cópia local. |
| Servidor TalkingHead local | `www.gstatic.com/draco` | Decodificador Draco | Não é usado: o avatar não usa Draco (`dracoEnabled: false`). |
| `MMM-AvatarMQTT` | `texttospeech.googleapis.com` | Google TTS do texto de `cmd/tts/say` | **Precisa de configuração.** Ver seção 3. |
| AIRI (`stage-web`) | `cloud.airi.build/v1/feature-flags` | Política de recursos da nuvem do AIRI | **Resolvido.** Build com `VITE_AIRI_OFFLINE=true` não chama a nuvem. |
| AIRI (`stage-web`) | CDN de fontes (fontsource) | Fontes da interface | **Resolvido.** O `stage-web` usa os pacotes `@fontsource` locais, como o app desktop. |
| AIRI | `analytics.airi.build` | Análise de uso | Não envia nada num build local. Só os builds oficiais do CI ligam `VITE_ENABLE_ANALYTICS`. |
| AIRI | `cubism.live2d.com`, `dist.ayaka.moe` | SDK do Live2D e modelos de exemplo | Baixados uma vez para o cache local no primeiro `pnpm dev` ou build. README, "Rodar 100% local". |
| AIRI | `huggingface.co` | Modelos do reconhecimento de voz local do AIRI | Só se o reconhecimento de voz do AIRI for ligado. No espelho, a NeoAlice faz o STT, então não é usado. |
| AIRI | Provedores de LLM e TTS | Conversa e voz | Usa o que for configurado. Para ficar local: LLM na rede local e Kokoro. |
| MagicMirror | Módulos de clima, notícias e outros | Conteúdo do espelho | Fora deste trabalho. Esses módulos precisam de internet pela natureza deles. |

## 2. Provas

| Prova | Como | Resultado |
| --- | --- | --- |
| Avatar atual sem internet | `MMM-avatar-3d/scripts/teste-offline-modulo.cjs`: TalkingHead real do servidor local, avatar `eva2.glb`, importmap do módulo, toda requisição fora de 127.0.0.1 bloqueada | Avatar carregado, 0 requisições externas, 0 erros de página |
| AIRI de produção sem internet | Build `VITE_AIRI_OFFLINE=true`, 5 rotas abertas com registro de toda requisição externa | 0 requisições externas. Fontes locais carregadas. |
| AIRI dentro do espelho sem internet | `MMM-avatar-3d/scripts/teste-offline-airi-stage.cjs`: o módulo `MMM-AiriStage` mostra o build offline num iframe, internet bloqueada | AIRI carregado, 0 requisições externas, 0 erros de página |
| Feature flags | Teste `packages/stage-ui/src/stores/feature-flags.test.ts` | Build normal chama a nuvem. Build offline não chama. |

## 3. O que muda no MagicMirror

### 3.1. Agora, sem trocar o avatar (módulo atual offline)

No repositório `MMM-avatar-3d`, o `MMM-AvatarMQTT` mudou assim:

| Mudança | Arquivo |
| --- | --- |
| `three@0.161.0` virou dependência do módulo. Os 11 arquivos que o TalkingHead usa estão no git, então a instalação funciona mesmo sem `npm install`. | `package.json`, `node_modules/three/` |
| Novo `buildImportMap()`: mapeia `three`, `three/addons/` e os endereços `esm.sh` e `cdn.jsdelivr.net` do three.js para a cópia local | `MMM-AvatarMQTT.js` |
| Novas opções `threeBaseURL` (padrão `/modules/MMM-AvatarMQTT/node_modules/three`) e `allowCdnFallback` (padrão `false`) | `MMM-AvatarMQTT.js` |
| O `getScripts` não carrega mais `three.min.js` e `GLTFLoader.js` do CDN. Nada no módulo usava esses arquivos. | `MMM-AvatarMQTT.js` |
| O avatar padrão passou a ser `http://localhost:8081/avatars/eva2.glb` | `MMM-AvatarMQTT.js` |

A configuração do espelho (`config.js`) não precisa mudar, a não ser pelo TTS:

- Se a NeoAlice manda o áudio pronto (`cmd/tts/audio`, por exemplo do Kokoro), o Google TTS não é usado.
- Se a NeoAlice manda só texto (`cmd/tts/say`), o módulo usa o Google TTS, que é online. Para ficar offline:
  - a NeoAlice passa a mandar o áudio do Kokoro em `cmd/tts/audio` (mudança na NeoAlice, que fica para depois da validação do avatar novo); ou
  - `useGoogleTTS: false` no `config.js`. O avatar mexe a boca sem som.

### 3.2. Perfil de teste com o AIRI (S16, primeira fase)

| Item | O que fazer |
| --- | --- |
| Build do AIRI | `VITE_AIRI_OFFLINE=true pnpm -F @proj-airi/stage-web build`. Servir `apps/stage-web/dist` com um servidor estático local que devolve `index.html` para rotas desconhecidas (SPA), por exemplo `npx serve -s apps/stage-web/dist -l 4173`. |
| Módulo | Copiar `MMM-avatar-3d/MMM-AiriStage/` para `modules/` do MagicMirror. Ele mostra o AIRI num iframe com áudio e microfone. |
| Configuração | Um arquivo novo, `config/config.airi-teste.js`, igual ao de produção, trocando o `MMM-AvatarMQTT` pelo `MMM-AiriStage`. Iniciar com `MM_CONFIG_FILE=config/config.airi-teste.js`. |
| Broker | A ponte do AIRI usa WebSocket. O broker do espelho já tem um listener WebSocket (o `MMM-AvatarMQTT` usa `MQTT_BROKER_WS`). Use o mesmo endereço na ponte. |
| Ponte no AIRI | **Configurações > Módulos > NeoAlice Bridge**: o mesmo site do espelho (`magicmirror`), e **Speech** em **Play the audio that NeoAlice sends** se a NeoAlice manda áudio, ou **Speak the text with the AIRI voice settings** com o Kokoro configurado no AIRI. |
| Volta | Iniciar o MagicMirror sem `MM_CONFIG_FILE`. O `config.js` de produção não foi alterado. |

Enquanto os dois perfis rodam no mesmo broker, só um deles deve falar. No perfil de teste, o `MMM-AvatarMQTT` não está carregado, então não há duas vozes.

### 3.3. Troca definitiva (S16, segunda fase)

Só depois de a fase 3.2 rodar por alguns dias sem falha:

1. Backup com `scripts/backup-producao.sh S16`.
2. `config.js` de produção com o `MMM-AiriStage` no lugar do `MMM-AvatarMQTT`.
3. Teste rápido com `scripts/smoke-test-mqtt.sh` e conversa de verdade.
4. Se algo falhar, voltar o `config.js` do backup.

O `MMM-AvatarMQTT` continua no disco como reserva.

## 4. O que fica para depois

- O texto de `cmd/tts/say` precisa de TTS. Sem internet, só o Kokoro local resolve. Isso depende de a NeoAlice mandar o áudio, e a NeoAlice só muda depois da validação do avatar novo.
- A página de teste `index.html` da raiz do `MMM-avatar-3d` ainda usa CDN (three.js e `unpkg.com/mqtt`). Ela não é usada pelo espelho.
- O servidor `talkinghead-neoalice` continua com os endereços `esm.sh` no código. O importmap do módulo resolve isso no espelho. Para abrir o servidor sozinho num navegador sem internet, ele precisaria do mesmo importmap. O repositório dele está fora desta sessão.
