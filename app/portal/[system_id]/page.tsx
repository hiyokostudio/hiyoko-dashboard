'use client';

import { useEffect, useState, use } from 'react';
import { supabase } from '@/utils/supabase';
import { Flame, Coins, Zap, TrendingUp, Search, Crown, Award, ExternalLink, Users, Activity } from 'lucide-react';
import { format } from 'date-fns';

type GiftLog = { id: number; created_at: string; coins: number; viewers: { name: string; unique_id?: string; avatar_url?: string } | null; };
type VipListener = { viewer_id: string; viewer_name: string; unique_id: string | null; avatar_url: string | null; total_coins: number; rank: number; };

export default function LiverPortal({ params }: { params: Promise<{ system_id: string }> }) {
  const { system_id } = use(params);
  
  const [liverInfo, setLiverInfo] = useState<{ username: string; avatar_url: string | null; reward_rate: number } | null>(null);
  const [totalCoins, setTotalCoins] = useState(0);
  const [exchangeRate, setExchangeRate] = useState(145.00);
  const [recentLogs, setRecentLogs] = useState<GiftLog[]>([]);
  const [vipListeners, setVipListeners] = useState<VipListener[]>([]);
  const [loading, setLoading] = useState(true);

  // UI状態管理
  const [activePeriod, setActivePeriod] = useState<'today' | 'month' | 'total' | 'custom'>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeView, setActiveView] = useState<'logs' | 'vips'>('logs'); // ログとVIPの切り替え

  const getTimeBounds = () => {
    let startIso = null; let endIso = null; const now = new Date();
    if (activePeriod === 'custom' && startDate && endDate) { startIso = new Date(startDate).toISOString(); endIso = new Date(endDate).toISOString(); }
    else if (activePeriod === 'today') { const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })); today.setHours(0, 0, 0, 0); startIso = new Date(today.getTime() - 9 * 60 * 60 * 1000).toISOString(); }
    else if (activePeriod === 'month') { const month = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })); month.setDate(1); month.setHours(0, 0, 0, 0); startIso = new Date(month.getTime() - 9 * 60 * 60 * 1000).toISOString(); }
    return { startIso, endIso };
  };

  useEffect(() => {
    if (activePeriod !== 'custom' || (startDate && endDate)) {
      fetchData();
    }
  }, [activePeriod, startDate, endDate, system_id]);

  useEffect(() => {
    const channel = supabase.channel(`portal:${system_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_logs', filter: `liver_id=eq.${system_id}` }, async (payload) => {
        const { startIso, endIso } = getTimeBounds();
        const logTime = new Date(payload.new.created_at).getTime();
        const startTime = startIso ? new Date(startIso).getTime() : 0;
        const endTime = endIso ? new Date(endIso).getTime() : Infinity;
        
        if (logTime >= startTime && logTime <= endTime) {
          setTotalCoins(prev => prev + payload.new.coins);
          const { data: viewerData } = await supabase.from('viewers').select('name, unique_id, avatar_url').eq('id', payload.new.viewer_id).single();
          const newLog: GiftLog = { id: payload.new.id, created_at: payload.new.created_at, coins: payload.new.coins, viewers: { name: viewerData?.name || '不明', unique_id: viewerData?.unique_id, avatar_url: viewerData?.avatar_url } };
          setRecentLogs(prev => [newLog, ...prev].slice(0, 50));
          fetchVips(); // VIPランキングも裏で更新
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [system_id, activePeriod, startDate, endDate]);

  const fetchVips = async () => {
    const { startIso, endIso } = getTimeBounds();
    const { data } = await supabase.rpc('get_liver_vips', { p_system_id: system_id, p_start_date: startIso, p_end_date: endIso });
    if (data) setVipListeners(data as VipListener[]);
  };

  const fetchData = async () => {
    setLoading(true);
    if (!liverInfo) {
      const { data: liver } = await supabase.from('target_livers').select('username, avatar_url, reward_rate').eq('system_id', system_id).single();
      if (liver) setLiverInfo(liver as any);
      try {
        const res = await fetch('/api/exchange');
        const data = await res.json();
        if (data.rate) setExchangeRate(data.rate);
      } catch (e) {}
    }

    const { startIso, endIso } = getTimeBounds();
    let query = supabase.from('gift_logs').select('id, created_at, coins, viewers(name, unique_id, avatar_url)').eq('liver_id', system_id).order('created_at', { ascending: false }).limit(50);
    let sumQuery = supabase.from('gift_logs').select('coins').eq('liver_id', system_id);
    
    if (startIso) { query = query.gte('created_at', startIso); sumQuery = sumQuery.gte('created_at', startIso); }
    if (endIso) { query = query.lte('created_at', endIso); sumQuery = sumQuery.lte('created_at', endIso); }

    const [logsRes, sumRes] = await Promise.all([query, sumQuery]);

    if (logsRes.data) setRecentLogs(logsRes.data as unknown as GiftLog[]);
    if (sumRes.data) setTotalCoins(sumRes.data.reduce((acc, row) => acc + row.coins, 0));
    
    await fetchVips();
    setLoading(false);
  };

  if (loading && !liverInfo) return <div className="min-h-screen bg-[#050505] flex items-center justify-center font-black text-indigo-500 animate-pulse">CONNECTING...</div>;
  if (!liverInfo) return <div className="min-h-screen bg-[#050505] flex items-center justify-center font-black text-rose-500">LIVER NOT FOUND</div>;

  const currentRewardUSD = totalCoins * (liverInfo.reward_rate / 10000);
  const currentRewardJPY = Math.floor(currentRewardUSD * exchangeRate);
  const unitPriceUSD = (1000 * (liverInfo.reward_rate / 10000)).toFixed(2);
  const coreFanCount = vipListeners.filter(v => v.total_coins >= 1000).length;

  const AvatarFallback = ({ name, size = "w-10 h-10", textSize = "text-sm" }: { name: string, size?: string, textSize?: string }) => (
    <div className={`${size} rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold ${textSize} uppercase flex-shrink-0`}>{name.charAt(0)}</div>
  );

  const openTikTok = (uniqueId?: string | null) => {
    if (uniqueId) window.open(`https://www.tiktok.com/@${uniqueId}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-[#050505] text-slate-50 font-sans sm:pb-0 pb-10">
      <div className="max-w-md mx-auto min-h-screen bg-[#0A0A0A] border-x border-slate-900/50 shadow-2xl relative overflow-hidden flex flex-col">
        <div className="absolute top-[-10%] left-[-20%] w-[140%] h-[40%] bg-indigo-600/20 blur-[120px] rounded-full pointer-events-none"></div>

        {/* ヘッダー */}
        <header className="px-6 pt-10 pb-6 flex items-center gap-4 relative z-10">
          {liverInfo.avatar_url ? (
            <img src={liverInfo.avatar_url} className="w-12 h-12 rounded-full border-2 border-indigo-500/50 object-cover shadow-[0_0_15px_rgba(99,102,241,0.4)]" alt=""/>
          ) : (
            <AvatarFallback name={liverInfo.username} size="w-12 h-12" textSize="text-xl" />
          )}
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tight text-white leading-tight">{liverInfo.username}</h1>
            <span className="text-[11px] text-slate-500 font-mono tracking-tighter mt-0.5">ID: {system_id}</span>
          </div>
        </header>

        {/* 期間指定 */}
        <div className="px-6 relative z-10 mb-4">
          <div className="flex space-x-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80 backdrop-blur-sm">
            <button onClick={() => setActivePeriod('today')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activePeriod === 'today' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>本日</button>
            <button onClick={() => setActivePeriod('month')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activePeriod === 'month' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>今月</button>
            <button onClick={() => setActivePeriod('total')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activePeriod === 'total' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>累計</button>
            <button onClick={() => setActivePeriod('custom')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activePeriod === 'custom' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400'}`}>指定</button>
          </div>
          {activePeriod === 'custom' && (
            <div className="mt-2 flex items-center space-x-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800/80 backdrop-blur-sm animate-in fade-in">
              <div className="flex-1 bg-slate-950 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors">
                <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full bg-transparent text-[10px] px-2 py-2 outline-none font-bold text-slate-300 [color-scheme:dark]" />
              </div>
              <span className="text-slate-500 text-xs">〜</span>
              <div className="flex-1 bg-slate-950 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors">
                <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full bg-transparent text-[10px] px-2 py-2 outline-none font-bold text-slate-300 [color-scheme:dark]" />
              </div>
            </div>
          )}
        </div>

        {/* 報酬ディスプレイ */}
        <div className="px-6 relative z-10">
          <div className="bg-gradient-to-br from-slate-900/80 to-black border border-slate-800/80 p-6 rounded-3xl shadow-2xl backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Zap size={100} className="text-indigo-400"/></div>
            
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-black text-slate-400 tracking-widest uppercase flex items-center">
                <TrendingUp size={12} className="mr-1.5 text-indigo-400"/> 推定報酬
              </p>
              {/* コアファンカウンター表示（モチベーション用） */}
              <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 px-2 py-1 rounded-full">
                <Flame size={12} className="text-orange-500"/>
                <span className="text-[10px] font-black text-orange-400">コアファン: {coreFanCount}名</span>
              </div>
            </div>
            
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-3xl font-black text-indigo-400">¥</span>
              <span className="text-6xl font-black text-white tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                {currentRewardJPY.toLocaleString()}
              </span>
            </div>
            
            <div className="mt-6 flex items-center gap-4 border-t border-slate-800/80 pt-4">
              <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase">獲得ダイヤ</p>
                <p className="text-xl font-black text-slate-200 tabular-nums flex items-center gap-1.5 mt-0.5"><Coins size={14} className="text-amber-400"/> {totalCoins.toLocaleString()}</p>
              </div>
              <div className="w-px h-8 bg-slate-800"></div>
              <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase">現在レート / 1K</p>
                <p className="text-xl font-black text-slate-200 tabular-nums mt-0.5">${unitPriceUSD} <span className="text-[10px] text-emerald-400 font-bold ml-1">({liverInfo.reward_rate}%)</span></p>
              </div>
            </div>
            <div className="mt-4 bg-slate-950/50 rounded-xl p-3 flex justify-between items-center border border-slate-800/50">
               <span className="text-[10px] font-bold text-slate-500">リアルタイム為替</span>
               <span className="text-xs font-black text-slate-300">1 USD = {exchangeRate.toFixed(2)} JPY</span>
            </div>
          </div>
        </div>

        {/* リストエリア (ログとVIPの切り替え) */}
        <div className="mt-6 px-6 relative z-10 flex-grow flex flex-col min-h-0">
          <div className="flex space-x-2 border-b border-slate-800/80 pb-3 mb-3">
            <button 
              onClick={() => setActiveView('logs')} 
              className={`flex items-center pb-2 border-b-2 transition-all ${activeView === 'logs' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
              <Activity size={14} className="mr-1.5"/> <span className="text-xs font-black tracking-wider uppercase">Live Activity</span>
            </button>
            <button 
              onClick={() => setActiveView('vips')} 
              className={`flex items-center pb-2 border-b-2 transition-all ${activeView === 'vips' ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
            >
              <Crown size={14} className="mr-1.5"/> <span className="text-xs font-black tracking-wider uppercase">Top Listeners</span>
            </button>
          </div>
          
          <div className="flex-grow overflow-y-auto space-y-3 pr-2 pb-6 scrollbar-none">
            {/* ★ ログビュー */}
            {activeView === 'logs' && recentLogs.map((log, i) => (
              <div key={log.id} className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-500 ${i === 0 ? 'bg-indigo-600/10 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'bg-slate-900/40 border-slate-800/50'}`}>
                <div className="flex items-center gap-3 overflow-hidden">
                  <div 
                    onClick={() => openTikTok(log.viewers?.unique_id)} 
                    className={`flex-shrink-0 ${log.viewers?.unique_id ? 'cursor-pointer hover:opacity-80 active:scale-95 transition-all' : ''}`}
                  >
                    {log.viewers?.avatar_url ? <img src={log.viewers.avatar_url} className="w-10 h-10 rounded-full border border-slate-700 object-cover" alt="" /> : <AvatarFallback name={log.viewers?.name || '?'} />}
                  </div>
                  <div className="flex flex-col overflow-hidden" onClick={() => openTikTok(log.viewers?.unique_id)}>
                    <div className={`font-bold text-sm truncate ${log.viewers?.unique_id ? 'cursor-pointer hover:underline text-slate-200' : 'text-slate-300'}`}>{log.viewers?.name || '不明'}</div>
                    <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5 flex items-center gap-1">
                      {log.viewers?.unique_id ? `@${log.viewers.unique_id}` : 'ID不明'}
                      {log.viewers?.unique_id && <ExternalLink size={8} className="text-slate-600"/>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-3 py-1.5 rounded-xl border border-amber-500/20 flex-shrink-0 ml-2">
                  <Coins size={14} className="text-amber-400"/>
                  <span className="font-black text-amber-400 text-sm">+{log.coins}</span>
                </div>
              </div>
            ))}
            {activeView === 'logs' && recentLogs.length === 0 && (
              <div className="text-center py-10 text-slate-600 text-xs font-bold uppercase tracking-widest flex flex-col items-center justify-center"><Search className="mb-2 opacity-20" size={24}/> ログが見つかりません</div>
            )}

            {/* ★ VIPランキングビュー */}
            {activeView === 'vips' && vipListeners.map((vip) => {
              const contributionRate = totalCoins > 0 ? (vip.total_coins / totalCoins) * 100 : 0;
              return (
                <div key={vip.viewer_id} className="flex items-center p-3 rounded-2xl bg-slate-900/60 border border-slate-800/50">
                  <div className="w-6 text-center flex-shrink-0">
                    {vip.rank === 1 ? <Crown size={16} className="text-amber-400 mx-auto" /> : vip.rank === 2 ? <Award size={16} className="text-slate-300 mx-auto" /> : vip.rank === 3 ? <Award size={16} className="text-amber-700 mx-auto" /> : <span className="text-xs font-bold text-slate-500">{vip.rank}</span>}
                  </div>
                  <div 
                    onClick={() => openTikTok(vip.unique_id)} 
                    className={`ml-2 flex-shrink-0 ${vip.unique_id ? 'cursor-pointer hover:opacity-80 active:scale-95 transition-all' : ''}`}
                  >
                    {vip.avatar_url ? <img src={vip.avatar_url} alt="" className="w-10 h-10 rounded-full border border-slate-700 object-cover" /> : <AvatarFallback name={vip.viewer_name} />}
                  </div>
                  <div className="flex-grow ml-3 min-w-0" onClick={() => openTikTok(vip.unique_id)}>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm truncate ${vip.unique_id ? 'cursor-pointer hover:underline' : ''} ${vip.rank === 1 ? 'text-amber-400' : 'text-slate-200'}`}>
                        {vip.viewer_name}
                      </span>
                      {vip.total_coins >= 1000 && <span className="text-[9px] font-black text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1 py-0.5 rounded flex items-center"><Flame size={8} className="mr-0.5"/> Core</span>}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono truncate mt-0.5 flex items-center gap-1">
                      {vip.unique_id ? `@${vip.unique_id}` : 'ID不明'}
                      {vip.unique_id && <ExternalLink size={8} className="text-slate-600"/>}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-grow h-1 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full rounded-full ${vip.rank === 1 ? 'bg-amber-400' : vip.total_coins >= 1000 ? 'bg-orange-400' : 'bg-indigo-500'}`} style={{ width: `${contributionRate}%` }}></div></div>
                      <span className="text-[9px] font-mono text-slate-500">{contributionRate.toFixed(1)}%</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end ml-3 flex-shrink-0">
                    <span className={`font-black text-sm ${vip.rank === 1 ? 'text-amber-400' : 'text-indigo-400'}`}>{vip.total_coins.toLocaleString()}</span>
                    <span className="text-[9px] text-slate-500">ダイヤ</span>
                  </div>
                </div>
              );
            })}
            {activeView === 'vips' && vipListeners.length === 0 && (
              <div className="text-center py-10 text-slate-600 text-xs font-bold uppercase tracking-widest flex flex-col items-center justify-center"><Users className="mb-2 opacity-20" size={24}/> リスナーが見つかりません</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}