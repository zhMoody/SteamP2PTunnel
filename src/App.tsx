// src/App.tsx

import {toast, Toaster} from "react-hot-toast";
import {Server, Wifi, Terminal, Users, ChevronDown, ChevronUp, Settings, UserPlus} from "lucide-react";
import {useApp} from "./AppContext";
import {ConnectionPanel} from "./components/ConnectionPanel";
import {LobbyPanel} from "./components/LobbyPanel";
import {MemberList} from "./components/MemberList";
import {FriendList} from "./components/FriendList";
import {TitleBar} from "./components/TitleBar";
import {invoke} from "@tauri-apps/api/core";
import {useState} from "react";

function App() {
    const {networkStatus, localPort, setCurrentLobbyId, currentLobbyId} = useApp();
    const {isConnected, statusMessage} = networkStatus;
    
    const [expandedPanel, setExpandedPanel] = useState<'control' | 'friends'>('control');

    const handleDisconnect = async () => {
        try {
            await invoke("leave_lobby");
            setCurrentLobbyId(null);
            toast.success("已断开连接");
            setExpandedPanel('control');
        } catch (e) {
            toast.error("断开失败: " + String(e));
        }
    };

    const isInLobby = !!currentLobbyId;

    return (
        <div className="h-screen w-screen flex flex-col font-sans select-none overflow-hidden bg-slate-950 text-slate-200 border border-white/5 shadow-2xl">
            <TitleBar />
            <Toaster position="top-center" />

            <header className="h-16 md:h-20 glass-panel border-b border-white/5 z-50 flex items-center justify-between px-4 md:px-8 shrink-0 relative overflow-hidden">
                <div data-tauri-drag-region className="absolute inset-0 z-0 cursor-default"></div>
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500/50 to-transparent pointer-events-none z-10"></div>
                <div className="flex items-center gap-3 md:gap-4 pointer-events-none relative z-20">
                    <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 md:p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
                        <Wifi className="w-5 h-5 md:w-6 md:h-6 text-white"/>
                    </div>
                    <div>
                        <h1 className="text-base md:text-xl font-black text-white tracking-tight uppercase italic text-nowrap">
                            Steam <span className="text-blue-500 not-italic">P2P</span> Tunnel
                        </h1>
                        <div className="text-[9px] md:text-[10px] font-bold text-slate-500 flex items-center gap-1.5 md:gap-2 uppercase tracking-widest">
                            <span className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${isConnected ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-slate-600'}`}></span>
                            <span className="truncate max-w-[120px] md:max-w-none">{statusMessage}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 md:gap-4 relative z-20">
                    {isConnected && (
                        <div className="flex items-center gap-2 md:gap-3 bg-white/5 px-3 md:px-4 py-1.5 md:py-2 rounded-xl border border-white/10 backdrop-blur-md shadow-inner shrink-0">
                            <Server size={14} className="text-blue-400 hidden xs:block"/>
                            <span className="text-[10px] md:text-xs font-bold text-slate-300">
                                <span className="hidden xs:inline">端口:</span> 
                                <span className="font-mono text-blue-400 ml-1">{localPort}</span>
                            </span>
                        </div>
                    )}
                    <button onClick={() => invoke("open_log_window")} className="p-2 md:p-3 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all active:scale-95 group shadow-lg">
                        <Terminal size={18} className="md:w-5 md:h-5 group-hover:rotate-12 transition-transform" />
                    </button>
                </div>
            </header>

            <main className="flex-1 flex overflow-hidden relative bg-transparent">
                <aside className="w-[340px] lg:w-[400px] border-r border-white/5 flex flex-col shrink-0 h-full bg-slate-900/10 p-4 md:p-6 space-y-4">
                    
                    {/* Control Box */}
                    <div 
                        className={`glass-panel rounded-2xl flex flex-col border-white/10 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                            (expandedPanel === 'control' || !isInLobby) ? 'flex-1 opacity-100' : 'h-[52px] flex-none opacity-60'
                        }`}
                    >
                        <button 
                            onClick={() => isInLobby && setExpandedPanel('control')}
                            className={`flex items-center justify-between px-5 py-4 bg-white/[0.03] hover:bg-white/[0.06] transition-colors shrink-0 ${expandedPanel === 'control' || !isInLobby ? 'cursor-default' : 'cursor-pointer'}`}
                        >
                            <div className="flex items-center gap-3">
                                <Settings size={16} className={expandedPanel === 'control' || !isInLobby ? "text-blue-400" : "text-slate-500"} />
                                <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${expandedPanel === 'control' || !isInLobby ? "text-slate-200" : "text-slate-500"}`}>网络连接控制</span>
                            </div>
                            {isInLobby && expandedPanel === 'friends' && <ChevronDown size={16} className="text-slate-600" />}
                        </button>
                        
                        <div className={`flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar transition-opacity duration-500 ${expandedPanel === 'control' || !isInLobby ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                            <div className="p-6 relative">
                                <div className="absolute top-0 right-0 p-32 bg-blue-500/5 rounded-full blur-[60px] -mr-16 -mt-16 pointer-events-none"></div>
                                <div className="relative z-10">
                                    {!isInLobby ? <ConnectionPanel/> : <LobbyPanel onDisconnect={handleDisconnect}/>}
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {isInLobby && (
                        <div 
                            className={`glass-panel rounded-2xl flex flex-col border-white/10 overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                                expandedPanel === 'friends' ? 'flex-1 opacity-100' : 'h-[52px] flex-none opacity-60'
                            }`}
                        >
                            <button 
                                onClick={() => setExpandedPanel('friends')}
                                className={`flex items-center justify-between px-5 py-4 bg-white/[0.03] hover:bg-white/[0.06] transition-colors shrink-0 ${expandedPanel === 'friends' ? 'cursor-default' : 'cursor-pointer'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <UserPlus size={16} className={expandedPanel === 'friends' ? "text-emerald-400" : "text-slate-500"} />
                                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${expandedPanel === 'friends' ? "text-slate-200" : "text-slate-500"}`}>邀请好友</span>
                                </div>
                                {expandedPanel === 'control' && <ChevronUp size={16} className="text-slate-600" />}
                            </button>
                            
                            <div className={`flex-1 overflow-hidden transition-opacity duration-500 ${expandedPanel === 'friends' ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                <FriendList/>
                            </div>
                        </div>
                    )}
                </aside>

                <div className="flex-1 h-full overflow-hidden flex flex-col p-4 md:p-8">
                    <div className="glass-panel rounded-2xl md:rounded-3xl h-full flex flex-col overflow-hidden shadow-2xl border-white/10">
                        <div className="px-6 md:px-8 py-4 md:py-6 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.02]">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                                    <Users size={20} />
                                </div>
                                <h2 className="text-xl font-bold text-white tracking-tight">房间成员</h2>
                            </div>
                            {isInLobby && (
                                <div className="flex items-center gap-2">
                                    <span className="status-badge bg-blue-500/10 text-blue-400 border-blue-500/20 px-3 py-1">
                                        P2P ENCRYPTED
                                    </span>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar">
                            {isInLobby ? <MemberList/> : (
                                <div className="h-full py-20 lg:py-0 flex flex-col items-center justify-center text-slate-500 gap-6 animate-pulse">
                                    <div className="w-24 h-24 rounded-3xl bg-slate-900/50 flex items-center justify-center border border-white/5 rotate-3 hover:rotate-0 transition-transform duration-500 shadow-2xl">
                                        <Server size={48} className="text-slate-700"/>
                                    </div>
                                    <div className="text-center px-4">
                                        <p className="text-lg font-bold text-slate-400 tracking-tight">等待建立隧道...</p>
                                        <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-widest font-medium">Session Inactive</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
