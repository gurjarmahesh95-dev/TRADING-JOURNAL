
import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { Spinner } from './Spinner';
import type { WatchlistItem, WatchlistScanResult } from '../types';
import { scanWatchlistTickers } from '../services/geminiService';

const WATCHLIST_STORAGE_KEY = 'swing-trade-watchlist';

export const WatchlistView: React.FC = () => {
    const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
    const [newItem, setNewItem] = useState('');
    const [isScanning, setIsScanning] = useState(false);
    const [scanResults, setScanResults] = useState<WatchlistScanResult[]>([]);
    const [error, setError] = useState('');

    useEffect(() => {
        const savedWatchlist = localStorage.getItem(WATCHLIST_STORAGE_KEY);
        if (savedWatchlist) {
            setWatchlist(JSON.parse(savedWatchlist));
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
    }, [watchlist]);

    const handleAddItem = (e: React.FormEvent) => {
        e.preventDefault();
        const ticker = newItem.trim().toUpperCase();
        if (ticker && !watchlist.some(item => item.ticker === ticker)) {
            const newItemObject: WatchlistItem = { id: new Date().toISOString(), ticker };
            setWatchlist(prev => [newItemObject, ...prev]);
            setNewItem('');
        }
    };

    const handleRemoveItem = (id: string) => {
        setWatchlist(prev => prev.filter(item => item.id !== id));
    };

    const handleScan = async () => {
        if (watchlist.length === 0) {
            alert("Please add at least one ticker to your watchlist before scanning.");
            return;
        }
        setIsScanning(true);
        setError('');
        setScanResults([]);
        try {
            const tickers = watchlist.map(item => item.ticker);
            const results = await scanWatchlistTickers(tickers);
            setScanResults(results);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsScanning(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 h-full flex flex-col">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-white">Watchlist & Opportunity Scanner</h1>
                <p className="text-lg text-gray-400 mt-1">Monitor tickers and scan for potential setups with Gemini.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 h-full overflow-hidden">
                {/* Watchlist Management */}
                <div className="lg:col-span-1 flex flex-col bg-gray-800 rounded-lg p-4">
                    <h2 className="text-xl font-semibold mb-4 text-white">Your Tickers</h2>
                    <form onSubmit={handleAddItem} className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={newItem}
                            onChange={(e) => setNewItem(e.target.value)}
                            placeholder="Add Ticker (e.g., AAPL)"
                            className="flex-grow bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white"
                        />
                        <button type="submit" className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 disabled:bg-blue-400">
                            <Icon type="plus" />
                        </button>
                    </form>
                    <div className="flex-grow overflow-y-auto pr-2">
                        {watchlist.length === 0 ? (
                            <p className="text-center text-gray-400 pt-8">Your watchlist is empty.</p>
                        ) : (
                            <ul className="space-y-2">
                                {watchlist.map(item => (
                                    <li key={item.id} className="flex items-center justify-between bg-gray-700 p-2 rounded-md">
                                        <span className="font-semibold">{item.ticker}</span>
                                        <button onClick={() => handleRemoveItem(item.id)} className="text-red-400 hover:text-red-300">
                                            <Icon type="trash" className="h-5 w-5" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Scan Results */}
                <div className="lg:col-span-2 flex flex-col bg-gray-800 rounded-lg p-4">
                    <div className="flex-shrink-0">
                        <h2 className="text-xl font-semibold text-white">AI-Powered Scan</h2>
                        <p className="text-sm text-gray-400 mb-4">Find recent news catalysts and technical patterns.</p>
                        <button onClick={handleScan} disabled={isScanning || watchlist.length === 0} className="w-full flex justify-center items-center gap-2 px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed">
                            {isScanning ? <><Spinner size="sm" /> Scanning Watchlist...</> : 'Scan for Setups'}
                        </button>
                    </div>
                    <div className="mt-4 flex-grow overflow-y-auto">
                        {error && (
                            <div className="mt-4 p-4 bg-red-900/30 border border-red-700 text-red-300 rounded-md">
                                <p>{error}</p>
                            </div>
                        )}
                        {scanResults.length > 0 ? (
                            <div className="space-y-4 pr-2">
                                {scanResults.map((result, index) => (
                                    <div key={index} className="bg-gray-900 p-4 rounded-lg">
                                        <h3 className="font-bold text-lg text-blue-300">{result.ticker}</h3>
                                        <p className="mt-2 text-sm text-gray-300 whitespace-pre-wrap">{result.analysis}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            !isScanning && (
                                <div className="text-center text-gray-400 pt-16">
                                    <p>Scan results will appear here.</p>
                                </div>
                            )
                        )}
                         {isScanning && (
                            <div className="text-center text-gray-400 pt-16 flex flex-col items-center">
                                <Spinner />
                                <p className="mt-4">Analyzing with Google Search...</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
