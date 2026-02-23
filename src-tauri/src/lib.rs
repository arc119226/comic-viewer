mod commands;

use commands::{get_comic_info, load_page, scan_folder};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            get_comic_info,
            load_page,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
