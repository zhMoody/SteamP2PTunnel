# 开发进度记录 - 2024-03-21 (Steam P2P Tunnel)

## 今日完成功能

### 1. Steam 邀请自动处理 (核心修复)
- **监听加入请求**：在 Rust 后端实现了 `GameLobbyJoinRequested` 和 `GameRichPresenceJoinRequested` 回调。
- **前端自动加入**：前端监听到 `steam-join-lobby` 事件后，会自动执行“退出旧房间 -> 加入新房间 -> 建立 P2P 隧道”的流程，无需手动输入房间号。
- **启动参数支持**：支持 Steam 启动参数 `+connect_lobby <id>`。当用户通过 Steam 邀请链接启动应用时，程序会自动延迟 2 秒（等待 UI 加载完毕）并触发加入逻辑。

### 2. UI 实时同步与优化
- **成员列表即时刷新**：实现了 `LobbyChatUpdate` 回调。当房间内有成员加入或离开时，后端会立即通过 `steam-lobby-update` 通知前端，前端 `MemberList` 组件会瞬间刷新，不再纯依赖轮询。
- **好友状态实时显示**：
    - 修复了好友在线状态显示为静态文本的问题。
    - 在 `FriendList` 中增加了 3 秒一次的轮询，实时显示好友的 `Online`/`Offline` 状态。
    - **新增“已加入”状态**：如果好友已在当前房间，状态会显示为蓝色的“已加入房间 (Joined)”并自动置顶。
- **自动化布局**：当房主创建房间后，UI 会自动展开“好友列表”侧边栏，方便快速邀请。

### 3. 关键 Bug 修复 (Backend & Frontend)
- **回调句柄失效修复**：在 `AppState` 中增加了 `callback_handles` 容器。修复了之前 Steam 回调函数被 Rust 编译器过早释放导致“没反应”的问题。
- **初始化顺序修复**：将所有 Steam 回调注册移入 Tauri 的 `setup` 块中。解决了回调函数在触发时因为无法获取有效的 `AppHandle` 而无法通知 UI 的问题。
- **TypeScript 编译修复**：
    - 修复了 `src/App.tsx` 中缺失的 `useEffect` 导入。
    - 修复了 `src/types.ts` 中错误的 `bool` 类型（更正为 `boolean`）。

## 当前代码结构
- **后端**：
    - `src-tauri/src/main.rs`: 负责 Tauri 启动、Steam 回调注册及事件转发。
    - `src-tauri/src/app_state.rs`: 增加了 `callback_handles` 字段。
    - `src-tauri/src/steam_commands.rs`: 更新了 `get_friends` 逻辑以包含在线状态和房间成员检测。
- **前端**：
    - `src/AppContext.tsx`: 核心逻辑监听器，处理自动加入逻辑。
    - `src/components/FriendList.tsx`: 状态轮询及 UI 展示。
    - `src/components/MemberList.tsx`: 监听成员变动事件。

## 待办事项 / 明日计划
- [ ] 测试在高延迟网络下的自动加入稳定性。
- [ ] 考虑增加“手动刷新好友列表”按钮。
- [ ] 检查 `tauri-plugin-single-instance` 插件，确保多开应用时能正确重定向启动参数。
