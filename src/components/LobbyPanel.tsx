import {Check, Copy, LogOut, Shield, Terminal, Users} from "lucide-react";
import {useState} from "react";
import {toast} from "react-hot-toast";
import {useApp} from "../AppContext";
import {ChatBox} from "./ChatBox";

interface Props {
	onDisconnect: () => void;
}

export function LobbyPanel({onDisconnect}: Props) {
	const {networkStatus, currentLobbyId, localPort} = useApp();
	const {isHost, isConnected} = networkStatus;
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		if (!currentLobbyId) {
			toast.error("房间 ID 不可用");
			return;
		}
		navigator.clipboard.writeText(currentLobbyId);
		setCopied(true);
		toast.success("房间 ID 已复制");
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="w-full space-y-6">
			{/* Status header */}
			<div className="flex items-center justify-center gap-3 shrink-0">
				<div className="relative">
					<div
						className={`w-3 h-3 rounded-full ${
							isConnected ? "bg-primary" : "bg-muted-foreground"
						}`}
					/>
					{isConnected && (
						<div className="absolute inset-0 w-3 h-3 rounded-full bg-primary animate-ping opacity-40" />
					)}
				</div>
				<span className="text-sm font-medium text-muted-foreground">
					{isHost ? "房主" : "成员"} · {isConnected ? "已连接" : "连接中..."}
				</span>
			</div>

			{/* Left: info cards + Right: chat */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:items-stretch">
				{/* Left column */}
				<div className="flex flex-col gap-4">
					{/* Tunnel endpoint */}
					<div className="pt-4 pb-8 px-6 rounded-2xl bg-muted/30 border border-border flex-1 flex flex-col">
						<div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-bold">
							<Terminal className="w-4 h-4" />
							本地隧道终点
						</div>
						<div className="flex-1 flex flex-col items-center justify-center gap-4">
							<div className="flex items-center gap-2 w-full max-w-md">
								<div className="flex-1 px-4 py-3 rounded-xl bg-card border border-border font-mono text-xl font-bold text-foreground text-center truncate">
									127.0.0.1:{localPort}
								</div>
								<button
									onClick={() => {
										navigator.clipboard.writeText(`127.0.0.1:${localPort}`);
										toast.success("地址已复制");
									}}
									className="w-12 h-12 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors active:scale-95 shrink-0"
									title="复制地址"
								>
									<Copy className="w-5 h-5" />
								</button>
							</div>
							<p className="text-xs text-muted-foreground text-center">
								{isHost
									? "客户端连接上述地址即可访问您的本地服务"
									: "请在应用/游戏中连接上述本地代理地址"}
							</p>
						</div>
					</div>

					{/* Lobby ID */}
					<div className="py-8 px-6 rounded-2xl bg-muted/30 border border-border space-y-3">
						<div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-bold">
							<Shield className="w-4 h-4" />
							房间凭证
						</div>
						<div className="flex items-center gap-2">
							<div className="flex-1 px-4 py-3 rounded-xl bg-card border border-border font-mono text-sm text-foreground truncate">
								{currentLobbyId || "获取中..."}
							</div>
							<button
								onClick={handleCopy}
								className="w-12 h-12 flex items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors active:scale-95"
								title="复制 ID"
							>
								{copied ? (
									<Check className="w-5 h-5" />
								) : (
									<Copy className="w-5 h-5" />
								)}
							</button>
						</div>
					</div>

					{/* Members mini preview */}
					<div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
						<Users className="w-4 h-4" />
						<span>成员列表在右侧抽屉中查看</span>
					</div>

					{/* Disconnect */}
					<button
						onClick={onDisconnect}
						className="w-full h-12 rounded-2xl border border-destructive/30 text-destructive font-bold hover:bg-destructive/10 transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
					>
						<LogOut className="w-4 h-4" />
						{isHost ? "关闭房间" : "断开连接"}
					</button>
				</div>

				{/* Right column: Chat */}
				<ChatBox />
			</div>
		</div>
	);
}
