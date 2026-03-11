use steamworks::networking_sockets::NetConnection;
use steamworks::networking_types::NetworkingConnectionState;
use steamworks::Client;
use steamworks_sys;

pub fn init_relay_network_access() {
    unsafe {
        let utils_ptr = steamworks_sys::SteamAPI_SteamNetworkingUtils_SteamAPI_v004();
        if utils_ptr.is_null() {
            eprintln!("❌ Failed to get SteamNetworkingUtils pointer");
            return;
        }

        let result =
            steamworks_sys::SteamAPI_ISteamNetworkingUtils_InitRelayNetworkAccess(utils_ptr);
        eprintln!("🔌 InitRelayNetworkAccess called - Result: {:?}", result);
    }
}

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

unsafe extern "C" fn steam_networking_debug_output(
    n_type: steamworks_sys::ESteamNetworkingSocketsDebugOutputType,
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
        steamworks_sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Bug
        | steamworks_sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Error => {
            log::error!("[Steam 网络] 🔴 {}", msg);
        }
        steamworks_sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Important
        | steamworks_sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Warning => {
            log::warn!("[Steam 网络] ⚠️ {}", msg);
        }
        steamworks_sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Msg => {
            log::info!("[Steam 网络] ℹ️ {}", msg);
        }
        _ => {
            log::debug!("[Steam 网络] 🔍 {}", msg);
        }
    }
}

pub fn register_debug_callback() {
    unsafe {
        let utils_ptr = steamworks_sys::SteamAPI_SteamNetworkingUtils_SteamAPI_v004();
        if !utils_ptr.is_null() {
            // Set the detail level to Verbose for more detailed troubleshooting info
            steamworks_sys::SteamAPI_ISteamNetworkingUtils_SetDebugOutputFunction(
                utils_ptr,
                steamworks_sys::ESteamNetworkingSocketsDebugOutputType::k_ESteamNetworkingSocketsDebugOutputType_Verbose,
                Some(steam_networking_debug_output),
            );
            log::info!("✅ Steam 网络调试回调已注册 (级别: 详细)");
        } else {
            log::error!("❌ 注册调试回调失败: Utils 指针为空");
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

                // "Current" is ideal.
                if status_str == "Current" {
                    log::info!("✅ 认证已就绪 (Current)！");
                    return true;
                }

                // If it's "Attempting" but we've waited a bit, we might have a cached certificate.
                // Steam sometimes stays in "Attempting" even if it works.
            }
            Err(e) => {
                if check_count == 1 {
                    log::warn!("⚠️ 认证状态查询失败: {:?}", e);
                }
            }
        }

        let elapsed = start.elapsed();
        if elapsed > timeout {
            // Check one last time
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

pub struct ConnectionStats {
    pub ping: i32,
    pub state: NetworkingConnectionState,
    pub connection_type: String,
}

pub fn get_stats_from_handle(
    handle: steamworks_sys::HSteamNetConnection,
) -> Option<ConnectionStats> {
    unsafe {
        let sockets_ptr = steamworks_sys::SteamAPI_SteamNetworkingSockets_SteamAPI_v012();
        let mut status: steamworks_sys::SteamNetConnectionRealTimeStatus_t = std::mem::zeroed();
        let result = steamworks_sys::SteamAPI_ISteamNetworkingSockets_GetConnectionRealTimeStatus(
            sockets_ptr,
            handle,
            &mut status,
            0,
            std::ptr::null_mut(),
        );

        if result == steamworks_sys::EResult::k_EResultOK {
            let mut info: steamworks_sys::SteamNetConnectionInfo_t = std::mem::zeroed();
            steamworks_sys::SteamAPI_ISteamNetworkingSockets_GetConnectionInfo(
                sockets_ptr,
                handle,
                &mut info,
            );

            let desc = std::ffi::CStr::from_ptr(info.m_szConnectionDescription.as_ptr())
                .to_string_lossy()
                .into_owned();

            let state = match info.m_eState {
                steamworks_sys::ESteamNetworkingConnectionState::k_ESteamNetworkingConnectionState_Connecting => NetworkingConnectionState::Connecting,
                steamworks_sys::ESteamNetworkingConnectionState::k_ESteamNetworkingConnectionState_FindingRoute => NetworkingConnectionState::FindingRoute,
                steamworks_sys::ESteamNetworkingConnectionState::k_ESteamNetworkingConnectionState_Connected => NetworkingConnectionState::Connected,
                steamworks_sys::ESteamNetworkingConnectionState::k_ESteamNetworkingConnectionState_ClosedByPeer => NetworkingConnectionState::ClosedByPeer,
                steamworks_sys::ESteamNetworkingConnectionState::k_ESteamNetworkingConnectionState_ProblemDetectedLocally => NetworkingConnectionState::ProblemDetectedLocally,
                _ => NetworkingConnectionState::None,
            };

            return Some(ConnectionStats {
                ping: status.m_nPing,
                state,
                connection_type: desc,
            });
        }
    }
    None
}

pub fn get_connection_handle(conn: &NetConnection) -> steamworks_sys::HSteamNetConnection {
    unsafe {
        // 通过官方接口获取连接信息，从中提取真实的 C++ 句柄
        let sockets_ptr = steamworks_sys::SteamAPI_SteamNetworkingSockets_SteamAPI_v012();

        let ptr = conn as *const NetConnection as *const u32;
        let handle = *ptr as steamworks_sys::HSteamNetConnection;

        for i in 0..4 {
            let trial_handle = *ptr.add(i) as steamworks_sys::HSteamNetConnection;
            if trial_handle > 10000 {
                let mut info: steamworks_sys::SteamNetConnectionInfo_t = std::mem::zeroed();
                if steamworks_sys::SteamAPI_ISteamNetworkingSockets_GetConnectionInfo(
                    sockets_ptr,
                    trial_handle,
                    &mut info,
                ) {
                    return trial_handle;
                }
            }
        }
        handle
    }
}

pub fn set_global_config_value_int32(
    config: steamworks_sys::ESteamNetworkingConfigValue,
    value: i32,
) -> bool {
    unsafe {
        let utils_ptr = steamworks_sys::SteamAPI_SteamNetworkingUtils_SteamAPI_v004();
        if utils_ptr.is_null() {
            return false;
        }

        steamworks_sys::SteamAPI_ISteamNetworkingUtils_SetConfigValue(
            utils_ptr,
            config,
            steamworks_sys::ESteamNetworkingConfigScope::k_ESteamNetworkingConfig_Global,
            0,
            steamworks_sys::ESteamNetworkingConfigDataType::k_ESteamNetworkingConfig_Int32,
            &value as *const i32 as *const _,
        )
    }
}

pub fn get_connection_state(
    conn: &NetConnection,
    steam_client: &Client,
) -> Option<NetworkingConnectionState> {
    let sockets = steam_client.networking_sockets();
    // Use the official API to get state
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

pub fn get_connection_real_time_status(
    conn: &NetConnection,
) -> Option<steamworks_sys::SteamNetConnectionRealTimeStatus_t> {
    unsafe {
        let sockets_ptr = steamworks_sys::SteamAPI_SteamNetworkingSockets_SteamAPI_v012();
        let handle = get_connection_handle(conn);
        let mut status: steamworks_sys::SteamNetConnectionRealTimeStatus_t = std::mem::zeroed();
        let result = steamworks_sys::SteamAPI_ISteamNetworkingSockets_GetConnectionRealTimeStatus(
            sockets_ptr,
            handle,
            &mut status,
            0,
            std::ptr::null_mut(),
        );
        if result == steamworks_sys::EResult::k_EResultOK {
            Some(status)
        } else {
            // 诊断: 打印失败的错误码
            log::warn!(
                "🔴 Steam API GetConnectionRealTimeStatus 失败 - 错误码: {:?}, 句柄: {}",
                result,
                handle
            );
            None
        }
    }
}

pub fn close_connection(handle: steamworks_sys::HSteamNetConnection) {
    unsafe {
        let sockets = steamworks_sys::SteamAPI_SteamNetworkingSockets_SteamAPI_v012();
        steamworks_sys::SteamAPI_ISteamNetworkingSockets_CloseConnection(
            sockets,
            handle,
            0,
            std::ptr::null(),
            false,
        );
    }
}

pub fn accept_connection(handle: steamworks_sys::HSteamNetConnection) {
    unsafe {
        let sockets = steamworks_sys::SteamAPI_SteamNetworkingSockets_SteamAPI_v012();
        steamworks_sys::SteamAPI_ISteamNetworkingSockets_AcceptConnection(sockets, handle);
    }
}

pub fn invite_user_to_lobby(lobby_id: u64, friend_id: u64) -> bool {
    unsafe {
        let mm_ptr = steamworks_sys::SteamAPI_SteamMatchmaking_v009();
        steamworks_sys::SteamAPI_ISteamMatchmaking_InviteUserToLobby(mm_ptr, lobby_id, friend_id)
    }
}

pub fn get_connection_info(
    conn: &NetConnection,
) -> Option<steamworks_sys::SteamNetConnectionInfo_t> {
    unsafe {
        let sockets_ptr = steamworks_sys::SteamAPI_SteamNetworkingSockets_SteamAPI_v012();
        let handle = get_connection_handle(conn);
        let mut info: steamworks_sys::SteamNetConnectionInfo_t = std::mem::zeroed();
        let result = steamworks_sys::SteamAPI_ISteamNetworkingSockets_GetConnectionInfo(
            sockets_ptr,
            handle,
            &mut info,
        );
        if result {
            Some(info)
        } else {
            None
        }
    }
}

pub fn get_connection_type_description(info: &steamworks_sys::SteamNetConnectionInfo_t) -> String {
    use steamworks_sys::{
        k_nSteamNetworkConnectionInfoFlags_Fast, k_nSteamNetworkConnectionInfoFlags_Relayed,
    };

    let flags = info.m_nFlags as u32;

    // Check if relayed (通过 relay 服务器)
    if (flags & k_nSteamNetworkConnectionInfoFlags_Relayed as u32) != 0 {
        return "P2P (Relayed)".to_string();
    }

    // Check if fast (直连 or LAN)
    if (flags & k_nSteamNetworkConnectionInfoFlags_Fast as u32) != 0 {
        return "P2P (Direct)".to_string();
    }

    // Try to parse from description string
    unsafe {
        if let Ok(desc) = std::ffi::CStr::from_ptr(info.m_szConnectionDescription.as_ptr()).to_str()
        {
            if desc.contains("relay") || desc.contains("Relay") {
                return "P2P (Relayed)".to_string();
            }
            if desc.contains("direct") || desc.contains("Direct") {
                return "P2P (Direct)".to_string();
            }
        }
    }

    "P2P (Unknown)".to_string()
}

pub fn get_transport_type_name(transport: u8) -> &'static str {
    match transport {
        0 => "UDP",
        1 => "TCP",
        2 => "WSSD",
        3 => "Force_relay",
        _ => "Unknown",
    }
}

pub fn set_connection_config_value_int32(
    conn: &NetConnection,
    config: steamworks_sys::ESteamNetworkingConfigValue,
    value: i32,
) -> bool {
    unsafe {
        let utils_ptr = steamworks_sys::SteamAPI_SteamNetworkingUtils_SteamAPI_v004();
        let handle = get_connection_handle(conn);
        steamworks_sys::SteamAPI_ISteamNetworkingUtils_SetConnectionConfigValueInt32(
            utils_ptr, handle, config, value,
        )
    }
}

pub fn set_listen_socket_config_value_int32(
    socket: &steamworks::networking_sockets::ListenSocket,
    config: steamworks_sys::ESteamNetworkingConfigValue,
    value: i32,
) -> bool {
    unsafe {
        let utils_ptr = steamworks_sys::SteamAPI_SteamNetworkingUtils_SteamAPI_v004();
        // ListenSocket is a u32 handle in steamworks-rs
        let ptr = socket as *const steamworks::networking_sockets::ListenSocket as *const u8;
        let bytes = std::slice::from_raw_parts(ptr, 4);
        let handle = u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]])
            as steamworks_sys::HSteamListenSocket;

        // Use the generic SetConfigValue
        steamworks_sys::SteamAPI_ISteamNetworkingUtils_SetConfigValue(
            utils_ptr,
            config,
            steamworks_sys::ESteamNetworkingConfigScope::k_ESteamNetworkingConfig_ListenSocket,
            handle as isize,
            steamworks_sys::ESteamNetworkingConfigDataType::k_ESteamNetworkingConfig_Int32,
            &value as *const i32 as *const _,
        )
    }
}
