#[cfg(target_os = "macos")]
use tauri::LogicalPosition;
use tauri::{App, AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder};
use std::sync::atomic::{AtomicBool, Ordering};

// The offset from the top of the screen to the window
const TOP_OFFSET: i32 = 54;

/// The overlay's expanded-bar dimensions (logical px). Width is also
/// hardcoded inside `set_window_height` — every existing caller of that
/// command depends on 600 width for the tall popover, so it's left alone.
pub const BAR_WIDTH: f64 = 600.0;
pub const BAR_HEIGHT: f64 = 54.0;
/// The collapsed pill's dimensions (logical px, square).
pub const PILL_SIZE: f64 = 106.0;

/// True while the overlay is the collapsed pill. Starts `false` because the
/// window genuinely boots at its `tauri.conf.json` size (600x54) — the
/// frontend collapses it on mount (see `useOverlayCollapse`), which must be a
/// *runtime* resize.
///
/// Resizing during `setup_main_window` does not work: WebView2 is created
/// from the config size, so a resize that early moves the OS window (verified
/// via `outer_size()`) while the webview keeps rendering at the old size —
/// the documented tauri-apps/tauri#10053 / #13318 webview-resize bug. The
/// same `set_size` call at runtime works fine, which is exactly why
/// `set_window_height` has always worked for the popovers.
///
/// Authoritative source of truth for collapse state: `set_overlay_collapsed`
/// is the only writer, and `set_window_height` (called from 7 different React
/// mount sites plus a MutationObserver that fires on nearly every DOM change)
/// early-returns while this is set, rather than requiring every one of those
/// call sites to be audited/guarded individually.
pub static OVERLAY_COLLAPSED: AtomicBool = AtomicBool::new(false);

/// Sets up the main window with custom positioning
pub fn setup_main_window(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    // Try different possible window labels
    let window = app
        .get_webview_window("main")
        .or_else(|| app.get_webview_window("krishna"))
        .or_else(|| {
            // Get the first window if specific labels don't work
            app.webview_windows().values().next().cloned()
        })
        .ok_or("No window found")?;

    // Deliberately NOT resized to the pill here — see OVERLAY_COLLAPSED's doc
    // comment. A setup-time resize moves the OS window but leaves WebView2
    // rendering at the config size. The frontend collapses it on mount
    // instead, and shows the window once that runtime resize has landed
    // (tauri.conf.json keeps `visible: false` so the full bar never flashes).
    position_window_top_center(&window, TOP_OFFSET)?;

    // Set window as non-focusable on Windows
    // #[cfg(target_os = "windows")]
    // {
    //     let _ = window.set_focusable(false);
    // }

    // Safety net: if the frontend never gets far enough to collapse-and-show
    // (init failure, JS exception before mount), reveal the window anyway
    // after a short grace period rather than leaving the app permanently
    // invisible with no way to reach it.
    let fallback = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        if matches!(fallback.is_visible(), Ok(false)) {
            eprintln!("[overlay] Frontend never revealed the window — showing it as a fallback");
            let _ = fallback.show();
        }
    });

    Ok(())
}

/// Positions a window at the top center of the screen with a specified Y offset
pub fn position_window_top_center(
    window: &WebviewWindow,
    y_offset: i32,
) -> Result<(), Box<dyn std::error::Error>> {
    // Get the primary monitor
    if let Some(monitor) = window.primary_monitor()? {
        let monitor_size = monitor.size();
        let window_size = window.outer_size()?;

        // Calculate center X position
        let center_x = (monitor_size.width as i32 - window_size.width as i32) / 2;

        // Set the window position
        window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
            x: center_x,
            y: y_offset,
        }))?;
    }

    Ok(())
}

#[tauri::command]
pub fn set_window_height(window: tauri::WebviewWindow, height: u32) -> Result<(), String> {
    use tauri::{LogicalSize, Size};

    // The pill wins. This command is called from 7 different React mount
    // sites plus a MutationObserver firing on nearly every DOM change inside
    // the expanded bar (streaming text, spinners, etc.) — while collapsed,
    // every one of those calls must be a no-op, or the window snaps back to
    // 600x54 mid-collapse. See OVERLAY_COLLAPSED's doc comment.
    if OVERLAY_COLLAPSED.load(Ordering::SeqCst) {
        return Ok(());
    }

    // Simply set the window size with fixed width and new height
    let new_size = LogicalSize::new(BAR_WIDTH, height as f64);
    window
        .set_size(Size::Logical(new_size))
        .map_err(|e| format!("Failed to resize window: {}", e))?;

    Ok(())
}

/// Collapses the overlay to a 106x106 pill, or expands it back to the 600x54
/// bar — the only command that resizes the main window between those two
/// states. Position is always derived from the window's *current* position
/// (never recomputed from the monitor), since drag and the `move_window_*`
/// hotkeys let the owner move the bar — recentering on the monitor would
/// silently undo that.
///
/// Center-preserving: collapsing/expanding shifts X by half the width
/// difference, so the pill sits at the same visual center the bar occupied
/// (and vice versa) rather than jumping ~280 logical px.
#[tauri::command]
pub fn set_overlay_collapsed(window: tauri::WebviewWindow, collapsed: bool) -> Result<(), String> {
    use tauri::{LogicalSize, PhysicalPosition, Position, Size};

    // Idempotent — makes any stray call (e.g. a race between the CSS
    // transition's timer and a fast second click) harmless.
    if OVERLAY_COLLAPSED.load(Ordering::SeqCst) == collapsed {
        return Ok(());
    }

    let scale = window.scale_factor().map_err(|e| format!("Failed to read scale factor: {}", e))?;
    let pos = window
        .outer_position()
        .map_err(|e| format!("Failed to read window position: {}", e))?;
    let dx = (((BAR_WIDTH - PILL_SIZE) / 2.0) * scale).round() as i32;

    // set_resizable(true) around the resize works around a documented
    // WebView2-on-Windows bug (tauri-apps/tauri#5679, #11975, #10053): with
    // `resizable: false`, set_size() moves the OS window correctly but the
    // WebView2 content surface doesn't follow — verified live, the window
    // itself measured the correct new size via outer_size() while the
    // rendered content stayed at the old size. See setup_main_window's
    // matching comment for the initial collapsed-boot resize.
    window
        .set_resizable(true)
        .map_err(|e| format!("Failed to enable resizing: {}", e))?;

    if collapsed {
        // Shrink then move: briefly covers a superset of both rects rather
        // than jumping off-anchor mid-transition.
        window
            .set_size(Size::Logical(LogicalSize::new(PILL_SIZE, PILL_SIZE)))
            .map_err(|e| format!("Failed to shrink window: {}", e))?;
        window
            .set_position(Position::Physical(PhysicalPosition { x: pos.x + dx, y: pos.y }))
            .map_err(|e| format!("Failed to reposition window: {}", e))?;
    } else {
        let mut target_x = pos.x - dx;

        // Clamp so expanding a pill dragged to a screen edge doesn't push
        // the bar half off-screen.
        if let Some(monitor) = window
            .current_monitor()
            .map_err(|e| format!("Failed to read current monitor: {}", e))?
        {
            let monitor_size = monitor.size();
            let bar_width_physical = (BAR_WIDTH * scale).round() as i32;
            let max_x = (monitor_size.width as i32 - bar_width_physical).max(0);
            target_x = target_x.clamp(0, max_x);
        }

        // Move then grow: the window is briefly the pill's size at the
        // bar's target position rather than the bar's size at the pill's
        // position — both cover a superset of the final rect, never less.
        window
            .set_position(Position::Physical(PhysicalPosition { x: target_x, y: pos.y }))
            .map_err(|e| format!("Failed to reposition window: {}", e))?;
        window
            .set_size(Size::Logical(LogicalSize::new(BAR_WIDTH, BAR_HEIGHT)))
            .map_err(|e| format!("Failed to grow window: {}", e))?;
    }

    window
        .set_resizable(false)
        .map_err(|e| format!("Failed to disable resizing: {}", e))?;

    OVERLAY_COLLAPSED.store(collapsed, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn open_dashboard(app: tauri::AppHandle) -> Result<(), String> {
    show_dashboard_window(&app)
}

pub fn create_dashboard_window<R: Runtime>(
    app: &AppHandle<R>,
    initial_route: &str,
) -> Result<WebviewWindow<R>, tauri::Error> {
    let base_builder = WebviewWindowBuilder::new(
        app,
        "dashboard",
        tauri::WebviewUrl::App(initial_route.into()),
    );

    #[cfg(target_os = "macos")]
    let base_builder = base_builder
        .title("Krishna - Dashboard")
        .center()
        .decorations(true)
        .inner_size(1200.0, 800.0)
        .min_inner_size(800.0, 600.0)
        .hidden_title(true)
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .content_protected(true)
        .visible(true)
        .traffic_light_position(LogicalPosition::new(14.0, 18.0));

    #[cfg(all(not(target_os = "macos"), not(target_os = "android")))]
    let base_builder = base_builder
        .title("Krishna - Dashboard")
        .center()
        .decorations(true)
        .inner_size(800.0, 600.0)
        .min_inner_size(800.0, 600.0)
        .visible(true);

    #[cfg(target_os = "android")]
    let base_builder = base_builder
        .title("Krishna - Dashboard")
        .visible(true);

    let window = base_builder.build()?;

    // Set up close event handler - hide window instead of destroying it
    setup_dashboard_close_handler(&window);

    Ok(window)
}

/// Sets up the close event handler for the dashboard window.
/// Intercepting CloseRequested and hiding is critical — destroying the window
/// and recreating it races with WebView2 initialisation on Windows, causing
/// the app to appear frozen.  Hiding is instant and the window stays alive in
/// the process, so subsequent show() calls are reliable.
fn setup_dashboard_close_handler<R: Runtime>(window: &WebviewWindow<R>) {
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            // Prevent Tauri from destroying the webview window.
            // The window is merely hidden; the app continues running in the
            // system tray and the user can reopen it any time.
            api.prevent_close();
            let _ = window_clone.hide();
        }
    });
}

/// Shows the dashboard window and brings it to focus
pub fn show_dashboard_window<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if let Some(dashboard_window) = app.get_webview_window("dashboard") {
        // Window exists, show and focus it
        dashboard_window
            .show()
            .map_err(|e| format!("Failed to show dashboard window: {}", e))?;
        dashboard_window
            .set_focus()
            .map_err(|e| format!("Failed to focus dashboard window: {}", e))?;
    } else {
        // Window doesn't exist, create it and then show it.
        // Prefer /dashboard — if it's first-run the front-end FirstRunGuard
        // will redirect to /setup. This branch is only reachable if the window
        // was destroyed during the session, so the extra hop is harmless.
        let window = create_dashboard_window(app, "/dashboard")
            .map_err(|e| format!("Failed to create dashboard window: {}", e))?;
        window
            .show()
            .map_err(|e| format!("Failed to show new dashboard window: {}", e))?;
        window
            .set_focus()
            .map_err(|e| format!("Failed to focus new dashboard window: {}", e))?;
    }
    Ok(())
}
