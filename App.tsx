
import React, { useState, useEffect } from 'react';
import { JournalView } from './components/JournalView';
import { AssistantView } from './components/AssistantView';
import { SettingsView } from './components/SettingsView';
import { WatchlistView } from './components/WatchlistView';
import { TradeModal } from './components/TradeModal';
import { ExitTradeModal } from './components/ExitTradeModal';
import { ProfileModal } from './components/ProfileModal';
import type { Trade, UserProfile } from './types';
import { Icon } from './components/Icon';
import { initGoogleClient, isGoogleApiConfigured, fetchTradesFromSheet } from './services/googleSheetsService';
import { fetchTradesFromBroker, loadBrokerCredentials } from './services/brokerService';

type View = 'journal' | 'assistant' | 'watchlist' | 'settings';

const DEFAULT_PROFILE: UserProfile = { username: 'Trader', avatar: '👤' };

export default function App() {
  const [currentView, setCurrentView] = useState<View>('journal');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [tradeToEdit, setTradeToEdit] = useState<Trade | null>(null);
  
  const [isGoogleReady, setIsGoogleReady] = useState(false);
  const [isGoogleSignedIn, setIsGoogleSignedIn] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    const savedTrades = localStorage.getItem('swing-trades');
    if (savedTrades) {
      setTrades(JSON.parse(savedTrades));
    }

    const savedProfile = localStorage.getItem('user-profile');
    if (savedProfile) {
        setUserProfile(JSON.parse(savedProfile));
    }

    if (isGoogleApiConfigured) {
      initGoogleClient(setIsGoogleSignedIn)
        .then(() => setIsGoogleReady(true))
        .catch(err => {
          console.error("Could not initialize Google API Client. See the detailed checklist in the error message from 'googleSheetsService.ts' above for debugging steps.", err);
          setIsGoogleReady(false);
        });
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('swing-trades', JSON.stringify(trades));
  }, [trades]);

  const handleOpenModal = () => {
    setTradeToEdit(null);
    setIsModalOpen(true);
  };
  
  const handleEditTrade = (trade: Trade) => {
    setTradeToEdit(trade);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setTradeToEdit(null);
  };

  const handleOpenExitModal = () => setIsExitModalOpen(true);
  const handleCloseExitModal = () => setIsExitModalOpen(false);


  const handleSaveTrade = (trade: Trade) => {
    setTrades(prevTrades => {
      const index = prevTrades.findIndex(t => t.id === trade.id);
      if (index > -1) {
        const newTrades = [...prevTrades];
        newTrades[index] = trade;
        return newTrades;
      }
      return [trade, ...prevTrades];
    });
  };

  const handleDeleteTrade = (tradeId: string) => {
    if(window.confirm('Are you sure you want to delete this trade?')){
      setTrades(prev => prev.filter(t => t.id !== tradeId));
    }
  };

  const handleSaveProfile = (profile: UserProfile) => {
    setUserProfile(profile);
    localStorage.setItem('user-profile', JSON.stringify(profile));
    setIsProfileModalOpen(false);
  };

  const handleImportFromBroker = async () => {
    const creds = loadBrokerCredentials();
    if (!creds || !creds.apiKey || !creds.apiSecret) {
        alert("Please set your broker API credentials in the Settings page first.");
        setCurrentView('settings');
        return;
    }

    if (!window.confirm("This will replace all current trades with data from your broker. Are you sure?")) return;

    setIsImporting(true);
    try {
        const importedTrades = await fetchTradesFromBroker(creds);
        setTrades(importedTrades);
        alert(`Successfully imported ${importedTrades.length} trades.`);
    } catch (error) {
        console.error("Failed to import from broker:", error);
        alert(`Failed to import from broker. Check credentials or console for details. Error: ${(error as Error).message}`);
    } finally {
        setIsImporting(false);
    }
  };

  const handleImportFromSheets = async () => {
    if (!window.confirm("This will replace all current trades with data from your Google Sheet. Are you sure?")) return;
    
    setIsImporting(true);
    try {
        const importedTrades = await fetchTradesFromSheet();
        setTrades(importedTrades);
        alert(`Successfully imported ${importedTrades.length} trades from Google Sheets.`);
    } catch (error) {
        console.error("Failed to import from Google Sheets:", error);
        alert(`Failed to import from Google Sheets. Ensure you have synced to a sheet first. Error: ${(error as Error).message}`);
    } finally {
        setIsImporting(false);
    }
  };

  const NavItem: React.FC<{ view: View, icon: 'chart' | 'brain' | 'settings' | 'binoculars', label: string }> = ({ view, icon, label }) => (
    <button
      onClick={() => setCurrentView(view)}
      className={`flex flex-col items-center justify-center space-y-1 w-full py-3 text-xs font-medium transition-colors rounded-lg ${
        currentView === view
          ? 'bg-blue-600 text-white'
          : 'text-gray-400 hover:bg-gray-700 hover:text-white'
      }`}
    >
      <Icon type={icon} className="h-6 w-6" />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <nav className="w-24 bg-gray-800 p-3 flex flex-col items-center shadow-lg">
        <div className="p-2 bg-gray-900 rounded-lg mb-4">
            <Icon type="brain" className="h-8 w-8 text-blue-400" />
        </div>
        <div className="flex flex-col space-y-4 w-full flex-grow">
            <NavItem view="journal" icon="chart" label="Journal" />
            <NavItem view="assistant" icon="brain" label="AI Assistant" />
            <NavItem view="watchlist" icon="binoculars" label="Watchlist" />
            <NavItem view="settings" icon="settings" label="Settings" />
        </div>
        <div className="mt-auto">
            <button 
              onClick={() => setIsProfileModalOpen(true)}
              className="flex items-center justify-center h-14 w-14 bg-gray-700 rounded-full text-2xl hover:bg-gray-600 transition-colors"
              title="Edit Profile"
            >
              {userProfile.avatar}
            </button>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto">
        {currentView === 'journal' && 
          <JournalView 
            trades={trades} 
            onAddTrade={handleOpenModal} 
            onEditTrade={handleEditTrade} 
            onDeleteTrade={handleDeleteTrade}
            onOpenExitModal={handleOpenExitModal}
            isGoogleReady={isGoogleReady}
            isGoogleSignedIn={isGoogleSignedIn}
            onImportFromBroker={handleImportFromBroker}
            onImportFromSheets={handleImportFromSheets}
            isImporting={isImporting}
          />
        }
        {currentView === 'assistant' && <AssistantView userProfile={userProfile} trades={trades} />}
        {currentView === 'watchlist' && <WatchlistView />}
        {currentView === 'settings' && <SettingsView />}
      </main>

      <TradeModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveTrade}
        tradeToEdit={tradeToEdit}
      />
      <ExitTradeModal
        isOpen={isExitModalOpen}
        onClose={handleCloseExitModal}
        onSave={handleSaveTrade}
        openTrades={trades.filter(t => t.status === 'open')}
      />
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onSave={handleSaveProfile}
        currentUserProfile={userProfile}
      />
    </div>
  );
}
