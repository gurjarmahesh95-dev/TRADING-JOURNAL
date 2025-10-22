import type { Trade } from '../types';

const BROKER_CREDS_KEY = 'broker_api_credentials';

export interface BrokerCredentials {
  apiKey: string;
  apiSecret: string;
}

export const saveBrokerCredentials = (creds: BrokerCredentials): void => {
  localStorage.setItem(BROKER_CREDS_KEY, JSON.stringify(creds));
};

export const loadBrokerCredentials = (): BrokerCredentials | null => {
  const stored = localStorage.getItem(BROKER_CREDS_KEY);
  return stored ? JSON.parse(stored) : null;
};

export const clearBrokerCredentials = (): void => {
  localStorage.removeItem(BROKER_CREDS_KEY);
};

// This is a mock function to simulate fetching trades from a broker like Alpaca.
// In a real application, this would make an authenticated API request.
export const fetchTradesFromBroker = async (creds: BrokerCredentials): Promise<Trade[]> => {
  console.log("Simulating fetch from broker with API key:", creds.apiKey);
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Return some sample trades. A real implementation would parse the broker's response.
  const sampleTrades: Omit<Trade, 'id' | 'pnl' | 'isWin'>[] = [
    {
      ticker: 'AAPL',
      entryDate: '2023-10-01',
      entryPrice: 170.50,
      exitDate: '2023-10-15',
      exitPrice: 178.20,
      shares: 50,
      strategy: 'Breakout',
      notes: 'Imported from broker: Breakout above previous high.',
      // Fix: Add the required 'status' property for closed trades.
      status: 'closed',
    },
    {
      ticker: 'GOOGL',
      entryDate: '2023-10-05',
      entryPrice: 135.10,
      exitDate: '2023-10-20',
      exitPrice: 133.90,
      shares: 30,
      strategy: 'Mean Reversion',
      notes: 'Imported from broker: Failed trade, stopped out.',
      // Fix: Add the required 'status' property for closed trades.
      status: 'closed',
    }
  ];

  return sampleTrades.map((trade, index) => {
    const pnl = (trade.exitPrice! - trade.entryPrice) * trade.shares;
    return {
      ...trade,
      id: `broker-${new Date().getTime()}-${index}`,
      pnl,
      isWin: pnl > 0,
    };
  });
};