import {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {toast} from "react-hot-toast";
import {ArrowRight, Gamepad2, Link, Sparkles} from "lucide-react";
import {useApp} from "../AppContext";
import {JoinLobbyResult} from "../types";

export function ConnectionPanel() {
    const {localPort, setLocalPort, setCurrentLobbyId, refreshStatus} = useApp();
    const [activeTab, setActiveTab] = useState<'host' | 'join'>(() => (localStorage.getItem("mcct_last_tab") as 'host' | 'join') || 'host');
    const [lobbyIdInput, setLobbyIdInput] = useState(() => localStorage.getItem("mcct_last_lobby_id") || "");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        localStorage.setItem("mcct_last_tab", activeTab);
    }, [activeTab]);
    useEffect(() => {
        localStorage.setItem("mcct_last_lobby_id", lobbyIdInput);
    }, [lobbyIdInput]);

    const handleCreateLobby = async () => {
        setLoading(true);
        const toastId = "create-lobby";
        try {
            toast.loading("正在创建Steam房间...", {id: toastId});
            const id = await invoke<string>("create_lobby");
            toast.loading("正在启动P2P监听...", {id: toastId});
            await invoke("start_hosting", {localPort});
            toast.success(`房间创建成功! ID: ${id}`, {icon: '🎮', id: toastId});
            setCurrentLobbyId(id);
            await refreshStatus();
        } catch (e: any) {
            const errorMsg = typeof e === 'string' ? e : (e.message || JSON.stringify(e));
            toast.error("创建失败: " + errorMsg, {id: toastId});
        } finally {
            setLoading(false);
        }
    };

    const handleJoinLobby = async (lobbyIdToJoin: string) => {
        if (!lobbyIdToJoin) return;
        setLoading(true);
        const toastId = "join-lobby";
        try {
            toast.loading("正在加入Steam房间...", {id: toastId});
            const result = await invoke<JoinLobbyResult>("join_lobby", {lobbyIdStr: lobbyIdToJoin});

            toast.loading("正在建立 P2P 隧道... (约1分钟)", {id: toastId});
            await invoke("connect_to_host", {
                hostIdStr: result.host_id,
                localPort: localPort
            });

            toast.success("隧道已打通!", {icon: '🚀', id: toastId});
            setCurrentLobbyId(result.lobby_id);
            await refreshStatus();
        } catch (e: any) {
            const errorMsg = typeof e === 'string' ? e : (e.message || JSON.stringify(e));
            if (errorMsg.includes("timed out")) {
                toast.error("连接超时: 请确保房主在线。", {id: toastId});
            } else {
                toast.error("加入失败: " + errorMsg, {id: toastId});
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex p-1.5 bg-slate-950/80 rounded-2xl border border-white/5 backdrop-blur-xl shadow-inner">
                <button onClick={() => setActiveTab('host')}
                        className={`flex-1 py-3 px-2 text-[11px] sm:text-sm font-bold rounded-xl transition-all duration-300 whitespace-nowrap ${activeTab === 'host' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
                    建立连接 <span className="hidden xs:inline">(房主)</span>
                </button>
                <button onClick={() => setActiveTab('join')}
                        className={`flex-1 py-3 px-2 text-[11px] sm:text-sm font-bold rounded-xl transition-all duration-300 whitespace-nowrap ${activeTab === 'join' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20 ring-1 ring-white/20' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
                    加入连接 <span className="hidden xs:inline">(客户端)</span>
                </button>
            </div>

            {activeTab === 'host' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                            <Sparkles size={12} className="text-blue-500" />
                            本地服务端口
                        </label>
                        <div className="input-with-icon">
                            <Gamepad2 className="input-icon"/>
                            <input
                                type="number"
                                value={localPort}
                                onChange={(e) => setLocalPort(parseInt(e.target.value, 10) || 0)}
                                className="input-base"
                                placeholder="例如: 25565"
                            />
                        </div>
                        <p className="px-1 text-[11px] text-slate-500 leading-relaxed">
                            我们将通过 Steam P2P 网络将来自远端玩家的流量安全转发到您指定的本地服务端口。
                        </p>
                    </div>
                    <button onClick={handleCreateLobby} disabled={loading} className="btn-primary w-full group py-4 h-14">
                        <span className="text-base font-bold tracking-tight">{loading ? '正在初始化...' : '启动 P2P 隧道'}</span>
                        {!loading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/>}
                    </button>
                </div>
            ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                            <Gamepad2 size={12} className="text-indigo-500" />
                            映射本地端口
                        </label>
                        <div className="input-with-icon">
                            <Gamepad2 className="input-icon"/>
                            <input
                                type="number"
                                value={localPort}
                                onChange={(e) => setLocalPort(parseInt(e.target.value, 10) || 0)}
                                className="input-base"
                                placeholder="例如: 25565"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">
                            <Link size={12} className="text-indigo-500" />
                            远程房间凭证
                        </label>
                        <div className="input-with-icon">
                            <Link className="input-icon"/>
                            <input
                                type="text"
                                value={lobbyIdInput}
                                onChange={(e) => setLobbyIdInput(e.target.value)}
                                className="input-base"
                                placeholder="粘贴房主提供的房间 ID"
                            />
                        </div>
                    </div>
                    <button onClick={() => handleJoinLobby(lobbyIdInput)} disabled={loading || !lobbyIdInput}
                            className="btn-primary w-full group from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 py-4 h-14">
                        <span className="text-base font-bold tracking-tight">{loading ? '建立隧道中...' : '连接到隧道'}</span>
                        {!loading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform"/>}
                    </button>
                </div>
            )}
        </div>
    );
}

