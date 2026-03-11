import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, type ViewUpdate } from "@codemirror/view";
import { Tree } from "web-tree-sitter";
import { Syntax, syntaxExtension } from "./syntax.ts";

export class Editor {
  view: EditorView;
  syntax?: Syntax;
  tree: Tree | null;

  constructor(parent: HTMLDivElement) {
    const state = EditorState.create({
      // extract from: https://github.com/codemirror/basic-setup/blob/main/src/codemirror.ts
      extensions: [
        lineNumbers(),
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
