#[cfg(debug_assertions)]
use tauri::Manager;

// 自定义 Tauri 命令：在 Rust 侧做 JSON 格式化（可选，前端也能做）
#[tauri::command]
fn format_json(input: String, indent: u8) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(&input)
        .map_err(|e| e.to_string())?;
    let spaces = " ".repeat(indent as usize);
    let formatter = serde_json::ser::PrettyFormatter::with_indent(spaces.as_bytes());
    let mut output = Vec::new();
    let mut ser = serde_json::Serializer::with_formatter(&mut output, formatter);
    value.serialize(&mut ser).map_err(|e| e.to_string())?;
    Ok(String::from_utf8(output).map_err(|e| e.to_string())?)
}

#[tauri::command]
fn minify_json(input: String) -> Result<String, String> {
    let value: serde_json::Value = serde_json::from_str(&input)
        .map_err(|e| e.to_string())?;
    serde_json::to_string(&value).map_err(|e| e.to_string())
}

#[tauri::command]
fn validate_json(input: String) -> bool {
    serde_json::from_str::<serde_json::Value>(&input).is_ok()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            format_json,
            minify_json,
            validate_json,
        ])
        .setup(|_app| {
            // 开发模式下打开 DevTools
            #[cfg(debug_assertions)]
            _app.get_webview_window("main").unwrap().open_devtools();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// 需要为 serde 添加 use
use serde::Serialize;
