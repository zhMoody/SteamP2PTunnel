// src/App.tsx

import {invoke} from "@tauri-apps/api/core";
import {motion} from "framer-motion";
import {Bell, LogOut, Terminal, UserPlus, Users, Wifi, X} from "lucide-react";
import {useEffect, useState} from "react";
import {toast, Toaster} from "react-hot-toast";
import {useApp} from "./AppContext";
import {ConnectionPanel} from "./components/ConnectionPanel";
import {FriendList} from "./components/FriendList";
import {LobbyPanel} from "./components/LobbyPanel";
import {MemberList} from "./components/MemberList";
import {TitleBar} from "./components/TitleBar";
import {JoinLobbyResult} from "./types";

function App() {
	const {
		networkStatus,
		localPort,
		setCurrentLobbyId,
		currentLobbyId,
		pendingInvite,
		richPresenceJoin,
		clearPendingInvite,
		clearRichPresenceJoin,
		refreshStatus,
		hydrated
	} = useApp();
	const {isConnected, statusMessage} = networkStatus;

	const [showFriends, setShowFriends] = useState(false);
	const [showMembers, setShowMembers] = useState(false);
	const [joining, setJoining] = useState(false);

	const doJoinLobby = async (lobbyId: string, friendName: string) => {
		setJoining(true);
		const toastId = "join";
		try {
			toast.loading(`正在加入 ${friendName} 的房间...`, {id: toastId});
			const result = await invoke<JoinLobbyResult>("join_lobby", {
				lobbyIdStr: lobbyId
			});
			toast.loading("正在建立 P2P 隧道...", {id: toastId});
			await invoke("connect_to_host", {
				hostIdStr: result.host_id,
				localPort: localPort
			});
			toast.success("隧道已打通!", {id: toastId});
			setCurrentLobbyId(result.lobby_id);
			await refreshStatus();
		} catch (e: any) {
			const msg = typeof e === "string" ? e : e.message || JSON.stringify(e);
			toast.error("加入失败: " + msg, {id: toastId});
		} finally {
			setJoining(false);
		}
	};

	useEffect(() => {
		if (!richPresenceJoin || currentLobbyId) return;
		const {lobby_id, friend_name} = richPresenceJoin;
		clearRichPresenceJoin();
		doJoinLobby(lobby_id, friend_name);
	}, [richPresenceJoin]);

	const handleAcceptInvite = () => {
		if (!pendingInvite) return;
		const {lobby_id, friend_name} = pendingInvite;
		// 先关闭 Modal，再异步加入
		setJoining(true);
		clearPendingInvite();
		doJoinLobby(lobby_id, friend_name);
	};

	const handleDeclineInvite = () => {
		clearPendingInvite();
	};

	const handleDisconnect = async () => {
		try {
			await invoke("leave_lobby");
			setCurrentLobbyId(null);
			toast.success("已断开连接");
			setShowFriends(false);
			setShowMembers(false);
		} catch (e) {
			toast.error("断开失败: " + String(e));
		}
	};

	const isInLobby = !!currentLobbyId;

	return (
		<div className="h-screen w-screen flex flex-col font-sans select-none overflow-hidden bg-background text-foreground">
			<TitleBar />
			<Toaster
				position="top-center"
				toastOptions={{
					duration: 3000,
					style: {
						background: "rgb(var(--card))",
						color: "rgb(var(--foreground))",
						border: "1px solid rgb(var(--border) / 0.6)",
						borderRadius: "14px",
						padding: "14px 20px",
						fontSize: "14px",
						fontWeight: 500,
						boxShadow: "0 12px 40px rgba(0,0,0,0.25)"
					}
				}}
			/>

			{/* Invite Modal - 始终显示，已在房间时提示先离开 */}
			{pendingInvite && (
				<div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/70 backdrop-blur-md">
					<div className="w-full max-w-sm mx-4 p-6 rounded-3xl bg-card border border-border shadow-2xl space-y-5">
						<div className="flex items-center gap-4">
							<div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
								<Bell className="w-6 h-6 text-primary" />
							</div>
							<div>
								<h3 className="text-lg font-black text-foreground">
									{currentLobbyId ? "收到邀请（已在房间中）" : "收到邀请"}
								</h3>
								<p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">
									来自 Steam 好友
								</p>
							</div>
						</div>

						<div className="p-4 rounded-2xl bg-muted/50 border border-border space-y-2">
							<div className="flex justify-between">
								<span className="text-xs text-muted-foreground">好友</span>
								<span className="text-sm font-bold text-foreground">
									{pendingInvite.friend_name}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-xs text-muted-foreground">房间</span>
								<span className="font-mono text-xs text-muted-foreground">
									{pendingInvite.lobby_id}
								</span>
							</div>
						</div>

						{currentLobbyId ? (
							<div className="space-y-3">
								<p className="text-xs text-muted-foreground text-center">
									你需要先断开当前房间才能加入新的邀请
								</p>
								<div className="flex gap-3">
									<button
										onClick={handleDeclineInvite}
										className="flex-1 h-12 rounded-xl border border-border text-muted-foreground font-bold hover:bg-muted transition-colors"
									>
										忽略
									</button>
									<button
										onClick={async () => {
											const invite = pendingInvite!;
											clearPendingInvite();
											await handleDisconnect();
											doJoinLobby(invite.lobby_id, invite.friend_name);
										}}
										className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors"
									>
										离开并加入
									</button>
								</div>
							</div>
						) : (
							<div className="flex gap-3">
								<button
									onClick={handleDeclineInvite}
									className="flex-1 h-12 rounded-xl border border-destructive/20 text-destructive font-bold hover:bg-destructive/10 transition-colors"
								>
									拒绝
								</button>
								<button
									onClick={handleAcceptInvite}
									disabled={joining}
									className="flex-1 h-12 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
								>
									{joining ? "加入中..." : "接受"}
								</button>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Top Bar */}
			<header className="h-16 border-b border-border/50 flex items-center justify-between px-6 shrink-0 relative z-50 bg-card/30">
				<div
					data-tauri-drag-region
					className="absolute inset-0 z-0 cursor-default"
				></div>
				<div className="flex items-center gap-3 pointer-events-none relative z-10">
					<div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
						<Wifi className="w-5 h-5 text-primary-foreground" />
					</div>
					<div>
						<h1 className="text-sm font-black text-foreground tracking-tight uppercase">
							Steam P2P Tunnel
						</h1>
						<div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
							<span
								className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-primary" : "bg-muted-foreground"}`}
							></span>
							<span className="truncate max-w-[160px]">{statusMessage}</span>
						</div>
					</div>
				</div>
				<div className="flex items-center gap-2 relative z-20">
					{isInLobby && (
						<button
							onClick={() => setShowMembers(true)}
							className="flex items-center gap-2 h-10 px-4 rounded-xl bg-muted border border-border text-xs font-bold text-foreground hover:bg-muted/80 transition-colors"
						>
							<Users className="w-4 h-4" />
							成员
						</button>
					)}
					<button
						onClick={() => invoke("open_log_window")}
						className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
					>
						<Terminal className="w-4 h-4" />
					</button>
				</div>
			</header>

			{/* Main Content */}
			<main className="flex-1 flex flex-col items-center p-4 md:p-6 pb-12 overflow-y-auto overflow-x-hidden relative">
				{/* 柔和背景光晕 */}
				<div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[300px] rounded-full bg-primary/5 blur-[100px] pointer-events-none" />
				<div className="absolute bottom-1/4 right-1/4 w-[250px] h-[250px] rounded-full bg-primary/[0.03] blur-[80px] pointer-events-none" />

				<div className={`w-full ${isInLobby ? "max-w-4xl" : "max-w-md"}`}>
					{!hydrated ? (
						<div className="flex items-center justify-center h-[300px] text-xs text-muted-foreground">
							正在恢复上一次会话...
						</div>
					) : !isInLobby ? (
						<ConnectionPanel />
					) : (
						<LobbyPanel onDisconnect={handleDisconnect} />
					)}
				</div>

				{/* Quick action for inviting friends when in lobby */}
				{isInLobby && (
					<motion.button
						initial={{opacity: 0, y: 20}}
						animate={{opacity: 1, y: 0}}
						className="fixed bottom-6 right-6 h-14 px-6 rounded-full bg-primary text-primary-foreground font-bold shadow-xl flex items-center gap-2 hover:bg-primary/90 transition-colors active:scale-95 z-30"
						onClick={() => setShowFriends(true)}
					>
						<UserPlus className="w-5 h-5" />
						邀请好友
					</motion.button>
				)}
			</main>

			<FriendList isOpen={showFriends} onClose={() => setShowFriends(false)} />

			{/* Members Sheet */}
			{showMembers && (
				<>
					<div
						className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[150]"
						onClick={() => setShowMembers(false)}
					/>
					<div className="fixed bottom-0 left-0 right-0 md:top-0 md:right-0 md:left-auto md:h-full md:w-[480px] max-h-[70vh] md:max-h-none bg-card border-t md:border-t-0 md:border-l border-border rounded-t-3xl md:rounded-none shadow-2xl z-[160] p-6 flex flex-col">
						<div className="flex items-center justify-between mb-5">
							<div className="flex items-center gap-2">
								<Users className="w-5 h-5 text-primary" />
								<h2 className="font-bold text-foreground">房间成员</h2>
							</div>
							<button
								onClick={() => setShowMembers(false)}
								className="p-2 rounded-lg hover:bg-muted transition-colors"
							>
								<X className="w-4 h-4 text-muted-foreground" />
							</button>
						</div>
						<div className="flex-1 overflow-y-auto custom-scrollbar">
							<MemberList />
						</div>
						<button
							onClick={handleDisconnect}
							className="mt-4 w-full h-12 rounded-xl border border-destructive/30 text-destructive font-bold hover:bg-destructive/10 transition-colors flex items-center justify-center gap-2"
						>
							<LogOut className="w-4 h-4" />
							断开连接
						</button>
					</div>
				</>
			)}
		</div>
	);
}

export default App;
