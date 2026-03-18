import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Booking, AppSettings } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Clock, CheckCircle, AlertCircle, Calendar as CalendarIcon, MessageSquare, CheckCircle2, XCircle, Download } from 'lucide-react';
import { usePWA } from '../hooks/usePWA';

export default function StudentDashboard() {
  const { profile, user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const { canInstall, installApp } = usePWA();

  useEffect(() => {
    if (!profile?.uid) return;

    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'global'));
        if (docSnap.exists()) {
          const data = docSnap.data() as AppSettings;
          setGlobalSettings({
            registration_open: data.registration_open ?? true,
            registration_start: data.registration_start ?? '',
            registration_end: data.registration_end ?? '',
            exam_start: data.exam_start ?? '',
            exam_end: data.exam_end ?? '',
            default_required_hours: data.default_required_hours ?? 16,
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'settings/global');
      }
    };
    fetchSettings();
  }, [profile?.uid]);

  useEffect(() => {
    if (!profile?.uid) return;

    const q = query(collection(db, 'bookings'), where('student_id', '==', profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setBookings(bookingsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'bookings');
    });

    return () => unsubscribe();
  }, [profile?.uid]);

  const totalBookedHours = bookings.reduce((acc, curr) => acc + curr.booked_hours, 0);
  const requiredHours = profile?.required_hours || globalSettings?.default_required_hours || 16;
  const remainingHours = Math.max(0, requiredHours - totalBookedHours);
  const progress = Math.min(100, (totalBookedHours / requiredHours) * 100);

  const getRegistrationMessage = () => {
    if (loading || !globalSettings) return "جاري تحميل الإعدادات...";
    
    const now = new Date();
    const start = globalSettings.registration_start ? new Date(globalSettings.registration_start) : null;
    const end = globalSettings.registration_end ? new Date(globalSettings.registration_end) : null;
    
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    if (!globalSettings.registration_open) {
      return "لايمكنك حجز الفترة الآن لان التسجيل مغلق";
    }

    if (start && now < start) {
      return `سيفتح التسجيل في ${globalSettings.registration_start}${end ? ` وسينتهي في ${globalSettings.registration_end}` : ''}`;
    }

    if (end && now > end) {
      return "لايمكنك حجز الفترة الآن لان التسجيل مغلق (انتهت الفترة)";
    }

    return null;
  };

  const regMessage = getRegistrationMessage();

  const handleUpdateStudentNote = async (note: string) => {
    if (!profile?.uid) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        student_note: note
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${profile.uid}`);
    }
  };

  if (loading) {
    return <div className="animate-pulse space-y-8">
      <div className="h-32 bg-slate-200 rounded-3xl w-full"></div>
      <div className="h-64 bg-slate-200 rounded-3xl w-full"></div>
    </div>;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-slate-900">مرحباً، {profile?.name}</h1>
            {profile?.status === 'active' ? (
              <span className="flex items-center gap-1 bg-emerald-50 text-emerald-600 px-3 py-1 rounded-full text-xs font-bold ring-1 ring-emerald-200">
                <CheckCircle2 size={14} /> مفعل ✅
              </span>
            ) : profile?.status === 'frozen' ? (
              <span className="flex items-center gap-1 bg-rose-50 text-rose-600 px-3 py-1 rounded-full text-xs font-bold ring-1 ring-rose-200">
                <XCircle size={14} /> مجمد ❄️
              </span>
            ) : (
              <span className="flex items-center gap-1 bg-amber-50 text-amber-600 px-3 py-1 rounded-full text-xs font-bold ring-1 ring-amber-200">
                <Clock size={14} /> قيد الدراسة ⏳
              </span>
            )}
          </div>
          <p className="text-slate-500 mt-1">إليك ملخص ساعات المراقبة الخاصة بك</p>
        </div>
        
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          {canInstall && (
            <button
              onClick={installApp}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              <Download size={18} />
              <span>تنزيل التطبيق</span>
            </button>
          )}
          <div className="w-full md:w-64">
            <label className="block text-[10px] text-slate-400 font-medium mb-1 mr-2">ملاحظة للأدمن</label>
            <div className="relative">
              <MessageSquare size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text"
                placeholder="اكتب ملاحظة للأدمن..."
                defaultValue={profile?.student_note || ''}
                onBlur={(e) => handleUpdateStudentNote(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 rounded-xl pr-9 pl-3 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm transition-all"
              />
            </div>
          </div>
        </div>
      </header>

      {profile?.admin_note && (
        <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl flex items-start gap-4 text-indigo-900 shadow-sm">
          <div className="p-2 bg-white rounded-xl text-indigo-600 shadow-sm">
            <MessageSquare size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">ملاحظة من الإدارة</p>
            <p className="font-medium">{profile.admin_note}</p>
          </div>
        </div>
      )}

      {profile?.status !== 'active' ? (
        <div className="bg-white p-12 rounded-3xl shadow-sm border border-slate-100 text-center space-y-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${profile?.status === 'frozen' ? 'bg-rose-50 text-rose-500' : 'bg-amber-50 text-amber-500'}`}>
            {profile?.status === 'frozen' ? <XCircle size={40} /> : <Clock size={40} />}
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            {profile?.status === 'frozen' ? 'تم تجميد حسابك مؤقتاً' : 'حسابك قيد المراجعة'}
          </h2>
          <p className="text-slate-500 max-w-md mx-auto">
            {profile?.status === 'frozen' 
              ? 'لقد تم تجميد حسابك من قبل الإدارة. يرجى مراجعة الملاحظة أعلاه والتواصل مع الإدارة إذا لزم الأمر.'
              : 'يرجى الانتظار حتى يقوم المسؤول بتفعيل حسابك. يمكنك في هذه الأثناء استكمال بياناتك ورفع الصور المطلوبة من صفحة الملف الشخصي.'}
          </p>
          <div className="pt-4">
            <button 
              onClick={() => window.location.href = '/profile'}
              className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
            >
              انتقل للملف الشخصي لاستكمال البيانات
            </button>
          </div>
        </div>
      ) : (
        <>
          {regMessage && (
            <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex items-center gap-4 text-amber-800">
              <AlertCircle size={24} className="shrink-0" />
              <div>
                <p className="font-bold">{regMessage}</p>
                <p className="text-sm opacity-90">يرجى مراجعة الإدارة لأي استفسارات إضافية.</p>
              </div>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                  <Clock size={24} />
                </div>
                <h3 className="font-bold text-slate-700">الساعات المطلوبة</h3>
              </div>
              <p className="text-4xl font-bold text-slate-900">{requiredHours}</p>
              <p className="text-sm text-slate-500 mt-1">ساعة إجمالية</p>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <CheckCircle size={24} />
                </div>
                <h3 className="font-bold text-slate-700">الساعات المنجزة</h3>
              </div>
              <p className="text-4xl font-bold text-slate-900">{totalBookedHours}</p>
              <p className="text-sm text-slate-500 mt-1">ساعة محجوزة</p>
            </div>

            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
              <div className="flex items-center gap-4 mb-4">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                  <AlertCircle size={24} />
                </div>
                <h3 className="font-bold text-slate-700">الساعات المتبقية</h3>
              </div>
              <p className="text-4xl font-bold text-slate-900">{remainingHours}</p>
              <p className="text-sm text-slate-500 mt-1">ساعة متبقية</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-slate-900">نسبة الإنجاز</h3>
              <span className="text-indigo-600 font-bold">{Math.round(progress)}%</span>
            </div>
            <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-600 transition-all duration-1000" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Recent Bookings */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-900">حجوزاتك الحالية</h3>
              <CalendarIcon className="text-slate-400" size={20} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-right">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-sm">
                    <th className="px-6 py-4 font-medium">المادة</th>
                    <th className="px-6 py-4 font-medium">التاريخ</th>
                    <th className="px-6 py-4 font-medium">الساعات</th>
                    <th className="px-6 py-4 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {bookings.length > 0 ? (
                    bookings.map((booking) => (
                      <tr key={booking.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-900">{booking.course_name}</td>
                        <td className="px-6 py-4 text-slate-600">{booking.exam_date}</td>
                        <td className="px-6 py-4 text-slate-600">{booking.booked_hours} ساعة</td>
                        <td className="px-6 py-4">
                          <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold">
                            مؤكد
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                        لا توجد حجوزات حالية. ابدأ بحجز فترات المراقبة الآن.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
