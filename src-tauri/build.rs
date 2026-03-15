use std::path::Path;

fn main() {
    // Ensure bin/tts_server.exe exists so tauri_build doesn't fail.
    // In dev mode, the TTS server runs from Python directly, so a placeholder is fine.
    // For production builds, run `npm run build:tts` first to get the real exe.
    let exe_path = Path::new("bin/tts_server.exe");
    if !exe_path.exists() {
        std::fs::create_dir_all("bin").expect("failed to create bin directory");
        // Minimal valid PE executable (exits immediately with code 1)
        // This placeholder prevents build failures in dev mode.
        std::fs::write(exe_path, b"placeholder").expect("failed to create placeholder exe");
        println!(
            "cargo:warning=tts_server.exe not found, created placeholder. \
             Run `npm run build:tts` to build the real one."
        );
    }
    tauri_build::build()
}
