import { RangeSetBuilder, StateEffect, StateField, type Transaction } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import { Language, Parser, Query, Tree } from "web-tree-sitter";
import highlightsScm from "../tree-sitter-vine/queries/highlights.scm?raw";

export type Effects = { effects: StateEffect<DecorationSet>[]; tree: Tree };

export class Syntax {
  parser: Parser;
  highlights: Query;

  constructor(parser: Parser, highlights: Query) {
    this.parser = parser;
    this.highlights = highlights;
  }

  static async init(): Promise<Syntax> {
    await Parser.init();

    const language = await Language.load("tree-sitter-vine/tree-sitter-vine.wasm");
    const parser = new Parser();
    parser.setLanguage(language);
    const highlights = new Query(language, highlightsScm);

    return new Syntax(parser, highlights);
  }

  effects(text: string): Effects {
    const tree = this.parser.parse(text)!;
    const builder: RangeSetBuilder<Decoration> = new RangeSetBuilder();
    for (const { name, node } of this.highlights.captures(tree!.rootNode)) {
      builder.add(node.startIndex, node.endIndex, nodeDecoration(name));
    }
    return { effects: [nodeEffect.of(builder.finish())], tree };
  }
}

const nodeEffect = StateEffect.define<DecorationSet>({
  map: (value, change) => value.map(change),
});

const nodeField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },

  update(decorations: DecorationSet, transaction: Transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(nodeEffect)) {
        decorations = effect.value;
      }
    }

    if (decorations && transaction.docChanged) {
      decorations = decorations.map(transaction.changes);
    }
    return decorations;
  },

  provide: f => EditorView.decorations.from(f),
});

function nodeDecoration(name: string): Decoration {
  return Decoration.mark({ class: "ts-" + name });
}

export const syntaxExtension = nodeField;
