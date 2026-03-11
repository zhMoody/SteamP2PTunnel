import {Check, Copy, LogOut, Activity, Network} from "lucide-react"
import {useState} from "react"
import {toast} from "react-hot-toast"
import {useApp} from "../AppContext"

interface Props {
	onDisconnect: () => void
}

export function LobbyPanel({onDisconnect}: Props) {
	const {networkStatus, currentLobbyId, localPort} = useApp()
	const {isHost, ping, connectionType, isConnected} = networkStatus

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
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-3">
					<div className="relative">
						<div
							className={`w-3 h-3 rounded-full ${
								isConnected ? (isHost ? "bg-blue-500" : "bg-green-500") : "bg-slate-500"
							} animate-pulse`}
						></div>
						<div
							className={`absolute inset-0 w-3 h-3 rounded-full ${
								isConnected ? (isHost ? "bg-blue-500" : "bg-green-500") : "bg-slate-500"
							} animate-ping opacity-75`}
						></div>
					</div>
					<h2 className="text-xl font-bold text-white">
						{isHost ? "正在主持" : (isConnected ? "已建立隧道" : "正在建立...")}
					</h2>
				</div>
				{isHost && (
					<button
						onClick={handleCopy}
						className="btn-secondary text-xs flex items-center gap-1.5"
					>
						{copied ? <Check size={14} /> : <Copy size={14} />}
						<span>{copied ? "已复制" : "复制ID"}</span>
					</button>
				)}
			</div>

			<div className="grid grid-cols-2 gap-3">
				<div className="bg-slate-900/50 rounded-xl p-3 border border-white/5 flex flex-col gap-1">
					<div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase font-bold tracking-wider">
						<Activity size={12} />
						实时延迟
					</div>
					<div className={`text-lg font-mono font-bold ${ping < 0 ? 'text-slate-600' : (ping < 100 ? 'text-green-400' : 'text-yellow-400')}`}>
						{ping < 0 ? '-- ms' : `${ping} ms`}
					</div>
				</div>
				<div className="bg-slate-900/50 rounded-xl p-3 border border-white/5 flex flex-col gap-1">
					<div className="flex items-center gap-1.5 text-xs text-slate-500 uppercase font-bold tracking-wider">
						<Network size={12} />
						连接质量
					</div>
					<div className="text-sm font-medium text-slate-300 truncate" title={connectionType}>
						{isConnected ? connectionType.split(' ')[0] : '测速中...'}
					</div>
				</div>
			</div>

			<div className="bg-slate-950/30 rounded-lg p-4 border border-white/5 space-y-3">
				<p className="text-sm text-slate-400">
					{isHost
						? `P2P 隧道已建立。客户端连接 127.0.0.1:${localPort} 即可。`
						: `隧道畅通。请在游戏中连接 127.0.0.1:${localPort}。`}
				</p>
				<div className="flex items-center gap-2 bg-black/40 p-2 rounded border border-white/10 font-mono text-green-400 justify-center text-lg select-all">
					127.0.0.1:{localPort}
				</div>
			</div>

			<button onClick={onDisconnect} className="btn-danger w-full mt-4">
				<LogOut size={18} />
				{isHost ? "关闭房间" : "断开连接"}
			</button>
		</div>
	)
}
