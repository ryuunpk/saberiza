import { SITE_NAME } from "./config.js";
import { supabase, supabaseConfigured } from "./supabase-client.js";
import { initializeSharedUI, escapeHtml, markdownToHtml, formatDate, showNotice, articleCard, toggleFavorite, getFavorites } from "./ui.js";

initializeSharedUI();
const $ = (id) => document.getElementById(id);
const status = $("content-status");
const article = $("teaching-article");
let currentTeaching = null;
let categories = [];
function showMessage(message, type = "info") { showNotice(status, message, type); }
function safeColor(value, fallback) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function safeCover(value) { return typeof value === "string" && /^https:\/\//i.test(value) ? value : ""; }
function getCategory(id) { return categories.find((item) => item.id === id); }
function breadcrumb(category) {
  const list = [];
  let current = category;
  let safety = 0;
  while (current && safety++ < 12) { list.unshift(current); current = getCategory(current.parent_id); }
  $("article-category-crumb").textContent = list.map((item) => item.name).join(" / ") || "Ensinamento";
  const label = list.length ? list[list.length - 1].name : "Conhecimentos";
  $("article-category-label").textContent = label;
}
function updateFavoriteButton() {
  const saved = currentTeaching && getFavorites().includes(currentTeaching.id);
  $("favorite-button").textContent = saved ? "★ Remover dos favoritos" : "☆ Salvar nos favoritos";
}
function wordCount(text) { return (String(text || "").trim().match(/\S+/g) || []).length; }
async function loadRelated(categoryId, excludeId) {
  if (!categoryId) return;
  const { data, error } = await supabase.from("teachings").select("id,title,subtitle,summary,body,category_id,author_name,published_at,created_at,cover_url,status").eq("status", "published").eq("category_id", categoryId).neq("id", excludeId).order("published_at", { ascending: false }).limit(3);
  if (error || !data?.length) return;
  $("related-grid").innerHTML = data.map((item) => articleCard(item, getCategory(item.category_id)?.name || "Ensinamento")).join("");
  $("related-section").hidden = false;
  document.querySelectorAll("[data-favorite-id]").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", () => {
      const added = toggleFavorite(button.dataset.favoriteId); button.textContent = added ? "★" : "☆";
    });
  });
}
async function initialize() {
  const id = new URLSearchParams(location.search).get("id");
  if (!supabaseConfigured || !supabase) { showMessage("A plataforma ainda não está conectada ao banco de dados. Consulte README.md para configurar o Supabase.", "error"); return; }
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { showMessage("O endereço deste ensinamento está incompleto ou inválido. Volte à biblioteca e escolha um conteúdo publicado.", "error"); return; }
  const [teachingResult, categoryResult] = await Promise.all([
    supabase.from("teachings").select("id,title,subtitle,summary,body,keywords,category_id,author_name,published_at,created_at,updated_at,cover_url,status,title_bg,title_color,subtitle_color,body_color,accent_color,title_align,title_scale,style_preset").eq("id", id).eq("status", "published").maybeSingle(),
    supabase.from("categories").select("id,code,name,kind,parent_id,description,sort_order,is_active").eq("is_active", true).order("sort_order").limit(300)
  ]);
  if (categoryResult.error) { showMessage("Não foi possível carregar os dados de categoria. Tente atualizar a página.", "error"); return; }
  categories = categoryResult.data || [];
  if (teachingResult.error || !teachingResult.data) { showMessage("Este ensinamento não existe, foi despublicado ou não está disponível. Conteúdos não publicados permanecem ocultos.", "error"); return; }
  currentTeaching = teachingResult.data;
  const item = currentTeaching;
  document.title = `${item.title} — ${SITE_NAME}`;
  $("article-title").textContent = item.title;
  $("article-subtitle").textContent = item.subtitle || item.summary || "";
  $("article-subtitle").hidden = !$("article-subtitle").textContent;
  $("article-author").textContent = `Por ${item.author_name || "Autor"}`;
  $("article-date").textContent = formatDate(item.published_at || item.created_at);
  $("article-date").dateTime = item.published_at || item.created_at || "";
  $("reading-time").textContent = `${Math.max(1, Math.ceil(wordCount(item.body) / 200))} min de leitura`;
  $("article-body").innerHTML = markdownToHtml(item.body || "");
  const safety = String(item.safety_notes || "").trim();
  if (safety) { $("safety-notice").innerHTML = `<strong>Precauções importantes</strong><div>${markdownToHtml(safety)}</div>`; $("safety-notice").hidden = false; }
  const references = String(item.references_text || "").trim();
  if (references) { $("article-references").innerHTML = markdownToHtml(references); $("references-section").hidden = false; }
  if (item.difficulty && item.difficulty !== "not-set") {
    const labels = { beginner: "Iniciante", intermediate: "Intermediário", advanced: "Avançado" };
    const pill = document.createElement("span"); pill.className = "meta-pill"; pill.textContent = `Nível: ${labels[item.difficulty] || "Não informado"}`;
    $("reading-meta").appendChild(pill);
  }
  const bg = safeColor(item.title_bg, "#e8f3ec");
  const titleColor = safeColor(item.title_color, "#174b3b");
  const subtitleColor = safeColor(item.subtitle_color, "#23745b");
  const bodyColor = safeColor(item.body_color, "#24352f");
  const accentColor = safeColor(item.accent_color, "#17654f");
  const titleFeature = $("title-feature");
  titleFeature.style.backgroundColor = bg;
  titleFeature.style.color = titleColor;
  titleFeature.style.textAlign = item.title_align === "center" ? "center" : "left";
  titleFeature.style.borderRadius = item.style_preset === "minimal" ? "8px" : item.style_preset === "note" ? "8px 18px 18px 8px" : "18px";
  titleFeature.style.borderLeft = item.style_preset === "note" ? `4px solid ${accentColor}` : "1px solid var(--line)";
  $("article-title").style.color = titleColor;
  $("article-title").style.fontSize = `${Math.max(1.5, Math.min(2.7, Number(item.title_scale) || 1.9))}rem`;
  $("article-subtitle").style.color = subtitleColor;
  $("article-body").style.color = bodyColor;
  $("article-body").querySelectorAll("h2,h3,h4,a").forEach((el) => { el.style.color = accentColor; });
  const cover = safeCover(item.cover_url);
  if (cover) { $("article-cover").src = cover; $("cover-wrap").hidden = false; }
  const updated = new Date(item.updated_at || item.created_at).getTime();
  const published = new Date(item.published_at || item.created_at).getTime();
  if (Number.isFinite(updated) && Number.isFinite(published) && updated - published > 60_000) {
    $("article-updated").textContent = `Última atualização: ${formatDate(item.updated_at)}`;
    $("article-updated").hidden = false;
  }
  breadcrumb(getCategory(item.category_id));
  status.hidden = true;
  article.hidden = false;
  updateFavoriteButton();
  $("favorite-button").addEventListener("click", () => { toggleFavorite(item.id); updateFavoriteButton(); });
  $("share-button").addEventListener("click", async () => {
    const shareData = { title: item.title, text: item.summary || item.subtitle || "Ensinamento da Saberiza", url: location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(location.href); showMessage("Link copiado para compartilhar.", "success"); }
      else showMessage("Copie o endereço desta página na barra do navegador para compartilhar.", "info");
    } catch (error) { if (error?.name !== "AbortError") showMessage("Não foi possível compartilhar automaticamente. Copie o endereço da página.", "info"); }
  });
  await loadRelated(item.category_id, item.id);
}
initialize().catch((error) => { showMessage("Ocorreu um erro inesperado ao carregar o ensinamento. Tente atualizar a página.", "error"); console.error("Erro de leitura:", error?.message || "erro desconhecido"); });
