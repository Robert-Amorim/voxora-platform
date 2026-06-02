import { useEffect, useMemo, useRef, useState } from "react";
import {
  getBrowserNotificationPermission,
  getTranscriptionNotificationPreference,
  hasSentTranscriptionNotification,
  markTranscriptionNotificationSent,
  requestBrowserNotificationPermission,
  setTranscriptionNotificationPreference,
  showBrowserNotification,
  supportsBrowserNotifications
} from "../../lib/browser-notifications";
import {
  PROCESSING_STATUSES,
  getTranscriptionEtaInfo
} from "../../lib/transcriptions";
import type { TranscriptionJobDetail } from "../../lib/types";

type TranscriptionProgressNoticeProps = {
  job: TranscriptionJobDetail;
  fileName: string;
};

function getPermissionLabel(permission: NotificationPermission | "unsupported") {
  switch (permission) {
    case "granted":
      return "Avisos do navegador ativados";
    case "denied":
      return "Avisos do navegador bloqueados";
    case "default":
      return "Ative avisos quando a transcrição terminar";
    case "unsupported":
    default:
      return "Seu navegador não oferece este tipo de aviso";
  }
}

function getPermissionHelper(permission: NotificationPermission | "unsupported") {
  switch (permission) {
    case "granted":
      return "Você pode sair da página e continuar outras atividades. Avisaremos assim que o processamento terminar.";
    case "denied":
      return "O navegador bloqueou as notificações. Se quiser, reative essa permissão nas configurações do navegador.";
    case "default":
      return "Permita uma notificação local para ser avisado quando o arquivo estiver pronto.";
    case "unsupported":
    default:
      return "Mantenha esta aba aberta para acompanhar o andamento automaticamente.";
  }
}

export default function TranscriptionProgressNotice({
  job,
  fileName
}: TranscriptionProgressNoticeProps) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    getBrowserNotificationPermission()
  );
  const [prefersNotifications, setPrefersNotifications] = useState(
    getTranscriptionNotificationPreference()
  );
  const [permissionFeedback, setPermissionFeedback] = useState("");
  const previousStatusRef = useRef(job.status);

  const etaInfo = useMemo(() => getTranscriptionEtaInfo(job), [job]);
  const isInFlight = PROCESSING_STATUSES.includes(job.status);
  const shouldRender = isInFlight || permission === "granted" || permission === "default";

  useEffect(() => {
    setPermission(getBrowserNotificationPermission());
  }, []);

  useEffect(() => {
    if (!supportsBrowserNotifications()) {
      return;
    }

    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = job.status;

    if (
      previousStatus === job.status ||
      (job.status !== "completed" && job.status !== "failed") ||
      !prefersNotifications ||
      permission !== "granted" ||
      hasSentTranscriptionNotification(job.id, job.status, job.updatedAt)
    ) {
      return;
    }

    const title =
      job.status === "completed"
        ? "Transcrição concluída"
        : "Transcrição interrompida";
    const body =
      job.status === "completed"
        ? `${fileName} já está pronto para revisão e download.`
        : `${fileName} precisa da sua atenção. Abra a transcrição para ver o motivo.`;

    showBrowserNotification({
      title,
      body,
      tag: `voxora-transcription-${job.id}`,
      onClickUrl:
        job.status === "completed"
          ? `/transcricoes/${job.id}/resultado`
          : `/transcricoes/${job.id}`
    });
    markTranscriptionNotificationSent(job.id, job.status, job.updatedAt);
  }, [fileName, job, permission, prefersNotifications]);

  async function handleEnableNotifications() {
    const nextPermission = await requestBrowserNotificationPermission();
    setPermission(nextPermission);

    if (nextPermission === "granted") {
      setTranscriptionNotificationPreference(true);
      setPrefersNotifications(true);
      setPermissionFeedback("Avisos ativados. Você será notificado quando a transcrição terminar.");
      return;
    }

    setTranscriptionNotificationPreference(false);
    setPrefersNotifications(false);
    setPermissionFeedback(
      nextPermission === "denied"
        ? "As notificações foram bloqueadas no navegador."
        : "A permissão não foi concedida."
    );
  }

  function handleDisableNotifications() {
    setTranscriptionNotificationPreference(false);
    setPrefersNotifications(false);
    setPermissionFeedback("Os avisos locais foram desativados para esta sessão da Voxora.");
  }

  if (!shouldRender) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4 dark:bg-primary/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">
            Acompanhamento inteligente
          </p>
          <p className="font-body text-sm font-semibold text-slate-800 dark:text-slate-100">
            {etaInfo?.headline ?? "O status será atualizado automaticamente por aqui."}
          </p>
          <p className="font-body text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {etaInfo?.helper ??
              "Você pode seguir com outras atividades enquanto a Voxora conclui o processamento em segundo plano."}
          </p>
          <p className="font-body text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {getPermissionHelper(permission)}
          </p>
        </div>

        <div className="min-w-[260px] rounded-xl border border-slate-200 bg-white/80 p-4 dark:border-slate-800 dark:bg-slate-900/70">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            Notificação
          </p>
          <p className="mt-2 font-body text-sm font-semibold text-slate-800 dark:text-slate-100">
            {getPermissionLabel(permission)}
          </p>
          <p className="mt-1 font-body text-xs text-slate-500 dark:text-slate-400">
            {permission === "granted" && prefersNotifications
              ? "Ao concluir, abriremos um aviso local no navegador mesmo se você estiver em outra aba."
              : "Ative um aviso no navegador para não precisar esperar nesta página."}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {permission === "default" ? (
              <button
                type="button"
                onClick={() => void handleEnableNotifications()}
                className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90"
              >
                Ativar aviso no navegador
              </button>
            ) : null}

            {permission === "granted" && prefersNotifications ? (
              <button
                type="button"
                onClick={handleDisableNotifications}
                className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Desativar avisos
              </button>
            ) : null}
          </div>

          {permissionFeedback ? (
            <p className="mt-3 font-body text-xs text-slate-500 dark:text-slate-400">
              {permissionFeedback}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
