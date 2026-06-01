# Voxora — Guia Operacional (Agentes)

**Projeto:** Voxora Platform
**Dominio:** plataforma SaaS de transcricao, carteira/creditos, pagamentos e suporte operacional
**Fontes de verdade:** `docs/Voxora Platform/`, `docs/plan/`, `docs/infra/`, codigo em `apps/` e contratos em `packages/shared/`

---

## Protocolo Obrigatorio — SEMPRE seguir esta ordem

### 1. Ler antes de fazer

Antes de qualquer acao — gerar codigo, propor mudanca, editar arquivo ou rodar migracao — ler obrigatoriamente:

1. `docs/Voxora Platform/Bem-vindo.md` — ponto de entrada da documentacao
2. `docs/Voxora Platform/Status Atual do Projeto.md` — estado real vs. historico/plano
3. O documento especifico da area da tarefa:
   - frontend: `docs/Voxora Platform/Frontend e Design System.md`
   - backend/worker/dados: `docs/Voxora Platform/Backend, Worker e Integracoes.md`
   - operacao/deploy: `docs/Voxora Platform/Ferramentas e Operacao.md`
   - arquitetura: `docs/Voxora Platform/Arquitetura do Sistema.md`

Se houver duvida sobre o estado real: **conferir o codigo**, nao assumir pela documentacao.

### 2. Conferir o codigo

Examinar arquivos reais antes de assumir comportamento.

Localizacoes criticas:
- Frontend: `apps/web/src/`
- API: `apps/api/src/index.ts`
- Worker: `apps/worker/src/`
- Contratos compartilhados: `packages/shared/src/index.ts`
- Banco/Prisma: `apps/api/prisma/schema.prisma`
- Infra e deploy: `infra/`, `scripts/ops/`, `docs/infra/`
- Variaveis de ambiente: `.env.example`, `docs/ENV_PRODUCTION.md`

### 3. Usar skills quando aplicavel

Skills locais disponiveis:
- `project-standards`: usar para implementar, revisar ou planejar mudancas em `apps/api`, `apps/worker`, `apps/web`, `packages/shared`, scripts ou configs.
- `design-system-workflow`: usar ao criar/alterar UI, paginas, componentes ou padroes visuais em `apps/web` e `docs/design`.
- `pr-release-gate`: usar antes de merge, release ou deploy.

Ordem recomendada:
- Backend/shared: `project-standards`
- Frontend/design: `project-standards` e depois `design-system-workflow`
- Merge/release/deploy: `pr-release-gate` apos as demais validacoes

### 4. Executar a menor mudanca segura

So executar depois das etapas 1, 2 e 3.

Regras:
- preferir mudancas localizadas a reescritas amplas;
- manter compatibilidade de contratos sempre que possivel;
- se payload/API mudar, atualizar produtor, consumidor e `packages/shared` no mesmo ciclo;
- nao colocar logica especifica de app em `packages/shared`;
- credenciais ficam apenas em `.env`/ambiente, nunca no repositorio.

### 5. Inspecionar o alvo antes de escrever testes

Antes de criar ou corrigir testes, ler o alvo real:
- paginas/componentes renderizados;
- textos, roles, labels e seletores reais;
- rotas HTTP e schemas envolvidos;
- estados de job/carteira/transcricao;
- comportamento de fila e efeitos persistidos.

Para testes de backend/worker, conferir DTOs, schema Prisma, contratos compartilhados e transacoes antes de montar fixtures.

### 6. Validar

Checks minimos para handoff de codigo:

```bash
npm run typecheck
npm run build
```

Quando aplicavel:

```bash
npm run lint
npm run test:unit
npm run smoke
npm run gate:pr
```

Para mudancas operacionais/deploy, validar tambem os runbooks relevantes em `docs/infra/` e os scripts de smoke em `scripts/ops/`.

### 7. Registrar o que foi feito

Ao concluir tarefa relevante, atualizar:
- `docs/Voxora Platform/Status Atual do Projeto.md`
- documento da area correspondente em `docs/Voxora Platform/`
- documentos especificos existentes em `docs/infra/`, `docs/plan/` ou `docs/release/`, se forem afetados
- este `AGENTS.md`, se o protocolo ou estrutura base mudar

> Sem registro = tarefa incompleta. O registro e parte da entrega.

---

## Infraestrutura e Operacao

| Recurso | Detalhe |
|---|---|
| Monorepo | Node.js/TypeScript com workspaces npm |
| Frontend | `apps/web` — React 19, Vite, React Router e Tailwind |
| API | `apps/api` — Fastify, Prisma, JWT, Mercado Pago e Object Storage |
| Worker | `apps/worker` — BullMQ, OpenAI transcription, chunking, diarizacao e artefatos |
| Compartilhado | `packages/shared` — status, tipos e contratos transversais |
| Banco | MySQL via Prisma |
| Fila/cache | Redis + BullMQ |
| Deploy atual | Oracle VM + NGINX + PM2 + OCI Load Balancer |
| Dominio publico | `voxora.integraretech.com.br` |
| Runbooks | `docs/infra/OCI_MULTIAPP_LB_RUNBOOK.md`, `docs/infra/REBOOT_CHECKLIST.md`, `docs/infra/REDIS_UPGRADE_RUNBOOK.md` |

---

## Estado Atual do Projeto

| Camada | Status |
|---|---|
| `apps/web` | Implementado — landing, auth, dashboard, transcricoes, carteira, suporte e admin |
| `apps/api` | Implementado — auth, usuarios, jobs, pagamentos, webhooks, suporte, admin, uploads e downloads |
| `apps/worker` | Implementado — processamento BullMQ, OpenAI, chunking, diarizacao opcional, DLQ e limpeza |
| `packages/shared` | Implementado — contratos centrais de status, formatos e extensoes aceitas |
| Infra | Em producao — OCI LB, NGINX, PM2, Redis, MySQL e SSL SAN multi-host |
| Qualidade | Gate disponivel — `npm run gate:pr`; estado exato deve ser validado no ciclo da tarefa |

---

## Regra de Ouro

Quando houver conflito entre documentacao, planejamento e codigo:
- **Codigo implementado** prevalece sobre documentacao desatualizada
- **Documentos de plano/checkpoint** explicam historico e intencao, nao garantem estado atual
- **Documentacao operacional** deve refletir a realidade observada — corrigir antes de avancar

---

## Contrato de resposta para agentes

Ao finalizar trabalho de codigo ou operacao, incluir:
- `Scope touched`
- `Contract impact`
- `Checks executed`
- `Changed files`
- `Residual risks`
