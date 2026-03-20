export interface ComicEntry {
  filename: string;
  path: string;
  cover_base64: string;
  file_type: "zip" | "md" | "txt";
}

export interface ComicInfo {
  filename: string;
  total_pages: number;
  page_width: number;
  page_height: number;
}

export interface TextInfo {
  filename: string;
  file_type: "md" | "txt";
  char_count: number;
  line_count: number;
}

export type TtsStatus = "stopped" | "starting" | "ready" | "error";

export type TtsEngine = "chattts" | "edge-tts" | "index-tts";
