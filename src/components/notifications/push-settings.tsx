"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellOff, BellRing, CheckCircle2, Monitor, Share, Smartphone, SquarePlus, Trash2 } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import type { TestOutcome } from "@/server/notifications/service";
import { PREFERENCE_LABELS, type NotificationPrefs, type PreferenceKey } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export interface DeviceRow {
  id: string;
  endpoint: string;
  deviceLabel: string;
  createdAt: string;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

type Env =
  | { kind: "loading" }
  | { kind: "insecure" }
  | { kind: "ios-install" }
  | { kind: "unsupported"; ios: boolean; inApp: boolean }
  | { kind: "ready"; ios: boolean; android: boolean; standalone: boolean; permission: NotificationPermission; endpoint: string | null };

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function detect(): Promise<Env> {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const inApp = /FBAN|FBAV|Instagram|Line\/|WhatsApp|TikTok|; wv\)/.test(ua);
  if (!window.isSecureContext) return { kind: "insecure" };
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // iPhone/iPad: o push só existe na app instalada no ecrã principal (iOS/iPadOS 16.4 ou superior)
  if (ios && !standalone) return supported || !inApp ? { kind: "ios-install" } : { kind: "unsupported", ios, inApp };
  if (!supported) return { kind: "unsupported", ios, inApp };
  let endpoint: string | null = null;
  try {
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const sub = await reg.pushManager.getSubscription();
    endpoint = sub?.endpoint ?? null;
  } catch {
    /* sem service worker: tratado ao ativar */
  }
  return { kind: "ready", ios, android, standalone, permission: Notification.permission, endpoint };
}

export function PushSettings({
  publicKey,
  devices,
  prefs: initialPrefs,
  savePrefs,
  revokeDevice,
  sendTest,
}: {
  publicKey: string | null;
  devices: DeviceRow[];
  prefs: NotificationPrefs;
  savePrefs: (p: NotificationPrefs) => Promise<ActionResult<NotificationPrefs>>;
  revokeDevice: (id: string) => Promise<ActionResult<unknown>>;
  sendTest: (endpoint: string | null) => Promise<ActionResult<TestOutcome>>;
}) {
  const [env, setEnv] = useState<Env>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState(initialPrefs);
  const [testState, setTestState] = useState<{ tone: "info" | "success" | "warning" | "danger"; title: string; text: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const refresh = useCallback(() => detect().then(setEnv), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const currentActive = env.kind === "ready" && env.endpoint ? devices.find((d) => d.endpoint === env.endpoint && !d.revokedAt) : undefined;

  const enable = async () => {
    if (!publicKey) return;
    setBusy(true);
    setTestState(null);
    try {
      // O pedido de autorização só acontece aqui, depois de o utilizador carregar no botão
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        await refresh();
        toast(permission === "denied" ? "As notificações foram bloqueadas neste dispositivo." : "Autorização não concedida.", "error");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      const key = urlBase64ToUint8Array(publicKey);
      // Subscrição criada com outras chaves: substituir
      if (sub && sub.options.applicationServerKey) {
        const current = new Uint8Array(sub.options.applicationServerKey);
        if (current.length !== key.length || current.some((b, i) => b !== key[i])) {
          await sub.unsubscribe();
          sub = null;
        }
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const res = await fetch("/api/push/subscription", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Não foi possível registar este dispositivo.");
      toast("Notificações ativadas neste dispositivo.");
      await refresh();
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível ativar as notificações.", "error");
    } finally {
      setBusy(false);
    }
  };

  const disableHere = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscription", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      toast("Notificações desativadas neste dispositivo.");
      await refresh();
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const runTest = () =>
    start(async () => {
      setTestState({ tone: "info", title: "A enviar…", text: "A pedir ao serviço de push para entregar a notificação." });
      const endpoint = env.kind === "ready" ? env.endpoint : null;
      const r = await sendTest(currentActive ? endpoint : null);
      if (!r.ok) return setTestState({ tone: "danger", title: "Teste não enviado", text: r.error });
      const o = r.data!;
      router.refresh();
      if (o.kind === "no_device") {
        return setTestState({ tone: "warning", title: "Este dispositivo não está subscrito", text: "A notificação de teste ficou registada na Central de Notificações, mas não foi enviada por push. Ative as notificações neste dispositivo primeiro." });
      }
      if (o.kind === "rejected") {
        return setTestState({
          tone: "danger",
          title: `O serviço de push recusou o envio${o.statusCode ? ` (HTTP ${o.statusCode})` : ""}`,
          text: o.revoked ? "A subscrição deste dispositivo já não é válida (permissão retirada ou app removida). Ative de novo." : `Detalhe: ${o.error}. A notificação continua disponível na Central de Notificações.`,
        });
      }
      setTestState({ tone: "info", title: `Aceite pelo serviço de push (HTTP ${o.statusCode})`, text: "A aguardar que o dispositivo confirme a receção…" });
      // A entrega só é dada como confirmada quando o service worker do dispositivo responde
      for (let i = 0; i < 15; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        const s = await fetch(`/api/push/status?id=${o.deliveryId}`, { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (s?.receivedAt) {
          return setTestState({ tone: "success", title: "Recebida pelo dispositivo", text: `Confirmado pelo dispositivo às ${new Date(s.receivedAt).toLocaleTimeString("pt-PT")}. Se não viu a notificação, verifique o modo "Não incomodar" ou as definições de notificações do sistema.` });
        }
      }
      setTestState({
        tone: "warning",
        title: `Aceite pelo serviço de push (HTTP ${o.statusCode}) — sem confirmação do dispositivo`,
        text: "O serviço de push aceitou o pedido, mas o dispositivo ainda não confirmou a receção. Pode estar sem rede, em poupança de energia ou o sistema pode atrasar a entrega. Isto não garante que tenha chegado.",
      });
    });

  const togglePref = (k: keyof NotificationPrefs) =>
    start(async () => {
      const next = { ...prefs, [k]: !prefs[k] };
      setPrefs(next);
      const r = await savePrefs(next);
      if (!r.ok) {
        setPrefs(prefs);
        toast(r.error, "error");
      } else toast(r.message ?? "Guardado.");
    });

  const removeDevice = (d: DeviceRow) =>
    start(async () => {
      const r = await revokeDevice(d.id);
      if (!r.ok) return toast(r.error, "error");
      if (env.kind === "ready" && env.endpoint === d.endpoint) {
        const reg = await navigator.serviceWorker.getRegistration("/");
        await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
        await refresh();
      }
      toast(r.message ?? "Removido.");
      router.refresh();
    });

  return (
    <div className="grid grid-cols-1 gap-5" data-testid="push-settings">
      {/* Estado do dispositivo atual */}
      <section className="grid grid-cols-1 gap-3" aria-labelledby="push-device-title">
        <h3 id="push-device-title" className="text-[13px] font-semibold uppercase tracking-wider text-subtle">
          Notificações push neste dispositivo
        </h3>
        {!publicKey ? (
          <Alert tone="danger" title="Notificações push indisponíveis no servidor">
            Não existe forma segura de guardar as chaves de notificação (VAPID). Defina VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY, ou INTEGRATIONS_ENCRYPTION_KEY, no alojamento.
          </Alert>
        ) : env.kind === "loading" ? (
          <p className="text-sm text-muted">A verificar o suporte deste navegador…</p>
        ) : env.kind === "insecure" ? (
          <Alert tone="warning" title="Ligação não segura">As notificações push só funcionam através de HTTPS. Abra a plataforma pelo endereço https://.</Alert>
        ) : env.kind === "ios-install" ? (
          <IosInstall />
        ) : env.kind === "unsupported" ? (
          <Alert tone="warning" title="Este navegador não suporta notificações push" >
            {env.inApp
              ? "Está a usar o navegador interno de outra aplicação (ex.: WhatsApp, Instagram). Abra a plataforma no Chrome (Android) ou no Safari (iPhone)."
              : env.ios
                ? "No iPhone é necessário o iOS 16.4 ou superior e a app instalada no ecrã principal a partir do Safari."
                : "Use uma versão recente do Chrome, Edge, Firefox ou Samsung Internet."}
          </Alert>
        ) : env.permission === "denied" ? (
          <Alert tone="danger" title="Notificações bloqueadas neste dispositivo">
            {env.ios ? (
              <>Abra <b>Definições</b> do iPhone → <b>Notificações</b> → <b>Ninguém Tá Puro</b> → ative <b>Permitir notificações</b>. Depois volte aqui e toque em “Ativar”.</>
            ) : env.android ? (
              <>No Chrome: toque no cadeado ao lado do endereço → <b>Permissões</b> → <b>Notificações</b> → <b>Permitir</b>. Se instalou a app: Definições do Android → Apps → Ninguém Tá Puro → Notificações.</>
            ) : (
              <>Clique no cadeado ao lado do endereço → <b>Notificações</b> → <b>Permitir</b>, e recarregue a página.</>
            )}
            <div className="mt-3">
              <Button size="sm" variant="secondary" onClick={refresh}>Verificar de novo</Button>
            </div>
          </Alert>
        ) : currentActive ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-success/30 bg-success/[0.06] px-4 py-3" data-testid="push-active">
            <BellRing className="h-5 w-5 text-success" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">Ativas neste dispositivo</p>
              <p className="text-[12.5px] text-muted">{currentActive.deviceLabel}</p>
            </div>
            <Button size="sm" variant="secondary" onClick={runTest} loading={pending && testState?.title === "A enviar…"} data-testid="push-test" className="h-auto! min-h-8 whitespace-normal! py-1.5">
              Enviar notificação de teste
            </Button>
            <Button size="sm" variant="ghost" onClick={disableHere} disabled={busy}>
              <BellOff className="h-4 w-4" /> Desativar
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 rounded-[var(--radius-md)] border border-line bg-surface-2 p-4">
            <p className="text-sm text-fg">Receba um alerta no telemóvel ou computador quando uma venda for confirmada — mesmo com a plataforma fechada.</p>
            <ul className="grid grid-cols-1 gap-1 text-[13px] text-muted">
              <li>• Só envia eventos confirmados pelo servidor (nunca pela página de sucesso do comprador).</li>
              <li>• Pode escolher as categorias abaixo e remover o dispositivo quando quiser.</li>
              <li>• A entrega depende do sistema do telemóvel, da rede e das permissões.</li>
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button onClick={enable} loading={busy} data-testid="push-enable" className="h-auto! min-h-10 whitespace-normal! py-2 text-left">
                <BellRing className="h-4 w-4" /> Ativar notificações neste dispositivo
              </Button>
              <Button variant="ghost" onClick={runTest} disabled={pending}>
                Testar só no painel
              </Button>
            </div>
          </div>
        )}
        {testState && (
          <Alert tone={testState.tone} title={testState.title} className="animate-fade-in" >
            <span data-testid="push-test-result">{testState.text}</span>
          </Alert>
        )}
      </section>

      {/* Categorias */}
      <section className="grid grid-cols-1 gap-3" aria-labelledby="push-prefs-title">
        <h3 id="push-prefs-title" className="text-[13px] font-semibold uppercase tracking-wider text-subtle">
          O que quer receber
        </h3>
        <div className="divide-y divide-line rounded-[var(--radius-md)] border border-line">
          <Switch
            label="Notificações push"
            description="Enviar também para os dispositivos subscritos. Desligado: os alertas ficam só na Central de Notificações."
            checked={prefs.pushEnabled}
            onChange={() => togglePref("pushEnabled")}
            testId="pref-pushEnabled"
          />
          {(Object.keys(PREFERENCE_LABELS) as PreferenceKey[]).map((k) => (
            <Switch key={k} label={PREFERENCE_LABELS[k].label} description={PREFERENCE_LABELS[k].description} checked={prefs[k]} onChange={() => togglePref(k)} testId={`pref-${k}`} />
          ))}
        </div>
      </section>

      {/* Dispositivos */}
      <section className="grid grid-cols-1 gap-3" aria-labelledby="push-devices-title">
        <h3 id="push-devices-title" className="text-[13px] font-semibold uppercase tracking-wider text-subtle">
          Dispositivos subscritos
        </h3>
        {devices.length === 0 ? (
          <p className="rounded-[var(--radius-md)] border border-dashed border-line px-4 py-5 text-center text-sm text-subtle">Nenhum dispositivo subscrito.</p>
        ) : (
          <ul className="divide-y divide-line rounded-[var(--radius-md)] border border-line" data-testid="push-devices">
            {devices.map((d) => {
              const Icon = /iPhone|Android|iPad/.test(d.deviceLabel) ? Smartphone : Monitor;
              const here = env.kind === "ready" && env.endpoint === d.endpoint;
              return (
                <li key={d.id} className="flex flex-wrap items-start gap-3 px-4 py-3" data-testid="push-device">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-subtle" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-fg">
                      {d.deviceLabel}
                      {here && <Badge tone="accent">Este dispositivo</Badge>}
                      {d.revokedAt ? <Badge>Revogado</Badge> : <Badge tone="success" dot>Ativo</Badge>}
                    </p>
                    <p className="text-[12px] text-subtle">
                      Desde {fmt(d.createdAt)}
                      {d.lastSuccessAt && ` · último envio aceite ${fmt(d.lastSuccessAt)}`}
                    </p>
                    {d.revokedAt ? (
                      <p className="text-[12px] text-subtle">{d.revokedReason}</p>
                    ) : (
                      d.lastError && d.lastErrorAt && <p className="text-[12px] text-warning">Último erro ({fmt(d.lastErrorAt)}): {d.lastError}</p>
                    )}
                  </div>
                  {!d.revokedAt && (
                    <Button size="sm" variant="ghost" onClick={() => removeDevice(d)} disabled={pending} aria-label={`Remover ${d.deviceLabel}`}>
                      <Trash2 className="h-4 w-4" /> Remover
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Switch({ label, description, checked, onChange, testId }: { label: string; description: string; checked: boolean; onChange: () => void; testId: string }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-fg">{label}</span>
        <span className="block text-[12.5px] text-muted">{description}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        data-testid={testId}
        className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors after:absolute after:-inset-2 after:content-['']", checked ? "border-accent bg-accent" : "border-line-strong bg-surface-3")}
      >
        <span className={cn("absolute top-0.5 h-[18px] w-[18px] rounded-full shadow transition-[left]", checked ? "left-[22px] bg-accent-ink" : "left-0.5 bg-muted")} />
      </button>
    </label>
  );
}

function IosInstall() {
  const steps = [
    { icon: Share, text: <>Abra a plataforma no <b>Safari</b> e toque em <b>Partilhar</b>.</> },
    { icon: SquarePlus, text: <>Escolha <b>Adicionar ao ecrã principal</b> e confirme em <b>Adicionar</b>.</> },
    { icon: Smartphone, text: <>Feche o Safari e abra a app <b>Ninguém Tá Puro</b> a partir do ecrã principal.</> },
    { icon: BellRing, text: <>Na app, volte a <b>Configurações → Notificações e Alertas</b> e toque em <b>Ativar notificações</b>.</> },
    { icon: CheckCircle2, text: <>Quando o iPhone perguntar, toque em <b>Permitir</b>.</> },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 rounded-[var(--radius-md)] border border-info/25 bg-info/[0.05] p-4" data-testid="ios-install">
      <p className="text-sm font-medium text-fg">No iPhone, as notificações só funcionam com a app instalada no ecrã principal (iOS 16.4 ou superior).</p>
      <ol className="grid grid-cols-1 gap-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-[13.5px] text-muted">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-3 text-[11.5px] font-semibold text-fg">{i + 1}</span>
            <s.icon className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
      <p className="text-[12.5px] text-subtle">Se usa o Chrome ou outro navegador no iPhone, abra primeiro este endereço no Safari.</p>
    </div>
  );
}
