'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../utils/supabase';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Activity, Coins, Users, Radio, Clock, Calendar, Globe, CalendarSearch, Plus, UserPlus } from 'lucide-react';
import { format } from 'date-fns';

type GiftLog = {
  id: number;
  created_at: string;
  coins: number;
  viewers: { name: string } | null;
};

type DashboardStats = { today: number; month: number; total: number; custom: number; };

export default function Dashboard() {
  const [logs, setLogs] = useState<GiftLog[]>([]);
  const [stats, setStats] = useState<DashboardStats>({ today: 0, month: 0, total: 0, custom: 0 });
  const [activeTab, setActiveTab] = useState<'today' | 'month' | 'total' | 'custom'>('today');
  
  // 期間指定用State
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFetchingCustom, setIsFetchingCustom] = useState(false);

  // ライバー管理用State
  const [targets, setTargets] = useState<string[]>([]);
  const [activeTarget, setActiveTarget] = useState<string>('');
  const [isAdding, setIsAdding] = useState(false);
  const [newTarget, setNewTarget] = useState('');

  useEffect(() => {
    fetchTargets();
    setupRealtimeSubscription();
  }, []);

  useEffect(() => {
    if (activeTarget && activeTab !== 'custom') {
      fetchDefaultData();
    }
  }, [activeTarget, activeTab]);

  const fetchTargets = async () => {
    const { data } = await supabase.from('target_livers').select('username').eq('is_active', true);
    if (data && data.length > 0) {
      const usernames = data.map(t => t.username);
      setTargets(usernames);
      setActiveTarget(usernames[0]);
    }
  };

  const handleAddTarget = async () => {
    if (!newTarget.trim()) return;
    const username = newTarget.replace('@', '').trim(); // @マークを除外
    
    const { error } = await supabase.from('target_livers').insert([{ username }]);
    if (!error) {
      setTargets(prev => [...prev, username]);
      setActiveTarget(username);
      setNewTarget('');
      setIsAdding(false);
    } else {
      alert('追加に失敗したか、既に登録されています。');
    }
  };

  const fetchDefaultData = async () => {
    // ※ 現時点ではデータ全体を取得（次ステップのBot改修で対象者ごとのフィルタリングを実装します）
    const { data: recentLogs } = await supabase
      .from('gift_logs')
      .select('id, created_at, coins, viewers(name)')
      .order('created_at', { ascending: false })
      .limit(50);
    if (recentLogs) setLogs(recentLogs as unknown as GiftLog[]);

    const { data: statsData } = await supabase.rpc('get_dashboard_stats');
    if (statsData) setStats(prev => ({ ...prev, ...statsData }));
  };

  const fetchCustomRange = async () => {
    if (!startDate || !endDate) return;
    setIsFetchingCustom(true);
    const startIso = new Date(`${startDate}T00:00:00+09:00`).toISOString();
    const endIso = new Date(`${endDate}T23:59:59+09:00`).toISOString();

    const { data: sumData } = await supabase.rpc('get_custom_range_sum', { start_date: startIso, end_date: endIso });
    setStats(prev => ({ ...prev, custom: sumData || 0 }));

    const { data: customLogs } = await supabase
      .from('gift_logs')
      .select('id, created_at, coins, viewers(name)')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })
      .limit(100);

    if (customLogs) setLogs(customLogs as unknown as GiftLog[]);
    setIsFetchingCustom(false);
  };

  const setupRealtimeSubscription = () => {
    supabase.channel('public:gift_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_logs' }, async (payload) => {
        if (activeTab === 'custom') return;
        const { data: viewerData } = await supabase.from('viewers').select('name').eq('id', payload.new.viewer_id).single();
        const newLog: GiftLog = { id: payload.new.id, created_at: payload.new.created_at, coins: payload.new.coins, viewers: { name: viewerData?.name || '不明なユーザー' } };
        setLogs(prev => [newLog, ...prev].slice(0, 50));
        setStats(prev => ({ ...prev, today: prev.today + payload.new.coins, month: prev.month + payload.new.coins, total: prev.total + payload.new.coins }));
      }).subscribe();
  };

  const chartData = logs.slice().reverse().map(log => ({
    time: format(new Date(log.created_at), 'MM/dd HH:mm'),
    coins: log.coins
  }));

  const displayTotal = activeTab === 'today' ? stats.today : activeTab === 'month' ? stats.month : activeTab === 'total' ? stats.total : stats.custom;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* ヘッダーエリア（ライバー切り替えUIを追加） */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Hiyoko <span className="text-indigo-400">Analytics</span>
            </h1>
            <p className="text-slate-400 mt-1 text-sm">TikTok Live 収益トラッキングシステム</p>
          </div>
          
          <div className="flex items-center space-x-3 bg-slate-900/50 p-2 rounded-xl border border-slate-800">
            <Radio size={18} className="text-indigo-400 ml-2" />
            <select 
              value={activeTarget} 
              onChange={(e) => setActiveTarget(e.target.value)}
              className="bg-transparent text-white text-sm font-semibold outline-none cursor-pointer pr-4"
            >
              {targets.map(t => (
                <option key={t} value={t} className="bg-slate-900 text-white">{t}</option>
              ))}
            </select>
            <div className="h-6 w-px bg-slate-700 mx-1"></div>
            {isAdding ? (
              <div className="flex items-center space-x-2 pr-1 animate-in fade-in slide-in-from-right-4">
                <input 
                  type="text" 
                  value={newTarget} 
                  onChange={e => setNewTarget(e.target.value)} 
                  placeholder="TikTok ID..." 
                  className="bg-slate-800 text-xs px-2 py-1.5 rounded border border-slate-700 outline-none w-28 text-white focus:border-indigo-500"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddTarget()}
                />
                <button onClick={handleAddTarget} className="bg-indigo-600 hover:bg-indigo-500 text-white p-1.5 rounded text-xs transition-colors"><Plus size={14} /></button>
                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-200 px-1 text-xs">Cancel</button>
              </div>
            ) : (
              <button 
                onClick={() => setIsAdding(true)} 
                className="flex items-center text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-700"
              >
                <UserPlus size={14} className="mr-1.5" /> 追加
              </button>
            )}
          </div>
        </header>

        {/* --- 以下、変更なし（既存のタブ、カード、グラフのコード） --- */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex space-x-2 bg-slate-900/50 p-1 rounded-lg border border-slate-800">
            <button onClick={() => setActiveTab('today')} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'today' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Clock size={16} className="mr-2" /> 本日</button>
            <button onClick={() => setActiveTab('month')} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'month' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Calendar size={16} className="mr-2" /> 今月</button>
            <button onClick={() => setActiveTab('total')} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'total' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><Globe size={16} className="mr-2" /> 全期間</button>
            <button onClick={() => setActiveTab('custom')} className={`flex items-center px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'custom' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}><CalendarSearch size={16} className="mr-2" /> 期間指定</button>
          </div>

          {activeTab === 'custom' && (
            <div className="flex items-center space-x-3 bg-slate-900/50 p-2 rounded-lg border border-slate-800 animate-in fade-in slide-in-from-left-4">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-800 border border-slate-700 text-sm rounded px-3 py-1.5 outline-none text-slate-200 focus:border-indigo-500" />
              <span className="text-slate-500">〜</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-800 border border-slate-700 text-sm rounded px-3 py-1.5 outline-none text-slate-200 focus:border-indigo-500" />
              <button onClick={fetchCustomRange} disabled={!startDate || !endDate || isFetchingCustom} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-md text-sm font-medium transition-colors">
                {isFetchingCustom ? '集計中...' : '集計'}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5"><Coins size={80} /></div>
            <p className="text-sm font-medium text-slate-400 mb-2">{activeTab === 'today' ? '本日の収益' : activeTab === 'month' ? '今月の収益' : activeTab === 'total' ? '累計収益' : '指定期間の収益'} (ダイヤ)</p>
            <h2 className="text-4xl font-extrabold text-white tracking-tight">{displayTotal.toLocaleString()}</h2>
            <p className="text-xs text-indigo-400 mt-3 flex items-center"><Activity size={14} className="mr-1" /> {activeTab === 'custom' ? '過去データ' : 'リアルタイム更新'}</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-sm relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5"><Users size={80} /></div>
            <p className="text-sm font-medium text-slate-400 mb-2">表示中のトランザクション</p>
            <h2 className="text-4xl font-extrabold text-white tracking-tight">{logs.length}</h2>
            <p className="text-xs text-slate-500 mt-3">{activeTab === 'custom' ? '指定期間内のイベント' : '最新のイベント'}</p>
          </div>
          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-6 rounded-2xl shadow-lg relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-20"><Radio size={80} /></div>
            <p className="text-sm font-medium text-indigo-100 mb-2">表示中のライバー</p>
            <h2 className="text-2xl font-bold text-white tracking-tight mt-1 truncate">{activeTarget || '読み込み中...'}</h2>
            <p className="text-xs text-indigo-200 mt-3">24時間365日 監視実行中</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[500px]">
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col">
            <h3 className="text-lg font-semibold text-slate-200 mb-6 flex items-center"><Activity className="mr-2 h-5 w-5 text-indigo-400" />収益トレンド</h3>
            <div className="flex-grow w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCoins" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#818cf8" stopOpacity={0.3}/><stop offset="95%" stopColor="#818cf8" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '8px', color: '#f8fafc' }} itemStyle={{ color: '#818cf8' }} formatter={(value: any) => [`${value} ダイヤ`, '収益']} labelFormatter={(label) => `${label} のイベント`} />
                  <Area type="monotone" dataKey="coins" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorCoins)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-sm flex flex-col overflow-hidden">
            <h3 className="text-lg font-semibold text-slate-200 mb-4 flex items-center pb-4 border-b border-slate-800"><Coins className="mr-2 h-5 w-5 text-amber-400" />受信ログ</h3>
            <div className="flex-grow overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {logs.map((log) => (
                <div key={log.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30 hover:bg-slate-800/80 transition-colors border border-slate-700/50">
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-medium text-slate-200 truncate text-sm">{log.viewers?.name || '不明なユーザー'}</span>
                    <span className="text-xs text-slate-500 mt-0.5">{format(new Date(log.created_at), 'MM/dd HH:mm')}</span>
                  </div>
                  <div className="flex items-center bg-indigo-500/10 px-3 py-1.5 rounded-full border border-indigo-500/20 whitespace-nowrap ml-2">
                    <span className="font-bold text-indigo-400 text-sm">+{log.coins} ダイヤ</span>
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3"><Radio className="animate-pulse h-8 w-8 opacity-50" /><p className="text-sm">データがありません</p></div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}