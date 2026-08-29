'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/utils/supabase';
import { BarChart, Bar, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ShieldCheck, Users, Flame, UserPlus, X, Clock, Calendar, Globe, CalendarSearch, Coins, AlertTriangle, Crown, Award, ExternalLink, BarChart2, ArrowUpDown, MousePointer2, Download, Copy, Smartphone, Check, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

type LiverStat = { system_id: string; username: string; avatar_url?: string; is_active: boolean; total_coins: number; unique_listeners: number; core_fans: number; top1_coins: number; dependency_rate: number; reward_rate: number; };
type GiftLog = { id: number; created_at: string; coins: number; viewers: { name: string; unique_id?: string; avatar_url?: string } | null; };
type VipListener = { viewer_id: string; viewer_name: string; unique_id: string | null; avatar_url: string | null; total_coins: number; rank: number; };
type ListenerProfile = { first_seen: string; last_seen: string; total_coins: number; day_of_week: Record<string, number>; hour_of_day: Record<string, number>; };

export default function Dashboard() {
  const [stats, setStats] = useState<LiverStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'today' | 'month' | 'total' | 'custom'>('total');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // ★ 登録用ステート
  const [isAdding, setIsAdding] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newSystemId, setNewSystemId] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showManualId, setShowManualId] = useState(false); // TikTokから取得失敗した時用のフォールバック

  const [healthFilter, setHealthFilter] = useState<'all' | 'danger' | 'warning' | 'safe'>('all');
  const [sortConfig, setSortConfig] = useState<{key: keyof LiverStat, direction: 'asc'|'desc'}>({ key: 'total_coins', direction: 'desc' });

  const [selectedLiverId, setSelectedLiverId] = useState<string | null>(null);
  const [detailLogs, setDetailLogs] = useState<GiftLog[]>([]);
  const [vipListeners, setVipListeners] = useState<VipListener[]>([]);

  const [selectedViewer, setSelectedViewer] = useState<{id: string, name: string} | null>(null);
  const [viewerProfile, setViewerProfile] = useState<ListenerProfile | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  // ★ コピー完了時のフィードバック用ステート
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (activeTab !== 'custom') fetchIntelligenceData();
    const channel = supabase.channel('public:gift_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_logs' }, async (payload) => {
        if (activeTab !== 'custom') fetchIntelligenceData();
        if (selectedLiverId && selectedLiverId === payload.new.liver_id) {
            const { data: viewerData } = await supabase.from('viewers').select('name, unique_id, avatar_url').eq('id', payload.new.viewer_id).single();
            const newLog: GiftLog = { id: payload.new.id, created_at: payload.new.created_at, coins: payload.new.coins, viewers: { name: viewerData?.name || '不明', unique_id: viewerData?.unique_id, avatar_url: viewerData?.avatar_url } };
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
    if (selectedViewer && selectedLiverId) fetchViewerProfile(selectedLiverId, selectedViewer.id);
  }, [selectedViewer]);

  useEffect(() => {
    if (selectedLiverId) {
      const isStillVisible = filteredAndSortedStats.some(s => s.system_id === selectedLiverId);
      if (!isStillVisible) setSelectedLiverId(null);
    }
  }, [healthFilter]);

  const getTimeBounds = () => {
    let startIso = null; let endIso = null; const now = new Date();
    if (activeTab === 'custom' && startDate && endDate) { startIso = new Date(startDate).toISOString(); endIso = new Date(endDate).toISOString(); }
    else if (activeTab === 'today') { const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })); today.setHours(0, 0, 0, 0); startIso = new Date(today.getTime() - 9 * 60 * 60 * 1000).toISOString(); }
    else if (activeTab === 'month') { const month = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' })); month.setDate(1); month.setHours(0, 0, 0, 0); startIso = new Date(month.getTime() - 9 * 60 * 60 * 1000).toISOString(); }
    return { startIso, endIso };
  };

  const fetchIntelligenceData = async () => {
    setLoading(true); 
    const { startIso, endIso } = getTimeBounds();
    const [statsRes, ratesRes] = await Promise.all([
      supabase.rpc('get_intelligence_stats', { p_start_date: startIso, p_end_date: endIso }),
      supabase.from('target_livers').select('system_id, reward_rate')
    ]);

    if (statsRes.data && ratesRes.data) {
      const merged = (statsRes.data as LiverStat[]).map(stat => {
        const rateData = ratesRes.data.find(r => r.system_id === stat.system_id);
        return { ...stat, reward_rate: rateData?.reward_rate || 5000 };
      });
      setStats(merged);
    }
    setLoading(false);
  };

  const fetchDetailLogs = async (systemId: string) => {
    let query = supabase.from('gift_logs').select('id, created_at, coins, viewers(name, unique_id, avatar_url)').eq('liver_id', systemId).order('created_at', { ascending: false }).limit(50);
    const { startIso, endIso } = getTimeBounds();
    if (startIso) query = query.gte('created_at', startIso); if (endIso) query = query.lte('created_at', endIso);
    const { data } = await query; if (data) setDetailLogs(data as unknown as GiftLog[]);
  };

  const fetchVips = async (systemId: string) => {
    const { startIso, endIso } = getTimeBounds();
    const { data } = await supabase.rpc('get_liver_vips', { p_system_id: systemId, p_start_date: startIso, p_end_date: endIso });
    if (data) setVipListeners(data as VipListener[]);
  };

  const fetchViewerProfile = async (liverId: string, viewerId: string) => {
    const { data } = await supabase.rpc('get_listener_profile', { p_liver_id: liverId, p_viewer_id: viewerId });
    if (data) setViewerProfile(data as ListenerProfile);
  };

  const handleCustomFetch = () => { if (startDate && endDate) { fetchIntelligenceData(); if (selectedLiverId) { fetchDetailLogs(selectedLiverId); fetchVips(selectedLiverId); } } };

  // ★ 魔法の自動検索＆追加機能
  const handleAddTarget = async () => {
    if (!newUsername.trim()) return;

    // 手動入力モードが表示されていて、システムIDが入力されている場合はそのまま登録
    if (showManualId && newSystemId.trim()) {
      await executeAddLiver(newSystemId.trim(), newUsername.replace('@', '').trim());
      return;
    }

    setIsSearching(true);
    try {
      const cleanUsername = newUsername.replace('@', '').trim();
      const res = await fetch(`/api/tiktok/profile?username=${cleanUsername}`);
      const data = await res.json();

      if (res.ok && data.userId) {
        // TikTokからシステムIDの取得に成功！
        await executeAddLiver(data.userId, cleanUsername, data.avatarUrl);
      } else {
        // TikTokのセキュリティ(CAPTCHA等)で弾かれた場合のスマートなフォールバック
        alert('TikTokからの自動取得がブロックされました。システムIDを手動で入力してください。');
        setShowManualId(true);
      }
    } catch (e) {
      alert('通信エラーが発生しました。システムIDを手動で入力してください。');
      setShowManualId(true);
    } finally {
      setIsSearching(false);
    }
  };

  const executeAddLiver = async (systemId: string, username: string, avatarUrl?: string) => {
    const { error } = await supabase.rpc('add_target_liver', { p_system_id: systemId, p_username: username });
    if (!error) {
      // アイコン画像が取得できていれば一緒に保存
      if (avatarUrl) {
        await supabase.from('target_livers').update({ avatar_url: avatarUrl }).eq('system_id', systemId);
      }
      setNewUsername('');
      setNewSystemId('');
      setShowManualId(false);
      setIsAdding(false);
      fetchIntelligenceData();
    } else {
      alert('データベースへの追加に失敗しました。既に登録されている可能性があります。');
    }
  };

  const toggleStatus = async (systemId: string, current: boolean) => { await supabase.from('target_livers').update({ is_active: !current }).eq('system_id', systemId); fetchIntelligenceData(); };

  // ★ ポータルのURLをクリップボードにコピー
  const handleCopyPortalUrl = (systemId: string) => {
    const url = `${window.location.origin}/portal/${systemId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(systemId);
    setTimeout(() => setCopiedId(null), 2000); // 2秒後にチェックマークを戻す
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    const { startIso, endIso } = getTimeBounds();
    
    let query = supabase.from('gift_logs').select(`created_at, coins, liver_id, target_livers(username), viewers(name, unique_id)`).order('created_at', { ascending: false });
    if (startIso) query = query.gte('created_at', startIso);
    if (endIso) query = query.lte('created_at', endIso);
    
    const { data, error } = await query;
    if (error || !data) { alert('データのエクスポートに失敗しました'); setIsExporting(false); return; }

    const headers = ['日付', '時間', 'ライバー', 'リスナー', 'TikTok ID', '獲得ダイヤ'];
    const rows = data.map((log: any) => {
      const d = new Date(log.created_at);
      return [
        format(d, 'yyyy/MM/dd'), format(d, 'HH:mm:ss'),
        `"${log.target_livers?.username || log.liver_id}"`,
        `"${log.viewers?.name || '不明'}"`,
        log.viewers?.unique_id || '',
        log.coins
      ].join(',');
    });

    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `hiyoko_logs_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setIsExporting(false);
  };

  const handleSort = (key: keyof LiverStat) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc' }));
  };

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
      const aValue = a[sortConfig.key] ?? 0;
      const bValue = b[sortConfig.key] ?? 0;
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [stats, healthFilter, sortConfig]);

  const selectedLiver = stats.find(s => s.system_id === selectedLiverId);
  const selectedLiverTotalCoins = selectedLiver?.total_coins || 1;

  const daysMap = { 'Monday': '月', 'Tuesday': '火', 'Wednesday': '水', 'Thursday': '木', 'Friday': '金', 'Saturday': '土', 'Sunday': '日' };
  const dowData = viewerProfile ? Object.keys(daysMap).map(d => ({ name: daysMap[d as keyof typeof daysMap], coins: viewerProfile.day_of_week?.[d] || 0 })) : [];
  const hodData = viewerProfile ? Array.from({length: 24}, (_, i) => ({ name: `${i}時`, coins: viewerProfile.hour_of_day?.[i.toString()] || 0 })) : [];

  const AvatarFallback = ({ name, size = "w-10 h-10", textSize = "text-sm" }: { name: string, size?: string, textSize?: string }) => {
    const initial = name ? name.charAt(0) : '?';
    return (
      <div className={`${size} rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold ${textSize} uppercase flex-shrink-0`}>
        {initial}
      </div>
    );
  };

  if (loading && stats.length === 0) return <div className="min-h-screen bg-slate-950 flex items-center justify-center font-bold text-slate-500">システム初期化中...</div>;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-50 p-4 md:p-8 font-sans selection:bg-indigo-500/30 overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-b border-slate-800/80 pb-6">
          <div><h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Hiyoko Intelligence</h1><p className="text-slate-400 mt-1 text-sm font-medium">TikTok Live 戦略マネジメントシステム</p></div>
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
            <div className="flex space-x-1 bg-slate-900/80 p-1 rounded-xl shadow-inner border border-slate-800 backdrop-blur-sm">
              <button onClick={() => setActiveTab('today')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'today' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Clock size={14} className="mr-1.5" /> 本日</button>
              <button onClick={() => setActiveTab('month')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'month' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Calendar size={14} className="mr-1.5" /> 今月</button>
              <button onClick={() => setActiveTab('total')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'total' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Globe size={14} className="mr-1.5" /> 全期間</button>
              <button onClick={() => setActiveTab('custom')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'custom' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><CalendarSearch size={14} className="mr-1.5" /> 期間指定</button>
            </div>
            {activeTab === 'custom' && (
              <div className="flex items-center space-x-2 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 shadow-inner animate-in fade-in">
                <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors">
                  <input type="datetime-local" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full h-full bg-transparent text-xs px-3 py-2 outline-none font-bold text-slate-300 cursor-pointer [color-scheme:dark]" />
                </div>
                <span className="text-slate-500">〜</span>
                <div className="bg-slate-950 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 transition-colors">
                  <input type="datetime-local" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full h-full bg-transparent text-xs px-3 py-2 outline-none font-bold text-slate-300 cursor-pointer [color-scheme:dark]" />
                </div>
                <button onClick={handleCustomFetch} disabled={!startDate || !endDate} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors">解析実行</button>
              </div>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-slate-900/60 border border-slate-800/80 p-6 rounded-3xl shadow-lg relative overflow-hidden backdrop-blur-sm">
            <div className="absolute top-0 right-0 p-6 opacity-10"><Coins size={100} /></div>
            <p className="text-xs font-bold text-indigo-400 mb-2 tracking-wider">システム総獲得ダイヤ <span className="font-normal text-slate-400">({activeTab === 'today' ? '本日' : activeTab === 'month' ? '今月' : activeTab === 'total' ? '累計' : '指定期間'})</span></p>
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
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></div><span className="text-sm font-bold text-slate-300">健全 <span className="text-[10px] text-slate-500 font-normal">(&lt;50%)</span></span></div><span className="font-black text-white text-lg">{safeCount}</span>
              </div>
              <div onClick={() => setHealthFilter(healthFilter === 'warning' ? 'all' : 'warning')} className={`flex items-center justify-between p-2 -mx-2 rounded-lg cursor-pointer transition-colors ${healthFilter === 'warning' ? 'bg-amber-500/10' : 'hover:bg-slate-800/50'}`}>
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]"></div><span className="text-sm font-bold text-slate-300">注意 <span className="text-[10px] text-slate-500 font-normal">(50~79%)</span></span></div><span className="font-black text-white text-lg">{warningCount}</span>
              </div>
              <div onClick={() => setHealthFilter(healthFilter === 'danger' ? 'all' : 'danger')} className={`flex items-center justify-between p-2 -mx-2 rounded-lg cursor-pointer transition-colors ${healthFilter === 'danger' ? 'bg-rose-500/10' : 'hover:bg-slate-800/50'}`}>
                <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]"></div><span className="text-sm font-bold text-slate-300">危険 <span className="text-[10px] text-slate-500 font-normal">(80%+)</span></span></div><span className="font-black text-rose-400 text-lg">{dangerCount}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/80 rounded-3xl shadow-lg border border-slate-800 overflow-hidden backdrop-blur-md">
          <div className="p-5 border-b border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/50">
            <h3 className="text-sm font-black text-slate-200">ライバー分析マトリックス {healthFilter !== 'all' && <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded ml-2">フィルター適用中</span>}</h3>
            <div className="flex items-center gap-2">
              <button onClick={handleExportCSV} disabled={isExporting} className="flex items-center text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl border border-slate-700 transition-colors disabled:opacity-50">
                <Download size={14} className="mr-2" /> {isExporting ? '生成中...' : 'CSV出力'}
              </button>
              
              {/* ★ スカウト用の超絶UI */}
              {isAdding ? (
                <div className="flex items-center space-x-2 bg-slate-800/80 p-1.5 rounded-xl border border-slate-700 animate-in fade-in">
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-bold">@</span>
                    <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="TikTok IDを入力" className="text-xs pl-6 pr-3 py-2 outline-none w-40 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono" disabled={isSearching} />
                  </div>
                  
                  {showManualId && (
                    <input type="text" value={newSystemId} onChange={e => setNewSystemId(e.target.value)} placeholder="システムID (手動)" className="text-xs px-3 py-2 outline-none w-32 bg-slate-950 border border-rose-500/50 rounded-lg text-white font-mono" />
                  )}

                  <button onClick={handleAddTarget} disabled={isSearching || !newUsername} className="flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-600/50 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors w-24">
                    {isSearching ? <Loader2 size={14} className="animate-spin" /> : (showManualId ? '強制追加' : '検索＆追加')}
                  </button>
                  <button onClick={() => { setIsAdding(false); setShowManualId(false); }} className="text-slate-400 hover:text-slate-200 p-2"><X size={16}/></button>
                </div>
              ) : (<button onClick={() => setIsAdding(true)} className="flex items-center text-xs font-bold text-slate-300 bg-indigo-600/20 text-indigo-400 hover:bg-indigo-600/40 px-4 py-2 rounded-xl border border-indigo-500/30 transition-colors"><UserPlus size={14} className="mr-2" /> 新規スカウト登録</button>)}
            </div>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
            <table className="w-full text-left border-collapse min-w-[900px] select-none relative">
              <thead className="sticky top-0 z-10 bg-slate-950 shadow-md">
                <tr className="text-[10px] font-black text-slate-500 border-b border-slate-800/80">
                  <th className="p-4 pl-6 cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('username')}>ライバー <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-4 text-right cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('total_coins')}>獲得ダイヤ <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-4 text-center cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('unique_listeners')}>ユニークリスナー <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-4 text-center cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('core_fans')}>コアファン (1K+) <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-4 w-48 cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('dependency_rate')}>太客依存率 (TOP1) <ArrowUpDown size={10} className="inline ml-1" /></th>
                  <th className="p-4 text-center">健全度</th>
                  <th className="p-4 text-center pr-6">監視 / アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredAndSortedStats.map((liver) => {
                  const isDanger = liver.dependency_rate >= 80 && liver.total_coins > 0;
                  const isSafe = liver.dependency_rate < 50 && liver.total_coins > 0;
                  const isSelected = selectedLiverId === liver.system_id;
                  return (
                    <tr key={liver.system_id} onClick={() => setSelectedLiverId(liver.system_id)} className={`cursor-pointer transition-colors group ${isSelected ? 'bg-indigo-500/10 border-l-2 border-indigo-500' : 'hover:bg-slate-800/30 border-l-2 border-transparent'} ${!liver.is_active ? 'opacity-30' : ''}`}>
                      <td className="p-4 pl-6 flex items-center gap-3 relative z-10">
                        {/* ★ ライバーのアイコン＆名前をTikTokへのリンク化 */}
                        <div 
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(`https://www.tiktok.com/@${liver.username}`, '_blank'); }}
                          className="flex items-center gap-3 cursor-pointer group/link hover:opacity-80 transition-opacity"
                        >
                          {liver.avatar_url ? <img src={liver.avatar_url} alt="" className="w-9 h-9 rounded-full border border-slate-700 object-cover flex-shrink-0" /> : <AvatarFallback name={liver.username} size="w-9 h-9" textSize="text-xs" />}
                          <div className="flex flex-col">
                            <div className={`font-bold flex items-center gap-1 group-hover/link:underline underline-offset-4 decoration-slate-400 ${isSelected ? 'text-indigo-400' : 'text-slate-200'}`}>
                              {liver.username} <ExternalLink size={10} className="text-slate-500" />
                            </div>
                            <div className="text-[10px] text-slate-600 font-mono mt-0.5">{liver.system_id.slice(0, 10)}...</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-right font-black text-slate-200">{liver.total_coins.toLocaleString()} <span className="text-[10px] text-slate-600 font-normal">ダイヤ</span></td>
                      <td className="p-4 text-center font-bold text-slate-300"><div className="flex items-center justify-center gap-1.5"><Users size={14} className="text-slate-500"/> {liver.unique_listeners.toLocaleString()}</div></td>
                      <td className="p-4 text-center font-black">{liver.core_fans > 0 ? <div className="flex items-center justify-center gap-1 text-amber-400"><Flame size={14}/> {liver.core_fans.toLocaleString()}</div> : <span className="text-slate-700">0</span>}</td>
                      <td className="p-4"><div className="flex items-center gap-3"><span className="w-10 text-xs font-black text-slate-300 text-right">{liver.total_coins > 0 ? `${liver.dependency_rate}%` : '-'}</span><div className="flex-grow h-1.5 bg-slate-800 rounded-full overflow-hidden"><div className={`h-full rounded-full ${isDanger ? 'bg-rose-500' : isSafe ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(liver.total_coins > 0 ? liver.dependency_rate : 0, 100)}%` }}></div></div></div></td>
                      
                      <td className="p-4 text-center">
                        {liver.total_coins === 0 ? <span className="text-[10px] font-bold text-slate-600 border border-slate-700 px-2 py-0.5 rounded">データなし</span>
                         : isDanger ? <span className="text-[10px] font-black text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded inline-flex items-center gap-1 w-20 justify-center"><AlertTriangle size={12}/> 危険</span>
                         : isSafe ? <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded inline-flex items-center gap-1 w-20 justify-center"><ShieldCheck size={12}/> 健全</span>
                         : <span className="text-[10px] font-black text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded inline-flex items-center gap-1 w-20 justify-center">注意</span>}
                      </td>
                      
                      <td className="p-4 pr-6 text-center" onClick={(e) => e.stopPropagation()}>
                         <div className="flex items-center justify-end gap-3">
                           {/* ★ マトリックス上にURLコピー＆ポータル展開ボタンを追加 */}
                           <div className="flex items-center gap-1 mr-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button onClick={() => handleCopyPortalUrl(liver.system_id)} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors tooltip-trigger relative">
                               {copiedId === liver.system_id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                             </button>
                             <button onClick={() => window.open(`/portal/${liver.system_id}`, '_blank')} className="p-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded-lg border border-indigo-500/30 transition-colors">
                               <Smartphone size={14} />
                             </button>
                           </div>
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

        {!selectedLiverId && (
          <div className="bg-slate-900/40 border border-slate-800/50 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center text-slate-500">
             <MousePointer2 size={48} className="opacity-20 mb-4 animate-bounce" />
             <p className="font-black text-lg text-slate-400">ライバーを選択してください</p>
             <p className="text-sm mt-2 font-medium">上のマトリックスから対象をクリックすると、詳細な顧客管理(CRM)を展開します。</p>
          </div>
        )}

        {/* VIP CRM ＆ 最新ログ */}
        {selectedLiverId && selectedLiver && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4">
            
            <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col relative overflow-hidden backdrop-blur-md h-[550px]">
              <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none"><Crown size={120} /></div>
              
              {/* ★ CRMヘッダーに「ポータルを開く」「URLコピー」の超絶便利ボタンを配置 */}
              <div className="flex items-center justify-between mb-6 relative z-10">
                <h3 className="text-sm font-black text-slate-300 flex items-center">
                  <Crown className="mr-2 h-5 w-5 text-amber-400" /> @{selectedLiver.username} - 貢献度ランキング (VIP CRM)
                </h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleCopyPortalUrl(selectedLiver.system_id)} className={`flex items-center text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${copiedId === selectedLiver.system_id ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'}`}>
                    {copiedId === selectedLiver.system_id ? <Check size={12} className="mr-1.5"/> : <Copy size={12} className="mr-1.5"/>} URLコピー
                  </button>
                  <button onClick={() => window.open(`/portal/${selectedLiver.system_id}`, '_blank')} className="flex items-center text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all">
                    <Smartphone size={12} className="mr-1.5"/> ポータルを確認
                  </button>
                </div>
              </div>
              
              <div className="flex-grow overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                <div className="space-y-3">
                  {vipListeners.map((vip) => {
                    const contributionRate = selectedLiverTotalCoins > 0 ? (vip.total_coins / selectedLiverTotalCoins) * 100 : 0;
                    
                    return (
                      <div 
                        key={vip.viewer_id} 
                        onClick={() => setSelectedViewer({id: vip.viewer_id, name: vip.viewer_name})}
                        className={`flex items-center p-3 rounded-xl border transition-colors cursor-pointer group ${vip.rank === 1 ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20' : 'bg-slate-950/50 border-slate-800/50 hover:bg-slate-800/80'}`}
                      >
                        <div className="w-8 text-center flex-shrink-0">
                          {vip.rank === 1 ? <Crown size={20} className="text-amber-400 mx-auto group-hover:scale-110 transition-transform" /> : vip.rank === 2 ? <Award size={20} className="text-slate-300 mx-auto" /> : vip.rank === 3 ? <Award size={20} className="text-amber-700 mx-auto" /> : <span className="text-sm font-bold text-slate-500">{vip.rank}</span>}
                        </div>
                        
                        <div 
                          className={`ml-2 flex-shrink-0 relative z-10 cursor-pointer ${vip.unique_id ? 'hover:opacity-80 transition-opacity' : ''}`}
                          onClick={(e) => {
                            e.preventDefault(); e.stopPropagation();
                            if (vip.unique_id) window.open(`https://www.tiktok.com/@${vip.unique_id}`, '_blank');
                            else alert('TikTok IDがまだ取得されていません（次回ギフト受信時に自動取得されます）');
                          }}
                        >
                          {vip.avatar_url ? <img src={vip.avatar_url} alt="" className="w-10 h-10 rounded-full border border-slate-700 object-cover" /> : <AvatarFallback name={vip.viewer_name} />}
                        </div>

                        <div className="flex-grow ml-4 min-w-0">
                          <div className="flex flex-col relative z-10">
                            <div className="flex items-center gap-2">
                              <span 
                                onClick={(e) => {
                                  e.preventDefault(); e.stopPropagation();
                                  if (vip.unique_id) window.open(`https://www.tiktok.com/@${vip.unique_id}`, '_blank');
                                  else alert('TikTok IDがまだ取得されていません（次回ギフト受信時に自動取得されます）');
                                }}
                                className={`font-bold text-sm truncate cursor-pointer ${vip.unique_id ? 'hover:underline decoration-slate-400 underline-offset-4' : ''} ${vip.rank === 1 ? 'text-amber-400' : 'text-slate-200'}`}
                              >
                                {vip.viewer_name} {vip.unique_id && <ExternalLink size={10} className="inline text-slate-500 ml-0.5" />}
                              </span>
                              {vip.total_coins >= 1000 && <span className="text-[10px] font-black text-orange-400 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded flex items-center"><Flame size={10} className="mr-0.5"/> コアファン</span>}
                            </div>
                            
                            <span 
                              onClick={(e) => {
                                e.preventDefault(); e.stopPropagation();
                                if (vip.unique_id) window.open(`https://www.tiktok.com/@${vip.unique_id}`, '_blank');
                                else alert('TikTok IDがまだ取得されていません（次回ギフト受信時に自動取得されます）');
                              }}
                              className="text-[11px] font-mono font-semibold text-indigo-400/90 truncate cursor-pointer mt-0.5 hover:underline"
                            >
                              {vip.unique_id ? `@${vip.unique_id}` : '@ID未取得'}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-3 mt-1.5">
                            <div className="flex-grow h-1 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-500 ${vip.rank === 1 ? 'bg-amber-400' : vip.total_coins >= 1000 ? 'bg-orange-400' : 'bg-indigo-500'}`} style={{ width: `${contributionRate}%` }}></div>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 w-8 text-right hidden sm:block">{contributionRate.toFixed(1)}%</span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end ml-4 flex-shrink-0">
                          <span className={`font-black text-sm ${vip.rank === 1 ? 'text-amber-400' : 'text-indigo-400'}`}>{vip.total_coins.toLocaleString()}</span>
                          <span className="text-[10px] text-slate-500">ダイヤ</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col overflow-hidden backdrop-blur-md h-[550px]">
              <h3 className="text-sm font-black text-slate-300 mb-4 flex items-center pb-4 border-b border-slate-800/80"><Coins className="mr-2 h-4 w-4 text-emerald-400" />最新の受信ログ</h3>
              <div className="flex-grow overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                {detailLogs.map((log) => {
                  const viewerName = log.viewers?.name || '不明';
                  const uniqueId = log.viewers?.unique_id;
                  const avatarUrl = log.viewers?.avatar_url;

                  const handleClickViewer = (e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (uniqueId) {
                      window.open(`https://www.tiktok.com/@${uniqueId}`, '_blank');
                    } else {
                      alert('TikTok IDがまだ取得されていません（次回ギフト受信時に自動取得されます）');
                    }
                  };

                  return (
                    <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 hover:bg-slate-800/80 transition-colors border border-slate-800/50">
                      <div 
                        className="flex items-center gap-3 overflow-hidden cursor-pointer group/log relative z-10"
                        onClick={handleClickViewer}
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} className="w-9 h-9 rounded-full border border-slate-700 object-cover flex-shrink-0 group-hover/log:opacity-80 transition-opacity" alt=""/>
                        ) : (
                          <AvatarFallback name={viewerName} size="w-9 h-9" textSize="text-xs" />
                        )}
                        <div className="flex flex-col overflow-hidden">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-200 text-sm truncate group-hover/log:underline decoration-slate-400 underline-offset-2">
                              {viewerName}
                            </span>
                            {uniqueId && <ExternalLink size={11} className="text-slate-500 flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] font-mono font-semibold text-indigo-400/90 truncate">
                              {uniqueId ? `@${uniqueId}` : '@ID未取得'}
                            </span>
                            <span className="text-[10px] font-medium text-slate-500">• {format(new Date(log.created_at), 'MM/dd HH:mm:ss')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 whitespace-nowrap ml-2 flex-shrink-0">
                        <span className="font-black text-emerald-400 text-xs">+{log.coins}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
          </div>
        )}

        {/* リスナープロファイリング モーダル */}
        {selectedViewer && viewerProfile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in" onClick={() => setSelectedViewer(null)}>
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-3xl w-full shadow-2xl relative overflow-hidden" onClick={e => e.stopPropagation()}>
              <button onClick={() => setSelectedViewer(null)} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors bg-slate-800 p-2 rounded-full"><X size={20}/></button>
              <div className="mb-8">
                <h2 className="text-2xl font-black text-white flex items-center"><BarChart2 className="mr-3 text-indigo-400" /> {selectedViewer.name} <span className="text-sm font-medium text-slate-500 ml-4 border border-slate-700 px-3 py-1 rounded-full">リスナー分析</span></h2>
                <div className="flex gap-8 mt-6">
                  <div><p className="text-xs text-slate-400 font-bold mb-1">総支援額</p><p className="text-2xl font-black text-amber-400">{viewerProfile.total_coins.toLocaleString()} <span className="text-sm text-slate-500 font-normal">ダイヤ</span></p></div>
                  <div><p className="text-xs text-slate-400 font-bold mb-1">初回来訪</p><p className="text-sm font-bold text-slate-200 mt-2">{format(parseISO(viewerProfile.first_seen), 'yyyy/MM/dd HH:mm')}</p></div>
                  <div><p className="text-xs text-slate-400 font-bold mb-1">最終来訪</p><p className="text-sm font-bold text-slate-200 mt-2">{format(parseISO(viewerProfile.last_seen), 'yyyy/MM/dd HH:mm')}</p></div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-950/50 p-5 rounded-2xl border border-slate-800/80 h-[250px] flex flex-col"><h4 className="text-xs font-bold text-slate-400 mb-4">曜日別 投下トレンド</h4><ResponsiveContainer width="100%" height="100%"><BarChart data={dowData}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} /><XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} /><Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ color: '#818cf8', fontWeight: 'bold' }} /><Bar dataKey="coins" fill="#818cf8" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
                <div className="bg-slate-950/50 p-5 rounded-2xl border border-slate-800/80 h-[250px] flex flex-col"><h4 className="text-xs font-bold text-slate-400 mb-4">時間帯別 投下トレンド (0-23時)</h4><ResponsiveContainer width="100%" height="100%"><BarChart data={hodData}><CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} /><XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={10} /><Tooltip cursor={{fill: '#1e293b'}} contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ color: '#10b981', fontWeight: 'bold' }} /><Bar dataKey="coins" fill="#10b981" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}