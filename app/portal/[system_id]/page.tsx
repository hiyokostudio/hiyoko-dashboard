'use client';

import { useEffect, useState, use, useMemo } from 'react';
import { supabase } from '@/utils/supabase';
import { Flame, Coins, Zap, TrendingUp, Search, Crown, Award, ExternalLink, Users, Activity, ShieldCheck, AlertTriangle, Clock, X, Edit2, Check, Delete, List, Loader2, BarChart2, Moon, Sparkles, Target, BellRing } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

type GiftLog = { id: number; created_at: string; coins: number; count?: number; gift_name?: string; viewers: { id: string; name: string; unique_id?: string; avatar_url?: string } | null; };
type VipListener = { viewer_id: string; viewer_name: string; unique_id: string | null; avatar_url: string | null; total_coins: number; daily_core_count: number; visit_days: number; rank: number; first_seen?: string; last_seen?: string; };
type ListenerProfile = { first_seen: string; last_seen: string; total_coins: number; day_of_week: Record<string, number>; hour_of_day: Record<string, number>; };
type LiverStat = { system_id: string; username: string; is_active: boolean; total_coins: number; unique_listeners: number; core_fans: number; dependency_rate: number; };

export default function LiverPortal({ params }: { params: Promise<{ system_id: string }> }) {
  const { system_id } = use(params);
  
  const [liverInfo, setLiverInfo] = useState<{ username: string; liver_name?: string; avatar_url: string | null; reward_rate: number; pin_code: string } | null>(null);
  const [liverStat, setLiverStat] = useState<LiverStat | null>(null);
  const [exchangeRate, setExchangeRate] = useState(145.00);
  const [recentLogs, setRecentLogs] = useState<GiftLog[]>([]);
  const [vipListeners, setVipListeners] = useState<VipListener[]>([]);
  const [loading, setLoading] = useState(true);

  const [activePeriod, setActivePeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'total' | 'custom'>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeView, setActiveView] = useState<'vips' | 'logs'>('vips'); 

  const [selectedViewer, setSelectedViewer] = useState<{id: string, name: string} | null>(null);
  const [viewerProfile, setViewerProfile] = useState<ListenerProfile | null>(null);
  const [viewerLogs, setViewerLogs] = useState<GiftLog[]>([]);
  const [loadingViewerProfile, setLoadingViewerProfile] = useState(false);
  const [loadingViewerLogs, setLoadingViewerLogs] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'analytics' | 'logs'>('analytics');

  const [isEditingRate, setIsEditingRate] = useState(false);
  const [editRateValue, setEditRateValue] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const adminMasterKey = "hiyoko_god_mode_2026";
  const scrollbarClass = "[&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full";

  const AvatarFallback = ({ name, size = "w-10 h-10", textSize = "text-sm" }: { name: string, size?: string, textSize?: string }) => {
    const initial = name ? name.charAt(0) : '?';
    return <div className={`${size} rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold ${textSize} uppercase flex-shrink-0`}>{initial}</div>;
  };

  const SafeAvatar = ({ src, name, size = "w-10 h-10", textSize = "text-sm", extraClass = "" }: { src?: string | null, name: string, size?: string, textSize?: string, extraClass?: string }) => {
    const [imgError, setImgError] = useState(false);
    if (!src || imgError) return <AvatarFallback name={name} size={size} textSize={textSize} />;
    return <img src={src} onError={() => setImgError(true)} className={`${size} rounded-full border border-slate-700 object-cover flex-shrink-0 ${extraClass}`} alt=""/>;
  };

  const getTimeBounds = () => {
    let startIso = null; let endIso = null;
    if (activePeriod === 'custom' && startDate && endDate) { 
      startIso = new Date(startDate).toISOString(); endIso = new Date(endDate).toISOString(); 
    } else if (activePeriod !== 'total') {
      const jstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
      if (activePeriod === 'today') {
        const yyyy = jstNow.getFullYear(); const mm = String(jstNow.getMonth() + 1).padStart(2, '0'); const dd = String(jstNow.getDate()).padStart(2, '0');
        startIso = new Date(`${yyyy}-${mm}-${dd}T00:00:00+09:00`).toISOString();
      } else if (activePeriod === 'yesterday') {
        const jstYesterday = new Date(jstNow); jstYesterday.setDate(jstYesterday.getDate() - 1);
        const yyyy = jstYesterday.getFullYear(); const mm = String(jstYesterday.getMonth() + 1).padStart(2, '0'); const dd = String(jstYesterday.getDate()).padStart(2, '0');
        startIso = new Date(`${yyyy}-${mm}-${dd}T00:00:00+09:00`).toISOString(); endIso = new Date(`${yyyy}-${mm}-${dd}T23:59:59.999+09:00`).toISOString();
      } else if (activePeriod === 'week') {
        const jstWeekAgo = new Date(jstNow); jstWeekAgo.setDate(jstWeekAgo.getDate() - 6);
        const yyyy = jstWeekAgo.getFullYear(); const mm = String(jstWeekAgo.getMonth() + 1).padStart(2, '0'); const dd = String(jstWeekAgo.getDate()).padStart(2, '0');
        startIso = new Date(`${yyyy}-${mm}-${dd}T00:00:00+09:00`).toISOString();
      } else if (activePeriod === 'month') {
        const yyyy = jstNow.getFullYear(); const mm = String(jstNow.getMonth() + 1).padStart(2, '0');
        startIso = new Date(`${yyyy}-${mm}-01T00:00:00+09:00`).toISOString();
      }
    }
    return { startIso, endIso };
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const godmode = urlParams.get('godmode');
    if (godmode === adminMasterKey) { setIsUnlocked(true); window.history.replaceState({}, document.title, window.location.pathname); }
    else { const unlocked = localStorage.getItem(`unlocked_portal_${system_id}`); if (unlocked === 'true') setIsUnlocked(true); }
  }, [system_id]);

  useEffect(() => {
    if (activePeriod !== 'custom' || (startDate && endDate)) fetchData();
  }, [activePeriod, startDate, endDate, system_id]);

  useEffect(() => {
    const channel = supabase.channel(`portal:gift_logs_all`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_logs' }, async (payload) => {
        if (String(payload.new.liver_id) === String(system_id)) {
            const { data: viewerData } = await supabase.from('viewers').select('id, name, unique_id, avatar_url').eq('id', payload.new.viewer_id).single();
            const newLog: GiftLog = { 
              id: payload.new.id, created_at: payload.new.created_at, coins: payload.new.coins, count: payload.new.count, gift_name: payload.new.gift_name,
              viewers: viewerData ? { id: viewerData.id, name: viewerData.name, unique_id: viewerData.unique_id, avatar_url: viewerData.avatar_url } : null
            };
            setRecentLogs(prev => [newLog, ...prev].slice(0, 50));
            const { startIso, endIso } = getTimeBounds(); const params: any = { p_system_id: system_id };
            if (startIso) params.p_start_date = startIso; if (endIso) params.p_end_date = endIso;
            const { data } = await supabase.rpc('get_liver_vips_advanced', params);
            setVipListeners(data ? (data as VipListener[]) : []);
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [system_id, activePeriod, startDate, endDate]);

  useEffect(() => {
    if (pinInput.length === 4) {
      if (liverInfo && pinInput === (liverInfo.pin_code || '0000')) {
        localStorage.setItem(`unlocked_portal_${system_id}`, 'true'); setTimeout(() => setIsUnlocked(true), 200);
      } else {
        setPinError(true); setTimeout(() => { setPinInput(''); setPinError(false); }, 500); 
      }
    }
  }, [pinInput, liverInfo, system_id]);

  useEffect(() => {
    if (selectedViewer && system_id) {
      setActiveModalTab('analytics');
      fetchViewerProfile(system_id, selectedViewer.id);
      fetchViewerLogs(system_id, selectedViewer.id);
    } else {
      setViewerProfile(null);
      setViewerLogs([]);
    }
  }, [selectedViewer]);

  const fetchData = async () => {
    setLoading(true);
    if (!liverInfo) {
      const { data: liver } = await supabase.from('target_livers').select('username, liver_name, avatar_url, reward_rate, pin_code').eq('system_id', system_id).single();
      if (liver) setLiverInfo(liver as any);
      try { const res = await fetch('/api/exchange'); const data = await res.json(); if (data.rate) setExchangeRate(data.rate); } catch (e) {}
    }

    const { startIso, endIso } = getTimeBounds();
    let query = supabase.from('gift_logs').select('id, created_at, coins, count, gift_name, viewers(id, name, unique_id, avatar_url)').eq('liver_id', system_id).order('created_at', { ascending: false }).limit(50);
    if (startIso) query = query.gte('created_at', startIso); if (endIso) query = query.lte('created_at', endIso); 
    const { data: logsRes } = await query; if (logsRes) setRecentLogs(logsRes as unknown as GiftLog[]);
    
    const params: any = { p_system_id: system_id };
    if (startIso) params.p_start_date = startIso; if (endIso) params.p_end_date = endIso;
    const { data: vips } = await supabase.rpc('get_liver_vips_advanced', params); setVipListeners(vips ? (vips as VipListener[]) : []);

    const { data: iData } = await supabase.rpc('get_intelligence_stats', { p_start_date: startIso, p_end_date: endIso });
    if (iData) { const myStat = (iData as LiverStat[]).find(s => s.system_id === system_id); if (myStat) setLiverStat(myStat); }
    setLoading(false);
  };

  const fetchViewerProfile = async (liverId: string, viewerId: string) => {
    setLoadingViewerProfile(true);
    try {
      const { data } = await supabase.rpc('get_listener_profile', { p_liver_id: liverId, p_viewer_id: viewerId });
      setViewerProfile(data as ListenerProfile || null);
    } catch (e) { setViewerProfile(null); } finally { setLoadingViewerProfile(false); }
  };

  const fetchViewerLogs = async (liverId: string, viewerId: string) => {
    setLoadingViewerLogs(true);
    try {
      const { startIso, endIso } = getTimeBounds();
      let query = supabase.from('gift_logs').select('id, created_at, coins, count, gift_name').eq('liver_id', liverId).eq('viewer_id', viewerId).order('created_at', { ascending: false }).limit(200);
      if (startIso) query = query.gte('created_at', startIso); if (endIso) query = query.lte('created_at', endIso);
      const { data } = await query; setViewerLogs(data as any || []);
    } catch (e) { setViewerLogs([]); } finally { setLoadingViewerLogs(false); }
  };

  const handleRateUpdate = async () => {
    const num = parseFloat(editRateValue); if (isNaN(num) || num < 0 || num > 100) return alert('正しい数値を入力してください');
    const rateVal = Number(num.toFixed(1));
    const { error } = await supabase.from('target_livers').update({ reward_rate: rateVal }).eq('system_id', system_id);
    if (!error) { setIsEditingRate(false); setLiverInfo(prev => prev ? { ...prev, reward_rate: rateVal } : prev); } 
    else { alert('更新に失敗しました'); }
  };

  const dowData = useMemo(() => {
    if (!viewerProfile) return [];
    const daysMap: Record<string, string> = { 'Monday': '月', 'Tuesday': '火', 'Wednesday': '水', 'Thursday': '木', 'Friday': '金', 'Saturday': '土', 'Sunday': '日' };
    return Object.keys(daysMap).map(d => ({ name: daysMap[d], coins: viewerProfile.day_of_week?.[d] || 0 }));
  }, [viewerProfile]);

  const hodData = useMemo(() => {
    if (!viewerProfile) return [];
    return Array.from({length: 24}, (_, i) => ({ name: `${i}時`, coins: viewerProfile.hour_of_day?.[i.toString()] || 0 }));
  }, [viewerProfile]);

  const totalCoins = liverStat?.total_coins || 0;
  const isDanger = (liverStat?.dependency_rate || 0) >= 80 && totalCoins > 0;

  // 💡 ポータル用 ネクストアクション（AI指示）
  const actionableAlerts = useMemo(() => {
    const alerts = [];
    if (isDanger) alerts.push({ id: 'danger', type: 'danger', icon: AlertTriangle, text: '特定の太客への依存度が高すぎます。新規リスナーへ積極的に声をかけましょう。' });
    
    if (activePeriod === 'today') {
      const nearCore = vipListeners.filter(v => v.total_coins >= 700 && v.total_coins < 1000);
      nearCore.forEach(v => alerts.push({ id: `core_${v.viewer_id}`, type: 'opportunity', icon: Target, text: `${v.viewer_name}さんがDaily Core(1K)まであと${1000 - v.total_coins}ダイヤ！今日中に声をかけましょう。` }));
    } else if (activePeriod === 'week') {
      const nearWeekly = vipListeners.filter(v => v.total_coins >= 3500 && v.total_coins < 5000);
      nearWeekly.forEach(v => alerts.push({ id: `week_${v.viewer_id}`, type: 'opportunity', icon: Target, text: `${v.viewer_name}さんがWeekly Core(5K)目前です！イベントへの協力をお願いしてみましょう。` }));
    } else if (activePeriod === 'month') {
      const nearMonthly = vipListeners.filter(v => v.total_coins >= 15000 && v.total_coins < 20000);
      nearMonthly.forEach(v => alerts.push({ id: `month_${v.viewer_id}`, type: 'opportunity', icon: Target, text: `${v.viewer_name}さんがMonthly Core(20K)目前です！最高の感謝を伝えてください。` }));
    }
    
    return alerts;
  }, [vipListeners, isDanger, activePeriod]);

  const coreCount = vipListeners.filter(v => v.total_coins >= (activePeriod==='month'?20000 : activePeriod==='week'?5000 : 1000)).length;
  const middleCount = vipListeners.filter(v => v.total_coins >= (activePeriod==='month'?5000 : activePeriod==='week'?1000 : 100) && v.total_coins < (activePeriod==='month'?20000 : activePeriod==='week'?5000 : 1000)).length;
  const lightCount = vipListeners.filter(v => v.total_coins > 0 && v.total_coins < (activePeriod==='month'?5000 : activePeriod==='week'?1000 : 100)).length;
  const totalAnalyzed = coreCount + middleCount + lightCount || 1;

  if (loading && !liverInfo) return <div className="min-h-screen bg-[#050505] flex items-center justify-center font-black text-indigo-500 animate-pulse">システム接続中...</div>;
  if (!liverInfo) return <div className="min-h-screen bg-[#050505] flex items-center justify-center font-black text-rose-500">データが見つかりません</div>;

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center font-sans relative overflow-hidden select-none">
        <div className="absolute top-[-20%] left-[-20%] w-[140%] h-[60%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none"></div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="z-10 flex flex-col items-center w-full max-w-sm px-8">
          <SafeAvatar src={liverInfo.avatar_url} name={liverInfo.liver_name || liverInfo.username} size="w-20 h-20" textSize="text-2xl" extraClass="mb-4 shadow-xl" />
          <div className="flex flex-col items-center justify-center"><h1 className="text-xl font-black text-white mb-1">{liverInfo.liver_name || liverInfo.username}</h1><p className="text-[11px] font-mono font-semibold text-indigo-400/80 mb-8 tracking-wider">@{liverInfo.username}</p></div>
          <div className={`flex gap-5 mb-12 ${pinError ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}>
            {[0, 1, 2, 3].map(i => (<div key={i} className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${pinInput.length > i ? 'bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.8)] scale-110' : 'bg-slate-800'}`}></div>))}
          </div>
          <div className="grid grid-cols-3 gap-x-8 gap-y-6 w-full max-w-[280px]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (<button key={num} onClick={() => pinInput.length < 4 && setPinInput(p => p + num)} className="w-16 h-16 rounded-full bg-slate-900/40 border border-slate-800/80 text-2xl font-mono text-white flex items-center justify-center hover:bg-slate-800 active:scale-90 active:bg-indigo-600/30 transition-all mx-auto shadow-sm">{num}</button>))}
            <div className="w-16 h-16 mx-auto"></div>
            <button onClick={() => pinInput.length < 4 && setPinInput(p => p + '0')} className="w-16 h-16 rounded-full bg-slate-900/40 border border-slate-800/80 text-2xl font-mono text-white flex items-center justify-center hover:bg-slate-800 active:scale-90 active:bg-indigo-600/30 transition-all mx-auto shadow-sm">0</button>
            <button onClick={() => setPinInput(p => p.slice(0, -1))} className="w-16 h-16 rounded-full text-slate-500 flex items-center justify-center hover:text-white active:scale-90 active:bg-slate-800 transition-all mx-auto"><Delete size={24} /></button>
          </div>
        </motion.div>
        <style dangerouslySetInnerHTML={{__html: `@keyframes shake { 0%, 100% { transform: translateX(0); } 20%, 60% { transform: translateX(-10px); } 40%, 80% { transform: translateX(10px); } }`}} />
      </div>
    );
  }

  const currentRewardUSD = totalCoins * (liverInfo.reward_rate / 10000);
  const currentRewardJPY = Math.floor(currentRewardUSD * exchangeRate);
  const unitPriceUSD = (1000 * (liverInfo.reward_rate / 10000)).toFixed(2);

  return (
    <div className="min-h-screen bg-[#050505] text-slate-50 font-sans sm:pb-0 pb-10">
      <div className="max-w-md mx-auto min-h-screen bg-[#0A0A0A] border-x border-slate-900/50 shadow-2xl relative overflow-hidden flex flex-col">
        <div className="absolute top-[-10%] left-[-20%] w-[140%] h-[40%] bg-indigo-600/15 blur-[120px] rounded-full pointer-events-none"></div>

        <header className="px-6 pt-10 pb-4 flex items-center justify-between gap-4 relative z-10">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-4">
            <SafeAvatar src={liverInfo.avatar_url} name={liverInfo.liver_name || liverInfo.username} size="w-12 h-12" textSize="text-xl" extraClass="border-2 border-indigo-500/50 shadow-[0_0_15px_rgba(99,102,241,0.4)]" />
            <div className="flex flex-col">
              <h1 className="text-xl font-black tracking-tight text-white leading-tight">{liverInfo.liver_name || liverInfo.username}</h1>
              <span className="text-[12px] font-mono font-semibold text-indigo-400/90 mt-0.5 tracking-wider">@{liverInfo.username}</span>
            </div>
          </motion.div>
          <button onClick={() => { localStorage.removeItem(`unlocked_portal_${system_id}`); setIsUnlocked(false); }} className="p-2 text-slate-600 hover:text-slate-300 bg-slate-900/50 rounded-full border border-slate-800 transition-colors"><X size={16} /></button>
        </header>

        <div className="px-5 relative z-10 mb-4">
          <div className="flex space-x-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800/80 backdrop-blur-sm relative">
            {['today', 'yesterday', 'week', 'month', 'total'].map((period) => (
              <button key={period} onClick={() => setActivePeriod(period as any)} className={`flex-1 py-2 rounded-lg text-[10px] font-bold transition-colors relative z-10 ${activePeriod === period ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {activePeriod === period && <motion.div layoutId="activeTabBg" className="absolute inset-0 bg-indigo-600 rounded-lg shadow-md -z-10" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />}
                {period === 'today' ? '本日' : period === 'yesterday' ? '昨日' : period === 'week' ? '7日間' : period === 'month' ? '今月' : '累計'}
              </button>
            ))}
          </div>
        </div>

        <div className="px-5 relative z-10 flex flex-col gap-3">
          
          <AnimatePresence>
            {(activePeriod === 'today' || activePeriod === 'week' || activePeriod === 'month') && actionableAlerts.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-indigo-900/40 to-slate-900 border border-indigo-500/30 rounded-2xl p-3 shadow-lg backdrop-blur-md relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-20"><Sparkles size={40} className="text-indigo-400"/></div>
                <h3 className="text-[10px] font-black text-indigo-300 mb-2 flex items-center"><Sparkles size={12} className="mr-1.5"/> 推奨アクション</h3>
                <div className="space-y-1.5 relative z-10">
                  {actionableAlerts.map(alert => (
                    <motion.div key={alert.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={`flex items-start gap-2 p-2 rounded-lg text-xs font-bold leading-tight ${alert.type === 'danger' ? 'bg-rose-500/10 text-rose-200 border border-rose-500/20' : alert.type === 'opportunity' ? 'bg-amber-500/10 text-amber-200 border border-amber-500/20' : 'bg-slate-800/50 text-slate-300 border border-slate-700/50'}`}>
                      <alert.icon size={14} className={`flex-shrink-0 mt-0.5 ${alert.type === 'danger' ? 'text-rose-400' : alert.type === 'opportunity' ? 'text-amber-400' : 'text-slate-400'}`} />
                      <span>{alert.text}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div layout className="bg-gradient-to-br from-slate-900/80 to-black border border-slate-800/80 p-5 rounded-3xl shadow-2xl backdrop-blur-md relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><Zap size={100} className="text-indigo-400"/></div>
            <p className="text-[11px] font-black text-slate-400 tracking-widest uppercase mb-1 flex items-center">
              <TrendingUp size={12} className="mr-1.5 text-indigo-400"/> 推定報酬 ({activePeriod === 'today' ? '本日' : activePeriod === 'yesterday' ? '昨日' : activePeriod === 'week' ? '直近7日間' : activePeriod === 'month' ? '今月' : '累計'})
            </p>
            <div className="flex items-baseline gap-1 mt-1"><span className="text-2xl font-black text-indigo-400">¥</span><motion.span key={currentRewardJPY} initial={{ opacity: 0.5, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-5xl font-black text-white tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{currentRewardJPY.toLocaleString()}</motion.span></div>
            <div className="mt-4 flex items-center gap-4 border-t border-slate-800/80 pt-3">
              <div className="flex-1"><p className="text-[10px] font-bold text-slate-500 uppercase">獲得ダイヤ</p><p className="text-lg font-black text-slate-200 tabular-nums flex items-center gap-1.5 mt-0.5"><Coins size={12} className="text-amber-400"/> {totalCoins.toLocaleString()}</p></div>
              <div className="w-px h-8 bg-slate-800"></div>
              
              <div className="flex-1">
                <p className="text-[10px] font-bold text-slate-500 uppercase">現在レート / 1K</p>
                <div className="text-lg font-black text-slate-200 tabular-nums mt-0.5 flex items-center flex-wrap gap-y-1">
                  ${unitPriceUSD} 
                  {isEditingRate ? (
                    <div className="inline-flex items-center ml-1.5 bg-slate-900 rounded border border-indigo-500 pl-1 pr-0.5">
                      <input type="number" step="0.1" value={editRateValue} onChange={e => setEditRateValue(e.target.value)} className="w-12 bg-transparent text-[11px] text-white outline-none text-right font-mono" autoFocus />
                      <span className="text-[10px] text-slate-400 mr-1">%</span>
                      <button onClick={handleRateUpdate} className="text-emerald-400 p-1 hover:bg-slate-800 rounded"><Check size={12}/></button>
                      <button onClick={() => setIsEditingRate(false)} className="text-slate-500 p-1 hover:bg-slate-800 rounded"><X size={12}/></button>
                    </div>
                  ) : (
                    <span onClick={() => { setIsEditingRate(true); setEditRateValue(liverInfo.reward_rate.toString()); }} className="text-[10px] text-emerald-400 font-bold ml-1.5 cursor-pointer hover:bg-emerald-500/20 px-1 py-0.5 rounded transition-colors inline-flex items-center bg-slate-900/50 border border-slate-800">
                      ({Number(liverInfo.reward_rate).toFixed(1)}%) <Edit2 size={8} className="ml-1 opacity-70"/>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <div className="mt-5 px-5 relative z-10 flex-grow flex flex-col min-h-0">
          {activePeriod !== 'total' && totalAnalyzed > 0 && (
            <div className="mb-3 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80 relative z-10">
              <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1.5 uppercase tracking-widest">
                <span>Core層 <span className="text-amber-400">{coreCount}</span></span>
                <span>ミドル層 <span className="text-indigo-400">{middleCount}</span></span>
                <span>ライト層 <span className="text-slate-500">{lightCount}</span></span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 flex overflow-hidden">
                <motion.div initial={{ width: 0 }} animate={{ width: `${(coreCount/totalAnalyzed)*100}%` }} transition={{ duration: 1 }} className="bg-amber-500"></motion.div>
                <motion.div initial={{ width: 0 }} animate={{ width: `${(middleCount/totalAnalyzed)*100}%` }} transition={{ duration: 1, delay: 0.2 }} className="bg-indigo-500"></motion.div>
                <motion.div initial={{ width: 0 }} animate={{ width: `${(lightCount/totalAnalyzed)*100}%` }} transition={{ duration: 1, delay: 0.4 }} className="bg-slate-500"></motion.div>
              </div>
            </div>
          )}

          <div className="flex space-x-2 border-b border-slate-800/80 pb-2 mb-3 px-1 relative">
            {['vips', 'logs'].map((view) => (
              <button key={view} onClick={() => setActiveView(view as any)} className={`flex-1 flex justify-center items-center pb-2 transition-colors relative ${activeView === view ? (view === 'vips' ? 'text-amber-400' : 'text-indigo-400') : 'text-slate-500 hover:text-slate-300'}`}>
                {view === 'vips' ? <Crown size={14} className="mr-1.5"/> : <Activity size={14} className="mr-1.5"/>}
                <span className="text-[11px] font-black tracking-wider uppercase">{view === 'vips' ? '重要リスナー' : 'リアルタイム履歴'}</span>
                {activeView === view && <motion.div layoutId="activeViewBorder" className={`absolute bottom-[-2px] left-0 right-0 h-0.5 ${view === 'vips' ? 'bg-amber-500' : 'bg-indigo-500'}`} />}
              </button>
            ))}
          </div>
          
          <div className={`flex-grow overflow-y-auto space-y-2 pr-1 pb-6 ${scrollbarClass}`}>
            <AnimatePresence mode="popLayout">
              {activeView === 'vips' && vipListeners.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-48 text-slate-600"><Users size={48} className="opacity-20 mb-4" /><p className="font-bold text-sm tracking-widest">リスナーデータがありません</p></motion.div>
              )}
              {activeView === 'vips' && vipListeners.map((vip) => {
                const threshold = activePeriod === 'month' ? 20000 : activePeriod === 'week' ? 5000 : 1000;
                const isCore = vip.total_coins >= threshold;
                const isNearCore = !isCore && vip.total_coins >= (threshold * 0.7);
                const coinsToCore = threshold - vip.total_coins;
                const progress = Math.min((vip.total_coins / threshold) * 100, 100);
                
                const isDaily = activePeriod === 'today' || activePeriod === 'yesterday';
                const isWeekly = activePeriod === 'week';
                const isMonthly = activePeriod === 'month';

                return (
                  <motion.div layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} key={vip.viewer_id} onClick={() => setSelectedViewer({id: vip.viewer_id, name: vip.viewer_name})} className={`flex flex-col p-3 rounded-2xl border transition-all cursor-pointer active:scale-[0.98] ${vip.rank === 1 ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20' : isNearCore ? 'bg-orange-500/10 border-orange-500/40 shadow-[0_0_15px_rgba(249,115,22,0.15)] hover:bg-orange-500/20' : 'bg-slate-900/60 border-slate-800/50 hover:bg-slate-800/80'}`}>
                    <div className="flex items-center">
                      <div className="w-6 text-center flex-shrink-0">
                        {vip.rank === 1 ? <Crown size={16} className="text-amber-400 mx-auto" /> : vip.rank === 2 ? <Award size={16} className="text-slate-300 mx-auto" /> : vip.rank === 3 ? <Award size={16} className="text-amber-700 mx-auto" /> : <span className="text-xs font-bold text-slate-500">{vip.rank}</span>}
                      </div>
                      
                      <div className={`ml-2 flex-shrink-0 relative z-10 cursor-pointer ${vip.unique_id ? 'hover:opacity-80 transition-opacity' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (vip.unique_id) window.open(`https://www.tiktok.com/@${vip.unique_id}`, '_blank'); }}>
                        <SafeAvatar src={vip.avatar_url} name={vip.viewer_name} size="w-10 h-10" />
                      </div>

                      <div className="flex-grow ml-3 min-w-0">
                        <div className="flex flex-col relative z-10">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (vip.unique_id) window.open(`https://www.tiktok.com/@${vip.unique_id}`, '_blank'); }} className={`font-bold text-[13px] truncate cursor-pointer ${vip.unique_id ? 'hover:underline decoration-slate-400 underline-offset-4' : ''} ${vip.rank === 1 ? 'text-amber-400' : 'text-slate-200'}`}>
                              {vip.viewer_name}
                            </span>
                            {isDaily && isCore && <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1 py-0.5 rounded flex items-center shadow-[0_0_8px_rgba(251,191,36,0.3)]"><Crown size={8} className="mr-0.5"/> Daily Core</span>}
                            {isWeekly && isCore && <span className="text-[9px] font-black text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1 py-0.5 rounded flex items-center shadow-[0_0_8px_rgba(56,189,248,0.3)]"><Award size={8} className="mr-0.5"/> Weekly Core</span>}
                            {isMonthly && isCore && <span className="text-[9px] font-black text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/20 px-1 py-0.5 rounded flex items-center shadow-[0_0_8px_rgba(232,121,249,0.3)]"><Flame size={8} className="mr-0.5"/> Monthly Core</span>}
                            {!isDaily && vip.daily_core_count > 0 && <span className="text-[9px] font-bold text-amber-500/80 bg-amber-500/10 border border-amber-500/20 px-1 py-0.5 rounded flex items-center">👑 Daily <span className="text-amber-400 font-black tracking-widest ml-0.5">[ x{vip.daily_core_count} ]</span></span>}
                          </div>
                          
                          <div className="flex items-center gap-2 mt-0.5">
                            <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (vip.unique_id) window.open(`https://www.tiktok.com/@${vip.unique_id}`, '_blank'); }} className="text-[11px] font-mono font-semibold text-indigo-400/90 truncate cursor-pointer hover:underline">
                              {vip.unique_id ? `@${vip.unique_id}` : '@unknown'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0 ml-2">
                        <span className={`font-black text-sm tabular-nums ${vip.rank === 1 ? 'text-amber-400' : 'text-indigo-400'}`}>{vip.total_coins.toLocaleString()}</span>
                        <span className="text-[9px] text-slate-500 font-medium flex items-center mt-1"><Clock size={8} className="mr-1 opacity-50"/> {vip.last_seen ? format(parseISO(vip.last_seen), 'MM/dd') : '-'}</span>
                      </div>
                    </div>
                    {!isCore && activePeriod !== 'total' && (
                      <div className="mt-3 ml-10 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                        <div className="flex justify-between items-center mb-1"><span className="text-[9px] font-bold text-slate-400 tracking-widest">Core到達チャレンジ</span><span className={`text-[9px] font-black ${isNearCore ? 'text-amber-400 animate-pulse' : 'text-orange-400'}`}>あと {coinsToCore}</span></div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 1 }} className={`h-full rounded-full ${isNearCore ? 'bg-amber-400' : 'bg-orange-500'}`}></motion.div></div>
                      </div>
                    )}
                  </motion.div>
                );
              })}

              {activeView === 'logs' && recentLogs.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-48 text-slate-600"><Search size={48} className="opacity-20 mb-4" /><p className="font-bold text-sm tracking-widest">履歴がありません</p></motion.div>
              )}
              {activeView === 'logs' && recentLogs.map((log, i) => (
                <motion.div layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }} key={log.id} onClick={() => log.viewers && setSelectedViewer({id: log.viewers.id, name: log.viewers.name})} className={`flex items-center justify-between p-3 rounded-2xl border transition-all duration-500 cursor-pointer active:scale-[0.98] ${i === 0 ? 'bg-indigo-600/10 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'bg-slate-900/40 border-slate-800/50 hover:bg-slate-800/80'}`}>
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className={`flex-shrink-0 relative z-10 cursor-pointer ${log.viewers?.unique_id ? 'hover:opacity-80 transition-opacity' : ''}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (log.viewers?.unique_id) window.open(`https://www.tiktok.com/@${log.viewers.unique_id}`, '_blank'); }}>
                      <SafeAvatar src={log.viewers?.avatar_url} name={log.viewers?.name || '?'} size="w-10 h-10" />
                    </div>
                    <div className="flex flex-col overflow-hidden relative z-10">
                      <span className={`font-bold text-sm truncate cursor-pointer flex items-center gap-1 ${log.viewers?.unique_id ? 'hover:underline decoration-slate-400 underline-offset-4 text-slate-200' : 'text-slate-300'}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (log.viewers?.unique_id) window.open(`https://www.tiktok.com/@${log.viewers.unique_id}`, '_blank'); }}>
                        {log.viewers?.name || '不明'}
                      </span>
                      <div className="text-[10px] text-slate-500 mt-0.5 flex items-center"><Clock size={10} className="mr-1"/> {format(new Date(log.created_at), 'MM/dd HH:mm:ss')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    {log.gift_name && <span className="text-[10px] font-bold text-slate-400 truncate max-w-[60px]" title={log.gift_name}>{log.gift_name}</span>}
                    <div className="flex items-center gap-1 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                      <Coins size={14} className="text-emerald-400"/><span className="font-black text-emerald-400 text-sm tabular-nums">+{log.coins}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence>
          {selectedViewer && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm" onClick={() => setSelectedViewer(null)}>
              <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="bg-slate-900 border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-3xl p-6 w-full max-w-md shadow-2xl relative h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="w-12 h-1.5 bg-slate-700 rounded-full mx-auto mb-6 sm:hidden"></div>
                <button onClick={() => setSelectedViewer(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-full"><X size={16}/></button>
                
                <div className="mb-4 border-b border-slate-800 pb-4">
                  <h2 className="text-xl font-black text-white flex items-center truncate pr-8"><Crown className="mr-3 text-amber-400 flex-shrink-0" /> <span className="truncate">{selectedViewer.name}</span></h2>
                </div>

                <div className="flex space-x-2 border-b border-slate-800/80 pb-2 mb-4 relative">
                  {['analytics', 'logs'].map((tab) => (
                    <button key={tab} onClick={() => setActiveModalTab(tab as any)} className={`flex-1 flex justify-center items-center pb-2 transition-colors relative ${activeModalTab === tab ? (tab === 'analytics' ? 'text-indigo-400 font-bold' : 'text-emerald-400 font-bold') : 'text-slate-500 hover:text-slate-300'}`}>
                      {tab === 'analytics' ? <BarChart2 size={14} className="mr-1.5"/> : <List size={14} className="mr-1.5"/>}
                      <span className="text-[11px]">{tab === 'analytics' ? '傾向分析' : '個別履歴'}</span>
                      {activeModalTab === tab && <motion.div layoutId="activeModalTabBorder" className={`absolute bottom-[-2px] left-0 right-0 h-0.5 ${tab === 'analytics' ? 'bg-indigo-500' : 'bg-emerald-500'}`} />}
                    </button>
                  ))}
                </div>

                <div className={`flex-grow overflow-y-auto pr-1 min-h-0 ${scrollbarClass}`}>
                  <AnimatePresence mode="wait">
                    {activeModalTab === 'analytics' ? (
                      <motion.div key="analytics" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                        {loadingViewerProfile || !viewerProfile ? (
                          <div className="flex items-center justify-center h-40 text-indigo-500"><Loader2 className="animate-spin" size={32} /></div>
                        ) : (
                          <div className="flex flex-col space-y-3">
                            <div className="grid grid-cols-2 gap-3 mb-2">
                              <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/80"><p className="text-[9px] text-slate-500 font-bold mb-1">初回来訪</p><p className="text-xs font-bold text-slate-200">{viewerProfile.first_seen ? format(parseISO(viewerProfile.first_seen), 'yyyy/MM/dd') : '-'}</p></div>
                              <div className="bg-slate-950/50 p-3 rounded-2xl border border-slate-800/80"><p className="text-[9px] text-slate-500 font-bold mb-1">最終来訪</p><p className="text-xs font-bold text-slate-200">{viewerProfile.last_seen ? format(parseISO(viewerProfile.last_seen), 'yyyy/MM/dd') : '-'}</p></div>
                            </div>
                            <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/80 h-[180px] flex flex-col mb-3">
                              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">曜日別 投下トレンド</h4>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dowData}>
                                  <XAxis dataKey="name" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} />
                                  <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px', fontSize: '10px' }} itemStyle={{ color: '#818cf8', fontWeight: 'bold' }} />
                                  <Bar dataKey="coins" fill="#818cf8" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/80 h-[180px] flex flex-col">
                              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">時間帯別 トレンド</h4>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={hodData}>
                                  <XAxis dataKey="name" stroke="#64748b" fontSize={9} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={10} />
                                  <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px', fontSize: '10px' }} itemStyle={{ color: '#10b981', fontWeight: 'bold' }} />
                                  <Bar dataKey="coins" fill="#10b981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div key="logs" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-col space-y-3">
                        {loadingViewerLogs ? (
                          <div className="flex items-center justify-center h-40 text-emerald-500"><Loader2 className="animate-spin" size={32} /></div>
                        ) : viewerLogs.length === 0 ? (
                          <div className="text-center text-slate-500 py-10 text-xs">ログが見つかりません</div>
                        ) : (
                          viewerLogs.map(log => (
                            <div key={log.id} className="flex justify-between items-center bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-200">{log.gift_name || '不明なギフト'} <span className="text-slate-500 text-[10px] ml-1">x{log.count || 1}</span></span>
                                <span className="text-[10px] text-slate-500 mt-1 flex items-center"><Clock size={10} className="mr-1"/> {format(new Date(log.created_at), 'MM/dd HH:mm:ss')}</span>
                              </div>
                              <div className="font-black text-emerald-400 text-sm">+{log.coins.toLocaleString()}</div>
                            </div>
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}