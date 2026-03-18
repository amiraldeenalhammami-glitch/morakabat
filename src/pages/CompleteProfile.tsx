import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getRandomEmoji } from '../utils/emojis';
import { User, Phone, IdCard, Building, AlertCircle, Loader2 } from 'lucide-react';

export default function CompleteProfile() {
  const { user, profile, loading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    phone: '',
    university_id: '',
    department: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
    if (!authLoading && profile) {
      navigate('/');
    }
  }, [user, profile, authLoading, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('لم يتم العثور على بيانات المستخدم. يرجى تسجيل الدخول مرة أخرى.');
      return;
    }
    
    setError('');
    setLoading(true);
    setLoadingText('جاري بدء العملية...');
    console.log('Submit started. User:', user.uid);

    try {
      // Save Profile to Firestore
      setLoadingText('جاري حفظ البيانات النهائية...');
      console.log('Saving to Firestore...');
      try {
        // Fetch default hours from settings
        let defaultHours = 16;
        try {
          const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
          if (settingsSnap.exists()) {
            defaultHours = settingsSnap.data().default_required_hours || 16;
          }
        } catch (sErr) {
          console.error('Error fetching default hours:', sErr);
        }

        const userData = {
          name: user.displayName || 'مستخدم جديد',
          email: user.email || '',
          phone: formData.phone,
          university_id: formData.university_id,
          department: formData.department,
          role: 'student',
          avatar_emoji: getRandomEmoji(),
          required_hours: defaultHours,
          createdAt: new Date().toISOString(),
        };
        
        // Use a timeout for Firestore just in case
        const savePromise = setDoc(doc(db, 'users', user.uid), userData);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('انتهت مهلة الاتصال بقاعدة البيانات. يرجى المحاولة مرة أخرى.')), 15000)
        );

        await Promise.race([savePromise, timeoutPromise]);
        console.log('Firestore save successful');
      } catch (firestoreErr: any) {
        console.error('Firestore save error:', firestoreErr);
        throw new Error(`خطأ في حفظ البيانات: ${firestoreErr.message}`);
      }

      console.log('Navigation to dashboard...');
      navigate('/');
    } catch (err: any) {
      console.error('Final error catch:', err);
      setError(err.message || 'حدث خطأ غير متوقع أثناء إكمال الملف الشخصي.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-12">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600">إكمال الملف الشخصي</h1>
          <p className="text-slate-500 mt-2">يرجى تزويدنا ببياناتك الجامعية للمتابعة</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3 text-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">رقم الهاتف</label>
              <div className="relative">
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  name="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="05xxxxxxxx"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">الرقم الجامعي</label>
              <div className="relative">
                <IdCard className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  name="university_id"
                  type="text"
                  required
                  value={formData.university_id}
                  onChange={handleChange}
                  className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="2024xxxx"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">القسم / التخصص</label>
              <div className="relative">
                <Building className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  name="department"
                  type="text"
                  required
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="علوم الحاسب"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin" size={24} />
                <span>{loadingText}</span>
              </div>
            ) : (
              <span>حفظ وإكمال التسجيل</span>
            )}
          </button>
        </form>

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
