import {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {MemberInfo} from "../types";
import {User, Shield, Network} from "lucide-react";

export function MemberList() {
    const [members, setMembers] = useState<MemberInfo[]>([]);

    useEffect(() => {
        const fetchMembers = async () => {
            try {
                const res = await invoke<MemberInfo[]>("get_lobby_members");
                setMembers(res);
            } catch (e) {
                console.error(e);
            }
        };

        fetchMembers();
        const interval = setInterval(fetchMembers, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="w-full h-full flex flex-col">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="border-b border-white/5 text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">
                        <th className="px-6 py-4">成员名称</th>
                        <th className="px-6 py-4">身份 / 权限</th>
                        <th className="px-6 py-4">延迟</th>
                        <th className="px-6 py-4">连接类型</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                    {members.map((member, index) => (
                        <tr key={member.id} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-4">
                                    <div
                                        className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-blue-400 group-hover:border-blue-500/30 transition-all duration-300 shadow-lg">
                                        <User size={18}/>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-slate-200 group-hover:text-white transition-colors">{member.name}</span>
                                        <span className="text-[10px] text-slate-500 font-mono uppercase tracking-tight">ID: {member.id}</span>
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                    <Shield size={14} className={index === 0 ? "text-amber-500" : "text-blue-500/50"} />
                                    <span className={`text-xs font-medium ${index === 0 ? "text-amber-500/80" : "text-slate-400"}`}>
                                        {index === 0 ? "房主" : "受邀成员"}
                                    </span>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                    <Network size={14}
                                             className={member.ping < 0 ? "text-slate-600" : member.ping < 100 ? "text-emerald-500" : "text-amber-500"}/>
                                    <span className={`font-mono text-sm ${member.ping < 0 ? "text-slate-600" : member.ping < 100 ? "text-emerald-400" : "text-amber-400"}`}>
                                        {member.ping < 0 ? "-- ms" : member.ping === 0 ? "本机" : `${member.ping} ms`}
                                    </span>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className="text-xs px-2 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                    {member.relay}
                                </span>
                            </td>
                        </tr>
                    ))}
                    {members.length === 0 && (
                        <tr>
                            <td colSpan={4} className="p-20 text-center">
                                <div className="flex flex-col items-center gap-3 text-slate-600">
                                    <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-800 flex items-center justify-center animate-spin-slow">
                                        <User size={24} />
                                    </div>
                                    <p className="text-sm font-medium tracking-wide italic">正在等待数据同步...</p>
                                </div>
                            </td>
                        </tr>
                    )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}