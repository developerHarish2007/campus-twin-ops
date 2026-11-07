import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../api/client';

export interface SeededUser {
  id?: string;
  email: string;
  name: string;
  role: string;
  dept: string;
  domain?: string;
  title?: string;
  iconName?: string;
  badgeColor: string;
}

export const WORKER_USERS: SeededUser[] = [
  {
    id: 'usr_karthik',
    email: 'arunak0787@gmail.com',
    name: 'Karthik Subramanian',
    role: 'TECHNICIAN',
    dept: 'Electrical Maintenance',
    domain: 'ELECTRICAL',
    title: 'Senior Campus Electrician',
    iconName: 'Zap',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30'
  },
  {
    id: 'usr_ramesh',
    email: 'tech_plumb_1@easwari.edu',
    name: 'Ramesh Venkatesan',
    role: 'TECHNICIAN',
    dept: 'Plumbing & Water Systems',
    domain: 'PLUMBING',
    title: 'Senior Campus Plumber',
    iconName: 'Droplet',
    badgeColor: 'bg-sky-500/20 text-sky-300 border-sky-500/30'
  },
  {
    id: 'usr_suresh',
    email: 'tech_net_1@easwari.edu',
    name: 'Suresh Kumar',
    role: 'TECHNICIAN',
    dept: 'IT & Campus Network Ops',
    domain: 'NETWORK',
    title: 'Network & Systems Engineer',
    iconName: 'Wifi',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  },
  {
    id: 'usr_mohanraj',
    email: 'tech_sos_1@easwari.edu',
    name: 'Mohanraj Krishnan',
    role: 'TECHNICIAN',
    dept: 'SOS & Emergency Medical Response',
    domain: 'SOS',
    title: 'SOS Emergency Response Officer',
    iconName: 'AlertTriangle',
    badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/30'
  },
  {
    id: 'usr_thangavel',
    email: 'tech_sweeper_1@easwari.edu',
    name: 'Thangavel Murugan',
    role: 'TECHNICIAN',
    dept: 'Campus Sanitation & Housekeeping',
    domain: 'SWEEPER',
    title: 'Sanitation Lead & Sweeper',
    iconName: 'Sparkles',
    badgeColor: 'bg-teal-500/20 text-teal-300 border-teal-500/30'
  },
  {
    id: 'usr_selvam',
    email: 'jeevadarwin007@gmail.com',
    name: 'Selvam Muthuraj',
    role: 'TECHNICIAN',
    dept: 'Structural & Safety Works',
    domain: 'STRUCTURAL_SAFETY',
    title: 'Campus Safety & Civil Tech',
    iconName: 'HardHat',
    badgeColor: 'bg-orange-500/20 text-orange-300 border-orange-500/30'
  }
];

export const SEEDED_USERS: SeededUser[] = [
  {
    id: 'usr_admin',
    email: 'sys_admin_1@easwari.edu',
    name: 'Anand Natarajan',
    role: 'SYS_ADMIN',
    dept: 'Campus Administration',
    badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30'
  },
  {
    id: 'usr_student',
    email: 'student_1@easwari.edu',
    name: 'Aditya Raman',
    role: 'STUDENT_FACULTY',
    dept: 'Student & Faculty Portal',
    badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  },
  ...WORKER_USERS
];

interface AuthContextType {
  currentUser: SeededUser;
  token: string | null;
  loading: boolean;
  switchUser: (user: SeededUser) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<SeededUser>(SEEDED_USERS[0]);
  const [token, setToken] = useState<string | null>(localStorage.getItem('campusops_token'));
  const [loading, setLoading] = useState<boolean>(true);

  const loginUser = async (user: SeededUser) => {
    try {
      setLoading(true);
      const res: any = await api.post('/auth/login', { email: user.email });
      if (res.access_token) {
        localStorage.setItem('campusops_token', res.access_token);
        setToken(res.access_token);
        setCurrentUser({
          ...user,
          id: res.user_id || user.id,
          name: res.full_name || user.name,
          role: res.role || user.role,
        });
      } else {
        setCurrentUser(user);
      }
    } catch (err) {
      console.warn('Fallback authentication used for user:', user.name);
      setCurrentUser(user);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loginUser(currentUser);
  }, []);

  const switchUser = async (user: SeededUser) => {
    await loginUser(user);
  };

  return (
    <AuthContext.Provider value={{ currentUser, token, loading, switchUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
