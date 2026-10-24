import { SITE_NAME, SITE_TAGLINE } from "./config.js";

export function initializeSharedUI() {
  document.querySelectorAll("[data-site-name]").forEach((el) => { el.textContent = SITE_NAME; });
  document.title = document.title.replace(/Saberiza/g, SITE_NAME);
  document.querySelectorAll(".brand small").forEach((el) => { el.textContent = SITE_TAGLINE; });
  const themeButton = document.getElementById("theme-toggle");
  const menuButton = document.getElementById("menu-toggle");
  const nav = document.getElementById("main-nav");
  let initialTheme = "light";
  try { initialTheme = localStorage.getItem("saberiza-theme") || "light"; } catch { /* armazenamento indisponível */ }
  document.body.dataset.theme = initialTheme === "dark" ? "dark" : "light";
  if (themeButton) {
    themeButton.textContent = initialTheme === "dark" ? "☼" : "◐";
    themeButton.addEventListener("click", () => {
      const next = document.body.dataset.theme === "dark" ? "light" : "dark";
      document.body.dataset.theme = next;
      themeButton.textContent = next === "dark" ? "☼" : "◐";
      try { localStorage.setItem("saberiza-theme", next); } catch { /* tema funciona mesmo sem salvar */ }
    });
  }
  if (menuButton && nav) {
    menuButton.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      menuButton.setAttribute("aria-expanded", String(open));
      menuButton.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        nav.classList.remove("open");
        menuButton.setAttribute("aria-expanded", "false");
      }
    });
  }
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function inlineMarkdown(escaped) {
  let text = escaped;
  // Links aceitam somente HTTPS. O texto do conteúdo nunca é tratado como HTML bruto.
  text = text.replace(/\[([^\]]{1,250})\]\((https:\/\/[^\s)]+)\)/g, (_all, label, url) => {
    const safeUrl = url.replace(/&amp;/g, "&").replace(/&quot;/g, "").replace(/&#39;/g, "");
    if (!/^https:\/\//i.test(safeUrl)) return label;
    return `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  text = text.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return text;
}

export function markdownToHtml(source) {
  const lines = String(source ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let paragraph = [];
  let listType = "";
  let inCode = false;
  let codeLines = [];
  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inlineMarkdown(escapeHtml(paragraph.join(" ")))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = ""; } };
  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph(); closeList();
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = []; inCode = false;
      } else inCode = true;
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }
    if (!line.trim()) { flushParagraph(); closeList(); continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (heading) {
      flushParagraph(); closeList();
      const level = heading[1].length;
      out.push(`<h${level + 1}>${inlineMarkdown(escapeHtml(heading[2]))}</h${level + 1}>`);
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const nextType = bullet ? "ul" : "ol";
      if (listType !== nextType) { closeList(); out.push(`<${nextType}>`); listType = nextType; }
      out.push(`<li>${inlineMarkdown(escapeHtml((bullet || numbered)[1]))}</li>`);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) { flushParagraph(); closeList(); out.push(`<blockquote><p>${inlineMarkdown(escapeHtml(quote[1]))}</p></blockquote>`); continue; }
    closeList(); paragraph.push(line.trim());
  }
  flushParagraph(); closeList();
  if (inCode) out.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  return out.join("\n");
}

export function formatDate(value) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function showNotice(element, message, type = "info") {
  if (!element) return;
  element.textContent = message;
  element.className = `notice notice-${type}`;
  element.hidden = false;
}

export function getFavorites() {
  try {
    const values = JSON.parse(localStorage.getItem("saberiza-favorites") || "[]");
    return Array.isArray(values) ? values.filter((x) => typeof x === "string").slice(0, 300) : [];
  } catch { return []; }
}

export function toggleFavorite(id) {
  const favorites = getFavorites();
  const exists = favorites.includes(id);
  const next = exists ? favorites.filter((item) => item !== id) : [...favorites, id].slice(-300);
  try { localStorage.setItem("saberiza-favorites", JSON.stringify(next)); } catch { /* favoritos ficam indisponíveis se armazenamento for bloqueado */ }
  return !exists;
}

export function articleCard(article, categoryName = "Ensinamento") {
  const cover = typeof article.cover_url === "string" && /^https:\/\//i.test(article.cover_url)
    ? `<img class="card-cover" src="${escapeHtml(article.cover_url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : "";
  const summary = article.summary || article.subtitle || "Abra o ensinamento para ver a explicação completa.";
  const date = formatDate(article.published_at || article.created_at);
  const favorite = getFavorites().includes(article.id);
  return `<article class="article-card">${cover}<div class="card-body"><div class="card-meta"><span class="meta-pill">${escapeHtml(categoryName)}</span><span>${escapeHtml(date)}</span></div><h3>${escapeHtml(article.title)}</h3><p>${escapeHtml(summary)}</p><div class="card-bottom"><a class="text-link" href="./content.html?id=${encodeURIComponent(article.id)}">Ler ensinamento <span aria-hidden="true">→</span></a><button class="favorite-mini" type="button" data-favorite-id="${escapeHtml(article.id)}" aria-label="${favorite ? "Remover dos" : "Adicionar aos"} favoritos" title="${favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}">${favorite ? "★" : "☆"}</button></div></div></article>`;
}
