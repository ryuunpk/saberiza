import { supabase, supabaseConfigured } from "./supabase-client.js";
import { PAGE_SIZE } from "./config.js";
import { initializeSharedUI, escapeHtml, showNotice, articleCard, getFavorites, toggleFavorite } from "./ui.js";

initializeSharedUI();
const $ = (id) => document.getElementById(id);
const status = $("connection-status");
const categoryGrid = $("category-grid");
const articlesGrid = $("article-grid");
const browseSection = $("browse-section");
const categorySection = $("current-category-section");
const childCategoryGrid = $("child-category-grid");
const articlesSection = $("articles-section");
const pagination = $("pagination");
const params = new URLSearchParams(location.search);
const query = (params.get("q") || "").trim().slice(0, 120);
const categoryCode = (params.get("cat") || "").slice(0, 90);
const area = params.get("area") || "";
const favoritesOnly = params.get("favoritos") === "1";
const recentOnly = params.get("recentes") === "1";
let categories = [];
let currentOffset = 0;
let totalAvailable = 0;
let currentArticles = [];
let activeCategory = null;

function showMessage(message, type = "info") { showNotice(status, message, type); }
function categoryHref(category) { return `./index.html?cat=${encodeURIComponent(category.code)}`; }
function categoryCard(category) {
  const iconByKind = { stage: "01", grade: "A", subject: "∷", general: "✳", topic: "↗" };
  return `<a class="category-card" href="${categoryHref(category)}"><span class="category-icon" aria-hidden="true">${iconByKind[category.kind] || "✳"}</span><div><h3>${escapeHtml(category.name)}</h3><p>${escapeHtml(category.description || defaultDescription(category.kind))}</p><span class="category-link">Explorar assunto <span aria-hidden="true">→</span></span></div></a>`;
}
function defaultDescription(kind) {
  return ({ stage: "Conteúdos organizados por ano e matéria.", grade: "Ensinamentos e matérias desta etapa.", subject: "Explicações e atividades desta matéria.", general: "Ideias práticas para o dia a dia.", topic: "Conteúdos reunidos por assunto." })[kind] || "Explore conteúdos deste tema.";
}
function getBreadcrumbs(category) {
  const trail = [];
  let current = category;
  let safety = 0;
  while (current && safety++ < 12) {
    trail.unshift(current);
    current = categories.find((item) => item.id === current.parent_id);
  }
  return trail;
}
function categoryName(id) { return categories.find((item) => item.id === id)?.name || "Conhecimentos"; }
function bindFavoriteButtons() {
  document.querySelectorAll("[data-favorite-id]").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      const added = toggleFavorite(button.dataset.favoriteId);
      button.textContent = added ? "★" : "☆";
      button.setAttribute("aria-label", `${added ? "Remover dos" : "Adicionar aos"} favoritos`);
      button.title = added ? "Remover dos favoritos" : "Adicionar aos favoritos";
      if (favoritesOnly) await loadArticles(false);
    });
  });
}
function renderCategories(items, container) {
  container.innerHTML = items.length ? items.map(categoryCard).join("") : '<div class="empty-state">Nenhuma categoria disponível aqui ainda.</div>';
}
function renderCategoryView() {
  if (!activeCategory) return;
  browseSection.hidden = true;
  categorySection.hidden = false;
  $("category-title").textContent = activeCategory.name;
  $("category-description").textContent = activeCategory.description || defaultDescription(activeCategory.kind);
  const trail = getBreadcrumbs(activeCategory);
  $("category-breadcrumb").innerHTML = `<a href="./index.html">Início</a>${trail.map((item) => `<span aria-hidden="true">/</span><a href="${categoryHref(item)}">${escapeHtml(item.name)}</a>`).join("")}`;
  const children = categories.filter((item) => item.parent_id === activeCategory.id);
  childCategoryGrid.innerHTML = children.length ? children.map(categoryCard).join("") : '<div class="empty-state">Esta categoria ainda não tem subcategorias. Os ensinamentos disponíveis aparecem abaixo.</div>';
  if (children.length) childCategoryGrid.hidden = false;
}
function setArticleHeader() {
  if (query) {
    $("articles-eyebrow").textContent = "Resultado da pesquisa";
    $("articles-title").textContent = `Resultados para “${query}”`;
    $("articles-description").textContent = "Resultados em conteúdos publicados. Confira também as categorias encontradas acima.";
  } else if (favoritesOnly) {
    $("articles-eyebrow").textContent = "Sua seleção";
    $("articles-title").textContent = "Favoritos salvos neste aparelho";
    $("articles-description").textContent = "Os favoritos são guardados somente neste navegador e neste aparelho.";
  } else if (activeCategory) {
    $("articles-eyebrow").textContent = "Conteúdos desta categoria";
    $("articles-title").textContent = activeCategory.name;
    $("articles-description").textContent = "Somente ensinamentos publicados aparecem nesta lista.";
  } else if (recentOnly) {
    $("articles-eyebrow").textContent = "Biblioteca";
    $("articles-title").textContent = "Ensinamentos recentes";
    $("articles-description").textContent = "Os conteúdos mais novos que estão publicados.";
  } else {
    $("articles-eyebrow").textContent = "Para continuar aprendendo";
    $("articles-title").textContent = "Ensinamentos recentes";
    $("articles-description").textContent = "Novos conteúdos, publicados e organizados para você.";
  }
}
async function loadArticles(append = false) {
  if (!supabase) return;
  if (!append) { currentOffset = 0; currentArticles = []; articlesGrid.innerHTML = '<div class="empty-state">Carregando ensinamentos…</div>'; }
  let request = supabase.from("teachings").select("id,title,subtitle,summary,body,keywords,category_id,author_name,published_at,created_at,updated_at,cover_url,status", { count: "exact" }).eq("status", "published").order("published_at", { ascending: false, nullsFirst: false });
  if (query) {
    try { request = request.textSearch("search_vector", query, { type: "websearch", config: "portuguese" }); }
    catch { request = request.ilike("title", `%${query.replace(/[%_,()]/g, " ")}%`); }
  }
  if (activeCategory) request = request.eq("category_id", activeCategory.id);
  if (favoritesOnly) {
    const ids = getFavorites();
    if (!ids.length) {
      articlesGrid.innerHTML = '<div class="empty-state">Você ainda não salvou favoritos. Abra um ensinamento e toque na estrela para guardá-lo neste aparelho.</div>';
      pagination.hidden = true; return;
    }
    request = request.in("id", ids);
  }
  request = request.range(currentOffset, currentOffset + PAGE_SIZE - 1);
  const { data, error, count } = await request;
  if (error) {
    articlesGrid.innerHTML = '<div class="empty-state">Não foi possível carregar os ensinamentos. Confira sua conexão e tente novamente.</div>';
    showMessage(`Falha ao consultar os conteúdos: ${error.message}. Verifique a configuração do Supabase e as políticas RLS.`, "error");
    pagination.hidden = true; return;
  }
  const rows = data || [];
  totalAvailable = count || 0;
  currentArticles = append ? [...currentArticles, ...rows] : rows;
  if (!currentArticles.length) {
    articlesGrid.innerHTML = `<div class="empty-state">${query ? "Nenhum conteúdo publicado correspondeu à pesquisa." : favoritesOnly ? "Não há favoritos disponíveis para mostrar." : "Ainda não há ensinamentos publicados nesta área. Volte mais tarde ou explore outra categoria."}</div>`;
  } else {
    articlesGrid.innerHTML = currentArticles.map((item) => articleCard(item, categoryName(item.category_id))).join("");
  }
  currentOffset = currentArticles.length;
  pagination.hidden = currentOffset >= totalAvailable || rows.length === 0;
  bindFavoriteButtons();
}
async function initialize() {
  const searchInput = $("search-input");
  if (query) searchInput.value = query;
  $("search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const value = searchInput.value.trim().slice(0, 120);
    const next = new URLSearchParams(location.search);
    next.delete("cat"); next.delete("area"); next.delete("recentes"); next.delete("favoritos");
    if (value) next.set("q", value); else next.delete("q");
    location.href = `./index.html${next.toString() ? `?${next}` : ""}`;
  });
  $("load-more").addEventListener("click", () => loadArticles(true));
  if (!supabaseConfigured || !supabase) {
    showMessage("Site ainda não conectado ao banco. Para usar conteúdo real e o painel, configure a URL e a chave pública no arquivo js/config.js e aplique supabase/schema.sql. Consulte README.md.", "info");
    categoryGrid.innerHTML = '<div class="empty-state">A biblioteca aparecerá aqui depois que o banco de dados for configurado. Os conteúdos não são simulados.</div>';
    articlesGrid.innerHTML = '<div class="empty-state">Nenhum dado fictício será apresentado como se fosse uma publicação real.</div>';
    pagination.hidden = true; return;
  }
  const { data, error } = await supabase.from("categories").select("id,code,name,kind,parent_id,description,sort_order,is_active").eq("is_active", true).order("sort_order").order("name").limit(300);
  if (error) { showMessage(`Não foi possível carregar as categorias: ${error.message}`, "error"); categoryGrid.innerHTML = '<div class="empty-state">Erro ao carregar categorias.</div>'; return; }
  categories = data || [];
  const mainNav = document.getElementById("main-nav");
  const schoolLink = mainNav?.querySelector('a[href="./index.html?area=escolar"]');
  if (mainNav && schoolLink && !mainNav.querySelector(".nav-stage")) {
    const stageLinks = categories.filter((item) => !item.parent_id && item.kind === "stage");
    const fragment = document.createDocumentFragment();
    stageLinks.forEach((item) => {
      const link = document.createElement("a");
      link.className = "nav-stage";
      link.href = categoryHref(item);
      link.textContent = item.name;
      fragment.appendChild(link);
    });
    schoolLink.after(fragment);
  }
  if (categoryCode) activeCategory = categories.find((item) => item.code === categoryCode) || null;
  if (categoryCode && !activeCategory) showMessage("Esta categoria não existe ou está desativada.", "error");
  const rootCategories = categories.filter((item) => !item.parent_id && (item.kind === "stage" || item.kind === "general"));
  let visibleCategories = rootCategories;
  if (area === "escolar") visibleCategories = rootCategories.filter((item) => item.kind === "stage");
  if (area === "geral") visibleCategories = rootCategories.filter((item) => item.kind === "general");
  if (favoritesOnly) { browseSection.hidden = true; categorySection.hidden = true; }
  else if (activeCategory) renderCategoryView();
  else if (query || recentOnly) browseSection.hidden = true;
  renderCategories(visibleCategories, categoryGrid);
  if (area && !categoryCode && !query) categoryGrid.innerHTML = visibleCategories.map(categoryCard).join("") || '<div class="empty-state">Ainda não há categorias nessa área.</div>';
  if (query) {
    const matches = categories.filter((item) => `${item.name} ${item.description || ""}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))).slice(0, 12);
    if (matches.length) { $("search-categories-wrap").hidden = false; renderCategories(matches, $("search-categories")); }
  }
  if (activeCategory && !categories.some((item) => item.parent_id === activeCategory.id)) childCategoryGrid.hidden = true;
  setArticleHeader();
  await loadArticles(false);
}
initialize().catch((error) => {
  showMessage("Ocorreu um erro inesperado ao iniciar a biblioteca. Atualize a página e tente novamente.", "error");
  console.error("Erro de inicialização pública:", error?.message || "erro desconhecido");
});
