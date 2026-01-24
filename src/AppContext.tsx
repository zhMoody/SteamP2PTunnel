// src/AppContext.tsx

import {createContext, ReactNode, useContext, useEffect, useState} from 'react';
import {invoke} from '@tauri-apps/api/core';
import {NetworkStatus} from './types';

interface AppState {
    networkStatus: NetworkStatus;
    currentLobbyId: string | null;
    localPort: number;
}

interface AppContextType extends AppState {
    setLocalPort: (port: number) => void;
    setCurrentLobbyId: (id: string | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const initialNetworkStatus: NetworkStatus = {
    isHost: false,
    isConnected: false,
    tcpClientCount: 0,
    statusMessage: 'Initializing...',
    ping: 0,
};

export const AppProvider = ({children}: { children: ReactNode }) => {
    const [state, setState] = useState<AppState>({
        networkStatus: initialNetworkStatus,
        currentLobbyId: null,
        localPort: parseInt(localStorage.getItem("mcct_last_port") || "25565", 10),
    });

    const setLocalPort = (port: number) => {
        localStorage.setItem("mcct_last_port", port.toString());
        setState(prevState => ({...prevState, localPort: port}));
    };

    const setCurrentLobbyId = (id: string | null) => {
        setState(prevState => ({...prevState, currentLobbyId: id}));
    };

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const status = await invoke<NetworkStatus>("get_network_status");
                setState(prevState => ({
                    ...prevState,
                    networkStatus: status,
                }));
            } catch (e) {
                console.error("Failed to get network status:", e);
                setState(prevState => ({
                    ...prevState,
                    networkStatus: {...initialNetworkStatus, statusMessage: 'Connection Error'},
                }));
            }
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const value = {...state, setLocalPort, setCurrentLobbyId};
    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (context === undefined) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};
