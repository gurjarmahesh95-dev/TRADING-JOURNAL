
import { GoogleGenAI, GenerateContentResponse, GroundingChunk, Type } from "@google/genai";
import type { ChatMessage, FeatureIdea, Trade, NewsAlert, WatchlistScanResult, TickerSuggestion } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const fileToGenerativePart = (base64: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64,
      mimeType
    },
  };
};

export const analyzeChartImage = async (imageBase64: string, prompt: string): Promise<string> => {
  try {
    const imagePart = fileToGenerativePart(imageBase64, 'image/png');
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: { parts: [imagePart, { text: prompt }] },
    });
    return response.text;
  } catch (error) {
    console.error("Error analyzing chart image:", error);
    return "Sorry, I couldn't analyze the image. Please try again.";
  }
};

export const getMarketChatResponse = async (history: ChatMessage[], message: string): Promise<{ text: string, citations?: { uri: string, title: string }[] }> => {
    try {
        const chatHistory = history.map(msg => ({
            role: msg.role,
            parts: [{ text: msg.text }]
        }));

        const response: GenerateContentResponse = await ai.models.generateContent({
            model: "gemini-flash-lite-latest",
            contents: [...chatHistory, { role: 'user', parts: [{ text: message }] }],
            config: {
                tools: [{ googleSearch: {} }],
            },
        });

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        let citations: { uri: string, title: string }[] = [];
        if (groundingChunks) {
            citations = groundingChunks
                .filter((chunk: GroundingChunk): chunk is GroundingChunk & { web: { uri: string; title: string; } } => 'web' in chunk && !!chunk.web?.uri)
                .map((chunk: GroundingChunk & { web: { uri: string; title: string; } }) => ({
                    uri: chunk.web.uri,
                    title: chunk.web.title || chunk.web.uri,
                }));
        }

        return { text: response.text, citations };
    } catch (error) {
        console.error("Error getting market chat response:", error);
        return { text: "Sorry, I encountered an error. Please try again." };
    }
};

export const getDeepStrategyAnalysis = async (strategy: string): Promise<string> => {
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro",
            contents: `Please provide a deep, comprehensive analysis of the following swing trading strategy. Cover potential strengths, weaknesses, risk management considerations, market conditions where it might excel or fail, and suggestions for improvement or backtesting. Strategy: ${strategy}`,
            config: {
                thinkingConfig: { thinkingBudget: 32768 }
            }
        });
        return response.text;
    } catch (error) {
        console.error("Error getting deep strategy analysis:", error);
        return "Sorry, I couldn't analyze the strategy. Please try again.";
    }
};

export const getTradeFeedback = async (trade: Trade): Promise<string> => {
    const prompt = `
        Analyze this swing trade and provide constructive feedback.
        - Ticker: ${trade.ticker}
        - Entry Date: ${trade.entryDate} at $${trade.entryPrice}
        - Exit Date: ${trade.exitDate} at $${trade.exitPrice}
        - Result: ${trade.isWin ? 'Win' : 'Loss'} of $${trade.pnl!.toFixed(2)}
        - Strategy: ${trade.strategy}
        - My Mindset: ${trade.mindset || 'Not specified'}
        - Notes: ${trade.notes}
        What did I do well? What could be improved? Focus on the psychological and tactical aspects based on my notes and mindset.
    `;
    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error getting trade feedback:", error);
        return "Sorry, I couldn't provide feedback on the trade. Please try again.";
    }
}

export const getFeatureIdeation = async (): Promise<FeatureIdea[]> => {
    const prompt = `
        You are an expert product manager specializing in AI-powered FinTech applications.

        Based on the latest AI capabilities and trends in retail trading, generate 3 innovative feature ideas for an advanced swing trading journal application. The application already has the following features:
        - Trade logging with chart screenshot analysis (image understanding).
        - An AI market chat with Google Search grounding for real-time news and data.
        - Deep strategy analysis using a powerful reasoning model.
        - P/L performance charts.
        - Data import/export via CSV and Google Sheets.

        For each idea, provide:
        1. A short, catchy title.
        2. A detailed description of the feature and the user benefit.
        3. The recommended Gemini model for the task (e.g., 'gemini-2.5-pro' for complexity, 'gemini-2.5-flash' for speed, 'gemini-2.5-flash-image' for image tasks).

        Return the response as a JSON array of objects.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });
        
        const jsonTextMatch = response.text.match(/\[[\s\S]*\]/);
        if (!jsonTextMatch) {
            throw new Error("No JSON array found in the response.");
        }
        const ideas = JSON.parse(jsonTextMatch[0]);
        return ideas;

    } catch (error) {
        console.error("Error getting feature ideas:", error);
        throw new Error("Sorry, I couldn't generate feature ideas. Please try again.");
    }
}

export const fetchNewsForTickers = async (tickers: string[]): Promise<NewsAlert[]> => {
    const prompt = `
        For each of the following stock tickers, find the single most significant and recent (last 24-48 hours) news headline and its source URL.
        Tickers: ${tickers.join(', ')}.
        If no significant news is found for a ticker, omit it from the result.
        Return the response ONLY as a JSON array of objects. Each object must have "ticker", "headline", and "uri" keys.
    `;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });
        const jsonTextMatch = response.text.match(/\[[\s\S]*\]/);
        if (!jsonTextMatch) {
            console.warn("No JSON array found in news fetch response.");
            return [];
        }
        const alerts: Omit<NewsAlert, 'timestamp'>[] = JSON.parse(jsonTextMatch[0]);
        return alerts.map(alert => ({ ...alert, timestamp: Date.now() }));
    } catch (error) {
        console.error("Error fetching news for tickers:", error);
        return [];
    }
};

export const scanWatchlistTickers = async (tickers: string[]): Promise<WatchlistScanResult[]> => {
    const prompt = `
      Act as a swing trading analyst. For each ticker provided, use Google Search to find:
      1.  Any significant, recent news that could act as a catalyst.
      2.  Potential technical analysis patterns (e.g., "bull flag forming on daily", "approaching 50-day moving average support", "breakout above resistance at $123").
      
      Keep the analysis for each ticker concise and actionable.
      
      Tickers: ${tickers.join(', ')}
      
      Return the response ONLY as a JSON array of objects. Each object must have "ticker" and "analysis" keys.
    `;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });
        const jsonTextMatch = response.text.match(/\[[\s\S]*\]/);
        if (!jsonTextMatch) {
            throw new Error("No JSON array found in the watchlist scan response.");
        }
        return JSON.parse(jsonTextMatch[0]);
    } catch (error) {
        console.error("Error scanning watchlist tickers:", error);
        throw new Error("Failed to scan watchlist. Please try again.");
    }
};

export const getCurrentPrice = async (ticker: string): Promise<number | null> => {
    const prompt = `What is the current stock price of ${ticker}? Return only the number.`;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        const priceText = response.text.replace(/[^0-9.]/g, '');
        const price = parseFloat(priceText);
        return isNaN(price) ? null : price;
    } catch (error) {
        console.error(`Error fetching price for ${ticker}:`, error);
        return null;
    }
};

export const getLivePrices = async (tickers: string[]): Promise<Record<string, number | null>> => {
    if (tickers.length === 0) return {};
    const prompt = `
        For the following stock tickers: ${tickers.join(', ')}.
        Provide their current market prices.
        Return the response ONLY as a JSON object where keys are the ticker symbols and values are the numerical prices.
        If you cannot find a price for a ticker, set its value to null.
        Example: {"AAPL": 175.50, "GOOGL": 140.25, "INVALIDTICKER": null}
    `;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        const jsonTextMatch = response.text.match(/{[\s\S]*}/);
        if (!jsonTextMatch) {
            console.warn("No JSON object found in live prices response.");
            return {};
        }
        return JSON.parse(jsonTextMatch[0]);
    } catch (error) {
        console.error(`Error fetching live prices for tickers:`, error);
        // On error, return an object with null for all requested tickers
        return tickers.reduce((acc, ticker) => {
            acc[ticker] = null;
            return acc;
        }, {} as Record<string, number | null>);
    }
};

export const getPreTradeAnalysis = async (tradePlan: Partial<Trade>): Promise<string> => {
    const prompt = `
        Provide a brief "sanity check" analysis for this upcoming swing trade plan.
        - Ticker: ${tradePlan.ticker}
        - Planned Entry: $${tradePlan.entryPrice}
        - Stop Loss: $${tradePlan.stopLoss}
        - Profit Target: $${tradePlan.takeProfit}
        - My Mindset: ${tradePlan.mindset || 'Not specified'}
        - Strategy: ${tradePlan.strategy}

        Using Google Search, check for potential red flags. Specifically look for:
        1.  Any major company news (earnings, announcements) in the next 1-2 weeks.
        2.  Obvious major technical conflicts (e.g., trading directly into a major resistance/support level).
        3.  High levels of recent volatility or unusual market sentiment.

        Keep the analysis concise and to the point.
    `;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: { tools: [{ googleSearch: {} }] }
        });
        return response.text;
    } catch (error) {
        console.error("Error getting pre-trade analysis:", error);
        return "Sorry, I couldn't provide a pre-trade analysis at this time.";
    }
};

export const searchTickerSymbols = async (query: string): Promise<TickerSuggestion[]> => {
    const prompt = `
        Find stock ticker symbols for companies matching the query: "${query}".
        Provide up to 5 relevant results.
        For each result, give the company name and its primary stock ticker symbol.

        Return the response ONLY as a JSON array of objects. Each object must have "name" and "ticker" keys.
        Example: [{"name": "Apple Inc.", "ticker": "AAPL"}, {"name": "Amazon.com, Inc.", "ticker": "AMZN"}]
    `;
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }],
            }
        });
        const jsonTextMatch = response.text.match(/\[[\s\S]*\]/);
        if (!jsonTextMatch) {
            console.warn(`No JSON array found in ticker search response for "${query}". Response text:`, response.text);
            return [];
        }
        return JSON.parse(jsonTextMatch[0]);
    } catch (error) {
        console.error(`Error searching tickers for "${query}":`, error);
        return []; // Return empty array on failure
    }
};
