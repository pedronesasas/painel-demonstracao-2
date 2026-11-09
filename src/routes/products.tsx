import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireTabAccess } from "@/components/RequireTabAccess";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Package, Settings } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ListSkeleton, EmptyState } from "@/components/ui/loading-state";
import { LanguagesDialog } from "@/components/products/LanguagesDialog";
import { ProductDetailDialog } from "@/components/products/ProductDetailDialog";

type Product = {
  id: string;
  name: string;
};

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Produtos — NEXUS" },
      { name: "description", content: "Catálogo de produtos." },
      { property: "og:title", content: "Produtos — NEXUS" },
      { property: "og:description", content: "Catálogo de produtos." },
    ],
  }),
  component: () => (
    <RequireTabAccess tab="products">
      <AppLayout><ProductsPage /></AppLayout>
    </RequireTabAccess>
  ),
});

function ProductsPage() {
  const { canEdit, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [marketsOpen, setMarketsOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Product[];
    },
  });

  const { data: locSummary } = useQuery({
    queryKey: ["products-locs-summary"],
    queryFn: async () => {
      const [locsRes, langsRes] = await Promise.all([
        supabase.from("product_localizations").select("product_id, language_id"),
        supabase.from("languages").select("id, code, flag, name"),
      ]);
      if (locsRes.error) throw locsRes.error;
      if (langsRes.error) throw langsRes.error;
      const langById = new Map((langsRes.data ?? []).map((l) => [l.id, l]));
      const map: Record<string, Array<{ code: string; flag: string | null; name: string }>> = {};
      for (const row of locsRes.data ?? []) {
        const lang = langById.get(row.language_id);
        if (!lang) continue;
        (map[row.product_id] ||= []).push({ code: lang.code, flag: lang.flag, name: lang.name });
      }
      return map;
    },
  });

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Produto excluído");
      qc.invalidateQueries({ queryKey: ["products"] });
    }
  };

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produtos"
        description="Cadastre e gerencie os produtos das campanhas"
        actions={canEdit && (
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" size="icon" onClick={() => setMarketsOpen(true)} aria-label="Gestão de mercados">
                <Settings className="h-4 w-4" />
              </Button>
            )}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  Novo produto
                </Button>
              </DialogTrigger>
              {open && (
                <ProductDialog
                  product={editing}
                  onSaved={() => {
                    setOpen(false);
                    setEditing(null);
                    qc.invalidateQueries({ queryKey: ["products"] });
                  }}
                />
              )}
            </Dialog>
          </div>
        )}
      />

      {isLoading ? (
        <Card className="p-4"><ListSkeleton rows={5} /></Card>
      ) : !products || products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum produto cadastrado"
          description={canEdit ? "Cadastre o primeiro produto para usá-lo nas campanhas." : "Aguarde um administrador cadastrar produtos."}
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Mercados</TableHead>
                {canEdit && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => {
                const locs = locSummary?.[p.id] ?? [];
                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => setDetailProduct(p)}
                  >
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      {locs.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {locs.map((l) => (
                            <Badge key={l.code} variant="secondary" className="font-mono text-[10px]">
                              {l.flag ? `${l.flag} ` : ""}{l.code}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    {canEdit && (
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(p)} aria-label={`Renomear ${p.name}`}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <ConfirmDialog
                            trigger={
                              <Button variant="ghost" size="icon" aria-label={`Excluir ${p.name}`}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            }
                            title="Excluir produto?"
                            description={`O produto "${p.name}" será removido. Esta ação não pode ser desfeita.`}
                            confirmLabel="Excluir"
                            destructive
                            onConfirm={() => handleDelete(p.id)}
                          />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <LanguagesDialog open={marketsOpen} onOpenChange={setMarketsOpen} />
      <ProductDetailDialog
        open={!!detailProduct}
        onOpenChange={(v) => !v && setDetailProduct(null)}
        product={detailProduct}
        canEdit={canEdit}
      />
    </div>
  );
}

function ProductDialog({
  product,
  onSaved,
}: {
  product: Product | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    const { error } = product
      ? await supabase.from("products").update({ name: trimmed }).eq("id", product.id)
      : await supabase.from("products").insert({ name: trimmed, price: 0, details: null });
    setSubmitting(false);
    if (error) toast.error(error.message);
    else {
      toast.success(product ? "Produto renomeado" : "Produto criado");
      onSaved();
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{product ? "Renomear produto" : "Novo produto"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label>Nome</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: MAPA DO TAROT"
            required
            maxLength={120}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Preço, descrição e links ficam em cada mercado (abra os detalhes do produto).
          </p>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={submitting || !name.trim()}>
            {submitting ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

