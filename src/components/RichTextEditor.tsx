import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createEditorExtensions } from "@/components/editor/extensions";
import { useEditorActions, type EditorActions } from "@/components/editor/useEditorActions";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { TextBubbleMenu } from "@/components/editor/TextBubbleMenu";
import { TableControls } from "@/components/editor/TableControls";

interface RichTextEditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
  className?: string;
  minHeightClass?: string;
  expandTitle?: string;
  disabled?: boolean;
}

// Editor de texto das descrições (card, subtarefa, produto, oferta). Usa as mesmas
// extensões e a mesma barra dos Documentos, em tamanho compacto.
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeightClass = "min-h-[140px]",
  expandTitle = "Editar conteúdo",
  disabled,
}: RichTextEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const actionsRef = useRef<EditorActions | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const extensions = useMemo(
    () => createEditorExtensions({ placeholder, variant: "compact", getActions: () => actionsRef.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: (value as never) || "",
    editable: !disabled,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
    editorProps: {
      attributes: {
        class: cn("doc-prose doc-prose-compact px-3 py-2 focus:outline-none", minHeightClass),
      },
    },
  });

  const { actions, dialogs } = useEditorActions(editor);
  actionsRef.current = actions;

  useEffect(() => {
    if (editor && value && JSON.stringify(editor.getJSON()) !== JSON.stringify(value)) {
      editor.commands.setContent(value as never, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  useEffect(() => {
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  return (
    <>
      {!expanded && (
        <EditorShell
          editor={editor}
          actions={actions}
          className={className}
          editorClassName="max-h-[280px] overflow-y-auto"
          onToggleExpand={() => setExpanded(true)}
          expanded={false}
        />
      )}

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-5xl flex-col overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-sm">{expandTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-4">
            <EditorShell
              editor={editor}
              actions={actions}
              className="flex h-full flex-col"
              editorClassName="flex-1 overflow-y-auto"
              onToggleExpand={() => setExpanded(false)}
              expanded
            />
          </div>
        </DialogContent>
      </Dialog>

      {dialogs}
    </>
  );
}

function EditorShell({
  editor, actions, className, editorClassName, onToggleExpand, expanded,
}: {
  editor: Editor;
  actions: EditorActions;
  className?: string;
  editorClassName?: string;
  onToggleExpand: () => void;
  expanded: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const expandButton = (
    <button
      type="button"
      title={expanded ? "Reduzir" : "Expandir"}
      aria-label={expanded ? "Reduzir" : "Expandir"}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggleExpand}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-foreground/80 hover:bg-accent"
    >
      {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );

  return (
    <div className={cn("rounded-md border border-input bg-background", className)}>
      <div className="border-b border-border p-1">
        {editor.isEditable ? (
          <EditorToolbar editor={editor} actions={actions} size="sm" right={expandButton} />
        ) : (
          <div className="flex justify-end">{expandButton}</div>
        )}
      </div>
      {/* A barra flutuante fica aqui dentro para funcionar também com o editor expandido. */}
      <TextBubbleMenu editor={editor} actions={actions} />
      <div className={editorClassName}>
        <div ref={containerRef} className="relative">
          <EditorContent editor={editor} />
          {editor.isEditable && <TableControls editor={editor} containerRef={containerRef} compact />}
        </div>
      </div>
    </div>
  );
}
