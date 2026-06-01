# Frontend e Design System

## Stack

| Item | Detalhe |
|---|---|
| App | `apps/web` |
| Framework | React 19 |
| Build | Vite |
| Rotas | React Router |
| Estilo | Tailwind + CSS global |
| API client | `apps/web/src/lib/api.ts` |

## Rotas principais

As rotas estao declaradas em `apps/web/src/App.tsx`.

| Rota | Pagina | Protecao |
|---|---|---|
| `/` | `HomePage` | Publica |
| `/login` | `LoginPage` | Publica |
| `/contato` | `ContactPage` | Publica |
| `/verificar-email` | `VerifyEmailPage` | Publica |
| `/redefinir-senha` | `ResetPasswordPage` | Publica |
| `/dashboard` | `DashboardPage` | `ProtectedRoute` |
| `/perfil` | `ProfilePage` | `ProtectedRoute` |
| `/suporte` | `SupportPage` | `ProtectedRoute` |
| `/transcricoes` | `TranscricoesPage` | `ProtectedRoute` |
| `/transcricoes/nova` | `NewTranscriptionPage` | `ProtectedRoute` |
| `/transcricoes/:id` | `TranscriptionDetailPage` | `ProtectedRoute` |
| `/transcricoes/:id/resultado` | `TranscriptionResultPage` | `ProtectedRoute` |
| `/carteira` | `CarteiraPage` | `ProtectedRoute` |
| `/admin/*` | Admin/support pages | `RoleProtectedRoute` |

## Organizacao de UI

```text
apps/web/src/
├─ components/
│  ├─ admin/
│  ├─ common/
│  ├─ dashboard/
│  └─ landing/
├─ lib/
├─ pages/
└─ styles/
```

Areas importantes:
- `components/landing`: marketing/home.
- `components/dashboard`: dashboard, jobs, carteira e paineis.
- `components/admin`: shell e navegacao admin.
- `lib/session.ts`: sessao/token.
- `lib/transcriptions.ts`: chamadas de transcricao.
- `lib/payments.ts`: chamadas de pagamento/carteira.
- `styles/globals.css`: base visual global.

## Fluxos principais

1. Visitante acessa landing.
2. Usuario cria conta/login.
3. Usuario verifica email quando exigido.
4. Usuario adiciona credito via carteira.
5. Usuario cria transcricao e acompanha status.
6. Usuario acessa resultado/download.
7. Usuario abre suporte se necessario.
8. Admin/support gerencia tickets e usuarios.

## Regras para alteracoes de UI

- Usar `design-system-workflow` quando a tarefa envolver componentes, paginas ou visual.
- Conferir o HTML/design em `docs/design/` quando relevante.
- Antes de escrever teste, confirmar texto/label/role no componente real.
- Preservar responsividade e estados: loading, vazio, erro, sucesso e permissao.
- Evitar strings duplicadas quando ja houver helper ou contrato em `lib/`.

## Checks recomendados

```bash
npm run typecheck --workspace @voxora/web
npm run build --workspace @voxora/web
npm run lint --workspace @voxora/web
```

Para mudancas com contrato API:

```bash
npm run typecheck
npm run build
```

## Pontos de atencao

- Rotas admin usam `RoleProtectedRoute` com roles `support` e `admin`.
- O frontend depende de `VITE_API_BASE_URL`.
- Mercado Pago no frontend depende de `VITE_MERCADO_PAGO_PUBLIC_KEY`.
- Mudancas em upload/transcricao geralmente exigem revisar API, worker e shared.
