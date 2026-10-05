fn main() {
    // Windows executable resources must be rebuilt after regenerating native icons.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
