/**
 * Respostas de exemplo para as partes de IA.
 *
 * No NEXUS de verdade, "Perguntar aos documentos" e "Criar tarefas com IA"
 * chamam um modelo de linguagem no servidor. A demonstração não tem servidor
 * nem chave paga: estas rotas são atendidas aqui mesmo, no navegador, com
 * regras simples sobre os dados fictícios.
 */

import { dadosDemo } from "./cliente";

const AVISO = "Demonstração: resposta montada por regras simples, sem IA de verdade.";

function textoDoDocumento(no: unknown): string {
  if (!no || typeof no !== "object") return "";
  const n = no as { text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  return (n.content ?? []).map(textoDoDocumento).join(" ");
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function perguntarDocumentos(pergunta: string): Response {
  const palavras = normalizar(pergunta).split(/\W+/).filter((p) => p.length > 3);
  const docs = (dadosDemo().documents ?? []).map((d) => {
    const texto = textoDoDocumento(d.content);
    const alvo = normalizar(`${d.title} ${texto}`);
    const pontos = palavras.reduce((t, p) => t + (alvo.includes(p) ? 1 : 0), 0);
    return { d, texto, pontos };
  });
  const achados = docs.filter((x) => x.pontos > 0).sort((a, b) => b.pontos - a.pontos).slice(0, 2);
  const usados = achados.length ? achados : docs.slice(0, 1);
  const fontes = usados.map((x, i) => ({
    chunk_id: `demo-${i}`, document_id: x.d.id, title: x.d.title, icon: x.d.icon ?? null,
    similarity: Number((0.9 - i * 0.1).toFixed(2)),
  }));
  const resposta = achados.length
    ? `Encontrei isso em "${usados[0]!.d.title}":\n\n${usados[0]!.texto.slice(0, 420)}${usados[0]!.texto.length > 420 ? "…" : ""}\n\n_${AVISO}_`
    : `Não achei nada sobre isso nos documentos. Tente perguntar sobre a campanha semanal, o padrão de nomes de VSL ou o onboarding.\n\n_${AVISO}_`;

  const enc = new TextEncoder();
  const pedacos = [`__SOURCES__${JSON.stringify(fontes)}\n\n`, ...resposta.match(/.{1,24}/gs)!];
  const corpo = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      for (const p of pedacos) {
        ctrl.enqueue(enc.encode(p));
        await new Promise((r) => setTimeout(r, 25));
      }
      ctrl.close();
    },
  });
  return new Response(corpo, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

const ESTEIRA_POR_PALAVRA: Array<[RegExp, string]> = [
  [/edi[cç][aã]o|v[ií]deo|criativo|vsl|corte|legenda/i, "Edição"],
  [/copy|e-?mail|whats|roteiro|texto|p[aá]gina de vendas/i, "Copy"],
  [/an[uú]ncio|tr[aá]fego|campanha|p[uú]blico|pixel/i, "Tráfego"],
  [/p[aá]gina|checkout|dom[ií]nio|bot[aã]o|site|[aá]rea de membros/i, "Infra"],
  [/teste|hip[oó]tese/i, "Testes"],
];

function criarTarefas(texto: string): Response {
  const db = dadosDemo();
  const esteiras = db.boards ?? [];
  const colunas = (db.board_columns ?? []).slice().sort((a, b) => Number(a.position) - Number(b.position));
  const pessoas = (db.profiles ?? []).filter((p) => p.status === "approved");
  const linhas = texto.split(/\n+/).map((l) => l.replace(/^[-•*\d.)\s]+/, "").trim()).filter(Boolean);

  const hoje = new Date();
  const prazo = (l: string): string | null => {
    const dias = /amanh[aã]/i.test(l) ? 1 : /semana que vem|pr[oó]xima semana/i.test(l) ? 7 : /hoje/i.test(l) ? 0 : null;
    if (dias === null) return null;
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const tarefas = linhas.map((l) => {
    const nomeEsteira = ESTEIRA_POR_PALAVRA.find(([re]) => re.test(l))?.[1] ?? "Gestão";
    const esteira = esteiras.find((e) => e.name === nomeEsteira) ?? esteiras[0];
    const coluna = colunas.find((c) => c.board_id === esteira?.id);
    const responsaveis = pessoas
      .filter((p) => new RegExp(`\\b${String(p.full_name).split(" ")[0]}\\b`, "i").test(l))
      .map((p) => p.id as string);
    const titulo = l.replace(/\s+(para|pro|pra)\s+o?a?\s*\w+\s*$/i, "").replace(/^\w/, (c) => c.toUpperCase());
    return {
      title: titulo.slice(0, 120), board_id: (esteira?.id as string) ?? null, column_id: (coluna?.id as string) ?? null,
      assignee_ids: responsaveis, due_date: prazo(l), description: null, existing_card_id: null,
    };
  });

  const proposta = {
    intent: tarefas.length ? "create" : "unclear",
    tasks: tarefas,
    candidate_card_ids: [],
    note: AVISO,
    reasoning: null,
    question: tarefas.length ? null : "Escreva uma tarefa por linha.",
  };
  return new Response(JSON.stringify(proposta), { status: 200, headers: { "Content-Type": "application/json" } });
}

let instalado = false;

/** Atende no navegador as rotas de IA que no NEXUS de verdade ficam no servidor. */
export function instalarIaDemo() {
  if (instalado || typeof window === "undefined") return;
  instalado = true;
  const original = window.fetch.bind(window);
  window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.pathname : entrada.url;
    const caminho = url.replace(/^https?:\/\/[^/]+/, "");
    if (caminho.startsWith("/api/documents/index-pending")) {
      return new Response(JSON.stringify({ processed: (dadosDemo().documents ?? []).length }), { status: 200 });
    }
    if (caminho.startsWith("/api/documents/ask")) {
      const corpo = JSON.parse(String(init?.body ?? "{}")) as { question?: string };
      await new Promise((r) => setTimeout(r, 400));
      return perguntarDocumentos(corpo.question ?? "");
    }
    if (caminho.startsWith("/api/tasks/ai")) {
      const corpo = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
      await new Promise((r) => setTimeout(r, 600));
      return criarTarefas(corpo.text ?? "");
    }
    return original(entrada as RequestInfo, init);
  };
}
