import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import CreditManagementPanel from "../components/dashboard/CreditManagementPanel";
import DashboardSidebar from "../components/dashboard/DashboardSidebar";
import LedgerPanel from "../components/dashboard/LedgerPanel";
import {
  ApiError,
  createCardPayment,
  getErrorMessage,
  getMe,
  getWallet,
  listPayments,
  listWalletLedger
} from "../lib/api";
import {
  CARD_MIN_TOP_UP_BRL,
  getProviderStatusDetailLabel
} from "../lib/payments";
import { clearSessionTokens, getSessionTokens } from "../lib/session";
import { formatCurrency, formatEstimatedMinutes, formatPricePerMinuteLabel } from "../lib/transcriptions";
import type {
  PaymentSummary,
  PublicUser,
  WalletLedgerEntry,
  WalletSummary
} from "../lib/types";

type LoadState = "loading" | "ready" | "error";
type FeedbackTone = "neutral" | "success" | "error";

const LEDGER_PAGE_SIZE = 10;

export default function CarteiraPage() {
  const navigate = useNavigate();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [user, setUser] = useState<PublicUser | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerHasMore, setLedgerHasMore] = useState(false);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  const [topUpAmountInput, setTopUpAmountInput] = useState("20");
  const [isCreatingCardPayment, setIsCreatingCardPayment] = useState(false);
  const [isRefreshingData, setIsRefreshingData] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>("neutral");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasPendingPayments = useMemo(
    () => payments.some((p) => p.status === "pending"),
    [payments]
  );

  const syncPaymentsState = useCallback((items: PaymentSummary[]) => {
    setPayments(items);
  }, []);

  const setFeedback = useCallback((tone: FeedbackTone, message: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedbackTone(tone);
    setFeedbackMessage(message);
    if (tone !== "neutral") {
      feedbackTimer.current = setTimeout(() => setFeedbackMessage(""), 6000);
    }
  }, []);

  const loadPage = useCallback(
    async (options?: { isRefresh?: boolean; ledgerPageOverride?: number }) => {
      if (!options?.isRefresh) setLoadState("loading");
      else setIsRefreshingData(true);
      setLoadError("");

      const ledgerPageNum = options?.ledgerPageOverride ?? ledgerPage;

      try {
        const [currentUser, currentWallet, currentLedger, currentPayments] = await Promise.all([
          getMe(),
          getWallet(),
          listWalletLedger({ limit: LEDGER_PAGE_SIZE, offset: ledgerPageNum * LEDGER_PAGE_SIZE }),
          listPayments({ limit: 6 })
        ]);

        setUser(currentUser);
        setWallet(currentWallet);
        setLedger(currentLedger.items);
        setLedgerTotal(currentLedger.total ?? 0);
        setLedgerHasMore(currentLedger.hasMore ?? false);
        syncPaymentsState(currentPayments.items);
        setLoadState("ready");
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }
        setLoadError(getErrorMessage(error, "Não foi possível carregar a carteira."));
        setLoadState("error");
      } finally {
        setIsRefreshingData(false);
      }
    },
    [navigate, ledgerPage, syncPaymentsState]
  );

  const refreshPaymentStatus = useCallback(async () => {
    try {
      const currentPayments = await listPayments({ limit: 6 });
      const previousPendingIds = new Set(
        payments.filter((p) => p.status === "pending").map((p) => p.id)
      );
      syncPaymentsState(currentPayments.items);

      const resolved = currentPayments.items.filter(
        (p) => previousPendingIds.has(p.id) && p.status !== "pending"
      );
      if (!resolved.some((p) => p.status === "approved")) return;

      const [currentWallet, currentLedger] = await Promise.all([
        getWallet(),
        listWalletLedger({ limit: LEDGER_PAGE_SIZE, offset: ledgerPage * LEDGER_PAGE_SIZE })
      ]);
      setWallet(currentWallet);
      setLedger(currentLedger.items);
      setLedgerTotal(currentLedger.total ?? 0);
      setLedgerHasMore(currentLedger.hasMore ?? false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        clearSessionTokens();
        navigate("/login", { replace: true });
      }
    }
  }, [ledgerPage, navigate, payments, syncPaymentsState]);

  const handleLedgerPageChange = useCallback(
    (page: number) => {
      setLedgerPage(page);
      void loadPage({ isRefresh: true, ledgerPageOverride: page });
    },
    [loadPage]
  );

  const handleCreateCardPayment = useCallback(
    async (payload: {
      amount: number;
      token: string;
      issuerId?: string;
      paymentMethodId: string;
      paymentMethodOptionId?: string;
      processingMode?: string;
      installments: number;
      payer: { email: string; identification?: { type: string; number: string } };
      cardholderName?: string;
      paymentTypeId?: string;
      lastFourDigits?: string;
    }) => {
      if (payload.amount < CARD_MIN_TOP_UP_BRL) {
        setFeedback("error", `O valor minimo para cartao e ${formatCurrency(CARD_MIN_TOP_UP_BRL.toFixed(2))}.`);
        return;
      }
      setIsCreatingCardPayment(true);
      setFeedback("neutral", "Processando pagamento com cartão...");
      try {
        const created = await createCardPayment(payload);
        const status = created.payment.status;
        if (status === "approved") {
          setFeedback("success", "Pagamento aprovado. Os créditos já foram adicionados na sua carteira.");
        } else if (status === "pending") {
          setFeedback("neutral", "Pagamento enviado. Vamos acompanhar a confirmação automaticamente.");
        } else if (status === "rejected") {
          setFeedback(
            "error",
            getProviderStatusDetailLabel(created.payment.statusDetail) ||
              "O pagamento com cartão foi recusado. Revise os dados e tente novamente."
          );
        } else {
          setFeedback("error", "O pagamento com cartão expirou antes da confirmação. Tente novamente.");
        }
        await loadPage({ isRefresh: true });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          clearSessionTokens();
          navigate("/login", { replace: true });
          return;
        }
        setFeedback("error", getErrorMessage(error, "Falha ao processar pagamento com cartão."));
      } finally {
        setIsCreatingCardPayment(false);
      }
    },
    [loadPage, navigate, setFeedback]
  );

  useEffect(() => {
    if (!getSessionTokens()) {
      navigate("/login", { replace: true });
      return;
    }
    void loadPage();
  }, [loadPage, navigate]);

  useEffect(() => {
    if (!hasPendingPayments) return;
    const timer = setInterval(() => void refreshPaymentStatus(), 5000);
    return () => clearInterval(timer);
  }, [hasPendingPayments, refreshPaymentStatus]);

  const availableBalance = wallet ? formatCurrency(wallet.availableBalance) : "--";
  const availableBalanceEstimate = wallet
    ? formatEstimatedMinutes(wallet.availableBalance)
    : "--";

  return (
    <main className="font-body text-slate-900 antialiased dark:text-slate-100">
      <div className="flex min-h-screen flex-col bg-background-light dark:bg-background-dark lg:h-screen lg:flex-row lg:overflow-hidden">
        <DashboardSidebar user={user} activeMenu="wallet" />

        <section className="flex min-w-0 flex-1 flex-col lg:overflow-hidden">
          <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-background-dark/50 sm:px-6 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:py-0">
            <h2 className="font-display text-xl font-bold tracking-tight">Carteira</h2>
            {loadState === "ready" && (
              <div className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-4 py-2 dark:border-slate-700 sm:w-auto">
                <span className="material-symbols-outlined text-[16px] text-primary">account_balance_wallet</span>
                <div className="flex flex-col">
                  <span className="font-mono text-sm font-bold">{availableBalance}</span>
                  <span className="font-body text-xs text-slate-500">
                    Cerca de {availableBalanceEstimate} no preço atual de {formatPricePerMinuteLabel()}/min
                  </span>
                </div>
              </div>
            )}
          </header>

          {loadState === "loading" && (
            <div className="flex flex-1 items-center justify-center">
              <p className="font-body text-sm text-slate-500">Carregando...</p>
            </div>
          )}

          {loadState === "error" && (
            <div className="flex flex-1 items-center justify-center">
              <p className="font-body text-sm text-red-500">{loadError}</p>
            </div>
          )}

          {loadState === "ready" && (
            <div className="flex-1 p-4 sm:p-6 lg:overflow-y-auto lg:p-8">
              <div className="grid gap-6 xl:grid-cols-12">
                <div className="space-y-6 xl:col-span-7">
                  <section className="rounded-2xl border border-primary/20 bg-primary/10 p-5 dark:bg-primary/5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-display text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                          Próxima ação
                        </p>
                        <h3 className="mt-2 font-display text-xl font-black">
                          Adicione créditos para iniciar transcrições
                        </h3>
                        <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                          Pague com cartão de crédito. Assim que o pagamento for aprovado,
                          o saldo aparece aqui e a transcrição já pode ser enviada.
                        </p>
                      </div>
                      <a
                        href="#creditos"
                        className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-primary/90"
                      >
                        Recarregar agora
                      </a>
                    </div>
                  </section>
                  <LedgerPanel
                    ledger={ledger}
                    total={ledgerTotal}
                    hasMore={ledgerHasMore}
                    currentPage={ledgerPage}
                    onPageChange={handleLedgerPageChange}
                    pageSize={LEDGER_PAGE_SIZE}
                  />
                </div>
                <div className="xl:col-span-5" id="creditos">
                  <CreditManagementPanel
                    amountInput={topUpAmountInput}
                    onAmountInputChange={setTopUpAmountInput}
                    onCreateCardPayment={handleCreateCardPayment}
                    payerEmail={user?.email ?? null}
                    isCreatingCardPayment={isCreatingCardPayment}
                    isRefreshingData={isRefreshingData}
                    payments={payments}
                    feedbackMessage={feedbackMessage}
                    feedbackTone={feedbackTone}
                  />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
