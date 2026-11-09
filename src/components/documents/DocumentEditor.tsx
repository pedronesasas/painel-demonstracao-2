import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";
import { createEditorExtensions } from "@/components/editor/extensions";
import { useEditorActions, type EditorActions } from "@/components/editor/useEditorActions";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import { TextBubbleMenu, type ToolbarMode } from "@/components/editor/TextBubbleMenu";
import { BlockHandle } from "@/components/editor/BlockHandle";
import { TableControls } from "@/components/editor/TableControls";

interface DocumentEditorProps {
  value: unknown;
  onChange: (value: unknown) => void;
  placeholder?: string;
  editable?: boolean;
  // Entrega o editor para a página montar o índice lateral.
  onEditor?: (editor: Editor | null) => void;
  // "floating" (padrão, como no ClickUp): a barra só aparece ao selecionar texto.
  // "top": barra completa fixa no topo, além da flutuante.
  toolbarMode?: ToolbarMode;
  onToolbarModeChange?: (mode: ToolbarMode) => void;
}

export function DocumentEditor({
  value, onChange, placeholder, editable = true, onEditor, toolbarMode = "floating", onToolbarModeChange,
}: DocumentEditorProps) {
  const actionsRef = useRef<EditorActions | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const containerRef = useRef<HTMLDivElement>(null);

  const extensions = useMemo(
    () => createEditorExtensions({ placeholder, variant: "document", getActions: () => actionsRef.current }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: (value as never) || "",
    editable,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getJSON()),
    editorProps: {
      attributes: {
        class: "doc-prose min-h-[50vh] focus:outline-none",
        spellcheck: "true",
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
    if (editor && editor.isEditable !== editable) editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return null;

  return (
    <div>
      {editable && toolbarMode === "top" && (
        <div className="sticky top-10 z-20 -mx-2 mb-6 rounded-lg border border-border bg-background/95 px-1.5 py-1 shadow-sm backdrop-blur">
          <EditorToolbar editor={editor} actions={actions} />
        </div>
      )}
      <TextBubbleMenu editor={editor} actions={actions} toolbarMode={toolbarMode} onToolbarModeChange={onToolbarModeChange} />
      <div ref={containerRef} className="relative">
        <EditorContent editor={editor} />
        {editable && <BlockHandle editor={editor} actions={actions} containerRef={containerRef} />}
        {editable && <TableControls editor={editor} containerRef={containerRef} />}
      </div>
      {dialogs}
    </div>
  );
}
