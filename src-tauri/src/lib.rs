mod commands;

use commands::{
    get_comic_info, get_cover, get_text_info, load_page, load_text_file, scan_folder,
    tts_save_audio, tts_speak, tts_start, tts_status, tts_stop, TtsState,
};
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(TtsState::default()))
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            get_cover,
            get_comic_info,
            load_page,
            load_text_file,
            get_text_info,
            tts_start,
            tts_stop,
            tts_status,
            tts_speak,
            tts_save_audio,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state: Option<tauri::State<'_, Mutex<TtsState>>> =
                    window.try_state::<Mutex<TtsState>>();
                if let Some(state) = state {
                    if let Ok(mut tts) = state.lock() {
                        if let Some(ref mut child) = tts.process {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
