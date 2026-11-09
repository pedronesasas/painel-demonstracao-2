// Tipos da tela "Minhas tarefas" (rota /), usados pela lista e pelo quadro

export type TaskItem = {
  kind: "task";
  id: string;
  short_id: string;
  title: string;
  due_date: string | null;
  board_id: string;
  column_id: string;
  recurring: boolean;
  paused: boolean;
};

export type SubItem = {
  kind: "sub";
  id: string;
  card_id: string;
  parent_short_id: string;
  parent_title: string;
  parent_board_id: string;
  // Coluna do card pai: no quadro a subtarefa aparece no tipo dessa coluna
  parent_column_id: string;
  title: string;
  due_date: string | null;
};

export type DoneItem = {
  id: string;
  short_id: string;
  title: string;
  board_id: string;
  completed_at: string;
};

export type SquadTaskItem = {
  id: string;
  short_id: string;
  title: string;
  due_date: string | null;
  board_id: string;
  squad_id: string;
};

export type SquadLite = { id: string; name: string; color: string };
export type Item = TaskItem | SubItem;
export type BoardLite = { id: string; name: string; color: string };

// Coluna real da esteira (board_columns)
export type ColumnLite = {
  id: string;
  name: string;
  color: string;
  position: number;
  kind_id: string | null;
  is_paused_column: boolean;
  is_done_column: boolean;
};

// Tipo de coluna (board_column_kinds): Pendente, Em progresso, Revisão...
export type ColumnKind = {
  id: string;
  label: string;
  sort: number;
  is_done: boolean;
  is_paused: boolean;
};

export type CampaignLite = {
  language_id?: string | null;
  id: string;
  code: string;
  product_name: string;
  start_date: string | null;
  end_date: string | null;
};
