import {Check, Copy, LogOut, Shield, Terminal} from "lucide-react";
import {useState} from "react";
import {toast} from "react-hot-toast";
import {useApp} from "../AppContext";

interface Props {
	onDisconnect: () => void;
}

export function LobbyPanel({onDisconnect}: Props) {
	const {networkStatus, currentLobbyId, localPort} = useApp();
	const {isHost, isConnected} = networkStatus;

	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		if (!currentLobbyId) {
			toast.error("Lobby ID not available yet.");
			return;
		}
		navigator.clipboard.writeText(currentLobbyId);
		setCopied(true);
		toast.success("房间 ID 已复制!");
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<div className="relative">
						<div
							className={`w-4 h-4 rounded-full ${
								isConnected
									? isHost
										? "bg-primary shadow-[0_0_12px_rgba(76,175,80,0.5)]"
										: "bg-primary shadow-[0_0_12px_rgba(76,175,80,0.5)]"
									: "bg-muted-foreground"
							} animate-pulse`}
						></div>
						<div
							className={`absolute inset-0 w-4 h-4 rounded-full ${
								isConnected
									? isHost
										? "bg-primary"
										: "bg-primary"
									: "bg-muted-foreground"
							} animate-ping opacity-40`}
						></div>
					</div>
					<div>
						<h2 className="text-2xl font-black text-foreground tracking-tight">
							{isHost ? "正在主持" : isConnected ? "已建立隧道" : "正在建立..."}
						</h2>
						<p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-bold">
							Steam P2P Network Session
						</p>
					</div>
				</div>
			</div>

			{/* <div className="grid grid-cols-2 gap-4">
				<div className="bg-slate-900/50 rounded-2xl p-4 border border-white/5 flex flex-col gap-1 shadow-inner">
					<div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-bold tracking-widest">
						<Activity size={12} className="text-blue-400" />
						实时延迟
					</div>
					<div className={`text-xl font-mono font-bold ${ping < 0 ? 'text-slate-600' : (ping < 100 ? 'text-emerald-400' : 'text-amber-400')}`}>
						{ping < 0 ? '-- ms' : `${ping} ms`}
					</div>
				</div>
				<div className="bg-slate-900/50 rounded-2xl p-4 border border-white/5 flex flex-col gap-1 shadow-inner">
					<div className="flex items-center gap-1.5 text-[10px] text-slate-500 uppercase font-bold tracking-widest">
						<Network size={12} className="text-purple-400" />
						连接质量
					</div>
					<div className="text-sm font-bold text-slate-300 truncate" title={connectionType}>
						{isConnected ? connectionType.split(' ')[0] : '测速中...'}
					</div>
				</div>
			</div> */}

			<div className="space-y-4">
				<div className="glass-card p-5 space-y-4 relative overflow-hidden group">
					<div className="absolute top-0 right-0 p-16 bg-primary/5 rounded-full blur-3xl -mr-8 -mt-8 pointer-events-none"></div>

					<div className="flex items-center justify-between relative z-10">
						<div className="flex items-center gap-2 text-muted-foreground">
							<Terminal size={16} className="text-primary/70" />
							<span className="text-xs font-bold uppercase tracking-wider">
								本地隧道终点
							</span>
						</div>
						<span className="status-badge bg-primary/10 text-primary border-primary/20">
							Active
						</span>
					</div>

					<div className="flex items-center gap-3 relative z-10">
						<div className="flex-1 bg-background/40 px-4 py-3 rounded-xl border border-border/50 font-mono text-primary text-center text-xl font-bold select-all tracking-tight shadow-inner">
							127.0.0.1:{localPort}
						</div>
					</div>

					<p className="text-xs text-muted-foreground leading-relaxed relative z-10 italic">
						{isHost
							? `P2P 隧道已建立。客户端连接上述地址即可直连您的本地服务。`
							: `隧道畅通。请在应用/游戏中连接上述本地代理地址。`}
					</p>
				</div>

				<div className="glass-card p-5 space-y-4 relative overflow-hidden">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 text-muted-foreground">
							<Shield size={16} className="text-accent-foreground/70" />
							<span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
								房间凭证
							</span>
						</div>
					</div>

					<div className="flex items-center gap-2">
						<div className="flex-1 bg-background/50 px-4 py-3 rounded-xl border border-border/50 font-mono text-foreground text-xs truncate shadow-inner">
							{currentLobbyId || "获取中..."}
						</div>
						<button
							onClick={handleCopy}
							className="btn-secondary h-[42px] w-[42px] p-0 flex-shrink-0 bg-primary/10 border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all shadow-lg"
							title="复制ID"
						>
							{copied ? (
								<Check size={24} className="text-primary" />
							) : (
								<Copy size={24} />
							)}
						</button>
					</div>
				</div>
			</div>

			<button
				onClick={onDisconnect}
				className="btn-danger w-full mt-6 shadow-red-500/10 hover:shadow-red-500/20 py-4"
			>
				<LogOut size={20} />
				<span className="text-lg font-bold">
					{isHost ? "关闭房间" : "断开连接"}
				</span>
			</button>
		</div>
	);
}
