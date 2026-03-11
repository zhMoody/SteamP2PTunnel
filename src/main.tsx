import React from "react";
import ReactDOM from "react-dom/client";
import {AppProvider} from "./AppContext";
import App from "./App";
import {LogPanel} from "./components/LogPanel";
import "./App.css"

const search = window.location.search;
const params = new URLSearchParams(search);
const isLogView = params.get("view") === "logs";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
        {isLogView ? (
            <div className="h-screen w-screen bg-slate-950">
                <LogPanel isOpen={true} onClose={() => window.close()} />
            </div>
        ) : (
            <AppProvider>
                <App/>
            </AppProvider>
        )}
    </React.StrictMode>,
);
