use std::path::PathBuf;

use js_sys::Function;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader, DuplexStream};
use vine::{
  compiler::Compiler,
  components::loader::FileId,
  structures::diag::{Color as DiagColor, DiagSpan},
};
use vine_util::idx::IdxVec;
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};

use crate::compiler::PlaygroundCompiler;

#[wasm_bindgen]
pub struct PlaygroundLsp {
  compiler: Compiler,
  file_paths: IdxVec<FileId, PathBuf>,
}

#[wasm_bindgen]
impl PlaygroundLsp {
  #[wasm_bindgen(constructor)]
  pub fn new() -> Self {
    let mut compiler = PlaygroundCompiler::new();
    let file_paths = compiler._load_root();
    let mut compiler = compiler.compiler;
    compiler.check(()).unwrap();

    Self { compiler, file_paths }
  }

  #[wasm_bindgen(js_name = spawnServer)]
  pub fn spawn_server(self, on_message: Function) -> LspTransport {
    let (input_tx, input_rx) = tokio::io::duplex(256 * 1024);
    let (output_tx, output_rx) = tokio::io::duplex(256 * 1024);

    wasm_bindgen_futures::spawn_local(async move {
      vine_lsp::lsp(
        self.compiler,
        self.file_paths,
        Some("/play.vi".into()),
        vec![],
        input_rx,
        output_tx,
      )
      .await;
    });

    LspTransport::new(input_tx, output_rx, on_message)
  }
}

#[wasm_bindgen]
pub struct LspTransport {
  input_tx: DuplexStream,
}

#[wasm_bindgen]
impl LspTransport {
  fn new(input_tx: DuplexStream, output_rx: DuplexStream, on_message: Function) -> Self {
    let mut output_rx = BufReader::new(output_rx);
    wasm_bindgen_futures::spawn_local(async move {
      loop {
        let mut header = Vec::new();
        output_rx.read_until(b'\n', &mut header).await.unwrap();
        assert_eq!(header[header.len() - 2], b'\r');
        let len: usize = str::from_utf8(&header)
          .unwrap()
          .strip_prefix("Content-Length: ")
          .unwrap()
          .trim_end()
          .parse()
          .unwrap();
        output_rx.read_exact(&mut [0; 2]).await.unwrap(); // \r\n after header
        let mut msg = vec![0; len];
        output_rx.read_exact(&mut msg).await.unwrap();
        let msg = str::from_utf8(&msg).unwrap();
        tracing::trace!("lsp message: {msg}");
        on_message.call1(&JsValue::NULL, &serde_wasm_bindgen::to_value(&msg).unwrap()).unwrap();
      }
    });
    Self { input_tx }
  }

  #[wasm_bindgen]
  pub async fn send(&mut self, msg: String) {
    self._send(msg).await;
  }

  #[tracing::instrument(level = "trace", skip(self), fields(msg))]
  async fn _send(&mut self, msg: String) {
    let content_length = format!("Content-Length: {}\r\n\r\n", msg.len());
    self.input_tx.write_all(content_length.as_bytes()).await.unwrap();
    self.input_tx.write_all(msg.as_bytes()).await.unwrap();
  }
}

pub struct PlaygroundDiagSpan {
  pub color: Option<PlaygroundDiagColor>,
  pub underline: bool,
  pub bold: bool,
  pub content: String,
}

impl PlaygroundDiagSpan {
  pub fn from_diags<'a>(diag_lines: impl Iterator<Item = Vec<DiagSpan<'a>>>) -> Vec<Vec<Self>> {
    diag_lines.map(|line| line.into_iter().map(PlaygroundDiagSpan::from).collect()).collect()
  }
}

impl<'a> From<DiagSpan<'a>> for PlaygroundDiagSpan {
  fn from(diag_span: DiagSpan) -> Self {
    let color = diag_span.color.map(|color| match color {
      DiagColor::Grey => PlaygroundDiagColor::Grey,
      DiagColor::Red => PlaygroundDiagColor::Red,
      DiagColor::Yellow => PlaygroundDiagColor::Yellow,
      DiagColor::Green => PlaygroundDiagColor::Green,
    });
    Self {
      color,
      underline: diag_span.underline,
      bold: diag_span.bold,
      content: diag_span.content.into_owned(),
    }
  }
}

pub enum PlaygroundDiagColor {
  Grey,
  Red,
  Yellow,
  Green,
}
