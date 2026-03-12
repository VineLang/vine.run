import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, type ViewUpdate } from "@codemirror/view";
import { type Transport, LSPClient, languageServerExtensions } from "@codemirror/lsp-client";
import { Tree } from "web-tree-sitter";
import { Syntax, syntaxExtension } from "./syntax.ts";
import { consumeWorker } from "./workers/lib.ts";
import { type API as Lsp } from "./workers/lsp.ts";

function lspClient(): LSPClient {
  type Handler = (msg: string) => void;

  let handlers: Handler[] = [];
  const lsp = consumeWorker<Lsp>(
    new Worker(new URL("./workers/lsp.ts", import.meta.url), {
      type: "module",
    }),
  );
  lsp.worker.addEventListener("message", ({ data: [tag, msg] }) => {
    if (tag === "lsp") {
      for (const handler of handlers) {
        handler(msg);
      }
    }
  });
  const transport: Transport = {
    send(message: string) {
      lsp.send(message);
    },
    subscribe(handler: Handler) {
      handlers.push(handler);
    },
    unsubscribe(handler: Handler) {
      handlers = handlers.filter(h => h != handler)
    },
  };
  return new LSPClient({ extensions: languageServerExtensions()}).connect(transport);
}

export class Editor {
  view: EditorView;
  syntax?: Syntax;
  tree: Tree | null;

  constructor(parent: HTMLDivElement) {
    const state = EditorState.create({
      // extract from: https://github.com/codemirror/basic-setup/blob/main/src/codemirror.ts
      extensions: [
        lineNumbers(),
        lspClient().plugin('file:///main/main.vi'),
        syntaxExtension,
        EditorView.updateListener.of(async (update: ViewUpdate) => await this.onUpdate(update)),
      ],
    });
    this.view = new EditorView({ state, parent });
    this.tree = null;
  }

  async initialize() {
    this.syntax = await Syntax.init();
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: "\npub fn main(&io: &IO) {\n  io.println(\"Hello, world!\");\n}\n",
      },
    });
  }

  files(): Record<string, string> {
    return { main: this.view.state.doc.toString() };
  }

  async onUpdate(update: ViewUpdate) {
    if (!update.docChanged) {
      return;
    }

    const { effects, tree } = this.syntax!.effects(
      update.state.doc.toString(),
    );
    this.tree = tree;
    update.view.dispatch({ effects });
  }
}
