import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { Booking, AppSettings, GroupNote, ExamSlot } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Clock, CheckCircle, AlertCircle, Calendar as CalendarIcon, MessageSquare, CheckCircle2, XCircle, Download, Bell, MapPin } from 'lucide-react';
import { usePWA } from '../hooks/usePWA';
import { getSlotRooms, getObserverRoom } from '../utils/roomUtils';

export default function StudentDashboard() {
  const { profile, user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [slots, setSlots] = useState<ExamSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [currentNote, setCurrentNote] = useState<GroupNote | null>(null);
  const { canInstall, installApp } = usePWA();
  const [trimTimeLeft, setTrimTimeLeft] = useState<string>('');

  useEffect(() => {
    if (!profile?.uid) return;

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppSettings;
        setGlobalSettings({
          registration_open: data.registration_open ?? true,
          registration_start: data.registration_start ?? '',
          registration_end: data.registration_end ?? '',
          exam_start: data.exam_start ?? '',
          exam_end: data.exam_end ?? '',
          default_required_hours: data.default_required_hours ?? 16,
          trim_hours_duration: data.trim_hours_duration ?? 6,
          trim_hours_deadline: data.trim_hours_deadline ?? null,
          trim_hours_target: data.trim_hours_target ?? null,
          trim_hours_started_at: data.trim_hours_started_at ?? null,
          trim_hours_processed: data.trim_hours_processed ?? false,
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });

    return () => unsubscribeSettings();
  }, [profile?.uid]);

  useEffect(() => {
    if (!globalSettings?.trim_hours_deadline) {
      setTrimTimeLeft('');
      return;
    }
    const interval = setInterval(() => {
      const diff = new Date(globalSettings.trim_hours_deadline!).getTime() - Date.now();
      if (diff <= 0) {
        setTrimTimeLeft('انتهت المهلة - سيتم تقليص الساعات تلقائياً');
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTrimTimeLeft(`متبقي ${hours} ساعة و ${minutes} دقيقة و ${seconds} ثانية`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [globalSettings?.trim_hours_deadline]);

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

    const unsubscribeSlots = onSnapshot(collection(db, 'exam_slots'), (snapshot) => {
      const slotsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamSlot));
      setSlots(slotsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'exam_slots');
    });

    const unsubscribeAllBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setAllBookings(bookingsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'bookings');
    });

    return () => {
      unsubscribe();
      unsubscribeSlots();
      unsubscribeAllBookings();
    };
  }, [profile?.uid]);

  useEffect(() => {
    if (!profile?.uid) return;

    const status = profile.status || 'pending';
    const docRef = doc(db, 'group_notes', status);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.content && data.content.trim() !== '') {
          setCurrentNote({
            id: docSnap.id,
            content: data.content,
            admin_name: data.admin_name || 'الإدارة',
            admin_id: data.admin_id || '',
            timestamp: data.timestamp
          });
        } else {
          setCurrentNote(null);
        }
      } else {
        setCurrentNote(null);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `group_notes/${status}`);
    });

    return () => unsubscribe();
  }, [profile?.uid, profile?.status]);

  const activeBookings = bookings.filter(b => {
    const slot = slots.find(s => s.id === b.slot_id);
    return slot && !slot.isDeleted;
  });

  const totalBookedHours = activeBookings.reduce((acc, curr) => acc + Math.abs(Number(curr.booked_hours || 0)), 0);
  const requiredHours = Number(profile?.required_hours_mode === 'manual' ? (profile?.required_hours ?? 16) : (globalSettings?.default_required_hours ?? 16));
  const remainingHours = Math.max(0, requiredHours - totalBookedHours);
  const progress = Math.min(100, (totalBookedHours / requiredHours) * 100);

  const isTargetedByTrimming = 
    !!(globalSettings?.trim_hours_deadline && 
    new Date(globalSettings.trim_hours_deadline) > new Date() && 
    totalBookedHours > (globalSettings.trim_hours_target || requiredHours));

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
            {profile?.observer_type && (
              <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold border border-indigo-200">
                {profile.observer_type}
              </span>
            )}
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
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">ملاحظة خاصة لك من الإدارة</p>
            <p className="font-medium">{profile.admin_note}</p>
          </div>
        </div>
      )}

      {currentNote && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2">
            <Bell size={20} className="text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900">ملاحظات جماعية من الإدارة</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white border border-slate-100 p-6 rounded-3xl flex items-start gap-4 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-1 h-full bg-indigo-600"></div>
              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                <MessageSquare size={24} />
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider">ملاحظة جماعية من: {currentNote.admin_name}</p>
                  {currentNote.timestamp && (
                    <span className="text-[10px] text-slate-400">
                      {new Date(currentNote.timestamp?.toDate()).toLocaleString('ar-EG')}
                    </span>
                  )}
                </div>
                <p className="text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{currentNote.content}</p>
              </div>
            </div>
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

          {isTargetedByTrimming && (
            <div className="bg-rose-50 border border-rose-200 p-6 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-rose-800 animate-pulse">
              <div className="flex items-center gap-4">
                <AlertCircle size={32} className="shrink-0 text-rose-600" />
                <div>
                  <h3 className="font-bold text-lg text-rose-900">تنبيه إداري عاجل: تم تخفيض النصاب الافتراضي للساعات</h3>
                  <p className="text-sm mt-1 text-rose-700">
                    يرجى الدخول وإلغاء مادة (ساعتين) تختارها بنفسك خلال المهلة المحددة، وإلا سيقوم النظام بإلغاء مادة تلقائياً لتصحيح نصابك.
                  </p>
                  <p className="text-xs mt-1 font-bold text-slate-700">
                    المهلة المتبقية للتعديل اليدوي: <span className="text-rose-600 text-sm font-extrabold">{trimTimeLeft}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => window.location.href = '/book'}
                className="bg-rose-600 text-white font-bold text-sm px-6 py-2.5 rounded-xl hover:bg-rose-700 transition-colors shrink-0"
              >
                تعديل الحجوزات الآن
              </button>
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
              <table className="w-full text-right whitespace-nowrap md:whitespace-normal">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-sm">
                    <th className="px-3 md:px-6 py-4 font-medium">المادة</th>
                    <th className="px-3 md:px-6 py-4 font-medium">التاريخ</th>
                    <th className="px-3 md:px-6 py-4 font-medium">الساعات ووقت البدء</th>
                    <th className="px-3 md:px-6 py-4 font-medium">موقع المراقبة</th>
                    <th className="px-3 md:px-6 py-4 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeBookings.length > 0 ? (
                    activeBookings.map((booking) => {
                      const slot = slots.find(s => s.id === booking.slot_id);
                      const bookingsForSlot = allBookings.filter(b => b.slot_id === booking.slot_id);
                      const room = slot ? getObserverRoom(slot, booking, bookingsForSlot) : 'القاعة العامة';
                      const startTime = slot?.start_time || 'غير محدد';
                      
                      return (
                        <tr key={booking.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 md:px-6 py-4 font-medium text-slate-900 whitespace-normal min-w-[150px]">{booking.course_name}</td>
                          <td className="px-3 md:px-6 py-4 text-slate-600">{booking.exam_date}</td>
                          <td className="px-3 md:px-6 py-4 text-slate-600">
                            <div className="flex flex-col gap-0.5">
                              <span className="font-semibold text-slate-800">{booking.booked_hours} ساعة</span>
                              <span className="text-xs text-slate-400">البدء: {startTime}</span>
                            </div>
                          </td>
                          <td className="px-3 md:px-6 py-4">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50/50 text-indigo-700 rounded-full text-xs font-bold border border-indigo-100">
                              <MapPin size={13} className="text-indigo-400" />
                              <span>{room}</span>
                            </span>
                          </td>
                          <td className="px-3 md:px-6 py-4">
                            {booking.attendance_status === 'present' ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold ring-1 ring-emerald-200">
                                <CheckCircle2 size={14} />
                                <span>حاضر (ملتزم)</span>
                              </span>
                            ) : booking.attendance_status === 'absent' ? (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-xs font-bold ring-1 ring-rose-200">
                                <XCircle size={14} />
                                <span>غائب</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-bold ring-1 ring-slate-200">
                                <Clock size={14} />
                                <span>انتظار</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
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
