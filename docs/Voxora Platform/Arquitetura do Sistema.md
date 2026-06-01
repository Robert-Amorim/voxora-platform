# Arquitetura do Sistema

## Visao geral

O Voxora e um monorepo Node.js/TypeScript com quatro blocos principais:

```text
Usuario
  -> React/Vite web
  -> Fastify API
  -> MySQL/Prisma
  -> Redis/BullMQ
  -> Worker de transcricao
  -> OpenAI / Diarizer / Object Storage
```

Em producao, o acesso publico passa por Oracle DNS, OCI Load Balancer e NGINX na VM antes de chegar aos processos locais.

```text
Internet
  -> Oracle DNS
  -> OCI Load Balancer (147.15.35.30)
  -> NGINX na VM
  -> web estatico + API local + worker via fila
```

## Responsabilidades por camada

| Camada | Caminho | Responsabilidade |
|---|---|---|
| Web | `apps/web` | Interface, rotas, sessao, consumo da API e fluxos de usuario/admin |
| API | `apps/api` | Contratos HTTP, auth, RBAC, carteira, pagamentos, uploads, jobs e suporte |
| Worker | `apps/worker` | Processamento assincrono, transcricao, traducao, artefatos, DLQ e limpeza |
| Shared | `packages/shared` | Tipos e constantes compartilhadas entre apps |
| Diarizer | `apps/diarizer` | Servico auxiliar Python para diarizacao externa |
| Infra | `infra`, `scripts/ops` | NGINX, templates, smoke de servidor e utilitarios operacionais |

## Fluxo de transcricao

1. Usuario cria job no frontend.
2. API valida sessao, saldo, arquivo e parametros.
3. API gera URL de upload ou usa storage local.
4. API registra job e enfileira tarefa no BullMQ.
5. Worker baixa/le o arquivo, calcula estrategia e executa transcricao.
6. Para arquivos grandes, worker usa chunking com overlap.
7. Para diarizacao, worker usa modelo diarizado ou servico auxiliar quando aplicavel.
8. Worker persiste transcript, chunks, artefatos e status.
9. API expoe downloads/resultado para o frontend.
10. Fluxo financeiro captura ou estorna creditos conforme sucesso/falha.

## Fluxo financeiro

Principais conceitos em `packages/shared`:
- `PAYMENT_STATUSES`: `pending`, `approved`, `rejected`, `expired`
- `LEDGER_TYPES`: `credit`, `hold`, `capture`, `refund`, `adjustment`

Fluxo esperado:
1. pagamento cria credito (`credit`) quando aprovado;
2. job reserva saldo (`hold`);
3. sucesso captura reserva (`capture`);
4. falha libera saldo (`refund`);
5. webhooks devem ser idempotentes.

## Contratos compartilhados

`packages/shared/src/index.ts` centraliza:
- estados de job;
- estados de pagamento;
- tipos de ledger;
- formatos de saida;
- variantes/status de transcript;
- extensoes e MIME types aceitos;
- nome canonico da tarefa de transcricao.

Mudancas nesses contratos exigem revisar API, worker e web no mesmo ciclo.

## Persistencia e fila

| Recurso | Uso |
|---|---|
| MySQL | Usuarios, jobs, pagamentos, ledger, transcripts e metadados |
| Prisma | Schema e client de acesso |
| Redis | BullMQ, filas e estados de processamento |
| BullMQ | Fila `transcriptions` e DLQ `transcriptions.dlq` |
| Object Storage | Uploads/outputs em producao quando variaveis OCI estao configuradas |

## Integracoes externas

| Integracao | Uso |
|---|---|
| OpenAI | Transcricao direta, diarizada e chunked |
| Mercado Pago | PIX/cartao e webhooks de pagamento |
| Oracle Object Storage | Armazenamento de entradas e artefatos |
| Oracle DNS/LB | Publicacao de dominio e TLS |
| SMTP GoDaddy/SecureServer | Emails transacionais quando configurado |

## Regras de arquitetura

- API nao deve concentrar logica de provider dentro de handlers quando a complexidade crescer; extrair para `apps/api/src/lib/`.
- Worker deve separar orquestracao de fila e clientes de provider.
- Shared deve conter contratos e tipos, nao regras especificas de UI/API.
- Toda mudanca de contrato deve atualizar produtor, consumidor, docs e testes.
