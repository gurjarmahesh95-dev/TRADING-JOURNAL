
import React, { useState, useEffect, useMemo } from 'react';
import type { Trade } from '../types';
import { Icon } from './Icon';

interface ExitTradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (trade: Trade) => void;
  openTrades: Trade[];
}

export const ExitTradeModal: React.FC<ExitTradeModalProps> = ({ isOpen, onClose, onSave, openTrades }) => {
  const [selectedTradeId, setSelectedTradeId] = useState<string>('');
  const [exitDate, setExitDate] = useState('');
  const [exitPrice, setExitPrice] = useState(0);
  const [notes, setNotes] = useState('');

  const selectedTrade = useMemo(() => {
    return openTrades.find(t => t.id === selectedTradeId);
  }, [selectedTradeId, openTrades]);
  
  const pnlPreview = useMemo(() => {
    if (!selectedTrade || !exitPrice || exitPrice <= 0) return null;
    const pnl = (exitPrice - selectedTrade.entryPrice) * selectedTrade.shares;
    return {
        value: pnl,
        isWin: pnl > 0
    };
  }, [selectedTrade, exitPrice]);

  useEffect(() => {
    if (isOpen) {
      // Pre-select the first open trade if available
      const firstOpenTradeId = openTrades.length > 0 ? openTrades[0].id : '';
      setSelectedTradeId(firstOpenTradeId);
      setExitDate(new Date().toISOString().split('T')[0]);
      setExitPrice(0);
      setNotes('');
    }
  }, [isOpen, openTrades]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTrade || !exitDate || !exitPrice || exitPrice <= 0) {
      alert("Please select a trade and fill in all exit details.");
      return;
    }

    const pnl = (exitPrice - selectedTrade.entryPrice) * selectedTrade.shares;
    const updatedTrade: Trade = {
      ...selectedTrade,
      status: 'closed',
      exitDate,
      exitPrice,
      pnl,
      isWin: pnl > 0,
      notes: selectedTrade.notes ? `${selectedTrade.notes}\n\nExit Notes: ${notes}` : `Exit Notes: ${notes}`,
    };
    
    onSave(updatedTrade);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <Icon type="close" className="h-6 w-6" />
        </button>
        <h2 className="text-2xl font-bold mb-6 text-white">Exit Trade</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="trade-select" className="block text-sm font-medium text-gray-300">Select Open Position</label>
            <select 
              id="trade-select"
              value={selectedTradeId}
              onChange={(e) => setSelectedTradeId(e.target.value)}
              className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white"
            >
              <option value="" disabled>-- Select a trade to close --</option>
              {openTrades.map(trade => (
                <option key={trade.id} value={trade.id}>
                  {trade.ticker} (Entered {trade.entryDate} at ${trade.entryPrice.toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          {selectedTrade && (
            <div className="p-3 bg-gray-900 rounded-md grid grid-cols-3 gap-4 text-sm">
                <div><span className="text-gray-400">Ticker:</span> <span className="font-bold">{selectedTrade.ticker}</span></div>
                <div><span className="text-gray-400">Entry:</span> <span className="font-bold">${selectedTrade.entryPrice.toFixed(2)}</span></div>
                <div><span className="text-gray-400">Shares:</span> <span className="font-bold">{selectedTrade.shares}</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="exitDate" className="block text-sm font-medium text-gray-300">Exit Date</label>
              <input type="date" name="exitDate" value={exitDate} onChange={(e) => setExitDate(e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" required />
            </div>
            <div>
              <label htmlFor="exitPrice" className="block text-sm font-medium text-gray-300">Exit Price</label>
              <input type="number" step="0.01" name="exitPrice" value={exitPrice} onChange={(e) => setExitPrice(parseFloat(e.target.value) || 0)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" required />
            </div>
          </div>
          
          {pnlPreview && (
            <div className="p-2 bg-gray-900 rounded-md text-center">
                <span className="text-sm text-gray-400">Estimated P/L: </span>
                <span className={`font-bold ${pnlPreview.isWin ? 'text-green-400' : 'text-red-400'}`}>
                    ${pnlPreview.value.toFixed(2)}
                </span>
            </div>
          )}

          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-300">Exit Notes (Optional)</label>
            <textarea name="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white"></textarea>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md text-gray-300 bg-gray-600 hover:bg-gray-500">Cancel</button>
            <button type="submit" disabled={!selectedTradeId} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Close Position
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
