import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InsertCardDialog, type InsertedCard } from "@/components/documents/InsertCardDialog";

// Ações que abrem seletor de arquivo ou janela. São usadas pela barra de
// ferramentas, pelo menu "/" e pelo menu do bloco, por isso ficam num lugar só.
export type EditorActions = {
  pickImage: () => void;
  attachFile: () => void;
  editLink: () => void;
  insertEmbed: () => void;
  insertCard: () => void;
};

function randomName() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useEditorActions(editor: Editor | null): { actions: EditorActions; dialogs: ReactNode } {
  const imageRef = useRef<HTMLInputElement>(null);
  const attachRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedUrl, setEmbedUrl] = useState("");
  const [cardOpen, setCardOpen] = useState(false);

  const uploadImage = useCallback(async (file: File) => {
    if (!editor) return;
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${randomName()}.${ext}`;
    const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    editor.chain().focus().setImage({ src: data.publicUrl }).run();
  }, [editor]);

  const uploadAttachment = useCallback(async (file: File) => {
    if (!editor) return;
    const path = `attachments/${randomName()}-${file.name}`;
    const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: false });
    if (error) { toast.error(error.message); return; }
    const { data } = supabase.storage.from("documents").getPublicUrl(path);
    editor.chain().focus().insertContent([
      { type: "text", text: `📎 ${file.name}`, marks: [{ type: "link", attrs: { href: data.publicUrl, target: "_blank" } }] },
      { type: "text", text: " " },
    ]).run();
  }, [editor]);

  const applyLink = () => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = /^[a-z]+:/i.test(url) ? url : `https://${url}`;
      const { empty } = editor.state.selection;
      if (empty && !editor.isActive("link")) {
        editor.chain().focus().insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href } }] }).run();
      } else {
        editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
      }
    }
    setLinkOpen(false);
  };

  const applyEmbed = () => {
    if (!editor || !embedUrl) { setEmbedOpen(false); return; }
    let src = embedUrl.trim();
    const yt = src.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]+)/);
    if (yt) src = `https://www.youtube.com/embed/${yt[1]}`;
    const loom = src.match(/loom\.com\/share\/([\w-]+)/);
    if (loom) src = `https://www.loom.com/embed/${loom[1]}`;
    editor.chain().focus().insertContent({ type: "embed", attrs: { src } }).run();
    setEmbedOpen(false);
  };

  const insertCardChip = (c: InsertedCard) => {
    editor?.chain().focus().insertContent([
      { type: "cardChip", attrs: { cardId: c.cardId, boardId: c.boardId, shortId: c.shortId, title: c.title } },
      { type: "text", text: " " },
    ]).run();
  };

  const actions = useMemo<EditorActions>(() => ({
    pickImage: () => imageRef.current?.click(),
    attachFile: () => attachRef.current?.click(),
    editLink: () => {
      setLinkUrl((editor?.getAttributes("link").href as string | undefined) ?? "");
      setLinkOpen(true);
    },
    insertEmbed: () => { setEmbedUrl(""); setEmbedOpen(true); },
    insertCard: () => setCardOpen(true),
  }), [editor]);

  const dialogs = (
    <>
      <input
        ref={imageRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); e.target.value = ""; }}
      />
      <input
        ref={attachRef} type="file" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); e.target.value = ""; }}
      />

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Link</DialogTitle></DialogHeader>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyLink(); } }}
            placeholder="https://exemplo.com"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setLinkOpen(false)}>Cancelar</Button>
            <Button onClick={applyLink}>{linkUrl ? "Aplicar" : "Remover link"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={embedOpen} onOpenChange={setEmbedOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Inserir vídeo</DialogTitle></DialogHeader>
          <Input
            value={embedUrl}
            onChange={(e) => setEmbedUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyEmbed(); } }}
            placeholder="Link do YouTube ou do Loom"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEmbedOpen(false)}>Cancelar</Button>
            <Button onClick={applyEmbed} disabled={!embedUrl}>Inserir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <InsertCardDialog open={cardOpen} onOpenChange={setCardOpen} onInsert={insertCardChip} />
    </>
  );

  return { actions, dialogs };
}
