import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  languageServerExtensions,
  LSPClient,
  LSPPlugin,
  type Transport,
} from "@codemirror/lsp-client";
import { searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import { drawSelection, EditorView, keymap, lineNumbers, type ViewUpdate } from "@codemirror/view";
import { Syntax, syntaxExtension } from "./syntax.ts";
import { type API as Backend } from "./workers/backend.ts";
import { type WebWorker } from "./workers/lib.ts";

function lspClient(backend: WebWorker<Backend>): LSPClient {
  type Handler = (msg: string) => void;

  const handlers = new Set<Handler>();
  backend.worker.addEventListener("message", ({ data: [tag, msg] }) => {
    if (tag === "lsp") {
      for (const handler of handlers) {
        handler(msg);
      }
    }
  });
  const transport: Transport = {
    send(message: string) {
      backend.sendLspMessage(message);
    },
    subscribe(handler: Handler) {
      handlers.add(handler);
    },
    unsubscribe(handler: Handler) {
      handlers.delete(handler);
    },
  };
  return new LSPClient({
    timeout: 60 * 1000, // ms
    extensions: languageServerExtensions(),
  }).connect(transport);
}

export class Editor {
  view: EditorView;
  syntax?: Syntax;
  lsp: LSPPlugin;
  onChange: () => void;

  constructor(parent: HTMLElement, backend: WebWorker<Backend>, onChange: () => void) {
    const state = EditorState.create({
      extensions: [
        drawSelection(),
        lineNumbers(),
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        EditorState.allowMultipleSelections.of(true),
        lspClient(backend).plugin("file:///play.vi"),
        syntaxExtension,
        EditorView.updateListener.of(async (update: ViewUpdate) => await this.onUpdate(update)),
      ],
    });
    this.view = new EditorView({ state, parent });
    this.lsp = LSPPlugin.get(this.view)!;
    this.onChange = onChange;
  }

  async initialize() {
    this.syntax = await Syntax.init();
    this.load("hello_world");
  }

  files(): Record<string, string> {
    return { play: this.view.state.doc.toString() };
  }

  async onUpdate(update: ViewUpdate) {
    if (!update.docChanged) {
      return;
    }
    this.onChange();
    const { effects } = this.syntax!.effects(
      update.state.doc.toString(),
    );
    update.view.dispatch({ effects });
  }

  // Forces a `textDocument/didChange` request to be sent to the LSP.
  didChange() {
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: this.view.state.doc.toString(),
      },
    });
    this.lsp.client.sync();
  }

  load(example: string) {
    this.view.dispatch({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: EXAMPLES[example as keyof typeof EXAMPLES],
      },
    });
  }
}

const EXAMPLES = {
  hello_world: `
pub fn main(&io: &IO) {
  io.println("Hello, world!");
}
`,
  fibonacci: `
const end: N32 = 32;

pub fn main(&io: &IO) {
  let a = 0;
  let b = 1;
  for n in 0..=end {
    io.println("fib({n}) = {a}");
    (a, b) = (b, a + b);
  }
}
`,
  primes: `
const end: N32 = 10_000;

pub fn main(&io: &IO) {
  for n in 2..=end {
    let prime = for d in 2..n {
      if n % d == 0 {
        break false;
      }
    } else {
      true
    };
    if prime {
      io.println("{n}");
    }
  }
}
`,
  mandelbrot: `
use #root::ops::elementwise as _;

const max_iter: N32 = 128;
const width: N32 = 125;
const height: N32 = 45;
const scale: F32 = 2.6;
const center: (F32, F32) = (-0.8, 0.0);

pub fn main(&io: &IO) {
  for j in 0..black_box(height) {
    for i in 0..black_box(width) {
      let pos = (i as F32 + 0.5, j as F32 + 0.5) - (width as F32, height as F32) / 2.0;
      let (x, y) = center + pos * scale / width as F32 * (1.0, 2.0);
      io.print_char(if mandelbrot(x, y) {
        '#'
      } else {
        ' '
      });
    }
    io.print_char('\\n');
  }
}

fn mandelbrot(x0: F32, y0: F32) -> Bool {
  let x = 0.0;
  let y = 0.0;
  let x2 = 0.0;
  let y2 = 0.0;
  let i = max_iter;
  while (i > 0) & (x2 + y2 < 4.0) {
    i -= 1;
    (x, y) = (x2 - y2 + x0, 2.0 * x * y + y0);
    x2 = x * x;
    y2 = y * y;
  }
  i == 0
}
`,
  lcs: `
use #root::{ops::comparison::Eq, rng::Pcg32};

const len: N32 = 256;

/// Computes the longest common subsequence between two pseudo-randomly
/// generated lists \`x\` and \`y\`.
pub fn main(&io: &IO) {
  let x = [];
  let y = [];
  let rng = Pcg32::canonical;
  for _ in 0..len {
    x.push_back(rng.gen_n32() & 255);
    y.push_back(rng.gen_n32() & 255);
  }
  io.println("{lcs(x, y)}");
}

pub fn lcs[T*; Eq[T]](a: List[T], b: List[T]) -> N32 {
  if a.len() == 0 or b.len() == 0 {
    return 0;
  }

  let row = List::new(b.len(), 0);
  for a_elem in a.iter() {
    let prev_row_entry = 0;
    let prev_new_entry = 0;
    let new_row = [];
    for b_elem in b.iter() {
      let row_entry = row.pop_front().assume();
      let new_entry = if a_elem == b_elem {
        prev_row_entry + 1
      } else {
        row_entry.max(prev_new_entry)
      };
      prev_row_entry = row_entry;
      prev_new_entry = new_entry;
      new_row.push_back(new_entry);
    }
    row = new_row;
  }

  row.get(b.len() - 1).assume()
}
`,
};
