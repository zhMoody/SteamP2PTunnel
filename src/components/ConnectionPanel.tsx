import {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {toast} from "react-hot-toast";
import {ArrowRight, Gamepad2, Link} from "lucide-react";
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
            // 立即刷新状态，强制 UI 跳转
            await refreshStatus();
        } catch (e) {
            toast.error("创建失败: " + String(e), {id: toastId});
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

            toast.loading("正在连接到房主... (这可能需要长达1分钟)", {id: toastId});
            await invoke("connect_to_host", {
                hostIdStr: result.host_id,
                localPort: localPort
            });

            toast.success("成功加入房间!", {icon: '🚀', id: toastId});
            setCurrentLobbyId(result.lobby_id);
            // 立即刷新状态，强制 UI 跳转
            await refreshStatus();
        } catch (e) {
            const errorString = String(e);
            if (errorString.includes("timed out")) {
                toast.error("连接超时: 请确保房主在线且网络通畅。", {id: toastId});
            } else {
                toast.error("加入失败: " + errorString, {id: toastId});
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex p-1 bg-slate-950/50 rounded-xl border border-white/5">
                <button onClick={() => setActiveTab('host')}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'host' ? 'bg-slate-800 text-white shadow-sm ring-1 ring-white/10' : 'text-slate-400 hover:text-slate-200'}`}>
                    我是房主
                </button>
                <button onClick={() => setActiveTab('join')}
                        className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${activeTab === 'join' ? 'bg-slate-800 text-white shadow-sm ring-1 ring-white/10' : 'text-slate-400 hover:text-slate-200'}`}>
                    加入游戏
                </button>
            </div>

            {activeTab === 'host' ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div>
                        <label
                            className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">本地游戏端口</label>
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
                        <p className="text-xs text-slate-500 mt-2">
                            我们将把其他人的流量转发到这个端口。
                        </p>
                    </div>
                    <button onClick={handleCreateLobby} disabled={loading} className="btn-primary w-full group">
                        {loading ? '创建中...' : '启动房间'}
                        {!loading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform"/>}
                    </button>
                </div>
            ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div>
                        <label
                            className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">本地游戏端口</label>
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
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">通过房间
                            ID 加入</label>
                        <div className="input-with-icon">
                            <Link className="input-icon"/>
                            <input
                                type="text"
                                value={lobbyIdInput}
                                onChange={(e) => setLobbyIdInput(e.target.value)}
                                className="input-base"
                                placeholder="粘贴房主发来的ID"
                            />
                        </div>
                    </div>
                    <button onClick={() => handleJoinLobby(lobbyIdInput)} disabled={loading || !lobbyIdInput}
                            className="btn-primary w-full group bg-green-600 hover:bg-green-500">
                        {loading ? '连接中...' : '加入游戏'}
                        {!loading && <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform"/>}
                    </button>
                </div>
            )}
        </div>
    );
}
