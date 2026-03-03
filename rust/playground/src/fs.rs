use std::{collections::HashMap, path::PathBuf};

use include_dir::{Dir, DirEntry, include_dir};
use vine::{
  components::loader::{EntryKind, FS},
  structures::ast::Ident,
};

pub static VINE_ROOT_DIR: Dir<'_> = include_dir!("$VINE_ROOT_DIR");

pub struct PlaygroundFS {
  root: &'static Dir<'static>,
  local: HashMap<Ident, String>,
}

impl PlaygroundFS {
  pub fn new(root: &'static Dir<'static>, local: HashMap<Ident, String>) -> Self {
    Self { root, local }
  }
}

#[derive(Debug)]
pub enum PlaygroundPath {
  Root(Option<PathBuf>),
  Local(Ident),
}

impl FS for PlaygroundFS {
  type Path = PlaygroundPath;

  #[tracing::instrument(level = "trace", skip(self), ret)]
  fn kind(&mut self, path: &Self::Path) -> Option<EntryKind> {
    match path {
      PlaygroundPath::Root(None) => Some(EntryKind::Dir),
      PlaygroundPath::Root(Some(path)) => match self.root.get_entry(path)? {
        DirEntry::Dir(_) => Some(EntryKind::Dir),
        DirEntry::File(_) => Some(EntryKind::File),
      },
      PlaygroundPath::Local(ident) if self.local.contains_key(ident) => Some(EntryKind::File),
      _ => None,
    }
  }

  #[tracing::instrument(level = "trace", skip(self), ret)]
  fn child_dir(&mut self, path: &Self::Path, name: &Ident) -> Self::Path {
    match path {
      PlaygroundPath::Root(None) => PlaygroundPath::Root(Some(name.0.clone().into())),
      PlaygroundPath::Root(Some(path)) => PlaygroundPath::Root(Some(path.join(&name.0))),
      PlaygroundPath::Local(_) => unreachable!(),
    }
  }

  #[tracing::instrument(level = "trace", skip(self), ret)]
  fn child_file(&mut self, path: &Self::Path, name: &Ident) -> Self::Path {
    let file_name = format!("{}.vi", name.0);
    match path {
      PlaygroundPath::Root(None) => PlaygroundPath::Root(Some(file_name.into())),
      PlaygroundPath::Root(Some(path)) => PlaygroundPath::Root(Some(path.join(file_name))),
      PlaygroundPath::Local(_) => unreachable!(),
    }
  }

  #[tracing::instrument(level = "trace", skip(self), ret)]
  fn read_file(&mut self, path: &Self::Path) -> Option<String> {
    match path {
      PlaygroundPath::Root(path) => {
        Some(self.root.get_file(path.as_ref()?)?.contents_utf8()?.to_owned())
      }
      PlaygroundPath::Local(ident) => self.local.get(ident).cloned(),
    }
  }
}
