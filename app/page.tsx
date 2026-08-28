'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { ShieldCheck, Activity, Users, Flame, UserPlus, X, Clock, Calendar, Globe, CalendarSearch, Coins, Radio, AlertTriangle, Crown, Award } from 'lucide-react';
import { format } from 'date-fns';

type LiverStat = { system_id: string; username: string; is_active: boolean; total_coins: number; unique_listeners: number; core_fans: number; top1_coins: number; dependency_rate: number; };
type GiftLog = { id: number; created_at: string; coins: number; viewers: { name: string } | null; };
type VipListener = { viewer_id: string; viewer_name: string; total_coins: number; rank: number; };

export default function Dashboard() {
  const [stats, setStats] = useState<LiverStat[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'today' | 'month' | 'total' | 'custom'>('total');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isAdding, setIsAdding] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newSystemId, setNewSystemId] = useState('');

  const [selectedLiverId, setSelectedLiverId] = useState<string>('');
  const [detailLogs, setDetailLogs] = useState<GiftLog[]>([]);
  const [vipListeners, setVipListeners] = useState<VipListener[]>([]);

  useEffect(() => {
    if (activeTab !== 'custom') fetchIntelligenceData();
    
    const channel = supabase.channel('public:gift_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_logs' }, async (payload) => {
        if (activeTab !== 'custom') fetchIntelligenceData();
        if (selectedLiverId && selectedLiverId === payload.new.liver_id) {
            const { data: viewerData } = await supabase.from('viewers').select('name').eq('id', payload.new.viewer_id).single();
            const newLog: GiftLog = { id: payload.new.id, created_at: payload.new.created_at, coins: payload.new.coins, viewers: { name: viewerData?.name || '不明' } };
            setDetailLogs(prev => [newLog, ...prev].slice(0, 50));
            // リアルタイムでVIPリストも更新
            fetchVips(selectedLiverId);
        }
      }).subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [activeTab, selectedLiverId]);

  useEffect(() => {
    if (selectedLiverId) {
      fetchDetailLogs(selectedLiverId);
      fetchVips(selectedLiverId);
    }
  }, [selectedLiverId, activeTab]);

  const getTimeBounds = () => {
    let startIso = null; let endIso = null;
    const now = new Date();
    if (activeTab === 'custom' && startDate && endDate) {
      startIso = new Date(`${startDate}T00:00:00+09:00`).toISOString();
      endIso = new Date(`${endDate}T23:59:59+09:00`).toISOString();
    } else if (activeTab === 'today') {
      const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
      today.setHours(0, 0, 0, 0);
      startIso = new Date(today.getTime() - 9 * 60 * 60 * 1000).toISOString();
    } else if (activeTab === 'month') {
      const month = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
      month.setDate(1); month.setHours(0, 0, 0, 0);
      startIso = new Date(month.getTime() - 9 * 60 * 60 * 1000).toISOString();
    }
    return { startIso, endIso };
  };

  const fetchIntelligenceData = async () => {
    setLoading(true);
    const { startIso, endIso } = getTimeBounds();
    const { data, error } = await supabase.rpc('get_intelligence_stats', { p_start_date: startIso, p_end_date: endIso });
    if (data && !error) {
      const sorted = (data as LiverStat[]).sort((a, b) => b.total_coins - a.total_coins);
      setStats(sorted);
      if (sorted.length > 0 && !selectedLiverId) setSelectedLiverId(sorted[0].system_id);
    }
    setLoading(false);
  };

  const fetchDetailLogs = async (systemId: string) => {
    let query = supabase.from('gift_logs').select('id, created_at, coins, viewers(name)').eq('liver_id', systemId).order('created_at', { ascending: false }).limit(50);
    const { startIso, endIso } = getTimeBounds();
    if (startIso) query = query.gte('created_at', startIso);
    if (endIso) query = query.lte('created_at', endIso);
    const { data } = await query;
    if (data) setDetailLogs(data as unknown as GiftLog[]);
  };

  const fetchVips = async (systemId: string) => {
    const { startIso, endIso } = getTimeBounds();
    const { data, error } = await supabase.rpc('get_liver_vips', { p_system_id: systemId, p_start_date: startIso, p_end_date: endIso });
    if (data && !error) setVipListeners(data as VipListener[]);
  };

  const handleCustomFetch = () => { if (startDate && endDate) { fetchIntelligenceData(); if (selectedLiverId) { fetchDetailLogs(selectedLiverId); fetchVips(selectedLiverId); } } };

  const handleAddTarget = async () => {
    if (!newUsername.trim() || !newSystemId.trim()) return;
    const username = newUsername.replace('@', '').trim();
    const system_id = newSystemId.trim();
    const { error } = await supabase.rpc('add_target_liver', { p_system_id: system_id, p_username: username });
    if (!error) { setNewUsername(''); setNewSystemId(''); setIsAdding(false); fetchIntelligenceData(); } else { alert('追加に失敗しました。'); }
  };

  const toggleStatus = async (systemId: string, current: boolean) => {
    await supabase.from('target_livers').update({ is_active: !current }).eq('system_id', systemId);
    fetchIntelligenceData();
  };

  const systemTotalCoins = stats.reduce((sum, s) => sum + s.total_coins, 0);
  const systemCoreFans = stats.reduce((sum, s) => sum + s.core_fans, 0);
  const activeCount = stats.filter(s => s.is_active).length;
  const dangerCount = stats.filter(s => s.total_coins > 0 && s.dependency_rate >= 80).length;
  const safeCount = stats.filter(s => s.total_coins > 0 && s.dependency_rate < 50).length;
  const warningCount = stats.filter(s => s.total_coins > 0 && s.dependency_rate >= 50 && s.dependency_rate < 80).length;

  const selectedLiver = stats.find(s => s.system_id === selectedLiverId);
  const selectedLiverTotalCoins = selectedLiver?.total_coins || 1; // 0除算防止

  if (loading && stats.length === 0) return <div className="min-h-screen bg-slate-950 flex items-center justify-center font-bold text-slate-500">System Initializing...</div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-50 p-4 md:p-8 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* ヘッダーエリア */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800/80 pb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Hiyoko Intelligence</h1>
            <p className="text-slate-400 mt-1 text-sm font-medium">TikTok Live Strategic Management</p>
          </div>
          
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="flex space-x-1 bg-slate-900/80 p-1 rounded-xl shadow-inner border border-slate-800 backdrop-blur-sm">
              <button onClick={() => setActiveTab('today')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'today' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Clock size={14} className="mr-1.5" /> 本日</button>
              <button onClick={() => setActiveTab('month')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'month' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Calendar size={14} className="mr-1.5" /> 今月</button>
              <button onClick={() => setActiveTab('total')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'total' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Globe size={14} className="mr-1.5" /> 全期間</button>
              <button onClick={() => setActiveTab('custom')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'custom' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><CalendarSearch size={14} className="mr-1.5" /> 指定</button>
            </div>
            {activeTab === 'custom' && (
              <div className="flex items-center space-x-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 shadow-inner animate-in fade-in">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-950 border border-slate-700 text-sm rounded-lg px-3 py-1.5 outline-none font-bold text-slate-300 focus:border-indigo-500" />
                <span className="text-slate-500">〜</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-950 border border-slate-700 text-sm rounded-lg px-3 py-1.5 outline-none font-bold text-slate-300 focus:border-indigo-500" />
                <button onClick={handleCustomFetch} disabled={!startDate || !endDate} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors">集計</button>
              </div>
            )}
          </div>
        </header>

        {/* システムサマリー */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-slate-900/60 border border-slate-800/80 p-6 rounded-3xl shadow-lg relative overflow-hidden backdrop-blur-sm">
            <div className="absolute top-0 right-0 p-6 opacity-10"><Coins size={100} /></div>
            <p className="text-xs font-bold text-indigo-400 mb-2 tracking-wider uppercase">System Total Coins <span className="lowercase font-normal">({activeTab === 'today' ? '本日' : activeTab === 'month' ? '今月' : activeTab === 'total' ? '累計' : '指定期間'})</span></p>
            <h2 className="text-5xl font-black text-white mb-6 tracking-tight">{systemTotalCoins.toLocaleString()}</h2>
            <div className="flex gap-12">
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">所属ライバー</p>
                <p className="text-2xl font-bold text-white">{activeCount} <span className="text-sm text-slate-500 font-normal">名</span></p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-500 mb-1">システム全体コアファン (1K+)</p>
                <p className="text-2xl font-bold text-amber-400">{systemCoreFans} <span className="text-sm text-slate-500 font-normal">名</span></p>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-3xl shadow-sm flex flex-col justify-center backdrop-blur-sm">
            <h3 className="text-xs font-bold text-slate-400 mb-6 uppercase tracking-wider flex items-center"><ShieldCheck size={14} className="mr-2" />アカウント健全度分布</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div><span className="text-sm font-bold text-slate-300">健全 <span className="text-xs text-slate-500 font-normal">(50%未満)</span></span></div>
                <span className="font-black text-white text-xl">{safeCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></div><span className="text-sm font-bold text-slate-300">注意 <span className="text-xs text-slate-500 font-normal">(50%~79%)</span></span></div>
                <span className="font-black text-white text-xl">{warningCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"></div><span className="text-sm font-bold text-slate-300">危険 <span className="text-xs text-slate-500 font-normal">(80%以上)</span></span></div>
                <span className="font-black text-white text-xl">{dangerCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* マトリックス */}
        <div className="bg-slate-900/80 rounded-3xl shadow-lg border border-slate-800 overflow-hidden backdrop-blur-md">
          <div className="p-5 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50">
            <h3 className="text-sm font-black text-slate-200 uppercase tracking-widest">Liver Intelligence Matrix</h3>
            {isAdding ? (
              <div className="flex items-center space-x-2 bg-slate-800/50 p-1.5 rounded-xl border border-slate-700 animate-in fade-in">
                <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Username" className="text-xs px-3 py-2 outline-none w-32 bg-slate-950 border border-slate-700 rounded-lg text-white focus:border-indigo-500 transition-colors" />
                <input type="text" value={newSystemId} onChange={e => setNewSystemId(e.target.value)} placeholder="System ID" className="text-xs px-3 py-2 outline-none w-40 bg-slate-950 border border-slate-700 rounded-lg font-mono text-white focus:border-indigo-500 transition-colors" />
                <button onClick={handleAddTarget} className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors">Add</button>
                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-200 p-2 transition-colors"><X size={16}/></button>
              </div>
            ) : (
              <button onClick={() => setIsAdding(true)} className="flex items-center text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl transition-all border border-slate-700 hover:border-slate-600 shadow-sm">
                <UserPlus size={14} className="mr-2" /> Add Target
              </button>
            )}
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-950/50 text-[10px] uppercase tracking-wider font-black text-slate-500 border-b border-slate-800/80">
                  <th className="p-4 pl-6">Target</th>
                  <th className="p-4 text-right">Coins</th>
                  <th className="p-4 text-center">Unique</th>
                  <th className="p-4 text-center">Core (1K+)</th>
                  <th className="p-4 w-48">Top1 Dependency</th>
                  <th className="p-4 text-center">Health</th>
                  <th className="p-4 text-center pr-6">Track</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {stats.map((liver) => {
                  const isDanger = liver.dependency_rate >= 80 && liver.total_coins > 0;
                  const isSafe = liver.dependency_rate < 50 && liver.total_coins > 0;
                  const noData = liver.total_coins === 0;
                  const isSelected = selectedLiverId === liver.system_id;
                  
                  return (
                    <tr 
                      key={liver.system_id} 
                      onClick={() => setSelectedLiverId(liver.system_id)}
                      className={`cursor-pointer transition-colors group ${isSelected ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : 'hover:bg-slate-800/30 border-l-2 border-transparent'} ${!liver.is_active ? 'opacity-30 grayscale' : ''}`}
                    >
                      <td className="p-4 pl-6">
                        <div className={`font-bold ${isSelected ? 'text-indigo-400' : 'text-slate-200'}`}>{liver.username}</div>
                        <div className="text-[10px] text-slate-600 font-mono mt-0.5">{liver.system_id.slice(0, 10)}...</div>
                      </td>
                      <td className="p-4 text-right font-black text-slate-200">{liver.total_coins.toLocaleString()} <span className="text-[10px] text-slate-600 font-normal">c</span></td>
                      <td className="p-4 text-center font-bold text-slate-300">
                        <div className="flex items-center justify-center gap-1.5"><Users size={14} className="text-slate-500"/> {liver.unique_listeners.toLocaleString()}</div>
                      </td>
                      <td className="p-4 text-center font-black">
                        {liver.core_fans > 0 ? (
                          <div className="flex items-center justify-center gap-1 text-amber-400"><Flame size={14}/> {liver.core_fans.toLocaleString()}</div>
                        ) : (<span className="text-slate-700">0</span>)}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="w-10 text-xs font-black text-slate-300 text-right">{liver.total_coins > 0 ? `${liver.dependency_rate}%` : '-'}</span>
                          <div className="flex-grow h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-500 ${isDanger ? 'bg-rose-500' : isSafe ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(liver.total_coins > 0 ? liver.dependency_rate : 0, 100)}%` }}></div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {noData ? <span className="text-[10px] font-bold text-slate-600 uppercase border border-slate-700 px-2 py-0.5 rounded">No Data</span>
                         : isDanger ? <span className="text-[10px] font-black tracking-wider text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded uppercase inline-flex items-center gap-1 w-20 justify-center"><AlertTriangle size={12}/> Danger</span>
                         : isSafe ? <span className="text-[10px] font-black tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded uppercase inline-flex items-center gap-1 w-20 justify-center"><ShieldCheck size={12}/> Safe</span>
                         : <span className="text-[10px] font-black tracking-wider text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded uppercase inline-flex items-center gap-1 w-20 justify-center">Warning</span>}
                      </td>
                      <td className="p-4 pr-6 text-center" onClick={(e) => e.stopPropagation()}>
                         <button onClick={() => toggleStatus(liver.system_id, liver.is_active)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${liver.is_active ? 'bg-indigo-600' : 'bg-slate-700'}`}>
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${liver.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* 【新設】選択したライバーの戦略詳細エリア（VIP名簿 CRM ＆ リアルタイムログ） */}
        {selectedLiverId && selectedLiver && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4">
            
            {/* VIP CRM（メイン） */}
            <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col relative overflow-hidden backdrop-blur-md h-[500px]">
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none"><Crown size={120} /></div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest flex items-center">
                  <Crown className="mr-2 h-5 w-5 text-amber-400" /> @{selectedLiver.username} - VIP CRM (貢献度ランキング)
                </h3>
                <span className="text-[10px] font-bold text-slate-500 bg-slate-950 px-3 py-1 rounded-full border border-slate-800">{activeTab === 'custom' ? 'Past Data' : 'Real-time'}</span>
              </div>
              
              <div className="flex-grow overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                <div className="space-y-3">
                  {vipListeners.map((vip) => {
                    const contributionRate = selectedLiverTotalCoins > 0 ? (vip.total_coins / selectedLiverTotalCoins) * 100 : 0;
                    const isCoreFan = vip.total_coins >= 1000;
                    
                    return (
                      <div key={vip.viewer_id} className={`flex items-center p-3 rounded-xl border transition-colors ${vip.rank === 1 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-slate-950/50 border-slate-800/50 hover:bg-slate-800/80'}`}>
                        <div className="w-8 text-center flex-shrink-0">
                          {vip.rank === 1 ? <Crown size={20} className="text-amber-400 mx-auto" /> :
                           vip.rank === 2 ? <Award size={20} className="text-slate-300 mx-auto" /> :
                           vip.rank === 3 ? <Award size={20} className="text-amber-700 mx-auto" /> :
                           <span className="text-sm font-bold text-slate-500">{vip.rank}</span>}
                        </div>
                        <div className="flex-grow ml-4 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-sm truncate ${vip.rank === 1 ? 'text-amber-400' : 'text-slate-200'}`}>{vip.viewer_name}</span>
                            {isCoreFan && <span className="text-[10px] font-black tracking-widest text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded uppercase flex items-center"><Flame size={10} className="mr-0.5"/> Core</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5">
                            <div className="flex-grow h-1 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${vip.rank === 1 ? 'bg-amber-400' : isCoreFan ? 'bg-orange-400' : 'bg-indigo-500'}`} style={{ width: `${contributionRate}%` }}></div>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 w-8 text-right">{contributionRate.toFixed(1)}%</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end ml-4 flex-shrink-0">
                          <span className={`font-black text-sm ${vip.rank === 1 ? 'text-amber-400' : 'text-indigo-400'}`}>{vip.total_coins.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-500">ダイヤ</span>
                        </div>
                      </div>
                    );
                  })}
                  {vipListeners.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-slate-600 h-40 space-y-3"><Users className="opacity-20" size={40} /><p className="text-xs font-bold uppercase tracking-widest">No Listeners Found</p></div>
                  )}
                </div>
              </div>
            </div>

            {/* リアルタイムログ（サブ） */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col overflow-hidden backdrop-blur-md h-[500px]">
              <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest mb-4 flex items-center pb-4 border-b border-slate-800/80"><Coins className="mr-2 h-4 w-4 text-emerald-400" />Recent Logs</h3>
              <div className="flex-grow overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {detailLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 hover:bg-slate-800/80 transition-colors border border-slate-800/50">
                    <div className="flex flex-col overflow-hidden">
                      <span className="font-bold text-slate-200 text-sm truncate">{log.viewers?.name || '不明'}</span>
                      <span className="text-[10px] font-medium text-slate-500 mt-0.5">{format(new Date(log.created_at), 'MM/dd HH:mm:ss')}</span>
                    </div>
                    <div className="flex items-center bg-emerald-500/10 px-2 py-1 rounded-lg border border-emerald-500/20 whitespace-nowrap ml-2">
                      <span className="font-black text-emerald-400 text-xs">+{log.coins}</span>
                    </div>
                  </div>
                ))}
                {detailLogs.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-slate-600 space-y-3"><Radio className="animate-pulse h-8 w-8 opacity-20" /><p className="text-xs font-bold uppercase tracking-widest">No Logs Found</p></div>
                )}
              </div>
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}