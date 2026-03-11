import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Booking, AppSettings } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Clock, CheckCircle, AlertCircle, Calendar as CalendarIcon } from 'lucide-react';

export default function StudentDashboard() {
  const { profile } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'settings', 'global'));
        if (docSnap.exists()) {
          setGlobalSettings(docSnap.data() as AppSettings);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'settings/global');
      }
    };
    fetchSettings();
  }, []);

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

  const isRegistrationActive = () => {
    if (!globalSettings) return false;
    if (!globalSettings.registration_open) return false;
    
    const now = new Date();
    const start = globalSettings.registration_start ? new Date(globalSettings.registration_start) : null;
    const end = globalSettings.registration_end ? new Date(globalSettings.registration_end) : null;
    
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);
    
    if (start && now < start) return false;
    if (end && now > end) return false;
    
    return true;
  };

  if (loading) {
    return <div className="animate-pulse space-y-8">
      <div className="h-32 bg-slate-200 rounded-3xl w-full"></div>
      <div className="h-64 bg-slate-200 rounded-3xl w-full"></div>
    </div>;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">مرحباً، {profile?.name}</h1>
        <p className="text-slate-500 mt-1">إليك ملخص ساعات المراقبة الخاصة بك</p>
      </header>

      {!isRegistrationActive() && globalSettings && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex items-center gap-4 text-amber-800">
          <AlertCircle size={24} className="shrink-0" />
          <div>
            <p className="font-bold">فترة التسجيل مغلقة</p>
            <p className="text-sm opacity-90">
              {globalSettings.registration_start && globalSettings.registration_end 
                ? `التسجيل متاح من ${globalSettings.registration_start} إلى ${globalSettings.registration_end}`
                : 'التسجيل غير متاح حالياً. يرجى مراجعة الإدارة.'}
            </p>
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
    </div>
  );
}
