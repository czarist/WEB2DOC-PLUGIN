// Local test pages: a simple article, a page with fixed and sticky elements, and a page with
// tables, images, a shadow root, a frame and data to redact.
const lorem = (n: number) => Array.from({ length: n }, (_, i) =>
  `<p>Paragraph ${i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>`).join("\n");

export const SIMPLE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Simple test page</title>
<meta name="description" content="A simple page for Web2Doc tests">
<style>body{font:16px/1.5 Georgia,serif;margin:0;background:#fafafa} header{padding:16px 32px;background:#222;color:#fff}
main{display:grid;grid-template-columns:1fr 240px;gap:24px;max-width:1000px;margin:24px auto;padding:0 16px}
article{background:#fff;padding:24px;border-radius:8px} .ad{background:#ffe9a8;padding:12px;margin:16px 0}
table{border-collapse:collapse} td,th{border:1px solid #ccc;padding:4px 8px} nav{background:#eef;padding:12px}</style></head>
<body><header>SITE HEADER TEXT</header>
<main><article id="story"><h1>Simple Story Heading</h1>
<p id="intro">ARTICLE INTRO TEXT with a <a href="https://example.com/kept-link">kept link</a>.</p>
<div class="ad" id="ad">ADVERTISEMENT TO EXCLUDE</div>
<p id="secret">Customer SECRET-ACCOUNT-9876 at <a href="https://secret.example/acct-9876">private portal</a>.</p>
<table id="numbers"><tr><th>Name</th><th>Value</th></tr><tr><td>Alpha</td><td>1</td></tr></table>
${lorem(3)}<p id="end">ARTICLE END TEXT</p></article>
<nav id="sidebar">SIDEBAR NAV TEXT<br><a href="/elsewhere">Elsewhere</a></nav></main>
<footer>SITE FOOTER TEXT</footer></body></html>`;

export const FIXED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Fixed elements page</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding-top:64px}
.topbar{position:fixed;top:0;left:0;right:0;height:56px;background:#0b3d91;color:#fff;display:flex;align-items:center;padding:0 24px;z-index:10}
.layout{display:flex;gap:24px;padding:24px}
.toc{position:sticky;top:72px;align-self:flex-start;width:200px;background:#f1f3f6;padding:12px}
.content{flex:1} section{margin-bottom:32px;padding:16px;border:1px solid #ddd;border-radius:8px}
.cookie{position:fixed;right:16px;bottom:16px;width:360px;padding:16px;background:#111;color:#fff;z-index:20}
.chat{position:fixed;left:16px;bottom:16px;padding:10px 14px;background:#e91e63;color:#fff;border-radius:20px;z-index:20}
.note{background:#fde2e2;padding:8px}</style></head>
<body><div class="topbar">FIXED TOPBAR TEXT</div>
<div class="layout"><aside class="toc">STICKY TOC TEXT</aside>
<div class="content">
<section id="intro"><h2>Intro Section</h2>${lorem(4)}</section>
<section id="target"><h2>Target Section Heading</h2><p>TARGET SECTION TEXT</p>
<p class="note" id="note">EXCLUDED NOTE TEXT</p>${lorem(10)}<p>TARGET SECTION END</p></section>
<section id="outro"><h2>Outro Section</h2>${lorem(6)}</section>
</div></div>
<div class="cookie">COOKIE BANNER TEXT</div><div class="chat">CHAT BUBBLE TEXT</div></body></html>`;

export const WIDGETS = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Painel de vendas</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#fff}
section{margin-bottom:24px} table{border-collapse:collapse} td,th{border:1px solid #bbb;padding:4px 10px}
iframe{width:420px;height:90px;border:1px solid #888} img{display:block;margin:8px 0}
.big{font:700 42px/1.2 Arial,sans-serif;letter-spacing:1px;margin:24px 0}</style></head>
<body><main>
<h1>Painel de vendas</h1>
<p class="big" id="ocrline">RECOGNIZE THIS LINE</p>
<section id="sales"><h2>Vendas por região</h2>
<table id="sales-table"><thead><tr><th>Código</th><th>Região</th><th>Total</th><th>Data</th><th>Fórmula</th></tr></thead>
<tbody><tr><td>007</td><td>Sul</td><td>R$ 1.299,90</td><td>05/11/2026</td><td>=SUM(A1:A3)</td></tr>
<tr><td>0123</td><td>Norte</td><td>R$ 2.000,00</td><td>25/12/2026</td><td>+55 11 9999</td></tr></tbody></table></section>
<section id="team"><h2>Equipe</h2><table><tr><th>Nome</th><th>Meta</th></tr><tr><td>Ana</td><td>45%</td></tr></table></section>
<section id="widgets"><h2>Componentes</h2>
<shadow-card id="card"></shadow-card>
<iframe id="frame" srcdoc="<p style='font:16px sans-serif'>IFRAME INNER TEXT</p>"></iframe>
<img src="/logo.png" alt="Logo da empresa" width="64" height="64">
<img src="/chart.png" alt="Gráfico" width="120" height="60">
</section>
</main>
<script>
customElements.define("shadow-card", class extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: "open" }).innerHTML = "<div id='inner'><p id='shadow-text'>SHADOW INNER TEXT</p><p id='shadow-drop'>SHADOW DROP TEXT</p></div>"; }
});
</script></body></html>`;
