import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  BatteryCharging, CalendarClock, CircleCheck, Database, Pencil, Plus, RefreshCw,
  Smartphone, Trash2, TriangleAlert, Wallet, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { cn, formatDateBR, todayLocalISO } from "@/lib/utils";
import { formatCurrencyBRL } from "@/lib/campaign-utils";
import {
  CHIP_COLUMNS, CHIP_STATUS, CHIP_STATUS_OPTIONS, MISSING_TABLE_MESSAGE,
  addDaysISO, chipDeadline, deadlineLabel, describeChipError, isMissingTableError,
  moneyToInput, normalizeChip, parseMoneyBR, parseValidityDays, phoneKey, sortChips, summarizeChips,
  type Chip, type ChipStatus, type ChipSummary, type Deadline,
} from "@/lib/chips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ListSkeleton, EmptyState } from "@/components/ui/loading-state";

const CHIPS_KEY = ["whatsapp-chips"] as const;

// Tabela nova, ainda fora do types.ts gerado: por isso o `as never` (mesmo padrão de card_assignees)
const chipsTable = () => supabase.from("whatsapp_chips" as never);

const NOT_FOUND_MESSAGE = "Chip não encontrado — talvez tenha sido excluído. A lista foi atualizada.";

export const Route = createFileRoute("/chips")({
  head: () => ({
    meta: [
      { title: "Chips de WhatsApp — NEXUS" },
      { name: "description", content: "Controle dos chips pré-pagos: status e prazo de recarga." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="chips">
      <AppLayout><ChipsPage /></AppLayout>
    </RequireTabAccess>
  ),
});

function ChipsPage() {
  const { canEditTab, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Chip | null>(null);
  const [recharging, setRecharging] = useState<Chip | null>(null);

  const { data: chips, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: CHIPS_KEY,
    queryFn: async () => {
      const { data, error } = await chipsTable().select(CHIP_COLUMNS);
      if (error) throw error;
      return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(normalizeChip);
    },
    // Tabela ausente (migração não aplicada) não melhora tentando de novo
    retry: (failureCount, err) => !isMissingTableError(err) && failureCount < 2,
  });

  const today = todayLocalISO();
  const sorted = useMemo(() => sortChips(chips ?? [], today), [chips, today]);
  const summary = useMemo(() => summarizeChips(chips ?? [], today), [chips, today]);
  const missingTable = isMissingTableError(error);
  const canManage = canEditTab("chips") && !missingTable;

  const refresh = () => qc.invalidateQueries({ queryKey: CHIPS_KEY });
  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (chip: Chip) => { setEditing(chip); setFormOpen(true); };

  const handleDelete = async (chip: Chip) => {
    const { data, error } = await chipsTable().delete().eq("id", chip.id).select("id");
    if (error) {
      toast.error("Não foi possível excluir", { description: describeChipError(error) });
      return;
    }
    if (!data || (data as unknown[]).length === 0) toast.error(NOT_FOUND_MESSAGE);
    else toast.success(`Chip "${chip.nickname}" excluído`);
    refresh();
  };

  const newChipButton = (
    <Button onClick={openNew}>
      <Plus className="h-4 w-4" />
      Novo chip
    </Button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chips de WhatsApp"
        description="Controle dos chips pré-pagos: o que está ativo e o que precisa de recarga para não perder a linha."
        actions={canManage && !isLoading && newChipButton}
      />

      {isLoading ? (
        <Card className="p-4"><ListSkeleton rows={5} /></Card>
      ) : missingTable ? (
        <MissingTableCard showFiles={isAdmin} />
      ) : error ? (
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <TriangleAlert className="h-5 w-5 shrink-0 text-destructive mt-0.5" aria-hidden="true" />
            <div className="space-y-1 min-w-0">
              <p className="font-medium">Não foi possível carregar os chips.</p>
              <p className="text-sm text-muted-foreground break-words">{describeChipError(error)}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Tentar de novo
          </Button>
        </Card>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={Smartphone}
          title="Nenhum chip cadastrado ainda"
          description={canManage
            ? "Cadastre os chips pré-pagos para acompanhar quais estão ativos e quando cada um precisa de recarga."
            : "Aguarde alguém com permissão cadastrar os chips."}
          action={canManage ? newChipButton : undefined}
        />
      ) : (
        <>
          <SummaryTiles summary={summary} />
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Apelido / número</TableHead>
                  <TableHead>Operadora</TableHead>
                  <TableHead>Uso</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="whitespace-nowrap">Última recarga</TableHead>
                  <TableHead className="whitespace-nowrap">Recarregar até</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="whitespace-nowrap">Quem paga</TableHead>
                  {canManage && <TableHead><span className="sr-only">Ações</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((chip) => (
                  <ChipRow
                    key={chip.id}
                    chip={chip}
                    deadline={chipDeadline(chip, today)}
                    canManage={canManage}
                    onRecharge={setRecharging}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {canManage && (
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          {formOpen && (
            <ChipFormDialog
              chip={editing}
              chips={chips ?? []}
              onCancel={() => setFormOpen(false)}
              onSaved={() => {
                setFormOpen(false);
                setEditing(null);
                refresh();
              }}
            />
          )}
        </Dialog>
      )}

      {canManage && (
        <Dialog open={recharging !== null} onOpenChange={(open) => { if (!open) setRecharging(null); }}>
          {recharging && (
            <RechargeDialog
              chip={recharging}
              onCancel={() => setRecharging(null)}
              onSaved={() => {
                setRecharging(null);
                refresh();
              }}
            />
          )}
        </Dialog>
      )}
    </div>
  );
}

function MissingTableCard({ showFiles }: { showFiles: boolean }) {
  return (
    <Card className="p-6 border-warning/40">
      <div className="flex items-start gap-3">
        <Database className="h-5 w-5 shrink-0 text-warning mt-0.5" aria-hidden="true" />
        <div className="space-y-1 min-w-0">
          <p className="font-medium">{MISSING_TABLE_MESSAGE}</p>
          <p className="text-sm text-muted-foreground">
            Depois que ela for aplicada, é só recarregar esta página.
          </p>
          {showFiles && (
            <p className="text-xs text-muted-foreground">
              Arquivos, nesta ordem: <code className="font-mono break-all">supabase/migrations/20260930150000_chips_tab_key.sql</code>{" "}
              e depois <code className="font-mono break-all">supabase/migrations/20260930150100_whatsapp_chips.sql</code>.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------- Resumo ----------

type TileTone = "success" | "warning" | "danger" | "primary";

const TILE_TONE: Record<TileTone, { text: string; border: string }> = {
  success: { text: "text-success", border: "" },
  warning: { text: "text-warning", border: "border-warning/35" },
  danger: { text: "text-destructive", border: "border-destructive/35" },
  primary: { text: "text-primary", border: "" },
};

function SummaryTiles({ summary: s }: { summary: ChipSummary }) {
  const chipsWord = (n: number) => `${n} ${n === 1 ? "chip" : "chips"}`;
  const rechargeSub = s.toRechargeCount === 0
    ? "nada vencendo na semana"
    : `${chipsWord(s.toRechargeCount)}${s.toRechargeWithoutAmount > 0 ? ` · ${s.toRechargeWithoutAmount} sem valor cadastrado` : ""}`;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <SummaryTile
        icon={CircleCheck} tone="success" highlight={s.active > 0}
        label="Ativos" value={String(s.active)}
        sub={`${s.reserve} na reserva · ${s.total} no total`}
      />
      <SummaryTile
        icon={CalendarClock} tone="warning" highlight={s.dueSoon > 0}
        label="Vencem em até 7 dias" value={String(s.dueSoon)}
        sub={s.dueToday > 0 ? `${s.dueToday} ${s.dueToday === 1 ? "vence" : "vencem"} hoje` : "ativos e reserva"}
      />
      <SummaryTile
        icon={TriangleAlert} tone="danger" highlight={s.overdue > 0}
        label="Vencidos" value={String(s.overdue)}
        sub={s.overdue > 0 ? "recarregar o quanto antes" : "nenhum atrasado"}
      />
      <SummaryTile
        icon={Wallet} tone="primary" highlight={s.toRechargeCount > 0}
        label="A recarregar em 7 dias" value={formatCurrencyBRL(s.toRechargeAmount)}
        sub={rechargeSub}
      />
    </div>
  );
}

function SummaryTile({ icon: Icon, tone, highlight, label, value, sub }: {
  icon: LucideIcon; tone: TileTone; highlight: boolean; label: string; value: string; sub: string;
}) {
  const t = TILE_TONE[tone];
  // Número colorido só nos alertas (vencidos/vencendo); nos outros só o ícone
  const colorValue = highlight && (tone === "warning" || tone === "danger");
  return (
    <div className={cn("min-w-0 rounded-xl border bg-card p-4 shadow-card", highlight && t.border)}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <Icon className={cn("h-4 w-4 shrink-0", highlight ? t.text : "text-muted-foreground")} aria-hidden="true" />
      </div>
      <div className={cn("mt-1 truncate text-lg sm:text-2xl font-bold tabular-nums", colorValue && t.text)} title={value}>
        {value}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

// ---------- Tabela ----------

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

function ChipRow({ chip, deadline, canManage, onRecharge, onEdit, onDelete }: {
  chip: Chip;
  deadline: Deadline;
  canManage: boolean;
  onRecharge: (chip: Chip) => void;
  onEdit: (chip: Chip) => void;
  onDelete: (chip: Chip) => Promise<void>;
}) {
  const status = CHIP_STATUS[chip.status];
  return (
    <TableRow
      className={cn(
        deadline.tone === "overdue" && "bg-destructive/5",
        deadline.tone === "soon" && "bg-warning/5",
        deadline.tone === "inactive" && "opacity-60 hover:opacity-100",
      )}
    >
      <TableCell>
        <div className="max-w-[220px]">
          <div className="font-medium break-words">{chip.nickname}</div>
          <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{chip.phone}</div>
          {chip.notes && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground" title={chip.notes}>{chip.notes}</div>
          )}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap">{chip.carrier ?? <Dash />}</TableCell>
      <TableCell>
        {chip.usage ? <div className="min-w-[120px] max-w-[220px] break-words">{chip.usage}</div> : <Dash />}
      </TableCell>
      <TableCell><Badge variant={status.badge}>{status.label}</Badge></TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {chip.last_recharge_date ? formatDateBR(chip.last_recharge_date) : <Dash />}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <DeadlineCell expiresOn={chip.expires_on} deadline={deadline} />
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums">
        {chip.recharge_amount !== null ? formatCurrencyBRL(chip.recharge_amount) : <Dash />}
      </TableCell>
      <TableCell>
        {chip.payer ? <div className="max-w-[160px] break-words">{chip.payer}</div> : <Dash />}
      </TableCell>
      {canManage && (
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="outline" size="sm" onClick={() => onRecharge(chip)}
              title="Registrar recarga" aria-label={`Registrar recarga de ${chip.nickname}`}
            >
              <BatteryCharging className="h-4 w-4" />
              Recarga
            </Button>
            <Button
              variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(chip)}
              title="Editar" aria-label={`Editar ${chip.nickname}`}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Excluir" aria-label={`Excluir ${chip.nickname}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              }
              title="Excluir chip?"
              description={`O chip "${chip.nickname}" (${chip.phone}) sai do controle. Esta ação não pode ser desfeita.`}
              confirmLabel="Excluir"
              destructive
              onConfirm={() => onDelete(chip)}
            />
          </div>
        </TableCell>
      )}
    </TableRow>
  );
}

function DeadlineCell({ expiresOn, deadline }: { expiresOn: string | null; deadline: Deadline }) {
  if (!expiresOn) return <Dash />;
  // Bloqueado/perdido: só a data, sem alerta
  const days = deadline.tone === "inactive" ? null : deadline.daysLeft;
  const variant = deadline.tone === "overdue" ? "danger" : deadline.tone === "soon" ? "warning" : "neutral";
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="tabular-nums">{formatDateBR(expiresOn)}</span>
      {days !== null && (
        <Badge variant={variant} className="px-1.5 py-0 text-2xs font-medium">
          {deadlineLabel(days)}
        </Badge>
      )}
    </div>
  );
}

// ---------- Formulários ----------

function Field({ id, label, hint, children }: { id: string; label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function uniqueValues(values: Array<string | null>, extra: string[] = []): string[] {
  const set = new Set(extra);
  for (const v of values) if (v && v.trim()) set.add(v.trim());
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function ChipFormDialog({ chip, chips, onSaved, onCancel }: {
  chip: Chip | null;
  chips: Chip[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const [nickname, setNickname] = useState(chip?.nickname ?? "");
  const [phone, setPhone] = useState(chip?.phone ?? "");
  const [carrier, setCarrier] = useState(chip?.carrier ?? "");
  const [usage, setUsage] = useState(chip?.usage ?? "");
  const [status, setStatus] = useState<ChipStatus>(chip?.status ?? "ativo");
  const [lastRecharge, setLastRecharge] = useState(chip?.last_recharge_date ?? "");
  const [validity, setValidity] = useState(chip?.validity_days != null ? String(chip.validity_days) : "");
  const [expiresOn, setExpiresOn] = useState(chip?.expires_on ?? "");
  const [amount, setAmount] = useState(moneyToInput(chip?.recharge_amount ?? null));
  const [payer, setPayer] = useState(chip?.payer ?? "");
  const [notes, setNotes] = useState(chip?.notes ?? "");
  const [saving, setSaving] = useState(false);

  // Sugestões com o que já foi digitado nos outros chips
  const suggestions = useMemo(() => ({
    carriers: uniqueValues(chips.map((c) => c.carrier), ["Claro", "Oi", "TIM", "Vivo"]),
    usages: uniqueValues(chips.map((c) => c.usage)),
    payers: uniqueValues(chips.map((c) => c.payer)),
  }), [chips]);

  // "Recarregar até" = última recarga + validade sempre que um dos dois muda.
  // Continua editável: mexer só na data não é sobrescrito.
  const autoFillExpires = (last: string, validityText: string) => {
    const days = parseValidityDays(validityText);
    if (!last || days === null || Number.isNaN(days)) return;
    const next = addDaysISO(last, days);
    if (next) setExpiresOn(next);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !phone.trim()) {
      toast.error("Preencha apelido e número");
      return;
    }
    const key = phoneKey(phone);
    const duplicate = key.length >= 8 ? chips.find((c) => c.id !== chip?.id && phoneKey(c.phone) === key) : undefined;
    if (duplicate) {
      toast.error(`Já existe um chip com esse número: "${duplicate.nickname}"`, {
        description: "Edite o chip existente em vez de cadastrar de novo.",
      });
      return;
    }
    const validityDays = parseValidityDays(validity);
    if (Number.isNaN(validityDays)) {
      toast.error("Validade: use um número inteiro de dias, maior que zero (ex.: 30)");
      return;
    }
    const rechargeAmount = parseMoneyBR(amount);
    if (Number.isNaN(rechargeAmount)) {
      toast.error("Valor da recarga inválido. Use, por exemplo, 20,00");
      return;
    }
    if (lastRecharge && expiresOn && expiresOn < lastRecharge) {
      toast.error("“Recarregar até” não pode ser antes da última recarga");
      return;
    }

    const payload = {
      nickname: nickname.trim(),
      phone: phone.trim(),
      carrier: carrier.trim() || null,
      usage: usage.trim() || null,
      status,
      last_recharge_date: lastRecharge || null,
      validity_days: validityDays,
      expires_on: expiresOn || null,
      recharge_amount: rechargeAmount,
      payer: payer.trim() || null,
      notes: notes.trim() || null,
    };

    setSaving(true);
    let error: unknown = null;
    let notFound = false;
    if (chip) {
      const res = await chipsTable().update(payload as never).eq("id", chip.id).select("id");
      error = res.error;
      notFound = !res.error && (!res.data || (res.data as unknown[]).length === 0);
    } else {
      const res = await chipsTable().insert({ ...payload, created_by: user?.id ?? null } as never);
      error = res.error;
    }
    setSaving(false);

    if (error) {
      toast.error("Não foi possível salvar", { description: describeChipError(error) });
      return;
    }
    if (notFound) toast.error(NOT_FOUND_MESSAGE);
    else toast.success(chip ? "Chip atualizado" : "Chip cadastrado");
    onSaved();
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{chip ? "Editar chip" : "Novo chip"}</DialogTitle>
        <DialogDescription>Campos com * são obrigatórios.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="chip-nickname" label="Apelido *">
            <Input
              id="chip-nickname" value={nickname} onChange={(e) => setNickname(e.target.value)}
              placeholder="Ex.: CHIP 02" maxLength={80} required
            />
          </Field>
          <Field id="chip-phone" label="Número *">
            <Input
              id="chip-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex.: +55 11 91234-5678" maxLength={40} required
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="chip-carrier" label="Operadora">
            <Input
              id="chip-carrier" list="chip-carrier-options" value={carrier}
              onChange={(e) => setCarrier(e.target.value)} placeholder="Ex.: Vivo" maxLength={60}
            />
          </Field>
          <Field id="chip-status" label="Status *">
            <Select value={status} onValueChange={(v) => setStatus(v as ChipStatus)}>
              {/* No campo só o nome do status; a descrição aparece na lista */}
              <SelectTrigger id="chip-status"><SelectValue>{CHIP_STATUS[status].label}</SelectValue></SelectTrigger>
              <SelectContent className="max-w-[420px]">
                {CHIP_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="py-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold">{o.label}</span>
                      <span className="text-xs text-muted-foreground whitespace-normal">{o.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field id="chip-usage" label="Onde é usado">
          <Input
            id="chip-usage" list="chip-usage-options" value={usage}
            onChange={(e) => setUsage(e.target.value)} placeholder="Ex.: SendFlow — campanha Brasil" maxLength={200}
          />
        </Field>

        <div className="rounded-lg border p-3 sm:p-4 space-y-4">
          <div className="eyebrow">Recarga</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field id="chip-last-recharge" label="Última recarga">
              <Input
                id="chip-last-recharge" type="date" value={lastRecharge}
                onChange={(e) => { setLastRecharge(e.target.value); autoFillExpires(e.target.value, validity); }}
              />
            </Field>
            <Field id="chip-validity" label="Validade (dias)">
              <Input
                id="chip-validity" type="number" inputMode="numeric" min={1} step={1} value={validity}
                onChange={(e) => { setValidity(e.target.value); autoFillExpires(lastRecharge, e.target.value); }}
                placeholder="Ex.: 30"
              />
            </Field>
            <Field id="chip-expires" label="Recarregar até">
              <Input
                id="chip-expires" type="date" value={expiresOn}
                onChange={(e) => setExpiresOn(e.target.value)}
              />
            </Field>
          </div>
          <p className="text-xs text-muted-foreground">
            Com a última recarga e a validade preenchidas, “Recarregar até” é calculado sozinho — dá para ajustar à mão.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="chip-amount" label="Valor da recarga (R$)">
              <Input
                id="chip-amount" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="Ex.: 20,00" maxLength={20}
              />
            </Field>
            <Field id="chip-payer" label="Quem paga">
              <Input
                id="chip-payer" list="chip-payer-options" value={payer}
                onChange={(e) => setPayer(e.target.value)} placeholder="Ex.: Ana" maxLength={80}
              />
            </Field>
          </div>
        </div>

        <Field id="chip-notes" label="Observações">
          <Textarea
            id="chip-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas internas (opcional)" rows={3}
          />
        </Field>

        <datalist id="chip-carrier-options">
          {suggestions.carriers.map((v) => <option key={v} value={v} />)}
        </datalist>
        <datalist id="chip-usage-options">
          {suggestions.usages.map((v) => <option key={v} value={v} />)}
        </datalist>
        <datalist id="chip-payer-options">
          {suggestions.payers.map((v) => <option key={v} value={v} />)}
        </datalist>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvando..." : chip ? "Salvar" : "Cadastrar chip"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RechargeDialog({ chip, onSaved, onCancel }: {
  chip: Chip;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(todayLocalISO());
  const [amount, setAmount] = useState(moneyToInput(chip.recharge_amount));
  const [manualExpires, setManualExpires] = useState("");
  const [saving, setSaving] = useState(false);

  const validity = chip.validity_days !== null && chip.validity_days > 0 ? chip.validity_days : null;
  const computedExpires = validity !== null && date ? addDaysISO(date, validity) : null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!date) {
      toast.error("Informe a data da recarga");
      return;
    }
    const rechargeAmount = parseMoneyBR(amount);
    if (Number.isNaN(rechargeAmount)) {
      toast.error("Valor inválido. Use, por exemplo, 20,00");
      return;
    }
    const newExpires = validity !== null ? computedExpires : manualExpires;
    if (!newExpires) {
      toast.error("Informe a nova data de “Recarregar até”");
      return;
    }
    if (newExpires < date) {
      toast.error("“Recarregar até” não pode ser antes da data da recarga");
      return;
    }

    setSaving(true);
    const { data, error } = await chipsTable()
      .update({ last_recharge_date: date, recharge_amount: rechargeAmount, expires_on: newExpires } as never)
      .eq("id", chip.id)
      .select("id");
    setSaving(false);

    if (error) {
      toast.error("Não foi possível registrar a recarga", { description: describeChipError(error) });
      return;
    }
    if (!data || (data as unknown[]).length === 0) toast.error(NOT_FOUND_MESSAGE);
    else toast.success("Recarga registrada", { description: `${chip.nickname}: próxima recarga até ${formatDateBR(newExpires)}.` });
    onSaved();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Registrar recarga</DialogTitle>
        <DialogDescription>{chip.nickname} · {chip.phone}</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="recharge-date" label="Data da recarga">
            <Input id="recharge-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field id="recharge-amount" label="Valor (R$)">
            <Input
              id="recharge-amount" inputMode="decimal" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="Ex.: 20,00" maxLength={20}
            />
          </Field>
        </div>

        {validity !== null ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Novo prazo (Recarregar até)</div>
            <div className="mt-0.5 font-semibold tabular-nums">
              {computedExpires ? formatDateBR(computedExpires) : "—"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Data da recarga + {validity} {validity === 1 ? "dia" : "dias"} de validade.
            </div>
          </div>
        ) : (
          <Field
            id="recharge-expires" label="Recarregar até"
            hint="Este chip não tem validade cadastrada: informe a nova data limite. Se cadastrar a validade em Editar, o cálculo fica automático."
          >
            <Input
              id="recharge-expires" type="date" value={manualExpires} min={date || undefined}
              onChange={(e) => setManualExpires(e.target.value)} required
            />
          </Field>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={saving}>
            <BatteryCharging className="h-4 w-4" />
            {saving ? "Salvando..." : "Registrar recarga"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
