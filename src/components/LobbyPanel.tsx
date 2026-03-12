import {Check, Copy, LogOut, Terminal, Shield} from "lucide-react"
import {useState} from "react"
import {toast} from "react-hot-toast"
import {useApp} from "../AppContext"

interface Props {
	onDisconnect: () => void
}

export function LobbyPanel({onDisconnect}: Props) {
	const {networkStatus, currentLobbyId, localPort} = useApp()
	const {isHost, isConnected} = networkStatus

	const [copied, setCopied] = useState(false)

	const handleCopy = () => {
		if (!currentLobbyId) {
			toast.error("Lobby ID not available yet.")
			return
		}
		navigator.clipboard.writeText(currentLobbyId)
		setCopied(true)
		toast.success("房间 ID 已复制!")
		setTimeout(() => setCopied(false), 2000)
	}

	return (
		<div className="space-y-8">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-4">
					<div className="relative">
						<div
							className={`w-4 h-4 rounded-full ${
								isConnected ? (isHost ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]" : "bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]") : "bg-slate-600"
							} animate-pulse`}
						></div>
						<div
							className={`absolute inset-0 w-4 h-4 rounded-full ${
								isConnected ? (isHost ? "bg-blue-500" : "bg-emerald-500") : "bg-slate-600"
							} animate-ping opacity-40`}
						></div>
					</div>
					<div>
						<h2 className="text-2xl font-black text-white tracking-tight">
							{isHost ? "正在主持" : (isConnected ? "已建立隧道" : "正在建立...")}
						</h2>
						<p className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold">
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
					<div className="absolute top-0 right-0 p-16 bg-blue-500/5 rounded-full blur-3xl -mr-8 -mt-8 pointer-events-none"></div>
					
					<div className="flex items-center justify-between relative z-10">
						<div className="flex items-center gap-2 text-slate-400">
							<Terminal size={16} className="text-blue-400/70" />
							<span className="text-xs font-bold uppercase tracking-wider">本地隧道终点</span>
						</div>
						<span className="status-badge bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Active</span>
					</div>

					<div className="flex items-center gap-3 relative z-10">
						<div className="flex-1 bg-black/40 px-4 py-3 rounded-xl border border-white/5 font-mono text-emerald-400 text-center text-xl font-bold select-all tracking-tight shadow-inner">
							127.0.0.1:{localPort}
						</div>
					</div>

					<p className="text-xs text-slate-500 leading-relaxed relative z-10 italic">
						{isHost
							? `P2P 隧道已建立。客户端连接上述地址即可直连您的本地服务。`
							: `隧道畅通。请在应用/游戏中连接上述本地代理地址。`}
					</p>
				</div>

				<div className="glass-card p-5 space-y-4 relative overflow-hidden">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2 text-slate-400">
							<Shield size={16} className="text-amber-400/70" />
							<span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">房间凭证</span>
						</div>
					</div>
					
					<div className="flex items-center gap-2">
						<div className="flex-1 bg-slate-950/50 px-4 py-3 rounded-xl border border-white/5 font-mono text-slate-300 text-xs truncate shadow-inner">
							{currentLobbyId || "获取中..."}
						</div>
						<button
							onClick={handleCopy}
							className="btn-secondary h-[42px] w-[42px] p-0 flex-shrink-0 bg-blue-600/10 border-blue-500/20 hover:bg-blue-600 hover:text-white transition-all shadow-lg"
							title="复制ID"
						>
							{copied ? <Check size={24} className="text-emerald-400" /> : <Copy size={24} />}
						</button>
					</div>
				</div>
			</div>

			<button onClick={onDisconnect} className="btn-danger w-full mt-6 shadow-red-500/10 hover:shadow-red-500/20 py-4">
				<LogOut size={20} />
				<span className="text-lg font-bold">{isHost ? "关闭房间" : "断开连接"}</span>
			</button>
		</div>
	)
}

