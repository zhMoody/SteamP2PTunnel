import {invoke} from "@tauri-apps/api/core";
import {Gamepad2, Link2, Plus} from "lucide-react";
import {useState} from "react";
import {toast} from "react-hot-toast";
import {useApp} from "../AppContext";
import {JoinLobbyResult} from "../types";

export function ConnectionPanel() {
	const {localPort, setLocalPort, setCurrentLobbyId, refreshStatus} = useApp();
	const [lobbyIdInput, setLobbyIdInput] = useState(
		() => localStorage.getItem("mcct_last_lobby_id") || ""
	);
	const [loading, setLoading] = useState<"host" | "join" | null>(null);

	const handleCreateLobby = async () => {
		setLoading("host");
		const toastId = "create-lobby";
		try {
			toast.loading("创建 Steam 房间...", {id: toastId});
			const id = await invoke<string>("create_lobby");
			toast.loading("启动 P2P 监听...", {id: toastId});
			await invoke("start_hosting", {localPort});
			toast.success("房间创建成功", {icon: "🎮", id: toastId});
			setCurrentLobbyId(id);
			await refreshStatus();
		} catch (e: any) {
			toast.error(
				"创建失败: " +
					(typeof e === "string" ? e : e.message || JSON.stringify(e)),
				{id: toastId}
			);
		} finally {
			setLoading(null);
		}
	};

	const handleJoinLobby = async () => {
		if (!lobbyIdInput) {
			toast.error("请输入房间 ID");
			return;
		}
		localStorage.setItem("mcct_last_lobby_id", lobbyIdInput);
		setLoading("join");
		const toastId = "join-lobby";
		try {
			toast.loading("加入 Steam 房间...", {id: toastId});
			const result = await invoke<JoinLobbyResult>("join_lobby", {
				lobbyIdStr: lobbyIdInput
			});
			toast.loading("建立 P2P 隧道...", {id: toastId});
			await invoke("connect_to_host", {hostIdStr: result.host_id, localPort});
			toast.success("隧道已打通", {icon: "🚀", id: toastId});
			setCurrentLobbyId(result.lobby_id);
			await refreshStatus();
		} catch (e: any) {
			const msg = typeof e === "string" ? e : e.message || JSON.stringify(e);
			toast.error(msg.includes("timed out") ? "连接超时" : "加入失败: " + msg, {
				id: toastId
			});
		} finally {
			setLoading(null);
		}
	};

	return (
		<div className="w-full space-y-6">
			<div className="space-y-1">
				<label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-2">
					本地服务端口
				</label>
				<div className="relative">
					<Gamepad2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
					<input
						type="number"
						value={localPort}
						onChange={(e) => setLocalPort(parseInt(e.target.value, 10) || 0)}
						className="w-full h-14 pl-12 pr-4 text-lg font-mono font-semibold bg-muted/30 border border-border rounded-2xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all text-center"
						placeholder="25565"
					/>
				</div>
			</div>

			<div className="grid grid-cols-2 gap-3">
				<button
					onClick={handleCreateLobby}
					disabled={loading !== null}
					className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-[0.98] disabled:opacity-50"
				>
					<div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
						<Plus className="w-5 h-5 text-primary" />
					</div>
					<span className="font-bold text-foreground text-sm">
						{loading === "host" ? "创建中..." : "创建房间"}
					</span>
					<span className="text-[10px] text-muted-foreground">作为房主</span>
				</button>

				<button
					onClick={handleJoinLobby}
					disabled={loading !== null}
					className="group flex flex-col items-center gap-3 p-5 rounded-2xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-[0.98] disabled:opacity-50"
				>
					<div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
						<Link2 className="w-5 h-5 text-primary" />
					</div>
					<span className="font-bold text-foreground text-sm">
						{loading === "join" ? "加入中..." : "加入房间"}
					</span>
					<span className="text-[10px] text-muted-foreground">需要房间 ID</span>
				</button>
			</div>

			<div className="space-y-1">
				<label className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] ml-2">
					房间 ID
				</label>
				<div className="relative">
					<Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
					<input
						type="text"
						value={lobbyIdInput}
						onChange={(e) => setLobbyIdInput(e.target.value)}
						className="w-full h-12 pl-11 pr-4 text-sm font-mono bg-muted/30 border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all"
						placeholder="粘贴房主提供的房间 ID"
					/>
				</div>
			</div>

			<p className="text-[11px] text-muted-foreground text-center leading-relaxed">
				创建房间后可邀请好友加入，对方通过房间 ID 即可连接。
			</p>
		</div>
	);
}
