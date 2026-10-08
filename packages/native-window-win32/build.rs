#[cfg(windows)]
fn main() {
  napi_build::setup();
}

#[cfg(not(windows))]
fn main() {}
