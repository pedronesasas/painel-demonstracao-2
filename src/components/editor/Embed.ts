import { Node, mergeAttributes } from "@tiptap/core";

// Vídeo incorporado (YouTube, Loom). Antes o editor recebia o <iframe> como HTML solto
// e descartava, porque não havia um bloco para ele; por isso o "Embed" não aparecia.
export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return { src: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: "div.doc-embed",
        getAttrs: (el) => ({ src: (el as HTMLElement).querySelector("iframe")?.getAttribute("src") ?? null }),
      },
      { tag: "iframe[src]", getAttrs: (el) => ({ src: (el as HTMLElement).getAttribute("src") }) },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { class: "doc-embed" },
      [
        "iframe",
        mergeAttributes({
          src: HTMLAttributes.src,
          frameborder: "0",
          allow: "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture",
          allowfullscreen: "true",
        }),
      ],
    ];
  },
});
