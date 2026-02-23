export interface ComicEntry {
  filename: string;
  path: string;
  cover_base64: string;
  file_type: "zip" | "md" | "txt";
}

export interface ComicInfo {
  filename: string;
  total_pages: number;
}

export interface TextInfo {
  filename: string;
  file_type: "md" | "txt";
  char_count: number;
  line_count: number;
}

export type TtsStatus = "stopped" | "starting" | "ready" | "error";
