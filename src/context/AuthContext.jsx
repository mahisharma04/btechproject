import { createContext, useContext, useState, useEffect } from 'react';
import { api, getStoredUser } from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => api.isLoggedIn());
  const [user, setUser] = useState(() => getStoredUser());

  useEffect(() => {
    const onStorage = () => {
      setIsAuthenticated(api.isLoggedIn());
      setUser(getStoredUser());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const afterAuth = (data) => {
    setIsAuthenticated(true);
    if (data?.user) setUser(data.user);
  };

  const login = async (email, password) => {
    const data = await api.login({ email, password });
    afterAuth(data);
    return data;
  };

  const register = async (name, email, password) => {
    const data = await api.register({ name, email, password });
    afterAuth(data);
    return data;
  };

  const logout = () => {
    api.logout();
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
