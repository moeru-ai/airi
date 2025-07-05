#[cfg(all(not(target_os = "macos"), feature = "cpp"))]
fn main() {
  cc::Build::new()
    .cpp(true)
    .flag("-std=c++11")
    .static_crt(false)
    .file("src/esaxx.cpp")
    .include("src")
    .compile("esaxx");
}

#[cfg(all(target_os = "macos", feature = "cpp"))]
fn main() {
  cc::Build::new()
    .cpp(true)
    .flag("-std=c++11")
    .flag("-stdlib=libc++")
    .static_crt(false)
    .file("src/esaxx.cpp")
    .include("src")
    .compile("esaxx");
}

#[cfg(not(feature = "cpp"))]
fn main() {}
