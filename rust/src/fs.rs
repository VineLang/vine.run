use std::{
  collections::HashMap,
  path::{Path, PathBuf},
};

use include_dir::{Dir, DirEntry, include_dir};
use url::Url;
use vine::{
  components::loader::{EntryKind, FS},
  structures::ast::Ident,
};
use vine_lsp::Doc;

static VINE_ROOT_DIR: Dir<'_> = include_dir!("$VINE_ROOT_DIR");

pub struct PlaygroundRootFS {
  root: &'static Dir<'static>,
}

impl PlaygroundRootFS {
  pub fn new() -> Self {
    Self { root: &VINE_ROOT_DIR }
  }

  fn strip_prefix(path: &Path) -> Option<&Path> {
    path.strip_prefix("/root").ok()
  }
}

impl FS for PlaygroundRootFS {
  type Path = PathBuf;

  fn kind(&mut self, path: &Self::Path) -> Option<EntryKind> {
    let path = Self::strip_prefix(path)?;
    if path == "" {
      Some(EntryKind::Dir)
    } else {
      match self.root.get_entry(path)? {
        DirEntry::Dir(_) => Some(EntryKind::Dir),
        DirEntry::File(_) => Some(EntryKind::File),
      }
    }
  }

  fn child_dir(&mut self, path: &Self::Path, name: &Ident) -> Self::Path {
    path.join(&name.0)
  }

  fn child_file(&mut self, path: &Self::Path, name: &Ident) -> Self::Path {
    path.join(format!("{}.vi", name.0))
  }

  fn read_file(&mut self, path: &Self::Path) -> Option<String> {
    let path = Self::strip_prefix(path)?;
    Some(self.root.get_file(path)?.contents_utf8()?.to_owned())
  }
}

pub struct PlaygroundMainFS<'a> {
  docs: &'a HashMap<Url, Doc>,
}

impl<'a> PlaygroundMainFS<'a> {
  pub fn new(docs: &'a HashMap<Url, Doc>) -> Self {
    Self { docs }
  }

  fn path_to_url(path: &Path) -> Option<Url> {
    Url::parse(&format!("file://{}", path.display())).ok()
  }
}

impl<'a> FS for PlaygroundMainFS<'a> {
  type Path = PathBuf;

  fn kind(&mut self, path: &Self::Path) -> Option<EntryKind> {
    let url = Self::path_to_url(path)?;
    self.docs.contains_key(&url).then_some(EntryKind::File)
  }

  fn child_dir(&mut self, _path: &Self::Path, _name: &Ident) -> Self::Path {
    unreachable!()
  }

  fn child_file(&mut self, _path: &Self::Path, _name: &Ident) -> Self::Path {
    unreachable!()
  }

  fn read_file(&mut self, path: &Self::Path) -> Option<String> {
    let url = Self::path_to_url(path)?;
    Some(self.docs.get(&url)?.text.clone())
  }
}
