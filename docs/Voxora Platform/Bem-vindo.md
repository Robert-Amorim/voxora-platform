# Voxora Platform — Bem-vindo

Este e o ponto de entrada para agentes e pessoas que vao trabalhar no Voxora.

O Voxora e uma plataforma SaaS de transcricao com frontend web, API, worker de processamento, carteira de creditos, pagamentos, suporte/admin e integracoes de infraestrutura em Oracle Cloud.

## Como navegar

| Documento | Finalidade |
|---|---|
| `Status Atual do Projeto.md` | Estado real do produto, camadas implementadas e pendencias conhecidas |
| `Arquitetura do Sistema.md` | Visao da arquitetura, fluxos principais e responsabilidades por camada |
| `Frontend e Design System.md` | Rotas, paginas, componentes e padroes visuais do `apps/web` |
| `Backend, Worker e Integracoes.md` | API, Prisma, BullMQ, OpenAI, pagamentos, storage e contratos |
| `Ferramentas e Operacao.md` | Comandos, deploy, ambiente, runbooks e validacoes |

## Repositorio

```text
.
├─ apps/
│  ├─ web/                 # React + Vite + Tailwind
│  ├─ api/                 # Fastify + Prisma + JWT
│  ├─ worker/              # BullMQ + OpenAI + artefatos
│  └─ diarizer/            # servico auxiliar Python para diarizacao
├─ packages/
│  └─ shared/              # contratos compartilhados
├─ docs/
│  ├─ Voxora Platform/     # documentacao operacional principal
│  ├─ design/              # referencias visuais
│  ├─ infra/               # runbooks de producao
│  ├─ plan/                # historico e checkpoints
│  └─ release/             # rollback e release
├─ infra/                  # NGINX e templates de deploy
├─ scripts/                # smoke, ops, testes e utilitarios
└─ package.json            # scripts do workspace
```

## Ordem recomendada para qualquer tarefa

1. Ler `AGENTS.md`.
2. Ler `Status Atual do Projeto.md`.
3. Ler o documento da area afetada.
4. Conferir o codigo real em `apps/`, `packages/`, `infra/` ou `scripts/`.
5. Fazer a menor mudanca segura.
6. Validar com comandos do workspace.
7. Atualizar a documentacao afetada.

## Fontes de verdade

- Codigo em `apps/` e `packages/` e a fonte mais confiavel do comportamento atual.
- `docs/plan/` registra historico, planejamento e checkpoints.
- `docs/infra/` registra operacao de servidor, Load Balancer, Redis, reboot e rollback.
- `.env.example` e `docs/ENV_PRODUCTION.md` registram variaveis de ambiente.

## Comandos essenciais

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run gate:pr
```

## Regra de continuidade

Se encontrar divergencia entre documento e codigo, atualize a documentacao ou registre a pendencia antes de seguir. O objetivo e manter o Voxora tao facil de retomar quanto o PowerLabFit.
