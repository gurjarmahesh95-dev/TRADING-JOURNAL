
import React, { useState, useEffect } from 'react';
import type { ChatMessage, UserProfile, FeatureIdea, Trade, NewsAlert } from '../types';
import { getMarketChatResponse, getDeepStrategyAnalysis, getFeatureIdeation, fetchNewsForTickers } from '../services/geminiService';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

interface AssistantViewProps {
  userProfile: UserProfile;
  trades: Trade[];
}

export const AssistantView: React.FC<AssistantViewProps> = ({ userProfile, trades }) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'strategy' | 'ideation'>('chat');
  const [newsAlerts, setNewsAlerts] = useState<NewsAlert[]>([]);
  const [isFetchingNews, setIsFetchingNews] = useState(true);
  const [isNewsDismissed, setIsNewsDismissed] = useState(false);

  useEffect(() => {
    const fetchNews = async () => {
      const uniqueTickers = [...new Set(trades.map(t => t.ticker.toUpperCase()).filter(t => t))];
      if (uniqueTickers.length === 0) {
        setIsFetchingNews(false);
        return;
      }
      try {
        const alerts = await fetchNewsForTickers(uniqueTickers);
        setNewsAlerts(alerts);
      } catch (error) {
        console.error("Failed to fetch news alerts:", error);
      } finally {
        setIsFetchingNews(false);
      }
    };
    fetchNews();
  }, []);


  return (
    <div className="p-4 sm:p-6 lg:p-8 h-full flex flex-col">
       {!isNewsDismissed && (isFetchingNews || newsAlerts.length > 0) && (
        <NewsAlertsPanel
          alerts={newsAlerts}
          isLoading={isFetchingNews}
          onDismiss={() => setIsNewsDismissed(true)}
        />
      )}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white">AI Assistant</h1>
        <p className="text-lg text-gray-400 mt-1">Your partner in trading research and strategy.</p>
      </div>
      
      <div className="border-b border-gray-700">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('chat')}
            className={`whitespace-nowrap flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'chat' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}`}
          >
            <Icon type="chat" />
            Market Chat
          </button>
          <button
            onClick={() => setActiveTab('strategy')}
            className={`whitespace-nowrap flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'strategy' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}`}
          >
            <Icon type="brain" />
            Deep Strategy Analysis
          </button>
          <button
            onClick={() => setActiveTab('ideation')}
            className={`whitespace-nowrap flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm ${activeTab === 'ideation' ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}`}
          >
            <Icon type="lightbulb" />
            Feature Ideation
          </button>
        </nav>
      </div>

      <div className="flex-grow mt-6">
        {activeTab === 'chat' && <MarketChat userProfile={userProfile} />}
        {activeTab === 'strategy' && <StrategyAnalysis />}
        {activeTab === 'ideation' && <FeatureIdeation />}
      </div>
    </div>
  );
};

interface MarketChatProps {
    userProfile: UserProfile;
}

const MarketChat: React.FC<MarketChatProps> = ({ userProfile }) => {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = { role: 'user', text: input };
    setHistory(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const response = await getMarketChatResponse(history, input);
    const modelMessage: ChatMessage = { role: 'model', text: response.text, citations: response.citations };
    setHistory(prev => [...prev, modelMessage]);
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-gray-800 rounded-lg">
      <div className="flex-grow p-4 overflow-y-auto">
        <div className="space-y-4">
          {history.map((msg, index) => (
            <div key={index} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
               {msg.role === 'user' && (
                  <div className="text-xs text-gray-400 mb-1 mr-2">{userProfile.username}</div>
                )}
               <div className={`flex items-start gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                 <div className={`flex items-center justify-center h-10 w-10 rounded-full ${msg.role === 'user' ? 'bg-blue-600' : 'bg-gray-600'} text-sm`}>
                    {msg.role === 'user' ? userProfile.avatar : <Icon type="brain" className="h-6 w-6" />}
                 </div>
                 <div className={`p-3 rounded-lg max-w-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3 border-t border-gray-600 pt-2">
                        <h4 className="text-xs font-semibold text-gray-400 mb-1 flex items-center gap-1.5">
                           <Icon type="link" className="h-3 w-3" />
                           Relevant News & Sources:
                        </h4>
                        <ul className="text-xs space-y-1 pl-2">
                          {msg.citations.map((citation, i) => (
                            <li key={i} className="flex items-start">
                               <span className="mr-1.5 text-gray-500">{i + 1}.</span>
                               <a href={citation.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">
                                {citation.title}
                               </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                 </div>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="p-3 rounded-lg bg-gray-700">
                <Spinner size="sm" />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="p-4 border-t border-gray-700 flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && !isLoading && handleSend()}
          placeholder="Ask about market news, tickers, or economic events..."
          className="flex-grow bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white"
          disabled={isLoading}
        />
        <button onClick={handleSend} disabled={isLoading} className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 disabled:bg-blue-400">
          <Icon type="search" />
        </button>
      </div>
    </div>
  );
};

const StrategyAnalysis: React.FC = () => {
    const [strategy, setStrategy] = useState('');
    const [analysis, setAnalysis] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleAnalyze = async () => {
        if (!strategy.trim()) return;
        setIsLoading(true);
        setAnalysis('');
        const result = await getDeepStrategyAnalysis(strategy);
        setAnalysis(result);
        setIsLoading(false);
    };

    return (
        <div className="p-6 bg-gray-800 rounded-lg h-full flex flex-col">
            <h3 className="text-xl font-semibold text-white">Deep Strategy Analysis with Gemini Pro</h3>
            <p className="text-gray-400 mt-1">Leverage Gemini's advanced reasoning to refine your trading approach. This may take a moment.</p>
            <textarea
                value={strategy}
                onChange={e => setStrategy(e.target.value)}
                rows={8}
                placeholder="Describe your trading strategy in detail. Include entry criteria, exit rules, risk management, and indicators used."
                className="mt-4 w-full bg-gray-900 border-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white p-3"
            />
            <button onClick={handleAnalyze} disabled={isLoading} className="mt-4 w-full flex justify-center items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:bg-indigo-400">
                {isLoading ? <><Spinner size="sm" /> Analyzing with Thinking Mode...</> : 'Analyze My Strategy'}
            </button>
            {analysis && (
                <div className="mt-6 p-4 bg-gray-900 rounded-md flex-grow overflow-y-auto">
                    <h4 className="text-lg font-semibold text-blue-300">Analysis Result:</h4>
                    <p className="text-gray-300 mt-2 whitespace-pre-wrap">{analysis}</p>
                </div>
            )}
        </div>
    );
};

const FeatureIdeation: React.FC = () => {
    const [ideas, setIdeas] = useState<FeatureIdea[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const handleGenerate = async () => {
        setIsLoading(true);
        setError('');
        setIdeas([]);
        try {
            const result = await getFeatureIdeation();
            setIdeas(result);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-6 bg-gray-800 rounded-lg h-full flex flex-col">
            <h3 className="text-xl font-semibold text-white">AI Feature Ideation</h3>
            <p className="text-gray-400 mt-1">Let Gemini brainstorm new AI-powered features for your journal, using the latest trends from Google Search.</p>
            <div className="text-center mt-6">
                <button onClick={handleGenerate} disabled={isLoading} className="w-full max-w-sm flex justify-center items-center gap-2 px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-indigo-500 disabled:bg-indigo-400">
                    {isLoading ? <><Spinner size="sm" /> Generating Ideas...</> : 'Generate Feature Ideas'}
                </button>
            </div>
            
            {error && (
                <div className="mt-6 p-4 bg-red-900/30 border border-red-700 text-red-300 rounded-md">
                    <p>{error}</p>
                </div>
            )}
            
            {ideas.length > 0 && (
                <div className="mt-6 flex-grow overflow-y-auto space-y-4">
                     <h4 className="text-lg font-semibold text-blue-300">Generated Ideas:</h4>
                    {ideas.map((idea, index) => (
                        <div key={index} className="p-4 bg-gray-900 rounded-md">
                            <h5 className="font-bold text-white">{idea.title}</h5>
                            <p className="text-sm text-gray-300 mt-2">{idea.description}</p>
                            <p className="text-xs text-gray-500 mt-3">
                                <span className="font-semibold">Recommended Model:</span>
                                <code className="ml-2 bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{idea.modelToUse}</code>
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const NewsAlertsPanel: React.FC<{alerts: NewsAlert[], isLoading: boolean, onDismiss: () => void}> = ({ alerts, isLoading, onDismiss }) => {
    return (
        <div className="mb-6 bg-gray-800/50 border border-gray-700/60 rounded-lg p-4 relative">
            <button onClick={onDismiss} className="absolute top-2 right-2 text-gray-500 hover:text-white">
                <Icon type="close" className="h-5 w-5" />
            </button>
            <h3 className="text-lg font-semibold text-white flex items-center gap-2 mb-2">
                <Icon type="bell" className="text-yellow-400" />
                News Alerts for Your Positions
            </h3>
            {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-gray-400">
                    <Spinner size="sm" />
                    <span>Fetching latest news...</span>
                </div>
            ) : alerts.length === 0 ? (
                <p className="text-sm text-gray-400">No significant recent news found for your tickers.</p>
            ) : (
                <ul className="space-y-2 max-h-40 overflow-y-auto pr-4">
                    {alerts.map((alert, index) => (
                        <li key={index} className="text-sm border-b border-gray-700/50 pb-2 last:border-b-0">
                            <a href={alert.uri} target="_blank" rel="noopener noreferrer" className="group">
                                <span className="font-bold text-blue-400">{alert.ticker}:</span>
                                <span className="ml-2 text-gray-300 group-hover:underline">{alert.headline}</span>
                            </a>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
