// src/App.tsx

import {toast, Toaster} from "react-hot-toast";
import {Activity, Server, Wifi, Terminal} from "lucide-react";
import {useApp} from "./AppContext";
import {ConnectionPanel} from "./components/ConnectionPanel";
import {LobbyPanel} from "./components/LobbyPanel";
import {MemberList} from "./components/MemberList";
import {FriendList} from "./components/FriendList";
import {invoke} from "@tauri-apps/api/core";

function App() {
    const {networkStatus, localPort, setCurrentLobbyId, currentLobbyId} = useApp();
    const {isConnected, statusMessage, ping} = networkStatus;

    const handleDisconnect = async () => {
        try {
            await invoke("leave_lobby");
            setCurrentLobbyId(null);
            toast.success("已断开连接");
        } catch (e) {
            toast.error("断开失败: " + String(e));
        }
    };

    const isInLobby = !!currentLobbyId;

    // @ts-ignore
    return (
        <div className="h-screen w-screen flex flex-col font-sans select-none overflow-hidden">
            <Toaster
                position="top-center"
                toastOptions={{
                    style: {
                        background: '#1e293b',
                        color: '#fff',
                        border: '1px solid rgba(255,255,255,0.1)',
                    },
                }}
            />

            <header
                className="h-16 glass-panel border-b-0 border-b-white/5 z-50 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-500/10 p-2 rounded-lg">
                        <Wifi className="w-6 h-6 text-blue-400"/>
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-100 tracking-tight">Steam P2P Tunnel</h1>
                        <div className="text-xs text-slate-400 flex items-center gap-2">
                            <span
                                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-slate-600'}`}></span>
                            {statusMessage}
                        </div>
                    </div>
                </div>

                {isConnected && (
                    <div className="flex items-center gap-6 text-sm">
                        <div
                            className="flex items-center gap-2 text-slate-300 bg-slate-800/50 px-3 py-1.5 rounded-full border border-white/5">
                            <Server size={14} className="text-purple-400"/>
                            <span>Port: <span className="font-mono text-purple-300">{localPort}</span></span>
                        </div>
                        <div
                            className="flex items-center gap-2 text-slate-300 bg-slate-800/50 px-3 py-1.5 rounded-full border border-white/5">
                            <Activity size={14} className="text-green-400"/>
                            {/* 【修改 3/3】改进显示逻辑，处理 ping 为 -1 (未知) 的情况 */}
                            <span>Delay: <span className="font-mono text-green-300">
                                {ping >= 0 ? `~${ping}ms` : '...'}
                            </span></span>
                        </div>
                    </div>
                )}

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => invoke("open_log_window")}
                        className="p-2.5 rounded-xl bg-slate-800/50 border border-white/5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 transition-all active:scale-95"
                        title="查看日誌"
                    >
                        <Terminal size={20} />
                    </button>
                </div>
            </header>

            <main className="flex-1 p-6 overflow-hidden min-h-0">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-0">
                    <div className="lg:col-span-4 flex flex-col gap-6 h-full min-h-0">
                        <div className="glass-panel rounded-2xl p-6 relative overflow-hidden group shrink-0">
                            <div
                                className="absolute top-0 right-0 p-32 bg-blue-500/5 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none group-hover:bg-blue-500/10 transition-colors duration-700"></div>
                            {!isInLobby ? <ConnectionPanel/> : <LobbyPanel onDisconnect={handleDisconnect}/>}
                        </div>
                        {isInLobby && (
                            <div className="glass-panel rounded-2xl flex-1 flex flex-col overflow-hidden min-h-0">
                                <FriendList/>
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-8 h-full min-h-0">
                        <div className="glass-panel rounded-2xl h-full flex flex-col overflow-hidden">
                            <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
                                <h2 className="text-xl font-semibold text-slate-100">房间成员</h2>
                                {isInLobby && (
                                    <span
                                        className="text-xs bg-blue-500/20 text-blue-300 px-2 py-1 rounded border border-blue-500/20">
                                        P2P Encrypted
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto p-0 min-h-0">
                                {isInLobby ? <MemberList/> : (
                                    <div
                                        className="h-full flex flex-col items-center justify-center text-slate-500 gap-4">
                                        <div
                                            className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center">
                                            <Server size={32} className="text-slate-600"/>
                                        </div>
                                        <p>等待连接...</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;