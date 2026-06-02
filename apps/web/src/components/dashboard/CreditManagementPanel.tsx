import { useEffect, useMemo, useState } from "react";
import MercadoPagoCardTopUpForm from "./MercadoPagoCardTopUpForm";
import {
  CARD_MIN_TOP_UP_BRL,
  getProviderStatusDetailLabel
} from "../../lib/payments";
import {
  formatCurrency,
  formatDateTime,
  formatEstimatedMinutes,
  formatPricePerMinuteLabel
} from "../../lib/transcriptions";
import type { PaymentSummary } from "../../lib/types";

type CreditManagementPanelProps = {
  amountInput: string;
  onAmountInputChange: (value: string) => void;
  onCreateCardPayment: (payload: {
    amount: number;
    token: string;
    issuerId?: string;
    paymentMethodId: string;
    paymentMethodOptionId?: string;
    processingMode?: string;
    installments: number;
    payer: {
      email: string;
      identification?: {
        type: string;
        number: string;
      };
    };
    cardholderName?: string;
    paymentTypeId?: string;
    lastFourDigits?: string;
  }) => Promise<void>;
  payerEmail: string | null;
  isCreatingCardPayment: boolean;
  isRefreshingData: boolean;
  payments: PaymentSummary[];
  feedbackMessage: string;
  feedbackTone: "neutral" | "success" | "error";
};

function formatTopUpAmount(amount: number) {
  return formatCurrency(amount.toFixed(2));
}

function getStatusLabel(status: PaymentSummary["status"]) {
  switch (status) {
    case "approved":
      return "Aprovado";
    case "rejected":
      return "Recusado";
    case "expired":
      return "Expirado";
    case "pending":
    default:
      return "Pendente";
  }
}

function isCancelledByUser(payment: Pick<PaymentSummary, "method" | "status" | "statusDetail">) {
  return (
    payment.method === "pix" &&
    payment.status === "rejected" &&
    payment.statusDetail === "Pagamento cancelado pelo usuário."
  );
}

function getDisplayStatusLabel(payment: Pick<PaymentSummary, "method" | "status" | "statusDetail">) {
  if (isCancelledByUser(payment)) {
    return "Cancelado";
  }
  return getStatusLabel(payment.status);
}

function getStatusClassName(status: PaymentSummary["status"]) {
  switch (status) {
    case "approved":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "rejected":
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
    case "expired":
      return "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
    case "pending":
    default:
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
  }
}

function getFeedbackClassName(tone: CreditManagementPanelProps["feedbackTone"]) {
  if (tone === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (tone === "error") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  return "border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300";
}

function getFeedbackIcon(tone: CreditManagementPanelProps["feedbackTone"]) {
  if (tone === "success") return "task_alt";
  if (tone === "error") return "error";
  return "sync";
}

function getPaymentMethodLabel(method: PaymentSummary["method"]) {
  return method === "credit_card" ? "Cartao" : "PIX";
}

function getStatusGuidance(payment: PaymentSummary, nowMs: number) {
  if (isCancelledByUser(payment)) {
    return "Este PIX foi cancelado e não deve mais ser pago. Gere um novo PIX se quiser continuar.";
  }

  if (payment.status === "approved") {
    return "Recarga concluida. Os créditos já devem estar disponíveis na carteira.";
  }

  if (payment.status === "rejected") {
    return (
      getProviderStatusDetailLabel(payment.statusDetail) ??
      "O provedor recusou o pagamento. Revise os dados e tente novamente."
    );
  }

  if (payment.status === "expired") {
    return payment.method === "pix"
      ? "O prazo do QR Code terminou. Gere um novo PIX para continuar."
      : "A tentativa expirou antes da confirmação do provedor.";
  }

  if (payment.method === "pix") {
    if (payment.expiresAt) {
      return `Aguardando pagamento. Restante: ${formatRemainingTime(payment.expiresAt, nowMs)}.`;
    }
    return "PIX gerado e aguardando pagamento.";
  }

  return (
    getProviderStatusDetailLabel(payment.statusDetail) ??
    "Pagamento enviado. Estamos aguardando a resposta final do Mercado Pago."
  );
}

function formatRemainingTime(expiresAt: string, nowMs: number) {
  const expiresAtMs = Date.parse(expiresAt);
  if (Number.isNaN(expiresAtMs)) {
    return "Prazo indisponivel";
  }

  const deltaMs = expiresAtMs - nowMs;
  if (deltaMs <= 0) {
    return "Expirado";
  }

  const totalSeconds = Math.floor(deltaMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  return `${minutes.toString().padStart(2, "0")}m ${seconds
    .toString()
    .padStart(2, "0")}s`;
}

export default function CreditManagementPanel({
  amountInput,
  onAmountInputChange,
  onCreateCardPayment,
  payerEmail,
  isCreatingCardPayment,
  isRefreshingData,
  payments,
  feedbackMessage,
  feedbackTone
}: CreditManagementPanelProps) {
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  const cardPayments = useMemo(
    () => payments.filter((payment) => payment.method === "credit_card"),
    [payments]
  );

  useEffect(() => {
    const preferredPaymentId = cardPayments[0]?.id ?? null;
    if (!preferredPaymentId) {
      setSelectedPaymentId(null);
      return;
    }

    if (!selectedPaymentId || !cardPayments.some((payment) => payment.id === selectedPaymentId)) {
      setSelectedPaymentId(preferredPaymentId);
    }
  }, [cardPayments, selectedPaymentId]);

  const parsedAmount = useMemo(() => {
    const parsed = Number.parseFloat(amountInput.replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [amountInput]);
  const selectedMinimumAmount = CARD_MIN_TOP_UP_BRL;

  const estimatedMinutesForTopUp = useMemo(() => {
    if (parsedAmount === null) {
      return null;
    }
    return formatEstimatedMinutes(parsedAmount);
  }, [parsedAmount]);

  const latestCardPayment = useMemo(
    () => cardPayments[0] ?? null,
    [cardPayments]
  );

  const selectedPayment = useMemo(() => {
    if (!selectedPaymentId) {
      return latestCardPayment;
    }

    return cardPayments.find((payment) => payment.id === selectedPaymentId) ?? latestCardPayment;
  }, [cardPayments, latestCardPayment, selectedPaymentId]);

  useEffect(() => {
    setSelectedPaymentId(latestCardPayment?.id ?? null);
  }, [latestCardPayment?.id]);

  return (
    <section
      id="creditos"
      className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-base font-bold">Gerenciamento de créditos</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Recarregue sua carteira com cartão de crédito pelo Mercado Pago.
          </p>
        </div>
        {isRefreshingData ? (
          <span className="text-xs text-slate-400">Atualizando...</span>
        ) : null}
      </div>

      <div className="rounded-lg border border-dashed border-slate-300 p-4 dark:border-slate-700">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Valor da recarga (BRL)
        </label>
        <div className="flex flex-col gap-2">
          <input
            type="number"
            min={selectedMinimumAmount}
            step="0.01"
            value={amountInput}
            onChange={(event) => onAmountInputChange(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800"
            placeholder="Ex.: 20.00"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
          <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-violet-700 dark:text-violet-200">
            Cartao minimo: {formatTopUpAmount(CARD_MIN_TOP_UP_BRL)}
          </span>
        </div>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-300">
          {parsedAmount !== null && parsedAmount < selectedMinimumAmount ? (
            <span>
              O minimo para{" "}
              <strong className="text-slate-900 dark:text-white">
                cartao
              </strong>{" "}
              e{" "}
              <strong className="text-slate-900 dark:text-white">
                {formatTopUpAmount(selectedMinimumAmount)}
              </strong>
              .
            </span>
          ) : estimatedMinutesForTopUp ? (
            <span>
              Esta recarga equivale a cerca de{" "}
              <strong className="text-slate-900 dark:text-white">{estimatedMinutesForTopUp}</strong>{" "}
              de transcrição no preço atual de{" "}
              <strong className="text-slate-900 dark:text-white">
                {formatPricePerMinuteLabel()}/min
              </strong>
              .
            </span>
          ) : (
            <span>Informe um valor para calcular a estimativa de minutos.</span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
        <span className="inline-flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">credit_card</span>
          Cartão de crédito
        </span>
      </div>

      {feedbackMessage ? (
        <div
          role={feedbackTone === "error" ? "alert" : "status"}
          aria-live={feedbackTone === "error" ? "assertive" : "polite"}
          className={`rounded-lg border px-3 py-3 text-sm ${getFeedbackClassName(feedbackTone)}`}
        >
          <div className="flex items-start gap-3">
            <span
              className={`material-symbols-outlined mt-0.5 text-[18px] ${
                feedbackTone === "neutral" ? "animate-spin" : ""
              }`}
            >
              {getFeedbackIcon(feedbackTone)}
            </span>
            <div>
              <p className="font-semibold">
                {feedbackTone === "success"
                  ? "Ação concluída"
                  : feedbackTone === "error"
                    ? "Atenção necessária"
                    : "Processando"}
              </p>
              <p className="mt-1">{feedbackMessage}</p>
            </div>
          </div>
        </div>
      ) : null}

      {selectedPayment ? (
        <article className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Status detalhado da recarga</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {getPaymentMethodLabel(selectedPayment.method)}
              </p>
            </div>
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getStatusClassName(selectedPayment.status)}`}
            >
              {getDisplayStatusLabel(selectedPayment)}
            </span>
          </div>

          <div className="grid gap-3 text-xs text-slate-500 dark:text-slate-400 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Resumo</p>
              <p className="mt-2">{formatCurrency(selectedPayment.amount)}</p>
              <p>Criado em {formatDateTime(selectedPayment.createdAt)}</p>
              {selectedPayment.expiresAt ? (
                <p>Expira em {formatDateTime(selectedPayment.expiresAt)}</p>
              ) : null}
              {selectedPayment.card?.lastFourDigits ? (
                <p>
                  Cartão final {selectedPayment.card.lastFourDigits}
                  {selectedPayment.card.installments
                    ? ` • ${selectedPayment.card.installments}x`
                    : ""}
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="font-semibold text-slate-700 dark:text-slate-200">Próximo passo</p>
              <p className="mt-2">{getStatusGuidance(selectedPayment, Date.now())}</p>
            </div>
          </div>
        </article>
      ) : null}

      <MercadoPagoCardTopUpForm
        amount={parsedAmount}
        minimumAmount={CARD_MIN_TOP_UP_BRL}
        payerEmail={payerEmail}
        isSubmitting={isCreatingCardPayment}
        onSubmit={onCreateCardPayment}
      />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h5 className="text-sm font-semibold">Últimos pagamentos</h5>
        </div>

        {cardPayments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 dark:border-slate-700">
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              Sem pagamentos ainda.
            </p>
            <p className="mt-1">
              Depois de pagar com cartão, cada tentativa aparece aqui com o status.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {cardPayments.map((payment) => (
              <button
                type="button"
                key={payment.id}
                onClick={() => setSelectedPaymentId(payment.id)}
                className={`w-full rounded-lg border px-3 py-3 text-left transition dark:border-slate-800 ${
                  selectedPayment?.id === payment.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">
                        {formatCurrency(payment.amount)}
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                        {getPaymentMethodLabel(payment.method)}
                      </span>
                    </div>
                    <p className="truncate text-[11px] text-slate-500">
                      {formatDateTime(payment.createdAt)}
                    </p>
                    {payment.method === "credit_card" && payment.card?.lastFourDigits ? (
                      <p className="truncate text-[11px] text-slate-500">
                        Final {payment.card.lastFourDigits}
                        {payment.card.paymentMethodId
                          ? ` • ${payment.card.paymentMethodId.toUpperCase()}`
                          : ""}
                        {payment.card.installments ? ` • ${payment.card.installments}x` : ""}
                      </p>
                    ) : null}
                    {payment.method === "pix" && payment.expiresAt ? (
                      <p className="truncate text-[11px] text-slate-500">
                        Prazo: {formatDateTime(payment.expiresAt)}
                      </p>
                    ) : null}
                    {payment.statusDetail ? (
                      <p className="truncate text-[11px] text-slate-500">{payment.statusDetail}</p>
                    ) : null}
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-semibold ${getStatusClassName(payment.status)}`}
                  >
                    {getDisplayStatusLabel(payment)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
