use std::{collections::HashMap, path::PathBuf};

use ivy::optimize::Optimizer;
use vine::{
  compiler::Compiler,
  components::loader::{FileId, Loader},
  structures::{ast::Ident, checkpoint::Checkpoint},
};
use vine_lsp::PlaygroundDiagSpan;
use vine_util::idx::IdxVec;
use wasm_bindgen::prelude::{JsValue, wasm_bindgen};

use crate::fs::{PlaygroundFS, VINE_ROOT_DIR};

#[wasm_bindgen]
#[derive(Default)]
pub struct PlaygroundCompiler {
  pub(crate) compiler: Compiler,
  pub(crate) checkpoint: Checkpoint,
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
  pub fn compile_files(&mut self, debug: bool, files: JsValue) -> Option<String> {
    self._compile_files(debug, files)
  }

  pub fn diags(&self) -> JsValue {
    let diag_lines = PlaygroundDiagSpan::from_diags(self.compiler.format_diags());

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

    if self.compiler.check(()).is_err() {
      return false;
    }

    self.checkpoint = self.compiler.checkpoint();

    true
  }

  #[tracing::instrument(level = "trace", skip(self), ret)]
  fn _compile_files(&mut self, compiler_debug: bool, files: JsValue) -> Option<String> {
    let files: HashMap<String, String> = serde_wasm_bindgen::from_value(files).unwrap();
    let files = files.into_iter().map(|(name, content)| (Ident(name), content)).collect();
    let fs = PlaygroundFS::new(&VINE_ROOT_DIR, files);

    self.compiler.revert(&self.checkpoint);
    let mut loader = Loader::new(&mut self.compiler, fs, None);
    loader.load_main_mod(Ident("play".into()), PathBuf::from("/play.vi"));

    self.compiler.debug = compiler_debug;
    let mut nets = self.compiler.compile(()).ok()?;
    Optimizer::default().optimize(&mut nets, &[]);

    Some(nets.to_string())
  }
}
