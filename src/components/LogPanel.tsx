import React, { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { Trash2, Terminal, Shield, Activity } from 'lucide-react';

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
        // 1. 获取后台保存的历史日志
        const fetchHistory = async () => {
            try {
                const history = await invoke<LogEntry[]>("get_log_history");
                // history 从 CircularQueue 出来是逆序的（从新到旧），我们需要正序显示
                setLogs(history.reverse());
            } catch (e) {
                console.error("Failed to fetch log history:", e);
            }
        };

        fetchHistory();

        // 2. 监听实时日志
        const unlisten = listen<{ message: string; level: string }>('log-event', (event) => {
            const newLog: LogEntry = {
                message: event.payload.message,
                level: event.payload.level,
                timestamp: new Date().toLocaleTimeString(),
            };
            setLogs((prev) => [...prev.slice(-499), newLog]); 
        });

        // 3. 定期获取内存使用情况
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

    const getLevelColor = (level: string) => {
        switch (level.toUpperCase()) {
            case 'ERROR': return 'text-red-400 bg-red-400/10';
            case 'WARN': return 'text-yellow-400 bg-yellow-400/10';
            case 'DEBUG': return 'text-blue-400 bg-blue-400/10';
            case 'TRACE': return 'text-slate-500 bg-slate-500/10';
            default: return 'text-green-400 bg-green-400/10';
        }
    };

    const displayLevel = (level: string) => {
        switch (level.toUpperCase()) {
            case 'ERROR': return '錯誤';
            case 'WARN': return '警告';
            case 'INFO': return '信息';
            case 'DEBUG': return '調試';
            default: return level;
        }
    };

    const filteredLogs = filter === '全部' 
        ? logs 
        : logs.filter(l => l.level.toUpperCase() === filterMap[filter]);

    return (
        <div className="h-screen w-screen flex flex-col bg-[#020617] text-slate-300 font-mono select-text">
            {/* 標題欄 */}
            <div className="h-12 border-b border-white/5 flex items-center justify-between px-4 bg-slate-900/40 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-blue-400">
                        <Terminal size={16} />
                        <span className="text-sm font-bold tracking-wider">系統控制台</span>
                    </div>
                    <div className="h-4 w-[1px] bg-white/10 mx-1"></div>
                    <div className="flex gap-1">
                        {['全部', '信息', '警告', '錯誤'].map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-2 py-0.5 text-[10px] rounded border transition-all ${
                                    filter === f 
                                    ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' 
                                    : 'border-transparent hover:bg-white/5 text-slate-500'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-4 text-[10px] text-slate-500">
                        <div className="flex items-center gap-1">
                            <Shield size={12} className="text-green-500/50" />
                            <span>P2P 隧道已激活</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Activity size={12} className="text-blue-500/50" />
                            <span>{logs.length} 條記錄</span>
                        </div>
                    </div>
                    <button 
                        onClick={() => setLogs([])}
                        className="p-1.5 hover:bg-red-500/10 rounded group transition-all"
                        title="清空控制台"
                    >
                        <Trash2 size={16} className="text-slate-500 group-hover:text-red-400" />
                    </button>
                </div>
            </div>
            
            {/* 日誌內容區 */}
            <div 
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar"
            >
                {filteredLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-700 space-y-2 opacity-50">
                        <Terminal size={40} strokeWidth={1} />
                        <p className="text-sm italic">等待系統事件...</p>
                    </div>
                ) : (
                    filteredLogs.map((log, i) => (
                        <div key={i} className="flex gap-4 items-start group hover:bg-white/[0.02] transition-colors rounded px-2 -mx-2 py-0.5">
                            <span className="text-slate-600 shrink-0 tabular-nums">[{log.timestamp}]</span>
                            <span className={`px-1.5 py-0 rounded text-[10px] font-bold shrink-0 w-14 text-center ${getLevelColor(log.level)}`}>
                                {displayLevel(log.level)}
                            </span>
                            <span className="text-slate-300 leading-relaxed break-all">
                                {log.message}
                            </span>
                        </div>
                    ))
                )}
            </div>

            {/* 底部狀態欄 */}
            <div className="h-6 border-t border-white/5 bg-slate-900/60 px-4 flex items-center justify-between text-[9px] text-slate-600 shrink-0">
                <div className="flex gap-4">
                    <span>引擎: TAURI V2</span>
                    <span>網橋: TOKIO 異步</span>
                </div>
                <div className="flex gap-4">
                    <span>內存使用: <span className="text-blue-400">{memoryUsage}</span></span>
                    <span className="text-blue-500/50">就緒</span>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
            `}} />
        </div>
    );
};
