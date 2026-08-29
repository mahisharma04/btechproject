import { NavLink } from 'react-router-dom';
import { Home, Search, Settings, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { logout } = useAuth();

  return (
    <div className="w-64 bg-[#111113] border-r border-gray-800 h-screen flex flex-col">
      <div className="p-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-black font-bold">S</span>
          </div>
          <span className="text-xl font-semibold">Syncora</span>
        </div>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        <NavLink
          to="/dashboard"
          end
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive
                ? 'bg-gray-800 text-primary'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`
          }
        >
          <Home size={20} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink
          to="/upload"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive
                ? 'bg-gray-800 text-primary'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`
          }
        >
          <Upload size={20} />
          <span>Upload Meeting</span>
        </NavLink>
        <NavLink
          to="/search"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive
                ? 'bg-gray-800 text-primary'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`
          }
        >
          <Search size={20} />
          <span>Search & Chat</span>
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              isActive
                ? 'bg-gray-800 text-primary'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`
          }
        >
          <Settings size={20} />
          <span>Settings</span>
        </NavLink>
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
            <span className="text-sm font-medium">JD</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">John Doe</p>
            <p className="text-xs text-gray-500">john@example.com</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full py-2 text-sm text-gray-400 hover:text-white transition-colors"
        >
          Log out
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
