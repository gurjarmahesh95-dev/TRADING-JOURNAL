
import React, { useState, useEffect } from 'react';
import type { UserProfile } from '../types';
import { Icon } from './Icon';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (profile: UserProfile) => void;
  currentUserProfile: UserProfile;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, onSave, currentUserProfile }) => {
  const [profile, setProfile] = useState<UserProfile>(currentUserProfile);

  useEffect(() => {
    setProfile(currentUserProfile);
  }, [currentUserProfile, isOpen]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(profile);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <Icon type="close" className="h-6 w-6" />
        </button>
        <h2 className="text-2xl font-bold mb-6 text-white">Edit Profile</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300">Username</label>
            <input 
              type="text" 
              name="username" 
              id="username"
              value={profile.username} 
              onChange={handleChange} 
              className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" 
              required 
            />
          </div>
          <div>
            <label htmlFor="avatar" className="block text-sm font-medium text-gray-300">Avatar (Emoji recommended)</label>
            <input 
              type="text" 
              name="avatar" 
              id="avatar"
              value={profile.avatar} 
              onChange={handleChange}
              maxLength={2}
              className="mt-1 block w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-white" 
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md text-gray-300 bg-gray-600 hover:bg-gray-500">Cancel</button>
            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  );
};
