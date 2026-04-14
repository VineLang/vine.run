use std::{collections::HashMap, path::PathBuf};

use ivy::{ast::Nets, optimize::Optimizer};
use serde::Serialize;
use vine::{
  compiler::Compiler,
  components::loader::{FileId, Loader},
  structures::{
    ast::Ident,
    checkpoint::Checkpoint,
    diag::{Color, DiagSpan},
  },
};
use vine_util::idx::IdxVec;
use wasm_bindgen::prelude::{JsValue, wasm_bindgen};

use crate::fs::{PlaygroundFS, VINE_ROOT_DIR};

#[wasm_bindgen]
#[derive(Default)]
pub struct PlaygroundCompiler {
  pub(crate) compiler: Compiler,
  pub(crate) checkpoint: Checkpoint,
  pub(crate) root_nets: Nets,
}

#[wasm_bindgen]
impl PlaygroundCompiler {
  #[wasm_bindgen(constructor)]
  pub fn new() -> Self {
    Self::default()
  }

  #[wasm_bindgen(js_name = compileRoot)]
  pub fn compile_root(&mut self) -> bool {
    self._compile_root()
  }

  #[wasm_bindgen(js_name = compileFiles)]
  pub fn compile_files(&mut self, files: JsValue) -> Option<String> {
    self._compile_files(files)
  }

  pub fn diags(&self) -> JsValue {
    let diag_lines: Vec<Vec<Diag>> =
      self.compiler.format_diags().map(|line| line.into_iter().map(Diag::from).collect()).collect();

    serde_wasm_bindgen::to_value(&diag_lines).unwrap()
  }

  #[tracing::instrument(level = "trace", skip(self), ret)]
  pub(crate) fn _load_root(&mut self) -> IdxVec<FileId, PathBuf> {
    let mut file_paths = IdxVec::new();
    let fs = PlaygroundFS::new(&VINE_ROOT_DIR, HashMap::default());
    let mut loader = Loader::new(&mut self.compiler, fs, Some(&mut file_paths));
    loader.load_mod(Ident("root".into()), PathBuf::from("/root"));
    file_paths
  }

  #[tracing::instrument(level = "trace", skip(self), ret)]
  fn _compile_root(&mut self) -> bool {
    let _ = self._load_root();

    if let Ok(nets) = self.compiler.compile(()) {
      self.root_nets = nets;
      self.checkpoint = self.compiler.checkpoint();
    }

    !self.root_nets.is_empty()
  }

  #[tracing::instrument(level = "trace", skip(self), ret)]
  fn _compile_files(&mut self, files: JsValue) -> Option<String> {
    self.compiler.revert(&self.checkpoint);

    let files: HashMap<String, String> = serde_wasm_bindgen::from_value(files).unwrap();
    let files = files.into_iter().map(|(name, content)| (Ident(name), content)).collect();
    let fs = PlaygroundFS::new(&VINE_ROOT_DIR, files);

    let mut loader = Loader::new(&mut self.compiler, fs, None);
    loader.load_main_mod(Ident("play".into()), PathBuf::from("/play.vi"));

    let mut nets = self.compiler.compile(()).ok()?;
    nets.extend(self.root_nets.clone().drain(..));
    Optimizer::default().optimize(&mut nets, &[]);

    Some(nets.to_string())
  }
}

#[derive(Serialize)]
pub struct Diag {
  pub color: Option<&'static str>,
  pub underline: bool,
  pub bold: bool,
  pub content: String,
}

impl<'a> From<DiagSpan<'a>> for Diag {
  fn from(diag_span: DiagSpan) -> Self {
    let color = diag_span.color.map(|color| match color {
      Color::Grey => "grey",
      Color::Red => "red",
      Color::Yellow => "yellow",
      Color::Green => "green",
    });
    Self {
      color,
      underline: diag_span.underline,
      bold: diag_span.bold,
      content: diag_span.content.into_owned(),
    }
  }
}
