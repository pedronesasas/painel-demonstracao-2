/**
 * O banco da demonstração: uma empresa fictícia de produtos digitais, gerada
 * no navegador a cada visita. Nomes de pessoas, produtos, números e textos
 * são todos inventados.
 *
 * As datas são montadas a partir de hoje, para a demo parecer sempre "viva":
 * tarefas vencendo esta semana, campanha da semana em andamento etc.
 */

export type Linha = Record<string, unknown>;
export type Banco = Record<string, Linha[]>;

// ---------------------------------------------------------------- utilidades

/** Sorteio com semente fixa: a mesma visita gera sempre os mesmos dados. */
function sorteador(semente: number) {
  let s = semente >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    rnd,
    int: (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min,
    pick: <T,>(lista: readonly T[]): T => lista[Math.floor(rnd() * lista.length)]!,
    chance: (p: number) => rnd() < p,
  };
}

let contador = 0;
/** IDs no formato de UUID, estáveis entre o servidor e o navegador. */
function uid(prefixo: number): string {
  contador += 1;
  const n = contador.toString(16).padStart(12, "0");
  return `${prefixo.toString(16).padStart(8, "0")}-0000-4000-8000-${n}`;
}

function hojeLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDias(iso: string, n: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a!, m! - 1, d! + n));
  return dt.toISOString().slice(0, 10);
}

const momento = (dia: string, hora = 12, min = 0) =>
  `${dia}T${String(hora).padStart(2, "0")}:${String(min).padStart(2, "0")}:00.000Z`;

/** Segunda-feira da semana de `iso`. */
function segunda(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = new Date(Date.UTC(a!, m! - 1, d!)).getUTCDay();
  return addDias(iso, dia === 0 ? -6 : 1 - dia);
}

function semanaISO(iso: string): { ano: number; semana: number } {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a!, m! - 1, d!));
  const dia = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return { ano: dt.getUTCFullYear(), semana: Math.ceil(((dt.getTime() - inicio.getTime()) / 864e5 + 1) / 7) };
}

// Texto rico (formato do editor TipTap)
const txt = (t: string) => ({ type: "text", text: t });
const par = (t: string) => ({ type: "paragraph", content: t ? [txt(t)] : [] });
const tit = (t: string, nivel = 2) => ({ type: "heading", attrs: { level: nivel }, content: [txt(t)] });
const lista = (itens: string[]) => ({
  type: "bulletList",
  content: itens.map((i) => ({ type: "listItem", content: [par(i)] })),
});
const numerada = (itens: string[]) => ({
  type: "orderedList",
  attrs: { start: 1 },
  content: itens.map((i) => ({ type: "listItem", content: [par(i)] })),
});
const doc = (...blocos: unknown[]) => ({ type: "doc", content: blocos });

// ---------------------------------------------------------------- pessoas

export const DEMO_USER = {
  id: "00000000-0000-4000-8000-000000000001",
  full_name: "Admin Demo",
  email: "admin@nexus.demo",
};

const P = {
  demo: DEMO_USER,
  ana: { id: "00000000-0000-4000-8000-000000000002", full_name: "Ana Ribeiro", email: "ana@nexus.demo" },
  bruno: { id: "00000000-0000-4000-8000-000000000003", full_name: "Bruno Costa", email: "bruno@nexus.demo" },
  carla: { id: "00000000-0000-4000-8000-000000000004", full_name: "Carla Mendes", email: "carla@nexus.demo" },
  diego: { id: "00000000-0000-4000-8000-000000000005", full_name: "Diego Rocha", email: "diego@nexus.demo" },
  elisa: { id: "00000000-0000-4000-8000-000000000006", full_name: "Elisa Prado", email: "elisa@nexus.demo" },
  fabio: { id: "00000000-0000-4000-8000-000000000007", full_name: "Fábio Nunes", email: "fabio@nexus.demo" },
  helena: { id: "00000000-0000-4000-8000-000000000008", full_name: "Helena Duarte", email: "helena@nexus.demo" },
  igor: { id: "00000000-0000-4000-8000-000000000009", full_name: "Igor Matos", email: "igor@nexus.demo" },
};

// ---------------------------------------------------------------- geração

export function gerarBanco(): Banco {
  contador = 0;
  const r = sorteador(20261109);
  const hoje = hojeLocal();
  const criadoBase = momento(addDias(hoje, -150), 9);
  const b: Banco = {};

  // ---------- permissões ----------
  const perfis = {
    equipe: { id: uid(1), name: "Equipe", description: "Vê e edita a operação do dia a dia.", is_system: false },
    editor: { id: uid(1), name: "Editor de vídeo", description: "Esteira de edição e relatório de horas.", is_system: false },
    leitura: { id: uid(1), name: "Leitura", description: "Só consulta.", is_system: true },
  };
  b.permission_profiles = Object.values(perfis).map((p) => ({ ...p, created_at: criadoBase, updated_at: criadoBase }));

  const ABAS = ["dashboard", "campaigns", "products", "import", "compare", "ranking", "boards", "funnels", "calendar", "reports", "users", "settings", "documents", "vsls", "chips"];
  b.profile_tab_permissions = [];
  for (const aba of ABAS) {
    const sistema = aba === "users" || aba === "settings";
    b.profile_tab_permissions.push({ profile_id: perfis.equipe.id, tab: aba, can_view: !sistema, can_edit: !sistema && aba !== "import" });
    b.profile_tab_permissions.push({ profile_id: perfis.editor.id, tab: aba, can_view: ["boards", "calendar", "documents", "vsls", "reports"].includes(aba), can_edit: aba === "boards" });
    b.profile_tab_permissions.push({ profile_id: perfis.leitura.id, tab: aba, can_view: !sistema, can_edit: false });
  }
  const CAPS = ["move_cards", "create_board", "create_column", "manage_custom_fields", "manage_calendar", "manage_tags", "view_reports", "override_dependencies", "manage_column_kinds", "log_video_edit", "manage_editor_targets", "manage_squads"];
  b.profile_capabilities = [
    ...CAPS.map((c) => ({ profile_id: perfis.equipe.id, capability: c, enabled: ["move_cards", "manage_calendar", "view_reports", "manage_tags"].includes(c) })),
    ...CAPS.map((c) => ({ profile_id: perfis.editor.id, capability: c, enabled: ["move_cards", "log_video_edit"].includes(c) })),
  ];
  b.role_capabilities = [];
  b.tab_permissions = [];

  const equipe: Array<[typeof P.ana, string, "admin" | "editor" | "viewer"]> = [
    [P.demo, perfis.equipe.id, "admin"],
    [P.ana, perfis.equipe.id, "admin"],
    [P.bruno, perfis.equipe.id, "editor"],
    [P.carla, perfis.equipe.id, "editor"],
    [P.diego, perfis.editor.id, "editor"],
    [P.elisa, perfis.editor.id, "editor"],
    [P.fabio, perfis.equipe.id, "editor"],
    [P.helena, perfis.equipe.id, "editor"],
    [P.igor, perfis.editor.id, "editor"],
  ];
  b.profiles = equipe.map(([p, perfil]) => ({ id: p.id, full_name: p.full_name, email: p.email, status: "approved", profile_id: perfil, created_at: criadoBase }));
  b.profiles.push({ id: uid(2), full_name: "Novo Colaborador", email: "novo@nexus.demo", status: "pending", profile_id: null, created_at: momento(addDias(hoje, -1), 15) });
  b.user_roles = equipe.map(([p, , papel]) => ({ id: uid(3), user_id: p.id, role: papel, created_at: criadoBase }));

  const squads = {
    criativos: { id: uid(4), name: "Criativos", color: "#8b5cf6" },
    performance: { id: uid(4), name: "Performance", color: "#22c55e" },
  };
  b.squads = Object.values(squads).map((s) => ({ ...s, created_at: criadoBase, updated_at: criadoBase }));
  b.squad_members = [
    [squads.criativos.id, P.bruno.id], [squads.criativos.id, P.diego.id], [squads.criativos.id, P.elisa.id], [squads.criativos.id, P.demo.id],
    [squads.performance.id, P.carla.id], [squads.performance.id, P.helena.id], [squads.performance.id, P.demo.id],
  ].map(([squad_id, user_id]) => ({ squad_id, user_id, created_at: criadoBase }));

  // ---------- esteiras ----------
  const tipos = {
    pendente: { id: uid(5), label: "Pendente", is_done: false, is_paused: false, is_system: true, sort: 10 },
    andamento: { id: uid(5), label: "Em progresso", is_done: false, is_paused: false, is_system: true, sort: 20 },
    revisao: { id: uid(5), label: "Revisão", is_done: false, is_paused: false, is_system: false, sort: 30 },
    metricas: { id: uid(5), label: "Validação", is_done: false, is_paused: false, is_system: false, sort: 40 },
    pausada: { id: uid(5), label: "Pausada", is_done: false, is_paused: true, is_system: true, sort: 50 },
    concluido: { id: uid(5), label: "Concluído", is_done: true, is_paused: false, is_system: true, sort: 90 },
  };
  b.board_column_kinds = Object.values(tipos).map((k) => ({ ...k, created_at: criadoBase, updated_at: criadoBase }));

  const esteiras = [
    { nome: "Conteúdo", cor: "#e17d73", colunas: ["pendente", "andamento", "revisao", "pausada", "concluido"] },
    { nome: "Mídia paga", cor: "#6366f1", colunas: ["pendente", "andamento", "metricas", "pausada", "concluido"] },
    { nome: "Design e Vídeo", cor: "#22c55e", colunas: ["pendente", "andamento", "revisao", "pausada", "concluido"] },
    { nome: "Site e Checkout", cor: "#f97316", colunas: ["pendente", "andamento", "revisao", "pausada", "concluido"] },
    { nome: "Experimentos", cor: "#eab308", colunas: ["pendente", "andamento", "metricas", "pausada", "concluido"] },
    { nome: "Operações", cor: "#14b8a6", colunas: ["pendente", "andamento", "pausada", "concluido"] },
  ] as const;
  const COR_COLUNA: Record<string, string> = { pendente: "#64748b", andamento: "#3b82f6", revisao: "#a855f7", metricas: "#06b6d4", pausada: "#94a3b8", concluido: "#22c55e" };
  b.boards = [];
  b.board_columns = [];
  const boardId: Record<string, string> = {};
  const colunasDe: Record<string, Record<string, string>> = {};
  esteiras.forEach((e, i) => {
    const id = uid(6);
    boardId[e.nome] = id;
    colunasDe[id] = {};
    b.boards!.push({ id, name: e.nome, description: null, color: e.cor, icon: null, position: i, short_prefix: "CARD", created_by: P.demo.id, created_at: criadoBase, updated_at: criadoBase });
    e.colunas.forEach((k, pos) => {
      const tipo = tipos[k as keyof typeof tipos];
      const cid = uid(7);
      colunasDe[id]![k] = cid;
      b.board_columns!.push({ id: cid, board_id: id, name: tipo.label, color: COR_COLUNA[k], position: pos, kind_id: tipo.id, is_done_column: tipo.is_done, is_paused_column: tipo.is_paused, wip_limit: k === "andamento" ? 5 : null, created_at: criadoBase });
    });
  });
  b.board_user_access = [];
  b.board_profile_access = [];

  const tags = [
    ["Lançamento", "#3b82f6"], ["Peça visual", "#a855f7"], ["Prioridade da diretoria", "#ef4444"],
    ["Ideia", "#eab308"], ["Bug", "#f97316"], ["Recorrente", "#14b8a6"],
  ].map(([name, color]) => ({ id: uid(8), name, color, created_at: criadoBase }));
  b.tags = tags;

  // ---------- produtos e mercados ----------
  const mercados = [
    { code: "pt-BR", name: "Português (Brasil)", currency: "BRL", flag: "🇧🇷", region: "BR", position: 1 },
    { code: "ESP", name: "LATAM", currency: "USD", flag: "🌎", region: "LATAM", position: 2 },
    { code: "ALE", name: "Alemão", currency: "EUR", flag: "🇩🇪", region: "ALE", position: 3 },
    { code: "ITA", name: "Italiano", currency: "EUR", flag: "🇮🇹", region: "ITA", position: 4 },
    { code: "FRA", name: "Francês", currency: "EUR", flag: "🇫🇷", region: "FRA", position: 5 },
  ].map((m) => ({ id: uid(9), active: true, created_at: criadoBase, updated_at: criadoBase, ...m }));
  b.languages = mercados;
  const BR = mercados[0]!;

  const produtos = [1, 2, 3, 4, 5, 6].map((n) => ({
    id: uid(10), name: `PR${n} - PRODUTO ${n}`, code: `PR${n}`, kind: "principal",
    price: [197, 147, 97, 197, 67, 297][n - 1], archived: n === 6, has_backend: n <= 4,
    details: n === 6 ? "Oferta encerrada em agosto. Mantida para histórico." : null,
    created_by: P.demo.id, created_at: criadoBase, updated_at: criadoBase,
  }));
  b.products = [
    ...produtos,
    ...[1, 2].map((n) => ({
      id: uid(10), name: `PR${n} - PRODUTO ${n} [Upsell] Guia avançado`, code: null, kind: "upsell", price: 97, archived: false,
      has_backend: false, details: null, created_by: P.demo.id, created_at: criadoBase, updated_at: criadoBase,
    })),
  ];
  const nomeProduto = (p: Linha) => String(p.name).replace(/^\w+ - /, "");

  // Em quais mercados cada produto vende
  const vendeEm: Record<number, number[]> = { 0: [0, 1, 2, 3, 4], 1: [0, 1, 2], 2: [0, 3], 3: [0, 1], 4: [0], 5: [0] };
  const PRECO_FORA: Record<string, number> = { USD: 37, EUR: 39 };
  b.product_localizations = [];
  produtos.forEach((p, i) => {
    for (const mi of vendeEm[i]!) {
      const m = mercados[mi]!;
      const br = m.region === "BR";
      b.product_localizations!.push({
        id: uid(11), product_id: p.id, language_id: m.id,
        price: br ? p.price : PRECO_FORA[m.currency], currency: m.currency,
        platform: br ? "plataforma_a" : "plataforma_b",
        funnel_url: `https://exemplo.com/${String(p.code).toLowerCase()}/${m.region.toLowerCase()}/`,
        presell_url: null, links: [{ title: "Página de vendas", url: `https://exemplo.com/${String(p.code).toLowerCase()}/${m.region.toLowerCase()}/` }],
        external_ids: {}, tracking_pixels: {}, notes: null, created_at: criadoBase, updated_at: criadoBase,
      });
    }
  });

  // ---------- VSLs ----------
  b.vsls = [];
  const vslDe: Record<string, string> = {};
  const TIPOS_FRONT = ["FRONT", "UP1", "DOWN1", "UP2", "DOWN2"] as const;
  const TIPOS_BACK = ["FRONT", "UP1", "DOWN1"] as const;
  const ROTULO_VIDEO: Record<string, string> = {
    FRONT: "Vídeo de vendas", UP1: "Oferta extra 1", DOWN1: "Alternativa 1", UP2: "Oferta extra 2", DOWN2: "Alternativa 2",
  };
  produtos.slice(0, 5).forEach((p, i) => {
    for (const mi of vendeEm[i]!) {
      const m = mercados[mi]!;
      for (const [estagio, tiposVsl] of [["FRONT", TIPOS_FRONT], ["BACK", TIPOS_BACK]] as const) {
        if (estagio === "BACK" && !p.has_backend) continue;
        if (estagio === "BACK" && m.region !== "BR" && mi > 1) continue;
        tiposVsl.forEach((tipo, ti) => {
          const pitch = tipo === "FRONT" ? r.int(900, 1600) : r.int(180, 420);
          const editor = r.pick(["J", "EX"]);
          const id = uid(12);
          vslDe[`${p.id}|${m.id}|${estagio}|${tipo}`] = id;
          const rotulo = ROTULO_VIDEO[tipo];
          b.vsls!.push({
            id, product_id: p.id, language_id: m.id, type: tipo, funnel_stage: estagio,
            name: `${nomeProduto(p).charAt(0)}${nomeProduto(p).slice(1).toLowerCase()} · ${rotulo} · ${m.region} · ${estagio === "BACK" ? "clientes" : "anúncios"} · v${r.int(1, 3)}`,
            pitch_time_seconds: pitch, conversion_pct: tipo === "FRONT" ? Number((r.rnd() * 5 + 0.8).toFixed(2)) : Number((r.rnd() * 18 + 3).toFixed(2)),
            editor, is_live: ti < 3 || r.chance(0.5), parent_id: null, part: null, segment: null,
            vturb_player_id: `${r.int(1e7, 9e7).toString(16)}${r.int(1e7, 9e7).toString(16)}`,
            notes: null, created_by: P.demo.id, created_at: criadoBase, updated_at: criadoBase,
          });
        });
      }
    }
  });

  // ---------- funis ----------
  b.funnels = [];
  b.funnel_steps = [];
  const funilDe: Record<string, string> = {};
  produtos.slice(0, 5).forEach((p, i) => {
    for (const mi of vendeEm[i]!) {
      const m = mercados[mi]!;
      for (const estagio of ["FRONT", "BACK"] as const) {
        if (estagio === "BACK" && (!p.has_backend || (m.region !== "BR" && mi > 1))) continue;
        const id = uid(13);
        funilDe[`${p.id}|${m.region}|${estagio}`] = id;
        const slug = `${String(p.code).toLowerCase()}-${m.region.toLowerCase()}${estagio === "BACK" ? "-back" : ""}`;
        b.funnels!.push({
          id, product_id: p.id, language_id: m.id, stage: estagio,
          is_running: estagio === "FRONT" ? i < 4 : m.region === "BR" && i < 2,
          running_changed_at: momento(addDias(hoje, -r.int(3, 40)), 14), running_changed_by: P.demo.id,
          platform_funnel_code: `F-${r.int(1000, 9999)}`, platform_funnel_name: `${nomeProduto(p)} [${estagio}] ${m.region}`,
          entry_page_url: `https://exemplo.com/${slug}/`, notes: null, legacy_offer_region_id: null,
          created_at: criadoBase, updated_at: criadoBase,
        });
        const br = m.region === "BR";
        const preco = (base: number) => (br ? base : Math.round(base / 5));
        const etapas: Array<[string, string, string, number, number | null, string | null]> = [
          ["front", "entrada", "Entrada", 0, estagio === "BACK" ? preco(97) : null, "FRONT"],
          ["upsell_1", "upsell", "Upsell 1", 10, preco(197), "UP1"],
          ["downsell_1", "downsell", "Downsell 1", 11, preco(97), "DOWN1"],
        ];
        if (estagio === "FRONT") {
          etapas.push(["upsell_2", "upsell", "Upsell 2", 20, preco(147), "UP2"]);
          etapas.push(["downsell_2", "downsell", "Downsell 2", 21, preco(67), "DOWN2"]);
        }
        etapas.push(["deliverable", "entregavel", "Entregável", 90, null, null]);
        for (const [key, kind, label, position, price, tipo] of etapas) {
          const vsl = tipo ? vslDe[`${p.id}|${m.id}|${estagio}|${tipo}`] ?? null : null;
          const pitch = vsl ? Number(b.vsls!.find((v) => v.id === vsl)?.pitch_time_seconds ?? 0) : null;
          b.funnel_steps!.push({
            id: uid(14), funnel_id: id, key, kind, label, position, vsl_id: vsl,
            page_url: key === "deliverable" ? `https://area.exemplo.com/${slug}/acesso` : `https://exemplo.com/${slug}/${key.replace("_", "-")}/`,
            button_delay_seconds: pitch ? (r.chance(0.85) ? pitch - 10 : pitch + 15) : null,
            product_name: key === "deliverable" ? null : `${nomeProduto(p)} — ${label}`,
            product_external_id: key === "deliverable" ? null : `PRD${r.int(10000, 99999)}`,
            offer_name: key === "deliverable" ? null : `${p.code} - ${label} - ${m.region} - [${estagio}]`,
            offer_external_id: key === "deliverable" ? null : `OF${r.int(10000, 99999)}`,
            checkout_url: key === "deliverable" ? null : `https://checkout.exemplo.com/${slug}/${key}`,
            price, currency: price === null ? null : m.currency,
            next_on_buy: null, next_on_decline: null, notes: null, created_by: P.demo.id, created_at: criadoBase, updated_at: criadoBase,
          });
        }
      }
    }
  });

  b.offer_tests = [
    { name: "Depoimentos logo no início da página", produto: 0, estagio: "FRONT", status: "running", hipotese: "Mostrar prova social antes do preço aumenta a conversão da entrada.", dias: -6 },
    { name: "Parcelamento em destaque", produto: 1, estagio: "FRONT", status: "running", hipotese: "Mostrar o valor da parcela no lugar do preço cheio aumenta as compras.", dias: -3 },
    { name: "Página curta no upsell", produto: 2, estagio: "BACK", status: "finished", hipotese: "Uma página de upsell mais curta converte melhor para quem acabou de comprar.", dias: -30 },
    { name: "Garantia de 60 dias", produto: 0, estagio: "BACK", status: "paused", hipotese: "Uma garantia maior reduz o receio e aumenta as compras sem subir os reembolsos.", dias: -14 },
  ].map((t) => {
    const p = produtos[t.produto]!;
    return {
      id: uid(15), name: t.name, product_id: p.id, funnel_id: funilDe[`${p.id}|BR|${t.estagio}`] ?? null, offer_id: null, card_id: null,
      status: t.status, hypothesis: t.hipotese,
      description: "Metade dos visitantes vê a versão nova; a outra metade, a atual.",
      result: t.status === "finished" ? "A página curta converteu 9,8% contra 7,1% da longa." : null,
      conclusion: t.status === "finished" ? "Página curta vira o padrão dos upsells." : null,
      start_date: addDias(hoje, t.dias), end_date: t.status === "finished" ? addDias(hoje, t.dias + 14) : null,
      created_by: P.demo.id, created_at: momento(addDias(hoje, t.dias), 10), updated_at: momento(addDias(hoje, t.dias), 10),
    };
  });
  b.offers = [];
  b.offer_regions = [];
  b.offer_region_checkouts = [];
  b.offer_region_updates = [];
  b.funnel_sales = [];

  // ---------- campos personalizados ----------
  const campos = {
    canal: { id: uid(16), board_id: null, name: "📣 Canal", type: "select", options: { values: ["Instagram", "YouTube", "Blog", "E-mail", "Google", "LinkedIn"] }, position: 0 },
    produto: { id: uid(16), board_id: null, name: "🎯 Produto", type: "product", options: {}, position: 1 },
    esforco: { id: uid(16), board_id: null, name: "⏱️ Esforço", type: "select", options: { values: ["Pequeno", "Médio", "Grande"] }, position: 2 },
    link: { id: uid(16), board_id: null, name: "🔗 Arquivo", type: "link", options: {}, position: 3 },
    tipoTeste: { id: uid(16), board_id: boardId["Experimentos"], name: "🧪 Tipo de experimento", type: "select", options: { values: ["Página", "Preço", "Checkout", "Oferta"] }, position: 0 },
  };
  b.custom_fields = Object.values(campos).map((c) => ({ ...c, created_at: criadoBase }));

  // ---------- cards ----------
  const pessoas = [P.ana, P.bruno, P.carla, P.diego, P.elisa, P.fabio, P.helena, P.igor];
  type Modelo = { esteira: string; titulo: string; dono: typeof P.ana; desc?: string[]; subs?: string[]; tags?: number[] };
  const modelos: Modelo[] = [
    { esteira: "Conteúdo", titulo: "Roteiro do webinar de lançamento do Produto 4", dono: P.bruno, desc: ["Webinar de 60 minutos, com 15 minutos de perguntas no fim.", "Usar os três casos de clientes do último trimestre."], subs: ["Estrutura dos blocos", "Slides", "Ensaio com o apresentador", "Revisão final"], tags: [0] },
    { esteira: "Conteúdo", titulo: "Newsletter quinzenal - edição 12", dono: P.bruno, subs: ["Pauta", "Texto", "Revisão"], tags: [5] },
    { esteira: "Conteúdo", titulo: "FAQ da página do Produto 3", dono: P.ana },
    { esteira: "Conteúdo", titulo: "Calendário editorial de dezembro", dono: P.helena, tags: [3] },
    { esteira: "Conteúdo", titulo: "Série de posts: bastidores da equipe", dono: P.helena, subs: ["Fotos", "Legendas", "Agendamento"] },
    { esteira: "Conteúdo", titulo: "Revisar textos da área de membros", dono: P.bruno },
    { esteira: "Mídia paga", titulo: "Remarketing para quem abandonou o checkout", dono: P.carla, subs: ["Públicos", "Peças", "Orçamento"], tags: [1] },
    { esteira: "Mídia paga", titulo: "Relatório mensal de mídia", dono: P.carla, desc: ["Investimento, custo por venda e retorno por canal."], tags: [5] },
    { esteira: "Mídia paga", titulo: "Público semelhante a compradores (1%)", dono: P.helena },
    { esteira: "Mídia paga", titulo: "Revisar orçamento diário por canal", dono: P.carla, tags: [2] },
    { esteira: "Mídia paga", titulo: "Integrar conversões offline do CRM", dono: P.fabio },
    { esteira: "Design e Vídeo", titulo: "Identidade visual do Produto 4", dono: P.elisa, subs: ["Paleta", "Logotipo", "Mockups"], tags: [1] },
    { esteira: "Design e Vídeo", titulo: "Vídeo de depoimento - cliente de São Paulo", dono: P.diego, subs: ["Decupagem", "Corte", "Legendas"] },
    { esteira: "Design e Vídeo", titulo: "Kit de banners para parceiros", dono: P.igor, tags: [1] },
    { esteira: "Design e Vídeo", titulo: "Vinheta de abertura do webinar", dono: P.diego },
    { esteira: "Design e Vídeo", titulo: "Modelos de stories para o Instagram", dono: P.elisa },
    { esteira: "Site e Checkout", titulo: "Página de obrigado com pesquisa de satisfação", dono: P.fabio, subs: ["Layout", "Formulário", "Teste de envio"] },
    { esteira: "Site e Checkout", titulo: "Melhorar a velocidade da página do Produto 1", dono: P.fabio },
    { esteira: "Site e Checkout", titulo: "Corrigir formulário que não envia no Safari", dono: P.fabio, tags: [4, 2] },
    { esteira: "Site e Checkout", titulo: "Cupom de primeira compra no checkout", dono: P.fabio },
    { esteira: "Experimentos", titulo: "Experimento: depoimentos logo no início da página", dono: P.ana, desc: ["Hipótese: mostrar prova social antes do preço aumenta a conversão.", "Medir pela taxa de compra de quem chega na página."] },
    { esteira: "Experimentos", titulo: "Experimento: parcelamento em destaque no checkout", dono: P.ana },
    { esteira: "Experimentos", titulo: "Experimento: página curta x página longa", dono: P.helena },
    { esteira: "Operações", titulo: "Planejamento do primeiro trimestre", dono: P.demo, subs: ["Metas por área", "Orçamento", "Apresentação"], tags: [5] },
    { esteira: "Operações", titulo: "Contratar analista de mídia", dono: P.demo, subs: ["Publicar vaga", "Case prático", "Entrevistas"] },
    { esteira: "Operações", titulo: "Renovar contratos de ferramentas", dono: P.ana },
    { esteira: "Operações", titulo: "Pesquisa de clima da equipe", dono: P.demo },
    { esteira: "Conteúdo", titulo: "Newsletter quinzenal - edição 11", dono: P.bruno, tags: [5] },
    { esteira: "Design e Vídeo", titulo: "Vídeo de depoimento - cliente de Curitiba", dono: P.diego },
    { esteira: "Mídia paga", titulo: "Rastreamento de conversões no Google", dono: P.carla },
    { esteira: "Site e Checkout", titulo: "Migrar o site para o novo servidor", dono: P.fabio },
    { esteira: "Operações", titulo: "Fechamento financeiro do mês", dono: P.demo, tags: [3] },
  ];

  b.cards = [];
  b.card_subitems = [];
  b.card_tags = [];
  b.card_assignees = [];
  b.card_field_values = [];
  b.card_comments = [];
  b.card_comment_mentions = [];
  b.card_activity = [];
  b.card_subitem_assignees = [];
  const comentarios = [
    "Subi a primeira versão, pode dar uma olhada?",
    "Ajustei o que conversamos na reunião.",
    "Ficou ótimo. Só trocaria a chamada final.",
    "Vou precisar de mais um dia para fechar isso.",
    "Feito! Já está no ar.",
  ];
  const posicao: Record<string, number> = {};
  modelos.forEach((mod, i) => {
    const bid = boardId[mod.esteira]!;
    const cols = colunasDe[bid]!;
    // Distribui entre as colunas: alguns concluídos, alguns em andamento
    const sorteio = r.rnd();
    const etapa = i >= modelos.length - 5 ? "concluido" : sorteio < 0.4 ? "pendente" : sorteio < 0.72 ? "andamento" : sorteio < 0.86 ? (cols.revisao ? "revisao" : cols.metricas ? "metricas" : "andamento") : sorteio < 0.93 ? "pausada" : "concluido";
    const colId = cols[etapa] ?? cols.pendente!;
    const criado = addDias(hoje, -r.int(3, 18));
    const prazo = etapa === "concluido" ? addDias(hoje, -r.int(1, 10)) : addDias(hoje, r.int(-3, 12));
    const concluidoEm = etapa === "concluido" ? momento(addDias(prazo, -r.int(0, 2)), 16) : null;
    const inicioCard = r.chance(0.65) ? addDias(prazo, -r.int(1, 4)) : null;
    const fimCard = inicioCard ? prazo : null;
    const id = uid(17);
    posicao[colId] = (posicao[colId] ?? 0) + 1;
    const ehMeu = mod.dono.id === P.demo.id || (i % 5 === 0 && etapa !== "concluido");
    b.cards!.push({
      id, board_id: bid, column_id: colId, short_id: `CARD-${String(i + 1).padStart(4, "0")}`,
      title: mod.titulo,
      description: mod.desc ? doc(...mod.desc.map(par)) : null,
      assignee_id: ehMeu ? P.demo.id : mod.dono.id, squad_id: null,
      priority: r.pick(["low", "medium", "medium", "medium", "high", "urgent"]),
      start_date: inicioCard, end_date: fimCard,
      due_date: prazo, completed_at: concluidoEm, position: posicao[colId],
      visible_in_calendar: true, recurrence: mod.tags?.includes(5) ? { enabled: true, frequency: "weekly", interval: 1 } : null,
      recurrence_template_id: null, source_subitem_id: null,
      created_by: P.demo.id, created_at: momento(criado, 10), updated_at: momento(etapa === "concluido" ? prazo : addDias(hoje, -r.int(0, 2)), 11),
    });
    if (ehMeu && mod.dono.id !== P.demo.id) b.card_assignees!.push({ card_id: id, user_id: mod.dono.id, created_at: momento(criado, 10) });
    (mod.tags ?? []).forEach((t) => b.card_tags!.push({ card_id: id, tag_id: tags[t]!.id }));
    if (mod.esteira === "Design e Vídeo" || mod.esteira === "Mídia paga" || mod.esteira === "Conteúdo") {
      b.card_field_values!.push({ id: uid(18), card_id: id, field_id: campos.canal.id, value: r.pick(["Instagram", "YouTube", "Google", "E-mail"]) });
    }
    if (mod.esteira !== "Operações") b.card_field_values!.push({ id: uid(18), card_id: id, field_id: campos.esforco.id, value: r.pick(["Pequeno", "Médio", "Médio", "Grande"]) });
    (mod.subs ?? []).forEach((s, si) => {
      const feito = etapa === "concluido" || (etapa !== "pendente" && si < (mod.subs!.length >> 1));
      b.card_subitems!.push({
        id: uid(19), card_id: id, title: s, description: null, done: feito, position: si,
        assignee_id: si === 0 ? mod.dono.id : r.pick([mod.dono.id, P.demo.id]),
        due_date: addDias(prazo, si - mod.subs!.length), blocks_parent: si === mod.subs!.length - 1,
        promoted_board_id: null, promoted_card_id: null, created_at: momento(criado, 11),
      });
    });
    b.card_activity!.push({ id: uid(20), card_id: id, actor_id: P.demo.id, action: "created", field: null, old_value: null, new_value: null, created_at: momento(criado, 10) });
    if (etapa !== "pendente") {
      b.card_activity!.push({ id: uid(20), card_id: id, actor_id: mod.dono.id, action: "moved", field: "column_id", old_value: cols.pendente, new_value: colId, created_at: momento(addDias(criado, 1), 15) });
    }
    if (r.chance(0.6)) {
      const autor = r.pick(pessoas);
      const cid = uid(21);
      const mencao = r.chance(0.4) ? `@[${DEMO_USER.full_name}](${DEMO_USER.id}) ` : "";
      b.card_comments!.push({ id: cid, card_id: id, author_id: autor.id, body: mencao + r.pick(comentarios), created_at: momento(addDias(criado, 2), 17, 20) });
      if (mencao) b.card_comment_mentions!.push({ comment_id: cid, user_id: DEMO_USER.id, created_at: momento(addDias(criado, 2), 17, 20) });
    }
  });

  // Notificações do visitante
  const meus = b.cards.filter((c) => c.assignee_id === P.demo.id).slice(0, 5);
  b.notifications = meus.map((c, i) => ({
    id: uid(22), user_id: P.demo.id, actor_id: pessoas[i % pessoas.length]!.id, card_id: c.id, comment_id: null, subitem_id: null,
    type: ["assigned", "mention", "comment", "subtask_assigned", "assigned"][i], read_at: i > 2 ? momento(addDias(hoje, -1), 9) : null,
    created_at: momento(addDias(hoje, -i), 9 + i, 15),
  }));

  // ---------- agenda ----------
  b.calendar_events = [
    { title: "Reunião semanal de prioridades", dia: 2, cor: "#14b8a6" },
    { title: "Gravação do webinar", dia: 4, cor: "#a855f7" },
    { title: "Retrospectiva do mês", dia: 7, cor: "#3b82f6" },
    { title: "Entrevista - analista de mídia", dia: 1, cor: "#f97316" },
  ].map((e) => ({
    id: uid(23), title: e.title, description: null, start_at: momento(addDias(hoje, e.dia), 13), end_at: momento(addDias(hoje, e.dia), 14),
    color: e.cor, type: "event", campaign_id: null, created_by: P.demo.id, created_at: criadoBase, updated_at: criadoBase,
  }));

  // ---------- documentos ----------
  const docs: Array<{ titulo: string; icone: string; pai?: string; conteudo: unknown }> = [
    {
      titulo: "Bem-vindo ao NEXUS", icone: "👋",
      conteudo: doc(
        tit("O que é o NEXUS", 1),
        par("Plataforma interna que junta, num lugar só, as tarefas da equipe, os funis de venda, as campanhas e as métricas."),
        tit("Por onde começar"),
        lista(["Minhas tarefas: o que está com você hoje.", "Esteiras: o quadro de cada área (Conteúdo, Mídia paga, Design e Vídeo...).", "Funis: os produtos por mercado, com cada etapa do funil.", "Campanhas: os resultados de e-mail e WhatsApp de cada campanha."]),
        par("Esta é uma demonstração: os dados são fictícios e o que você mudar volta ao normal quando recarregar a página."),
      ),
    },
    { titulo: "Processos", icone: "📚", conteudo: doc(par("Como a equipe trabalha, passo a passo.")) },
    {
      titulo: "Como pedir uma peça para Design e Vídeo", icone: "🎬", pai: "Processos",
      conteudo: doc(
        numerada(["Abra um card na esteira Design e Vídeo.", "Descreva o objetivo, o formato e onde a peça vai ser usada.", "Anexe referências e o texto final.", "Prazo mínimo: 3 dias úteis para peças novas."]),
        par("Ajustes pequenos em peças prontas podem ser pedidos direto no card da peça."),
      ),
    },
    {
      titulo: "Como publicar uma página nova", icone: "🚀", pai: "Processos",
      conteudo: doc(
        lista(["Montar a página a partir do modelo aprovado.", "Ligar o checkout e testar uma compra com cupom de 100%.", "Conferir a página no celular.", "Avisar a equipe de Mídia paga antes de mandar visitantes."]),
      ),
    },
    {
      titulo: "Guia da marca", icone: "🎨",
      conteudo: doc(
        tit("Tom de voz"),
        par("Próximo, direto e sem jargão. Falamos com o cliente como falaríamos com um amigo que entende do assunto."),
        tit("Cores"),
        lista(["Roxo: cor principal.", "Verde: confirmação e sucesso.", "Cinza: textos de apoio."]),
      ),
    },
    {
      titulo: "Rituais da equipe", icone: "🗓️",
      conteudo: doc(lista(["Segunda, 9h: reunião semanal de prioridades (30 minutos).", "Quinta, 16h: revisão das peças da semana.", "Última sexta do mês: retrospectiva e resultados."])),
    },
    {
      titulo: "Glossário", icone: "📖",
      conteudo: doc(lista(["CAC: quanto custa conquistar um cliente.", "LTV: quanto um cliente gasta com a empresa ao longo do tempo.", "ROAS: receita dividida pelo investimento em anúncios.", "Ticket médio: receita dividida pelo número de pedidos."])),
    },
    {
      titulo: "Ideias de experimentos", icone: "💡",
      conteudo: doc(par("Hipóteses para testar nas páginas e no checkout."), lista(["Vídeo curto no topo da página", "Garantia de 60 dias", "Compra com um clique para quem já é cliente"])),
    },
  ];
  b.documents = [];
  const docId: Record<string, string> = {};
  docs.forEach((d, i) => {
    const id = uid(24);
    docId[d.titulo] = id;
    b.documents!.push({
      id, title: d.titulo, icon: d.icone, parent_id: d.pai ? docId[d.pai] : null, position: i, content: d.conteudo, cover_color: null,
      created_by: P.demo.id, updated_by: P.demo.id, indexed_at: null,
      created_at: momento(addDias(hoje, -60 + i), 10), updated_at: momento(addDias(hoje, -r.int(1, 20)), 15),
    });
  });
  b.document_chunks = [];

  // ---------- campanhas ----------
  b.campaigns = [];
  b.emails = [];
  b.whatsapp_messages = [];
  b.whatsapp_stats = [];
  b.sales = [];
  const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const ASSUNTOS_NUTRICAO = ["Os bastidores do nosso método", "3 erros que atrasam seus resultados", "Caso real: do zero ao primeiro resultado", "As perguntas que mais recebemos", "Amanhã tem novidade, [[firstname]]"];
  const ASSUNTOS_VENDA = ["As inscrições estão abertas", "Última chamada, [[firstname]]"];
  const inicioSemanaAtual = segunda(hoje);
  for (let w = -8; w <= 1; w++) {
    const inicio = addDias(inicioSemanaAtual, w * 7);
    const { ano } = semanaISO(inicio);
    const numero = w + 9;
    const p = produtos[((w % 5) + 5) % 5]!;
    const iProd = produtos.indexOf(p);
    const mercadosDaSemana = vendeEm[iProd]!.slice(0, w % 2 === 0 ? 3 : 2);
    for (const mi of mercadosDaSemana) {
      const m = mercados[mi]!;
      const br = m.region === "BR";
      const escala = br ? 1 : 0.25;
      const id = uid(25);
      b.campaigns.push({
        id, code: `Campanha ${numero} - ${nomeProduto(p).toUpperCase()} [${m.code.toUpperCase()}]`,
        product_name: nomeProduto(p).toUpperCase(), week_number: numero, year: ano, start_date: inicio, end_date: addDias(inicio, 6),
        status: "active", notes: null, language_id: m.id, created_by: P.demo.id, created_at: momento(addDias(inicio, -3), 10), updated_at: momento(addDias(inicio, -3), 10),
      });
      const futura = inicio > hoje;
      if (futura) continue;
      let receitaEmail = 0, receitaWpp = 0, vendasEmail = 0, vendasWpp = 0;
      for (let d = 0; d < 7; d++) {
        const dia = addDias(inicio, d);
        if (dia > hoje) break;
        const venda = d >= 5;
        const enviados = Math.round(r.int(18000, 32000) * escala);
        const abertos = Math.round(enviados * (r.rnd() * 0.1 + 0.18));
        const cliques = Math.round(abertos * (r.rnd() * 0.08 + (venda ? 0.1 : 0.05)));
        const vendas = venda ? Math.round(cliques * (r.rnd() * 0.04 + 0.02)) : r.int(0, 3);
        const receita = vendas * Number(p.price) * (br ? 1 : 5.4);
        receitaEmail += receita;
        vendasEmail += vendas;
        b.emails.push({
          id: uid(26), campaign_id: id, subject: venda ? ASSUNTOS_VENDA[d - 5]! : ASSUNTOS_NUTRICAO[d]!, phase: venda ? "sale" : "nurture",
          sent_at: momento(dia, 12, 30), sent_count: enviados, opened_count: abertos, clicked_count: cliques,
          opened_human_count: Math.round(abertos * 0.72), clicked_human_count: Math.round(cliques * 0.9),
          unsubscribed_count: Math.round(enviados * 0.002), bounced_count: Math.round(enviados * 0.004), complaints_count: r.int(0, 4),
          sales_count: vendas, revenue: receita, getresponse_id: null, created_at: momento(dia, 20),
        });
        const destinatarios = Math.round(r.int(2500, 4200) * escala);
        const lidas = Math.round(destinatarios * (r.rnd() * 0.25 + 0.45));
        const vendasW = venda ? r.int(4, 18) : r.int(0, 2);
        const receitaW = vendasW * Number(p.price) * (br ? 1 : 5.4);
        receitaWpp += receitaW;
        vendasWpp += vendasW;
        b.whatsapp_messages.push({
          id: uid(27), campaign_id: id, day_of_week: DIAS[d], sent_time: venda ? "19:00:00" : "10:30:00", phase: venda ? "sale" : "nurture",
          message: venda ? "Inscrições abertas! A condição de lançamento vale só até domingo. Link na descrição do grupo." : "Bom dia! Hoje às 20h tem aula nova aqui no grupo.",
          recipients_count: destinatarios, read_count: lidas, reactions_count: Math.round(lidas * 0.03), sales_count: vendasW, revenue: receitaW, created_at: momento(dia, 21),
        });
      }
      const membros = Math.round(r.int(3000, 4500) * escala);
      b.whatsapp_stats.push({ id: uid(28), campaign_id: id, members_count: membros, joined_count: Math.round(membros * 0.12), left_count: Math.round(membros * 0.04), updated_at: momento(hoje, 8) });
      b.sales.push({
        id: uid(29), campaign_id: id, leads_count: Math.round(r.int(6000, 11000) * escala),
        sales_count: vendasEmail + vendasWpp + r.int(0, 6), sales_email_count: vendasEmail, sales_whatsapp_count: vendasWpp, sales_other_count: r.int(0, 6),
        revenue_email: receitaEmail, revenue_whatsapp: receitaWpp, revenue_other: r.int(0, 6) * Number(p.price), updated_at: momento(hoje, 8),
      });
    }
  }

  // ---------- edição de vídeo ----------
  const editores = [P.diego, P.elisa, P.igor];
  b.editor_weekly_targets = editores.map((e) => ({ id: uid(30), editor_id: e.id, weekly_target_minutes: 60, extra_minute_rate_cents: 500, created_at: criadoBase, updated_at: criadoBase }));
  b.video_edit_entries = [];
  b.video_edit_demands = [];
  const TITULOS_VIDEO = ["Anúncio", "Corte do webinar", "Depoimento", "Reels"];
  for (let w = -6; w <= 0; w++) {
    const inicio = addDias(inicioSemanaAtual, w * 7);
    for (const e of editores) {
      const qtd = r.int(3, 7);
      for (let k = 0; k < qtd; k++) {
        const dia = addDias(inicio, r.int(0, 4));
        if (dia > hoje) continue;
        b.video_edit_entries.push({
          id: uid(31), editor_id: e.id, title: `${r.pick(TITULOS_VIDEO)} ${String(r.int(1, 30)).padStart(2, "0")} - Produto ${r.int(1, 5)}`,
          duration_seconds: r.int(45, 420), delivered_at: dia, card_id: null, demand_id: null, notes: null,
          created_by: e.id, created_at: momento(dia, 18), updated_at: momento(dia, 18),
        });
      }
    }
  }
  b.video_edit_demands.push({
    id: uid(32), title: "Pacote de 10 anúncios verticais", editor_id: P.igor.id, mode: "aggregate", aggregate_video_count: 10, aggregate_total_seconds: 1800,
    delivered_at: addDias(hoje, -4), card_id: null, notes: null, created_by: P.demo.id, created_at: momento(addDias(hoje, -4), 18), updated_at: momento(addDias(hoje, -4), 18),
  });

  // ---------- chips de WhatsApp ----------
  b.whatsapp_chips = [
    { apelido: "Chip 01", status: "ativo", uso: "Grupos da campanha Brasil", dias: 25 },
    { apelido: "Chip 02", status: "ativo", uso: "Grupos LATAM", dias: 5 },
    { apelido: "Chip 03", status: "reserva", uso: "Reserva", dias: 60 },
    { apelido: "Chip 04", status: "bloqueado", uso: "Grupos Europa", dias: -10 },
    { apelido: "Chip 05", status: "ativo", uso: "Suporte", dias: 12 },
  ].map((c, i) => ({
    id: uid(33), nickname: c.apelido, phone: `+55 11 90000-00${String(i + 1).padStart(2, "0")}`, carrier: r.pick(["Operadora A", "Operadora B"]),
    usage: c.uso, status: c.status, last_recharge_date: addDias(hoje, c.dias - 30), validity_days: 30, expires_on: addDias(hoje, c.dias),
    recharge_amount: 20, payer: r.pick([P.ana.full_name, P.fabio.full_name]), notes: null,
    created_by: P.demo.id, created_at: criadoBase, updated_at: criadoBase,
  }));

  return b;
}
