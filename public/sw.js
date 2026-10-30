/* Service worker da Ninguém Tá Puro — apenas notificações push.
   Não faz cache nem interceta pedidos: o painel funciona exatamente como antes. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Ninguém Tá Puro", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Ninguém Tá Puro";
  const url = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/notificacoes";
  // Apresentação BARÃO: título curto com o emoji da categoria, corpo de uma ou duas linhas com o valor em destaque,
  // ícone e emblema da aplicação. iOS e Android mostram título + corpo no ecrã bloqueado e no centro de notificações.
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: data.tag || undefined,
    lang: "pt-PT",
    dir: "ltr",
    timestamp: typeof data.ts === "number" ? data.ts : Date.now(),
    data: { url },
  };
  // vendas: vibração curta e marcante (Android; o iOS usa o som/vibração do sistema)
  if (data.kind === "sale") options.vibrate = [90, 50, 90, 50, 160];
  const show = self.registration.showNotification(title, options);
  // Confirmação de receção no dispositivo (o token só existe neste conteúdo cifrado)
  const receipt =
    data.d && data.t
      ? fetch("/api/push/receipt", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ d: data.d, t: data.t }), keepalive: true }).catch(() => undefined)
      : Promise.resolve();
  event.waitUntil(Promise.all([show, receipt]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/notificacoes", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && "focus" in w) {
          return w.focus().then((c) => (c && "navigate" in c ? c.navigate(url) : undefined));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

// O navegador renovou a subscrição: regista a nova (com a sessão do painel, se existir)
self.addEventListener("pushsubscriptionchange", (event) => {
  const old = event.oldSubscription;
  const key = old && old.options ? old.options.applicationServerKey : null;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }).then((sub) =>
      fetch("/api/push/subscription", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(sub.toJSON()) }),
    ),
  );
});
