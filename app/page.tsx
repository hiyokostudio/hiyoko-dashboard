'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/utils/supabase';
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck, Users, Flame, UserPlus, X, Clock, Calendar, Globe, CalendarSearch, Coins, AlertTriangle, Crown, Award, ExternalLink, BarChart2, ArrowUpDown, MousePointer2, Download, Copy, Smartphone, Check, Loader2, KeyRound, Edit2, Search, History, List, Moon, Sparkles, Target, BellRing, Activity } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';

type LiverStat = { system_id: string; username: string; liver_name?: string; avatar_url?: string; is_active: boolean; total_coins: number; unique_listeners: number; core_fans: number; dependency_rate: number; reward_rate: number; pin_code: string; };
type GiftLog = { id: number; created_at: string; coins: number; count?: number; gift_name?: string; viewers: { id: string; name: string; unique_id?: string; avatar_url?: string } | null; };
type VipListener = { viewer_id: string; viewer_name: string; unique_id: string | null; avatar_url: string | null; total_coins: number; daily_core_count: number; visit_days: number; rank: number; first_seen?: string; last_seen?: string; };
type ListenerProfile = { first_seen: string; last_seen: string; total_coins: number; day_of_week: Record<string, number>; hour_of_day: Record<string, number>; };

export default function Dashboard() {
  const [stats, setStats] = useState<LiverStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'today' | 'yesterday' | 'week' | 'month' | 'total' | 'custom'>('today');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [isAdding, setIsAdding] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newSystemId, setNewSystemId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showManualId, setShowManualId] = useState(false);

  const [healthFilter, setHealthFilter] = useState<'all' | 'danger' | 'warning' | 'safe'>('all');
  const [sortConfig, setSortConfig] = useState<{key: keyof LiverStat, direction: 'asc'|'desc'}>({ key: 'total_coins', direction: 'desc' });

  const [selectedLiverId, setSelectedLiverId] = useState<string | null>(null);
  const [detailLogs, setDetailLogs] = useState<GiftLog[]>([]);
  const [vipListeners, setVipListeners] = useState<VipListener[]>([]);

  const [selectedViewer, setSelectedViewer] = useState<{id: string, name: string} | null>(null);
  const [viewerProfile, setViewerProfile] = useState<ListenerProfile | null>(null);
  const [viewerLogs, setViewerLogs] = useState<GiftLog[]>([]);
  const [loadingViewerProfile, setLoadingViewerProfile] = useState(false);
  const [loadingViewerLogs, setLoadingViewerLogs] = useState(false);
  const [activeModalTab, setActiveModalTab] = useState<'analytics' | 'logs'>('analytics');

  const [isExporting, setIsExporting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingPin, setEditingPin] = useState<string | null>(null);
  const [editPinValue, setEditPinValue] = useState('');

  const adminMasterKey = "hiyoko_god_mode_2026";
  const scrollbarClass = "[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-700 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-600";

  const AvatarFallback = ({ name, size = "w-10 h-10", textSize = "text-sm" }: { name: string, size?: string, textSize?: string }) => {
    const initial = name ? name.charAt(0) : '?';
    return <div className={`${size} rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold ${textSize} uppercase flex-shrink-0`}>{initial}</div>;
  };

  const SafeAvatar = ({ src, name, size = "w-10 h-10", textSize = "text-sm", extraClass = "" }: { src?: string | null, name: string, size?: string, textSize?: string, extraClass?: string }) => {
    const [imgError, setImgError] = useState(false);
    if (!src || imgError) return <AvatarFallback name={name} size={size} textSize={textSize} />;
    return <img src={src} onError={() => setImgError(true)} className={`${size} rounded-full border border-slate-700 object-cover flex-shrink-0 ${extraClass}`} alt=""/>;
  };

  useEffect(() => {
    if (activeTab !== 'custom') fetchIntelligenceData();
    const channel = supabase.channel('public:gift_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_logs' }, async (payload) => {
        if (activeTab !== 'custom') fetchIntelligenceData();
        if (selectedLiverId && String(selectedLiverId) === String(payload.new.liver_id)) {
            const { data: viewerData } = await supabase.from('viewers').select('id, name, unique_id, avatar_url').eq('id', payload.new.viewer_id).single();
            const newLog: GiftLog = { 
              id: payload.new.id, created_at: payload.new.created_at, coins: payload.new.coins, count: payload.new.count, gift_name: payload.new.gift_name,
              viewers: viewerData ? { id: viewerData.id, name: viewerData.name, unique_id: viewerData.unique_id, avatar_url: viewerData.avatar_url } : null
            };
            setDetailLogs(prev => [newLog, ...prev].slice(0, 50));
            fetchVips(selectedLiverId);
        }
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTab, selectedLiverId]);

  useEffect(() => {
    if (selectedLiverId) { fetchDetailLogs(selectedLiverId); fetchVips(selectedLiverId); }
  }, [selectedLiverId, activeTab]);

  useEffect(() => {
    if (selectedViewer && selectedLiverId) {
      setActiveModalTab('analytics');
      fetchViewerProfile(selectedLiverId, selectedViewer.id);
      fetchViewerLogs(selectedLiverId, selectedViewer.id);
    } else {
      setViewerProfile(null);
      setViewerLogs([]);
    }
  }, [selectedViewer]);

  const getTimeBounds = () => {
    let startIso = null; let endIso = null;
    if (activeTab === 'custom' && startDate && endDate) { 
      startIso = new Date(startDate).toISOString(); endIso = new Date(endDate).toISOString(); 
    } else if (activeTab !== 'total') {
      const jstNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
      if (activeTab === 'today') {
        const yyyy = jstNow.getFullYear(); const mm = String(jstNow.getMonth() + 1).padStart(2, '0'); const dd = String(jstNow.getDate()).padStart(2, '0');
        startIso = new Date(`${yyyy}-${mm}-${dd}T00:00:00+09:00`).toISOString();
      } else if (activeTab === 'yesterday') {
        const jstYesterday = new Date(jstNow); jstYesterday.setDate(jstYesterday.getDate() - 1);
        const yyyy = jstYesterday.getFullYear(); const mm = String(jstYesterday.getMonth() + 1).padStart(2, '0'); const dd = String(jstYesterday.getDate()).padStart(2, '0');
        startIso = new Date(`${yyyy}-${mm}-${dd}T00:00:00+09:00`).toISOString(); endIso = new Date(`${yyyy}-${mm}-${dd}T23:59:59.999+09:00`).toISOString();
      } else if (activeTab === 'week') {
        const jstWeekAgo = new Date(jstNow); jstWeekAgo.setDate(jstWeekAgo.getDate() - 6);
        const yyyy = jstWeekAgo.getFullYear(); const mm = String(jstWeekAgo.getMonth() + 1).padStart(2, '0'); const dd = String(jstWeekAgo.getDate()).padStart(2, '0');
        startIso = new Date(`${yyyy}-${mm}-${dd}T00:00:00+09:00`).toISOString();
      } else if (activeTab === 'month') {
        const yyyy = jstNow.getFullYear(); const mm = String(jstNow.getMonth() + 1).padStart(2, '0');
        startIso = new Date(`${yyyy}-${mm}-01T00:00:00+09:00`).toISOString();
      }
    }
    return { startIso, endIso };
  };

  const fetchIntelligenceData = async () => {
    setLoading(true); 
    const { startIso, endIso } = getTimeBounds();
    const [statsRes, metaRes] = await Promise.all([
      supabase.rpc('get_intelligence_stats', { p_start_date: startIso, p_end_date: endIso }),
      supabase.from('target_livers').select('system_id, username, reward_rate, pin_code, liver_name, avatar_url')
    ]);
    if (statsRes.data && metaRes.data) {
      const merged = (statsRes.data as LiverStat[]).map(stat => {
        const meta = metaRes.data.find(r => r.system_id === stat.system_id);
        return { ...stat, reward_rate: meta?.reward_rate || 50, pin_code: meta?.pin_code || '0000', liver_name: meta?.liver_name, avatar_url: meta?.avatar_url };
      });
      setStats(merged);
    }
    setLoading(false);
  };

  const fetchDetailLogs = async (systemId: string) => {
    let query = supabase.from('gift_logs').select('id, created_at, coins, count, gift_name, viewers(id, name, unique_id, avatar_url)').eq('liver_id', systemId).order('created_at', { ascending: false }).limit(50);
    const { startIso, endIso } = getTimeBounds();
    if (startIso) query = query.gte('created_at', startIso); if (endIso) query = query.lte('created_at', endIso);
    const { data } = await query; if (data) setDetailLogs(data as unknown as GiftLog[]);
  };

  const fetchVips = async (systemId: string) => {
    const { startIso, endIso } = getTimeBounds();
    const params: any = { p_system_id: systemId };
    if (startIso) params.p_start_date = startIso; if (endIso) params.p_end_date = endIso;
    const { data } = await supabase.rpc('get_liver_vips_advanced', params);
    setVipListeners(data ? (data as VipListener[]) : []);
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

  const handleCustomFetch = () => { if (startDate && endDate) { fetchIntelligenceData(); if (selectedLiverId) { fetchDetailLogs(selectedLiverId); fetchVips(selectedLiverId); } } };

  const handleExportCSV = async () => {
    setIsExporting(true);
    const { startIso, endIso } = getTimeBounds();
    let query = supabase.from('gift_logs').select(`created_at, coins, count, gift_name, liver_id, viewers(name, unique_id)`).order('created_at', { ascending: false });
    if (startIso) query = query.gte('created_at', startIso); if (endIso) query = query.lte('created_at', endIso);
    const { data, error } = await query;
    if (error || !data) { alert('データのエクスポートに失敗しました。'); setIsExporting(false); return; }

    const headers = ['日付', '時間', 'ライバーシステムID', 'リスナー', 'TikTok ID', 'ギフト名', '連打数', '獲得ダイヤ'];
    const rows = data.map((log: any) => {
      const d = new Date(log.created_at);
      return [
        format(d, 'yyyy/MM/dd'), format(d, 'HH:mm:ss'), log.liver_id, `"${log.viewers?.name || '不明'}"`, log.viewers?.unique_id || '', `"${log.gift_name || ''}"`, log.count || 1, log.coins
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `hiyoko_logs_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link); setIsExporting(false);
  };

  const handleAddTarget = async () => {
    if (!newUsername.trim()) return;
    if (showManualId && newSystemId.trim()) {
      await supabase.rpc('add_target_liver', { p_system_id: newSystemId.trim(), p_username: newUsername.replace('@', '').trim() });
      setNewUsername(''); setNewSystemId(''); setShowManualId(false); setIsAdding(false); fetchIntelligenceData(); return;
    }
    setIsSearching(true);
    try {
      const cleanUsername = newUsername.replace('@', '').trim();
      const res = await fetch(`/api/tiktok/profile?username=${cleanUsername}`);
      const data = await res.json();
      if (res.ok && data.userId) {
        const { error } = await supabase.rpc('add_target_liver', { p_system_id: data.userId, p_username: cleanUsername });
        if (!error) {
          const updateData: any = {};
          if (data.avatarUrl) updateData.avatar_url = data.avatarUrl;
          if (data.nickname) updateData.liver_name = data.nickname;
          if (Object.keys(updateData).length > 0) await supabase.from('target_livers').update(updateData).eq('system_id', data.userId);
          setNewUsername(''); setShowManualId(false); setIsAdding(false); fetchIntelligenceData();
        }
      } else { setShowManualId(true); }
    } catch (e) { setShowManualId(true); } finally { setIsSearching(false); }
  };

  const toggleStatus = async (systemId: string, current: boolean) => { await supabase.from('target_livers').update({ is_active: !current }).eq('system_id', systemId); fetchIntelligenceData(); };
  const handlePinUpdate = async (systemId: string) => {
    if (!/^\d{4}$/.test(editPinValue)) return alert('PINは4桁の数字で入力してください。');
    const { error } = await supabase.from('target_livers').update({ pin_code: editPinValue }).eq('system_id', systemId);
    if (!error) { setEditingPin(null); fetchIntelligenceData(); } else { alert('更新に失敗しました'); }
  };

  const handleCopyPortalUrl = (systemId: string) => { const url = `${window.location.origin}/portal/${systemId}`; navigator.clipboard.writeText(url); setCopiedId(systemId); setTimeout(() => setCopiedId(null), 2000); };
  const handleOpenPortalAsAdmin = (systemId: string) => { window.open(`/portal/${systemId}?godmode=${adminMasterKey}`, '_blank'); };
  const handleSort = (key: keyof LiverStat) => { setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' })); };

  const systemTotalCoins = stats.reduce((sum, s) => sum + s.total_coins, 0);
  const systemCoreFans = stats.reduce((sum, s) => sum + s.core_fans, 0);
  const dangerCount = stats.filter(s => s.total_coins > 0 && s.dependency_rate >= 80).length;
  const safeCount = stats.filter(s => s.total_coins > 0 && s.dependency_rate < 50).length;
  const warningCount = stats.filter(s => s.total_coins > 0 && s.dependency_rate >= 50 && s.dependency_rate < 80).length;

  const filteredAndSortedStats = useMemo(() => {
    let result = [...stats];
    if (healthFilter === 'danger') result = result.filter(s => s.total_coins > 0 && s.dependency_rate >= 80);
    if (healthFilter === 'warning') result = result.filter(s => s.total_coins > 0 && s.dependency_rate >= 50 && s.dependency_rate < 80);
    if (healthFilter === 'safe') result = result.filter(s => s.total_coins > 0 && s.dependency_rate < 50);
    result.sort((a, b) => {
      const aValue = a[sortConfig.key] ?? 0; const bValue = b[sortConfig.key] ?? 0;
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1; return 0;
    });
    return result;
  }, [stats, healthFilter, sortConfig]);

  const selectedLiver = stats.find(s => s.system_id === selectedLiverId);

  const dowData = useMemo(() => {
    if (!viewerProfile) return [];
    const daysMap: Record<string, string> = { 'Monday': '月', 'Tuesday': '火', 'Wednesday': '水', 'Thursday': '木', 'Friday': '金', 'Saturday': '土', 'Sunday': '日' };
    return Object.keys(daysMap).map(d => ({ name: daysMap[d], coins: viewerProfile.day_of_week?.[d] || 0 }));
  }, [viewerProfile]);

  const hodData = useMemo(() => {
    if (!viewerProfile) return [];
    return Array.from({length: 24}, (_, i) => ({ name: `${i}時`, coins: viewerProfile.hour_of_day?.[i.toString()] || 0 }));
  }, [viewerProfile]);

  // 💡 マネージャー向け AIアクション指示生成（タブ期間ごとにロジックを完全分岐）
  const managerAlerts = useMemo(() => {
    if (!selectedLiverId || !selectedLiver || vipListeners.length === 0) return [];
    const alerts = [];
    
    // 【共通】依存度リスク
    if (selectedLiver.dependency_rate >= 80 && selectedLiver.total_coins > 0) {
      alerts.push({ type: 'danger', icon: AlertTriangle, text: '上位1名への依存度が極めて高い状態です。新規層への声かけを指導してください。' });
    }

    if (activeTab === 'today' || activeTab === 'yesterday') {
      const nearDailyCore = vipListeners.filter(v => v.total_coins >= 700 && v.total_coins < 1000);
      if (nearDailyCore.length > 0) alerts.push({ type: 'opportunity', icon: Target, text: `${nearDailyCore.length}名のリスナーがデイリーCore(1K)まであと少しです！名指しでの引き上げを促してください。` });
    } 
    else if (activeTab === 'week') {
      const nearWeeklyCore = vipListeners.filter(v => v.total_coins >= 3500 && v.total_coins < 5000);
      if (nearWeeklyCore.length > 0) alerts.push({ type: 'opportunity', icon: Target, text: `${nearWeeklyCore.length}名がウィークリーCore(5K)目前です。イベント中なら大きな力になります。` });
      const highStreak = vipListeners.filter(v => v.daily_core_count >= 3 && v.total_coins < 5000);
      if (highStreak.length > 0) alerts.push({ type: 'safe', icon: Sparkles, text: `${highStreak.length}名のリスナーが週に3回以上1Kを達成し、枠を底上げしています。` });
    }
    else if (activeTab === 'month') {
      const nearMonthlyCore = vipListeners.filter(v => v.total_coins >= 15000 && v.total_coins < 20000);
      if (nearMonthlyCore.length > 0) alerts.push({ type: 'opportunity', icon: Target, text: `${nearMonthlyCore.length}名がマンスリーCore(20K)間近です！特別な還元や感謝を伝えるタイミングです。` });
      
      const highVisit = vipListeners.filter(v => (v.visit_days || 0) >= 10 && v.total_coins < 5000);
      if (highVisit.length > 0) alerts.push({ type: 'warning', icon: Activity, text: `${highVisit.length}名が今月10日以上来訪していますが単価が低めです。ミドル層への単価アップ施策が必要です。` });
    }
    else if (activeTab === 'total') {
      const sleepingVips = vipListeners.filter(v => v.total_coins >= 5000 && v.last_seen && (new Date().getTime() - new Date(v.last_seen).getTime()) > 14 * 24 * 60 * 60 * 1000);
      if (sleepingVips.length > 0) alerts.push({ type: 'warning', icon: BellRing, text: `累計5K以上の優良客 ${sleepingVips.length}名 が2週間以上離脱しています。SNS等で引き戻しを図りましょう。` });
    }

    if (alerts.length === 0) {
      alerts.push({ type: 'safe', icon: ShieldCheck, text: '特筆すべきリスクや機会はありません。堅実な育成が進行中です。' });
    }
    return alerts;
  }, [selectedLiverId, selectedLiver, vipListeners, activeTab]);

  const coreCount = vipListeners.filter(v => v.total_coins >= (activeTab==='month'?20000 : activeTab==='week'?5000 : 1000)).length;
  const middleCount = vipListeners.filter(v => v.total_coins >= (activeTab==='month'?5000 : activeTab==='week'?1000 : 100) && v.total_coins < (activeTab==='month'?20000 : activeTab==='week'?5000 : 1000)).length;
  const lightCount = vipListeners.filter(v => v.total_coins > 0 && v.total_coins < (activeTab==='month'?5000 : activeTab==='week'?1000 : 100)).length;
  const totalAnalyzed = coreCount + middleCount + lightCount || 1;

  if (loading && stats.length === 0) return <div className="min-h-screen bg-[#020617] flex items-center justify-center font-bold text-indigo-500 animate-pulse">システム初期化中...</div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-50 p-4 md:p-8 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-b border-slate-800/80 pb-6 relative">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
            <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Hiyoko Intelligence</h1>
            <p className="text-slate-400 mt-1 text-sm font-medium tracking-widest">TikTok Live 統合マネジメントシステム</p>
          </motion.div>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="flex space-x-1 bg-slate-900/80 p-1 rounded-xl shadow-inner border border-slate-800 backdrop-blur-sm relative">
              {['today', 'yesterday', 'week', 'month', 'total', 'custom'].map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab as any)} className={`flex items-center px-3 md:px-4 py-2 rounded-lg text-xs font-bold transition-colors relative z-10 ${activeTab === tab ? 'text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                  {activeTab === tab && <motion.div layoutId="adminTabBg" className="absolute inset-0 bg-indigo-600 rounded-lg shadow-md -z-10" transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />}
                  {tab === 'today' ? <><Clock size={14} className="mr-1.5" /> 本日</> : 
                   tab === 'yesterday' ? <><History size={14} className="mr-1.5" /> 昨日</> :
                   tab === 'week' ? <><Activity size={14} className="mr-1.5" /> 直近7日間</> :
                   tab === 'month' ? <><Calendar size={14} className="mr-1.5" /> 今月</> :
                   tab === 'total' ? <><Globe size={14} className="mr-1.5" /> 全期間</> :
                   <><CalendarSearch size={14} className="mr-1.5" /> 指定</>}
                </button>
              ))}
            </div>
            <AnimatePresence>
              {activeTab === 'custom' && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="flex items-center space-x-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 shadow-inner">
                  <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors"><input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full h-full bg-transparent text-xs px-3 py-2 outline-none font-bold text-slate-300 cursor-pointer [color-scheme:dark]" /></div>
                  <span className="text-slate-500">〜</span>
                  <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors"><input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full h-full bg-transparent text-xs px-3 py-2 outline-none font-bold text-slate-300 cursor-pointer [color-scheme:dark]" /></div>
                  <button onClick={handleCustomFetch} disabled={!startDate || !endDate} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors">解析実行</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div layout className="md:col-span-2 bg-gradient-to-br from-slate-900/80 to-slate-950 border border-slate-800/80 p-6 rounded-3xl shadow-lg relative overflow-hidden backdrop-blur-sm">
            <div className="absolute top-0 right-0 p-6 opacity-10"><Coins size={100} /></div>
            <p className="text-xs font-bold text-indigo-400 mb-2 tracking-wider">システム総獲得ダイヤ</p>
            <h2 className="text-5xl font-black text-white mb-6 tracking-tight tabular-nums drop-shadow-[0_0_15px_rgba(99,102,241,0.2)]">{systemTotalCoins.toLocaleString()}</h2>
            <div className="flex gap-12">
              <div><p className="text-xs font-bold text-slate-500 mb-1">所属ライバー</p><p className="text-2xl font-bold text-white">{stats.length} <span className="text-sm text-slate-500 font-normal">名</span></p></div>
              <div><p className="text-xs font-bold text-slate-500 mb-1">システム全体コア達成者</p><p className="text-2xl font-bold text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]">{systemCoreFans} <span className="text-sm text-slate-500 font-normal">名</span></p></div>
            </div>
          </motion.div>
          <motion.div layout className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-3xl shadow-sm flex flex-col justify-center backdrop-blur-sm">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xs font-bold text-slate-400 flex items-center"><ShieldCheck size={14} className="mr-2" />健全度フィルター</h3>{healthFilter !== 'all' && <button onClick={() => setHealthFilter('all')} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded hover:bg-slate-700">解除</button>}</div>
            <div className="space-y-3">
              <div onClick={() => setHealthFilter(healthFilter === 'safe' ? 'all' : 'safe')} className={`flex items-center justify-between p-2 -mx-2 rounded-lg cursor-pointer transition-colors ${healthFilter === 'safe' ? 'bg-emerald-500/10' : 'hover:bg-slate-800/50'}`}>
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div><span className="text-sm font-bold text-slate-300">健全</span></div><span className="font-black text-white text-lg">{safeCount}</span>
              </div>
              <div onClick={() => setHealthFilter(healthFilter === 'warning' ? 'all' : 'warning')} className={`flex items-center justify-between p-2 -mx-2 rounded-lg cursor-pointer transition-colors ${healthFilter === 'warning' ? 'bg-amber-500/10' : 'hover:bg-slate-800/50'}`}>
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></div><span className="text-sm font-bold text-slate-300">注意</span></div><span className="font-black text-white text-lg">{warningCount}</span>
              </div>
              <div onClick={() => setHealthFilter(healthFilter === 'danger' ? 'all' : 'danger')} className={`flex items-center justify-between p-2 -mx-2 rounded-lg cursor-pointer transition-colors ${healthFilter === 'danger' ? 'bg-rose-500/10' : 'hover:bg-slate-800/50'}`}>
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"></div><span className="text-sm font-bold text-slate-300">危険</span></div><span className="font-black text-rose-400 text-lg">{dangerCount}</span>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.div layout className="bg-slate-900/80 rounded-3xl shadow-lg border border-slate-800 overflow-hidden backdrop-blur-md">
          <div className="p-5 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50">
            <h3 className="text-sm font-black text-slate-200">ライバー分析マトリックス {healthFilter !== 'all' && <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded ml-2">フィルター適用中</span>}</h3>
            <div className="flex items-center gap-2">
              <button onClick={handleExportCSV} disabled={isExporting} className="flex items-center text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-700 transition-colors disabled:opacity-50">
                <Download size={14} className="mr-2" /> {isExporting ? '生成中...' : 'CSV出力'}
              </button>
              {isAdding ? (
                <div className="flex items-center space-x-2 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700 animate-in fade-in">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">@</span>
                    <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="TikTok IDを入力" className="text-xs pl-6 pr-3 py-2 outline-none w-40 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono" disabled={isSearching} />
                  </div>
                  {showManualId && ( <input type="text" value={newSystemId} onChange={e => setNewSystemId(e.target.value)} placeholder="システムID (手動)" className="text-xs px-3 py-2 outline-none w-32 bg-slate-950 border border-rose-500/50 rounded-lg text-white font-mono" /> )}
                  <button onClick={handleAddTarget} disabled={isSearching || !newUsername} className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors w-24">
                    {isSearching ? <Loader2 size={14} className="animate-spin" /> : (showManualId ? '強制追加' : '追加')}
                  </button>
                  <button onClick={() => { setIsAdding(false); setShowManualId(false); }} className="text-slate-400 hover:text-slate-200 p-2"><X size={16}/></button>
                </div>
              ) : (
                <button onClick={() => setIsAdding(true)} className="flex items-center text-xs font-bold text-slate-300 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 px-4 py-2 rounded-xl border border-indigo-500/30 transition-colors"><UserPlus size={14} className="mr-2" /> ライバー追加</button>
              )}
            </div>
          </div>
          <div className={`overflow-x-auto max-h-[400px] overflow-y-auto ${scrollbarClass}`}>
            <table className="w-full text-left border-collapse min-w-[1000px] select-none relative">
              <thead className="sticky top-0 z-20 bg-slate-950 shadow-md">
                <tr className="text-[10px] font-black text-slate-500 border-b border-slate-800/80">
                  <th className="p-4 pl-6 cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('username')}>ライバー {sortConfig.key === 'username' ? <ArrowUpDown size={10} className="inline ml-1 text-indigo-400" /> : <ArrowUpDown size={10} className="inline ml-1 opacity-30" />}</th>
                  <th className="p-4 text-right cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('total_coins')}>獲得ダイヤ {sortConfig.key === 'total_coins' ? <ArrowUpDown size={10} className="inline ml-1 text-indigo-400" /> : <ArrowUpDown size={10} className="inline ml-1 opacity-30" />}</th>
                  <th className="p-4 text-center cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('unique_listeners')}>参加者 (1C+) {sortConfig.key === 'unique_listeners' ? <ArrowUpDown size={10} className="inline ml-1 text-indigo-400" /> : <ArrowUpDown size={10} className="inline ml-1 opacity-30" />}</th>
                  <th className="p-4 text-center cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('core_fans')}>Core到達者 {sortConfig.key === 'core_fans' ? <ArrowUpDown size={10} className="inline ml-1 text-indigo-400" /> : <ArrowUpDown size={10} className="inline ml-1 opacity-30" />}</th>
                  <th className="p-4 w-48 cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('dependency_rate')}>太客依存率 {sortConfig.key === 'dependency_rate' ? <ArrowUpDown size={10} className="inline ml-1 text-indigo-400" /> : <ArrowUpDown size={10} className="inline ml-1 opacity-30" />}</th>
                  <th className="p-4 text-center cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('reward_rate')}>報酬率 {sortConfig.key === 'reward_rate' ? <ArrowUpDown size={10} className="inline ml-1 text-indigo-400" /> : <ArrowUpDown size={10} className="inline ml-1 opacity-30" />}</th>
                  <th className="p-4 text-center">PINコード</th>
                  <th className="p-4 text-center">健全度</th>
                  <th className="p-4 text-center pr-6">監視 / アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                <AnimatePresence>
                  {filteredAndSortedStats.map((liver) => {
                    const isDanger = liver.dependency_rate >= 80 && liver.total_coins > 0;
                    const isSafe = liver.dependency_rate < 50 && liver.total_coins > 0;
                    const isSelected = selectedLiverId === liver.system_id;
                    return (
                      <motion.tr layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', bounce: 0, duration: 0.4 }} key={liver.system_id} onClick={() => setSelectedLiverId(prev => prev === liver.system_id ? null : liver.system_id)} className={`cursor-pointer transition-colors group relative ${isSelected ? 'bg-indigo-500/10' : 'hover:bg-slate-800/40'} ${!liver.is_active ? 'opacity-30' : ''}`}>
                        {isSelected && <motion.td layoutId="selectedLiverHighlight" className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />}
                        <td className="p-4 pl-6 flex items-center gap-3 relative z-10 border-none">
                          <div className="flex items-center gap-3 cursor-pointer group/link hover:opacity-80 transition-opacity">
                            <SafeAvatar src={liver.avatar_url} name={liver.liver_name || liver.username} size="w-9 h-9" textSize="text-xs" />
                            <div className="flex flex-col">
                              <div className={`font-bold flex items-center gap-1 ${isSelected ? 'text-indigo-400' : 'text-slate-200'}`}>
                                {liver.liver_name || liver.username} 
                                <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(`https://www.tiktok.com/@${liver.username}`, '_blank'); }} className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-indigo-400 transition-colors"><ExternalLink size={12} /></button>
                              </div>
                              <div className="text-[11px] font-mono font-semibold text-indigo-400/90 mt-0.5">@{liver.username}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-right font-black text-slate-200 tabular-nums">{liver.total_coins.toLocaleString()}</td>
                        <td className="p-4 text-center font-bold text-slate-300"><div className="flex items-center justify-center gap-1.5"><Users size={14} className="text-slate-500"/> {liver.unique_listeners.toLocaleString()}</div></td>
                        <td className="p-4 text-center font-black text-amber-400">{liver.core_fans > 0 ? <div className="flex items-center justify-center gap-1 text-amber-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.3)]"><Flame size={14}/> {liver.core_fans.toLocaleString()}</div> : <span className="text-slate-700">0</span>}</td>
                        <td className="p-4"><div className="flex items-center gap-3"><span className="w-10 text-xs font-black text-slate-300 text-right">{liver.total_coins > 0 ? `${liver.dependency_rate}%` : '-'}</span><div className="flex-grow h-1.5 bg-slate-800 rounded-full overflow-hidden"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(liver.total_coins > 0 ? liver.dependency_rate : 0, 100)}%` }} transition={{ duration: 0.8 }} className={`h-full rounded-full ${isDanger ? 'bg-rose-500' : isSafe ? 'bg-emerald-500' : 'bg-amber-400'}`}></motion.div></div></div></td>
                        <td className="p-4 text-center"><span className="font-bold text-slate-300 text-sm">{Number(liver.reward_rate).toFixed(1)}%</span></td>
                        <td className="p-4 text-center" onClick={(e) => e.stopPropagation()}>
                          {editingPin === liver.system_id ? (
                            <div className="flex items-center justify-center gap-1">
                              <input type="text" maxLength={4} value={editPinValue} onChange={e => setEditPinValue(e.target.value.replace(/\D/g, ''))} className="w-12 bg-slate-950 border border-indigo-500 rounded px-1 py-0.5 text-xs text-center text-white outline-none font-mono tracking-widest" autoFocus />
                              <button onClick={() => handlePinUpdate(liver.system_id)} className="text-emerald-400 hover:text-emerald-300"><Check size={14}/></button>
                              <button onClick={() => setEditingPin(null)} className="text-slate-500 hover:text-slate-300"><X size={14}/></button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1.5 group/pin cursor-pointer border border-transparent hover:border-slate-700 hover:bg-slate-800/50 px-2 py-1 rounded transition-colors" onClick={() => { setEditingPin(liver.system_id); setEditPinValue(liver.pin_code); }}>
                              <KeyRound size={12} className={liver.pin_code === '0000' ? 'text-amber-500/70' : 'text-slate-500'} />
                              <span className={`font-mono text-xs font-bold tracking-widest ${liver.pin_code === '0000' ? 'text-amber-500' : 'text-slate-300'}`}>{liver.pin_code}</span>
                              <Edit2 size={10} className="text-slate-600 group-hover/pin:text-indigo-400 opacity-0 group-hover/pin:opacity-100" />
                            </div>
                          )}
                        </td>
                        <td className="p-4 text-center">
                          {liver.total_coins === 0 ? <span className="text-[10px] font-bold text-slate-600 border border-slate-700 px-2 py-0.5 rounded">データなし</span>
                           : isDanger ? <span className="text-[10px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded inline-flex items-center gap-1 w-20 justify-center shadow-[0_0_10px_rgba(244,63,94,0.15)]"><AlertTriangle size={12}/> 危険</span>
                           : isSafe ? <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded inline-flex items-center gap-1 w-20 justify-center"><ShieldCheck size={12}/> 健全</span>
                           : <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded inline-flex items-center gap-1 w-20 justify-center">注意</span>}
                        </td>
                        <td className="p-4 pr-6 text-center" onClick={(e) => e.stopPropagation()}>
                           <div className="flex items-center justify-end gap-3">
                             <div className={`flex items-center gap-1 mr-2 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                               <button onClick={() => handleCopyPortalUrl(liver.system_id)} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors tooltip-trigger relative">{copiedId === liver.system_id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}</button>
                               <button onClick={() => handleOpenPortalAsAdmin(liver.system_id)} className="p-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded-lg border border-indigo-500/30 transition-colors"><Smartphone size={14} /></button>
                             </div>
                             <button onClick={() => toggleStatus(liver.system_id, liver.is_active)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${liver.is_active ? 'bg-indigo-600' : 'bg-slate-700'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${liver.is_active ? 'translate-x-5' : 'translate-x-1'}`} /></button>
                           </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {!selectedLiverId ? (
            <motion.div key="empty" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="bg-slate-900/40 border border-slate-800/50 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center text-slate-500">
               <MousePointer2 size={48} className="opacity-20 mb-4 animate-bounce" />
               <p className="font-black text-lg text-slate-400">ライバーを選択してください</p>
               <p className="text-sm mt-2 font-medium">上のマトリックスから対象をクリックすると、詳細な重要顧客管理(CRM)とAI指示を展開します。</p>
            </motion.div>
          ) : selectedLiver && (
            <motion.div key="crm" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col relative overflow-hidden backdrop-blur-md h-[600px]">
                <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none"><Crown size={120} /></div>
                
                <div className="flex flex-col mb-4 relative z-10 border-b border-slate-800/80 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><Crown className="h-5 w-5 text-amber-400" /><span className="text-sm font-black text-slate-200">重要顧客管理 (CRM)</span><span className="text-[11px] font-mono text-indigo-400/80 ml-2">@{selectedLiver.username}</span></div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleCopyPortalUrl(selectedLiver.system_id)} className={`flex items-center text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${copiedId === selectedLiver.system_id ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>{copiedId === selectedLiver.system_id ? <Check size={12} className="mr-1.5"/> : <Copy size={12} className="mr-1.5"/>} URLコピー</button>
                      <button onClick={() => handleOpenPortalAsAdmin(selectedLiver.system_id)} className="flex items-center text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all"><Smartphone size={12} className="mr-1.5"/> ポータルを確認</button>
                    </div>
                  </div>
                  
                  {managerAlerts.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 bg-slate-950/50 border border-slate-800 rounded-xl p-3">
                      <h4 className="text-[10px] font-black text-slate-400 mb-2 flex items-center tracking-widest"><Sparkles size={12} className="mr-1.5 text-indigo-400"/> マネージャー向け 推奨アクション</h4>
                      <div className="space-y-1.5">
                        {managerAlerts.map((alert, idx) => (
                          <div key={idx} className={`flex items-start gap-2 p-2 rounded-lg text-xs font-bold leading-tight ${alert.type === 'danger' ? 'bg-rose-500/10 text-rose-200 border border-rose-500/20' : alert.type === 'opportunity' ? 'bg-amber-500/10 text-amber-200 border border-amber-500/20' : alert.type === 'warning' ? 'bg-orange-500/10 text-orange-200 border border-orange-500/20' : 'bg-emerald-500/10 text-emerald-200 border border-emerald-500/20'}`}>
                            <alert.icon size={14} className={`flex-shrink-0 mt-0.5 ${alert.type === 'danger' ? 'text-rose-400' : alert.type === 'opportunity' ? 'text-amber-400' : alert.type === 'warning' ? 'text-orange-400' : 'text-emerald-400'}`} />
                            <span>{alert.text}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>

                <div className="mb-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800/80 relative z-10">
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1.5 uppercase tracking-widest">
                    <span>コア層 <span className="text-amber-400">{coreCount}名</span></span>
                    <span>ミドル層 <span className="text-indigo-400">{middleCount}名</span></span>
                    <span>ライト層 <span className="text-slate-500">{lightCount}名</span></span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-2 flex overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(coreCount/totalAnalyzed)*100}%` }} transition={{ duration: 1 }} className="bg-amber-500"></motion.div>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(middleCount/totalAnalyzed)*100}%` }} transition={{ duration: 1, delay: 0.2 }} className="bg-indigo-500"></motion.div>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${(lightCount/totalAnalyzed)*100}%` }} transition={{ duration: 1, delay: 0.4 }} className="bg-slate-500"></motion.div>
                  </div>
                </div>
                
                <div className={`flex-grow overflow-y-auto pr-2 space-y-3 ${scrollbarClass}`}>
                  <AnimatePresence mode="popLayout">
                    {vipListeners.length === 0 ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-full text-slate-600"><Users size={48} className="opacity-20 mb-4" /><p className="font-bold text-sm tracking-widest">リスナーデータがありません</p></motion.div>
                    ) : (
                      vipListeners.map((vip) => {
                        const isSleeping = vip.last_seen && (new Date().getTime() - new Date(vip.last_seen).getTime()) > 14 * 24 * 60 * 60 * 1000;
                        const isDaily = activeTab === 'today' || activeTab === 'yesterday';
                        const isWeekly = activeTab === 'week';
                        const isMonthly = activeTab === 'month';
                        return (
                          <motion.div layout initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} key={vip.viewer_id} onClick={() => setSelectedViewer({id: vip.viewer_id, name: vip.viewer_name})} className={`flex items-center p-3 rounded-xl border transition-colors cursor-pointer group ${vip.rank === 1 ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 shadow-[0_0_10px_rgba(251,191,36,0.1)]' : 'bg-slate-950/50 border-slate-800/50 hover:bg-slate-800/80'}`}>
                            <div className="w-8 text-center flex-shrink-0">{vip.rank === 1 ? <Crown size={20} className="text-amber-400 mx-auto group-hover:scale-110 transition-transform" /> : vip.rank === 2 ? <Award size={20} className="text-slate-300 mx-auto" /> : vip.rank === 3 ? <Award size={20} className="text-amber-700 mx-auto" /> : <span className="text-sm font-bold text-slate-500">{vip.rank}</span>}</div>
                            <div className="ml-2 flex-shrink-0 relative z-10">
                              <SafeAvatar src={vip.avatar_url} name={vip.viewer_name} size="w-10 h-10" />
                              {isSleeping && <div title="2週間以上離脱の可能性" className="absolute -top-1 -right-1 bg-slate-900 border border-slate-700 rounded-full p-0.5 shadow-lg"><Moon size={10} className="text-indigo-400"/></div>}
                            </div>
                            <div className="flex-grow ml-4 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-bold text-sm truncate ${vip.rank === 1 ? 'text-amber-400' : 'text-slate-200'}`}>{vip.viewer_name}</span>
                                {isDaily && vip.total_coins >= 1000 && <span className="text-[9px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(251,191,36,0.3)] flex items-center"><Crown size={8} className="mr-0.5"/> Daily Core</span>}
                                {isWeekly && vip.total_coins >= 5000 && <span className="text-[9px] font-black text-sky-400 bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(56,189,248,0.3)] flex items-center"><Award size={8} className="mr-0.5"/> Weekly Core</span>}
                                {isMonthly && vip.total_coins >= 20000 && <span className="text-[9px] font-black text-fuchsia-400 bg-fuchsia-500/10 border border-fuchsia-500/20 px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(232,121,249,0.3)] flex items-center"><Flame size={8} className="mr-0.5"/> Monthly Core</span>}
                                {!isDaily && vip.daily_core_count > 0 && <span className="text-[9px] font-bold text-amber-500/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">👑 Daily <span className="text-amber-400 font-black tracking-widest ml-0.5">[ x{vip.daily_core_count} ]</span></span>}
                              </div>
                              <span className="text-[11px] font-mono text-indigo-400/90 truncate">{vip.unique_id ? `@${vip.unique_id}` : '@unknown'}</span>
                            </div>
                            <div className="flex flex-col items-end ml-4 flex-shrink-0">
                              <span className={`font-black text-sm tabular-nums ${vip.rank === 1 ? 'text-amber-400' : 'text-indigo-400'}`}>{vip.total_coins.toLocaleString()}</span>
                              <span className="text-[10px] text-slate-500 font-medium flex items-center mt-1"><Clock size={10} className="mr-1 opacity-50"/> {vip.last_seen ? format(parseISO(vip.last_seen), 'MM/dd') : '-'} {vip.visit_days > 0 && <span className="ml-1 text-slate-400">({vip.visit_days}日来訪)</span>}</span>
                            </div>
                          </motion.div>
                        );
                      })
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col overflow-hidden backdrop-blur-md h-[600px]">
                <h3 className="text-sm font-black text-slate-300 mb-4 pb-4 border-b border-slate-800/80"><Coins className="mr-2 h-4 w-4 inline text-emerald-400" />リアルタイム履歴</h3>
                <div className={`flex-grow overflow-y-auto space-y-2 pr-2 ${scrollbarClass}`}>
                  <AnimatePresence mode="popLayout">
                    {detailLogs.map((log) => (
                      <motion.div layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, scale: 0.9 }} key={log.id} onClick={() => log.viewers && setSelectedViewer({id: log.viewers.id, name: log.viewers.name})} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 hover:bg-slate-800/80 transition-colors border border-slate-800/50 cursor-pointer">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <SafeAvatar src={log.viewers?.avatar_url} name={log.viewers?.name || '不明'} size="w-9 h-9" textSize="text-xs" />
                          <div className="flex flex-col overflow-hidden">
                            <span className="font-bold text-slate-200 text-sm truncate">{log.viewers?.name || '不明'}</span>
                            <span className="text-[10px] text-slate-500 truncate mt-0.5"><Clock size={10} className="inline mr-1 opacity-50"/>{format(new Date(log.created_at), 'MM/dd HH:mm:ss')}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                          {log.gift_name && <span className="text-[10px] font-bold text-slate-400 truncate max-w-[80px]">{log.gift_name}</span>}
                          <span className="font-black text-emerald-400 text-xs bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 tabular-nums">+{log.coins}</span>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {selectedViewer && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSelectedViewer(null)}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-4xl w-full shadow-2xl relative overflow-hidden flex flex-col h-[85vh]" onClick={e => e.stopPropagation()}>
                <button onClick={() => setSelectedViewer(null)} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors bg-slate-800 p-2 rounded-full"><X size={20}/></button>
                
                <div className="mb-6 border-b border-slate-800 pb-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-black text-white flex items-center"><Crown className="mr-3 text-amber-400" /> {selectedViewer.name}</h2>
                      <div className="flex gap-8 mt-4">
                        <div><p className="text-xs text-slate-400 font-bold mb-1">総支援額</p><p className="text-2xl font-black text-amber-400 tabular-nums">{viewerProfile ? viewerProfile.total_coins.toLocaleString() : '---'} <span className="text-sm text-slate-500 font-normal">ダイヤ</span></p></div>
                        <div><p className="text-xs text-slate-400 font-bold mb-1">初回来訪</p><p className="text-sm font-bold text-slate-200 mt-2">{viewerProfile?.first_seen ? format(parseISO(viewerProfile.first_seen), 'yyyy/MM/dd HH:mm') : '-'}</p></div>
                        <div><p className="text-xs text-slate-400 font-bold mb-1">最終来訪</p><p className="text-sm font-bold text-slate-200 mt-2">{viewerProfile?.last_seen ? format(parseISO(viewerProfile.last_seen), 'yyyy/MM/dd HH:mm') : '-'}</p></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2 border-b border-slate-800/80 pb-2 mb-4 relative">
                  {['analytics', 'logs'].map((tab) => (
                    <button key={tab} onClick={() => setActiveModalTab(tab as any)} className={`flex items-center px-4 py-2 transition-colors relative ${activeModalTab === tab ? 'text-indigo-400 font-bold' : 'text-slate-500 hover:text-slate-300'}`}>
                      {tab === 'analytics' ? <BarChart2 size={16} className="mr-2"/> : <List size={16} className="mr-2"/>}
                      {tab === 'analytics' ? '傾向分析グラフ' : '個別ギフト履歴'}
                      {activeModalTab === tab && <motion.div layoutId="adminModalTabBorder" className="absolute bottom-[-2px] left-0 right-0 h-0.5 bg-indigo-500" />}
                    </button>
                  ))}
                </div>

                <div className={`flex-grow overflow-y-auto pr-2 ${scrollbarClass}`}>
                  <AnimatePresence mode="wait">
                    {activeModalTab === 'analytics' ? (
                      <motion.div key="analytics" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="h-full">
                        {loadingViewerProfile || !viewerProfile ? (
                          <div className="flex items-center justify-center h-full text-indigo-500"><Loader2 className="animate-spin" size={32} /></div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full pb-4">
                            <div className="bg-slate-950/50 p-5 rounded-2xl border border-slate-800/80 flex flex-col min-h-[250px]">
                              <h4 className="text-xs font-bold text-slate-400 mb-4 tracking-widest">曜日別 投下トレンド</h4>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dowData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} /><XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                                  <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ color: '#818cf8', fontWeight: 'bold' }} />
                                  <Bar dataKey="coins" fill="#818cf8" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="bg-slate-950/50 p-5 rounded-2xl border border-slate-800/80 flex flex-col min-h-[250px]">
                              <h4 className="text-xs font-bold text-slate-400 mb-4 tracking-widest">時間帯別 トレンド</h4>
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={hodData}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} /><XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={10} />
                                  <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ color: '#10b981', fontWeight: 'bold' }} />
                                  <Bar dataKey="coins" fill="#10b981" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <motion.div key="logs" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="h-full">
                        {loadingViewerLogs ? (
                          <div className="flex items-center justify-center h-full text-emerald-500"><Loader2 className="animate-spin" size={32} /></div>
                        ) : viewerLogs.length === 0 ? (
                          <div className="text-center text-slate-500 py-10">ログが見つかりません</div>
                        ) : (
                          <div className="space-y-2">
                            {viewerLogs.map(log => (
                              <div key={log.id} className="flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                                <div className="flex flex-col">
                                  <span className="text-sm font-bold text-slate-200">{log.gift_name || '不明なギフト'} <span className="text-slate-500 text-xs ml-1">x{log.count || 1}</span></span>
                                  <span className="text-xs text-slate-500 mt-1 flex items-center"><Clock size={10} className="mr-1"/> {format(new Date(log.created_at), 'yyyy/MM/dd HH:mm:ss')}</span>
                                </div>
                                <div className="font-black text-emerald-400 text-lg tabular-nums">+{log.coins.toLocaleString()}</div>
                              </div>
                            ))}
                          </div>
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