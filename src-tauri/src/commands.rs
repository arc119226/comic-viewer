use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine as _;
use natord::compare as natural_compare;
use serde::Serialize;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

// ---------- Data Types ----------

#[derive(Serialize)]
pub struct ComicEntry {
    pub filename: String,
    pub path: String,
    pub cover_base64: String,
}

#[derive(Serialize)]
pub struct ComicInfo {
    pub filename: String,
    pub total_pages: usize,
}

// ---------- Helpers ----------

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "bmp", "webp"];

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

// ---------- Tauri Commands ----------

/// Recursively collect all .zip files under a directory.
fn collect_zips(dir: &Path, out: &mut Vec<PathBuf>) {
    let read_dir = match fs::read_dir(dir) {
        Ok(rd) => rd,
        Err(_) => return,
    };
    for entry in read_dir.flatten() {
        let file_path = entry.path();
        if file_path.is_dir() {
            collect_zips(&file_path, out);
        } else {
            let is_zip = file_path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("zip"))
                .unwrap_or(false);
            if is_zip {
                out.push(file_path);
            }
        }
    }
}

#[tauri::command]
pub async fn scan_folder(path: String) -> Result<Vec<ComicEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut zip_paths: Vec<PathBuf> = Vec::new();
    collect_zips(dir, &mut zip_paths);

    let mut entries: Vec<ComicEntry> = Vec::new();

    for file_path in zip_paths {
        // Show path relative to the selected folder, fallback to filename
        let display_name = file_path
            .strip_prefix(dir)
            .unwrap_or(&file_path)
            .to_string_lossy()
            .to_string();

        let cover_base64 = match fs::File::open(&file_path) {
            Ok(file) => match ZipArchive::new(file) {
                Ok(mut archive) => {
                    let indices = sorted_image_indices(&mut archive);
                    if let Some(&first_idx) = indices.first() {
                        read_entry_as_base64(&mut archive, first_idx).unwrap_or_default()
                    } else {
                        String::new()
                    }
                }
                Err(_) => String::new(),
            },
            Err(_) => String::new(),
        };

        entries.push(ComicEntry {
            filename: display_name,
            path: file_path.to_string_lossy().to_string(),
            cover_base64,
        });
    }

    entries.sort_by(|a, b| natural_compare(&a.filename, &b.filename));
    Ok(entries)
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
