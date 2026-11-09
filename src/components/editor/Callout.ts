import { Node, mergeAttributes } from "@tiptap/core";
import { COLOR_NAMES, type ColorName } from "./palette";

// "Faixa" é feminino: vermelha, amarela, roxa...
const BANNER_COLOR: Record<ColorName, string> = {
  red: "vermelha", orange: "laranja", yellow: "amarela", blue: "azul",
  purple: "roxa", pink: "rosa", green: "verde", gray: "cinza",
};

// Cor da faixa: "blue" (suave) ou "blue-strong" (cheia). Os valores antigos
// (info, tip, warning, danger) continuam abrindo com a aparência de antes.
export type CalloutVariant = ColorName | `${ColorName}-strong` | "info" | "tip" | "warning" | "danger";

export const BANNER_VARIANTS: Array<{ value: CalloutVariant; color: ColorName; strong: boolean; label: string }> = [
  ...COLOR_NAMES.map((c) => ({ value: `${c}-strong` as CalloutVariant, color: c, strong: true, label: `Faixa ${BANNER_COLOR[c]} forte` })),
  ...COLOR_NAMES.map((c) => ({ value: c as CalloutVariant, color: c, strong: false, label: `Faixa ${BANNER_COLOR[c]}` })),
];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      toggleCallout: (variant?: CalloutVariant) => ReturnType;
      setCalloutVariant: (variant: CalloutVariant) => ReturnType;
    };
  }
}

// Faixa colorida (o "banner" do ClickUp). Envolve blocos comuns, então o
// conteúdo continua sendo parágrafo, lista etc. e exporta normalmente.
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: "blue",
        parseHTML: (el) => (el as HTMLElement).getAttribute("data-variant") || "blue",
        renderHTML: (attrs) => ({ "data-variant": attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-callout": "", class: "doc-callout" }), 0];
  },

  addCommands() {
    return {
      // Já dentro de uma faixa: troca a cor; se for a mesma cor, tira a faixa.
      toggleCallout:
        (variant = "blue") =>
        ({ editor, commands }) => {
          if (!editor.isActive("callout")) return commands.wrapIn("callout", { variant });
          if (editor.getAttributes("callout").variant === variant) return commands.lift("callout");
          return commands.updateAttributes("callout", { variant });
        },
      setCalloutVariant:
        (variant) =>
        ({ commands }) =>
          commands.updateAttributes("callout", { variant }),
    };
  },
});
