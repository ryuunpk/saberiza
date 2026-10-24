import { supabase, supabaseConfigured } from "./supabase-client.js";
import { initializeSharedUI, escapeHtml, markdownToHtml, formatDate, showNotice } from "./ui.js";

initializeSharedUI();
const $ = (id) => document.getElementById(id);
const adminStatus = $("admin-status");
let currentUser = null;
let allTeachings = [];
let allCategories = [];
let currentTab = "teachings";
const isResetFlow = new URLSearchParams(location.search).get("reset") === "1";

function notice(message, type = "info") { showNotice(adminStatus, message, type); }
function hideNotice() { adminStatus.hidden = true; }
function safeColor(value, fallback) { return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback; }
function setPanelVisibility(panel) {
  ["setup-panel", "login-panel", "reset-panel", "dashboard"].forEach((id) => { $(id).hidden = id !== panel; });
}
function statusName(status) { return ({ published: "Publicado", draft: "Rascunho", unpublished: "Despublicado" })[status] || status; }
function categoryLabel(id) { return allCategories.find((item) => item.id === id)?.name || "Sem categoria"; }
function leafCategories() {
  const active = allCategories.filter((item) => item.is_active);
  const parentIds = new Set(active.map((item) => item.parent_id).filter(Boolean));
  return active.filter((item) => !parentIds.has(item.id));
}
function titleSlug(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}
async function verifyAdministrator(session) {
  if (!session?.user?.id) return false;
  const { data, error } = await supabase.from("admin_users").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (error) {
    notice("Não foi possível confirmar a permissão administrativa. Verifique se o SQL foi aplicado e se a conta está cadastrada na tabela admin_users.", "error");
    return false;
  }
  if (!data) {
    // Ter uma conta autenticada não significa ser administrador.
    await supabase.auth.signOut();
    notice("Esta conta entrou, mas não está autorizada a administrar a plataforma. A conta precisa ser adicionada à tabela admin_users no Supabase.", "error");
    return false;
  }
  currentUser = session.user;
  return true;
}
async function logAction(action, teachingId = null) {
  if (!currentUser) return;
  const { error } = await supabase.from("admin_logs").insert({ actor_id: currentUser.id, action, teaching_id: teachingId });
  if (error) console.warn("Não foi possível registrar o histórico administrativo.");
}
async function loadCategories() {
  const { data, error } = await supabase.from("categories").select("id,code,name,kind,parent_id,description,sort_order,is_active,created_at,updated_at").order("sort_order").order("name").limit(500);
  if (error) throw new Error(`Falha ao carregar categorias: ${error.message}`);
  allCategories = data || [];
  fillCategorySelects();
  renderCategoriesList();
}
function fillCategorySelects() {
  const leaf = leafCategories();
  const categorySelect = $("field-category");
  const selected = categorySelect.value;
  categorySelect.innerHTML = '<option value="">Selecione uma categoria</option>' + leaf.map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(categoryPath(cat))}</option>`).join("");
  if (leaf.some((item) => item.id === selected)) categorySelect.value = selected;
  const parentSelect = $("category-parent");
  const parentValue = parentSelect.value;
  parentSelect.innerHTML = '<option value="">Nenhuma (categoria principal)</option>' + allCategories.filter((cat) => cat.is_active).map((cat) => `<option value="${escapeHtml(cat.id)}">${escapeHtml(categoryPath(cat))}</option>`).join("");
  if (allCategories.some((item) => item.id === parentValue && item.is_active)) parentSelect.value = parentValue;
}
function categoryPath(category) {
  const parts = [category.name];
  let parent = allCategories.find((item) => item.id === category.parent_id);
  let guard = 0;
  while (parent && guard++ < 10) { parts.unshift(parent.name); parent = allCategories.find((item) => item.id === parent.parent_id); }
  return parts.join(" › ");
}
async function loadCounts() {
  const statuses = ["published", "draft", "unpublished"];
  const counts = await Promise.all(statuses.map((status) => supabase.from("teachings").select("id", { count: "exact", head: true }).eq("status", status)));
  if (counts.some((result) => result.error)) {
    notice("Não foi possível carregar as estatísticas. Confira as permissões do banco.", "error");
    return;
  }
  $("stat-published").textContent = counts[0].count ?? 0;
  $("stat-draft").textContent = counts[1].count ?? 0;
  $("stat-unpublished").textContent = counts[2].count ?? 0;
}
async function loadTeachings() {
  const { data, error } = await supabase.from("teachings").select("id,title,subtitle,summary,category_id,author_name,status,created_at,updated_at,published_at,cover_url,title_bg,title_color,subtitle_color,body_color,accent_color,title_align,title_scale,style_preset,created_by").order("updated_at", { ascending: false }).limit(300);
  if (error) throw new Error(`Falha ao carregar ensinamentos: ${error.message}`);
  allTeachings = data || [];
  renderTeachingList();
}
function renderTeachingList() {
  const term = $("admin-filter").value.trim().toLocaleLowerCase("pt-BR");
  const statusFilter = $("status-filter").value;
  const rows = allTeachings.filter((item) => (statusFilter === "all" || item.status === statusFilter)
    && `${item.title} ${item.summary || ""} ${categoryLabel(item.category_id)}`.toLocaleLowerCase("pt-BR").includes(term));
  const list = $("admin-teachings-list");
  if (!rows.length) { list.innerHTML = '<div class="empty-state">Nenhum ensinamento corresponde ao filtro. Crie um novo ou tente outro termo.</div>'; return; }
  list.innerHTML = rows.map((item) => `<article class="admin-list-row"><div class="admin-row-main"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(categoryLabel(item.category_id))} · Atualizado ${escapeHtml(formatDate(item.updated_at))} · <span class="status-pill status-${escapeHtml(item.status)}">${escapeHtml(statusName(item.status))}</span></small></div><div class="admin-row-actions"><button type="button" class="mini-button" data-edit="${escapeHtml(item.id)}">Editar</button><button type="button" class="mini-button" data-duplicate="${escapeHtml(item.id)}">Duplicar</button>${item.status === "published" ? `<button type="button" class="mini-button" data-unpublish="${escapeHtml(item.id)}">Despublicar</button>` : `<button type="button" class="mini-button" data-publish="${escapeHtml(item.id)}">Publicar</button>`}<button type="button" class="mini-button mini-danger" data-delete="${escapeHtml(item.id)}">Excluir</button></div></article>`).join("");
  list.querySelectorAll("[data-edit]").forEach((btn) => btn.addEventListener("click", () => editTeaching(btn.dataset.edit)));
  list.querySelectorAll("[data-duplicate]").forEach((btn) => btn.addEventListener("click", () => duplicateTeaching(btn.dataset.duplicate)));
  list.querySelectorAll("[data-publish]").forEach((btn) => btn.addEventListener("click", () => changeStatus(btn.dataset.publish, "published")));
  list.querySelectorAll("[data-unpublish]").forEach((btn) => btn.addEventListener("click", () => changeStatus(btn.dataset.unpublish, "unpublished")));
  list.querySelectorAll("[data-delete]").forEach((btn) => btn.addEventListener("click", () => deleteTeaching(btn.dataset.delete)));
}
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".admin-tab").forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  ["teachings", "editor", "categories", "history"].forEach((id) => { $(`tab-${id}`).hidden = id !== tab; });
  if (tab === "editor") updatePreview();
  if (tab === "history") loadHistory().catch((error) => notice(error.message, "error"));
}
function resetEditor() {
  $("teaching-form").reset();
  $("teaching-id").value = "";
  $("field-author").value = "Equipe Saberiza";
  $("field-status").value = "draft";
  $("field-title-bg").value = "#e8f3ec";
  $("field-title-color").value = "#174b3b";
  $("field-subtitle-color").value = "#23745b";
  $("field-body-color").value = "#24352f";
  $("field-accent-color").value = "#17654f";
  $("field-title-align").value = "left";
  $("field-title-scale").value = "1.9";
  $("field-style-preset").value = "classic";
  $("editor-heading").textContent = "Criar ensinamento";
  $("field-title").value = "";
  $("field-subtitle").value = "";
  $("field-summary").value = "";
  $("field-keywords").value = "";
  $("field-safety").value = "";
  $("field-references").value = "";
  $("field-difficulty").value = "not-set";
  $("field-category").value = "";
  $("field-cover").value = "";
  $("field-body").value = "";
  updatePreview();
}
async function editTeaching(id) {
  const { data, error } = await supabase.from("teachings").select("*").eq("id", id).maybeSingle();
  if (error || !data) { notice("Não foi possível abrir esse ensinamento. Atualize a lista e tente novamente.", "error"); return; }
  const map = {
    "teaching-id": data.id, "field-title": data.title, "field-subtitle": data.subtitle || "", "field-summary": data.summary || "",
    "field-keywords": Array.isArray(data.keywords) ? data.keywords.join(", ") : (data.keywords || ""), "field-safety": data.safety_notes || "", "field-references": data.references_text || "", "field-difficulty": data.difficulty || "not-set", "field-category": data.category_id || "",
    "field-author": data.author_name || "Equipe Saberiza", "field-cover": data.cover_url || "", "field-body": data.body || "", "field-status": data.status,
    "field-title-bg": data.title_bg || "#e8f3ec", "field-title-color": data.title_color || "#174b3b", "field-subtitle-color": data.subtitle_color || "#23745b",
    "field-body-color": data.body_color || "#24352f", "field-accent-color": data.accent_color || "#17654f", "field-title-align": data.title_align || "left",
    "field-title-scale": String(data.title_scale || 1.9), "field-style-preset": data.style_preset || "classic"
  };
  Object.entries(map).forEach(([id, value]) => { if ($(id)) $(id).value = value; });
  $("editor-heading").textContent = "Editar ensinamento";
  setTab("editor");
  updatePreview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function currentPayload() {
  const title = $("field-title").value.trim();
  const body = $("field-body").value.trim();
  const categoryId = $("field-category").value;
  if (title.length < 3) throw new Error("O título precisa ter pelo menos 3 caracteres.");
  if (!body) throw new Error("Escreva o conteúdo antes de salvar.");
  if (!categoryId) throw new Error("Selecione uma categoria ativa.");
  const cover = $("field-cover").value.trim();
  if (cover && !/^https:\/\//i.test(cover)) throw new Error("A imagem de capa precisa usar um endereço HTTPS.");
  const colorFields = ["field-title-bg", "field-title-color", "field-subtitle-color", "field-body-color", "field-accent-color"];
  if (colorFields.some((id) => !/^#[0-9a-f]{6}$/i.test($(id).value))) throw new Error("Uma das cores selecionadas é inválida.");
  const keywords = $("field-keywords").value.split(",").map((value) => value.trim()).filter(Boolean).slice(0, 30).join(", ");
  return {
    title, subtitle: $("field-subtitle").value.trim(), summary: $("field-summary").value.trim(), body,
    keywords, safety_notes: $("field-safety").value.trim().slice(0, 2000),
    references_text: $("field-references").value.trim().slice(0, 5000), difficulty: $("field-difficulty").value,
    category_id: categoryId, author_name: $("field-author").value.trim().slice(0, 80) || "Autor",
    cover_url: cover || null, status: $("field-status").value,
    title_bg: $("field-title-bg").value.toLowerCase(), title_color: $("field-title-color").value.toLowerCase(),
    subtitle_color: $("field-subtitle-color").value.toLowerCase(), body_color: $("field-body-color").value.toLowerCase(),
    accent_color: $("field-accent-color").value.toLowerCase(), title_align: $("field-title-align").value,
    title_scale: Number($("field-title-scale").value), style_preset: $("field-style-preset").value
  };
}
async function saveTeaching(event) {
  event.preventDefault();
  let payload;
  try { payload = currentPayload(); } catch (error) { notice(error.message, "error"); return; }
  const id = $("teaching-id").value;
  const saveButton = $("teaching-form").querySelector('button[type="submit"]');
  saveButton.disabled = true; saveButton.textContent = "Salvando…";
  try {
    let result;
    if (id) result = await supabase.from("teachings").update(payload).eq("id", id).select("id").single();
    else result = await supabase.from("teachings").insert({ ...payload, created_by: currentUser.id }).select("id").single();
    if (result.error) throw result.error;
    await logAction(id ? `update_${payload.status}` : `create_${payload.status}`, result.data.id);
    await Promise.all([loadTeachings(), loadCounts()]);
    notice(payload.status === "published" ? "Ensinamento salvo e publicado." : payload.status === "draft" ? "Rascunho salvo no banco de dados." : "Ensinamento salvo e despublicado.", "success");
    resetEditor(); setTab("teachings");
  } catch (error) {
    notice(`Não foi possível salvar. Verifique sua conexão, a categoria selecionada e as políticas do banco. Detalhe: ${error?.message || "erro desconhecido"}`, "error");
  } finally { saveButton.disabled = false; saveButton.textContent = "Salvar alterações"; }
}
async function changeStatus(id, nextStatus) {
  const item = allTeachings.find((entry) => entry.id === id);
  if (!item) return;
  const action = nextStatus === "published" ? "publicar" : "despublicar";
  if (!window.confirm(`Deseja ${action} “${item.title}”?`)) return;
  const { error } = await supabase.from("teachings").update({ status: nextStatus }).eq("id", id);
  if (error) { notice(`A operação falhou: ${error.message}`, "error"); return; }
  await logAction(`status_${nextStatus}`, id);
  await Promise.all([loadTeachings(), loadCounts()]);
  notice(nextStatus === "published" ? "Ensinamento publicado." : "Ensinamento despublicado e oculto do público.", "success");
}
async function deleteTeaching(id) {
  const item = allTeachings.find((entry) => entry.id === id);
  if (!item || !window.confirm(`Excluir “${item.title}” permanentemente? Essa ação não pode ser desfeita.`)) return;
  const { error } = await supabase.from("teachings").delete().eq("id", id);
  if (error) { notice(`Não foi possível excluir: ${error.message}`, "error"); return; }
  await logAction("delete_teaching", id);
  await Promise.all([loadTeachings(), loadCounts()]);
  notice("Ensinamento excluído.", "success");
}
async function duplicateTeaching(id) {
  const { data, error } = await supabase.from("teachings").select("title,subtitle,summary,body,keywords,safety_notes,references_text,difficulty,category_id,author_name,cover_url,title_bg,title_color,subtitle_color,body_color,accent_color,title_align,title_scale,style_preset").eq("id", id).single();
  if (error || !data) { notice("Não foi possível duplicar esse ensinamento.", "error"); return; }
  const result = await supabase.from("teachings").insert({ ...data, title: `${data.title} (cópia)`.slice(0, 180), status: "draft", created_by: currentUser.id }).select("id").single();
  if (result.error) { notice(`Não foi possível duplicar: ${result.error.message}`, "error"); return; }
  await logAction("duplicate_teaching", result.data.id);
  await Promise.all([loadTeachings(), loadCounts()]);
  notice("Cópia criada como rascunho.", "success");
}
function renderCategoriesList() {
  const list = $("admin-categories-list");
  if (!list) return;
  if (!allCategories.length) { list.innerHTML = '<div class="empty-state">Nenhuma categoria foi encontrada. Crie a primeira acima.</div>'; return; }
  list.innerHTML = allCategories.map((cat) => {
    const siblings = allCategories.filter((item) => item.parent_id === cat.parent_id).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));
    const siblingIndex = siblings.findIndex((item) => item.id === cat.id);
    return `<article class="admin-list-row"><div class="admin-row-main"><strong>${escapeHtml(cat.name)}</strong><small>${escapeHtml(categoryPath(cat))} · ${escapeHtml(cat.kind)} · <span class="status-pill ${cat.is_active ? "status-published" : "status-unpublished"}">${cat.is_active ? "Ativa" : "Inativa"}</span></small></div><div class="admin-row-actions"><button type="button" class="mini-button" data-rename-category="${escapeHtml(cat.id)}">Renomear</button><button type="button" class="mini-button" data-move-category="${escapeHtml(cat.id)}" data-direction="up" ${siblingIndex === 0 ? "disabled" : ""} aria-label="Mover ${escapeHtml(cat.name)} para cima">↑</button><button type="button" class="mini-button" data-move-category="${escapeHtml(cat.id)}" data-direction="down" ${siblingIndex === siblings.length - 1 ? "disabled" : ""} aria-label="Mover ${escapeHtml(cat.name)} para baixo">↓</button><button type="button" class="mini-button" data-toggle-category="${escapeHtml(cat.id)}" data-active="${cat.is_active ? "1" : "0"}">${cat.is_active ? "Desativar" : "Ativar"}</button></div></article>`;
  }).join("");
  list.querySelectorAll("[data-rename-category]").forEach((button) => button.addEventListener("click", async () => {
    const category = allCategories.find((item) => item.id === button.dataset.renameCategory);
    if (!category) return;
    const answer = window.prompt("Novo nome da categoria:", category.name);
    if (answer === null) return;
    const name = answer.trim();
    if (!name || name.length > 100) { notice("O nome deve ter entre 1 e 100 caracteres.", "error"); return; }
    const { error } = await supabase.from("categories").update({ name }).eq("id", category.id);
    if (error) { notice(`Não foi possível renomear a categoria: ${error.message}`, "error"); return; }
    await logAction("rename_category"); await loadCategories();
    notice("Categoria renomeada. Links com o código antigo continuam funcionando.", "success");
  }));
  list.querySelectorAll("[data-move-category]").forEach((button) => button.addEventListener("click", async () => {
    const category = allCategories.find((item) => item.id === button.dataset.moveCategory);
    if (!category) return;
    const siblings = allCategories.filter((item) => item.parent_id === category.parent_id).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pt-BR"));
    const index = siblings.findIndex((item) => item.id === category.id);
    const otherIndex = index + (button.dataset.direction === "up" ? -1 : 1);
    if (index < 0 || otherIndex < 0 || otherIndex >= siblings.length) return;
    const first = siblings[index], second = siblings[otherIndex];
    const firstOrder = first.sort_order, secondOrder = second.sort_order;
    const a = await supabase.from("categories").update({ sort_order: secondOrder }).eq("id", first.id);
    const b = await supabase.from("categories").update({ sort_order: firstOrder }).eq("id", second.id);
    if (a.error || b.error) { notice("Não foi possível alterar a ordem. Atualize a lista e tente novamente.", "error"); return; }
    await logAction("reorder_categories"); await loadCategories();
    notice("Ordem das categorias atualizada.", "success");
  }));
  list.querySelectorAll("[data-toggle-category]").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.toggleCategory;
    const active = button.dataset.active === "1";
    const cat = allCategories.find((item) => item.id === id);
    if (!cat) return;
    if (active && allCategories.some((item) => item.parent_id === id && item.is_active)) {
      notice("Desative primeiro as subcategorias ativas ou mova-as para outra categoria. Isso evita deixar itens ativos dentro de uma categoria oculta.", "error"); return;
    }
    if (!window.confirm(`${active ? "Desativar" : "Ativar"} a categoria “${cat.name}”? Os ensinamentos vinculados não serão apagados.`)) return;
    const { error } = await supabase.from("categories").update({ is_active: !active }).eq("id", id);
    if (error) { notice(`Não foi possível alterar a categoria: ${error.message}`, "error"); return; }
    await logAction(active ? "deactivate_category" : "activate_category");
    await loadCategories(); await loadTeachings();
    notice(`Categoria ${active ? "desativada" : "ativada"}.`, "success");
  }));
}
async function createCategory(event) {
  event.preventDefault();
  const name = $("category-name").value.trim();
  let code = $("category-code").value.trim().toLowerCase();
  const kind = $("category-kind").value;
  const parentId = $("category-parent").value || null;
  if (!code) code = titleSlug(name);
  if (!name || !code) { notice("Preencha o nome e o código da categoria.", "error"); return; }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(code)) { notice("O código deve conter apenas letras minúsculas, números e hífens.", "error"); return; }
  if (allCategories.some((item) => item.code === code)) { notice("Este código já existe. Escolha outro.", "error"); return; }
  const parentCategory = parentId ? allCategories.find((item) => item.id === parentId) : null;
  const validParent = {
    stage: !parentId,
    general: !parentId,
    grade: parentCategory?.kind === "stage",
    subject: parentCategory?.kind === "grade",
    topic: ["general", "topic", "subject"].includes(parentCategory?.kind)
  };
  if (!validParent[kind]) {
    notice(kind === "stage" || kind === "general" ? "Etapas escolares e Conhecimentos Gerais devem ficar no nível principal." : kind === "grade" ? "Selecione uma etapa escolar como categoria superior." : kind === "subject" ? "Selecione um ano/série como categoria superior." : "Para um assunto, selecione Conhecimentos Gerais, outro assunto ou uma matéria como categoria superior.", "error");
    return;
  }
  const siblingOrders = allCategories.filter((item) => item.parent_id === parentId).map((item) => Number(item.sort_order) || 0);
  const sortOrder = Math.max(0, ...siblingOrders) + 10;
  const { error } = await supabase.from("categories").insert({ name, code, kind, parent_id: parentId, sort_order: sortOrder, is_active: true, description: "" });
  if (error) { notice(`Não foi possível criar a categoria: ${error.message}`, "error"); return; }
  await logAction("create_category");
  $("category-form").reset();
  $("category-code").dataset.edited = "";
  await loadCategories();
  notice("Categoria criada.", "success");
}
async function loadHistory() {
  const { data, error } = await supabase.from("admin_logs").select("id,action,teaching_id,created_at,actor_id").order("created_at", { ascending: false }).limit(50);
  const list = $("admin-history-list");
  if (error) { list.innerHTML = '<div class="empty-state">O histórico não pôde ser carregado. Confira as políticas RLS.</div>'; return; }
  if (!data?.length) { list.innerHTML = '<div class="empty-state">Ainda não há operações registradas.</div>'; return; }
  list.innerHTML = data.map((item) => `<article class="admin-list-row"><div class="admin-row-main"><strong>${escapeHtml(item.action.replace(/_/g, " "))}</strong><small>${escapeHtml(formatDate(item.created_at))} · ${escapeHtml(new Date(item.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))}${item.teaching_id ? ` · Conteúdo ${escapeHtml(item.teaching_id.slice(0, 8))}` : ""}</small></div></article>`).join("");
}
function markdownPreview() {
  const title = $("field-title").value.trim() || "Título do ensinamento";
  const subtitle = $("field-subtitle").value.trim() || "O subtítulo aparecerá aqui.";
  $("preview-title").textContent = title;
  $("preview-subtitle").textContent = subtitle;
  $("preview-title").style.color = safeColor($("field-title-color").value, "#174b3b");
  $("preview-title").style.fontSize = `${Math.max(1.5, Math.min(2.7, Number($("field-title-scale").value) || 1.9))}rem`;
  $("preview-subtitle").style.color = safeColor($("field-subtitle-color").value, "#23745b");
  $("preview-body").style.color = safeColor($("field-body-color").value, "#24352f");
  $("preview-body").innerHTML = markdownToHtml($("field-body").value || "Seu conteúdo será exibido nesta área.");
  $("preview-body").querySelectorAll("h2,h3,h4,a").forEach((el) => { el.style.color = safeColor($("field-accent-color").value, "#17654f"); });
  const block = document.querySelector(".preview-title-block");
  block.style.backgroundColor = safeColor($("field-title-bg").value, "#e8f3ec");
  block.style.color = safeColor($("field-title-color").value, "#174b3b");
  block.style.textAlign = $("field-title-align").value === "center" ? "center" : "left";
  block.style.borderRadius = $("field-style-preset").value === "minimal" ? "8px" : $("field-style-preset").value === "note" ? "8px 18px 18px 8px" : "14px";
  block.style.borderLeft = $("field-style-preset").value === "note" ? `4px solid ${safeColor($("field-accent-color").value, "#17654f")}` : "0";
  const titleRatio = contrastRatio(safeColor($("field-title-color").value, "#174b3b"), safeColor($("field-title-bg").value, "#e8f3ec"));
  const bodyRatio = contrastRatio(safeColor($("field-body-color").value, "#24352f"), document.body.dataset.theme === "dark" ? "#17241e" : "#ffffff");
  const contrast = $("contrast-status");
  if (contrast) {
    const titleGood = titleRatio >= 3;
    const bodyGood = bodyRatio >= 4.5;
    contrast.textContent = `Contraste estimado — título: ${titleRatio.toFixed(1)}:1 (${titleGood ? "adequado para texto grande" : "baixo"}); texto: ${bodyRatio.toFixed(1)}:1 (${bodyGood ? "adequado" : "pode ficar difícil de ler"}). Prefira título ≥ 3:1 e texto comum ≥ 4,5:1.`;
    contrast.style.color = titleGood && bodyGood ? "var(--green)" : "var(--rose)";
  }
}
function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const c = hex.slice(1).match(/.{2}/g).map((pair) => parseInt(pair, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2);
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const l1 = luminance(foreground), l2 = luminance(background);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
function updatePreview() { markdownPreview(); }
async function enterDashboard(session) {
  hideNotice();
  if (!(await verifyAdministrator(session))) { setPanelVisibility("login-panel"); return; }
  setPanelVisibility("dashboard");
  try {
    await Promise.all([loadCategories(), loadTeachings(), loadCounts()]);
    setTab("teachings");
  } catch (error) { notice(error.message || "Falha ao abrir o painel.", "error"); }
}
async function initialize() {
  if (!supabaseConfigured || !supabase) { setPanelVisibility("setup-panel"); notice("O login permanece indisponível até configurar o Supabase. Nenhuma autenticação de demonstração foi criada.", "info"); return; }
  if (isResetFlow) { setPanelVisibility("reset-panel"); }
  else { setPanelVisibility("login-panel"); }

  $("login-form").addEventListener("submit", async (event) => {
    event.preventDefault(); hideNotice();
    const email = $("login-email").value.trim();
    const password = $("login-password").value;
    const button = $("login-form").querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = "Verificando…";
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    button.disabled = false; button.textContent = "Entrar no painel";
    if (error || !data?.session) { notice("Não foi possível entrar. Confira os dados ou recupere sua senha. Se continuar, verifique o usuário no Supabase.", "error"); return; }
    await enterDashboard(data.session);
  });

  $("forgot-password").addEventListener("click", async () => {
    hideNotice();
    const email = $("login-email").value.trim();
    if (!email) { notice("Digite seu e-mail administrativo acima e depois toque em Esqueci minha senha.", "error"); return; }
    const redirectTo = `${location.origin}${location.pathname}?reset=1`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) { notice("Não foi possível solicitar a recuperação. Confirme o e-mail e as URLs autorizadas em Authentication > URL Configuration no Supabase.", "error"); return; }
    notice("Se esse e-mail estiver cadastrado, o serviço enviará as instruções de recuperação. Confira também a pasta de spam.", "success");
  });

  $("reset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = $("new-password").value;
    if (password.length < 10) { notice("Use pelo menos 10 caracteres.", "error"); return; }
    if (password !== $("new-password-confirm").value) { notice("As senhas não coincidem.", "error"); return; }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { notice("Não foi possível atualizar a senha. Abra novamente o link de recuperação mais recente.", "error"); return; }
    await supabase.auth.signOut();
    history.replaceState(null, "", location.pathname);
    setPanelVisibility("login-panel");
    notice("Senha atualizada. Entre novamente com sua nova senha.", "success");
  });

  $("logout-button").addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    currentUser = null; allTeachings = []; allCategories = [];
    setPanelVisibility("login-panel");
    if (error) notice("A sessão local foi encerrada, mas o serviço relatou um problema ao concluir o logout. Feche o navegador se estiver em um aparelho compartilhado.", "error");
    else notice("Você saiu do painel administrativo.", "success");
  });
  document.querySelectorAll(".admin-tab").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
  $("new-teaching-button").addEventListener("click", () => { resetEditor(); setTab("editor"); window.scrollTo({ top: 0, behavior: "smooth" }); });
  $("cancel-edit").addEventListener("click", () => { resetEditor(); setTab("teachings"); });
  $("teaching-form").addEventListener("submit", saveTeaching);
  $("copy-ai-prompt").addEventListener("click", async () => {
    const content = $("field-body").value.trim();
    if (!content) { notice("Escreva primeiro o texto que deseja revisar.", "error"); return; }
    const prompt = `Revise o texto abaixo em português do Brasil. Corrija ortografia, gramática, pontuação, clareza e organização sem mudar o sentido nem o estilo do autor. Não invente fatos, exemplos, dados ou referências. Se algo parecer incorreto ou incerto, sinalize para conferência em vez de adivinhar. Preserve avisos de segurança. Retorne somente a versão revisada e, ao final, uma lista curta de dúvidas factuais que precisam ser verificadas.

TEXTO ORIGINAL:
${content}`;
    try { await navigator.clipboard.writeText(prompt); notice("Pedido de revisão e texto copiados. Cole-os na ferramenta de IA escolhida e compare a resposta antes de salvar.", "success"); }
    catch { notice("O navegador não permitiu copiar automaticamente. Selecione e copie o texto manualmente, depois peça a revisão à ferramenta de IA.", "error"); }
  });
  $("category-form").addEventListener("submit", createCategory);
  $("admin-filter").addEventListener("input", renderTeachingList);
  $("status-filter").addEventListener("change", renderTeachingList);
  ["field-title", "field-subtitle", "field-body", "field-title-bg", "field-title-color", "field-subtitle-color", "field-body-color", "field-accent-color", "field-title-align", "field-title-scale", "field-style-preset"].forEach((id) => $(id).addEventListener("input", updatePreview));
  $("category-name").addEventListener("input", () => { if (!$("category-code").dataset.edited) $("category-code").value = titleSlug($("category-name").value); });
  $("category-code").addEventListener("input", () => { $("category-code").dataset.edited = "1"; });

  const { data, error } = await supabase.auth.getSession();
  if (error) { notice("Não foi possível verificar a sessão. Atualize a página e tente novamente.", "error"); return; }
  if (isResetFlow) {
    if (!data.session) notice("Abra o link de recuperação enviado por e-mail neste navegador. Se o link expirou, solicite outro na tela de login.", "info");
    else setPanelVisibility("reset-panel");
  } else if (data.session) await enterDashboard(data.session);
}
initialize().catch((error) => {
  setPanelVisibility("login-panel");
  notice("O painel não conseguiu iniciar. Verifique a configuração e a conexão com o Supabase.", "error");
  console.error("Falha ao iniciar painel:", error?.message || "erro desconhecido");
});
