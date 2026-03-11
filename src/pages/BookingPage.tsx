import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, query, where, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ExamSlot, Booking, AppSettings } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Calendar, MapPin, Clock, Users, Check, AlertCircle, Loader2 } from 'lucide-react';
import { format, parseISO, differenceInHours } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function BookingPage() {
  const { profile } = useAuth();
  const [slots, setSlots] = useState<ExamSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slotBookings, setSlotBookings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setGlobalSettings(docSnap.data() as AppSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });

    const unsubscribeSlots = onSnapshot(collection(db, 'exam_slots'), (snapshot) => {
      const slotsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamSlot));
      setSlots(slotsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'exam_slots');
    });

    const unsubscribeBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      const bookingsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking));
      setBookings(bookingsData.filter(b => b.student_id === profile?.uid));
      
      // Calculate total bookings per slot
      const counts: Record<string, number> = {};
      bookingsData.forEach(b => {
        counts[b.slot_id] = (counts[b.slot_id] || 0) + 1;
      });
      setSlotBookings(counts);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'bookings');
    });

    return () => {
      unsubscribeSettings();
      unsubscribeSlots();
      unsubscribeBookings();
    };
  }, [profile?.uid]);

  const isRegistrationActive = () => {
    if (!globalSettings) return false;
    if (!globalSettings.registration_open) return false;
    
    const now = new Date();
    const start = globalSettings.registration_start ? new Date(globalSettings.registration_start) : null;
    const end = globalSettings.registration_end ? new Date(globalSettings.registration_end) : null;
    
    // Set start to beginning of day and end to end of day
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);
    
    if (start && now < start) return false;
    if (end && now > end) return false;
    
    return true;
  };

  const handleBook = async (slot: ExamSlot) => {
    if (!profile) return;
    
    if (!isRegistrationActive()) {
      alert('عذراً، فترة التسجيل مغلقة حالياً.');
      return;
    }
    
    const currentInvigilators = slotBookings[slot.id] || 0;
    if (currentInvigilators >= slot.required_invigilators) {
      alert('عذراً، اكتمل العدد المطلوب لهذه الفترة. يرجى اختيار فترة أخرى.');
      return;
    }

    const totalBookedHours = bookings.reduce((acc, curr) => acc + curr.booked_hours, 0);
    const requiredHours = profile.required_hours || 16;
    
    const startTime = parseISO(`2000-01-01T${slot.start_time}`);
    const endTime = parseISO(`2000-01-01T${slot.end_time}`);
    const slotHours = differenceInHours(endTime, startTime);

    if (totalBookedHours + slotHours > requiredHours) {
      alert('لا يمكنك تجاوز عدد الساعات المطلوبة منك.');
      return;
    }

    setActionLoading(slot.id);
    console.log('Booking attempt:', {
      student_id: profile.uid,
      slot_id: slot.id,
      booked_hours: slotHours,
      student_name: profile.name,
      course_name: slot.course_name,
      exam_date: slot.exam_date,
      auth_uid: auth.currentUser?.uid
    });
    try {
      // Create booking
      await addDoc(collection(db, 'bookings'), {
        student_id: profile.uid,
        slot_id: slot.id,
        booked_hours: slotHours,
        student_name: profile.name,
        course_name: slot.course_name,
        exam_date: slot.exam_date,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bookings');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (slotId: string) => {
    if (!isRegistrationActive()) {
      alert('عذراً، فترة التسجيل مغلقة حالياً. لا يمكنك إلغاء الحجز.');
      return;
    }

    const booking = bookings.find(b => b.slot_id === slotId);
    const slot = slots.find(s => s.id === slotId);
    if (!booking || !slot) return;

    setActionLoading(slotId);
    try {
      await deleteDoc(doc(db, 'bookings', booking.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bookings/${booking.id}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-indigo-600" size={40} />
    </div>;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">حجز فترات المراقبة</h1>
        <p className="text-slate-500 mt-1">اختر من الفترات المتاحة أدناه لإكمال ساعاتك المطلوبة</p>
      </header>

      {!isRegistrationActive() && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex items-center gap-4 text-amber-800">
          <AlertCircle size={24} className="shrink-0" />
          <div>
            <p className="font-bold">فترة التسجيل مغلقة</p>
            <p className="text-sm opacity-90">
              {globalSettings?.registration_start && globalSettings?.registration_end 
                ? `التسجيل متاح من ${globalSettings.registration_start} إلى ${globalSettings.registration_end}`
                : 'التسجيل غير متاح حالياً. يرجى مراجعة الإدارة.'}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-12">
        {[1, 2, 3, 4, 5].map((year) => {
          const yearSlots = slots.filter(s => s.academic_year === year);
          if (yearSlots.length === 0) return null;
          const yearNames = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];

          return (
            <section key={year} className="space-y-6">
              <h2 className="text-2xl font-bold text-slate-800 border-r-4 border-indigo-600 pr-4">برنامج السنة {yearNames[year - 1]}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {yearSlots.map((slot) => {
                  const isBooked = bookings.some(b => b.slot_id === slot.id);
                  const currentInvigilators = slotBookings[slot.id] || 0;
                  const isFull = currentInvigilators >= slot.required_invigilators;

                  return (
                    <div 
                      key={slot.id} 
                      className={`
                        bg-white rounded-3xl shadow-sm border p-6 flex flex-col transition-all
                        ${isBooked ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-100'}
                        ${isFull && !isBooked ? 'opacity-75 grayscale-[0.5]' : ''}
                      `}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <span className={`
                          px-3 py-1 rounded-full text-xs font-bold
                          ${slot.session_type === 'morning' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}
                        `}>
                          {slot.session_type === 'morning' ? 'فترة صباحية' : 'فترة مسائية'}
                        </span>
                        {isBooked && (
                          <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
                            <Check size={14} />
                            تم الحجز
                          </span>
                        )}
                      </div>

                      <h3 className="text-xl font-bold text-slate-900 mb-4">{slot.course_name}</h3>

                      <div className="space-y-3 mb-6 flex-1">
                        <div className="flex items-center gap-3 text-slate-600">
                          <Calendar size={18} className="text-slate-400" />
                          <span className="text-sm">{slot.exam_date}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-600">
                          <Clock size={18} className="text-slate-400" />
                          <span className="text-sm">{slot.start_time} - {slot.end_time}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-600">
                          <MapPin size={18} className="text-slate-400" />
                          <span className="text-sm">{slot.location || 'غير محدد'}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-600">
                          <Users size={18} className="text-slate-400" />
                          <span className="text-sm">
                            {currentInvigilators} / {slot.required_invigilators} مراقبين
                            {isFull && !isBooked && (
                              <span className="mr-2 text-red-500 font-bold">(اكتمل العدد)</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="mt-auto">
                        {isBooked ? (
                          <button
                            onClick={() => handleCancel(slot.id)}
                            disabled={actionLoading === slot.id || !isRegistrationActive()}
                            className="w-full py-3 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
                          >
                            {actionLoading === slot.id ? <Loader2 className="animate-spin mx-auto" size={20} /> : 'إلغاء الحجز'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBook(slot)}
                            disabled={isFull || actionLoading === slot.id || !isRegistrationActive()}
                            className={`
                              w-full py-3 rounded-2xl font-bold transition-colors disabled:opacity-50
                              ${isFull || !isRegistrationActive() ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}
                            `}
                          >
                            {actionLoading === slot.id ? (
                              <Loader2 className="animate-spin mx-auto" size={20} />
                            ) : !isRegistrationActive() ? (
                              'التسجيل مغلق'
                            ) : isFull ? (
                              'اكتمل العدد لهذه الفترة'
                            ) : (
                              'حجز الآن'
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {slots.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-slate-300">
            <AlertCircle className="mx-auto text-slate-300 mb-4" size={48} />
            <p className="text-slate-500">لا توجد فترات متاحة حالياً.</p>
          </div>
        )}
      </div>
    </div>
  );
}
