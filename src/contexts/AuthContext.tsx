import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  isSuperAdmin: false,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  if (error) {
    throw error;
  }

  useEffect(() => {
    const handleQuota = () => {
      setQuotaExceeded(true);
      setLoading(false);
    };

    window.addEventListener('firestore-quota-exceeded', handleQuota);
    return () => {
      window.removeEventListener('firestore-quota-exceeded', handleQuota);
    };
  }, []);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      setLoading(true); // Reset loading on auth change
      setUser(firebaseUser);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser) {
        // Listen to profile changes
        unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (docSnap) => {
          if (docSnap.exists()) {
            setProfile({ uid: firebaseUser.uid, ...docSnap.data() } as UserProfile);
          } else {
            setProfile(null);
          }
          setLoading(false);
        }, (err) => {
          if (auth.currentUser) {
            try {
              handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
            } catch (handlerError) {
              setError(handlerError as Error);
            }
          }
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.role === 'admin' || 
             user?.email === "amiraldeenalhammami@ab3adacademy.com",
    isSuperAdmin: user?.email === "amiraldeenalhammami@ab3adacademy.com",
  };

  if (quotaExceeded) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans" dir="rtl">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center animate-in fade-in zoom-in-95 duration-250">
          <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={40} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4 leading-snug">عذراً، النظام تحت وضع جدولة الطلبات المؤقت</h1>
          <p className="text-slate-500 mb-6 leading-relaxed text-sm text-justify">
            نظرًا للإقبال الكثيف والتزامن العالي من الطلاب لإنشاء الحسابات وتحديث البيانات خلال فترة الإطلاق التجريبي الحالية، تم تفعيل نظام الجدولة التلقائية لحماية البيانات وضمان استقرار السيرفر.
          </p>
          <p className="text-slate-500 mb-6 leading-relaxed text-sm text-justify">
            يُرجى العلم أن هذه نافذة صيانة تنظيمية مؤقتة ومحدودة، وستعود المنصة لاستقبال طلبات التسجيل بشكل كامل وطبيعي خلال الساعات القادمة.
          </p>
          <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl mb-6 text-right">
            <p className="text-xs text-amber-800 leading-relaxed font-medium">
              💡 تنويه: يتم الآن إنهاء عمليات الفحص والتهيئة النهائية للسيرفرات لاستيعاب الضغط المتزايد. يمكنك الضغط على الزر أدناه للتحقق من فتح نافذة الدخول مجدداً.
            </p>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
          >
            <RefreshCw size={20} />
            <span>التحقق من الدخول مجدداً</span>
          </button>
        </div>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
