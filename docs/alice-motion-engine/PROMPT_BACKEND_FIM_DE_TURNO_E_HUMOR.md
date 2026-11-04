# Prompt para o agente local — evento de fim de turno e humor completo no MQTT

**Uso:** copie o bloco abaixo e envie ao agente local da Eva/Alice.
**Objetivo:** fazer o backend NeoAlice publicar o fim de cada turno e os campos de humor que ele já calcula. O serviço `services/alice-companion` já aceita esses dados. Com eles, a contagem de turnos deixa de ser deduzida e o humor ganha intensidade, causa e energia.
**Origem:** inventário de 03/11/2026 (Planejamento 03, Parte E, itens 2 e 4).

---

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
