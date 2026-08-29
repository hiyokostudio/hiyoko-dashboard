'use client';

import { useEffect, useState, use } from 'react';
import { supabase } from '@/utils/supabase';
import { Flame, Coins, Zap, TrendingUp, Search, Crown, Award, ExternalLink, Users, Activity, ShieldCheck, AlertTriangle, Clock, X, BarChart2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

type GiftLog = { id: number; created_at: string; coins: number; viewers: { name: string; unique_id?: string; avatar_url?: string } | null; };
type VipListener = { viewer_id: string; viewer_name: string; unique_id: string | null; avatar_url: string | null; total_coins: number; rank: number; first_seen?: string; };
type ListenerProfile = { first_seen: string; last_seen: string; total_coins: number; day_of_week: Record<string, number>; hour_of_day: Record<string, number>; };
type LiverStat = { system_id: string; username: string; is_active: boolean; total_coins: number; unique_listeners: number; core_fans: number; top1_coins: number; dependency_rate: number; };

export default function LiverPortal({ params }: { params: Promise<{ system_id: string }> }) {
  const { system_id } = use(params);
  
  const [liverInfo, setLiverInfo] = useState<{ username: string; avatar_url: string | null; reward_rate: number } | null>(null);
  const [liverStat, setLiverStat] = useState<LiverStat | null>(null);
  const [exchangeRate, setExchangeRate] = useState(145.00);
  const [recentLogs, setRecentLogs] = useState<GiftLog[]>([]);
  const [vipListeners, setVipListeners] = useState<VipListener[]>([]);
  const [loading, setLoading] = useState(true);

  const [activePeriod, setActivePeriod] = useState<'today' | 'month' | 'total' | 'custom'>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeView, setActiveView] = useState<'vips' | 'logs'>('vips'); 

  const [selectedViewer, setSelectedViewer] = useState<{id: string, name: string} | null>(null);
  const [viewerProfile, setViewerProfile] = useState<ListenerProfile | null>(null);

  const getTimeBounds = () => {
    let startIso = null; let endIso = null; const now = new Date();
    if (activePeriod === 'custom' && startDate && endDate) { startIso = new Date(startDate).toISOString(); endIso = new Date(endDate).toISOString(); }
    else if (activePeriod === 'today') { const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })); today.setHours(0, 0, 0, 0); startIso = new Date(today.getTime() - 9 * 60 * 60 * 1000).toISOString(); }
    else if (activePeriod === 'month') { const month = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })); month.setDate(1); month.setHours(0, 0, 0, 0); startIso = new Date(month.getTime() - 9 * 60 * 60 * 1000).toISOString(); }
    return { startIso, endIso };
  };

  useEffect(() => {
    if (activePeriod !== 'custom' || (startDate && endDate)) fetchData();
  }, [activePeriod, startDate, endDate, system_id]);

  useEffect(() => {
    const channel = supabase.channel(`portal:${system_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_logs', filter: `liver_id=eq.${system_id}` }, async (payload) => {
        const { startIso, endIso } = getTimeBounds();
        const logTime = new Date(payload.new.created_at).getTime();
        const startTime = startIso ? new Date(startIso).getTime() : 0;
        const endTime = endIso ? new Date(endIso).getTime() : Infinity;
        
        if (logTime >= startTime && logTime <= endTime) {
          fetchData(); 
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [system_id, activePeriod, startDate, endDate]);

  useEffect(() => {
    if (selectedViewer) fetchViewerProfile(system_id, selectedViewer.id);
  }, [selectedViewer]);

  const fetchViewerProfile = async (liverId: string, viewerId: string) => {
    const { data } = await supabase.rpc('get_listener_profile', { p_liver_id: liverId, p_viewer_id: viewerId });
    if (data) setViewerProfile(data as ListenerProfile);
  };

  const fetchData = async () => {
    setLoading(true);
    if (!liverInfo) {
      const { data: liver } = await supabase.from('target_livers').select('username, avatar_url, reward_rate').eq('system_id', system_id).single();
      if (liver) setLiverInfo(liver as any);
      try { const res = await fetch('/api/exchange'); const data = await res.json(); if (data.rate) setExchangeRate(data.rate); } catch (e) {}
    }

    const { startIso, endIso } = getTimeBounds();
    let query = supabase.from('gift_logs').select('id, created_at, coins, viewers(name, unique_id, avatar_url)').eq('liver_id', system_id).order('created_at', { ascending: false }).limit(50);
    if (startIso) query = query.gte('created_at', startIso); 
    if (endIso) query = query.lte('created_at', endIso); 

    const { data: logsRes } = await query;
    if (logsRes) setRecentLogs(logsRes as unknown as GiftLog[]);
    
    const { data: vips } = await supabase.rpc('get_liver_vips', { p_system_id: system_id, p_start_date: startIso, p_end_date: endIso });
    if (vips) setVipListeners(vips as VipListener[]);

    const { data: iData } = await supabase.rpc('get_intelligence_stats', { p_start_date: startIso, p_end_date: endIso });
    if (iData) {
      const myStat = (iData as LiverStat[]).find(s => s.system_id === system_id);
      if (myStat) setLiverStat(myStat);
    }
    setLoading(false);
  };

  if (loading && !liverInfo) return <div className="min-h-screen bg-[#050505] flex items-center justify-center font-black text-indigo-500 animate-pulse">CONNECTING...</div>;
  if (!liverInfo) return <div className="min-h-screen bg-[#050505] flex items-center justify-center font-black text-rose-500">LIVER NOT FOUND</div>;

  const totalCoins = liverStat?.total_coins || 0;
  const currentRewardUSD = totalCoins * (liverInfo.reward_rate / 10000);
  const currentRewardJPY = Math.floor(currentRewardUSD * exchangeRate);
  const unitPriceUSD = (1000 * (liverInfo.reward_rate / 10000)).toFixed(2);
  const isDanger = (liverStat?.dependency_rate || 0) >= 80 && totalCoins > 0;

  const daysMap = { 'Monday': '月', 'Tuesday': '火', 'Wednesday': '水', 'Thursday': '木', 'Friday': '金', 'Saturday': '土', 'Sunday': '日' };
  const dowData = viewerProfile ? Object.keys(daysMap).map(d => ({ name: daysMap[d as keyof typeof daysMap], coins: viewerProfile.day_of_week?.[d] || 0 })) : [];
  const hodData = viewerProfile ? Array.from({length: 24}, (_, i) => ({ name: `${i}時`, coins: viewerProfile.hour_of_day?.[i.toString()] || 0 })) : [];

  const AvatarFallback = ({ name, size = "w-10 h-10", textSize = "text-sm" }: { name: string, size?: string, textSize?: string }) => (
    <div className={`${size} rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold ${textSize} uppercase flex-shrink-0`}>{name.charAt(0)}</div>
  );

  return (
    <div className="min-h-screen bg-[#050505] text-slate-50 font-sans sm:pb-0 pb-10">
      <div className="max-w-md mx-auto min-h-screen bg-[#0A0A0A] border-x border-slate-900/50 shadow-2xl relative overflow-hidden flex flex-col">
        <div className="absolute top-[-10%] left-[-20%] w-[140%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none"></div>

        <header className="px-6 pt-10 pb-4 flex items-center gap-4 relative z-10">
          {liverInfo.avatar_url ? <img src={liverInfo.avatar_url} className="w-12 h-12 rounded-full border-2 border-indigo-500/50 object-cover shadow-[0_0_15px_rgba(99,102,241,0.4)]" alt=""/> : <AvatarFallback name={liverInfo.username} size="w-12 h-12" textSize="text-xl" />}
          <div className="flex flex-col"><h1 className="text-xl font-black tracking-tight text-white leading-tight">{liverInfo.username}</h1><span className="text-[11px] text-slate-500 font-mono tracking-tighter mt-0.5">ID: {system_id}</span></div>
        </header>

        <div className="px-6 relative z-10 mb-4">
          <div className="flex space-x-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80 backdrop-blur-sm">
            <button onClick={() => setActivePeriod('today')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${activePeriod === 'today' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>本日</button>
            <button onClick={() => setActivePeriod('month')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${activePeriod === 'month' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>今月</button>
            <button onClick={() => setActivePeriod('total')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${activePeriod === 'total' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>累計</button>
            <button onClick={() => setActivePeriod('custom')} className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all ${activePeriod === 'custom' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>指定</button>
          </div>
          {activePeriod === 'custom' && (
            <div className="mt-2 flex items-center space-x-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800/80 backdrop-blur-sm animate-in fade-in">
              <div className="flex-1 bg-slate-950 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors"><input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-transparent text-[10px] px-2 py-2 outline-none font-bold text-slate-300 [color-scheme:dark]" /></div>
              <span className="text-slate-500 text-xs">〜</span>
              <div className="flex-1 bg-slate-950 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors"><input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-transparent text-[10px] px-2 py-2 outline-none font-bold text-slate-300 [color-scheme:dark]" /></div>
            </div>
          )}
        </div>

        <div className="px-6 relative z-10 flex flex-col gap-3">
          <div className="bg-gradient-to-br from-slate-900/80 to-black border border-slate-800/80 p-5 rounded-3xl shadow-2xl backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Zap size={100} className="text-indigo-400"/></div>
            <p className="text-[11px] font-black text-slate-400 tracking-widest uppercase mb-1 flex items-center"><TrendingUp size={12} className="mr-1.5 text-indigo-400"/> 推定報酬 ({activePeriod})</p>
            <div className="flex items-baseline gap-1 mt-1"><span className="text-2xl font-black text-indigo-400">¥</span><span className="text-5xl font-black text-white tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{currentRewardJPY.toLocaleString()}</span></div>
            <div className="mt-4 flex items-center gap-4 border-t border-slate-800/80 pt-3">
              <div className="flex-1"><p className="text-[10px] font-bold text-slate-500 uppercase">獲得ダイヤ</p><p className="text-lg font-black text-slate-200 tabular-nums flex items-center gap-1.5 mt-0.5"><Coins size={12} className="text-amber-400"/> {totalCoins.toLocaleString()}</p></div>
              <div className="w-px h-8 bg-slate-800"></div>
              <div className="flex-1"><p className="text-[10px] font-bold text-slate-500 uppercase">現在レート / 1K</p><p className="text-lg font-black text-slate-200 tabular-nums mt-0.5">${unitPriceUSD} <span className="text-[10px] text-emerald-400 font-bold ml-0.5">({liverInfo.reward_rate}%)</span></p></div>
            </div>
          </div>

          <div className={`p-4 rounded-2xl border backdrop-blur-md flex items-center justify-between ${isDanger ? 'bg-rose-950/40 border-rose-500/30' : 'bg-slate-900/60 border-slate-800/80'}`}>
            <div className="flex gap-4">
              <div><p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">参加者 (1C+)</p><p className="text-base font-black text-slate-200">{liverStat?.unique_listeners || 0} <span className="text-[10px] font-normal text-slate-500">人</span></p></div>
              <div><p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">コアファン</p><p className="text-base font-black text-orange-400 flex items-center">{liverStat?.core_fans || 0} <span className="text-[10px] font-normal text-slate-500 ml-0.5">人</span></p></div>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">太客依存率</p>
              {isDanger ? (
                <p className="text-sm font-black text-rose-400 flex items-center justify-end"><AlertTriangle size={12} className="mr-1"/> {(liverStat?.dependency_rate || 0).toFixed(1)}%</p>
              ) : (
                <p className="text-sm font-black text-emerald-400 flex items-center justify-end"><ShieldCheck size={12} className="mr-1"/> {(liverStat?.dependency_rate || 0).toFixed(1)}%</p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 px-6 relative z-10 flex-grow flex flex-col min-h-0">
          <div className="flex space-x-2 border-b border-slate-800/80 pb-2 mb-3 px-1">
            <button onClick={() => setActiveView('vips')} className={`flex-1 flex justify-center items-center pb-2 border-b-2 transition-all ${activeView === 'vips' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              <Crown size={14} className="mr-1.5"/> <span className="text-[11px] font-black tracking-wider uppercase">Strategic VIPs</span>
            </button>
            <button onClick={() => setActiveView('logs')} className={`flex-1 flex justify-center items-center pb-2 border-b-2 transition-all ${activeView === 'logs' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>
              <Activity size={14} className="mr-1.5"/> <span className="text-[11px] font-black tracking-wider uppercase">Live Logs</span>
            </button>
          </div>
          
          <div className="flex-grow overflow-y-auto space-y-2.5 pr-2 pb-6 scrollbar-none">
            {activeView === 'vips' && vipListeners.map((vip) => {
              const contributionRate = totalCoins > 0 ? (vip.total_coins / totalCoins) * 100 : 0;
              const isCore = vip.total_coins >= 1000;
              const coinsToCore = 1000 - vip.total_coins;
              const progress = Math.min((vip.total_coins / 1000) * 100, 100);

              return (
                <div 
                  key={vip.viewer_id} 
                  className={`flex flex-col p-3 rounded-2xl border transition-all cursor-pointer ${vip.rank === 1 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-900/60 border-slate-800/50'}`} 
                  onClick={() => setSelectedViewer({id: vip.viewer_id, name: vip.viewer_name})}
                >
                  <div className="flex items-center">
                    <div className="w-6 text-center flex-shrink-0">
                      {vip.rank === 1 ? <Crown size={16} className="text-amber-400 mx-auto" /> : vip.rank === 2 ? <Award size={16} className="text-slate-300 mx-auto" /> : vip.rank === 3 ? <Award size={16} className="text-amber-700 mx-auto" /> : <span className="text-xs font-bold text-slate-500">{vip.rank}</span>}
                    </div>
                    
                    {/* アバター: window.open + e.stopPropagation */}
                    <div className="ml-2 flex-shrink-0 relative z-10 flex items-center">
                      <div 
                        onClick={(e) => {
                          e.preventDefault(); e.stopPropagation();
                          if (vip.unique_id) window.open(`https://www.tiktok.com/@${vip.unique_id}`, '_blank');
                        }}
                        className={`${vip.unique_id ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                      >
                        {vip.avatar_url ? <img src={vip.avatar_url} alt="" className="w-10 h-10 rounded-full border border-slate-700 object-cover" /> : <AvatarFallback name={vip.viewer_name} />}
                      </div>
                      
                      <div className="flex flex-col ml-3">
                        {/* 名前: window.open + e.stopPropagation */}
                        <span 
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            if (vip.unique_id) window.open(`https://www.tiktok.com/@${vip.unique_id}`, '_blank');
                          }}
                          className={`font-bold text-[13px] truncate ${vip.unique_id ? 'cursor-pointer hover:underline decoration-slate-400 underline-offset-4' : ''} ${vip.rank === 1 ? 'text-amber-400' : 'text-slate-200'}`}
                        >
                          {vip.viewer_name} {vip.unique_id && <ExternalLink size={10} className="inline text-slate-500 ml-0.5" />}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium mt-0.5 flex items-center">
                          <Clock size={10} className="mr-1 opacity-50"/> {vip.first_seen ? format(parseISO(vip.first_seen), 'yyyy/MM/dd') : 'データなし'}
                        </span>
                      </div>
                      
                      {isCore && <span className="text-[9px] font-black text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1 py-0.5 rounded flex items-center ml-2 h-fit"><Flame size={8} className="mr-0.5"/> Core</span>}
                    </div>

                    <div className="flex flex-col items-end flex-grow ml-3 flex-shrink-0">
                      <span className={`font-black text-sm ${vip.rank === 1 ? 'text-amber-400' : 'text-indigo-400'}`}>{vip.total_coins.toLocaleString()}</span>
                      <span className="text-[9px] text-slate-500">ダイヤ</span>
                    </div>
                  </div>

                  {!isCore && (
                    <div className="mt-3 ml-11 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">CoreFan Challenge</span>
                        <span className="text-[9px] font-black text-orange-400">あと {coinsToCore} ダイヤ</span>
                      </div>
                      <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${progress}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {activeView === 'vips' && vipListeners.length === 0 && <div className="text-center py-10 text-slate-600 text-xs font-bold uppercase tracking-widest flex flex-col items-center justify-center"><Users className="mb-2 opacity-20" size={24}/> No Listeners</div>}

            {activeView === 'logs' && recentLogs.map((log, i) => (
              <div key={log.id} className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-500 ${i === 0 ? 'bg-indigo-600/10 border-indigo-500/30' : 'bg-slate-900/40 border-slate-800/50'}`}>
                <div className="flex items-center gap-3 overflow-hidden">
                  {/* ログのアバター: window.open + e.stopPropagation */}
                  <div 
                    className={`flex-shrink-0 relative z-10 ${log.viewers?.unique_id ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                    onClick={(e) => {
                      e.preventDefault(); e.stopPropagation();
                      if (log.viewers?.unique_id) window.open(`https://www.tiktok.com/@${log.viewers.unique_id}`, '_blank');
                    }}
                  >
                    {log.viewers?.avatar_url ? <img src={log.viewers.avatar_url} className="w-10 h-10 rounded-full border border-slate-700 object-cover" alt="" /> : <AvatarFallback name={log.viewers?.name || '?'} />}
                  </div>
                  
                  {/* ログの名前: window.open + e.stopPropagation */}
                  <div className="flex flex-col overflow-hidden relative z-10">
                    <span 
                      onClick={(e) => {
                        e.preventDefault(); e.stopPropagation();
                        if (log.viewers?.unique_id) window.open(`https://www.tiktok.com/@${log.viewers.unique_id}`, '_blank');
                      }}
                      className={`font-bold text-sm truncate flex items-center gap-1 ${log.viewers?.unique_id ? 'cursor-pointer hover:underline decoration-slate-400 underline-offset-4 text-slate-200' : 'text-slate-300'}`}
                    >
                      {log.viewers?.name || '不明'} {log.viewers?.unique_id && <ExternalLink size={10} className="text-slate-600"/>}
                    </span>
                    <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{format(new Date(log.created_at), 'MM/dd HH:mm:ss')}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-3 py-1.5 rounded-xl border border-amber-500/20 flex-shrink-0 ml-2">
                  <Coins size={14} className="text-amber-400"/><span className="font-black text-amber-400 text-sm">+{log.coins}</span>
                </div>
              </div>
            ))}
            {activeView === 'logs' && recentLogs.length === 0 && <div className="text-center py-10 text-slate-600 text-xs font-bold uppercase tracking-widest flex flex-col items-center justify-center"><Search className="mb-2 opacity-20" size={24}/> No Logs</div>}
          </div>
        </div>

        {/* スマホ用 リスナープロファイリング・モーダル */}
        {selectedViewer && viewerProfile && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in" onClick={() => setSelectedViewer(null)}>
            <div className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl relative pb-10 sm:pb-6 animate-in slide-in-from-bottom-full sm:slide-in-from-bottom-0" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-6 sm:hidden"></div>
              <button onClick={() => setSelectedViewer(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-full"><X size={16}/></button>
              <div className="mb-6"><h2 className="text-xl font-black text-white truncate pr-10">{selectedViewer.name}</h2><div className="flex items-center gap-2 mt-2"><span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">リスナー分析</span></div></div>
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/80"><p className="text-[9px] text-slate-500 font-bold mb-1">初回来訪</p><p className="text-xs font-bold text-slate-200">{format(parseISO(viewerProfile.first_seen), 'yyyy/MM/dd')}</p></div>
                <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/80"><p className="text-[9px] text-slate-500 font-bold mb-1">総支援額</p><p className="text-sm font-black text-amber-400">{viewerProfile.total_coins.toLocaleString()} <span className="text-[9px] text-slate-500 font-normal">ダイヤ</span></p></div>
              </div>
              <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/80 h-[180px] flex flex-col mb-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">曜日別 投下トレンド</h4>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={Object.keys(daysMap).map(d => ({ name: daysMap[d as keyof typeof daysMap], coins: viewerProfile.day_of_week?.[d] || 0 }))}>
                    <XAxis dataKey="name" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
                    <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px', fontSize: '10px' }} itemStyle={{ color: '#818cf8', fontWeight: 'bold' }} />
                    <Bar dataKey="coins" fill="#818cf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}