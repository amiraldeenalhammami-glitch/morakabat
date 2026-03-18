import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { LogIn, Mail, Lock, AlertCircle, Chrome } from 'lucide-react';
import { Logo } from '../components/Logo';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err: any) {
      console.error(err);
      const errorCode = err.code;
      if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password' || errorCode === 'auth/user-not-found') {
        setError('خطأ في البريد الإلكتروني أو كلمة المرور. يرجى التأكد من البيانات والمحاولة مرة أخرى.');
      } else if (errorCode === 'auth/too-many-requests') {
        setError('تم حظر المحاولات مؤقتاً بسبب كثرة محاولات تسجيل الدخول الفاشلة. يرجى المحاولة لاحقاً.');
      } else {
        setError('حدث خطأ أثناء تسجيل الدخول. يرجى المحاولة مرة أخرى.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      
      // Check if user has a profile
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        navigate('/');
      } else {
        navigate('/complete-profile');
      }
    } catch (err: any) {
      console.error(err);
      const errorCode = err.code || '';
      if (errorCode === 'auth/popup-blocked') {
        setError('تم حظر النافذة المنبثقة. يرجى السماح بالمنبثقات لهذا الموقع.');
      } else if (errorCode === 'auth/unauthorized-domain') {
        setError(`هذا النطاق (${window.location.hostname}) غير مصرح به في إعدادات Firebase. يرجى إضافته إلى Authorized Domains في وحدة تحكم Firebase.`);
      } else if (errorCode === 'auth/network-request-failed') {
        setError('فشل الاتصال بالشبكة. قد يكون ذلك بسبب ضعف الإنترنت، أو حظر المتصفح لملفات تعريف الارتباط للجهات الخارجية (Third-party cookies)، أو بسبب مانع إعلانات (AdBlocker). يرجى المحاولة مرة أخرى أو استخدام متصفح آخر.');
      } else {
        setError(`حدث خطأ أثناء تسجيل الدخول عبر جوجل (${errorCode})`);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8">
        <div className="flex flex-col items-center mb-8">
          <Logo className="w-16 h-16" showText={false} />
          <h1 className="text-3xl font-bold text-indigo-600 mt-4">تسجيل الدخول</h1>
          <p className="text-slate-500 mt-2 text-center">مرحباً بك في نظام المراقبات الامتحانية</p>
          <p className="text-xs text-slate-400 mt-1">جامعة دمشق كلية الهندسة المعمارية</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3 text-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          <button
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            className="w-full flex items-center justify-center gap-3 py-3 border border-slate-200 rounded-2xl font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {googleLoading ? (
              <div className="w-6 h-6 border-2 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin" />
            ) : (
              <>
                <Chrome size={20} className="text-indigo-600" />
                <span>الدخول عبر جوجل</span>
              </>
            )}
          </button>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-100"></div>
            <span className="flex-shrink mx-4 text-slate-400 text-xs uppercase">أو عبر البريد</span>
            <div className="flex-grow border-t border-slate-100"></div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">البريد الإلكتروني</label>
              <div className="relative">
                <Mail className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder="example@univ.edu"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">كلمة المرور</label>
              <div className="relative">
                <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
              <div className="mt-2 text-right">
                <Link to="/forgot-password" className="text-xs text-indigo-600 hover:underline font-medium">
                  هل نسيت كلمة السر؟
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <LogIn size={20} />
                  <span>دخول</span>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-8 text-center text-slate-600">
          ليس لديك حساب؟{' '}
          <Link to="/register" className="text-indigo-600 font-bold hover:underline">
            إنشاء حساب جديد
          </Link>
        </p>

        <div className="mt-8 pt-6 border-t text-center">
          <p className="text-[10px] text-slate-400">
            صمم هذا التطبيق بواسطة{' '}
            <a 
              href="https://www.facebook.com/amir.aldeen.alhammami/?locale=ar_AR" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-indigo-500 hover:underline font-medium"
            >
              م.أمير الدين الحمامي
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
