# NEXUS — demonstração

Plataforma interna de operação e métricas de uma empresa de produtos digitais, no estilo ClickUp:
junta num só lugar as tarefas da equipe, os funis de venda de cada oferta, as campanhas semanais de
e-mail e WhatsApp e os relatórios de produtividade.

**Esta versão é uma demonstração.** Todos os dados — pessoas, produtos, campanhas e números — são
fictícios, gerados no navegador a cada visita (`src/demo`). Não há banco nem login: o NEXUS abre
direto como administrador, e o que for alterado fica guardado até a página ser recarregada.

## O que tem

- **Minhas tarefas** — o que está com você hoje, agrupado por esteira, com subtarefas e a campanha
  da semana em destaque.
- **Esteiras** — quadros kanban por área (Copy, Tráfego, Edição, Infra, Testes, Gestão), com
  responsáveis, prioridade, prazos, subtarefas que bloqueiam o card, campos personalizados,
  etiquetas, comentários com menção e histórico de edições.
- **Funis** — cada oferta por mercado (Brasil, LATAM, Europa) e por front-end/back-end, com o
  fluxograma montado sozinho (entrada, upsells, downsells, entregável), a VSL de cada etapa, o
  alerta de "botão fora da regra" e os testes A/B que estão rodando.
- **Agenda** — calendário das tarefas com período definido.
- **Documentos** — editor de texto rico com páginas aninhadas e "Perguntar aos documentos".
- **Inventário de VSLs** — vídeos de venda por funil, com pitch, conversão e editor.
- **Chips de WhatsApp** — controle de recargas e vencimentos dos chips pré-pagos.
- **Campanhas, Dashboard, Comparar e Ranking** — resultados semanais de e-mail e WhatsApp,
  separados em nutrição (seg–sex) e venda (fim de semana), comparação entre semanas e ranking dos
  melhores assuntos.
- **Relatórios** — lead time, cycle time, gargalos da equipe e horas de edição de vídeo.
- **Usuários e Configurações** — perfis de permissão por aba (ver/editar), squads, etiquetas,
  campos personalizados e tipos de coluna.

## Como a demonstração funciona

O código das telas é o mesmo da versão em produção. A diferença está em
`src/integrations/supabase/client.ts`, que em vez do Supabase de verdade exporta o cliente de
`src/demo/cliente.ts`: ele implementa a parte da API usada pelo app (consultas com filtros e
relações, gravações, funções do banco, realtime e storage) sobre os dados de `src/demo/dados.ts`.
As partes de IA respondem com regras simples (`src/demo/ia.ts`), sem modelo de linguagem.

## Stack

React 19, TanStack Start/Router/Query, Tailwind CSS v4, shadcn/ui (Radix), TipTap, dnd-kit e
Recharts. Na versão em produção: Supabase (Postgres com RLS por perfil, Realtime, Storage) e IA para
busca nos documentos e criação de tarefas.

## Rodar

```bash
bun install
bun run dev     # http://localhost:8080
bun run build   # gera .vercel/output
```

## Publicar na Vercel

Importe o repositório na Vercel. O build (`vite build`) já sai no formato da Vercel; não precisa de
variável de ambiente.

---

## English

**NEXUS** is an internal operations and metrics platform for a digital products company: team
tasks (kanban boards), sales funnels per offer and market, weekly email/WhatsApp campaign results,
and productivity reports. This is a **demo**: all data is fictional and generated in the browser;
there is no backend or login — you enter as an admin, and any change lasts until you reload the
page. The UI is in Portuguese.
