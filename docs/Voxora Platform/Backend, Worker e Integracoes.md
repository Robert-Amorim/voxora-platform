# Backend, Worker e Integracoes

## Stack

| Area | Tecnologia |
|---|---|
| API | Fastify + TypeScript |
| Auth | JWT + refresh token |
| Banco | Prisma + MySQL |
| Fila | BullMQ + Redis |
| Worker | Node.js/TypeScript |
| Transcricao | OpenAI transcription APIs |
| Pagamentos | Mercado Pago |
| Storage | Oracle Object Storage ou storage local |

## API

Arquivo principal: `apps/api/src/index.ts`.

Responsabilidades observadas:
- healthcheck;
- auth/register/login/refresh;
- verificacao de email;
- reset de senha;
- perfil;
- dashboard/carteira;
- pagamentos e webhook Mercado Pago;
- upload/presign/validacao;
- jobs de transcricao;
- downloads de artefatos;
- suporte/tickets;
- admin de usuarios e tickets.

Arquivos auxiliares:
- `apps/api/src/lib/mercado-pago.ts`
- `apps/api/src/lib/object-storage.ts`
- `apps/api/src/types/fastify-jwt.d.ts`
- `apps/api/prisma/schema.prisma`

## Worker

Arquivo principal: `apps/worker/src/index.ts`.

Responsabilidades observadas:
- consumir fila `transcriptions`;
- processar jobs de transcricao;
- selecionar estrategia de processamento;
- criar chunks de audio quando necessario;
- aplicar prompt policy e guardrails;
- analisar e otimizar audio antes do envio ao provedor;
- acionar OpenAI;
- aplicar diarizacao opcional;
- traduzir quando solicitado;
- gerar artefatos TXT/SRT/PDF;
- persistir transcripts e segmentos;
- capturar/refundar saldo conforme resultado;
- mover falhas finais para DLQ;
- limpar uploads brutos e outputs expirados.

Bibliotecas internas importantes:
- `lib/transcription/chunk-planner.ts`
- `lib/transcription/strategy-selector.ts`
- `lib/transcription/provider-openai.ts`
- `lib/transcription/prompt-policy.ts`
- `lib/transcription/quality-guards.ts`
- `lib/transcription/segment-merge.ts`
- `lib/transcription/diarization-stage.ts`
- `lib/transcript-artifacts.ts`
- `lib/translation.ts`
- `lib/object-storage.ts`

## Contratos compartilhados

Arquivo: `packages/shared/src/index.ts`.

Contratos centrais:
- `JOB_STATUSES`
- `PAYMENT_STATUSES`
- `LEDGER_TYPES`
- `OUTPUT_FORMATS`
- `TRANSCRIPT_VARIANTS`
- `TRANSCRIPT_KINDS`
- `TRANSCRIPT_STATUSES`
- `ACCEPTED_UPLOAD_EXTENSIONS`
- `ACCEPTED_UPLOAD_MIME_TYPES`
- `TRANSCRIPTION_JOB_NAME`

Ao alterar qualquer contrato, revisar:
- API;
- worker;
- web;
- testes/smokes;
- documentacao.

## Variaveis importantes

Referencia completa:
- `.env.example`
- `docs/ENV_PRODUCTION.md`

Grupos criticos:
- banco: `DATABASE_URL` ou `DB_*`;
- auth: `JWT_SECRET`, `PASSWORD_RESET_TOKEN_PEPPER`;
- Redis: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`;
- pagamentos: `PAYMENT_PROVIDER_MODE`, `MERCADO_PAGO_ACCESS_TOKEN`, secrets de webhook;
- storage: `OCI_*`, `UPLOADS_DIR`, `OUTPUTS_DIR`;
- OpenAI: `OPENAI_API_KEY`, `OPENAI_TRANSCRIBE_*`;
- worker: `WORKER_CONCURRENCY`, `TRANSCRIPTION_*`, `RAW_UPLOAD_*`, `OUTPUT_*`.
- audio preflight: `AUDIO_PREFLIGHT_*`.

## Fluxo de pagamento

1. Usuario inicia recarga.
2. API cria pagamento via mock ou Mercado Pago.
3. Webhook confirma status.
4. Ledger registra credito de forma idempotente.
5. Job de transcricao cria hold.
6. Worker captura ou estorna.

Pontos sensiveis:
- idempotencia de webhook;
- nao duplicar credito;
- consistencia de saldo em transacoes;
- falhas finais devem liberar hold quando aplicavel.

## Fluxo de transcricao

1. API cria job e enfileira tarefa.
2. Worker valida arquivo e duracao.
3. Worker executa audio preflight:
   - mede volume medio/pico com FFmpeg;
   - marca risco de audio muito baixo ou clipping;
   - gera MP3 mono 16 kHz com highpass/lowpass, `dynaudnorm` e `loudnorm`.
4. Estrategia:
   - direto sem diarizacao;
   - direto com diarizacao;
   - chunked;
   - chunked com diarizacao.
5. Worker persiste transcript original.
6. Se solicitado, cria traducao.
7. Worker gera artefatos e atualiza status.
8. API disponibiliza resultado e downloads.

## Checks recomendados

```bash
npm run typecheck --workspace @voxora/api
npm run typecheck --workspace @voxora/worker
npm run build --workspace @voxora/api
npm run build --workspace @voxora/worker
npm run test:unit
```

Para mudancas cross-app:

```bash
npm run gate:pr
```

## Regras de seguranca

- Nunca commitar credenciais.
- Validar assinatura de webhooks.
- Manter URLs presign com TTL limitado.
- Evitar logs com token, senha, chave privada ou conteudo sensivel de pagamento.
- Usar transacoes para saldo, ledger e mudancas de estado acopladas.
