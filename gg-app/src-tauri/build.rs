fn main() {
    println!("cargo:rerun-if-env-changed=VITE_BOARD_MODE_ENABLED");
    tauri_build::build()
}
