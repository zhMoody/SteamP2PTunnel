#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use circular_queue::CircularQueue;
use log::{Level, LevelFilter, Metadata, Record};
use mcct_lib::{
    app_state::{AppState, LogEntry},
    net_manager, steam_commands, steam_utils,
};
use native_dialog::{MessageDialog, MessageType};
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::mpsc;
use std::sync::LazyLock;
use std::thread;
use std::time::Duration;
use steamworks::networking_sockets::NetConnection;
use steamworks::networking_types::{
    NetConnectionInfo, NetConnectionStatusChanged, NetworkingConnectionState,
};
use steamworks_sys;
use sysinfo::{Pid, System};
use tauri::{AppHandle, Emitter, Manager};

// --- 全局系统信息实例 ---
static SYS_INFO: LazyLock<Mutex<System>> = LazyLock::new(|| Mutex::new(System::new_all()));

#[derive(Serialize, Clone)]
struct LogPayload {
    message: String,
    level: String,
}

struct FrontendLogger {
    app_handle: Mutex<Option<AppHandle>>,
    history: Mutex<CircularQueue<LogEntry>>,
}

impl log::Log for FrontendLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        metadata.level() <= Level::Info
    }

    fn log(&self, record: &Record) {
        if self.enabled(record.metadata()) {
            let raw_message = format!("{}", record.args());

            // --- 噪音过滤器 ---
            if record.level() == Level::Warn {
                // 过滤掉 winit/tauri 底层在窗口切换时产生的无效警告
                if raw_message.contains("NewEvents emitted without explicit RedrawEventsCleared")
                    || raw_message
                        .contains("RedrawEventsCleared emitted without explicit MainEventsCleared")
                    || raw_message.contains("DPI")
                    || record.target().starts_with("winit")
                    || record.target().starts_with("tauri")
                {
                    return;
                }
            }

            let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let level = record.level().to_string();
            let formatted_message = format!("[{}] [{}] {}", timestamp, level, raw_message);

            println!("{}", formatted_message);

            let entry = LogEntry {
                timestamp,
                level: level.clone(),
                message: raw_message.clone(),
            };
            self.history.lock().push(entry);

            if let Some(handle) = self.app_handle.lock().as_ref() {
                let _ = handle.emit(
                    "log-event",
                    LogPayload {
                        message: raw_message,
                        level,
                    },
                );
            }
        }
    }

    fn flush(&self) {}
}

static LOGGER: LazyLock<FrontendLogger> = LazyLock::new(|| FrontendLogger {
    app_handle: Mutex::new(None),
    history: Mutex::new(CircularQueue::with_capacity(500)),
});

#[repr(C)]
struct NetConnectionStatusChangedHack {
    pub connection: steamworks_sys::HSteamNetConnection,
    pub connection_info: NetConnectionInfo,
    pub old_state: NetworkingConnectionState,
}

fn is_same_conn(a: &NetConnection, handle: steamworks_sys::HSteamNetConnection) -> bool {
    steam_utils::get_connection_handle(a) == handle
}

#[tauri::command]
async fn open_log_window(handle: tauri::AppHandle) {
    if let Some(win) = handle.get_webview_window("logs") {
        let _ = win.set_focus();
    } else {
        let _ = tauri::WebviewWindowBuilder::new(
            &handle,
            "logs",
            tauri::WebviewUrl::App("index.html?view=logs".into()),
        )
        .title("系統日誌 (System Logs)")
        .inner_size(800.0, 600.0)
        .resizable(true)
        .build();
    }
}

#[tauri::command]
fn get_log_history() -> Vec<LogEntry> {
    LOGGER.history.lock().iter().cloned().collect()
}

#[tauri::command]
fn get_memory_usage() -> String {
    let mut sys = SYS_INFO.lock();
    let pid = Pid::from(std::process::id() as usize);

    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    if let Some(process) = sys.process(pid) {
        // 内存单位是 KB
        let memory_kb = process.memory();
        // 转换为 MB
        let memory_mb = memory_kb as f64 / 1024.0;
        return format!("{:.2} MB", memory_mb);
    }
    "N/A".to_string()
}

#[tokio::main]
async fn main() {
    let app_state = match AppState::new() {
        Ok(state) => state,
        Err(e) => {
            MessageDialog::new()
                .set_title("初始化失败 (Initialization Failed)")
                .set_text(&format!("无法连接到 Steam 客户端。\n请确保 Steam 正在运行并且您已登录。\n\n错误详情: {}", e))
                .set_type(MessageType::Error)
                .show_alert()
                .unwrap();

            return;
        }
    };

    log::set_logger(&*LOGGER)
        .map(|()| log::set_max_level(LevelFilter::Info))
        .expect("Failed to set logger");

    // --- CRITICAL INITIALIZATION ---
    // Register the debug callback to get detailed network logs
    steam_utils::register_debug_callback();

    // Initialize Relay Network Access
    log::info!("初始化 Steam Relay Network Access...");
    steam_utils::init_relay_network_access();

    // Apply Global P2P Configurations to avoid 5008 timeout
    log::info!("设置全局 P2P 配置 (禁用 ICE, 允许任意用户)...");
    steam_utils::set_global_config_value_int32(
        steamworks_sys::ESteamNetworkingConfigValue::k_ESteamNetworkingConfig_P2P_Transport_ICE_Enable,
        0, // Disable ICE completely
    );
    steam_utils::set_global_config_value_int32(
        steamworks_sys::ESteamNetworkingConfigValue::k_ESteamNetworkingConfig_IP_AllowWithoutAuth,
        1, // Allow P2P even without traditional friend auth
    );

    // Initialize Authentication
    log::info!("初始化 Steam 认证...");
    steam_utils::init_authentication(&app_state.steam_client);

    // Wait a bit more for SDR to initialize before allowing any UI action
    thread::sleep(Duration::from_secs(2));

    // Check initial status
    steam_utils::check_auth_status(&app_state.steam_client);
    // -------------------------------

    let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();
    let connections = app_state.connections.clone();
    let active_handles = app_state.active_handles.clone();
    let client = app_state.steam_client.clone();

    client.register_callback(move |event: NetConnectionStatusChanged| {
        let event_hack: &NetConnectionStatusChangedHack = unsafe { std::mem::transmute(&event) };
        let connection_handle = event_hack.connection;

        match event_hack.connection_info.state() {
        Ok(NetworkingConnectionState::Connecting) => {
            let remote = event_hack.connection_info.identity_remote().unwrap();
            log::info!("P2P 正在连接: {:?}", remote.steam_id());
        }
        Ok(NetworkingConnectionState::Connected) => {
            log::info!("P2P 已连接: 句柄={:?}", connection_handle);
            let mut handles = active_handles.lock();
            if !handles.contains(&connection_handle) {
                handles.push(connection_handle);
            }
        }
        Ok(NetworkingConnectionState::ClosedByPeer)
        | Ok(NetworkingConnectionState::ProblemDetectedLocally) => {
            let mut conns = connections.lock();
            let mut handles = active_handles.lock();
            log::info!(
                "P2P 连接已关闭/失败: 句柄={:?}",
                connection_handle
            );
            if let Some(pos) = conns
                .iter()
                .position(|c| is_same_conn(c, connection_handle))
            {
                conns.remove(pos);
                log::info!("已从活动列表中移除连接。");
            }
            if let Some(pos) = handles.iter().position(|&h| h == connection_handle) {
                handles.remove(pos);
                log::info!("已从活动句柄中移除。");
            }
        }
        _ => {}
        }
        });

        let client_for_loop = app_state.steam_client.clone();
        thread::spawn(move || {
        while shutdown_rx.try_recv().is_err() {
        client_for_loop.run_callbacks();
        thread::sleep(Duration::from_millis(10));
        }
        log::info!("Steam 回调线程已关闭。");
        });

        let app = tauri::Builder::default()
        .setup(|app| {
        *LOGGER.app_handle.lock() = Some(app.handle().clone());
        Ok(())
        })
        .manage(app_state.clone())
        .invoke_handler(tauri::generate_handler![
        steam_commands::get_friends,
        steam_commands::create_lobby,
        steam_commands::search_lobbies,
        steam_commands::join_lobby,
        steam_commands::connect_to_host,
        steam_commands::leave_lobby,
        steam_commands::start_hosting,
        steam_commands::stop_hosting,
        steam_commands::send_invite,
        steam_commands::get_lobby_members,
        steam_commands::get_network_status,
        open_log_window,
        get_log_history,
        get_memory_usage
        ])
        .build(tauri::generate_context!())
        .expect("构建 Tauri 应用时出错");

        app.run(|_app_handle, event| match event {
        tauri::RunEvent::ExitRequested { api, .. } => {
        log::info!("收到 Tauri 退出请求。正在清理网络任务...");
        api.prevent_exit();
        log::info!("应用程序即将退出。");
        std::process::exit(0);
        }
        _ => {}
        });

        log::info!("Tauri 应用程序已退出。正在清理后台任务...");
        net_manager::stop_network(&app_state);
        drop(shutdown_tx);
        log::info!("清理完成。进程现在应该正常终止。");}
