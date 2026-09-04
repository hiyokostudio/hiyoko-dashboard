'use client';

import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/utils/supabase';
import { ShieldCheck, Users, Flame, UserPlus, X, Clock, Calendar, Globe, CalendarSearch, Coins, AlertTriangle, Crown, Award, ExternalLink, MousePointer2, Download, Copy, Smartphone, Check, Loader2, KeyRound, Edit2, Search, History, List } from 'lucide-react';
import { format } from 'date-fns';

type LiverStat = { system_id: string; username: string; liver_name?: string; avatar_url?: string; is_active: boolean; total_coins: number; unique_listeners: number; core_fans: number; dependency_rate: number; reward_rate: number; pin_code: string; };
type GiftLog = { id: number; created_at: string; coins: number; count?: number; gift_name?: string; viewers: { name: string; unique_id?: string; avatar_url?: string } | null; };
type VipListener = { viewer_id: string; viewer_name: string; unique_id: string | null; avatar_url: string | null; total_coins: number; rank: number; first_seen?: string; };

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

  const [selectedLiverId, setSelectedLiverId] = useState<string | null>(null);
  const [detailLogs, setDetailLogs] = useState<GiftLog[]>([]);
  const [vipListeners, setVipListeners] = useState<VipListener[]>([]);

  // 💡 リスナー個別のログモーダル用ステート
  const [selectedViewer, setSelectedViewer] = useState<{id: string, name: string, total_coins: number} | null>(null);
  const [viewerLogs, setViewerLogs] = useState<GiftLog[]>([]);
  const [loadingViewerLogs, setLoadingViewerLogs] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingPin, setEditingPin] = useState<string | null>(null);
  const [editPinValue, setEditPinValue] = useState('');

  const adminMasterKey = "hiyoko_god_mode_2026";

  const SafeAvatar = ({ src, name, size = "w-10 h-10", textSize = "text-sm", extraClass = "" }: { src?: string | null, name: string, size?: string, textSize?: string, extraClass?: string }) => {
    const [imgError, setImgError] = useState(false);
    if (!src || imgError) return (
      <div className={`${size} rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 font-bold ${textSize} uppercase flex-shrink-0 ${extraClass}`}>
        {name ? name.charAt(0) : '?'}
      </div>
    );
    return <img src={src} onError={() => setImgError(true)} className={`${size} rounded-full border border-slate-700 object-cover flex-shrink-0 ${extraClass}`} alt=""/>;
  };

  useEffect(() => {
    if (activeTab !== 'custom') fetchIntelligenceData();
    
    const channel = supabase.channel('public:gift_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_logs' }, async (payload) => {
        if (activeTab !== 'custom') fetchIntelligenceData();
        if (selectedLiverId && String(selectedLiverId) === String(payload.new.liver_id)) {
            const { data: viewerData } = await supabase.from('viewers').select('name, unique_id, avatar_url').eq('id', payload.new.viewer_id).single();
            const newLog: GiftLog = { 
              id: payload.new.id, created_at: payload.new.created_at, coins: payload.new.coins, count: payload.new.count, gift_name: payload.new.gift_name,
              viewers: { name: viewerData?.name || '不明', unique_id: viewerData?.unique_id, avatar_url: viewerData?.avatar_url } 
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

  // 💡 リスナーがクリックされたら、その人の個別ログを取得する
  useEffect(() => {
    if (selectedViewer && selectedLiverId) fetchViewerLogs(selectedLiverId, selectedViewer.id);
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
    let query = supabase.from('gift_logs').select('id, created_at, coins, count, gift_name, viewers(name, unique_id, avatar_url)').eq('liver_id', systemId).order('created_at', { ascending: false }).limit(50);
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

  // 💡 リスナー個別のギフトログを直接取得する関数
  const fetchViewerLogs = async (liverId: string, viewerId: string) => {
    setLoadingViewerLogs(true);
    const { startIso, endIso } = getTimeBounds();
    let query = supabase.from('gift_logs').select('id, created_at, coins, count, gift_name').eq('liver_id', liverId).eq('viewer_id', viewerId).order('created_at', { ascending: false }).limit(200);
    if (startIso) query = query.gte('created_at', startIso); if (endIso) query = query.lte('created_at', endIso);
    const { data } = await query;
    if (data) setViewerLogs(data as any);
    setLoadingViewerLogs(false);
  };

  const handleCustomFetch = () => { if (startDate && endDate) { fetchIntelligenceData(); if (selectedLiverId) { fetchDetailLogs(selectedLiverId); fetchVips(selectedLiverId); } } };

  // 💡 外部テーブルに依存せず、ギフトログとリスナー情報だけでCSVを出力するように修正（絶対にエラーにならない）
  const handleExportCSV = async () => {
    setIsExporting(true);
    const { startIso, endIso } = getTimeBounds();
    
    let query = supabase.from('gift_logs').select(`created_at, coins, count, gift_name, liver_id, viewers(name, unique_id)`).order('created_at', { ascending: false });
    if (startIso) query = query.gte('created_at', startIso);
    if (endIso) query = query.lte('created_at', endIso);
    
    const { data, error } = await query;
    if (error || !data) { alert('データのエクスポートに失敗しました。'); setIsExporting(false); return; }

    const headers = ['日付', '時間', 'ライバーシステムID', 'リスナー', 'TikTok ID', 'ギフト名', '連打数', '獲得ダイヤ'];
    const rows = data.map((log: any) => {
      const d = new Date(log.created_at);
      return [
        format(d, 'yyyy/MM/dd'), format(d, 'HH:mm:ss'),
        log.liver_id,
        `"${log.viewers?.name || '不明'}"`,
        log.viewers?.unique_id || '',
        `"${log.gift_name || ''}"`,
        log.count || 1,
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

  const handleAddTarget = async () => { /* 省略せずに残す */
    if (!newUsername.trim()) return;
    if (showManualId && newSystemId.trim()) {
      const { error } = await supabase.rpc('add_target_liver', { p_system_id: newSystemId.trim(), p_username: newUsername.replace('@', '').trim() });
      if (!error) { setNewUsername(''); setNewSystemId(''); setShowManualId(false); setIsAdding(false); fetchIntelligenceData(); }
      return;
    }
    setIsSearching(true);
    try {
      const cleanUsername = newUsername.replace('@', '').trim();
      const res = await fetch(`/api/tiktok/profile?username=${cleanUsername}`);
      const data = await res.json();
      if (res.ok && data.userId) {
        const { error } = await supabase.rpc('add_target_liver', { p_system_id: data.userId, p_username: cleanUsername });
        if (!error) {
          if (data.avatarUrl || data.nickname) await supabase.from('target_livers').update({ avatar_url: data.avatarUrl, liver_name: data.nickname }).eq('system_id', data.userId);
          setNewUsername(''); setShowManualId(false); setIsAdding(false); fetchIntelligenceData();
        }
      } else { setShowManualId(true); }
    } catch (e) { setShowManualId(true); }
    finally { setIsSearching(false); }
  };

  const filteredStats = useMemo(() => {
    let result = [...stats];
    if (healthFilter === 'danger') result = result.filter(s => s.total_coins > 0 && s.dependency_rate >= 80);
    if (healthFilter === 'warning') result = result.filter(s => s.total_coins > 0 && s.dependency_rate >= 50 && s.dependency_rate < 80);
    if (healthFilter === 'safe') result = result.filter(s => s.total_coins > 0 && s.dependency_rate < 50);
    return result.sort((a, b) => b.total_coins - a.total_coins);
  }, [stats, healthFilter]);

  const selectedLiver = stats.find(s => s.system_id === selectedLiverId);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-50 p-4 md:p-8 font-sans overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-b border-slate-800/80 pb-6">
          <div><h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">Hiyoko Intelligence</h1></div>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex space-x-1 bg-slate-900/80 p-1 rounded-xl shadow-inner border border-slate-800">
              <button onClick={() => setActiveTab('today')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'today' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Clock size={14} className="mr-1.5" /> 本日</button>
              <button onClick={() => setActiveTab('yesterday')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'yesterday' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><History size={14} className="mr-1.5" /> 昨日</button>
              <button onClick={() => setActiveTab('month')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'month' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Calendar size={14} className="mr-1.5" /> 今月</button>
              <button onClick={() => setActiveTab('total')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'total' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><Globe size={14} className="mr-1.5" /> 全期間</button>
              <button onClick={() => setActiveTab('custom')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold ${activeTab === 'custom' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}><CalendarSearch size={14} className="mr-1.5" /> 期間指定</button>
            </div>
          </div>
        </header>

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
                  <th className="p-4 pl-6">ライバー</th><th className="p-4 text-right">獲得ダイヤ</th><th className="p-4 text-center">ユニークリスナー</th><th className="p-4 text-center">コアファン</th><th className="p-4">太客依存率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {filteredStats.map((liver) => {
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
                      <td className="p-4 font-black text-slate-300">{liver.total_coins > 0 ? `${liver.dependency_rate}%` : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {selectedLiverId && selectedLiver && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-3xl p-6 h-[550px] flex flex-col">
              <div className="flex items-center gap-2 mb-6"><Crown className="h-5 w-5 text-amber-400" /><span className="text-sm font-black text-slate-200">{selectedLiver.liver_name || selectedLiver.username} - VIP CRM</span></div>
              <div className="flex-grow overflow-y-auto pr-2 space-y-3">
                {vipListeners.map((vip) => (
                  <div key={vip.viewer_id} onClick={() => setSelectedViewer({id: vip.viewer_id, name: vip.viewer_name, total_coins: vip.total_coins})} className="flex items-center p-3 rounded-xl border bg-slate-950/50 hover:bg-slate-800/80 cursor-pointer border-slate-800/50">
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
                  <div key={log.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800/50">
                    <div className="flex flex-col"><span className="font-bold text-xs text-slate-200">{log.viewers?.name}</span><span className="text-[10px] text-slate-500">{format(new Date(log.created_at), 'MM/dd HH:mm:ss')}</span></div>
                    <div className="flex items-center gap-2"><span className="text-[10px] text-slate-400">{log.gift_name}</span><span className="font-black text-emerald-400 text-xs">+{log.coins}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 💡 完璧に動作する「個別ギフト履歴モーダル」 */}
        {selectedViewer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={() => setSelectedViewer(null)}>
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-2xl w-full shadow-2xl relative h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <button onClick={() => setSelectedViewer(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full"><X size={16}/></button>
              
              <div className="mb-6 border-b border-slate-800 pb-4">
                <h2 className="text-xl font-black text-white flex items-center"><List className="mr-3 text-indigo-400" /> {selectedViewer.name} <span className="text-xs font-medium text-slate-500 ml-4 border border-slate-700 px-3 py-1 rounded-full">ギフト履歴</span></h2>
                <div className="mt-4"><p className="text-xs text-slate-400 font-bold mb-1">対象期間の総支援額</p><p className="text-3xl font-black text-amber-400">{selectedViewer.total_coins.toLocaleString()} <span className="text-sm text-slate-500 font-normal">ダイヤ</span></p></div>
              </div>

              <div className="flex-grow overflow-y-auto pr-2 space-y-2">
                {loadingViewerLogs ? (
                  <div className="flex items-center justify-center h-full text-indigo-500"><Loader2 className="animate-spin" size={32} /></div>
                ) : viewerLogs.length === 0 ? (
                  <div className="text-center text-slate-500 py-10">ログが見つかりません</div>
                ) : (
                  viewerLogs.map(log => (
                    <div key={log.id} className="flex justify-between items-center bg-slate-950/50 p-4 rounded-xl border border-slate-800/50 hover:bg-slate-800/50 transition-colors">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-200">{log.gift_name || '不明なギフト'} <span className="text-slate-500 text-xs ml-1">x{log.count || 1}</span></span>
                        <span className="text-xs text-slate-500 mt-1 flex items-center"><Clock size={10} className="mr-1"/> {format(new Date(log.created_at), 'yyyy/MM/dd HH:mm:ss')}</span>
                      </div>
                      <div className="font-black text-emerald-400 text-lg">+{log.coins.toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}