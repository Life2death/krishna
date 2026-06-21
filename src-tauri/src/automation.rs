use enigo::{Direction, Enigo, Key, Keyboard, Mouse, Settings, Button, Coordinate};
use std::sync::Mutex;

/// Holds the computer-control enabled flag, synced from the JS settings toggle.
/// Defense in depth: Rust hard-refuses any computer_* command when this is false.
pub struct ComputerControlState {
    pub enabled: Mutex<bool>,
}

/// Shared helper: check the enabled flag and return an error if disabled.
fn ensure_enabled(state: &ComputerControlState) -> Result<(), String> {
    let enabled = state.enabled.lock().map_err(|e| format!("Lock error: {}", e))?;
    if !*enabled {
        return Err("Computer control is disabled. Enable it in Settings → Advanced → Computer Control.".into());
    }
    Ok(())
}

#[tauri::command]
pub fn set_computer_control_enabled(
    state: tauri::State<'_, ComputerControlState>,
    enabled: bool,
) -> Result<(), String> {
    let mut flag = state.enabled.lock().map_err(|e| format!("Lock error: {}", e))?;
    *flag = enabled;
    Ok(())
}

#[tauri::command]
pub fn computer_type(
    state: tauri::State<'_, ComputerControlState>,
    text: String,
) -> Result<String, String> {
    ensure_enabled(&state)?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init Enigo: {}", e))?;
    enigo.text(&text).map_err(|e| format!("Failed to type text: {}", e))?;
    Ok(format!("Typed {} characters", text.len()))
}

fn parse_key(key_str: &str) -> Result<Key, String> {
    match key_str.to_lowercase().as_str() {
        "enter" | "return" => Ok(Key::Return),
        "tab" => Ok(Key::Tab),
        "escape" | "esc" => Ok(Key::Escape),
        "space" => Ok(Key::Space),
        "backspace" => Ok(Key::Backspace),
        "delete" | "del" => Ok(Key::Delete),
        "up" => Ok(Key::UpArrow),
        "down" => Ok(Key::DownArrow),
        "left" => Ok(Key::LeftArrow),
        "right" => Ok(Key::RightArrow),
        "home" => Ok(Key::Home),
        "end" => Ok(Key::End),
        "pageup" => Ok(Key::PageUp),
        "pagedown" => Ok(Key::PageDown),
        "shift" => Ok(Key::Shift),
        "control" | "ctrl" => Ok(Key::Control),
        "alt" => Ok(Key::Alt),
        "meta" | "cmd" | "command" | "super" => Ok(Key::Meta),
        "capslock" | "caps" => Ok(Key::CapsLock),
        "insert" => Ok(Key::Insert),
        "f1" => Ok(Key::F1),
        "f2" => Ok(Key::F2),
        "f3" => Ok(Key::F3),
        "f4" => Ok(Key::F4),
        "f5" => Ok(Key::F5),
        "f6" => Ok(Key::F6),
        "f7" => Ok(Key::F7),
        "f8" => Ok(Key::F8),
        "f9" => Ok(Key::F9),
        "f10" => Ok(Key::F10),
        "f11" => Ok(Key::F11),
        "f12" => Ok(Key::F12),

        single if single.len() == 1 => {
            let c = single.chars().next().unwrap();
            Ok(Key::Unicode(c))
        }
        _ => Err(format!("Unknown key: {}", key_str)),
    }
}

fn parse_modifier(key_str: &str) -> Result<Key, String> {
    match key_str.to_lowercase().as_str() {
        "shift" => Ok(Key::Shift),
        "control" | "ctrl" => Ok(Key::Control),
        "alt" => Ok(Key::Alt),
        "meta" | "cmd" | "command" | "super" => Ok(Key::Meta),
        _ => Err(format!("Unknown modifier: {}", key_str)),
    }
}

#[tauri::command]
pub fn computer_key(
    state: tauri::State<'_, ComputerControlState>,
    keys: String,
) -> Result<String, String> {
    ensure_enabled(&state)?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init Enigo: {}", e))?;

    let parts: Vec<&str> = keys.split('+').collect();
    if parts.is_empty() {
        return Err("No key specified".into());
    }

    if parts.len() == 1 {
        let key = parse_key(parts[0])?;
        enigo.key(key, Direction::Click).map_err(|e| format!("Failed to press key: {}", e))?;
        return Ok(format!("Pressed {}", parts[0]));
    }

    // Multi-key combo: last part is the main key, preceding parts are modifiers
    let main_key_str = parts.last().unwrap();
    let modifier_strs = &parts[..parts.len() - 1];

    let main_key = parse_key(main_key_str)?;
    let modifiers: Vec<Key> = modifier_strs
        .iter()
        .map(|m| parse_modifier(m))
        .collect::<Result<Vec<_>, _>>()?;

    // Press modifiers down
    for mod_key in &modifiers {
        enigo.key(*mod_key, Direction::Press).map_err(|e| format!("Failed to press modifier: {}", e))?;
    }

    // Click the main key
    enigo.key(main_key, Direction::Click).map_err(|e| format!("Failed to press key: {}", e))?;

    // Release modifiers in reverse
    for mod_key in modifiers.iter().rev() {
        enigo.key(*mod_key, Direction::Release).map_err(|e| format!("Failed to release modifier: {}", e))?;
    }

    Ok(format!("Pressed combo: {}", keys))
}

#[tauri::command]
pub fn computer_click(
    state: tauri::State<'_, ComputerControlState>,
    button: Option<String>,
) -> Result<String, String> {
    ensure_enabled(&state)?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init Enigo: {}", e))?;

    let btn = match button.as_deref() {
        Some("right") => Button::Right,
        Some("middle") => Button::Middle,
        _ => Button::Left,
    };

    enigo.button(btn, Direction::Click).map_err(|e| format!("Failed to click: {}", e))?;
    Ok(format!("Clicked {:?}", btn))
}

#[tauri::command]
pub fn computer_move(
    state: tauri::State<'_, ComputerControlState>,
    x: i32,
    y: i32,
) -> Result<String, String> {
    ensure_enabled(&state)?;
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| format!("Failed to init Enigo: {}", e))?;
    enigo.move_mouse(x, y, Coordinate::Abs).map_err(|e| format!("Failed to move mouse: {}", e))?;
    Ok(format!("Moved mouse to ({}, {})", x, y))
}

#[tauri::command]
pub fn computer_focus_window(
    state: tauri::State<'_, ComputerControlState>,
    _title_substring: String,
) -> Result<String, String> {
    ensure_enabled(&state)?;
    // Deferred — window focusing is platform-hairy.
    // On Windows we could use win32 FindWindow/SetForegroundWindow,
    // but that significantly increases the diff. For v1, we document this
    // limitation and rely on the user focusing the target window before confirming.
    Err("computer_focus_window is not yet implemented on this platform. Please focus the target window manually before confirming.".into())
}
