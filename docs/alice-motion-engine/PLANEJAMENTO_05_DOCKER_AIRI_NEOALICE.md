# Plano 05: Docker completo do AIRI/NeoAlice

**Repositório:** overcyber/airi  
**Data:** 2026-11-05  
**Natureza:** auditoria e projeto de implantação; nenhum container executado nesta revisão.  
**Condição:** criar arquivo independente, preservando planos 01 a 04, códigos atuais, backend NeoAlice e produção TalkingHead.  
**Referência:** https://github.com/overcyber/talkinghead-neoalice/blob/main/README-Docker.md

## 1. Auditoria cruzada dos planos

| Documento | Estado | Correção de entendimento |
|---|---|---|
| PLANEJAMENTO_E_HISTORICO_CONVERSA.md (01) | Histórico + especificação inicial | Propõe MMD/PMX primeiro; Plano 04 posteriormente priorizou VRM. |
| PLANEJAMENTO_02_ESTADO_AFETIVO_RELACIONAMENTO_E_COMPANION.md | Parcial | `services/alice-companion` implementa estado, MQTT, energia, cinco métricas e auditoria, mas não todos os recursos de memória/eventos/UI. |
| PLANEJAMENTO_03_ANALISE_E_ROADMAP_DE_SPRINTS.md | Roadmap S00–S17 | Backup/rollback e D1–D8; parte das sprints já foi executada conforme docs mais novas. |
| PLANEJAMENTO_04_REVISAO_UTSUWA_AIRI_AVATAR3D.md | Registro mais recente de movimento | V1–V4, S03, S04 e S08 constam como concluídas; V5 (FBX→VRMA) e V6 (máscara por osso/mistura aditiva) pendentes. |
| STATUS_PLANOS_01_02_E_V1.md | Parcialmente desatualizado | Última seção ainda diz que S03/S04 estão em andamento, embora a própria tabela e o Plano 04 as registrem como concluídas. |
| REVISAO_MAGICMIRROR_E_OFFLINE.md | Plano e evidências de teste offline | `VITE_AIRI_OFFLINE=true`, assets locais e `MMM-AiriStage`; ainda requer teste real no host do espelho. |
| JUSTIFICATIVA_ALTERACOES_NEOALICE.md | Restrição obrigatória | Não alterar/reiniciar backend da NeoAlice durante homologação do novo avatar. |

### Implementações conferidas na árvore main

- `packages/alice-motion/src`: contratos Valibot, MotionDirector, MotionScheduler, catálogo, resolução de humores e tradutor MQTT NeoAlice. O scheduler decide prioridades, mas **não implementa ainda a camada renderizada de máscaras/mistura aditiva de V6**.
- `packages/stage-ui-three/src/composables/vrm`: avatar-animator, mood-face, mood-body, performance-director, thinking-pose e testes. VRM é o alvo atual.
- `packages/stage-ui/src`: ações VRM via ACT, importação de VRMA em IndexedDB e bridge NeoAlice em WebSocket MQTT.
- `services/alice-companion/src`: singleton Node/TS com MQTT, `state.json`, `state.json.bak`, `audit.jsonl`, `companion.lock`. Não expõe HTTP/healthz atualmente.
- `packages/alice-avatar-tools`: conversor de GLB Ready Player Me para VRM 1.0. Arquivo Eva convertido fica fora do repositório público.
- `apps/stage-web/Dockerfile`: build Node 24.22.1 para SPA e publicação em Nginx. O fork pede Node 26.12.1 e pnpm 11.24.0 no `.tool-versions`.
- `.github/workflows/release-docker.yaml`: já publica OCI com linux/amd64 e linux/arm64, mas ativa `VITE_ENABLE_ANALYTICS=true` e não define o perfil offline; necessário perfil próprio da Alice.
- `server/docker-compose.yaml`: backend genérico de desenvolvimento com Postgres, Redis, RustFS, auth/API e Caddy, **não é dependência obrigatória do stage-web simples**. Contém senhas demonstrativas; não subir em produção sem hardening.

**Estado de comprovação:** arquivos e testes existentes foram inspecionados; os resultados V1–V4 e S08 são evidências registradas pelo repositório, não benchmarks novamente executados aqui.

## 2. Auditoria do teste-app e seu limite

Fonte: `docs/alice-motion-engine/teste-app/README.md`, `teste-app-v1-v2.cjs`, `fake-openai-server.cjs` e `teste-ponte-s08.cjs`.

- O primeiro harness abre o `stage-web` com Playwright, importa Neptuna, importa emote VRMA e usa servidor **falso** OpenAI-compatible em `127.0.0.1:8091` para devolver respostas com emoções e movimentos; áudio do TTS é um tom.
- O segundo harness simula eventos MQTT de fala/humor/gesto, usando `BRIDGE_WS_URL` e `PUBLISH_URL`; requer broker **de teste**.
- O README informa nove verificações V1/V2 e seis verificações S08, com evidências versionadas. Não cobre LLM real, Kokoro real, processo de produção Nginx, 24 horas de estabilidade, duas janelas Electron ou GPU do browser.
- `fake-openai-server.cjs` escuta apenas `127.0.0.1:8091`; se virar serviço Docker separado, tornar bind e URL configuráveis, mantendo acesso **somente na rede de teste**.
- Em Playwright dentro de outro container, `127.0.0.1` é o próprio runner; mudar `baseUrl` do mock (hoje hardcoded no harness) para nome da rede Compose, e configurar `FAKE_OPENAI_BASE_URL`. O hostname do mock deve ser resolvível **do navegador que roda dentro do runner**, não só do processo Node.
- O MQTT de teste tem padrões 1883/9001; o inventário do host RK3588 usa 1883 TCP e 1884 WebSocket. Não aplicar portas de teste cegamente à produção.
- Separar pipelines: testes com mocks, testes com serviços reais sem afetar produção e aceitação no MagicMirror.

## 3. Como o Docker TalkingHead funciona e como replicar

O TalkingHead atual tem um único `node:20-alpine` executando `server.cjs`, porta **8081**, volumes read-only para assets e healthcheck HTTP `/modules/talkinghead.mjs`. O Compose reinicia automaticamente. É apropriado ao servidor HTTP pequeno.

O AIRI precisa preservar a mesma **experiência operacional** (build, up, health, logs, restart, backup e rollback), mas não copiar a arquitetura de um único container:

| Papel | Container | Porta exposta | Dados |
|---|---|---|---|
| AIRI Stage Web (SPA estática) | `airi-web`, Nginx | 4173→80 | Bundle read-only; IndexedDB/LocalStorage permanecem no browser |
| Companion (autoridade de estado) | `alice-companion`, Node/TS | Nenhuma | Volume único `/data`, backup e auditoria |
| Broker de teste | `mosquitto-test` (perfil test) | Somente loopback 11883/19001 | Isolado da produção |
| Fake OpenAI/TTS | `fake-openai` (perfil test) | Nenhuma na LAN | Artefatos e logs de teste |
| Playwright | `airi-e2e` (perfil test) | Nenhuma | Resultados, vídeos e screenshots |
| Broker real NeoAlice | Já existente | TCP 1883 / WS 1884 (inventário) | **Não alterar agora** |
| Kokoro, Whisper, modelos LLM | Já existentes | Endpoints atuais | **Não duplicar na fase inicial** |
| TalkingHead | Já existente | 8081 | **Manter para rollback** |

**GPU:** o RK3588 inventariado é ARM64 e não tem CUDA/NVIDIA; Nginx não renderiza avatar. A renderização VRM/WebGL acontece no **Chromium do MagicMirror** ou browser do usuário. Se usar outra máquina com RTX 3090/4060 Ti para vLLM/StreamTalk, ela terá **outro stack Docker**, acessado por API, e deve usar NVIDIA Container Toolkit. Nunca ativar `gpus: all` no RK3588.

## 4. Arquitetura alvo

```mermaid
flowchart LR
  P[Chromium no MagicMirror / navegador] -->|HTTP(S) :4173| W[airi-web Nginx]
  P -->|WS(S) MQTT| M[Broker Mosquitto existente]
  P -->|API de voz/LLM| AI[Kokoro + Ollama/NIM/OpenRouter]
  N[NeoAlice existente] --> M
  C[alice-companion: Node] <-->|MQTT TCP 1883| M
  C --> D[(Volume /data: estado e auditoria)]
  T[TalkingHead:8081]:::rollback
  classDef rollback stroke-dasharray: 5 5
```

### Regra fundamental de rede

- `alice-companion`: `mqtt://HOST_DO_BROKER:1883`, acessível **do container**, com credenciais em ambiente seguro.
- `AIRI` aberto em browser: `ws://HOST_DO_BROKER:1884` ou `wss://...` se a página for HTTPS, acessível **da máquina do Chromium**. Hostnames internos Compose não servem para browser remoto.
- LLM/TTS no browser: precisam ser alcançáveis do navegador; observar CORS, TLS e autenticação. NVIDIA NIM **nativo** está documentado no AIRI Desktop, e a versão Web deve usar o provedor compatível adequado; não prometer o seletor nativo NIM em Web.
- `MMM-AiriStage`: iframe precisa de URL final estável, HTTPS para microfone no browser quando usado e permissões do frame. Se NeoAlice faz STT e entrega áudio via MQTT, **não abrir segundo microfone nem duas saídas TTS**.

## 5. Estrutura de diretórios prevista

```text
deploy/alice/
  README.md
  compose.yaml
  compose.test.yaml
  compose.gpu.example.yaml
  .env.example
  docker/
    Dockerfile.web
    Dockerfile.companion
    nginx.conf
    companion-healthcheck.mjs
  mqtt-test/
    mosquitto.conf
  scripts/
    preflight.sh
    backup.sh
    restore.sh
    smoke.sh
    smoke-offline.sh
    check-license.sh
  artifacts/             # ignorado no git
```

**Esses arquivos são propostos, não foram criados neste plano.** O build context deve ser a raiz do monorepo para resolver pnpm lock/workspace/patches.

## 6. Docker Compose proposto, esqueleto de contrato

```yaml
name: neoalice-airi
services:
  airi-web:
    build:
      context: ../..
      dockerfile: deploy/alice/docker/Dockerfile.web
      args:
        VITE_AIRI_OFFLINE: "true"
        VITE_ENABLE_ANALYTICS: "false"
    image: neoalice/airi-web:planned
    restart: unless-stopped
    ports:
      - "127.0.0.1:4173:80"
    healthcheck:
      test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1/healthz || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    networks: [alice-net]

  alice-companion:
    build:
      context: ../..
      dockerfile: deploy/alice/docker/Dockerfile.companion
    image: neoalice/alice-companion:planned
    restart: unless-stopped
    init: true
    env_file:
      - path: ./.env.private
        required: false
    environment:
      ALICE_COMPANION_MQTT_URL: "mqtt://HOST_DO_BROKER:1883"
      ALICE_COMPANION_DATA_DIR: /data
      ALICE_COMPANION_PERSONA_ID: alice
      ALICE_COMPANION_OWNER_PROFILE_ID: default
      ALICE_COMPANION_PUBLISH_SITE: companion
      ALICE_COMPANION_TIME_ZONE: America/Sao_Paulo
    volumes:
      - alice-companion-data:/data
    networks: [alice-net]

networks:
  alice-net:
    driver: bridge
volumes:
  alice-companion-data:
```

**Não executar diretamente**: os Dockerfiles ainda precisam ser escritos, o hostname é placeholder e as políticas de rede/credenciais devem ser configuradas. No Raspberry/RK3588, preferir bind loopback e reverse proxy com TLS; se o MagicMirror usar outro host, publicar apenas no IP LAN autorizado. Reusar 8081 para AIRI é proibido na fase de migração. O Companion **publica exclusivamente** no namespace de companion, enquanto a bridge visual apenas lê tópicos da NeoAlice.

## 7. Dockerfiles / build específicos

### Web

- Partir do Dockerfile já existente `apps/stage-web/Dockerfile`, mas alinhar Node `26.12.1` e pnpm `11.24.0` conforme `.tool-versions` **se as imagens suportarem as plataformas**; confirmar antes de fixar digest.
- Build multi-stage: pnpm fetch/install com lock, `VITE_AIRI_OFFLINE=true`, `VITE_ENABLE_ANALYTICS=false`, build `@proj-airi/stage-web`, copiar `dist` para Nginx.
- A versão upstream também compila docs e galeria Histoire, que não são necessários ao avatar. Criar build mínimo sem modificar o upstream, a menos que o app dependa de alguma rota.
- O primeiro build descarrega SDK Live2D e modelos para `.cache`; preparar assets/termos antes de afirmar build totalmente offline.
- O Nginx padrão precisa de **SPA fallback**, healthcheck, headers e cache. Arquivos `public/_headers` e `public/_redirects` não são interpretados automaticamente por Nginx.

Configuração base de referência:

```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location = /healthz { access_log off; return 200 'ok'; }
  location /assets/ {
    try_files $uri =404;
    add_header Cache-Control "public, max-age=31536000, immutable";
  }
  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Ajustar `/docs`, redirects e recursos dinâmicos; não configurar `index.html` como immutable. Pin de versão/digest, imagem sem secrets e usuário/permissões restritos.

### Companion

- Usar o script atual `pnpm -F @proj-airi/alice-companion start`, que executa `tsx ./src/bin/run.ts`. **Não inventar** `dist/main.js`.
- Instalar somente workspace/deps necessários após verificar se `pnpm deploy --prod` resolve o pacote `@proj-airi/alice-motion`, que distribui TypeScript.
- Montar `/data` gravável, usuário não-root coerente com UID/GID do volume, SIGTERM e LWT MQTT.
- Não executar múltiplas réplicas. O lock atual é baseado em PID escrito em `companion.lock`; testar reinício e reutilização de PID em container novo.
- Ainda não há endpoint HTTP `/healthz`; criar checagem de processo+MQTT/estado ou endpoint real (não mascarar falta com simples HTTP do Nginx).
- Configurar `ALICE_COMPANION_INPUT_SITES` estritamente e segredos `ALICE_COMPANION_MQTT_USERNAME`/`_PASSWORD` fora do Git.
- O broker documentado é anônimo, sem ACL. O comando `cmd/companion/reset` pode alterar estado. Tratar MQTT como perímetro de segurança e planejar ACL/TLS em janela separada e autorizada.

## 8. Armazenamento e migração

**Não confundir os dois sistemas de persistência:**

1. `alice-companion` grava em volume do container: `state.json`, `state.json.bak`, `audit.jsonl`, `companion.lock`. Backup precisa ser consistente e preservado em upgrades; não executar `docker compose down -v` em produção.
2. AIRI Web grava modelos importados, VRMA, opções de provedor/ponte e preferências em **IndexedDB/localStorage do browser**. Mudar `localhost:5173` para `hostname:4173`, ou HTTP para HTTPS, altera **origem** e não migra automaticamente dados. Criar export/import e migração verificável, preferir URL permanente desde a fase de testes.

A Eva convertida de GLB para VRM 1.0 permanece asset privado/local. Não empacotá-la em registry público sem verificar termos do Ready Player Me. Separar cache de assets permitidos do repositório.

## 9. Segurança e licenciamento são gates de publicação

- `packages/stage-ui-three/src/composables/vrm/avatar-animator.ts` e `mood-face.ts` identificam explicitamente código **portado do Utsuwa, AGPL-3.0-or-later**. O root MIT do AIRI não elimina as obrigações de licença desses trechos. Rever com responsável jurídico/de licença antes de publicar imagem ou distribuir o fork.
- `packages/stage-ui-three/src/assets/vrm/animations/utsuwa/NOTICE.md` admite que a licença dos 13 arquivos VRMA ainda está sendo resolvida. O autor do repositório pode não ser o detentor de direitos de cada arquivo de amostra. **Não publicar imagens públicas contendo esses assets até liberar os direitos**.
- O workflow upstream de Docker usa `VITE_ENABLE_ANALYTICS=true`; a variante privada da Alice deve usar `false` e `VITE_AIRI_OFFLINE=true`.
- Não expor MQTT TCP, endpoints NIM/LLM sem autenticação, fake OpenAI ou dados afetivos na internet.
- Em HTTPS, usar WSS para MQTT, HTTPS para APIs do browser e delegar microfone ao iframe apenas quando necessário.
- Separar `.env.private` fora do Git; se quiser Docker Secrets, adaptar a aplicação a `*_FILE` ou outro mecanismo seguro.

## 10. Três perfis de implantação

**A: edge-existing (prioridade)**: RK3588 executa `airi-web` e `alice-companion` em Docker. NeoAlice, Mosquitto, Kokoro, Whisper e LLM seguem operando como estão. TalkingHead permanece em 8081. MagicMirror usa perfil de teste `MMM-AiriStage`.

**B: lab-isolado**: Web+Companion, broker Mosquitto em portas loopback 11883/19001, mock LLM/TTS, Playwright; nenhuma conexão com broker real. Perfis `test` do Compose somente neste laboratório.

**C: full-local-extended**: serviços adicionais TTS/ASR/LLM/StreamTalk/ARDY em containers e hosts adequados. É fase posterior; repositórios/containers privados NeoAlice e imagens reais de Kokoro devem ser inventariados. Se GPU NVIDIA estiver em outro host, Compose daquele host usa NVIDIA Container Toolkit e reserva de GPU. O RK3588 não tem NVIDIA.

## 11. Sprints do Docker (D00 a D11)

| Sprint | Entrega | Critério de saída |
|---|---|---|
| D00 | Congelar commit SHAs, baseline TalkingHead, mapa de serviços/portas/volumes, backup | Rollback reproduzível |
| D01 | Revisão de AGPL, VRMA, Eva, cache Live2D e registry | Direitos/autorização documentados |
| D02 | Dockerfile.Web offline + Nginx SPA + /healthz, pin AMD64/ARM64 | Build e smoke sem CDN |
| D03 | Dockerfile.Companion singleton + volume + saúde + SIGTERM | Estado persistido após restart |
| D04 | Compose, env example, rede, acesso broker e endpoints | `docker compose config` válido |
| D05 | Perfil de teste com Playwright/mock/Mosquitto isolados | 9/9 V1/V2 e 6/6 S08 reproduzidos |
| D06 | LLM real via NIM/OpenAI-compatible + Kokoro real, português | 20 turnos, áudio real, motions e humor |
| D07 | Export/migração do browser, offline integral e URL estável | VRM/VRMA sobreviveram à atualização |
| D08 | MagicMirror no RK3588 por perfil separado; métricas comparativas | CPU/RAM/FPS/áudio/WS estáveis |
| D09 | Stress/soak, reconexão, segurança, rollback ensaiado | 100 interrupções, reload, 24 h de teste |
| D10 | Cutover após autorização; manter TalkingHead como fallback | `MMM-AiriStage` em produção e reversão testada |
| D11 | Opcional: NPU/LLM/Kokoro/StreamTalk dockerizados em hosts próprios | Só após inspeção do serviço real |

**Não atrelar D02–D09 à conclusão de V6.** Dockerizar e validar o avatar atual pode preceder a mistura aditiva avançada. O objetivo `walk + gesture_left + gaze + speech` só pode ser declarado concluído depois de V6/P3.

## 12. Testes de aceitação obrigatórios

| Teste | Critério |
|---|---|
| Build multiarch | `linux/amd64` e `linux/arm64` com SHA/digest fixado |
| Static SPA | `/healthz` HTTP 200 e recarga direta de rota não resulta 404 |
| Offline | Zero consultas externas não autorizadas com browser e proxy inspecionados |
| Teste-app | Nove verificações V1/V2, vídeo, JSON e logs no runner isolado |
| Ponte S08 | Seis verificações; site errado ignorado; **zero PUBLISH da bridge** |
| Companion | Estado, audit, lock e idempotência após restart/reconexão |
| IA real | 20 turnos em português, humor, motions e TTS Kokoro |
| Browser MagicMirror | Contexto seguro, áudio único, uso de CPU/RAM e WebGL no RK3588 |
| Persistência do browser | Modelo/VRMA/preferências após reload e atualização de imagem |
| Robustez | 100 interrupções, stress de modelo, 24 h de soak, sem vazamentos |
| Rollback | Config original e TalkingHead 8081 restaurados sem perda |
| Segurança | Secrets fora da imagem; MQTT namespace/ACL; clearance AGPL/assets |

## 13. Operação-alvo após implementação

```sh
./deploy/alice/scripts/preflight.sh
docker compose -f deploy/alice/compose.yaml build
docker compose -f deploy/alice/compose.yaml up -d
docker compose -f deploy/alice/compose.yaml ps
docker compose -f deploy/alice/compose.yaml logs -f airi-web alice-companion
curl -fsS http://127.0.0.1:4173/healthz
./deploy/alice/scripts/backup.sh
# eventual rollback deve restaurar tags/digests e config do MagicMirror, não apagar volumes
```

Os comandos acima são **alvo**, não executáveis no commit atual porque os Dockerfiles e scripts propostos ainda não existem.

### Ordem de cutover seguro

1. Registrar backup do espelho atual e tag da imagem TalkingHead, mantendo 8081 e `config.js` intactos.
2. Subir `airi-web` em 4173 e Companion num volume próprio.
3. Validar com mock e broker isolado; depois com endpoints reais sem alterar NeoAlice.
4. Testar MagicMirror via `config.airi-teste.js` e `MMM-AiriStage`; somente um player de voz habilitado.
5. Medir no RK3588 e observar 24 h de teste.
6. Com autorização, promover `MMM-AiriStage` à configuração de produção.
7. Em falha, restaurar `config.js`, reiniciar MagicMirror e manter TalkingHead/volume. Não reiniciar/migrar backend NeoAlice durante rollback.

## 14. Conclusão

**Recomendação:** manter AIRI como plataforma e containerizar primeiro o frontend Web e o serviço Companion com Compose próprio da Alice, reutilizando os serviços operacionais da NeoAlice, broker e modelos atuais. Separar testes `teste-app` do ambiente de produção e não tentar redesenhar modelo afetivo, trocar backend MQTT e implementar V6 no mesmo deploy.

Isso alcança a mesma facilidade operacional do Docker TalkingHead, com isolamento correto de frontend, estado, rede, licenças e testes. **Nenhum container, script ou Dockerfile novo é entregue como implementado neste planejamento.**

### Fontes do código auditado

- https://github.com/overcyber/airi/tree/main/docs/alice-motion-engine
- https://github.com/overcyber/airi/blob/main/docs/alice-motion-engine/teste-app/README.md
- https://github.com/overcyber/airi/blob/main/apps/stage-web/Dockerfile
- https://github.com/overcyber/airi/blob/main/services/alice-companion/README.md
- https://github.com/overcyber/airi/blob/main/packages/alice-motion/README.md
- https://github.com/overcyber/airi/blob/main/.github/workflows/release-docker.yaml
- https://github.com/overcyber/talkinghead-neoalice/blob/main/README-Docker.md
- https://github.com/overcyber/talkinghead-neoalice/blob/main/docker-compose.yml
- https://docs.docker.com/compose/how-tos/gpu-support/
- https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
