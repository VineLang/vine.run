use std::{
  collections::HashMap,
  path::{Path, PathBuf},
};

use include_dir::{Dir, DirEntry, include_dir};
use vine::{
  components::loader::{EntryKind, FS},
  structures::ast::Ident,
};

pub static VINE_ROOT_DIR: Dir<'_> = include_dir!("$VINE_ROOT_DIR");

#[derive(Clone)]
pub struct PlaygroundFS {
  root: &'static Dir<'static>,
  main: HashMap<Ident, String>,
}

impl PlaygroundFS {
  pub fn new(root: &'static Dir<'static>, main: HashMap<Ident, String>) -> Self {
    Self { root, main }
  }
}

#[derive(Debug)]
enum PlaygroundPath<'a> {
  Root(&'a Path),
  Main(Ident),
}

impl<'a> PlaygroundPath<'a> {
  fn parse(path: &'a Path) -> Option<Self> {
    if let Ok(path) = path.strip_prefix("/root") {
      return Some(Self::Root(path));
    }

    Some(Self::Main(Ident::new(path.strip_prefix("/").ok()?.with_extension("").to_str()?)?))
  }
}

impl FS for PlaygroundFS {
  type Path = PathBuf;

  #[tracing::instrument(level = "trace", skip(self), fields(?path), ret)]
  fn kind(&mut self, path: &Self::Path) -> Option<EntryKind> {
    match PlaygroundPath::parse(path)? {
      PlaygroundPath::Root(path) if path == "" => Some(EntryKind::Dir),
      PlaygroundPath::Root(path) => match self.root.get_entry(path)? {
        DirEntry::Dir(_) => Some(EntryKind::Dir),
        DirEntry::File(_) => Some(EntryKind::File),
      },
      PlaygroundPath::Main(ident) if self.main.contains_key(&ident) => Some(EntryKind::File),
      _ => None,
    }
  }

  #[tracing::instrument(level = "trace", skip(self), fields(?path, ?name), ret)]
  fn child_dir(&mut self, path: &Self::Path, name: &Ident) -> Self::Path {
    match PlaygroundPath::parse(path).unwrap() {
      PlaygroundPath::Root(path) => PathBuf::from("/root").join(path).join(&name.0),
      PlaygroundPath::Main(_) => unreachable!(),
    }
  }

  #[tracing::instrument(level = "trace", skip(self), fields(?path, ?name), ret)]
  fn child_file(&mut self, path: &Self::Path, name: &Ident) -> Self::Path {
    let file_name = format!("{}.vi", name.0);
    match PlaygroundPath::parse(path).unwrap() {
      PlaygroundPath::Root(path) => PathBuf::from("/root").join(path).join(&file_name),
      PlaygroundPath::Main(_) => unreachable!(),
    }
  }

  #[tracing::instrument(level = "trace", skip(self), fields(?path), ret)]
  fn read_file(&mut self, path: &Self::Path) -> Option<String> {
    match PlaygroundPath::parse(path)? {
      PlaygroundPath::Root(path) => Some(self.root.get_file(path)?.contents_utf8()?.to_owned()),
      PlaygroundPath::Main(ident) => self.main.get(&ident).cloned(),
    }
  }
}
