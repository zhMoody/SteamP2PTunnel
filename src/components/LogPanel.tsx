import React, { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Trash2, Terminal, Shield, Activity, Cpu, Database, Info, AlertTriangle, XCircle } from 'lucide-react';
import { TitleBar } from './TitleBar';

interface LogEntry {
    message: string;
    level: string;
    timestamp: string;
}

interface LogPanelProps {
    isOpen?: boolean; 
    onClose?: () => void;
}

export const LogPanel: React.FC<LogPanelProps> = () => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [filter, setFilter] = useState<string>('全部');
    const [memoryUsage, setMemoryUsage] = useState<string>('计算中...');
    const scrollRef = useRef<HTMLDivElement>(null);

    const filterMap: { [key: string]: string } = {
        '全部': 'ALL',
        '信息': 'INFO',
        '警告': 'WARN',
        '錯誤': 'ERROR'
    };

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const history = await invoke<LogEntry[]>("get_log_history");
                setLogs(history.reverse());
            } catch (e) {
                console.error("Failed to fetch log history:", e);
            }
        };

        fetchHistory();

        const unlisten = listen<{ message: string; level: string }>('log-event', (event) => {
            const newLog: LogEntry = {
                message: event.payload.message,
                level: event.payload.level,
                timestamp: new Date().toLocaleTimeString(),
            };
            setLogs((prev) => [...prev.slice(-999), newLog]); 
        });

        const memoryInterval = setInterval(async () => {
            try {
                const usage = await invoke<string>("get_memory_usage");
                setMemoryUsage(usage);
            } catch (e) {
                console.error("Failed to fetch memory usage:", e);
                setMemoryUsage("Error");
            }
        }, 2000);

        return () => {
            unlisten.then((f) => f());
            clearInterval(memoryInterval);
        };
    }, []);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs, filter]);

    const getLevelStyle = (level: string) => {
        switch (level.toUpperCase()) {
            case 'ERROR': return {
                text: 'text-red-400',
                bg: 'bg-red-500/10',
                border: 'border-red-500/20',
                icon: <XCircle size={12} className="text-red-500" />
            };
            case 'WARN': return {
                text: 'text-amber-400',
                bg: 'bg-amber-500/10',
                border: 'border-amber-500/20',
                icon: <AlertTriangle size={12} className="text-amber-500" />
            };
            case 'DEBUG': return {
                text: 'text-blue-400',
                bg: 'bg-blue-500/10',
                border: 'border-blue-500/20',
                icon: <Terminal size={12} className="text-blue-500" />
            };
            default: return {
                text: 'text-emerald-400',
                bg: 'bg-emerald-500/10',
                border: 'border-emerald-500/20',
                icon: <Info size={12} className="text-emerald-500" />
            };
        }
    };

    const displayLevel = (level: string) => {
        switch (level.toUpperCase()) {
            case 'ERROR': return 'CRITICAL';
            case 'WARN': return 'WARNING';
            case 'INFO': return 'SYSTEM';
            case 'DEBUG': return 'DEBUG';
            default: return level;
        }
    };

    const filteredLogs = filter === '全部' 
        ? logs 
        : logs.filter(l => l.level.toUpperCase() === filterMap[filter]);

    return (
        <div className="h-screen w-screen flex flex-col bg-[#020617] text-slate-300 font-mono select-text overflow-hidden border border-white/5 shadow-2xl">
            <TitleBar />
            
            <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-slate-900/40 backdrop-blur-xl shrink-0 z-20 relative">
                <div data-tauri-drag-region className="absolute inset-0 z-0 cursor-default"></div>
                
                <div className="flex items-center gap-6 pointer-events-none relative z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 rounded-lg border border-blue-500/20">
                            <Terminal size={18} className="text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-sm font-black text-white tracking-widest uppercase italic text-nowrap">Console<span className="text-blue-500 not-italic ml-1">Kernel</span></h1>
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest text-nowrap">Live Logs Streaming</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-8 w-[1px] bg-white/5 mx-2"></div>

                    <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 shadow-inner pointer-events-auto">
                        {['全部', '信息', '警告', '錯誤'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-4 py-1.5 text-[10px] font-bold rounded-lg transition-all duration-300 uppercase tracking-wider ${
                                    filter === f 
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 ring-1 ring-white/10' 
                                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-4 pointer-events-auto relative z-10">
                    <button 
                        onClick={() => setLogs([])}
                        className="flex items-center gap-2 px-3 py-2 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 rounded-xl group transition-all active:scale-95"
                        title="清空控制台"
                    >
                        <Trash2 size={16} className="text-red-500/50 group-hover:text-red-400" />
                        <span className="text-[10px] font-bold text-red-500/50 group-hover:text-red-400 uppercase tracking-wider hidden sm:block">Clear</span>
                    </button>
                </div>
            </header>

            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-6 space-y-2 custom-scrollbar bg-[radial-gradient(at_50%_0%,rgba(30,41,59,0.2)_0px,transparent_50%)]"
            >
                {filteredLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-800 space-y-4 opacity-40 animate-pulse">
                        <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-800 flex items-center justify-center">
                            <Database size={32} strokeWidth={1.5} />
                        </div>
                        <div className="text-center">
                            <p className="text-xs font-black uppercase tracking-[0.3em]">Buffer Empty</p>
                            <p className="text-[10px] italic mt-1 font-medium">Waiting for system kernel events...</p>
                        </div>
                    </div>
                ) : (
                    filteredLogs.map((log, i) => {
                        const style = getLevelStyle(log.level);
                        return (
                            <div key={i} className="flex gap-4 items-start group hover:bg-white/[0.03] transition-all rounded-xl p-3 -mx-2 border border-transparent hover:border-white/5 hover:shadow-xl relative overflow-hidden">
                                <div className="flex flex-col items-center shrink-0 w-20 pt-1">
                                    <span className="text-[10px] font-bold text-slate-600 tabular-nums font-mono tracking-tighter">{log.timestamp}</span>
                                </div>
                                
                                <div className={`flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[9px] font-black shrink-0 w-24 justify-center uppercase tracking-wider shadow-inner ${style.bg} ${style.text} ${style.border}`}>
                                    {style.icon}
                                    {displayLevel(log.level)}
                                </div>

                                <div className="flex-1 text-[13px] leading-relaxed break-all text-slate-300 font-medium font-mono group-hover:text-white transition-colors">
                                    {log.message}
                                </div>

                                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500/20"></div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            <footer className="h-10 border-t border-white/5 bg-slate-900/60 backdrop-blur-xl px-6 flex items-center justify-between text-[10px] font-bold text-slate-500 shrink-0 uppercase tracking-widest">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Shield size={12} className="text-emerald-500" />
                        <span>Kernel <span className="text-slate-300">Active</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Activity size={12} className="text-blue-500" />
                        <span>Buffer <span className="text-slate-300">{logs.length} Lines</span></span>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <Cpu size={12} className="text-purple-500" />
                        <span>MEM <span className="text-slate-300 font-mono tracking-tight">{memoryUsage}</span></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                        <span className="text-emerald-500">Node Ready</span>
                    </div>
                </div>
            </footer>

            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; border: 2px solid transparent; background-clip: padding-box; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
            `}} />
        </div>
    );
};
