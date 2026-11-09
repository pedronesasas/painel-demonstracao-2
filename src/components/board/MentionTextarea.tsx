import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useProfiles } from "@/hooks/use-profiles";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
};

const MENTION_RE = /@\[([^\]]+)\]\(([0-9a-fA-F-]{36})\)/g;

// Build DOM nodes from a serialized value (text + `@[Name](uuid)` tokens).
function hydrate(root: HTMLElement, value: string) {
  root.innerHTML = "";
  let last = 0;
  MENTION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(value)) !== null) {
    if (m.index > last) root.appendChild(document.createTextNode(value.slice(last, m.index)));
    root.appendChild(makeChip(m[1], m[2]));
    last = m.index + m[0].length;
  }
  if (last < value.length) root.appendChild(document.createTextNode(value.slice(last)));
}

function makeChip(name: string, userId: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.dataset.mention = "1";
  span.dataset.userId = userId;
  span.dataset.name = name;
  span.className =
    "inline-block align-baseline rounded px-1 py-0.5 mx-0.5 text-xs font-medium bg-primary/10 text-primary select-none";
  span.textContent = `@${name}`;
  return span;
}

function serialize(root: HTMLElement): string {
  let out = "";
  root.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
    } else if (node instanceof HTMLElement) {
      if (node.dataset.mention === "1") {
        out += `@[${node.dataset.name}](${node.dataset.userId})`;
      } else if (node.tagName === "BR") {
        out += "\n";
      } else {
        // Fallback: pull text (browsers may insert <div>/<span> on Enter)
        out += node.textContent ?? "";
      }
    }
  });
  return out;
}

// Find `@query` before the caret in the current text node. Returns query string or null.
function findMentionTrigger(): { query: string; range: Range } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? "";
  const caret = range.startOffset;
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "@") {
      const prev = i === 0 ? " " : text[i - 1];
      if (i === 0 || /\s|[([{,;:]/.test(prev)) {
        const between = text.slice(i + 1, caret);
        if (/^[^\s@]{0,30}$/.test(between)) {
          const r = document.createRange();
          r.setStart(node, i);
          r.setEnd(node, caret);
          return { query: between, range: r };
        }
      }
      return null;
    }
    if (/\s/.test(ch)) return null;
    i--;
  }
  return null;
}

export function MentionTextarea({ value, onChange, onSubmit, placeholder, className }: Props) {
  const { data: profiles = [] } = useProfiles();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const triggerRangeRef = useRef<Range | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = profiles
      .map((p) => ({ id: p.id, name: (p.full_name ?? p.email ?? "").trim() }))
      .filter((p) => p.name.length > 0);
    if (!q) return list.slice(0, 8);
    return list.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8);
  }, [profiles, search]);

  useEffect(() => { setActiveIdx(0); }, [search, pickerOpen]);

  // Keep DOM in sync when caller resets value (e.g. after send).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const current = serialize(el);
    if (current !== value) {
      hydrate(el, value);
    }
  }, [value]);

  const emit = () => {
    const el = editorRef.current;
    if (!el) return;
    onChange(serialize(el));
  };

  const closePicker = () => {
    triggerRangeRef.current = null;
    setPickerOpen(false);
    setSearch("");
  };

  const handleInput = () => {
    emit();
    const found = findMentionTrigger();
    if (found) {
      triggerRangeRef.current = found.range;
      setSearch(found.query);
      setPickerOpen(true);
    } else if (pickerOpen) {
      closePicker();
    }
  };

  const insertMention = (userId: string, name: string) => {
    const range = triggerRangeRef.current;
    const el = editorRef.current;
    if (!range || !el) return;
    range.deleteContents();
    const chip = makeChip(name, userId);
    const space = document.createTextNode("\u00A0");
    range.insertNode(space);
    range.insertNode(chip);
    // move caret after the space
    const sel = window.getSelection();
    const after = document.createRange();
    after.setStartAfter(space);
    after.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(after);
    closePicker();
    emit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (pickerOpen && filtered.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => (i + 1) % filtered.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => (i - 1 + filtered.length) % filtered.length); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const pick = filtered[activeIdx];
        if (pick) insertMention(pick.id, pick.name);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); closePicker(); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !pickerOpen) {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (e.key === "Backspace") {
      // If caret sits right after a chip, remove the whole chip.
      const sel = window.getSelection();
      if (sel && sel.isCollapsed && sel.rangeCount > 0) {
        const r = sel.getRangeAt(0);
        const { startContainer, startOffset } = r;
        let prev: ChildNode | null = null;
        if (startContainer.nodeType === Node.ELEMENT_NODE) {
          prev = (startContainer as HTMLElement).childNodes[startOffset - 1] ?? null;
        } else if (startContainer.nodeType === Node.TEXT_NODE && startOffset === 0) {
          prev = (startContainer as ChildNode).previousSibling;
        }
        if (prev && prev instanceof HTMLElement && prev.dataset.mention === "1") {
          e.preventDefault();
          prev.remove();
          emit();
          return;
        }
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    sel.getRangeAt(0).deleteContents();
    sel.getRangeAt(0).insertNode(document.createTextNode(text));
    sel.collapseToEnd();
    emit();
  };

  return (
    // min-w-0 + overflow-wrap:anywhere: link comprido colado quebra a linha em vez de alargar o campo
    <div className="relative min-w-0 flex-1">
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onInput={handleInput}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => setTimeout(closePicker, 120)}
        className={cn(
          "mention-editor min-h-[38px] max-h-32 overflow-y-auto w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "whitespace-pre-wrap wrap-anywhere",
          className,
        )}
      />
      {pickerOpen && filtered.length > 0 && (
        <div className="absolute bottom-full left-0 mb-1 w-64 max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md z-50">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1">Mencionar</div>
          {filtered.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(p.id, p.name); }}
              onMouseEnter={() => setActiveIdx(idx)}
              className={cn(
                "w-full text-left px-2 py-1.5 text-xs hover:bg-accent",
                idx === activeIdx && "bg-accent",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
