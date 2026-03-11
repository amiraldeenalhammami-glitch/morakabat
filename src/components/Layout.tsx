import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../firebase';
import { LogOut, User, LayoutDashboard, Calendar, Users, Settings, Menu, X } from 'lucide-react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  const navItems = isAdmin 
    ? [
        { name: 'لوحة التحكم', path: '/admin', icon: LayoutDashboard },
        { name: 'البرنامج الامتحاني', path: '/admin/slots', icon: Calendar },
        { name: 'الطلاب', path: '/admin/students', icon: Users },
        { name: 'الإعدادات', path: '/admin/settings', icon: Settings },
      ]
    : [
        { name: 'لوحة التحكم', path: '/dashboard', icon: LayoutDashboard },
        { name: 'حجز فترة', path: '/book', icon: Calendar },
        { name: 'الملف الشخصي', path: '/profile', icon: User },
      ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b px-4 py-3 flex justify-between items-center sticky top-0 z-50">
        <h1 className="text-xl font-bold text-indigo-600">نظام المراقبة</h1>
        <button onClick={() => setIsMenuOpen(!isMenuOpen)}>
          {isMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed inset-0 z-40 md:relative md:z-0
        bg-white border-l w-64 flex-shrink-0 flex flex-col
        transition-transform duration-300 ease-in-out
        ${isMenuOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
      `}>
        <div className="p-6 hidden md:block">
          <h1 className="text-2xl font-bold text-indigo-600">نظام المراقبة</h1>
          <p className="text-xs text-slate-500 mt-1">جامعة الدراسات العليا</p>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4 md:mt-0">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMenuOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-xl transition-colors
                  ${isActive 
                    ? 'bg-indigo-50 text-indigo-600 font-medium' 
                    : 'text-slate-600 hover:bg-slate-50'}
                `}
              >
                <Icon size={20} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold overflow-hidden">
              {profile?.photo ? (
                <img src={profile.photo} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                profile?.name?.charAt(0) || 'U'
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{profile?.name}</p>
              <p className="text-xs text-slate-500 truncate">{profile?.role === 'admin' ? 'مدير' : 'طالب'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <LogOut size={20} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto">
          {children}
        </div>
      </main>

      {/* Overlay for mobile menu */}
      {isMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-30 md:hidden"
          onClick={() => setIsMenuOpen(false)}
        />
      )}
    </div>
  );
};
