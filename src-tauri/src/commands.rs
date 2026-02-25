use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use natord::compare as natural_compare;
use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::{Manager, State};
use zip::ZipArchive;

// ---------- Data Types ----------

#[derive(Serialize)]
pub struct ComicEntry {
    pub filename: String,
    pub path: String,
    pub cover_base64: String,
    pub file_type: String,
}

#[derive(Serialize)]
pub struct ComicInfo {
    pub filename: String,
    pub total_pages: usize,
}

#[derive(Serialize)]
pub struct TextInfo {
    pub filename: String,
    pub file_type: String,
    pub char_count: usize,
    pub line_count: usize,
}

// ---------- TTS State ----------

pub struct TtsState {
    pub process: Option<Child>,
    pub status: String,
}

impl Default for TtsState {
    fn default() -> Self {
        TtsState {
            process: None,
            status: "stopped".to_string(),
        }
    }
}

// ---------- Helpers ----------

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "bmp", "webp"];

const SUPPORTED_EXTENSIONS: &[(&str, &str)] = &[
    ("zip", "zip"),
    ("md", "md"),
    ("txt", "txt"),
];

fn is_image_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    IMAGE_EXTENSIONS.iter().any(|ext| lower.ends_with(ext))
}

fn mime_for_filename(name: &str) -> &'static str {
    let lower = name.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else {
        "image/jpeg"
    }
}

/// Returns sorted image entry indices within a ZIP archive using natural sort.
fn sorted_image_indices(archive: &mut ZipArchive<fs::File>) -> Vec<usize> {
    let mut entries: Vec<(usize, String)> = (0..archive.len())
        .filter_map(|i| {
            let file = archive.by_index_raw(i).ok()?;
            let name = file.name().to_string();
            if !file.is_dir() && is_image_file(&name) {
                Some((i, name))
            } else {
                None
            }
        })
        .collect();

    entries.sort_by(|a, b| natural_compare(&a.1, &b.1));
    entries.into_iter().map(|(i, _)| i).collect()
}

fn read_entry_as_base64(
    archive: &mut ZipArchive<fs::File>,
    index: usize,
) -> Result<String, String> {
    let mut file = archive.by_index(index).map_err(|e| e.to_string())?;
    let name = file.name().to_string();
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
    let mime = mime_for_filename(&name);
    Ok(format!("data:{};base64,{}", mime, BASE64.encode(&buf)))
}

/// Recursively collect supported files (.zip, .md, .txt) under a directory.
fn collect_files(dir: &Path, out: &mut Vec<(PathBuf, String)>) {
    let read_dir = match fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };
    for entry in read_dir.flatten() {
        let file_path = entry.path();
        if file_path.is_dir() {
            collect_files(&file_path, out);
        } else if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
            for &(supported_ext, file_type) in SUPPORTED_EXTENSIONS {
                if ext.eq_ignore_ascii_case(supported_ext) {
                    out.push((file_path.clone(), file_type.to_string()));
                    break;
                }
            }
        }
    }
}

// ---------- Tauri Commands: File Scanning ----------

#[tauri::command]
pub async fn scan_folder(path: String) -> Result<Vec<ComicEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut file_paths: Vec<(PathBuf, String)> = Vec::new();
    collect_files(dir, &mut file_paths);

    let mut entries: Vec<ComicEntry> = Vec::new();

    for (file_path, file_type) in file_paths {
        let display_name = file_path
            .strip_prefix(dir)
            .unwrap_or(&file_path)
            .to_string_lossy()
            .to_string();

        entries.push(ComicEntry {
            filename: display_name,
            path: file_path.to_string_lossy().to_string(),
            cover_base64: String::new(),
            file_type,
        });
    }

    entries.sort_by(|a, b| natural_compare(&a.filename, &b.filename));
    Ok(entries)
}

#[tauri::command]
pub async fn get_cover(path: String) -> Result<String, String> {
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let indices = sorted_image_indices(&mut archive);

    if let Some(&first_idx) = indices.first() {
        read_entry_as_base64(&mut archive, first_idx)
    } else {
        Ok(String::new())
    }
}

#[tauri::command]
pub async fn get_comic_info(path: String) -> Result<ComicInfo, String> {
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let indices = sorted_image_indices(&mut archive);
    let filename = Path::new(&path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    Ok(ComicInfo {
        filename,
        total_pages: indices.len(),
    })
}

#[tauri::command]
pub async fn load_page(path: String, index: usize) -> Result<String, String> {
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let indices = sorted_image_indices(&mut archive);

    let real_index = indices.get(index).ok_or_else(|| {
        format!(
            "Page index {} out of range (total: {})",
            index,
            indices.len()
        )
    })?;

    read_entry_as_base64(&mut archive, *real_index)
}

// ---------- Tauri Commands: Text Files ----------

#[tauri::command]
pub async fn load_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

#[tauri::command]
pub async fn get_text_info(path: String) -> Result<TextInfo, String> {
    let content =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    let filename = Path::new(&path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let file_type = Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("txt")
        .to_lowercase();

    Ok(TextInfo {
        filename,
        file_type,
        char_count: content.chars().count(),
        line_count: content.lines().count(),
    })
}

// ---------- Tauri Commands: TTS ----------

#[tauri::command]
pub async fn tts_start(
    state: State<'_, Mutex<TtsState>>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let mut tts = state.lock().map_err(|e| e.to_string())?;
    if tts.process.is_some() {
        return Ok("already running".to_string());
    }

    // Strategy 1: Try bundled tts_server.exe (production build)
    let bundled_exe = app
        .path()
        .resolve("bin/tts_server.exe", tauri::path::BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists());

    let child = if let Some(exe_path) = bundled_exe {
        // Launch bundled standalone exe — no Python needed
        Command::new(exe_path)
            .spawn()
            .map_err(|e| format!("Failed to start bundled TTS server: {}", e))?
    } else {
        // Strategy 2: Fall back to Python script (dev mode)
        let candidates = vec![
            PathBuf::from("../python/tts_server.py"),
            PathBuf::from("python/tts_server.py"),
        ];
        let script_path = candidates
            .into_iter()
            .find(|p| p.exists())
            .ok_or_else(|| {
                "Cannot find TTS server. No bundled exe and no python/tts_server.py found."
                    .to_string()
            })?;
        Command::new("python")
            .arg(script_path.to_string_lossy().to_string())
            .spawn()
            .map_err(|e| format!("Failed to start TTS server: {}", e))?
    };

    tts.process = Some(child);
    tts.status = "starting".to_string();
    Ok("started".to_string())
}

#[tauri::command]
pub async fn tts_stop(state: State<'_, Mutex<TtsState>>) -> Result<String, String> {
    let mut tts = state.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut child) = tts.process {
        let _ = child.kill();
    }
    tts.process = None;
    tts.status = "stopped".to_string();
    Ok("stopped".to_string())
}

#[tauri::command]
pub async fn tts_status(state: State<'_, Mutex<TtsState>>) -> Result<String, String> {
    let should_ping = {
        let mut tts = state.lock().map_err(|e| e.to_string())?;

        // Check if process has exited unexpectedly
        if let Some(ref mut child) = tts.process {
            if let Ok(Some(_)) = child.try_wait() {
                tts.process = None;
                tts.status = "error".to_string();
                return Ok("error".to_string());
            }
        }

        tts.process.is_some() && tts.status == "starting"
    }; // MutexGuard dropped here

    if should_ping {
        let client = reqwest::Client::new();
        match client
            .get("http://127.0.0.1:9966/health")
            .timeout(std::time::Duration::from_secs(1))
            .send()
            .await
        {
            Ok(resp) if resp.status().is_success() => {
                let mut tts = state.lock().map_err(|e| e.to_string())?;
                tts.status = "ready".to_string();
                return Ok("ready".to_string());
            }
            _ => return Ok("starting".to_string()),
        }
    }

    let tts = state.lock().map_err(|e| e.to_string())?;
    Ok(tts.status.clone())
}

#[tauri::command]
pub async fn tts_speak(
    state: State<'_, Mutex<TtsState>>,
    text: String,
    engine: Option<String>,
) -> Result<String, String> {
    {
        let tts = state.lock().map_err(|e| e.to_string())?;
        if tts.status != "ready" {
            return Err("TTS server is not ready".to_string());
        }
    }

    let engine_name = engine.unwrap_or_else(|| "chattts".to_string());

    let client = reqwest::Client::new();
    let resp = client
        .post("http://127.0.0.1:9966/tts")
        .json(&serde_json::json!({ "text": text, "engine": engine_name }))
        .timeout(std::time::Duration::from_secs(300))
        .send()
        .await
        .map_err(|e| format!("TTS request failed: {}", e))?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;

    if !status.is_success() {
        let error_msg = body["error"]
            .as_str()
            .unwrap_or("Unknown error");
        let traceback = body["traceback"]
            .as_str()
            .unwrap_or("");
        if traceback.is_empty() {
            return Err(format!("TTS server error ({}): {}", status, error_msg));
        } else {
            return Err(format!("TTS server error ({}): {}\n\n{}", status, error_msg, traceback));
        }
    }

    let audio_b64 = body["audio"]
        .as_str()
        .ok_or("No audio field in TTS response")?;

    let format = body["format"]
        .as_str()
        .unwrap_or("wav");

    let mime = match format {
        "mp3" => "audio/mpeg",
        _ => "audio/wav",
    };

    Ok(format!("data:{};base64,{}", mime, audio_b64))
}

#[tauri::command]
pub async fn tts_save_audio(
    app: tauri::AppHandle,
    audio_data_uri: String,
) -> Result<String, String> {
    use tauri_plugin_dialog::DialogExt;

    // Detect format from data URI prefix and strip it
    let (b64, ext, filter_name) = if audio_data_uri.starts_with("data:audio/mpeg;base64,") {
        (&audio_data_uri["data:audio/mpeg;base64,".len()..], "mp3", "MP3 Audio")
    } else if audio_data_uri.starts_with("data:audio/wav;base64,") {
        (&audio_data_uri["data:audio/wav;base64,".len()..], "wav", "WAV Audio")
    } else {
        (audio_data_uri.as_str(), "wav", "WAV Audio")
    };

    let audio_bytes = BASE64
        .decode(b64)
        .map_err(|e| format!("Failed to decode audio: {}", e))?;

    // Open native file save dialog
    let file_path = app
        .dialog()
        .file()
        .add_filter(filter_name, &[ext])
        .set_file_name(&format!("tts_audio.{}", ext))
        .blocking_save_file();

    match file_path {
        Some(path) => {
            let p = path.as_path().ok_or("Invalid save path")?;
            fs::write(p, &audio_bytes)
                .map_err(|e| format!("Failed to write file: {}", e))?;
            Ok(p.to_string_lossy().to_string())
        }
        None => Err("Save cancelled".to_string()),
    }
}
