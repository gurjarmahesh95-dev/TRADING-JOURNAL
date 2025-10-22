import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { saveBrokerCredentials, loadBrokerCredentials, clearBrokerCredentials, BrokerCredentials } from '../services/brokerService';

export const SettingsView: React.FC = () => {
    const [creds, setCreds] = useState<BrokerCredentials>({ apiKey: '', apiSecret: '' });
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const loadedCreds = loadBrokerCredentials();
        if (loadedCreds) {
            setCreds(loadedCreds);
        }
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCreds(prev => ({ ...prev, [e.target.name]: e.target.value }));
        setSaved(false);
    };

    const handleSave = () => {
        saveBrokerCredentials(creds);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleClear = () => {
        clearBrokerCredentials();
        setCreds({ apiKey: '', apiSecret: '' });
    };

    return (
        <div className="p-4 sm:p-6 lg:p-8 h-full flex flex-col">
            <div className="mb-6">
                <h1 className="text-3xl font-bold text-white">Settings & Integrations</h1>
                <p className="text-lg text-gray-400 mt-1">Manage connections to external services.</p>
            </div>

            <div className="max-w-2xl">
                <div className="bg-gray-800 rounded-lg shadow-lg p-6">
                    <h2 className="text-xl font-semibold text-white flex items-center gap-2">
                        <Icon type="link" />
                        Broker API Integration (e.g., Alpaca)
                    </h2>
                    <p className="text-sm text-gray-400 mt-2">
                        Connect your broker to import your trade history.
                    </p>

                    <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-700/50 rounded-lg">
                        <p className="text-sm text-yellow-300">
                            <strong>Security Warning:</strong> Storing API keys in browser local storage is not secure for production applications. This is for demonstration purposes only. A real-world app should use a secure backend proxy to handle credentials.
                        </p>
                    </div>

                    <div className="mt-6 space-y-4">
                        <div>
                            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300">API Key</label>
                            <input
                                type="password"
                                name="apiKey"
                                id="apiKey"
                                value={creds.apiKey}
                                onChange={handleChange}
                                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white"
                            />
                        </div>
                        <div>
                            <label htmlFor="apiSecret" className="block text-sm font-medium text-gray-300">API Secret Key</label>
                            <input
                                type="password"
                                name="apiSecret"
                                id="apiSecret"
                                value={creds.apiSecret}
                                onChange={handleChange}
                                className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white"
                            />
                        </div>
                    </div>

                    <div className="mt-6 flex justify-end items-center gap-3">
                        {saved && <span className="text-sm text-green-400">Credentials Saved!</span>}
                        <button onClick={handleClear} className="px-4 py-2 text-sm font-medium rounded-md text-gray-300 bg-gray-600 hover:bg-gray-500">
                            Clear
                        </button>
                        <button onClick={handleSave} className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">
                            Save Credentials
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
