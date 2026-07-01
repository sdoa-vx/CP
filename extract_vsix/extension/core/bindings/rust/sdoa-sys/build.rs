// Locate libsdoa for linking. Set SDOA_LIB_DIR to the directory containing
// libsdoa.so / libsdoa.dylib / sdoa.dll.
fn main() {
    if let Ok(dir) = std::env::var("SDOA_LIB_DIR") {
        println!("cargo:rustc-link-search=native={dir}");
    }
    println!("cargo:rustc-link-lib=dylib=sdoa");
}
