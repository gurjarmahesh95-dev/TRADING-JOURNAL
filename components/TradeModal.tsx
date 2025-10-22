
import React, { useState, useEffect, useMemo } from 'react';
import type { Trade, TickerSuggestion } from '../types';
import { Icon } from './Icon';
import { Spinner } from './Spinner';
import { analyzeChartImage, getTradeFeedback, getCurrentPrice, getPreTradeAnalysis, searchTickerSymbols } from '../services/geminiService';

interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (trade: Trade) => void;
  tradeToEdit: Trade | null;
}

const emptyTrade: Omit<Trade, 'id' | 'status'> = {
  ticker: '',
  entryDate: '',
  entryPrice: 0,
  shares: 0,
  strategy: '',
  notes: '',
  mindset: 'Neutral',
  stopLoss: 0,
  takeProfit: 0,
  exitDate: '',
  exitPrice: 0,
};

export const TradeModal: React.FC<TradeModalProps> = ({ isOpen, onClose, onSave, tradeToEdit }) => {
  const [trade, setTrade] = useState(emptyTrade);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string>('');
  const [feedback, setFeedback] = useState<string>('');
  const [preTradeAnalysis, setPreTradeAnalysis] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGettingFeedback, setIsGettingFeedback] = useState(false);
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [isAnalyzingPreTrade, setIsAnalyzingPreTrade] = useState(false);
  const [tickerSuggestions, setTickerSuggestions] = useState<TickerSuggestion[]>([]);
  const [isSearchingTicker, setIsSearchingTicker] = useState(false);


  useEffect(() => {
    if (isOpen) {
        if (tradeToEdit) {
            const { id, status, pnl, isWin, ...editableTrade } = tradeToEdit;
            setTrade({
                ...emptyTrade, // Start with defaults
                ...editableTrade,
                exitDate: editableTrade.exitDate || '',
                exitPrice: editableTrade.exitPrice || 0,
                stopLoss: editableTrade.stopLoss || 0,
                takeProfit: editableTrade.takeProfit || 0,
                mindset: editableTrade.mindset || 'Neutral',
            });

            if (editableTrade.chartImage) {
                setImagePreview(`data:image/png;base64,${editableTrade.chartImage.base64}`);
                setImageBase64(editableTrade.chartImage.base64);
                setAnalysis(editableTrade.chartImage.analysis || '');
            } else {
                setImagePreview(null);
                setImageBase64(null);
                setAnalysis('');
            }
            setFeedback('');
            setPreTradeAnalysis('');
        } else {
            // New trade
            setTrade({ ...emptyTrade, entryDate: new Date().toISOString().split('T')[0] });
            setImagePreview(null);
            setImageBase64(null);
            setAnalysis('');
            setFeedback('');
            setPreTradeAnalysis('');
        }
        setTickerSuggestions([]);
    }
  }, [tradeToEdit, isOpen]);

  // Debounced effect for ticker search
    useEffect(() => {
        const searchTerm = trade.ticker.trim();
        // Clear suggestions if input is too short or looks like a complete ticker
        if (searchTerm.length < 2 || (searchTerm.length > 1 && !searchTerm.includes(' '))) {
            setTickerSuggestions([]);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchingTicker(true);
            try {
                const results = await searchTickerSymbols(searchTerm);
                setTickerSuggestions(results);
            } catch (error) {
                console.error("Failed to search for tickers:", error);
                setTickerSuggestions([]);
            } finally {
                setIsSearchingTicker(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timer);
    }, [trade.ticker]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const numericFields = ['entryPrice', 'exitPrice', 'shares', 'stopLoss', 'takeProfit'];
    setTrade(prev => ({ ...prev, [name]: numericFields.includes(name) ? parseFloat(value) || 0 : value }));
  };
  
  const handleFetchPrice = async () => {
      if (!trade.ticker) return;
      setIsFetchingPrice(true);
      const price = await getCurrentPrice(trade.ticker);
      if (price !== null) {
          setTrade(prev => ({...prev, entryPrice: price}));
      } else {
          alert(`Could not fetch the price for ${trade.ticker}. Please enter it manually.`);
      }
      setIsFetchingPrice(false);
  };
  
  const handleSuggestionClick = (suggestion: TickerSuggestion) => {
    setTrade(prev => ({ ...prev, ticker: suggestion.ticker }));
    setTickerSuggestions([]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(',')[1];
        setImagePreview(reader.result as string);
        setImageBase64(base64String);
        setAnalysis('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyzeChart = async () => {
    if (!imageBase64) return;
    setIsAnalyzing(true);
    setAnalysis('');
    const prompt = "Analyze this trading chart. Identify key patterns, support/resistance levels, and indicators that might justify the entry. What are the potential risks visible on the chart?";
    const result = await analyzeChartImage(imageBase64, prompt);
    setAnalysis(result);
    setIsAnalyzing(false);
  };

  const handleGetFeedback = async () => {
      if (!tradeToEdit || tradeToEdit.status !== 'closed') return;
      setIsGettingFeedback(true);
      setFeedback('');
      const result = await getTradeFeedback(tradeToEdit);
      setFeedback(result);
      setIsGettingFeedback(false);
  };

  const handlePreTradeAnalysis = async () => {
      if (!trade.ticker || !trade.entryPrice) return;
      setIsAnalyzingPreTrade(true);
      setPreTradeAnalysis('');
      const result = await getPreTradeAnalysis(trade);
      setPreTradeAnalysis(result);
      setIsAnalyzingPreTrade(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const isClosing = trade.exitDate && trade.exitPrice && trade.exitPrice > 0;
    
    let pnl: number | undefined = undefined;
    let isWin: boolean | undefined = undefined;

    if (isClosing) {
      pnl = (trade.exitPrice! - trade.entryPrice) * trade.shares;
      isWin = pnl > 0;
    }

    const newTrade: Trade = {
      ...trade,
      id: tradeToEdit?.id || new Date().toISOString(),
      status: isClosing ? 'closed' : 'open',
      exitDate: isClosing ? trade.exitDate : undefined,
      exitPrice: isClosing ? trade.exitPrice : undefined,
      pnl,
      isWin,
      chartImage: imageBase64 ? { base64: imageBase64, analysis } : undefined,
    };
    onSave(newTrade);
    onClose();
  };
  
  const riskReward = useMemo(() => {
    const { entryPrice, shares, stopLoss, takeProfit } = trade;
    if (!entryPrice || !shares || !stopLoss || !takeProfit || stopLoss <= 0 || takeProfit <= 0) return null;
    if (entryPrice <= stopLoss) return { profit: 0, loss: 0, ratio: 0, error: 'Stop loss must be below entry for a long trade.' };

    const potentialLoss = (entryPrice - stopLoss) * shares;
    const potentialProfit = (takeProfit - entryPrice) * shares;
    if (potentialLoss <= 0 || potentialProfit <= 0) return null;

    const ratio = potentialProfit / potentialLoss;
    return { profit: potentialProfit, loss: potentialLoss, ratio };
  }, [trade.entryPrice, trade.shares, trade.stopLoss, trade.takeProfit]);


  if (!isOpen) return null;

  const isNewPosition = !tradeToEdit;
  const isClosingPosition = tradeToEdit && tradeToEdit.status === 'open';
  const modalTitle = isNewPosition ? 'Log New Position' : (isClosingPosition ? 'Close Position' : 'Edit Trade');
  const saveButtonText = isNewPosition ? 'Add Position' : (isClosingPosition ? 'Close Position' : 'Save Changes');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <Icon type="close" className="h-6 w-6" />
        </button>
        <h2 className="text-2xl font-bold mb-6 text-white">{modalTitle}</h2>
        
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Trade Details Column */}
          <div className="lg:col-span-1 space-y-4">
            <div>
              <label htmlFor="ticker" className="block text-sm font-medium text-gray-300">Company Name or Ticker</label>
               <div className="relative mt-1">
                 <input 
                    type="text" 
                    name="ticker" 
                    value={trade.ticker} 
                    onChange={handleChange} 
                    placeholder="e.g., Apple or AAPL" 
                    className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" 
                    required 
                    autoComplete="off"
                 />
                  {isSearchingTicker && <div className="absolute inset-y-0 right-0 flex items-center pr-3"><Spinner size="sm" /></div>}
                  {tickerSuggestions.length > 0 && (
                      <ul className="absolute z-10 w-full mt-1 bg-gray-600 border border-gray-500 rounded-md shadow-lg max-h-60 overflow-auto">
                          {tickerSuggestions.map((suggestion) => (
                              <li
                                  key={suggestion.ticker}
                                  onMouseDown={() => handleSuggestionClick(suggestion)} // onMouseDown fires before onBlur
                                  className="cursor-pointer select-none relative py-2 px-3 text-white hover:bg-blue-600"
                              >
                                  <span className="font-bold">{suggestion.ticker}</span>
                                  <span className="ml-2 text-gray-300">{suggestion.name}</span>
                              </li>
                          ))}
                      </ul>
                  )}
               </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="entryDate" className="block text-sm font-medium text-gray-300">Entry Date</label>
                <input type="date" name="entryDate" value={trade.entryDate} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" required />
              </div>
              <div>
                 <label htmlFor="entryPrice" className="block text-sm font-medium text-gray-300">Entry Price</label>
                 <div className="flex items-center gap-1">
                    <input type="number" step="0.01" name="entryPrice" value={trade.entryPrice} onChange={handleChange} className="block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" required />
                     {isNewPosition && (
                        <button type="button" onClick={handleFetchPrice} disabled={isFetchingPrice || !trade.ticker} title="Fetch Current Price" className="p-1.5 bg-gray-600 hover:bg-gray-500 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
                            {isFetchingPrice ? <Spinner size="sm" /> : <Icon type="search" className="h-4 w-4 text-white"/>}
                        </button>
                     )}
                 </div>
              </div>
            </div>
             <div>
              <label htmlFor="shares" className="block text-sm font-medium text-gray-300">Shares / Quantity</label>
              <input type="number" name="shares" value={trade.shares} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" required />
            </div>

            <div className="pt-2">
                <h3 className="text-lg font-semibold text-gray-200 mb-2">Trade Plan</h3>
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="stopLoss" className="block text-sm font-medium text-gray-300">Stop Loss</label>
                        <input type="number" step="0.01" name="stopLoss" value={trade.stopLoss} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" />
                    </div>
                     <div>
                        <label htmlFor="takeProfit" className="block text-sm font-medium text-gray-300">Take Profit</label>
                        <input type="number" step="0.01" name="takeProfit" value={trade.takeProfit} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="exitDate" className="block text-sm font-medium text-gray-300">Exit Date</label>
                <input type="date" name="exitDate" value={trade.exitDate} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" />
              </div>
              <div>
                <label htmlFor="exitPrice" className="block text-sm font-medium text-gray-300">Exit Price</label>
                <input type="number" step="0.01" name="exitPrice" value={trade.exitPrice} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" />
              </div>
            </div>
          </div>
          
          {/* Planning & Analysis Column */}
           <div className="lg:col-span-1 space-y-4">
             <div>
                <label htmlFor="strategy" className="block text-sm font-medium text-gray-300">Strategy</label>
                <input type="text" name="strategy" value={trade.strategy} onChange={handleChange} placeholder="e.g., Breakout, Mean Reversion" className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" />
            </div>
             <div>
                <label htmlFor="mindset" className="block text-sm font-medium text-gray-300">Mindset</label>
                <select name="mindset" id="mindset" value={trade.mindset} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white">
                    <option>Neutral</option>
                    <option>Disciplined</option>
                    <option>Confident</option>
                    <option>Anxious</option>
                    <option>FOMO</option>
                </select>
            </div>
            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-300">Notes / Rationale</label>
              <textarea name="notes" rows={4} value={trade.notes} onChange={handleChange} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white"></textarea>
            </div>

            {riskReward && (
                <div className="p-3 bg-gray-900 rounded-md space-y-2">
                    <h3 className="font-semibold text-gray-200">Risk/Reward Analysis</h3>
                    {riskReward.error ? <p className="text-sm text-red-400">{riskReward.error}</p> : (
                         <div className="grid grid-cols-3 gap-2 text-sm">
                            <div>
                                <div className="text-gray-400">Profit</div>
                                <div className="font-bold text-green-400">${riskReward.profit.toFixed(2)}</div>
                            </div>
                             <div>
                                <div className="text-gray-400">Loss</div>
                                <div className="font-bold text-red-400">${riskReward.loss.toFixed(2)}</div>
                            </div>
                             <div>
                                <div className="text-gray-400">Ratio</div>
                                <div className="font-bold text-blue-400">{riskReward.ratio.toFixed(2)} : 1</div>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {isNewPosition && (
                 <div className="pt-2 space-y-2">
                    <button type="button" onClick={handlePreTradeAnalysis} disabled={isAnalyzingPreTrade || !trade.ticker} className="w-full flex justify-center items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:bg-indigo-400">
                        {isAnalyzingPreTrade ? <><Spinner size="sm" /> Analyzing Plan...</> : 'Get Pre-Trade Analysis'}
                    </button>
                    {preTradeAnalysis && (
                        <div className="p-3 bg-gray-900 rounded-md">
                            <h3 className="font-semibold text-indigo-300">Pre-Trade Sanity Check:</h3>
                            <p className="text-sm text-gray-300 whitespace-pre-wrap">{preTradeAnalysis}</p>
                        </div>
                    )}
                </div>
            )}
          </div>

          {/* Chart Analysis Column */}
          <div className="lg:col-span-1 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300">Chart Screenshot</label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true"><path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <div className="flex text-sm text-gray-400">
                    <label htmlFor="file-upload" className="relative cursor-pointer bg-gray-700 rounded-md font-medium text-blue-400 hover:text-blue-300 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-gray-800 focus-within:ring-blue-500 px-2">
                      <span>Upload a file</span>
                      <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/png, image/jpeg" />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
                </div>
              </div>
            </div>
            {imagePreview && (
              <div className="space-y-2">
                <img src={imagePreview} alt="Chart preview" className="rounded-md max-h-48 w-full object-contain bg-gray-900" />
                <button type="button" onClick={handleAnalyzeChart} disabled={isAnalyzing} className="w-full flex justify-center items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-blue-500 disabled:bg-blue-400">
                  {isAnalyzing ? <><Spinner size="sm" /> Analyzing Chart...</> : 'Analyze Chart with Gemini'}
                </button>
              </div>
            )}
            {analysis && (
              <div className="p-3 bg-gray-900 rounded-md">
                <h3 className="font-semibold text-blue-300">Chart Analysis:</h3>
                <p className="text-sm text-gray-300 whitespace-pre-wrap">{analysis}</p>
              </div>
            )}
            
            {tradeToEdit && tradeToEdit.status === 'closed' && (
                <div className="pt-4 mt-4 border-t border-gray-700 space-y-4">
                    <button type="button" onClick={handleGetFeedback} disabled={isGettingFeedback} className="w-full flex justify-center items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-purple-600 hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-purple-500 disabled:bg-purple-400">
                        {isGettingFeedback ? <><Spinner size="sm" /> Getting Feedback...</> : 'Get AI Feedback on this Trade'}
                    </button>
                    {feedback && (
                        <div className="p-3 bg-gray-900 rounded-md">
                            <h3 className="font-semibold text-purple-300">Trade Feedback:</h3>
                            <p className="text-sm text-gray-300 whitespace-pre-wrap">{feedback}</p>
                        </div>
                    )}
                </div>
            )}
          </div>
          
          <div className="lg:col-span-3 flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md text-gray-300 bg-gray-600 hover:bg-gray-500">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">{saveButtonText}</button>
          </div>
        </form>
      </div>
    </div>
  );
};