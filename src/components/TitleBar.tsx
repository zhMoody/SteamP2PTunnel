import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

const appWindow = getCurrentWindow();

export function TitleBar() {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        const updateMaximized = async () => {
            const maximized = await appWindow.isMaximized();
            setIsMaximized(maximized);
        };

        const unlisten = appWindow.onResized(() => {
            updateMaximized();
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    return (
        <div 
            className="h-10 bg-[#020617] border-b border-white/5 flex items-center justify-between select-none shrink-0 z-[100] relative"
        >
            <div
                data-tauri-drag-region 
                className="absolute inset-0 z-0 cursor-default"
            ></div>

            <div className="flex items-center gap-2 px-4 pointer-events-none relative z-10">
                <div className="w-4 h-4 rounded bg-blue-600 flex items-center justify-center">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                </div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Steam P2P Tunnel</span>
            </div>

            <div className="flex items-center h-full relative z-20">
                <button
                    onClick={() => appWindow.minimize()}
                    className="h-full px-4 text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                >
                    <Minus size={14} />
                </button>
                <button
                    onClick={() => appWindow.toggleMaximize()}
                    className="h-full px-4 text-slate-500 hover:text-white hover:bg-white/10 transition-colors"
                >
                    {isMaximized ? <Copy size={12} className="rotate-180" /> : <Square size={12} />}
                </button>
                <button
                    onClick={() => appWindow.close()}
                    className="h-full px-4 text-slate-500 hover:text-white hover:bg-red-500 transition-colors rounded-none"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
}
