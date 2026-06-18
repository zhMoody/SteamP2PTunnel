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
use steamworks::networking_types::{NetConnectionStatusChanged, NetworkingConnectionState};
use steamworks::{
    ChatMemberStateChange, GameLobbyJoinRequested, GameRichPresenceJoinRequested,
    LobbyChatUpdate, LobbyCreated, LobbyEnter,
};
// use steamworks_sys; — now via steamworks::sys with raw-bindings feature
use sysinfo::{Pid, System};
use tauri::{AppHandle, Emitter, Manager};

// --- 全局系统信息实例 ---
static SYS_INFO: LazyLock<Mutex<System>> = LazyLock::new(|| Mutex::new(System::new_all()));

#[derive(Serialize, Clone)]
struct LogPayload {
    message: String,
    level: String,
}

// 前端事件 payload：收到邀请
#[derive(Serialize, Clone)]
struct InviteReceivedPayload {
    lobby_id: String,
    friend_id: String,
    friend_name: String,
}

// 前端事件 payload：大厅成员变更
#[derive(Serialize, Clone)]
struct LobbyMemberChangePayload {
    user_id: String,
    // "entered" / "left" / "disconnected" / "kicked" / "banned"
    change: String,
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
        .decorations(false)
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
        // sysinfo v0.29+ 返回的是 bytes
        let memory_bytes = process.memory();
        // 转换为 MB
        let memory_mb = memory_bytes as f64 / 1024.0 / 1024.0;
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

    // 初始化中继网络访问
    log::info!("初始化 Steam Relay Network Access...");
    app_state.steam_client.networking_utils().init_relay_network_access();

    // 全局配置设置后重新初始化认证，确保使用最新配置
    log::info!("初始化 Steam 认证...");
    steam_utils::init_authentication(&app_state.steam_client);

    // Wait a bit more for SDR to initialize before allowing any UI action
    thread::sleep(Duration::from_secs(2));

    // Check initial status
    steam_utils::check_auth_status(&app_state.steam_client);
    // -------------------------------

    let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();
    let connections = app_state.connections.clone();
    let client = app_state.steam_client.clone();

    client.register_callback(move |event: NetConnectionStatusChanged| {
        let remote_id = event.connection_info.identity_remote()
            .and_then(|id| id.steam_id());

        match event.connection_info.state() {
        Ok(NetworkingConnectionState::Connecting) => {
            log::info!("P2P 正在连接: {:?}", remote_id);
        }
        Ok(NetworkingConnectionState::Connected) => {
            log::info!("P2P 已连接: SteamId={:?}", remote_id);
        }
        Ok(NetworkingConnectionState::ClosedByPeer)
        | Ok(NetworkingConnectionState::ProblemDetectedLocally) => {
            if let Some(id) = remote_id {
                log::info!("P2P 连接已关闭: SteamId={}, 结束原因={:?}", id.raw(), event.connection_info.end_reason());
                let removed = connections.lock().remove(&id);
                log::info!("📤 已从连接表移除: SteamId={}, 实际移除={}", id.raw(), removed.is_some());
            }
        }
        _ => {}
        }
        });

    // Steam 好友通过"加入游戏"直接加入（无需弹窗，自动加入）
    let client_for_rich_join = app_state.steam_client.clone();
    app_state.steam_client.register_callback(move |join: GameRichPresenceJoinRequested| {
        let lobby_id_str = join.connect.clone();
        let friend_id_str = join.friend_steam_id.raw().to_string();
        let friend_name = client_for_rich_join.friends().get_friend(join.friend_steam_id).name();
        log::info!(
            "🎮 Steam 好友 {} 通过 Rich Presence 加入，大厅={}",
            friend_name,
            lobby_id_str
        );
        if let Some(handle) = LOGGER.app_handle.lock().as_ref() {
            let _ = handle.emit(
                "rich-presence-join",
                InviteReceivedPayload {
                    lobby_id: lobby_id_str,
                    friend_id: friend_id_str,
                    friend_name,
                },
            );
        }
    });

    // Steam 大厅邀请（弹出对话框让用户决定）
    let client_for_lobby_invite = app_state.steam_client.clone();
    app_state.steam_client.register_callback(move |invite: GameLobbyJoinRequested| {
        let lobby_id_str = invite.lobby_steam_id.raw().to_string();
        let friend_id_str = invite.friend_steam_id.raw().to_string();
        let friend_name = client_for_lobby_invite.friends().get_friend(invite.friend_steam_id).name();
        log::info!(
            "📨 收到大厅邀请：大厅={}，好友={}",
            lobby_id_str,
            friend_name
        );
        if let Some(handle) = LOGGER.app_handle.lock().as_ref() {
            let _ = handle.emit(
                "invite-received",
                InviteReceivedPayload {
                    lobby_id: lobby_id_str,
                    friend_id: friend_id_str,
                    friend_name,
                },
            );
        }
    });

    // 大厅创建结果
    app_state.steam_client.register_callback(move |created: LobbyCreated| {
        match created.result {
            Ok(()) => {
                log::info!("✅ 大厅已创建: {}", created.lobby.raw());
            }
            Err(_) => {
                log::error!("❌ 大厅创建失败，大厅 ID: {}", created.lobby.raw());
            }
        }
    });

    // 进入大厅通知（创建/加入/被邀请加入成功后触发）
    app_state.steam_client.register_callback(move |enter: LobbyEnter| {
        let response_str = format!("{:?}", enter.chat_room_enter_response);
        log::info!(
            "🚪 已进入大厅: {} (响应: {})",
            enter.lobby.raw(),
            response_str
        );
        if let Some(handle) = LOGGER.app_handle.lock().as_ref() {
            let _ = handle.emit(
                "lobby-entered",
                serde_json::json!({
                    "lobby_id": enter.lobby.raw().to_string(),
                    "response": response_str,
                }),
            );
        }
    });

    // 大厅成员进出通知
    app_state.steam_client.register_callback(move |update: LobbyChatUpdate| {
        let change_str = match update.member_state_change {
            ChatMemberStateChange::Entered => "entered",
            ChatMemberStateChange::Left => "left",
            ChatMemberStateChange::Disconnected => "disconnected",
            ChatMemberStateChange::Kicked => "kicked",
            ChatMemberStateChange::Banned => "banned",
        };
        log::info!(
            "👥 大厅成员变更: {:?} {} — {}",
            update.user_changed,
            change_str,
            update.lobby.raw()
        );
        if let Some(handle) = LOGGER.app_handle.lock().as_ref() {
            let _ = handle.emit(
                "lobby-member-changed",
                LobbyMemberChangePayload {
                    user_id: update.user_changed.raw().to_string(),
                    change: change_str.to_string(),
                },
            );
        }
    });

        let client_for_loop = app_state.steam_client.clone();
        thread::spawn(move || {
        while shutdown_rx.try_recv().is_err() {
        client_for_loop.run_callbacks();
        thread::sleep(Duration::from_secs(1));
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
        tauri::RunEvent::ExitRequested { .. } => {
        log::info!("收到 Tauri 退出请求。正在清理网络任务...");
        }
        _ => {}
        });

        log::info!("Tauri 应用程序已退出。正在清理后台任务...");
        net_manager::stop_network(&app_state);
        drop(shutdown_tx);
        log::info!("清理完成。进程现在应该正常终止。");}
