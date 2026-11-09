import { Mark, mergeAttributes } from "@tiptap/core";
import type { ColorName } from "./palette";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    badge: {
      setBadge: (attrs: { color: ColorName; strong?: boolean }) => ReturnType;
      unsetBadge: () => ReturnType;
    };
  }
}

// "Selo" do ClickUp: um trecho do texto dentro de uma etiqueta colorida.
// "strong" = fundo cheio; sem ele, fundo suave com o texto na cor.
export const Badge = Mark.create({
  name: "badge",
  inclusive: false,

  addAttributes() {
    return {
      color: {
        default: "gray",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-color") || "gray",
        renderHTML: (attrs) => ({ "data-color": attrs.color }),
      },
      strong: {
        default: false,
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-strong") === "true",
        renderHTML: (attrs) => (attrs.strong ? { "data-strong": "true" } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-badge]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-badge": "", class: "doc-badge" }), 0];
  },

  addCommands() {
    return {
      setBadge:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, { color: attrs.color, strong: !!attrs.strong }),
      unsetBadge:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});
