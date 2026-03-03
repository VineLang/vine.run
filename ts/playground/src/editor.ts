import { EditorState } from "@codemirror/state";
import { basicSetup, EditorView } from "codemirror";

export class Editor {
  view: EditorView;

  constructor(parent: HTMLDivElement) {
    const state = EditorState.create({
      doc: "pub fn main(&io: &IO) {\n  io.println(\"Hello, world!\");\n}",
      extensions: [basicSetup],
    });
    this.view = new EditorView({
      state,
      parent,
    });
  }

  files(): Record<string, string> {
    return { main: this.view.state.doc.toString() };
  }
}
