use std::{
  collections::HashMap,
  path::PathBuf,
  sync::{Arc, Mutex},
};

use ivy::{
  name::{NameId, Table},
  net::{FlatNet, TreeNet},
  text::ast::Nets,
};
use js_sys::Function;
use serde::Serialize;
use tokio::{
  io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader, DuplexStream},
  sync::RwLock,
};
use url::Url;
use vine::{
  backend::{BackendConfig, Target},
  compiler::Compiler,
  components::loader::{FileId, Loader},
  structures::{
    ast::Ident,
    checkpoint::Checkpoint,
    diag::{Color as DiagColor, DiagSpan},
  },
};
use vine_lsp::{Doc, Hooks, Lsp};
use vine_util::idx::IdxVec;
use wasm_bindgen::{JsValue, prelude::wasm_bindgen};

use crate::fs::{PlaygroundMainFS, PlaygroundRootFS};

#[wasm_bindgen]
pub struct PlaygroundBackend {
  lsp: Arc<RwLock<Lsp>>,
  checkpoint: Arc<Mutex<Option<Checkpoint>>>,
  compiled: Option<(Table, HashMap<NameId, FlatNet>)>,
}

#[wasm_bindgen]
impl PlaygroundBackend {
  #[wasm_bindgen(constructor)]
  pub fn new() -> Self {
    let mut compiler = Compiler::default();
    let file_paths = load_root(&mut compiler);
    let lsp = Arc::new(RwLock::new(Lsp::new(compiler, file_paths)));
    let checkpoint = Default::default();
    let compiled = None;

    Self { lsp, checkpoint, compiled }
  }

  #[wasm_bindgen(js_name = spawnLspServer)]
  pub fn spawn_lsp_server(&self, on_message: Function, on_compile: Function) -> LspTransport {
    self._spawn_lsp_server(on_message, on_compile)
  }

  #[tracing::instrument(level = "trace", skip_all)]
  fn _spawn_lsp_server(&self, on_message: Function, on_compile: Function) -> LspTransport {
    let (input_tx, input_rx) = tokio::io::duplex(256 * 1024);
    let (output_tx, output_rx) = tokio::io::duplex(256 * 1024);

    let lsp = self.lsp.clone();
    let hooks = PlaygroundLspHooks::new(self.checkpoint.clone(), on_compile);
    wasm_bindgen_futures::spawn_local(async move {
      vine_lsp::lsp_stdio(lsp, hooks, input_rx, output_tx).await;
    });

    LspTransport::new(input_tx, output_rx, on_message)
  }

  #[wasm_bindgen(js_name = debug)]
  pub async fn debug(&mut self, debug: bool) {
    self.lsp.write().await.compiler.debug = debug;
  }

  #[wasm_bindgen(js_name = nets)]
  pub async fn nets(&mut self) -> Option<String> {
    self._nets().await
  }

  #[tracing::instrument(level = "trace", skip(self), ret)]
  async fn _nets(&mut self) -> Option<String> {
    let checkpoint = self.checkpoint.lock().unwrap().take();
    if let Some(checkpoint) = checkpoint {
      let mut table = Table::default();
      let mut nets = HashMap::default();
      self.lsp.write().await.compiler.nets_from(&mut table, &mut nets, &checkpoint);

      let config = BackendConfig {
        target: Target::Ivm,
        entrypoints: None,
        optimize: true,
        optimize_all: false,
        optimize_limit: None,
        prune: true,
      };
      vine::backend::backend(&mut table, &config, &mut nets);

      self.compiled = Some((table, nets));
    }

    if let Some((table, nets)) = &self.compiled {
      let mut nets = TreeNet::from_flat_nets(nets);
      nets.values_mut().for_each(TreeNet::resolve_links);
      let nets = Nets::from_tree_nets(&nets);

      Some(nets.print(table))
    } else {
      None
    }
  }
}

struct PlaygroundLspHooks {
  checkpoint: Arc<Mutex<Option<Checkpoint>>>,
  on_compile: Function,
}

impl PlaygroundLspHooks {
  fn new(checkpoint: Arc<Mutex<Option<Checkpoint>>>, on_compile: Function) -> Self {
    Self { checkpoint, on_compile }
  }
}

impl Hooks for PlaygroundLspHooks {
  #[tracing::instrument(level = "trace", skip(self, compiler, docs))]
  fn load_modules(
    &self,
    compiler: &mut Compiler,
    file_paths: &mut IdxVec<FileId, PathBuf>,
    docs: &HashMap<Url, Doc>,
  ) {
    let mut loader = Loader::new(compiler, PlaygroundMainFS::new(docs), Some(file_paths));
    loader.load_main_mod(Ident("play".to_owned()), "/play.vi".into());
  }

  fn pre_check(&self, checkpoint: Checkpoint) {
    *self.checkpoint.lock().unwrap() = Some(checkpoint);
  }

  #[tracing::instrument(level = "trace", skip_all)]
  fn refresh(&self, compiler: &mut Compiler, docs: &HashMap<Url, Doc>) {
    // TODO(enricozb): this only handles one file.
    let version = docs.values().next().map(|doc| doc.version);
    let version = serde_wasm_bindgen::to_value(&version).unwrap();
    let success = compiler.diags.bail().is_ok();
    let success = serde_wasm_bindgen::to_value(&success).unwrap();
    let diag_lines = PlaygroundDiagSpan::from_diags(compiler.format_diags());
    let diag_lines = serde_wasm_bindgen::to_value(&diag_lines).unwrap();
    self.on_compile.call3(&JsValue::NULL, &version, &success, &diag_lines).unwrap();
  }
}

impl Default for PlaygroundBackend {
  fn default() -> Self {
    Self::new()
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

#[derive(Serialize)]
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

#[derive(Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PlaygroundDiagColor {
  Grey,
  Red,
  Yellow,
  Green,
}

#[tracing::instrument(level = "trace", skip(compiler), ret)]
fn load_root(compiler: &mut Compiler) -> IdxVec<FileId, PathBuf> {
  let mut file_paths = IdxVec::new();
  let fs = PlaygroundRootFS::new();
  let mut loader = Loader::new(compiler, fs, Some(&mut file_paths));
  loader.load_mod(Ident("root".into()), PathBuf::from("/root"));
  file_paths
}
