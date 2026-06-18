use steamworks::networking_types::NetworkingConnectionState;
use steamworks::Client;

// === 底层 sys 调用（steamworks-rs 未封装的安全 API）===

unsafe extern "C" fn steam_networking_debug_output(
    n_type: steamworks::sys::ESteamNetworkingSocketsDebugOutputType,
    psz_msg: *const std::os::raw::c_char,
) {
    let msg = if !psz_msg.is_null() {
        std::ffi::CStr::from_ptr(psz_msg)
            .to_string_lossy()
            .into_owned()
    } else {
        "Unknown".to_string()
    };

    match n_type {
        steamworks::sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Bug
        | steamworks::sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Error => {
            log::error!("[Steam 网络] 🔴 {}", msg);
        }
        steamworks::sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Important
        | steamworks::sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Warning => {
            log::warn!("[Steam 网络] ⚠️ {}", msg);
        }
        steamworks::sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Msg => {
            log::info!("[Steam 网络] ℹ️ {}", msg);
        }
        _ => {
            log::debug!("[Steam 网络] 🔍 {}", msg);
        }
    }
}

pub fn register_debug_callback() {
    unsafe {
        let utils_ptr = steamworks::sys::SteamAPI_SteamNetworkingUtils_SteamAPI_v004();
        if !utils_ptr.is_null() {
            steamworks::sys::SteamAPI_ISteamNetworkingUtils_SetDebugOutputFunction(
                utils_ptr,
                steamworks::sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Verbose,
                Some(steam_networking_debug_output),
            );
            log::info!("✅ Steam 网络调试回调已注册 (级别: 详细)");
        } else {
            log::error!("❌ 注册调试回调失败: Utils 指针为空");
        }
    }
}

// === 官方 API 封装 ===

pub fn init_authentication(client: &Client) {
    let sockets = client.networking_sockets();

    match sockets.init_authentication() {
        Ok(availability) => {
            eprintln!("🔐 初始化认证 - 可用性: {:?}", availability);
            log::info!("🔐 初始化认证 - 可用性: {:?}", availability);
        }
        Err(e) => {
            eprintln!("❌ 初始化认证失败: {:?}", e);
            log::error!("❌ 初始化认证失败: {:?}", e);
        }
    }
}

pub fn check_auth_status(client: &Client) {
    let sockets = client.networking_sockets();

    match sockets.get_authentication_status() {
        Ok(availability) => {
            let status_str = format!("{:?}", availability);
            log::info!("🔐 Steam 认证状态: {}", status_str);

            match status_str.as_str() {
                "Attempting" => {
                    log::warn!("⚠️ 认证正在进行中，Steam 后端正在获取证书...")
                }
                "NeverTried" => {
                    log::error!("❌ 认证从未尝试！需要调用 InitAuthentication()")
                }
                "Waiting" => {
                    log::warn!("⚠️ 认证正在等待依赖资源...")
                }
                "Current" => {
                    log::info!("✅ 认证已准备就绪 (Current)，可以使用 P2P")
                }
                _ => {
                    log::info!("ℹ️ 认证状态: {}", status_str)
                }
            }
        }
        Err(e) => {
            log::warn!("⚠️ 无法查询认证状态: {:?}", e);
        }
    }
}

pub async fn wait_for_auth_ready(client: &Client, timeout_secs: u64) -> bool {
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(timeout_secs);
    let mut last_status = String::new();
    let mut check_count = 0;

    log::info!("🔐 开始认证就绪检查（超时时间: {} 秒）", timeout_secs);

    loop {
        check_count += 1;
        match client.networking_sockets().get_authentication_status() {
            Ok(availability) => {
                let status_str = format!("{:?}", availability);

                if status_str != last_status {
                    log::info!(
                        "🔐 认证状态检查 (第 {} 次) - 状态: {}",
                        check_count,
                        status_str
                    );
                    last_status = status_str.clone();
                }

                if status_str == "Current" {
                    log::info!("✅ 认证已就绪 (Current)！");
                    return true;
                }
            }
            Err(e) => {
                if check_count == 1 {
                    log::warn!("⚠️ 认证状态查询失败: {:?}", e);
                }
            }
        }

        if start.elapsed() > timeout {
            if let Ok(availability) = client.networking_sockets().get_authentication_status() {
                let status_str = format!("{:?}", availability);
                if status_str == "Current" || status_str == "Attempting" {
                    log::info!("⚠️ 认证超时，但状态为 {}，尝试继续...", status_str);
                    return true;
                }
            }
            return false;
        }

        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
}

/// 获取连接状态（封装官方 API，用于轮询等待握手完成）
pub fn get_connection_state(
    conn: &steamworks::networking_sockets::NetConnection,
    steam_client: &Client,
) -> Option<NetworkingConnectionState> {
    let sockets = steam_client.networking_sockets();
    if let Ok(info) = sockets.get_connection_info(conn) {
        if let Ok(state) = info.state() {
            return Some(state);
        }
    }
    None
}

pub fn state_to_string(state: NetworkingConnectionState) -> &'static str {
    match state {
        NetworkingConnectionState::None => "无连接",
        NetworkingConnectionState::Connecting => "连接中",
        NetworkingConnectionState::FindingRoute => "寻找路由",
        NetworkingConnectionState::Connected => "已连接",
        NetworkingConnectionState::ClosedByPeer => "对端关闭",
        NetworkingConnectionState::ProblemDetectedLocally => "本地检测到问题",
    }
}