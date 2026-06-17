// src/AppContext.tsx

import {createContext, ReactNode, useContext, useEffect, useState, useCallback} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {listen} from '@tauri-apps/api/event';
import {NetworkStatus} from './types';

interface InvitePayload {
    lobby_id: string;
    friend_id: string;
    friend_name: string;
}

interface AppState {
    networkStatus: NetworkStatus;
    currentLobbyId: string | null;
    localPort: number;
    pendingInvite: InvitePayload | null;      // 弹窗确认
    richPresenceJoin: InvitePayload | null;   // Steam 里点了"加入游戏"，自动加入
}

interface AppContextType extends AppState {
    setLocalPort: (port: number) => void;
    setCurrentLobbyId: (id: string | null) => void;
    refreshStatus: () => Promise<void>;
    clearPendingInvite: () => void;
    clearRichPresenceJoin: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const initialNetworkStatus: NetworkStatus = {
    isHost: false,
    isConnected: false,
    tcpClientCount: 0,
    statusMessage: 'Initializing...',
    ping: 0,
    connectionType: 'Unknown',
};

export const AppProvider = ({children}: { children: ReactNode }) => {
    const [state, setState] = useState<AppState>({
        networkStatus: initialNetworkStatus,
        currentLobbyId: null,
        localPort: parseInt(localStorage.getItem("mcct_last_port") || "25565", 10),
        pendingInvite: null,
        richPresenceJoin: null,
    });

    const refreshStatus = useCallback(async () => {
        try {
            const status = await invoke<NetworkStatus>("get_network_status");
            setState(prevState => ({
                ...prevState,
                networkStatus: status,
            }));
        } catch (e) {
            console.error("Failed to get network status:", e);
        }
    }, []);

    const setLocalPort = (port: number) => {
        localStorage.setItem("mcct_last_port", port.toString());
        setState(prevState => ({...prevState, localPort: port}));
    };

    // 进入/退出大厅时清空邀请状态
    const setCurrentLobbyId = (id: string | null) => {
        setState(prevState => ({
            ...prevState,
            currentLobbyId: id,
            pendingInvite: null,
            richPresenceJoin: null,
        }));
    };

    const clearPendingInvite = () => {
        setState(prevState => ({...prevState, pendingInvite: null}));
    };

    const clearRichPresenceJoin = () => {
        setState(prevState => ({...prevState, richPresenceJoin: null}));
    };

    // 定时刷新网络状态
    useEffect(() => {
        const interval = setInterval(refreshStatus, 1000);
        return () => clearInterval(interval);
    }, [refreshStatus]);

    // 监听 Steam 大厅邀请（弹窗）
    useEffect(() => {
        const unlisten = listen<InvitePayload>('invite-received', (event) => {
            setState(prevState => ({
                ...prevState,
                pendingInvite: event.payload,
            }));
        });
        return () => { unlisten.then(fn => fn()); };
    }, []);

    // 监听 Steam "加入游戏"（自动加入）
    useEffect(() => {
        const unlisten = listen<InvitePayload>('rich-presence-join', (event) => {
            setState(prevState => ({
                ...prevState,
                richPresenceJoin: event.payload,
            }));
        });
        return () => { unlisten.then(fn => fn()); };
    }, []);

    // 监听大厅成员变更
    useEffect(() => {
        const unlisten = listen('lobby-member-changed', () => {
            refreshStatus();
        });
        return () => { unlisten.then(fn => fn()); };
    }, [refreshStatus]);

    const value = {
        ...state,
        setLocalPort,
        setCurrentLobbyId,
        refreshStatus,
        clearPendingInvite,
        clearRichPresenceJoin,
    };
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};