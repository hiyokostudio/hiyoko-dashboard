'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/utils/supabase';
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck, Users, Flame, UserPlus, X, Clock, Calendar, Globe, CalendarSearch, Coins, AlertTriangle, Crown, Award, ExternalLink, BarChart2, ArrowUpDown, MousePointer2, Download, Copy, Smartphone, Check, Loader2, KeyRound, Edit2, Search, History, List } from 'lucide-react';
import { format, parseISO } from 'date-fns';

type LiverStat = { system_id: string; username: string; liver_name?: string; avatar_url?: string; is_active: boolean; total_coins: number; unique_listeners: number; core_fans: number; top1_coins: number; dependency_rate: number; reward_rate: number; pin_code: string; };
type GiftLog = { id: number; created_at: string; coins: number; count?: number; gift_name?: string; viewers: { id: string; name: string; unique_id?: string; avatar_url?: string } | null; };
type VipListener = { viewer_id: string; viewer_name: string; unique_id: string | null; avatar_url: string | null; total_coins: number; rank: number; first_seen?: string; };
type ListenerProfile = { first_seen: string; last_seen: string; total_coins: number; day_of_week: Record<string, number>; hour_of_day: Record<string, number>; };

export default function Dashboard() {
  const [stats, setStats] = useState<LiverStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'today' | 'yesterday' | 'month' | 'total' | 'custom'>('today');
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
    const { data } = await supabase.rpc('get_liver_vips', params);
    setVipListeners(data ? (data as VipListener[]) : []);
  };

  const fetchViewerProfile = async (liverId: string, viewerId: string) => {
    setLoadingViewerProfile(true);
    try {
      const { data } = await supabase.rpc('get_listener_profile', { p_liver_id: liverId, p_viewer_id: viewerId });
      setViewerProfile(data as ListenerProfile || null);
    } catch (e) {
      setViewerProfile(null);
    } finally {
      setLoadingViewerProfile(false);
    }
  };

  const fetchViewerLogs = async (liverId: string, viewerId: string) => {
    setLoadingViewerLogs(true);
    try {
      const { startIso, endIso } = getTimeBounds();
      let query = supabase.from('gift_logs').select('id, created_at, coins, count, gift_name').eq('liver_id', liverId).eq('viewer_id', viewerId).order('created_at', { ascending: false }).limit(200);
      if (startIso) query = query.gte('created_at', startIso); if (endIso) query = query.lte('created_at', endIso);
      const { data } = await query;
      setViewerLogs(data ? (data as any) : []);
    } catch (e) {
      setViewerLogs([]);
    } finally {
      setLoadingViewerLogs(false);
    }
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

  if (loading && stats.length === 0) return <div className="min-h-screen bg-slate-950 flex items-center justify-center font-bold text-slate-500">システム初期化中...</div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-50 p-4 md:p-8 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-b border-slate-800/80 pb-6">
          <div><h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Hiyoko Intelligence</h1><p className="text-slate-400 mt-1 text-sm font-medium">TikTok Live 戦略マネジメントシステム</p></div>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="flex space-x-1 bg-slate-900/80 p-1 rounded-xl shadow-inner border border-slate-800 backdrop-blur-sm">
              <button onClick={() => setActiveTab('today')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'today' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Clock size={14} className="mr-1.5" /> 本日</button>
              <button onClick={() => setActiveTab('yesterday')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'yesterday' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><History size={14} className="mr-1.5" /> 昨日</button>
              <button onClick={() => setActiveTab('month')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'month' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Calendar size={14} className="mr-1.5" /> 今月</button>
              <button onClick={() => setActiveTab('total')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'total' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Globe size={14} className="mr-1.5" /> 全期間</button>
              <button onClick={() => setActiveTab('custom')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'custom' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><CalendarSearch size={14} className="mr-1.5" /> 期間指定</button>
            </div>
            {activeTab === 'custom' && (
              <div className="flex items-center space-x-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 shadow-inner animate-in fade-in">
                <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors"><input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full h-full bg-transparent text-xs px-3 py-2 outline-none font-bold text-slate-300 cursor-pointer [color-scheme:dark]" /></div>
                <span className="text-slate-500">〜</span>
                <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors"><input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full h-full bg-transparent text-xs px-3 py-2 outline-none font-bold text-slate-300 cursor-pointer [color-scheme:dark]" /></div>
                <button onClick={handleCustomFetch} disabled={!startDate || !endDate} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors">解析実行</button>
              </div>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-slate-900/60 border border-slate-800/80 p-6 rounded-3xl shadow-lg relative overflow-hidden backdrop-blur-sm">
            <div className="absolute top-0 right-0 p-6 opacity-10"><Coins size={100} /></div>
            <p className="text-xs font-bold text-indigo-400 mb-2 tracking-wider">システム総獲得ダイヤ</p>
            <h2 className="text-5xl font-black text-white mb-6 tracking-tight">{systemTotalCoins.toLocaleString()}</h2>
            <div className="flex gap-12">
              <div><p className="text-xs font-bold text-slate-500 mb-1">所属ライバー</p><p className="text-2xl font-bold text-white">{stats.length} <span className="text-sm text-slate-500 font-normal">名</span></p></div>
              <div><p className="text-xs font-bold text-slate-500 mb-1">システム全体コアファン (1K+)</p><p className="text-2xl font-bold text-amber-400">{systemCoreFans} <span className="text-sm text-slate-500 font-normal">名</span></p></div>
            </div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800/80 p-6 rounded-3xl shadow-sm flex flex-col justify-center backdrop-blur-sm">
            <div className="flex justify-between items-center mb-6"><h3 className="text-xs font-bold text-slate-400 flex items-center"><ShieldCheck size={14} className="mr-2" />健全度フィルター</h3>{healthFilter !== 'all' && <button onClick={() => setHealthFilter('all')} className="text-[10px] bg-slate-800 text-slate-300 px-2 py-1 rounded hover:bg-slate-700">解除</button>}</div>
            <div className="space-y-3">
              <div onClick={() => setHealthFilter(healthFilter === 'safe' ? 'all' : 'safe')} className={`flex items-center justify-between p-2 -mx-2 rounded-lg cursor-pointer transition-colors ${healthFilter === 'safe' ? 'bg-emerald-500/10' : 'hover:bg-slate-800/50'}`}>
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><span className="text-sm font-bold text-slate-300">健全</span></div><span className="font-black text-white text-lg">{safeCount}</span>
              </div>
              <div onClick={() => setHealthFilter(healthFilter === 'warning' ? 'all' : 'warning')} className={`flex items-center justify-between p-2 -mx-2 rounded-lg cursor-pointer transition-colors ${healthFilter === 'warning' ? 'bg-amber-500/10' : 'hover:bg-slate-800/50'}`}>
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-amber-500"></div><span className="text-sm font-bold text-slate-300">注意</span></div><span className="font-black text-white text-lg">{warningCount}</span>
              </div>
              <div onClick={() => setHealthFilter(healthFilter === 'danger' ? 'all' : 'danger')} className={`flex items-center justify-between p-2 -mx-2 rounded-lg cursor-pointer transition-colors ${healthFilter === 'danger' ? 'bg-rose-500/10' : 'hover:bg-slate-800/50'}`}>
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-rose-500"></div><span className="text-sm font-bold text-slate-300">危険</span></div><span className="font-black text-rose-400 text-lg">{dangerCount}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 rounded-3xl shadow-lg border border-slate-800 overflow-hidden">
          <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
            <h3 className="text-sm font-black text-slate-200">ライバー分析マトリックス</h3>
            <div className="flex items-center gap-2">
              <button onClick={handleExportCSV} disabled={isExporting} className="flex items-center text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-700 disabled:opacity-50">
                <Download size={14} className="mr-2" /> {isExporting ? '生成中...' : 'CSV出力'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[400px]">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="sticky top-0 z-10 bg-slate-950 shadow-md">
                <tr className="text-[10px] font-black text-slate-500 border-b border-slate-800/80">
                  <th className="p-4 pl-6 cursor-pointer hover:text-slate-300" onClick={() => handleSort('username')}>ライバー <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-4 text-right cursor-pointer hover:text-slate-300" onClick={() => handleSort('total_coins')}>獲得ダイヤ <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-4 text-center cursor-pointer hover:text-slate-300" onClick={() => handleSort('unique_listeners')}>ユニークリスナー <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-4 text-center cursor-pointer hover:text-slate-300" onClick={() => handleSort('core_fans')}>コアファン <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-4 w-48 cursor-pointer hover:text-slate-300" onClick={() => handleSort('dependency_rate')}>太客依存率 <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-4 text-center">健全度</th>
                  <th className="p-4 text-center pr-6">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredAndSortedStats.map((liver) => {
                  const isDanger = liver.dependency_rate >= 80 && liver.total_coins > 0;
                  const isSafe = liver.dependency_rate < 50 && liver.total_coins > 0;
                  const isSelected = selectedLiverId === liver.system_id;
                  return (
                    <tr key={liver.system_id} onClick={() => setSelectedLiverId(prev => prev === liver.system_id ? null : liver.system_id)} className={`cursor-pointer group ${isSelected ? 'bg-indigo-500/10' : 'hover:bg-slate-800/30'} ${!liver.is_active ? 'opacity-30' : ''}`}>
                      <td className="p-4 pl-6 flex items-center gap-3">
                        <SafeAvatar src={liver.avatar_url} name={liver.liver_name || liver.username} size="w-9 h-9" textSize="text-xs" />
                        <div className="flex flex-col"><div className="font-bold text-slate-200">{liver.liver_name || liver.username}</div><div className="text-[11px] font-mono text-indigo-400">@{liver.username}</div></div>
                      </td>
                      <td className="p-4 text-right font-black text-slate-200">{liver.total_coins.toLocaleString()}</td>
                      <td className="p-4 text-center font-bold text-slate-300">{liver.unique_listeners}</td>
                      <td className="p-4 text-center font-black text-amber-400">{liver.core_fans}</td>
                      <td className="p-4"><div className="flex items-center gap-3"><span className="w-10 text-xs font-black text-slate-300 text-right">{liver.total_coins > 0 ? `${liver.dependency_rate}%` : '-'}</span><div className="flex-grow h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full rounded-full ${isDanger ? 'bg-rose-500' : isSafe ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(liver.total_coins > 0 ? liver.dependency_rate : 0, 100)}%` }}></div></div></div></td>
                      <td className="p-4 text-center">
                        {liver.total_coins === 0 ? <span className="text-[10px] font-bold text-slate-600 border border-slate-700 px-2 py-0.5 rounded">データなし</span>
                         : isDanger ? <span className="text-[10px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded inline-flex items-center gap-1 w-20 justify-center"><AlertTriangle size={12}/> 危険</span>
                         : isSafe ? <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded inline-flex items-center gap-1 w-20 justify-center"><ShieldCheck size={12}/> 健全</span>
                         : <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded inline-flex items-center gap-1 w-20 justify-center">注意</span>}
                      </td>
                      <td className="p-4 pr-6 text-center" onClick={(e) => e.stopPropagation()}>
                         <div className="flex items-center justify-end gap-3">
                           <button onClick={() => toggleStatus(liver.system_id, liver.is_active)} className={`relative inline-flex h-5 w-9 items-center rounded-full ${liver.is_active ? 'bg-indigo-600' : 'bg-slate-700'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${liver.is_active ? 'translate-x-5' : 'translate-x-1'}`} /></button>
                         </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {selectedLiverId && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 h-[550px] flex flex-col">
              <div className="flex items-center gap-2 mb-6"><Crown className="h-5 w-5 text-amber-400" /><span className="text-sm font-black text-slate-200">VIP CRM</span></div>
              <div className="flex-grow overflow-y-auto pr-2 space-y-3">
                {vipListeners.map((vip) => (
                  <div key={vip.viewer_id} onClick={() => setSelectedViewer({id: vip.viewer_id, name: vip.viewer_name})} className="flex items-center p-3 rounded-xl border bg-slate-950/50 hover:bg-slate-800/80 cursor-pointer border-slate-800/50">
                    <div className="w-8 text-center"><span className="text-sm font-bold text-slate-500">{vip.rank}</span></div>
                    <SafeAvatar src={vip.avatar_url} name={vip.viewer_name} size="w-10 h-10" extraClass="ml-2" />
                    <div className="flex-grow ml-4"><span className="font-bold text-sm text-slate-200">{vip.viewer_name}</span><div className="text-[11px] font-mono text-indigo-400">{vip.unique_id ? `@${vip.unique_id}` : '@unknown'}</div></div>
                    <div className="text-right font-black text-sm text-indigo-400">{vip.total_coins.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">ダイヤ</span></div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 h-[550px] flex flex-col">
              <h3 className="text-sm font-black text-slate-300 mb-4 pb-4 border-b border-slate-800">最新ログ</h3>
              <div className="flex-grow overflow-y-auto space-y-2 pr-2">
                {detailLogs.map(log => (
                  <div key={log.id} onClick={() => log.viewers && setSelectedViewer({id: log.viewers.id, name: log.viewers.name})} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 hover:bg-slate-800/80 cursor-pointer border border-slate-800/50">
                    <div className="flex flex-col"><span className="font-bold text-xs text-slate-200">{log.viewers?.name}</span><span className="text-[10px] text-slate-500">{format(new Date(log.created_at), 'MM/dd HH:mm:ss')}</span></div>
                    <div className="flex items-center gap-2"><span className="text-[10px] text-slate-400">{log.gift_name}</span><span className="font-black text-emerald-400 text-xs">+{log.coins}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedViewer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in" onClick={() => setSelectedViewer(null)}>
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-2xl w-full shadow-2xl relative h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <button onClick={() => setSelectedViewer(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full"><X size={16}/></button>
              
              <div className="mb-6 border-b border-slate-800 pb-4">
                <h2 className="text-xl font-black text-white flex items-center"><List className="mr-3 text-indigo-400" /> {selectedViewer.name}</h2>
              </div>

              <div className="flex space-x-2 border-b border-slate-800/80 pb-2 mb-4">
                <button onClick={() => setActiveModalTab('analytics')} className={`flex items-center px-4 py-2 border-b-2 transition-all ${activeModalTab === 'analytics' ? 'border-indigo-500 text-indigo-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><BarChart2 size={16} className="mr-2"/> 傾向分析グラフ</button>
                <button onClick={() => setActiveModalTab('logs')} className={`flex items-center px-4 py-2 border-b-2 transition-all ${activeModalTab === 'logs' ? 'border-emerald-500 text-emerald-400 font-bold' : 'border-transparent text-slate-500 hover:text-slate-300'}`}><List size={16} className="mr-2"/> 個別ギフト履歴</button>
              </div>

              <div className="flex-grow overflow-y-auto pr-2">
                {activeModalTab === 'analytics' ? (
                  loadingViewerProfile ? (
                    <div className="flex items-center justify-center h-full text-indigo-500"><Loader2 className="animate-spin" size={32} /></div>
                  ) : !viewerProfile ? (
                    <div className="flex items-center justify-center h-full text-slate-500 text-sm font-bold">データがありません</div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full pb-4 animate-in fade-in duration-300">
                      <div className="bg-slate-950/50 p-5 rounded-2xl border border-slate-800/80 flex flex-col min-h-[250px]">
                        <h4 className="text-xs font-bold text-slate-400 mb-4">曜日別 投下トレンド</h4>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dowData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} /><XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                            <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ color: '#818cf8', fontWeight: 'bold' }} />
                            <Bar dataKey="coins" fill="#818cf8" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="bg-slate-950/50 p-5 rounded-2xl border border-slate-800/80 flex flex-col min-h-[250px]">
                        <h4 className="text-xs font-bold text-slate-400 mb-4">時間帯別 トレンド</h4>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={hodData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} /><XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={10} />
                            <Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ color: '#10b981', fontWeight: 'bold' }} />
                            <Bar dataKey="coins" fill="#10b981" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )
                ) : (
                  loadingViewerLogs ? (
                    <div className="flex items-center justify-center h-full text-emerald-500"><Loader2 className="animate-spin" size={32} /></div>
                  ) : viewerLogs.length === 0 ? (
                    <div className="text-center text-slate-500 py-10">ログが見つかりません</div>
                  ) : (
                    <div className="space-y-2 animate-in fade-in duration-300">
                      {viewerLogs.map(log => (
                        <div key={log.id} className="flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-200">{log.gift_name || '不明なギフト'} <span className="text-slate-500 text-xs ml-1">x{log.count || 1}</span></span>
                            <span className="text-xs text-slate-500 mt-1 flex items-center"><Clock size={10} className="mr-1"/> {format(new Date(log.created_at), 'yyyy/MM/dd HH:mm:ss')}</span>
                          </div>
                          <div className="font-black text-emerald-400 text-lg">+{log.coins.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}