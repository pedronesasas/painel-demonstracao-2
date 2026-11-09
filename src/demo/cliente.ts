/**
 * Um Supabase de mentira, que roda inteiro no navegador.
 *
 * Implementa a parte da API que o NEXUS usa — `from().select().eq()...`,
 * `rpc`, login, realtime e storage — sobre o banco gerado em `dados.ts`. As
 * telas continuam escritas contra o Supabase de verdade e não sabem que estão
 * numa demonstração.
 *
 * O que o visitante grava fica na memória da aba e some ao recarregar a página.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEMO_USER, gerarBanco, type Banco, type Linha } from "./dados";
import { instalarIaDemo } from "./ia";

type Tabelas = Record<string, Linha[]>;
type Erro = { message: string; code?: string };
type Resposta = { data: unknown; error: null | Erro; count?: number | null; status?: number };

let _banco: Banco | null = null;
function banco(): Banco {
  _banco ??= gerarBanco();
  return _banco;
}
const tabelas = () => banco() as unknown as Tabelas;

/** Leitura direta do banco da demo (usada pelas respostas de IA de exemplo). */
export const dadosDemo = () => tabelas();

const atraso = () => new Promise((r) => setTimeout(r, 60 + Math.random() * 120));

export function novoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

// ---------------------------------------------------------------- relações

/**
 * Relações que o NEXUS embute num select: tabela → nome embutido → [coluna local, coluna remota].
 * Quando não está aqui, tenta `<nome no singular>_id` → `id`.
 */
const RELACOES: Record<string, Record<string, [string, string]>> = {
  cards: { boards: ["board_id", "id"], board_columns: ["column_id", "id"] },
  card_tags: { tags: ["tag_id", "id"] },
  card_field_values: { custom_fields: ["field_id", "id"] },
  card_subitems: { cards: ["card_id", "id"] },
  user_roles: { profiles: ["user_id", "id"] },
  board_user_access: { profiles: ["user_id", "id"] },
  squad_members: { profiles: ["user_id", "id"] },
  card_assignees: { profiles: ["user_id", "id"] },
  card_comments: { profiles: ["author_id", "id"] },
  notifications: { profiles: ["actor_id", "id"], cards: ["card_id", "id"] },
};

function relacao(tabela: string, nome: string): [string, string] | null {
  const fixa = RELACOES[tabela]?.[nome];
  if (fixa) return fixa;
  const singular = nome.endsWith("ies") ? `${nome.slice(0, -3)}y` : nome.replace(/s$/, "");
  return [`${singular}_id`, "id"];
}

/** "cards!card_subitems_card_id_fkey!inner" → { nome: "cards", inner: true } */
function nomeEmbutido(texto: string): { nome: string; inner: boolean } {
  const pedacos = texto.split("!");
  return { nome: pedacos[0]!, inner: pedacos.includes("inner") };
}

function alvoDe(tabela: string, nome: string, linha: Linha): Linha | undefined {
  const rel = relacao(tabela, nome);
  if (!rel) return undefined;
  const destino = visao(nome);
  return destino.find((l) => l[rel[1]] === linha[rel[0]]);
}

/** Valor de uma coluna, aceitando "tabela.coluna" de uma relação embutida. */
function valor(tabela: string, linha: Linha, coluna: string): unknown {
  if (!coluna.includes(".")) return linha[coluna];
  const [nome, ...resto] = coluna.split(".");
  const alvo = alvoDe(tabela, nome!, linha);
  return alvo ? valor(nome!, alvo, resto.join(".")) : undefined;
}

// ---------------------------------------------------------------- visões

/** Tabelas calculadas (views do banco de verdade). */
function visao(nome: string): Linha[] {
  if (nome === "card_metrics") {
    const cards = tabelas().cards ?? [];
    return cards.map((c) => {
      const criado = Date.parse(String(c.created_at));
      const fim = c.completed_at ? Date.parse(String(c.completed_at)) : null;
      const horas = fim ? Math.max(1, Math.round((fim - criado) / 36e5)) : null;
      return {
        card_id: c.id, short_id: c.short_id, title: c.title, board_id: c.board_id,
        assignee_id: c.assignee_id, created_at: c.created_at, completed_at: c.completed_at,
        lead_time_hours: horas, cycle_time_hours: horas ? Math.round(horas * 0.6) : null,
      };
    });
  }
  const t = tabelas();
  t[nome] ??= [];
  return t[nome]!;
}

// ---------------------------------------------------------------- select

/** Separa por vírgula, respeitando parênteses. */
function partes(texto: string): string[] {
  const saida: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const c of texto) {
    if (c === "(") nivel += 1;
    if (c === ")") nivel -= 1;
    if (c === "," && nivel === 0) {
      saida.push(atual.trim());
      atual = "";
    } else atual += c;
  }
  if (atual.trim()) saida.push(atual.trim());
  return saida;
}

function projetar(tabela: string, linha: Linha, colunas: string): { linha: Linha; ok: boolean } {
  const cols = colunas.replace(/\s+/g, " ").trim();
  const saida: Linha = {};
  let ok = true;
  for (const parte of partes(cols || "*")) {
    if (parte === "*") {
      Object.assign(saida, linha);
      continue;
    }
    const embutida = parte.match(/^(?:(\w+):)?([\w!]+)\s*\((.*)\)$/s);
    if (embutida) {
      const [, apelido, bruto, sub] = embutida;
      const { nome, inner } = nomeEmbutido(bruto!);
      const alvo = alvoDe(tabela, nome, linha);
      if (!alvo && inner) ok = false;
      saida[apelido ?? nome] = alvo ? projetar(nome, alvo, sub!).linha : null;
      continue;
    }
    const [apelido, caminho] = parte.includes(":") ? parte.split(":").map((x) => x.trim()) : [null, parte];
    const passos = caminho!.replace(/::\w+$/, "").split("->").map((x) => x.replace(/>/g, "").trim());
    let v: unknown = linha[passos[0]!];
    for (const p of passos.slice(1)) v = v && typeof v === "object" ? (v as Linha)[p] : null;
    saida[apelido ?? passos[passos.length - 1]!] = v ?? null;
  }
  return { linha: saida, ok };
}

// ---------------------------------------------------------------- filtros

function comparar(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" || typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

const igual = (a: unknown, b: unknown) =>
  a === b || (a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b));

function comoTexto(v: unknown): unknown {
  if (v === "null") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function padrao(p: string): RegExp {
  const esc = p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${esc}$`, "is");
}

type Teste = (tabela: string, l: Linha) => boolean;

function operador(coluna: string, op: string, v: unknown): Teste {
  return (t, l) => {
    const x = valor(t, l, coluna);
    switch (op) {
      case "eq": return igual(x, v);
      case "neq": return !igual(x, v);
      case "gt": return x != null && comparar(x, v) > 0;
      case "gte": return x != null && comparar(x, v) >= 0;
      case "lt": return x != null && comparar(x, v) < 0;
      case "lte": return x != null && comparar(x, v) <= 0;
      case "is": return (x ?? null) === comoTexto(v);
      case "in": return (v as unknown[]).some((y) => igual(x, y));
      case "like": return x != null && padrao(String(v)).test(String(x).replace(/\n/g, " "));
      case "ilike": return x != null && padrao(String(v)).test(String(x));
      case "contains": {
        if (Array.isArray(x)) return (v as unknown[]).every((y) => x.some((z) => igual(z, y)));
        if (x && typeof x === "object") return Object.entries(v as Linha).every(([k, y]) => igual((x as Linha)[k], y));
        return false;
      }
      default: return true;
    }
  };
}

/** Lê o texto de `.or("a.eq.1,b.in.(2,3)")`. */
function lerOu(texto: string): Teste {
  const testes = partes(texto).map((cond): Teste => {
    const m = cond.match(/^and\((.*)\)$/s);
    if (m) {
      const todos = partes(m[1]!).map((c) => lerCondicao(c));
      return (t, l) => todos.every((f) => f(t, l));
    }
    return lerCondicao(cond);
  });
  return (t, l) => testes.some((f) => f(t, l));
}

function lerCondicao(cond: string): Teste {
  const m = cond.match(/^([\w.]+)\.(not\.)?(\w+)\.(.*)$/s);
  if (!m) return () => true;
  const [, coluna, nao, op, bruto] = m;
  let v: unknown = bruto;
  if (op === "in") v = bruto!.replace(/^\(|\)$/g, "").split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  else if (op === "is") v = bruto;
  const f = operador(coluna!, op!, v);
  return nao ? (t, l) => !f(t, l) : f;
}

// ---------------------------------------------------------------- consulta

type Operacao = "select" | "insert" | "update" | "upsert" | "delete";

class Consulta implements PromiseLike<Resposta> {
  private filtros: Teste[] = [];
  private ordens: [string, boolean, boolean][] = [];
  private faixa: [number, number] | null = null;
  private colunas = "*";
  private devolver = false;
  private unico: "single" | "maybe" | null = null;
  private operacao: Operacao = "select";
  private valores: Linha | Linha[] | null = null;
  private conflito: string[] = [];
  private contar = false;
  private soCabecalho = false;
  private ignorarDuplicado = false;

  constructor(private tabela: string) {}

  select(colunas = "*", opcoes?: { count?: string; head?: boolean }) {
    if (this.operacao === "select") this.colunas = colunas;
    else {
      this.devolver = true;
      this.colunas = colunas;
    }
    if (opcoes?.count) this.contar = true;
    if (opcoes?.head) this.soCabecalho = true;
    return this;
  }
  insert(v: Linha | Linha[]) {
    this.operacao = "insert";
    this.valores = v;
    return this;
  }
  update(v: Linha) {
    this.operacao = "update";
    this.valores = v;
    return this;
  }
  upsert(v: Linha | Linha[], opcoes?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.operacao = "upsert";
    this.valores = v;
    this.conflito = (opcoes?.onConflict ?? "id").split(",").map((c) => c.trim());
    this.ignorarDuplicado = Boolean(opcoes?.ignoreDuplicates);
    return this;
  }
  delete() {
    this.operacao = "delete";
    return this;
  }

  private filtro(f: Teste) {
    this.filtros.push(f);
    return this;
  }
  eq(c: string, v: unknown) { return this.filtro(operador(c, "eq", v)); }
  neq(c: string, v: unknown) { return this.filtro(operador(c, "neq", v)); }
  gt(c: string, v: unknown) { return this.filtro(operador(c, "gt", v)); }
  gte(c: string, v: unknown) { return this.filtro(operador(c, "gte", v)); }
  lt(c: string, v: unknown) { return this.filtro(operador(c, "lt", v)); }
  lte(c: string, v: unknown) { return this.filtro(operador(c, "lte", v)); }
  in(c: string, lista: unknown[]) { return this.filtro(operador(c, "in", lista ?? [])); }
  is(c: string, v: unknown) { return this.filtro(operador(c, "is", v)); }
  like(c: string, v: string) { return this.filtro(operador(c, "like", v)); }
  ilike(c: string, v: string) { return this.filtro(operador(c, "ilike", v)); }
  contains(c: string, v: unknown) { return this.filtro(operador(c, "contains", v)); }
  not(c: string, op: string, v: unknown) {
    const f = operador(c, op, op === "in" && typeof v === "string" ? v.replace(/^\(|\)$/g, "").split(",") : v);
    return this.filtro((t, l) => !f(t, l));
  }
  or(texto: string) {
    if (!texto) return this;
    return this.filtro(lerOu(texto));
  }
  filter(c: string, op: string, v: unknown) {
    return this.filtro(lerCondicao(`${c}.${op}.${String(v)}`));
  }
  match(obj: Linha) {
    for (const [c, v] of Object.entries(obj)) this.eq(c, v);
    return this;
  }
  textSearch(c: string, q: string) {
    return this.ilike(c, `%${q}%`);
  }
  order(c: string, o?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
    if (o?.foreignTable || o?.referencedTable) return this;
    this.ordens.push([c, o?.ascending ?? true, o?.nullsFirst ?? false]);
    return this;
  }
  range(de: number, ate: number) {
    this.faixa = [de, ate];
    return this;
  }
  limit(n: number) {
    this.faixa = [this.faixa?.[0] ?? 0, (this.faixa?.[0] ?? 0) + n - 1];
    return this;
  }
  single() {
    this.unico = "single";
    return this;
  }
  maybeSingle() {
    this.unico = "maybe";
    return this;
  }
  abortSignal() {
    return this;
  }
  returns() {
    return this;
  }
  throwOnError() {
    return this;
  }

  private executar(): Resposta {
    const linhas = visao(this.tabela);
    const passa = (l: Linha) => this.filtros.every((f) => f(this.tabela, l));
    const agora = new Date().toISOString();

    if (this.operacao === "insert" || this.operacao === "upsert") {
      const novas = Array.isArray(this.valores) ? this.valores : [this.valores ?? {}];
      const gravadas: Linha[] = [];
      for (const v of novas) {
        const existente =
          this.operacao === "upsert"
            ? linhas.find((l) => this.conflito.every((c) => igual(l[c], v[c])))
            : undefined;
        if (existente) {
          if (!this.ignorarDuplicado) {
            const antes = { ...existente };
            Object.assign(existente, v, "updated_at" in existente ? { updated_at: agora } : {});
            emitir(this.tabela, "UPDATE", existente, antes);
          }
          gravadas.push(existente);
        } else {
          const linha = completarNova(this.tabela, { ...v });
          linhas.push(linha);
          gravadas.push(linha);
          aoInserir(this.tabela, linha);
          emitir(this.tabela, "INSERT", linha, null);
        }
      }
      return this.resposta(gravadas);
    }

    if (this.operacao === "update") {
      const alvo = linhas.filter(passa);
      for (const l of alvo) {
        const antes = { ...l };
        Object.assign(l, this.valores, "updated_at" in l ? { updated_at: agora } : {});
        aoAtualizar(this.tabela, antes, l);
        emitir(this.tabela, "UPDATE", l, antes);
      }
      return this.resposta(alvo);
    }

    if (this.operacao === "delete") {
      const removidas = linhas.filter(passa);
      tabelas()[this.tabela] = linhas.filter((l) => !passa(l));
      for (const l of removidas) {
        aoApagar(this.tabela, l);
        emitir(this.tabela, "DELETE", null, l);
      }
      return this.resposta(removidas);
    }

    let resultado = linhas.filter(passa);
    if (this.ordens.length > 0) {
      resultado = [...resultado].sort((a, b) => {
        for (const [c, asc, nullsFirst] of this.ordens) {
          const va = valor(this.tabela, a, c);
          const vb = valor(this.tabela, b, c);
          if (va == null && vb != null) return nullsFirst ? -1 : 1;
          if (vb == null && va != null) return nullsFirst ? 1 : -1;
          const r = comparar(va, vb);
          if (r !== 0) return asc ? r : -r;
        }
        return 0;
      });
    }
    const projetadas = resultado
      .map((l) => projetar(this.tabela, l, this.colunas))
      .filter((p) => p.ok)
      .map((p) => p.linha);
    const total = projetadas.length;
    const pagina = this.faixa ? projetadas.slice(this.faixa[0], this.faixa[1] + 1) : projetadas;
    return this.resposta(pagina, true, total);
  }

  private resposta(linhas: Linha[], jaProjetadas = false, total?: number): Resposta {
    const count = this.contar ? (total ?? linhas.length) : null;
    if (this.soCabecalho) return { data: null, error: null, count, status: 200 };
    if (this.operacao !== "select" && !this.devolver) return { data: null, error: null, count, status: 201 };
    const dados = jaProjetadas ? linhas : linhas.map((l) => projetar(this.tabela, l, this.colunas).linha);
    if (this.unico) {
      if (dados.length > 1 && this.operacao === "select") {
        return { data: null, error: { message: "Esperava uma linha só.", code: "PGRST116" }, count };
      }
      if (this.unico === "single" && dados.length === 0) {
        return { data: null, error: { message: "Nenhuma linha encontrada.", code: "PGRST116" }, count };
      }
      return { data: dados[0] ? clonar(dados[0]) : null, error: null, count, status: 200 };
    }
    return { data: dados.map(clonar), error: null, count, status: 200 };
  }

  then<A = Resposta, B = never>(
    ok?: ((v: Resposta) => A | PromiseLike<A>) | null,
    falha?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return atraso()
      .then(() => {
        const r = this.executar();
        avisarMudanca(this.tabela);
        return r;
      })
      .then(ok, falha);
  }
}

const clonar = <T,>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

// ---------------------------------------------------------------- gatilhos

/** O que o banco de verdade preenche sozinho (defaults e triggers). */
function completarNova(tabela: string, v: Linha): Linha {
  const agora = new Date().toISOString();
  const base: Linha = { id: novoId(), created_at: agora };
  const exemplo = visao(tabela)[0];
  if (!exemplo || "updated_at" in exemplo) base.updated_at = agora;
  if (tabela === "cards") {
    const maior = Math.max(0, ...visao("cards").map((c) => Number(String(c.short_id ?? "").replace(/\D/g, "")) || 0));
    Object.assign(base, {
      short_id: `CARD-${String(maior + 1).padStart(4, "0")}`,
      priority: "medium", completed_at: null, assignee_id: null, squad_id: null, description: null,
      due_date: null, start_date: null, end_date: null, position: 0, visible_in_calendar: true,
      recurrence: null, recurrence_template_id: null, source_subitem_id: null, created_by: DEMO_USER.id,
    });
  }
  if (tabela === "card_subitems") Object.assign(base, { done: false, blocks_parent: false, assignee_id: null, due_date: null, description: null, promoted_card_id: null, promoted_board_id: null });
  if (tabela === "documents") Object.assign(base, { created_by: DEMO_USER.id, updated_by: DEMO_USER.id, icon: null, cover_color: null, parent_id: null, position: 0, content: null, indexed_at: null });
  if (tabela === "card_comments") Object.assign(base, { author_id: DEMO_USER.id });
  if (tabela === "notifications") Object.assign(base, { read_at: null });
  if ("created_by" in (exemplo ?? {}) && !("created_by" in base)) base.created_by = DEMO_USER.id;
  return { ...base, ...v };
}

function registrar(card_id: unknown, action: string, field: string | null, old_value: unknown, new_value: unknown) {
  const linha = {
    id: novoId(), card_id, actor_id: DEMO_USER.id, action, field,
    old_value: old_value ?? null, new_value: new_value ?? null, created_at: new Date().toISOString(),
  };
  visao("card_activity").push(linha);
  emitir("card_activity", "INSERT", linha, null);
}

function aoInserir(tabela: string, l: Linha) {
  if (tabela === "cards") registrar(l.id, "created", null, null, null);
}

function aoAtualizar(tabela: string, antes: Linha, depois: Linha) {
  if (tabela !== "cards") return;
  if (antes.column_id !== depois.column_id) {
    registrar(depois.id, "moved", "column_id", antes.column_id, depois.column_id);
    const col = visao("board_columns").find((c) => c.id === depois.column_id);
    if (col?.is_done_column && !depois.completed_at) depois.completed_at = new Date().toISOString();
    if (col && !col.is_done_column && antes.completed_at) depois.completed_at = null;
  }
  if (antes.assignee_id !== depois.assignee_id) registrar(depois.id, "assigned", "assignee_id", antes.assignee_id, depois.assignee_id);
  if (antes.priority !== depois.priority) registrar(depois.id, "priority_changed", "priority", antes.priority, depois.priority);
  if (antes.due_date !== depois.due_date) registrar(depois.id, "due_changed", "due_date", antes.due_date, depois.due_date);
  if (antes.title !== depois.title) registrar(depois.id, "title_changed", "title", antes.title, depois.title);
}

function aoApagar(tabela: string, l: Linha) {
  const filhos: Record<string, [string, string][]> = {
    cards: [["card_subitems", "card_id"], ["card_comments", "card_id"], ["card_tags", "card_id"], ["card_field_values", "card_id"], ["card_assignees", "card_id"], ["card_activity", "card_id"]],
    boards: [["board_columns", "board_id"], ["cards", "board_id"]],
    documents: [["documents", "parent_id"]],
    funnels: [["funnel_steps", "funnel_id"]],
    campaigns: [["emails", "campaign_id"], ["whatsapp_messages", "campaign_id"], ["sales", "campaign_id"], ["whatsapp_stats", "campaign_id"]],
  };
  for (const [filha, coluna] of filhos[tabela] ?? []) {
    const linhas = visao(filha);
    const saem = linhas.filter((x) => x[coluna] === l.id);
    if (!saem.length) continue;
    tabelas()[filha] = linhas.filter((x) => x[coluna] !== l.id);
    for (const s of saem) aoApagar(filha, s);
  }
}

// ---------------------------------------------------------------- realtime

/**
 * Sem servidor não existe outro usuário mudando nada, mas várias telas do
 * NEXUS mostram as próprias gravações pelo realtime (comentário novo, histórico
 * do card). Por isso cada gravação feita aqui avisa os canais que escutam
 * aquela tabela, no mesmo formato do Supabase.
 */
type Evento = "INSERT" | "UPDATE" | "DELETE";
type Ouvinte = { tabela: string | null; evento: string; filtro: [string, string] | null; callback: (p: unknown) => void };
const canais = new Set<{ ouvintes: Ouvinte[] }>();
let pendentes: Array<{ tabela: string; evento: Evento; novo: Linha | null; antigo: Linha | null }> = [];

function emitir(tabela: string, evento: Evento, novo: Linha | null, antigo: Linha | null) {
  pendentes.push({ tabela, evento, novo: novo ? clonar(novo) : null, antigo: antigo ? clonar(antigo) : null });
}

function avisarMudanca(_tabela: string) {
  const lote = pendentes;
  pendentes = [];
  if (!lote.length) return;
  setTimeout(() => {
    for (const m of lote) {
      for (const canal of canais) {
        for (const o of canal.ouvintes) {
          if (o.tabela && o.tabela !== m.tabela) continue;
          if (o.evento !== "*" && o.evento !== m.evento) continue;
          const linha = m.novo ?? m.antigo ?? {};
          if (o.filtro && !igual(linha[o.filtro[0]], o.filtro[1])) continue;
          try {
            o.callback({
              eventType: m.evento, table: m.tabela, schema: "public",
              new: m.novo ?? {}, old: m.antigo ?? {}, commit_timestamp: new Date().toISOString(),
            });
          } catch (e) {
            console.error(e);
          }
        }
      }
    }
  }, 0);
}

function canal() {
  const c = {
    ouvintes: [] as Ouvinte[],
    on(_tipo: string, opcoes: { event?: string; table?: string; filter?: string } | undefined, callback?: (p: unknown) => void) {
      if (typeof callback !== "function" || _tipo !== "postgres_changes") return c;
      const f = opcoes?.filter?.match(/^(\w+)=eq\.(.+)$/);
      c.ouvintes.push({ tabela: opcoes?.table ?? null, evento: opcoes?.event ?? "*", filtro: f ? [f[1]!, f[2]!] : null, callback });
      return c;
    },
    subscribe(cb?: (status: string) => void) {
      canais.add(c);
      setTimeout(() => cb?.("SUBSCRIBED"), 0);
      return c;
    },
    unsubscribe() {
      canais.delete(c);
      return Promise.resolve("ok");
    },
    send() {
      return Promise.resolve("ok");
    },
  };
  return c;
}

// ---------------------------------------------------------------- rpc

function metricasPorFase(ids: string[], fase: string) {
  const b = tabelas();
  const naFase = (l: Linha) => fase === "all" || !fase || l.phase === fase;
  const soma = (linhas: Linha[], c: string) => linhas.reduce((t, l) => t + Number(l[c] ?? 0), 0);
  return ids.map((id) => {
    const em = (b.emails ?? []).filter((e) => e.campaign_id === id && naFase(e));
    const wa = (b.whatsapp_messages ?? []).filter((w) => w.campaign_id === id && naFase(w));
    const ws = (b.whatsapp_stats ?? []).filter((w) => w.campaign_id === id);
    const s = (b.sales ?? []).filter((x) => x.campaign_id === id);
    return {
      campaign_id: id,
      emails_sent: soma(em, "sent_count"), emails_opened: soma(em, "opened_count"),
      emails_clicked: soma(em, "clicked_count"), emails_unsubscribed: soma(em, "unsubscribed_count"),
      emails_bounced: soma(em, "bounced_count"), emails_complaints: soma(em, "complaints_count"),
      wa_messages: wa.length, wa_reactions: soma(wa, "reactions_count"),
      wa_recipients: soma(wa, "recipients_count"), wa_reads: soma(wa, "read_count"),
      wa_members: Math.max(0, ...ws.map((w) => Number(w.members_count ?? 0))),
      wa_joined: Math.max(0, ...ws.map((w) => Number(w.joined_count ?? 0))),
      wa_left: Math.max(0, ...ws.map((w) => Number(w.left_count ?? 0))),
      revenue_email: soma(s, "revenue_email"), revenue_whatsapp: soma(s, "revenue_whatsapp"),
      revenue_other: soma(s, "revenue_other"), leads_count: soma(s, "leads_count"),
      sales_count: soma(s, "sales_count"), sales_email_count: soma(s, "sales_email_count"),
      sales_whatsapp_count: soma(s, "sales_whatsapp_count"), sales_other_count: soma(s, "sales_other_count"),
    };
  });
}

function concluirCard(id: unknown, concluir: boolean) {
  const card = visao("cards").find((c) => c.id === id);
  if (!card) return { message: "Card não encontrado." };
  const cols = visao("board_columns").filter((c) => c.board_id === card.board_id).sort((a, b) => comparar(a.position, b.position));
  const destino = concluir ? cols.find((c) => c.is_done_column) : cols.find((c) => !c.is_done_column && !c.is_paused_column);
  const antes = { ...card };
  if (destino) card.column_id = destino.id;
  card.completed_at = concluir ? new Date().toISOString() : null;
  card.updated_at = new Date().toISOString();
  aoAtualizar("cards", antes, card);
  emitir("cards", "UPDATE", card, antes);
  return null;
}

async function rpc(nome: string, args: Record<string, unknown> = {}): Promise<Resposta> {
  await atraso();
  switch (nome) {
    case "has_role": {
      const papeis = visao("user_roles").filter((r) => r.user_id === args._user_id).map((r) => r.role);
      return { data: papeis.includes(args._role), error: null };
    }
    case "can_view_tab":
    case "can_edit_tab":
    case "can_view_board":
    case "has_capability":
    case "is_approved":
    case "is_authenticated_user":
    case "can_edit":
      return { data: true, error: null };
    case "get_user_status":
      return { data: "approved", error: null };
    case "home_complete_card": {
      const erro = concluirCard(args._card_id, true);
      avisarMudanca("cards");
      return { data: null, error: erro };
    }
    case "home_reopen_card": {
      const erro = concluirCard(args._card_id, false);
      avisarMudanca("cards");
      return { data: null, error: erro };
    }
    case "mark_card_notifications_read": {
      for (const n of visao("notifications")) if (n.card_id === args._card_id && !n.read_at) n.read_at = new Date().toISOString();
      return { data: null, error: null };
    }
    case "campaign_compare_metrics":
      return { data: metricasPorFase((args._campaign_ids as string[]) ?? [], "all"), error: null };
    case "campaign_compare_metrics_by_phase":
      return { data: metricasPorFase((args._campaign_ids as string[]) ?? [], String(args._phase ?? "all")), error: null };
    case "override_subitems_once":
    case "log_card_activity":
      return { data: null, error: null };
    case "match_document_chunks":
      return { data: [], error: null };
    default:
      return { data: null, error: { message: `A função ${nome} não existe na demonstração.` } };
  }
}

// ---------------------------------------------------------------- login

/** Sem login: quem abre o NEXUS já está dentro, como administrador. */
const SESSAO = {
  user: {
    id: DEMO_USER.id, email: DEMO_USER.email, aud: "authenticated", role: "authenticated",
    app_metadata: {}, user_metadata: { full_name: DEMO_USER.full_name }, created_at: "2026-01-05T12:00:00.000Z",
  },
  access_token: "demo", refresh_token: "demo", token_type: "bearer", expires_in: 86400,
  expires_at: Math.floor(Date.now() / 1000) + 86400,
};

const auth = {
  async getSession() {
    return { data: { session: SESSAO }, error: null };
  },
  async getUser() {
    return { data: { user: SESSAO.user }, error: null };
  },
  async getClaims() {
    return { data: { claims: { sub: SESSAO.user.id, email: SESSAO.user.email } }, error: null };
  },
  onAuthStateChange(ouvinte: (evento: string, sessao: typeof SESSAO | null) => void) {
    setTimeout(() => ouvinte("INITIAL_SESSION", SESSAO), 0);
    return { data: { subscription: { unsubscribe: () => undefined } } };
  },
  async signInWithPassword() {
    return { data: { session: SESSAO, user: SESSAO.user }, error: null };
  },
  async signUp() {
    return { data: { session: null, user: null }, error: { message: "Na demonstração não há cadastro." } };
  },
  async signOut() {
    return { error: null };
  },
  async resetPasswordForEmail() {
    return { data: {}, error: null };
  },
  async updateUser() {
    return { data: { user: SESSAO.user }, error: null };
  },
};

// ---------------------------------------------------------------- storage

/** Arquivos enviados viram endereços locais do navegador (somem ao recarregar). */
const arquivos = new Map<string, string>();
const storage = {
  from(balde: string) {
    return {
      async upload(caminho: string, arquivo: Blob) {
        await atraso();
        const url = typeof URL !== "undefined" && "createObjectURL" in URL ? URL.createObjectURL(arquivo) : "";
        arquivos.set(`${balde}/${caminho}`, url);
        return { data: { path: caminho }, error: null };
      },
      getPublicUrl(caminho: string) {
        return { data: { publicUrl: arquivos.get(`${balde}/${caminho}`) ?? "" } };
      },
      async remove() {
        return { data: [], error: null };
      },
    };
  },
};

// ---------------------------------------------------------------- cliente

const cliente = {
  from: (tabela: string) => new Consulta(tabela),
  rpc,
  auth,
  storage,
  channel: () => canal(),
  removeChannel: (c: { unsubscribe?: () => unknown }) => {
    c?.unsubscribe?.();
    return Promise.resolve("ok");
  },
  removeAllChannels: () => {
    canais.clear();
    return Promise.resolve([]);
  },
  functions: {
    async invoke() {
      return { data: null, error: { message: "Indisponível na demonstração." } };
    },
  },
};

instalarIaDemo();

/** Tipado como o cliente de verdade, para o resto do código não mudar. */
export const supabaseDemo = cliente as unknown as SupabaseClient<Database>;
