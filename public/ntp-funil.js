/*!
 * Ninguém Tá Puro — integração de páginas externas de Upsell/Downsell (v1)
 * Uso: <script src="https://<a-sua-plataforma>/ntp-funil.js" defer></script>
 *      <a href="#ntp-aceitar">ACEITAR OFERTA</a>   <a href="#ntp-recusar">NÃO, OBRIGADO</a>
 *      (ou qualquer elemento com data-ntp-accept / data-ntp-decline, ou as classes ntp-aceitar / ntp-recusar)
 * O script não contém segredos. Identifica o funil, a etapa e a oferta pelo percurso (ntp_run) e pela etapa
 * (ntp_step) que a plataforma acrescenta ao endereço desta página, e envia a decisão ao servidor da plataforma,
 * que valida tudo e devolve o destino seguinte. Aceitar leva ao pagamento seguro na plataforma: a venda só é
 * registada quando o pagamento é confirmado.
 */
(function () {
  "use strict";
  if (window.NTPFunil) return;
  var script = document.currentScript;
  var base = "";
  try { base = new URL(script && script.src ? script.src : "").origin; } catch { return; }
  var KEY = "ntp_funil_ctx";
  var ctx = null;
  try {
    var q = new URLSearchParams(window.location.search);
    var run = q.get("ntp_run"), step = q.get("ntp_step");
    if (run && step && /^[A-Za-z0-9]{10,40}$/.test(run) && /^[A-Za-z0-9_-]{1,64}$/.test(step)) {
      ctx = { run: run, step: step };
      try { sessionStorage.setItem(KEY, JSON.stringify(ctx)); } catch {}
    } else {
      try { ctx = JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { ctx = null; }
    }
  } catch { ctx = null; }

  var busy = false;
  function send(action) {
    if (!ctx) {
      if (window.console) console.warn("[Ninguém Tá Puro] Esta página não foi aberta a partir de um funil (faltam ntp_run/ntp_step no endereço). Nenhuma ação foi executada.");
      return false;
    }
    if (busy) return false;
    busy = true;
    var f = document.createElement("form");
    f.method = "POST";
    f.action = base + "/api/public/funil/v1/" + action;
    f.style.display = "none";
    [["run", ctx.run], ["step", ctx.step]].forEach(function (p) {
      var i = document.createElement("input");
      i.type = "hidden"; i.name = p[0]; i.value = p[1];
      f.appendChild(i);
    });
    document.body.appendChild(f);
    f.submit();
    return true;
  }

  var SELECTOR = '[data-ntp-accept],[data-ntp-decline],a[href$="#ntp-aceitar"],a[href$="#ntp-recusar"],.ntp-aceitar,.ntp-recusar';
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest(SELECTOR) : null;
    if (!el) return;
    e.preventDefault();
    var href = el.getAttribute("href") || "";
    var accept = el.hasAttribute("data-ntp-accept") || /#ntp-aceitar$/.test(href) || el.classList.contains("ntp-aceitar");
    send(accept ? "aceitar" : "recusar");
  }, true);
  // voltar atrás (cache do navegador) volta a permitir cliques
  window.addEventListener("pageshow", function () { busy = false; });

  window.NTPFunil = {
    versao: 1,
    aceitar: function () { return send("aceitar"); },
    recusar: function () { return send("recusar"); },
    contexto: function () { return ctx ? { run: ctx.run, step: ctx.step } : null; },
    /** Estado da etapa (ativa?, textos e preço), para personalizar a página. */
    estado: function () {
      if (!ctx || !window.fetch) return Promise.resolve(null);
      return fetch(base + "/api/public/funil/v1/estado?run=" + encodeURIComponent(ctx.run) + "&step=" + encodeURIComponent(ctx.step), { credentials: "omit" })
        .then(function (r) { return r.json(); })
        .catch(function () { return null; });
    }
  };
})();
