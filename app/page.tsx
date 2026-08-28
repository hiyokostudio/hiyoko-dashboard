'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/utils/supabase';
import { ShieldCheck, Activity, Users, Flame, UserPlus, X, Clock, Calendar, Globe, CalendarSearch } from 'lucide-react';

type LiverStat = {
  system_id: string;
  username: string;
  is_active: boolean;
  total_coins: number;
  unique_listeners: number;
  core_fans: number;
  top1_coins: number;
  dependency_rate: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState<LiverStat[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'today' | 'month' | 'total' | 'custom'>('total');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [isAdding, setIsAdding] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newSystemId, setNewSystemId] = useState('');

  useEffect(() => {
    if (activeTab !== 'custom') {
      fetchData();
    }
    const channel = supabase.channel('public:gift_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gift_logs' }, () => {
        if (activeTab !== 'custom') fetchData();
      }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeTab]);

  const fetchData = async (customStart?: string, customEnd?: string) => {
    setLoading(true);
    let startIso = null;
    let endIso = null;

    const now = new Date();
    if (customStart && customEnd) {
      startIso = new Date(`${customStart}T00:00:00+09:00`).toISOString();
      endIso = new Date(`${customEnd}T23:59:59+09:00`).toISOString();
    } else if (activeTab === 'today') {
      const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
      today.setHours(0, 0, 0, 0);
      startIso = new Date(today.getTime() - 9 * 60 * 60 * 1000).toISOString();
    } else if (activeTab === 'month') {
      const month = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
      month.setDate(1);
      month.setHours(0, 0, 0, 0);
      startIso = new Date(month.getTime() - 9 * 60 * 60 * 1000).toISOString();
    }

    const { data, error } = await supabase.rpc('get_intelligence_stats', {
      p_start_date: startIso,
      p_end_date: endIso
    });

    if (data && !error) {
      setStats((data as LiverStat[]).sort((a, b) => b.total_coins - a.total_coins));
    }
    setLoading(false);
  };

  const handleCustomFetch = () => {
    if (startDate && endDate) fetchData(startDate, endDate);
  };

  const handleAddTarget = async () => {
    if (!newUsername.trim() || !newSystemId.trim()) return;
    const username = newUsername.replace('@', '').trim();
    const system_id = newSystemId.trim();

    const { error } = await supabase.rpc('add_target_liver', { p_system_id: system_id, p_username: username });
    if (!error) {
      setNewUsername(''); setNewSystemId(''); setIsAdding(false);
      fetchData();
    } else {
      alert('追加に失敗しました。');
    }
  };

  const toggleStatus = async (systemId: string, current: boolean) => {
    await supabase.from('target_livers').update({ is_active: !current }).eq('system_id', systemId);
    fetchData();
  };

  const systemTotalCoins = stats.reduce((sum, s) => sum + s.total_coins, 0);
  const systemCoreFans = stats.reduce((sum, s) => sum + s.core_fans, 0);
  const activeCount = stats.filter(s => s.is_active).length;
  
  const dangerCount = stats.filter(s => s.total_coins > 0 && s.dependency_rate >= 80).length;
  const safeCount = stats.filter(s => s.total_coins > 0 && s.dependency_rate < 50).length;
  const warningCount = stats.filter(s => s.total_coins > 0 && s.dependency_rate >= 50 && s.dependency_rate < 80).length;

  if (loading && stats.length === 0) return <div className="min-h-screen bg-[#F4F7F9] flex items-center justify-center font-bold text-slate-400">システム構築中...</div>;

  return (
    <div className="min-h-screen bg-[#F4F7F9] text-slate-800 p-6 md:p-10 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        
        <header className="pb-2">
          <h1 className="text-3xl font-black tracking-tight text-[#161B22]">Analytics</h1>
          <p className="text-sm font-bold text-slate-500 mt-1">HiyokoStudio Intelligence</p>
        </header>

        {/* 期間指定UI */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <div className="flex space-x-1 bg-white p-1 rounded-xl shadow-sm border border-slate-200">
            <button onClick={() => setActiveTab('today')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'today' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Clock size={14} className="mr-1.5" /> 本日</button>
            <button onClick={() => setActiveTab('month')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'month' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Calendar size={14} className="mr-1.5" /> 今月</button>
            <button onClick={() => setActiveTab('total')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'total' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><Globe size={14} className="mr-1.5" /> 全期間</button>
            <button onClick={() => setActiveTab('custom')} className={`flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'custom' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}><CalendarSearch size={14} className="mr-1.5" /> 期間指定</button>
          </div>
          {activeTab === 'custom' && (
            <div className="flex items-center space-x-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="bg-slate-50 border border-slate-200 text-sm rounded px-3 py-1.5 outline-none font-bold text-slate-700" />
              <span className="text-slate-400">〜</span>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="bg-slate-50 border border-slate-200 text-sm rounded px-3 py-1.5 outline-none font-bold text-slate-700" />
              <button onClick={handleCustomFetch} disabled={!startDate || !endDate} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors">集計</button>
            </div>
          )}
        </div>

        {/* システムステータス（Mockup準拠） */}
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 bg-[#1A2130] text-white rounded-2xl p-8 shadow-lg relative overflow-hidden flex flex-col justify-center">
            <p className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-wider">Total System Coins <span className="lowercase font-normal">({activeTab === 'today' ? '本日' : activeTab === 'month' ? '今月' : activeTab === 'total' ? '累計' : '指定期間'})</span></p>
            <h2 className="text-6xl font-black mb-8">{systemTotalCoins.toLocaleString()}</h2>
            <div className="flex gap-10">
              <div>
                <p className="text-xs font-bold text-slate-400 mb-1">所属ライバー</p>
                <p className="text-xl font-bold">{activeCount} <span className="text-sm text-slate-400 font-normal">名</span></p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 mb-1">システム全体コアファン (1K+)</p>
                <p className="text-xl font-bold">{systemCoreFans} <span className="text-sm text-slate-400 font-normal">名</span></p>
              </div>
            </div>
          </div>

          <div className="md:w-96 bg-white rounded-2xl p-8 shadow-sm border border-slate-200 flex flex-col justify-center">
            <h3 className="text-sm font-bold text-slate-700 mb-6">アカウント健全度分布</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500"></div><span className="text-sm font-bold text-slate-700">健全 <span className="text-xs text-slate-400 font-normal">(50%未満)</span></span></div>
                <span className="font-black text-slate-900 text-xl">{safeCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500"></div><span className="text-sm font-bold text-slate-700">注意 <span className="text-xs text-slate-400 font-normal">(50%~79%)</span></span></div>
                <span className="font-black text-slate-900 text-xl">{warningCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-rose-500"></div><span className="text-sm font-bold text-slate-700">危険 <span className="text-xs text-slate-400 font-normal">(80%以上)</span></span></div>
                <span className="font-black text-slate-900 text-xl">{dangerCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ライバー詳細分析 */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center bg-white gap-4">
            <h3 className="text-lg font-black text-slate-800">ライバー詳細分析</h3>
            {isAdding ? (
              <div className="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-200 shadow-sm animate-in fade-in">
                <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="ユーザー名" className="text-xs px-3 py-2 outline-none w-32 bg-white border border-slate-200 rounded-lg focus:border-blue-500" />
                <input type="text" value={newSystemId} onChange={e => setNewSystemId(e.target.value)} placeholder="システムID (数字)" className="text-xs px-3 py-2 outline-none w-40 bg-white border border-slate-200 rounded-lg font-mono focus:border-blue-500" />
                <button onClick={handleAddTarget} className="bg-[#1A2130] hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-xs font-bold transition-colors">登録</button>
                <button onClick={() => setIsAdding(false)} className="text-slate-400 hover:text-slate-600 p-2"><X size={16}/></button>
              </div>
            ) : (
              <button onClick={() => setIsAdding(true)} className="flex items-center text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl transition-colors">
                <UserPlus size={14} className="mr-1.5" /> ライバーを追加
              </button>
            )}
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-white text-xs font-bold text-slate-400 border-b-2 border-slate-100">
                  <th className="p-4 pl-6">ライバー名</th>
                  <th className="p-4 text-right">獲得コイン</th>
                  <th className="p-4 text-center">ユニークリスナー</th>
                  <th className="p-4 text-center">コアファン (1K+)</th>
                  <th className="p-4 w-48">太客依存率 (TOP1)</th>
                  <th className="p-4 text-center">ステータス</th>
                  <th className="p-4 text-center pr-6">監視</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {stats.map((liver) => {
                  const isDanger = liver.dependency_rate >= 80 && liver.total_coins > 0;
                  const isSafe = liver.dependency_rate < 50 && liver.total_coins > 0;
                  const noData = liver.total_coins === 0;
                  
                  return (
                    <tr key={liver.system_id} className={`hover:bg-slate-50 transition-colors ${!liver.is_active ? 'opacity-40 grayscale' : ''}`}>
                      <td className="p-4 pl-6">
                        <div className="font-black text-slate-900">{liver.username}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{liver.system_id.slice(0, 10)}...</div>
                      </td>
                      <td className="p-4 text-right font-bold text-slate-700">{liver.total_coins.toLocaleString()} <span className="text-[10px] text-slate-400">c</span></td>
                      <td className="p-4 text-center font-bold text-slate-700">
                        <div className="flex items-center justify-center gap-1.5">
                          <Users size={14} className="text-slate-400"/> {liver.unique_listeners.toLocaleString()}
                        </div>
                      </td>
                      <td className="p-4 text-center font-black text-blue-600">
                        {liver.core_fans > 0 ? (
                          <div className="flex items-center justify-center gap-1"><Flame size={14}/> {liver.core_fans.toLocaleString()}</div>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="w-12 text-sm font-black text-slate-700 text-right">{liver.total_coins > 0 ? `${liver.dependency_rate}%` : '-'}</span>
                          <div className="flex-grow h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${isDanger ? 'bg-rose-500' : isSafe ? 'bg-emerald-500' : 'bg-amber-400'}`} 
                              style={{ width: `${Math.min(liver.total_coins > 0 ? liver.dependency_rate : 0, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {noData ? <span className="text-xs font-bold text-slate-400">データなし</span>
                         : isDanger ? <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-1 rounded">超危険</span>
                         : isSafe ? <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded"><ShieldCheck size={12} className="inline mr-1" />健全</span>
                         : <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-1 rounded">注意</span>}
                      </td>
                      <td className="p-4 pr-6 text-center">
                         <button 
                          onClick={() => toggleStatus(liver.system_id, liver.is_active)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${liver.is_active ? 'bg-blue-500' : 'bg-slate-300'}`}
                        >
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
      </div>
    </div>
  );
}