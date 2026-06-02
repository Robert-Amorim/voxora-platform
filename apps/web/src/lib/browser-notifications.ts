const TRANSCRIPTION_NOTIFICATION_PREF_KEY = "voxora.transcription.notifications.enabled.v1";
const TRANSCRIPTION_NOTIFICATION_SENT_KEY = "voxora.transcription.notifications.sent.v1";

function hasWindow() {
  return typeof window !== "undefined";
}

export function supportsBrowserNotifications() {
  return hasWindow() && "Notification" in window;
}

export function getBrowserNotificationPermission(): NotificationPermission | "unsupported" {
  if (!supportsBrowserNotifications()) {
    return "unsupported";
  }

  return window.Notification.permission;
}

export function getTranscriptionNotificationPreference() {
  if (!hasWindow()) {
    return false;
  }

  return window.localStorage.getItem(TRANSCRIPTION_NOTIFICATION_PREF_KEY) === "true";
}

export function setTranscriptionNotificationPreference(enabled: boolean) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(TRANSCRIPTION_NOTIFICATION_PREF_KEY, enabled ? "true" : "false");
}

export async function requestBrowserNotificationPermission() {
  if (!supportsBrowserNotifications()) {
    return "unsupported" as const;
  }

  return window.Notification.requestPermission();
}

function getSentNotificationMap() {
  if (!hasWindow()) {
    return {} as Record<string, boolean>;
  }

  const raw = window.localStorage.getItem(TRANSCRIPTION_NOTIFICATION_SENT_KEY);
  if (!raw) {
    return {} as Record<string, boolean>;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, boolean>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function setSentNotificationMap(value: Record<string, boolean>) {
  if (!hasWindow()) {
    return;
  }

  window.localStorage.setItem(TRANSCRIPTION_NOTIFICATION_SENT_KEY, JSON.stringify(value));
}

function buildSentKey(jobId: string, status: string, updatedAt: string) {
  return `${jobId}:${status}:${updatedAt}`;
}

export function hasSentTranscriptionNotification(jobId: string, status: string, updatedAt: string) {
  const sentMap = getSentNotificationMap();
  return sentMap[buildSentKey(jobId, status, updatedAt)] === true;
}

export function markTranscriptionNotificationSent(jobId: string, status: string, updatedAt: string) {
  const sentMap = getSentNotificationMap();
  sentMap[buildSentKey(jobId, status, updatedAt)] = true;
  setSentNotificationMap(sentMap);
}

export function showBrowserNotification(params: {
  title: string;
  body: string;
  tag: string;
  onClickUrl?: string;
}) {
  if (!supportsBrowserNotifications() || window.Notification.permission !== "granted") {
    return;
  }

  const notification = new window.Notification(params.title, {
    body: params.body,
    tag: params.tag
  });

  if (params.onClickUrl) {
    const targetUrl = params.onClickUrl;
    notification.onclick = () => {
      window.focus();
      window.location.assign(targetUrl);
    };
  }
}
