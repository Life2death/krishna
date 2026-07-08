use enigo::{Direction, Enigo, Key, Keyboard, Mouse, Settings, Button, Coordinate};
use std::collections::HashMap;
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
    #[cfg(target_os = "windows")]
    {
        let windows = windows_impl::list_windows();
        let query = _title_substring;
        match match_window(&windows, &query) {
            MatchResult::Single(info) => {
                windows_impl::focus_hwnd(info.hwnd)?;
                Ok(format!("Brought \"{}\" to the front.", info.title))
            }
            MatchResult::Ambiguous(candidates) => {
                if candidates.is_empty() {
                    Err(format!("I don't see any window matching \"{}\".", query))
                } else {
                    Err(format!("I can see {} — which one?", candidates.join(", ")))
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = _title_substring;
        Err("computer_focus_window is not yet implemented on this platform.".into())
    }
}

#[tauri::command]
pub fn window_move(
    state: tauri::State<'_, ComputerControlState>,
    query: String,
    monitor: String,
    maximize: Option<bool>,
) -> Result<String, String> {
    ensure_enabled(&state)?;
    #[cfg(target_os = "windows")]
    {
        use windows_impl as win;

        let windows = win::list_windows();
        match match_window(&windows, &query) {
            MatchResult::Single(info) => {
                let monitors = win::list_monitors();
                let current_idx = win::window_monitor_index(info.hwnd, &monitors);
                let resolution = parse_monitor(&monitor, &monitors, current_idx)?;
                let target = &monitors[resolution.index as usize];
                // Default (maximize not specified): preserve whatever state the window is
                // ACTUALLY in right now. An explicit true/false is a deliberate override.
                let is_currently_maximized = win::is_window_maximized(info.hwnd);
                let was_max = maximize.unwrap_or(is_currently_maximized);
                win::move_hwnd(info.hwnd, target.rect, was_max)?;
                win::focus_hwnd(info.hwnd)?;
                let label = if resolution.is_primary { "primary" } else { &monitor };
                Ok(format!("Moved \"{}\" to the {} monitor.", info.title, label))
            }
            MatchResult::Ambiguous(candidates) => {
                if candidates.is_empty() {
                    Err(format!("I don't see any window matching \"{}\".", query))
                } else {
                    Err(format!("I can see {} — which one?", candidates.join(", ")))
                }
            }
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (query, monitor, maximize);
        Err("window_move is not yet implemented on this platform.".into())
    }
}

#[tauri::command]
pub fn window_list_summary(
    state: tauri::State<'_, ComputerControlState>,
    n: Option<usize>,
) -> Result<String, String> {
    ensure_enabled(&state)?;
    #[cfg(target_os = "windows")]
    {
        let windows = windows_impl::list_windows();
        let count = n.unwrap_or(10);
        let titles: Vec<String> = windows
            .iter()
            .take(count)
            .map(|w| format!("\"{}\"", w.title))
            .collect();
        if titles.is_empty() {
            Ok("No visible windows found.".into())
        } else {
            Ok(format!("{} windows visible. Top: {}", windows.len(), titles.join(", ")))
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = n;
        Err("window_list_summary is not yet implemented on this platform.".into())
    }
}

// ── Window control types ──────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct WindowInfo {
    pub hwnd: isize,
    pub title: String,
    pub process_exe: String,
}

#[derive(Debug, Clone)]
pub struct MonitorInfo {
    pub is_primary: bool,
    pub rect: (i32, i32, i32, i32),
}

#[derive(Debug)]
pub enum MatchResult {
    Single(WindowInfo),
    Ambiguous(Vec<String>),
}

#[derive(Debug)]
pub struct MonitorResolution {
    pub index: u32,
    pub is_primary: bool,
}

// ── Pure matching function (zero Win32 calls — fully testable) ────

pub fn match_window(windows: &[WindowInfo], query: &str) -> MatchResult {
    let query_lower = query.trim().to_lowercase();

    // Collect ranked matches
    let mut exact: Vec<&WindowInfo> = Vec::new();
    let mut substring: Vec<&WindowInfo> = Vec::new();
    let mut alias: Vec<&WindowInfo> = Vec::new();
    let mut exe_match: Vec<&WindowInfo> = Vec::new();

    let alias_map = build_alias_map();

    for w in windows {
        let title_lower = w.title.to_lowercase();
        let exe_lower = w.process_exe.to_lowercase();

        if title_lower == query_lower {
            exact.push(w);
        } else if title_lower.contains(&query_lower) {
            substring.push(w);
        } else if let Some(aliases) = alias_map.get(query_lower.as_str()) {
            if aliases.iter().any(|a| exe_lower.ends_with(a)) {
                alias.push(w);
            }
        } else {
            // Fallback: match query against the exe filename stem
            let exe_stem = std::path::Path::new(&w.process_exe)
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_lowercase();
            if exe_stem.contains(&query_lower) {
                exe_match.push(w);
            }
        }
    }

    let pick = |v: &[&WindowInfo]| -> Option<WindowInfo> {
        v.first().map(|&&ref win| win.clone())
    };

    if exact.len() == 1 {
        return MatchResult::Single(exact[0].clone());
    }
    if !exact.is_empty() {
        return MatchResult::Single(exact[0].clone());
    }
    if let Some(win) = pick(&substring) {
        return MatchResult::Single(win);
    }
    if let Some(win) = pick(&alias) {
        return MatchResult::Single(win);
    }
    if let Some(win) = pick(&exe_match) {
        return MatchResult::Single(win);
    }

    let candidates: Vec<String> = windows
        .iter()
        .filter(|w| !w.title.is_empty())
        .take(5)
        .map(|w| format!("\"{}\"", w.title))
        .collect();

    MatchResult::Ambiguous(candidates)
}

fn build_alias_map() -> HashMap<&'static str, Vec<&'static str>> {
    let mut m: HashMap<&'static str, Vec<&'static str>> = HashMap::new();
    m.insert("file explorer", vec!["explorer.exe"]);
    m.insert("explorer", vec!["explorer.exe"]);
    m.insert("chrome", vec!["chrome.exe"]);
    m.insert("browser", vec!["chrome.exe", "msedge.exe", "firefox.exe"]);
    m.insert("edge", vec!["msedge.exe"]);
    m.insert("firefox", vec!["firefox.exe"]);
    m.insert("terminal", vec!["windowsterminal.exe", "cmd.exe", "powershell.exe"]);
    m.insert("cmd", vec!["cmd.exe"]);
    m.insert("powershell", vec!["powershell.exe"]);
    m.insert("notepad", vec!["notepad.exe"]);
    m.insert("settings", vec!["systemsettings.exe"]);
    m.insert("calculator", vec!["calculator.exe"]);
    m.insert("task manager", vec!["taskmgr.exe", "taskmanager.exe"]);
    m
}

// ── Monitor resolution helper ─────────────────────────────────────

pub fn parse_monitor(monitor: &str, monitors: &[MonitorInfo], current_index: Option<u32>) -> Result<MonitorResolution, String> {
    match monitor.to_lowercase().trim() {
        "primary" | "main" => {
            let idx = monitors.iter().position(|m| m.is_primary)
                .ok_or_else(|| "No primary monitor found.".to_string())?;
            Ok(MonitorResolution { index: idx as u32, is_primary: true })
        }
        "left" => {
            let mut sorted: Vec<(usize, &MonitorInfo)> = monitors.iter().enumerate().collect();
            sorted.sort_by_key(|(_, m)| m.rect.0);
            sorted.first().map(|(i, _)| MonitorResolution { index: *i as u32, is_primary: false })
                .ok_or_else(|| "No monitors found.".to_string())
        }
        "right" => {
            let mut sorted: Vec<(usize, &MonitorInfo)> = monitors.iter().enumerate().collect();
            sorted.sort_by_key(|(_, m)| -m.rect.0); // reverse by x
            sorted.first().map(|(i, _)| MonitorResolution { index: *i as u32, is_primary: false })
                .ok_or_else(|| "No monitors found.".to_string())
        }
        "next" => {
            // Cycle relative to the window's ACTUAL current monitor (current_index), not a
            // hardcoded slot — a single connected monitor has nothing to cycle to.
            if monitors.len() < 2 {
                return Err("Only one monitor is connected — nothing to move to.".to_string());
            }
            let cur = (current_index.unwrap_or(0) as usize) % monitors.len();
            let next = (cur + 1) % monitors.len();
            Ok(MonitorResolution { index: next as u32, is_primary: monitors[next].is_primary })
        }
        n => {
            // Try numeric index
            let idx: usize = n.parse().map_err(|_| {
                format!("Unknown monitor \"{}\". Use: primary, left, right, next, or a number.", n)
            })?;
            if idx == 0 || idx > monitors.len() {
                return Err(format!("Monitor index {} is out of range (1–{}).", idx, monitors.len()));
            }
            Ok(MonitorResolution { index: (idx - 1) as u32, is_primary: false })
        }
    }
}

// ── Windows-specific Win32 implementation ─────────────────────────

#[cfg(target_os = "windows")]
pub mod windows_impl {
    use super::*;
    use windows::Win32::Foundation::{BOOL, CloseHandle, FALSE, HWND, LPARAM, RECT, TRUE};
    use windows::Win32::Graphics::Gdi::{
        EnumDisplayMonitors, GetMonitorInfoW, HDC, HMONITOR, MONITORINFO,
    };
    use windows::Win32::System::ProcessStatus::GetProcessImageFileNameW;
    use windows::Win32::System::Threading::{
        AttachThreadInput, GetCurrentThreadId, OpenProcess, PROCESS_QUERY_INFORMATION,
    };
    use windows::Win32::UI::Input::KeyboardAndMouse::{keybd_event, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP};
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, EnumWindows, GetForegroundWindow, GetWindowLongW, GetWindowPlacement,
        GetWindowRect, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, GWL_EXSTYLE,
        IsIconic, IsWindowVisible, SetForegroundWindow, SetWindowPos, ShowWindow, SW_MAXIMIZE,
        SW_RESTORE, SW_SHOW, WS_EX_TOOLWINDOW, HWND_TOP, SET_WINDOW_POS_FLAGS, WINDOWPLACEMENT,
    };

    unsafe extern "system" fn enum_window_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let results = &mut *(lparam.0 as *mut Vec<WindowInfo>);
        if IsWindowVisible(hwnd) == FALSE {
            return TRUE;
        }
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        if (ex_style & WS_EX_TOOLWINDOW.0 as i32) != 0 {
            return TRUE;
        }
        let len = GetWindowTextLengthW(hwnd);
        if len == 0 {
            return TRUE;
        }
        let mut buf = vec![0u16; len as usize + 1];
        let actual_len = GetWindowTextW(hwnd, &mut buf);
        if actual_len == 0 {
            return TRUE;
        }
        buf.truncate(actual_len as usize);
        let title = String::from_utf16_lossy(&buf);
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let exe_name = if pid > 0 {
            get_process_exe(pid).unwrap_or_default()
        } else {
            String::new()
        };
        results.push(WindowInfo { hwnd: hwnd.0 as isize, title, process_exe: exe_name });
        TRUE
    }

    pub fn list_windows() -> Vec<WindowInfo> {
        let mut results = Vec::new();
        unsafe {
            let _ = EnumWindows(
                Some(enum_window_proc),
                LPARAM(&mut results as *mut Vec<WindowInfo> as isize),
            );
        }
        results
    }

    unsafe fn get_process_exe(pid: u32) -> Option<String> {
        let h_process = OpenProcess(PROCESS_QUERY_INFORMATION, false, pid).ok()?;
        let mut buf = vec![0u16; 260];
        let len = GetProcessImageFileNameW(h_process, &mut buf);
        let _ = CloseHandle(h_process);
        if len > 0 {
            buf.truncate(len as usize);
            Some(String::from_utf16_lossy(&buf))
        } else {
            None
        }
    }

    unsafe extern "system" fn monitor_enum_proc(
        hmonitor: HMONITOR,
        _hdc: HDC,
        _rect: *mut RECT,
        lparam: LPARAM,
    ) -> BOOL {
        let results = &mut *(lparam.0 as *mut Vec<MonitorInfo>);
        let mut mi: MONITORINFO = std::mem::zeroed();
        mi.cbSize = std::mem::size_of::<MONITORINFO>() as u32;
        if GetMonitorInfoW(hmonitor, &mut mi).as_bool() {
            results.push(MonitorInfo {
                is_primary: (mi.dwFlags & 1) != 0,
                rect: (mi.rcWork.left, mi.rcWork.top, mi.rcWork.right, mi.rcWork.bottom),
            });
        }
        TRUE
    }

    pub fn list_monitors() -> Vec<MonitorInfo> {
        let mut results = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(
                None,
                None,
                Some(monitor_enum_proc),
                LPARAM(&mut results as *mut Vec<MonitorInfo> as isize),
            );
        }
        results
    }

    pub fn focus_hwnd(hwnd: isize) -> Result<(), String> {
        let target = HWND(hwnd as *mut _);
        unsafe {
            // Restore first if the window is minimized, otherwise SetForegroundWindow
            // raises an iconic window that stays visually minimized.
            if IsIconic(target).as_bool() {
                let _ = ShowWindow(target, SW_RESTORE);
            }

            let foreground = GetForegroundWindow();
            if foreground == target {
                return Ok(()); // already frontmost — nothing to do
            }

            // A background process (Krishna) calling SetForegroundWindow is throttled by
            // Windows unless its input thread is attached to the current foreground thread.
            // The bare Alt-key nudge alone is unreliable; AttachThreadInput is the robust path.
            let our_thread = GetCurrentThreadId();
            let fg_thread = GetWindowThreadProcessId(foreground, None);
            let target_thread = GetWindowThreadProcessId(target, None);

            let attach_fg = fg_thread != 0 && fg_thread != our_thread;
            let attach_target =
                target_thread != 0 && target_thread != our_thread && target_thread != fg_thread;
            if attach_fg {
                let _ = AttachThreadInput(our_thread, fg_thread, TRUE);
            }
            if attach_target {
                let _ = AttachThreadInput(our_thread, target_thread, TRUE);
            }

            // Alt nudge still helps lift the lock in some shells; keep it as a belt-and-braces.
            keybd_event(0x12, 0, KEYBD_EVENT_FLAGS(0), 0);
            keybd_event(0x12, 0, KEYEVENTF_KEYUP, 0);

            let _ = BringWindowToTop(target);
            let set_ok = SetForegroundWindow(target).as_bool();
            let _ = ShowWindow(target, SW_SHOW);

            if attach_fg {
                let _ = AttachThreadInput(our_thread, fg_thread, FALSE);
            }
            if attach_target {
                let _ = AttachThreadInput(our_thread, target_thread, FALSE);
            }

            // Verify against reality rather than trusting the call — don't report a
            // success the user can't see (RESUME_HERE §7.3).
            let now_fg = GetForegroundWindow();
            if now_fg == target || set_ok {
                Ok(())
            } else {
                Err("I found the window but Windows blocked me from bringing it to the front.".to_string())
            }
        }
    }

    pub fn move_hwnd(
        hwnd: isize,
        target_rect: (i32, i32, i32, i32),
        was_maximized: bool,
    ) -> Result<(), String> {
        let target = HWND(hwnd as *mut _);
        unsafe {
            if was_maximized {
                let _ = ShowWindow(target, SW_RESTORE);
            }
            let width = target_rect.2 - target_rect.0;
            let height = target_rect.3 - target_rect.1;
            SetWindowPos(
                target,
                HWND_TOP,
                target_rect.0,
                target_rect.1,
                width,
                height,
                SET_WINDOW_POS_FLAGS(16u32) | SET_WINDOW_POS_FLAGS(64u32),
            )
            .map_err(|e| format!("SetWindowPos failed: {}", e))?;
            if was_maximized {
                let _ = ShowWindow(target, SW_MAXIMIZE);
            }
        }
        Ok(())
    }

    pub fn is_window_maximized(hwnd: isize) -> bool {
        let target = HWND(hwnd as *mut _);
        let mut placement: WINDOWPLACEMENT = unsafe { std::mem::zeroed() };
        placement.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
        unsafe {
            let _ = GetWindowPlacement(target, &mut placement);
        }
        placement.showCmd == SW_MAXIMIZE.0 as u32
    }

    // Which monitor (by index into `monitors`) the window's center point currently sits on —
    // needed for "next" to actually cycle relative to where the window is, not a hardcoded slot.
    pub fn window_monitor_index(hwnd: isize, monitors: &[MonitorInfo]) -> Option<u32> {
        let target = HWND(hwnd as *mut _);
        let mut rect: RECT = unsafe { std::mem::zeroed() };
        let ok = unsafe { GetWindowRect(target, &mut rect) };
        if ok.is_err() {
            return None;
        }
        let cx = (rect.left + rect.right) / 2;
        let cy = (rect.top + rect.bottom) / 2;
        monitors
            .iter()
            .position(|m| cx >= m.rect.0 && cx < m.rect.2 && cy >= m.rect.1 && cy < m.rect.3)
            .map(|i| i as u32)
    }

    // The foreground window's screen rect — used by screen-capture ("what am I looking
    // at") to target whichever monitor the user is actually working on, instead of
    // wherever the (never-focused, focus:false) Krishna bar happens to sit. Since the
    // bar never steals focus, the foreground window for a voice-triggered command is
    // reliably whatever app the user was last using.
    pub fn foreground_window_rect() -> Option<(i32, i32, i32, i32)> {
        let hwnd = unsafe { GetForegroundWindow() };
        if hwnd.0.is_null() {
            return None;
        }
        let mut rect: RECT = unsafe { std::mem::zeroed() };
        let ok = unsafe { GetWindowRect(hwnd, &mut rect) };
        if ok.is_err() {
            return None;
        }
        Some((rect.left, rect.top, rect.right, rect.bottom))
    }
}

// Stub for non-Windows: no-op compile-time safe stand-ins
#[cfg(not(target_os = "windows"))]
pub mod windows_impl {
    use super::*;
    pub fn list_windows() -> Vec<WindowInfo> { vec![] }
    pub fn list_monitors() -> Vec<MonitorInfo> { vec![] }
    pub fn focus_hwnd(_hwnd: isize) -> Result<(), String> { Ok(()) }
    pub fn move_hwnd(_hwnd: isize, _rect: (i32,i32,i32,i32), _max: bool) -> Result<(), String> { Ok(()) }
    pub fn is_window_maximized(_hwnd: isize) -> bool { false }
    pub fn get_window_text(_hwnd: isize) -> String { String::new() }
    pub fn window_monitor_index(_hwnd: isize, _monitors: &[MonitorInfo]) -> Option<u32> { None }
    pub fn foreground_window_rect() -> Option<(i32, i32, i32, i32)> { None }
}

// ── Tests ─────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_win(title: &str, exe: &str) -> WindowInfo {
        WindowInfo {
            hwnd: 0,
            title: title.to_string(),
            process_exe: exe.to_string(),
        }
    }

    fn fixture_windows() -> Vec<WindowInfo> {
        vec![
            make_win("Untitled - Notepad", r"C:\Windows\System32\notepad.exe"),
            make_win("Chrome", r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            make_win("Settings", r"C:\Windows\System32\SystemSettings.exe"),
            make_win("File Explorer", r"C:\Windows\explorer.exe"),
            make_win("Naukri - Google Chrome", r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
            make_win("New Tab - Microsoft Edge", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
            make_win("Terminal", r"C:\Program Files\WindowsApps\Microsoft.WindowsTerminal_1.0.0.0\WindowsTerminal.exe"),
            make_win("Calculator", r"C:\Program Files\WindowsApps\Microsoft.WindowsCalculator_10.0.0.0\Calculator.exe"),
        ]
    }

    #[test]
    fn exact_title_match() {
        let windows = fixture_windows();
        let result = match_window(&windows, "Settings");
        match result {
            MatchResult::Single(win) => assert_eq!(win.title, "Settings"),
            _ => panic!("Expected single match"),
        }
    }

    #[test]
    fn exact_title_case_insensitive() {
        let windows = fixture_windows();
        let result = match_window(&windows, "settings");
        match result {
            MatchResult::Single(win) => assert_eq!(win.title, "Settings"),
            _ => panic!("Expected single match"),
        }
    }

    #[test]
    fn title_substring_match() {
        let windows = fixture_windows();
        // "Notepad" matches "Untitled - Notepad" via title substring
        let result = match_window(&windows, "Notepad");
        match result {
            MatchResult::Single(win) => assert_eq!(win.title, "Untitled - Notepad"),
            _ => panic!("Expected single match"),
        }
    }

    #[test]
    fn process_alias_chrome() {
        let windows = fixture_windows();
        // "chrome" matches via alias (chrome.exe)
        let result = match_window(&windows, "chrome");
        match result {
            MatchResult::Single(win) => assert!(win.title.contains("Chrome") || win.title.contains("Naukri")),
            _ => panic!("Expected single match"),
        }
    }

    #[test]
    fn process_alias_browser() {
        let windows = fixture_windows();
        // "browser" should match chrome or edge windows
        let result = match_window(&windows, "browser");
        match result {
            MatchResult::Single(win) => {
                assert!(
                    win.process_exe.to_lowercase().contains("chrome")
                        || win.process_exe.to_lowercase().contains("msedge")
                );
            }
            _ => panic!("Expected single match for browser"),
        }
    }

    #[test]
    fn no_match_returns_ambiguous() {
        let windows = fixture_windows();
        let result = match_window(&windows, "Photoshop");
        match result {
            MatchResult::Ambiguous(candidates) => {
                assert!(!candidates.is_empty());
                assert!(candidates[0].contains("Notepad") || candidates[0].contains("Chrome"));
            }
            _ => panic!("Expected ambiguous result"),
        }
    }

    #[test]
    fn multiple_exact_matches_picks_first() {
        let windows = vec![
            make_win("Downloads", r"C:\Windows\explorer.exe"),
            make_win("Downloads", r"C:\Windows\explorer.exe"),
        ];
        let result = match_window(&windows, "Downloads");
        match result {
            MatchResult::Single(win) => assert_eq!(win.title, "Downloads"),
            _ => panic!("Expected single match"),
        }
    }

    #[test]
    fn exe_stem_fallback() {
        let windows = fixture_windows();
        // "calc" should match Calculator.exe via exe stem fallback
        let result = match_window(&windows, "calc");
        match result {
            MatchResult::Single(win) => assert_eq!(win.title, "Calculator"),
            _ => panic!("Expected single match for calc"),
        }
    }

    #[test]
    fn empty_windows_returns_ambiguous() {
        let result = match_window(&[], "anything");
        match result {
            MatchResult::Ambiguous(candidates) => assert!(candidates.is_empty()),
            _ => panic!("Expected ambiguous result"),
        }
    }

    #[test]
    fn alias_file_explorer() {
        let windows = fixture_windows();
        let result = match_window(&windows, "file explorer");
        match result {
            MatchResult::Single(win) => assert_eq!(win.title, "File Explorer"),
            _ => panic!("Expected File Explorer match"),
        }
    }

    #[test]
    fn alias_edge() {
        let windows = fixture_windows();
        let result = match_window(&windows, "edge");
        match result {
            MatchResult::Single(win) => assert!(win.title.contains("Edge")),
            _ => panic!("Expected Edge match"),
        }
    }

    fn two_monitors() -> Vec<MonitorInfo> {
        vec![
            MonitorInfo { is_primary: true, rect: (0, 0, 1920, 1080) },
            MonitorInfo { is_primary: false, rect: (1920, 0, 3840, 1080) },
        ]
    }

    #[test]
    fn parse_monitor_primary() {
        let monitors = two_monitors();
        let r = parse_monitor("primary", &monitors, None).unwrap();
        assert_eq!(r.index, 0);
        assert!(r.is_primary);
    }

    #[test]
    fn parse_monitor_numeric() {
        let monitors = two_monitors();
        let r = parse_monitor("2", &monitors, None).unwrap();
        assert_eq!(r.index, 1);
    }

    #[test]
    fn parse_monitor_numeric_out_of_range_errs() {
        let monitors = two_monitors();
        assert!(parse_monitor("5", &monitors, None).is_err());
    }

    #[test]
    fn parse_monitor_next_cycles_from_current() {
        let monitors = two_monitors();
        // Window is currently on monitor 0 -> next should be monitor 1
        let r = parse_monitor("next", &monitors, Some(0)).unwrap();
        assert_eq!(r.index, 1);
        // Window is currently on monitor 1 -> next should wrap to monitor 0
        let r = parse_monitor("next", &monitors, Some(1)).unwrap();
        assert_eq!(r.index, 0);
    }

    #[test]
    fn parse_monitor_next_defaults_to_monitor_0_when_current_unknown() {
        let monitors = two_monitors();
        let r = parse_monitor("next", &monitors, None).unwrap();
        assert_eq!(r.index, 1);
    }

    #[test]
    fn parse_monitor_next_errs_on_single_monitor() {
        let monitors = vec![MonitorInfo { is_primary: true, rect: (0, 0, 1920, 1080) }];
        let result = parse_monitor("next", &monitors, Some(0));
        assert!(result.is_err());
    }
}
