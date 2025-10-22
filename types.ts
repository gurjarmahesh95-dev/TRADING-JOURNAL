
export interface Trade {
  id: string;
  ticker: string;
  entryDate: string;
  entryPrice: number;
  shares: number;
  strategy: string;
  notes: string;
  status: 'open' | 'closed';
  mindset?: 'Disciplined' | 'FOMO' | 'Anxious' | 'Confident' | 'Neutral';
  stopLoss?: number;
  takeProfit?: number;
  exitDate?: string;
  exitPrice?: number;
  chartImage?: {
    base64: string;
    analysis?: string;
  };
  pnl?: number;
  isWin?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  citations?: { uri: string, title: string }[];
}

export interface UserProfile {
  username: string;
  avatar: string;
}

export interface FeatureIdea {
    title: string;
    description: string;
    modelToUse: string;
}

export interface NewsAlert {
  ticker: string;
  headline: string;
  uri: string;
  timestamp: number;
}

export interface WatchlistItem {
    id: string;
    ticker: string;
}

export interface WatchlistScanResult {
    ticker: string;
    analysis: string;
}

export interface TickerSuggestion {
    name: string;
    ticker: string;
}