# Status Atual do Projeto

Data de referencia: 2026-06-01

Este documento resume o estado observado no repositorio e na operacao atual. Checkpoints antigos em `docs/plan/` continuam importantes para historico, mas este arquivo deve refletir o estado vivo do projeto.

## Resumo executivo

O Voxora esta em estado funcional de MVP avancado: frontend, API, worker, carteira, pagamentos, processamento de transcricoes, suporte/admin e deploy multiapp ja existem no codigo.

O dominio `voxora.integraretech.com.br` esta publicado via Oracle DNS/OCI Load Balancer, com certificado Let's Encrypt SAN multi-host ativo no listener HTTPS compartilhado.

## Estado por camada

| Camada | Status | Observacoes |
|---|---|---|
| `apps/web` | Implementado | Landing, login, recuperacao de senha, dashboard, transcricoes, carteira, suporte e admin |
| `apps/api` | Implementado | Fastify com auth, perfil, pagamentos, webhooks, uploads, jobs, suporte/admin e downloads |
| `apps/worker` | Implementado | BullMQ, audio preflight, OpenAI, chunking, diarizacao opcional, traducao, artefatos, DLQ e limpezas |
| `packages/shared` | Implementado | Status de job/pagamento, tipos de ledger, formatos e extensoes aceitas |
| Banco | Implementado | Prisma + MySQL; schema em `apps/api/prisma/schema.prisma` |
| Fila/cache | Implementado | Redis + BullMQ; fila principal `transcriptions`, DLQ `transcriptions.dlq` |
| Pagamentos | Implementado | Mercado Pago com modo mock/sandbox/producao via variaveis |
| Storage | Implementado | Oracle Object Storage opcional; fallback local em `storage/` |
| Infra | Em producao | Oracle VM, NGINX, PM2, OCI Load Balancer, DNS Oracle e SSL SAN |
| Qualidade | Disponivel | `npm run gate:pr`, testes unitarios, smoke de contratos/artefatos e smoke E2E |

## Frontend observado

Rotas principais em `apps/web/src/App.tsx`:

| Rota | Area |
|---|---|
| `/` | Home/landing |
| `/login` | Autenticacao |
| `/contato` | Contato |
| `/verificar-email` | Verificacao de email |
| `/redefinir-senha` | Recuperacao de senha |
| `/dashboard` | Area autenticada |
| `/perfil` | Perfil |
| `/suporte` | Suporte do usuario |
| `/transcricoes` | Lista de transcricoes |
| `/transcricoes/nova` | Novo job |
| `/transcricoes/:id` | Detalhe do job |
| `/transcricoes/:id/resultado` | Resultado |
| `/carteira` | Creditos e pagamentos |
| `/admin/*` | Suporte/admin por RBAC |

## Backend e worker observados

Funcionalidades presentes:
- auth com register/login/refresh/verificacao de email/reset de senha;
- perfil de usuario;
- dashboard e carteira;
- Mercado Pago e webhook idempotente;
- upload presign/validacao;
- criacao e processamento de jobs;
- transcricoes original/traduzida e artefatos TXT/SRT/PDF;
- suporte/tickets;
- admin de usuarios/tickets;
- worker com estrategias direct/chunked/diarized;
- audio preflight com otimizacao FFmpeg antes do envio ao provedor;
- DLQ apos falhas finais;
- limpeza de uploads brutos e outputs expirados.

## Infra atual

| Item | Estado |
|---|---|
| DNS autoritativo | Oracle DNS para `integraretech.com.br` |
| Load Balancer | `lb-prod-public`, IP `147.15.35.30` |
| Host publico | `voxora.integraretech.com.br` |
| SSL | Certificado SAN `integraretech-multiapp`, valido ate 2026-08-30 |
| Backend LB | VM privada `10.0.2.212:80`, health OK na ultima verificacao operacional |
| Runbook | `docs/infra/OCI_MULTIAPP_LB_RUNBOOK.md` e `docs/infra/REBOOT_CHECKLIST.md` |

## Validacoes principais

Comandos de qualidade:

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run smoke
npm run gate:pr
```

Smokes operacionais:

```bash
npm run smoke:post-reboot
npm run smoke:post-reboot:e2e
```

## Pendencias e pontos de atencao

- Rodar `npm run gate:pr` antes de qualquer handoff de codigo.
- Manter certificados renovados pela automacao Certbot/OCI criada na VM.
- Atualizar este documento sempre que rotas, contratos, variaveis ou operacao mudarem.
- Conferir se `api.powerlabfit.integraretech.com.br` retornando `404` e intencional no backend correspondente; nao e problema SSL.
- Migrar estrategia de certificados SAN para wildcard duplo pode reduzir manutencao no medio prazo.

## Regra de manutencao

Quando uma feature mudar de planejada para implementada, atualize este status, o documento da area e os runbooks afetados.
