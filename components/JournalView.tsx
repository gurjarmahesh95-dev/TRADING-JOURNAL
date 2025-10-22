
import React, { useState, useEffect, useCallback } from 'react';
import type { Trade } from '../types';
import { Icon } from './Icon';
import { Spinner } from './Spinner';
import { signIn, signOut, syncTradesToSheet, isGoogleApiConfigured } from '../services/googleSheetsService';
import { getLivePrices } from '../services/geminiService';
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell } from 'recharts';

interface JournalViewProps {
  trades: Trade[];
  onAddTrade: () => void;
  onEditTrade: (trade: Trade) => void;
  onDeleteTrade: (tradeId: string) => void;
  onOpenExitModal: () => void;
  isGoogleReady: boolean;
  isGoogleSignedIn: boolean;
  onImportFromBroker: () => void;
  onImportFromSheets: () => void;
  isImporting: boolean;
}

const StatCard: React.FC<{ title: string; value: string; color: string }> = ({ title, value, color }) => (
    <div className="bg-gray-800 p-4 rounded-lg shadow-md">
        <h3 className="text-sm font-medium text-gray-400">{title}</h3>
        <p className={`text-2xl font-semibold ${color}`}>{value}</p>
    </div>
);


export const JournalView: React.FC<JournalViewProps> = ({ trades, onAddTrade, onEditTrade, onDeleteTrade, onOpenExitModal, isGoogleReady, isGoogleSignedIn, onImportFromBroker, onImportFromSheets, isImporting }) => {
    const closedTrades = trades.filter(t => t.status === 'closed');
    const openTrades = trades.filter(t => t.status === 'open');
    
    const [liveData, setLiveData] = useState<Record<string, number | null>>({});
    const [isFetchingLivePrices, setIsFetchingLivePrices] = useState(false);

    const fetchLivePrices = useCallback(async () => {
      const tickers = [...new Set(openTrades.map(t => t.ticker))];
      if (tickers.length === 0) {
        setLiveData({});
        return;
      }
      setIsFetchingLivePrices(true);
      try {
        const prices = await getLivePrices(tickers);
        setLiveData(prices);
      } catch (error) {
        console.error("Failed to fetch live prices:", error);
      } finally {
        setIsFetchingLivePrices(false);
      }
    }, [openTrades]);

    useEffect(() => {
        fetchLivePrices(); // Initial fetch
        const intervalId = setInterval(fetchLivePrices, 60000); // Auto-refresh every 60 seconds
        return () => clearInterval(intervalId); // Cleanup on unmount
    }, [fetchLivePrices]);

    const totalPnl = closedTrades.reduce((acc, trade) => acc + (trade.pnl || 0), 0);
    const winningTrades = closedTrades.filter(t => t.isWin).length;
    const losingTrades = closedTrades.length - winningTrades;
    const winRate = closedTrades.length > 0 ? (winningTrades / closedTrades.length) * 100 : 0;

    const totalUnrealizedPnl = openTrades.reduce((acc, trade) => {
        const currentPrice = liveData[trade.ticker];
        if (typeof currentPrice === 'number') {
            const pnl = (currentPrice - trade.entryPrice) * trade.shares;
            return acc + pnl;
        }
        return acc;
    }, 0);

    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncUrl, setLastSyncUrl] = useState('');

    const chartData = closedTrades
        .slice()
        .sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime())
        .reduce((acc, trade, index) => {
            const cumulativePnl = (acc[index - 1]?.cumulativePnl || 0) + (trade.pnl || 0);
            acc.push({
                name: `Trade ${index + 1}`,
                pnl: trade.pnl,
                cumulativePnl: cumulativePnl,
            });
            return acc;
        }, [] as { name: string; pnl: number | undefined; cumulativePnl: number }[]);

    const handleSync = async () => {
        setIsSyncing(true);
        setLastSyncUrl('');
        try {
            const url = await syncTradesToSheet(trades);
            setLastSyncUrl(url);
        } catch (error) {
            console.error("Sync failed", error);
            alert(`Sync failed. See console for details. Error: ${(error as Error).message}`);
        } finally {
            setIsSyncing(false);
        }
    };

    const handleDownloadCsv = () => {
        if (trades.length === 0) {
            alert("No trades to download.");
            return;
        }

        const header = ['id', 'ticker', 'status', 'entryDate', 'entryPrice', 'exitDate', 'exitPrice', 'shares', 'strategy', 'notes', 'pnl', 'isWin'];
        const csvRows = [
          header.join(','),
          ...trades.map(trade => {
            const values = header.map(fieldName => {
                const value = trade[fieldName as keyof Trade];
                if (typeof value === 'string') {
                    const strValue = value.replace(/"/g, '""').replace(/\n/g, ' '); // escape quotes and newlines
                    return `"${strValue}"`;
                }
                return value === undefined ? '' : value;
            });
            return values.join(',');
          })
        ];
    
        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `swing-journal-export-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex justify-between items-center mb-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Trading Journal</h1>
                    <p className="text-lg text-gray-400 mt-1">Track, analyze, and improve your performance.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onOpenExitModal}
                        disabled={openTrades.length === 0}
                        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Icon type="arrow-right-on-rectangle" className="h-5 w-5" />
                        Exit Trade
                    </button>
                    <button
                        onClick={onAddTrade}
                        className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-lg transition duration-300"
                    >
                        <Icon type="plus" className="h-5 w-5" />
                        Enter Trade
                    </button>
                </div>
            </div>
            
            <div className="flex flex-col md:flex-row gap-4 mb-4 p-4 bg-gray-800/50 rounded-lg items-center">
                {/* Data Sync Section */}
                <div className="w-full md:w-auto">
                    <h4 className="text-sm font-semibold text-gray-300 mb-2 text-center md:text-left">Data Sync</h4>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button onClick={onImportFromBroker} disabled={isImporting} className="flex items-center justify-center gap-2 text-sm bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-3 rounded-md transition duration-200 disabled:opacity-50">
                            <Icon type="link" className="h-5 w-5" />
                            <span>Import from Broker</span>
                        </button>
                        {isGoogleApiConfigured && isGoogleReady && isGoogleSignedIn && (
                            <button onClick={onImportFromSheets} disabled={isImporting} className="flex items-center justify-center gap-2 text-sm bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-3 rounded-md transition duration-200 disabled:opacity-50">
                                <Icon type="download" className="h-5 w-5 -rotate-90" />
                                <span>Import from Sheets</span>
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="hidden md:block border-l border-gray-700 h-12 mx-4"></div>

                {/* Export/Upload Section */}
                <div className="w-full md:w-auto">
                    <h4 className="text-sm font-semibold text-gray-300 mb-2 text-center md:text-left">Export / Upload</h4>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button onClick={handleDownloadCsv} className="flex items-center justify-center gap-2 text-sm bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-3 rounded-md transition duration-200">
                            <Icon type="download" className="h-5 w-5" />
                            <span>Download CSV</span>
                        </button>
                        {isGoogleApiConfigured && isGoogleReady && (
                            isGoogleSignedIn ? (
                                <div className="flex items-center gap-2">
                                    <button onClick={handleSync} disabled={isSyncing || isImporting} className="flex-grow flex justify-center items-center gap-2 text-sm bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-3 rounded-md transition duration-200 disabled:bg-green-400">
                                        {isSyncing ? <Spinner size="sm" /> : <Icon type="sync" className="h-5 w-5" />}
                                        <span>{isSyncing ? 'Syncing...' : 'Upload to Sheets'}</span>
                                    </button>
                                    <button onClick={signOut} title="Sign Out of Google" className="bg-gray-600 hover:bg-gray-500 text-white p-2 rounded-md">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V5.414l7.293 7.293a1 1 0 001.414-1.414L5.414 4H15a1 1 0 100-2H4a1 1 0 00-1 1z" clipRule="evenodd" /></svg>
                                    </button>
                                </div>
                            ) : (
                                <button onClick={signIn} className="flex items-center justify-center gap-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-3 rounded-md transition duration-200">
                                    <Icon type="sync" className="h-5 w-5" />
                                    <span>Sign In to Sync</span>
                                </button>
                            )
                        )}
                    </div>
                </div>
                 {isImporting && (
                    <div className="flex items-center gap-2 text-sm text-blue-300 md:ml-auto">
                        <Spinner size="sm" />
                        <span>Importing data...</span>
                    </div>
                )}
            </div>

            {!isGoogleApiConfigured && (
                <div className="text-center text-sm text-yellow-300 mb-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
                    <strong>Google Sheets integration is not configured.</strong> To enable it, add your Google Cloud API Key and Client ID to <code>services/googleSheetsService.ts</code>.
                </div>
            )}
            {lastSyncUrl && (
                <div className="text-center text-sm text-green-300 mb-4 p-3 bg-green-900/30 border border-green-700/50 rounded-lg">
                    Sync successful! <a href={lastSyncUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline hover:text-white">View your Google Sheet</a>.
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                <StatCard title="Total P/L (Closed)" value={`$${totalPnl.toFixed(2)}`} color={totalPnl >= 0 ? 'text-green-400' : 'text-red-400'} />
                <StatCard title="Unrealized P/L (Open)" value={`$${totalUnrealizedPnl.toFixed(2)}`} color={totalUnrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'} />
                <StatCard title="Win Rate" value={`${winRate.toFixed(1)}%`} color="text-blue-400" />
                <StatCard title="Winning Trades" value={`${winningTrades}`} color="text-green-400" />
                <StatCard title="Losing Trades" value={`${losingTrades}`} color="text-red-400" />
            </div>
            
            {/* Open Positions */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold text-white">Open Positions</h2>
                    <button onClick={fetchLivePrices} disabled={isFetchingLivePrices} className="flex items-center gap-1 text-sm text-gray-400 hover:text-white disabled:opacity-50">
                        <Icon type="refresh" className={`h-4 w-4 ${isFetchingLivePrices ? 'animate-spin' : ''}`} />
                        Refresh
                    </button>
                </div>
                 <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                     <div className="overflow-x-auto">
                         <table className="min-w-full divide-y divide-gray-700">
                             <thead className="bg-gray-700/50">
                                 <tr>
                                     <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Ticker</th>
                                     <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Entry Date</th>
                                     <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Entry Price</th>
                                     <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Current Price</th>
                                     <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Unrealized P/L</th>
                                     <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Shares</th>
                                     <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                                 </tr>
                             </thead>
                             <tbody className="bg-gray-800 divide-y divide-gray-700">
                                 {openTrades.length === 0 ? (
                                     <tr>
                                         <td colSpan={7} className="text-center py-6 text-gray-400">
                                             No open positions.
                                         </td>
                                     </tr>
                                 ) : (
                                     openTrades.map((trade) => {
                                        const currentPrice = liveData[trade.ticker];
                                        const unrealizedPnl = (typeof currentPrice === 'number') ? (currentPrice - trade.entryPrice) * trade.shares : null;

                                        return (
                                         <tr key={trade.id} className="hover:bg-gray-700/50 transition-colors">
                                             <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-semibold text-white">{trade.ticker}</div></td>
                                             <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{trade.entryDate}</td>
                                             <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${trade.entryPrice.toFixed(2)}</td>
                                             <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                                {isFetchingLivePrices && currentPrice === undefined ? <div className="h-4 w-12 bg-gray-700 rounded animate-pulse"></div> :
                                                 typeof currentPrice === 'number' ? `$${currentPrice.toFixed(2)}` : 'N/A'}
                                             </td>
                                             <td className={`px-6 py-4 whitespace-nowrap text-sm font-semibold ${unrealizedPnl === null ? 'text-gray-400' : unrealizedPnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                 {unrealizedPnl === null ? 'N/A' : `$${unrealizedPnl.toFixed(2)}`}
                                             </td>
                                             <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{trade.shares}</td>
                                             <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                 <div className="flex justify-end items-center gap-4">
                                                     <button onClick={() => onEditTrade(trade)} className="text-blue-400 hover:text-blue-300 font-semibold">
                                                         Close / Edit
                                                     </button>
                                                     <button onClick={() => onDeleteTrade(trade.id)} className="text-red-400 hover:text-red-300">
                                                         <Icon type="trash" className="h-5 w-5" />
                                                     </button>
                                                 </div>
                                             </td>
                                         </tr>
                                     )})
                                 )}
                             </tbody>
                         </table>
                     </div>
                 </div>
            </div>

            {/* Performance Chart */}
            <div className="mb-8">
                <h2 className="text-xl font-semibold text-white mb-4">Performance Chart (Closed Trades)</h2>
                <div className="bg-gray-800 rounded-lg shadow-lg p-4 h-80">
                    {chartData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
                                <XAxis dataKey="name" stroke="#9ca3af" />
                                <YAxis stroke="#9ca3af" domain={['auto', 'auto']} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1f2937', borderColor: '#4b5563' }}
                                    formatter={(value: number) => `$${value.toFixed(2)}`}
                                />
                                <Legend />
                                <Bar dataKey="pnl" name="P/L per Trade" barSize={20}>
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.pnl! >= 0 ? '#4ade80' : '#f87171'} />
                                    ))}
                                </Bar>
                                <Line type="monotone" dataKey="cumulativePnl" name="Equity Curve" stroke="#60a5fa" strokeWidth={2} dot={false} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">
                            <p>Log at least two closed trades to see your performance chart.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Trade History */}
            <div>
                <h2 className="text-xl font-semibold text-white mb-4">Trade History (Closed)</h2>
                <div className="bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-700/50">
                                <tr>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Ticker</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Entry Date</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Exit Date</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">P/L</th>
                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Strategy</th>
                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-gray-800 divide-y divide-gray-700">
                                {closedTrades.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-10 text-gray-400">
                                            No closed trades yet.
                                        </td>
                                    </tr>
                                ) : (
                                    closedTrades.map((trade) => (
                                        <tr key={trade.id} className="hover:bg-gray-700/50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-semibold text-white">{trade.ticker}</div></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{trade.entryDate}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{trade.exitDate}</td>
                                            <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${trade.isWin ? 'text-green-400' : 'text-red-400'}`}>
                                                ${trade.pnl!.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{trade.strategy}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex justify-end items-center gap-4">
                                                    <button onClick={() => onEditTrade(trade)} className="text-blue-400 hover:text-blue-300">
                                                        <Icon type="edit" className="h-5 w-5" />
                                                    </button>
                                                    <button onClick={() => onDeleteTrade(trade.id)} className="text-red-400 hover:text-red-300">
                                                        <Icon type="trash" className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
