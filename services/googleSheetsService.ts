import type { Trade } from '../types';

// Fix: Add type definition for gapi on the window object to inform TypeScript about the global variable from the GAPI script.
declare global {
  interface Window {
    gapi: any;
  }
}

// IMPORTANT: User must provide their own Google Cloud credentials.
// 1. Go to https://console.cloud.google.com/ and create a new project.
// 2. In "APIs & Services" > "Library", search for "Google Sheets API" and enable it.
// 3. Go to "APIs & Services" > "Credentials".
// 4. Create an "API key" and paste it below.
// 5. Create an "OAuth 2.0 Client ID" for a "Web application".
//    - Add your development URL (e.g., http://localhost:5173) to "Authorized JavaScript origins".
//    - Paste the "Client ID" below.
// Fix: Added explicit string type to prevent literal type inference which causes a comparison error.
const API_KEY: string = 'AIzaSyDB1ry2WD1SEbz4id6EOYjvqRXbw8N2U_g'; // User's API Key
// Fix: Explicitly type CLIENT_ID as a string to prevent a literal type comparison error.
const CLIENT_ID: string = '77418031959-8q6v8s8gisqrbpl3cts1u30p9eijsrm5.apps.googleusercontent.com'; // User's Client ID

const DISCOVERY_DOCS = ["https://sheets.googleapis.com/$discovery/rest?version=v4"];
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const SPREADSHEET_ID_KEY = 'swing_trading_journal_spreadsheet_id';

let gapi: any = null;

export const isGoogleApiConfigured = API_KEY !== 'YOUR_GOOGLE_API_KEY' && CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';

/**
 * Loads the Google API client script and initializes the client.
 * @param onStatusChange Callback function to be invoked when the user's sign-in status changes.
 */
export const initGoogleClient = (onStatusChange: (isSignedIn: boolean) => void): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!isGoogleApiConfigured) {
      console.warn("Google API credentials are not configured.");
      return resolve();
    }

    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
      window.gapi.load('client:auth2', async () => {
        try {
          await window.gapi.client.init({
            apiKey: API_KEY,
            clientId: CLIENT_ID,
            discoveryDocs: DISCOVERY_DOCS,
            scope: SCOPES,
          });
          gapi = window.gapi;
          gapi.auth2.getAuthInstance().isSignedIn.listen(onStatusChange);
          onStatusChange(gapi.auth2.getAuthInstance().isSignedIn.get());
          resolve();
        } catch (error: any) {
          console.error(`
-------------------------------------------------------------------
--- GOOGLE CLIENT INITIALIZATION FAILED ---
This is likely a configuration issue in your Google Cloud project.
Please check the following:

1.  Is the API Key in 'googleSheetsService.ts' correct?
    - It should start with 'AIzaSy...'.

2.  Is the Client ID in 'googleSheetsService.ts' correct?
    - It should end with '.apps.googleusercontent.com'.

3.  Have you enabled the "Google Sheets API" in your project library?
    - Search for it here: https://console.cloud.google.com/apis/library

4.  Is your application's URL added to "Authorized JavaScript origins"?
    - Go to APIs & Services > Credentials > Your OAuth Client ID.
    - The URL MUST match your browser's address bar exactly (e.g., http://localhost:5173).

Original Error Details:
-------------------------------------------------------------------
`);
          if (error && error.result && error.result.error) {
            console.error("Error Code:", error.result.error.code);
            console.error("Error Message:", error.result.error.message);
            console.error("Error Status:", error.result.error.status);
            console.error("Full Error Object:", error.result.error);
          } else {
            console.error("Full Error Object:", error);
          }
          reject(error);
        }
      });
    };
    script.onerror = (error) => {
        console.error("Failed to load GAPI script", error);
        reject(error);
    };
    document.body.appendChild(script);
  });
};

/**
 * Initiates the Google Sign-In flow.
 */
export const signIn = () => {
  if (gapi) {
    gapi.auth2.getAuthInstance().signIn();
  }
};

/**
 * Signs the user out of their Google Account.
 */
export const signOut = () => {
  if (gapi) {
    gapi.auth2.getAuthInstance().signOut();
  }
};

/**
 * Retrieves the stored spreadsheet ID or creates a new spreadsheet if one doesn't exist.
 * @returns {Promise<string>} The ID of the spreadsheet.
 */
const getOrCreateSpreadsheet = async (): Promise<string> => {
    let spreadsheetId = localStorage.getItem(SPREADSHEET_ID_KEY);
    if (spreadsheetId) {
        try {
            // Check if we can access the spreadsheet, it might have been deleted
            await gapi.client.sheets.spreadsheets.get({ spreadsheetId });
            return spreadsheetId;
        } catch (error) {
            console.warn("Could not access stored spreadsheet. Creating a new one.");
            localStorage.removeItem(SPREADSHEET_ID_KEY);
        }
    }
    
    const resource = {
        properties: { title: 'Swing Trading Journal' },
        sheets: [
            { properties: { title: 'Trades' } },
            { properties: { title: 'Analysis' } }
        ]
    };
    const response = await gapi.client.sheets.spreadsheets.create({ resource });
    spreadsheetId = response.result.spreadsheetId;
    localStorage.setItem(SPREADSHEET_ID_KEY, spreadsheetId!);
    return spreadsheetId!;
};

/**
 * Uploads the current list of trades from the app to the Google Sheet.
 * This is a destructive operation that overwrites the 'Trades' and 'Analysis' sheets.
 * @param trades The array of trades from the application state.
 * @returns {Promise<string>} The URL of the synced Google Sheet.
 */
export const syncTradesToSheet = async (trades: Trade[]): Promise<string> => {
    if (!gapi || !gapi.auth2.getAuthInstance().isSignedIn.get()) {
        throw new Error("User is not signed in.");
    }

    const spreadsheetId = await getOrCreateSpreadsheet();

    const tradeHeader = ['ID', 'Ticker', 'Entry Date', 'Entry Price', 'Shares', 'Strategy', 'Notes', 'Status', 'Exit Date', 'Exit Price', 'P/L', 'Result'];
    const tradeRows = trades.map(t => [
        t.id, t.ticker, t.entryDate, t.entryPrice, t.shares, t.strategy, t.notes,
        t.status, t.exitDate || '', t.exitPrice || '', t.pnl || '', 
        t.status === 'closed' ? (t.isWin ? 'Win' : 'Loss') : ''
    ]);

    const getColLetter = (index: number) => String.fromCharCode('A'.charCodeAt(0) + index);
    const idCol = getColLetter(tradeHeader.indexOf('ID'));
    const pnlCol = getColLetter(tradeHeader.indexOf('P/L'));
    const resultCol = getColLetter(tradeHeader.indexOf('Result'));
    const statusCol = getColLetter(tradeHeader.indexOf('Status'));
    
    const analysisData = [
        ["Metric", "Value", "Description"],
        ["Total P/L", `=SUM(Trades!${pnlCol}:${pnlCol})`, "Sum of all profits and losses from closed trades."],
        ["Total Closed Trades", `=COUNTIF(Trades!${statusCol}:${statusCol}, "closed")`, "Total number of closed trades."],
        ["Winning Trades", `=COUNTIF(Trades!${resultCol}:${resultCol}, "Win")`, "Number of profitable trades."],
        ["Losing Trades", `=COUNTIF(Trades!${resultCol}:${resultCol}, "Loss")`, "Number of losing trades."],
        ["Win Rate", `=IFERROR(E4/E3, 0)`, "Percentage of winning trades."],
        ["Average P/L per Trade", `=IFERROR(E2/E3, 0)`, "The average outcome of a closed trade."],
        ["Average Win", `=IFERROR(AVERAGEIF(Trades!${resultCol}:${resultCol}, "Win", Trades!${pnlCol}:${pnlCol}), 0)`, "The average profit on winning trades."],
        ["Average Loss", `=IFERROR(AVERAGEIF(Trades!${resultCol}:${resultCol}, "Loss", Trades!${pnlCol}:${pnlCol}), 0)`, "The average loss on losing trades."],
        ["Profit Factor", `=IFERROR(ABS(SUMIF(Trades!${pnlCol}:${pnlCol},\">0\"))/ABS(SUMIF(Trades!${pnlCol}:${pnlCol},\"<0\")), 0)`, "Gross profit divided by gross loss. Higher is better."]
    ];

    await gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
            valueInputOption: 'USER_ENTERED',
            data: [
                {
                    range: 'Trades!A1',
                    values: [tradeHeader, ...tradeRows],
                },
                {
                    range: 'Analysis!A1',
                    values: analysisData,
                }
            ],
        },
    });

    // Clear any old data beyond the current scope
    await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `Trades!A${tradeRows.length + 2}:${resultCol}`,
    });

    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
};

/**
 * Fetches trades from the linked Google Sheet.
 * This function reads the 'Trades' tab, parses each row into a Trade object,
 * and returns an array of valid trades. It gracefully handles and logs errors for malformed rows.
 * @returns {Promise<Trade[]>} An array of trades imported from the sheet.
 */
export const fetchTradesFromSheet = async (): Promise<Trade[]> => {
    if (!gapi || !gapi.auth2.getAuthInstance().isSignedIn.get()) {
        throw new Error("User is not signed in.");
    }

    const spreadsheetId = localStorage.getItem(SPREADSHEET_ID_KEY);
    if (!spreadsheetId) {
        throw new Error("No spreadsheet has been synced yet. Please sync to a sheet first.");
    }
    
    // Header: ['ID', 'Ticker', 'Entry Date', 'Entry Price', 'Shares', 'Strategy', 'Notes', 'Status', 'Exit Date', 'Exit Price', 'P/L', 'Result']
    const response = await gapi.client.sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Trades!A2:L', // Start from A2 to skip header, up to column L
    });
    
    const rows = response.result.values || [];
    const trades: Trade[] = [];

    rows.forEach((row: any[], index: number) => {
        if (!Array.isArray(row) || row.length < 4) {
            console.warn(`Skipping malformed row ${index + 2} in Google Sheet.`);
            return;
        }

        try {
            // Fix: Explicitly type `status` to ensure it's assignable to the 'open' | 'closed' literal type.
            const status: 'open' | 'closed' = row[7] === 'open' ? 'open' : 'closed';
            const baseTrade = {
                id: row[0] || `sheet-import-${new Date().getTime()}-${index}`,
                ticker: row[1] || '',
                entryDate: row[2] || '',
                entryPrice: parseFloat(row[3]) || 0,
                shares: parseFloat(row[4]) || 0,
                strategy: row[5] || '',
                notes: row[6] || '',
                status: status,
            };

            if (baseTrade.ticker && baseTrade.entryDate) {
                 if (status === 'closed') {
                    const pnl = parseFloat(row[10]) || 0;
                    trades.push({
                        ...baseTrade,
                        exitDate: row[8] || '',
                        exitPrice: parseFloat(row[9]) || 0,
                        pnl: pnl,
                        isWin: row[11] === 'Win',
                    });
                } else {
                    trades.push(baseTrade);
                }
            } else {
                console.warn(`Skipping row ${index + 2} due to missing essential data (ticker, entry date).`);
            }
        } catch (error) {
            console.error(`Error parsing row ${index + 2} from Google Sheet:`, error, 'Row data:', row);
        }
    });

    return trades;
};
