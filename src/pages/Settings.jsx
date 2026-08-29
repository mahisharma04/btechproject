import { useState } from 'react';
import { User, Bell, Shield, Users, Save } from 'lucide-react';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('profile');

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'security', label: 'Security', icon: Shield }
  ];

  return (
    <div className="p-8">
      <div className="max-w-4xl">
        <div className="flex gap-2 border-b border-gray-800 mb-8">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-400 hover:text-gray-200'
                }`}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'profile' && (
          <div className="bg-[#111113] border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-6">Profile</h3>
            <div className="space-y-6">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center text-2xl font-semibold">
                  JD
                </div>
                <button className="px-4 py-2 border border-gray-700 rounded-lg text-sm hover:bg-gray-800 transition-colors">
                  Change avatar
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Full name</label>
                  <input
                    type="text"
                    defaultValue="John Doe"
                    className="w-full bg-[#0a0a0b] border border-gray-700 rounded-lg py-3 px-4 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Email</label>
                  <input
                    type="email"
                    defaultValue="john@example.com"
                    className="w-full bg-[#0a0a0b] border border-gray-700 rounded-lg py-3 px-4 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <button className="flex items-center gap-2 bg-primary text-black font-semibold py-3 px-6 rounded-lg hover:bg-cyan-400 transition-colors">
                  <Save size={18} />
                  Save changes
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="bg-[#111113] border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-6">Notifications</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-[#0a0a0b] rounded-lg">
                <div>
                  <p className="font-medium">Email notifications</p>
                  <p className="text-sm text-gray-400">Get notified when your meeting is processed</p>
                </div>
                <div className="w-12 h-6 bg-primary rounded-full relative cursor-pointer">
                  <div className="absolute top-1 right-1 w-4 h-4 bg-white rounded-full" />
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-[#0a0a0b] rounded-lg">
                <div>
                  <p className="font-medium">Action item reminders</p>
                  <p className="text-sm text-gray-400">Get reminders before due dates</p>
                </div>
                <div className="w-12 h-6 bg-gray-700 rounded-full relative cursor-pointer">
                  <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="bg-[#111113] border border-gray-800 rounded-xl p-6 text-center py-20">
            <Users size={48} className="mx-auto mb-4 text-gray-600" />
            <h3 className="text-xl font-semibold mb-2">Team management</h3>
            <p className="text-gray-400 mb-6">Coming soon! Invite your team and collaborate on meetings.</p>
            <button className="px-6 py-3 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed">
              Join waitlist
            </button>
          </div>
        )}

        {activeTab === 'security' && (
          <div className="bg-[#111113] border border-gray-800 rounded-xl p-6">
            <h3 className="text-lg font-semibold mb-6">Security</h3>
            <div className="space-y-4">
              <div className="p-4 bg-[#0a0a0b] rounded-lg flex items-center justify-between">
                <div>
                  <p className="font-medium">Change password</p>
                  <p className="text-sm text-gray-400">Last changed 30 days ago</p>
                </div>
                <button className="text-primary hover:text-cyan-300 text-sm">Change</button>
              </div>
              <div className="p-4 bg-[#0a0a0b] rounded-lg flex items-center justify-between">
                <div>
                  <p className="font-medium">Two-factor authentication</p>
                  <p className="text-sm text-gray-400">Add an extra layer of security</p>
                </div>
                <button className="text-primary hover:text-cyan-300 text-sm">Enable</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
