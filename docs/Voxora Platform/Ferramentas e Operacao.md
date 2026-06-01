# Ferramentas e Operacao

## Requisitos

| Item | Versao/uso |
|---|---|
| Node.js | 22+ |
| npm workspaces | Gerenciamento do monorepo |
| MySQL | Banco principal |
| Redis | Fila/cache BullMQ |
| FFmpeg | Processamento de audio/chunking |
| PM2 | Processos em producao |
| NGINX | Proxy/static na VM |
| OCI | Load Balancer, DNS e Object Storage |

## Setup local

```bash
npm install
cp .env.example .env
npm run typecheck
```

Subir desenvolvimento completo:

```bash
npm run dev
```

Subir por workspace:

```bash
npm run dev --workspace @voxora/web
npm run dev --workspace @voxora/api
npm run dev --workspace @voxora/worker
```

## Build e qualidade

```bash
npm run lint
npm run typecheck
npm run build
npm run test:unit
npm run smoke
npm run gate:pr
```

Scripts de smoke:
- `npm run smoke:artifacts`
- `npm run smoke:contracts`
- `npm run smoke:e2e`
- `npm run smoke:post-reboot`
- `npm run smoke:post-reboot:e2e`

## Prisma

```bash
npm run prisma:generate --workspace @voxora/api
npm run prisma:migrate --workspace @voxora/api
npm run prisma:studio --workspace @voxora/api
```

## Operacao em producao

Runbooks principais:
- `docs/infra/OCI_MULTIAPP_LB_RUNBOOK.md`
- `docs/infra/REBOOT_CHECKLIST.md`
- `docs/infra/REDIS_UPGRADE_RUNBOOK.md`
- `docs/infra/MERCADO_PAGO_SANDBOX_WEBHOOK.md`
- `docs/release/ROLLBACK_PLAN.md`

Checklist pos-reboot:

```bash
uptime
systemctl is-active nginx
systemctl is-active pm2-ubuntu
pm2 list
sudo nginx -t
curl -skI https://voxora.integraretech.com.br/
curl -skI https://voxora.integraretech.com.br/health
```

## Deploy multiapp

O Voxora roda atras do OCI Load Balancer compartilhado.

Estado operacional atual:
- DNS em Oracle;
- LB publico `147.15.35.30`;
- NGINX na VM;
- processos locais via PM2;
- certificado SAN multi-host no listener HTTPS.

Consultar:

```bash
docs/infra/OCI_MULTIAPP_LB_RUNBOOK.md
```

## Certificados SSL

Estado atual em 2026-06-01:
- certificado Let's Encrypt SAN `integraretech-multiapp`;
- cobre `agora7app`, `powerlabfit`, `voxora` e subdominios API/admin relevantes;
- renovacao automatizada via Certbot hooks na VM;
- certificado importado no OCI Load Balancer.

Diretorio operacional dos hooks:

```text
/srv/apps/letsencrypt-oci-hooks/
```

Antes de adicionar novo hostname HTTPS:
1. criar DNS na Oracle;
2. garantir roteamento no LB/NGINX;
3. emitir ou renovar certificado incluindo o novo hostname;
4. importar/ativar no LB;
5. validar com `openssl s_client` e `curl`.

## Redis e fila

Validar Redis:

```bash
redis-cli -h 127.0.0.1 -p 6379 ping
redis-cli -h 127.0.0.1 -p 6379 --scan --pattern 'bull:transcriptions*' | sed -n '1,40p'
```

Filas esperadas:
- `transcriptions`
- `transcriptions.dlq`

## PM2

Processos esperados em producao:
- API Voxora;
- worker Voxora;
- frontend servido como build estatico via NGINX, nao como Vite preview.

Comandos:

```bash
pm2 list
pm2 logs --lines 100 --nostream
pm2 save
```

## Diagnostico rapido

1. `curl /health` falha:
   - verificar PM2 API;
   - verificar NGINX;
   - verificar variaveis e banco.
2. Jobs ficam parados:
   - verificar Redis;
   - verificar PM2 worker;
   - verificar logs e DLQ.
3. Upload/download falha:
   - verificar `OCI_*` ou storage local;
   - verificar permissao e TTL de URL.
4. Pagamento nao credita:
   - verificar webhook Mercado Pago;
   - verificar idempotencia e ledger;
   - verificar secrets.
5. SSL alerta no navegador:
   - validar SAN do certificado;
   - verificar listener HTTPS do OCI LB;
   - conferir DNS do hostname.
