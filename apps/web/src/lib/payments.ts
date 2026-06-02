export type TopUpMethod = "pix" | "credit_card";

function parsePositiveNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const PIX_MIN_TOP_UP_BRL = parsePositiveNumber(
  import.meta.env.VITE_PIX_MIN_AMOUNT,
  10
);

export const CARD_MIN_TOP_UP_BRL = parsePositiveNumber(
  import.meta.env.VITE_CARD_MIN_AMOUNT,
  15
);

export function getTopUpMinimumAmount(method: TopUpMethod) {
  return method === "credit_card" ? CARD_MIN_TOP_UP_BRL : PIX_MIN_TOP_UP_BRL;
}

export function getProviderStatusDetailLabel(statusDetail?: string | null) {
  switch (statusDetail) {
    case "cc_rejected_high_risk":
      return "Pagamento recusado pela análise de risco do Mercado Pago. Em testes, use credenciais de teste e cartões de teste do provedor. Em produção, tente outro cartão ou PIX.";
    case "cc_rejected_insufficient_amount":
      return "Pagamento recusado por saldo ou limite insuficiente no cartão.";
    case "cc_rejected_bad_filled_card_number":
      return "Número do cartão inválido. Revise os dados e tente novamente.";
    case "cc_rejected_bad_filled_date":
      return "Validade do cartão inválida. Revise mês e ano.";
    case "cc_rejected_bad_filled_security_code":
      return "Código de segurança inválido. Revise o CVV.";
    case "cc_rejected_bad_filled_other":
      return "Algum dado do cartão está incorreto. Revise as informações e tente novamente.";
    case "cc_rejected_call_for_authorize":
      return "O banco emissor pediu autorização adicional. Entre em contato com o banco ou tente outro cartão.";
    case "cc_rejected_card_disabled":
      return "O cartão está desabilitado para este tipo de compra.";
    case "cc_rejected_duplicated_payment":
      return "Já existe uma tentativa semelhante recente. Aguarde alguns minutos ou use outro método.";
    case "cc_rejected_max_attempts":
      return "Muitas tentativas foram feitas com este cartão. Aguarde antes de tentar novamente.";
    case "cc_rejected_other_reason":
      return "O Mercado Pago recusou o pagamento. Tente outro cartão ou use PIX.";
    case "accredited":
      return "Pagamento aprovado e creditado.";
    case "pending_contingency":
      return "Pagamento em análise pelo Mercado Pago. A carteira será atualizada quando houver confirmação.";
    case "pending_review_manual":
      return "Pagamento em revisão manual pelo Mercado Pago.";
    default:
      return statusDetail ?? null;
  }
}
