fn main() {
  let target = std::env::var("TARGET").unwrap_or_default();
  // Google Play 16 KB page size (64-bit Android). Tauri ignores .cargo/config.toml flags.
  if target.contains("android")
    && (target.contains("aarch64") || target.contains("x86_64"))
  {
    println!("cargo:rustc-link-arg=-Wl,-z,max-page-size=16384");
    println!("cargo:rustc-link-arg=-Wl,-z,common-page-size=16384");
  }

  tauri_build::build()
}
