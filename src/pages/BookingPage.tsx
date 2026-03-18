import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, addDoc, query, where, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ExamSlot, Booking, AppSettings } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Calendar as CalendarIcon, MapPin, Clock, Users, Check, AlertCircle, Loader2, ChevronRight, ChevronLeft } from 'lucide-react';
import { format, parseISO, differenceInHours, eachDayOfInterval, isSameDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isWithinInterval } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function BookingPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [slots, setSlots] = useState<ExamSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slotBookings, setSlotBookings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'calendar' | 'years'>('calendar');

  useEffect(() => {
    if (profile && profile.status !== 'active') {
      navigate('/dashboard');
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (!profile?.uid) return;

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppSettings;
        setGlobalSettings(data);
        if (data.exam_start) {
          const start = parseISO(data.exam_start);
          setSelectedDate(start);
          setCurrentMonth(start);
        }
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

  const isRegistrationActive = () => {
    if (loading || !globalSettings) return false;
    return getRegistrationMessage() === null;
  };

  const regMessage = getRegistrationMessage();

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
    const requiredHours = profile.required_hours || globalSettings?.default_required_hours || 16;
    
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
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">حجز فترات المراقبة</h1>
          <p className="text-slate-500 mt-1">اختر من الفترات المتاحة أدناه لإكمال ساعاتك المطلوبة</p>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-2xl w-fit self-end md:self-auto">
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === 'calendar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            عرض التقويم
          </button>
          <button
            onClick={() => setViewMode('years')}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${viewMode === 'years' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            عرض حسب السنوات
          </button>
        </div>
      </header>

      {regMessage && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex items-center gap-4 text-amber-800">
          <AlertCircle size={24} className="shrink-0" />
          <div>
            <p className="font-bold">{regMessage}</p>
            <p className="text-sm opacity-90">يرجى مراجعة الإدارة لأي استفسارات إضافية.</p>
          </div>
        </div>
      )}

      {viewMode === 'calendar' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Calendar Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900">تقويم الامتحانات</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setCurrentMonth(addDays(startOfMonth(currentMonth), -1))}
                    className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"
                  >
                    <ChevronRight size={20} />
                  </button>
                  <button 
                    onClick={() => setCurrentMonth(addDays(endOfMonth(currentMonth), 1))}
                    className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"
                  >
                    <ChevronLeft size={20} />
                  </button>
                </div>
              </div>

              <div className="text-center mb-4 font-bold text-indigo-600">
                {format(currentMonth, 'MMMM yyyy', { locale: ar })}
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'].map(day => (
                  <div key={day} className="text-center text-xs font-bold text-slate-400 py-2">{day}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const monthStart = startOfMonth(currentMonth);
                  const monthEnd = endOfMonth(monthStart);
                  const startDate = startOfWeek(monthStart);
                  const endDate = endOfWeek(monthEnd);
                  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
                  
                  const examInterval = globalSettings?.exam_start && globalSettings?.exam_end 
                    ? { start: parseISO(globalSettings.exam_start), end: parseISO(globalSettings.exam_end) }
                    : null;

                  return calendarDays.map(day => {
                    const isCurrentMonth = isSameDay(startOfMonth(day), monthStart);
                    const isSelected = isSameDay(day, selectedDate);
                    const hasSlots = slots.some(s => isSameDay(parseISO(s.exam_date), day));
                    const isExamPeriod = examInterval ? isWithinInterval(day, examInterval) : false;
                    const isDisabled = !isExamPeriod && isCurrentMonth;

                    return (
                      <button
                        key={day.toString()}
                        onClick={() => !isDisabled && setSelectedDate(day)}
                        disabled={isDisabled}
                        className={`
                          aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-all relative
                          ${!isCurrentMonth ? 'text-slate-200' : 'text-slate-700'}
                          ${isSelected ? 'bg-indigo-600 text-white shadow-md' : 'hover:bg-slate-50'}
                          ${isExamPeriod && isCurrentMonth && !isSelected ? 'bg-indigo-50/50' : ''}
                          ${isDisabled ? 'opacity-20 cursor-not-allowed grayscale' : ''}
                        `}
                      >
                        <span>{format(day, 'd')}</span>
                        {hasSlots && (
                          <div className={`w-1 h-1 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-indigo-600'}`} />
                        )}
                      </button>
                    );
                  });
                })()}
              </div>

              <div className="mt-6 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <div className="w-3 h-3 rounded bg-indigo-50" />
                  <span>فترة الامتحانات المحددة</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <div className="w-3 h-3 rounded-full bg-indigo-600" />
                  <span>أيام تحتوي على فترات مراقبة</span>
                </div>
              </div>
            </div>
          </div>

          {/* Slots List */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">
                فترات يوم {format(selectedDate, 'EEEE d MMMM', { locale: ar })}
              </h2>
              <div className="bg-indigo-50 text-indigo-600 px-4 py-2 rounded-2xl text-sm font-bold">
                {slots.filter(s => isSameDay(parseISO(s.exam_date), selectedDate)).length} فترات متاحة
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {slots
                .filter(s => isSameDay(parseISO(s.exam_date), selectedDate))
                .sort((a, b) => a.start_time.localeCompare(b.start_time))
                .map((slot) => (
                  <SlotCard 
                    key={slot.id}
                    slot={slot}
                    isBooked={bookings.some(b => b.slot_id === slot.id)}
                    currentInvigilators={slotBookings[slot.id] || 0}
                    actionLoading={actionLoading}
                    isRegistrationActive={isRegistrationActive()}
                    onBook={handleBook}
                    onCancel={handleCancel}
                  />
                ))}
              
              {slots.filter(s => isSameDay(parseISO(s.exam_date), selectedDate)).length === 0 && (
                <div className="col-span-full py-12 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                  <CalendarIcon className="mx-auto text-slate-300 mb-4" size={40} />
                  <p className="text-slate-400 text-sm">لا توجد فترات مراقبة في هذا اليوم.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-12">
          {[1, 2, 3, 4, 5].map((year) => {
            const yearSlots = slots.filter(s => s.academic_year === year);
            const yearNames = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];
            
            if (yearSlots.length === 0) return null;

            return (
              <section key={year} className="space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-px flex-1 bg-slate-200" />
                  <h2 className="text-xl font-bold text-slate-400 px-4">السنة {yearNames[year - 1]}</h2>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {yearSlots
                    .sort((a, b) => a.exam_date.localeCompare(b.exam_date) || a.start_time.localeCompare(b.start_time))
                    .map((slot) => (
                      <SlotCard 
                        key={slot.id}
                        slot={slot}
                        isBooked={bookings.some(b => b.slot_id === slot.id)}
                        currentInvigilators={slotBookings[slot.id] || 0}
                        actionLoading={actionLoading}
                        isRegistrationActive={isRegistrationActive()}
                        onBook={handleBook}
                        onCancel={handleCancel}
                        showDate
                      />
                    ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface SlotCardProps {
  slot: ExamSlot;
  isBooked: boolean;
  currentInvigilators: number;
  actionLoading: string | null;
  isRegistrationActive: boolean;
  onBook: (slot: ExamSlot) => void;
  onCancel: (slotId: string) => void;
  showDate?: boolean;
}

function SlotCard({ slot, isBooked, currentInvigilators, actionLoading, isRegistrationActive, onBook, onCancel, showDate }: SlotCardProps) {
  const isFull = currentInvigilators >= slot.required_invigilators;
  const yearNames = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];

  return (
    <div 
      className={`
        bg-white rounded-3xl shadow-sm border p-6 flex flex-col transition-all
        ${isBooked ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-100'}
        ${isFull && !isBooked ? 'opacity-75 grayscale-[0.5]' : ''}
      `}
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex flex-col gap-1">
          <span className={`
            px-3 py-1 rounded-full text-[10px] font-bold w-fit
            ${slot.session_type === 'morning' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}
          `}>
            {slot.session_type === 'morning' ? 'فترة صباحية' : 'فترة مسائية'}
          </span>
          {showDate ? (
            <span className="text-[10px] font-bold text-indigo-600">
              {format(parseISO(slot.exam_date), 'EEEE d MMMM', { locale: ar })}
            </span>
          ) : (
            <span className="text-[10px] font-bold text-slate-400">السنة {yearNames[slot.academic_year - 1]}</span>
          )}
        </div>
        {isBooked && (
          <span className="flex items-center gap-1 text-emerald-600 text-xs font-bold">
            <Check size={14} />
            تم الحجز
          </span>
        )}
      </div>

      <h3 className="text-lg font-bold text-slate-900 mb-4 line-clamp-2 h-14">{slot.course_name}</h3>

      <div className="space-y-3 mb-6 flex-1">
        <div className="flex items-center gap-3 text-slate-600">
          <Clock size={16} className="text-slate-400" />
          <span className="text-xs">{slot.start_time} - {slot.end_time}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-600">
          <MapPin size={16} className="text-slate-400" />
          <span className="text-xs">{slot.location || 'غير محدد'}</span>
        </div>
        <div className="flex items-center gap-3 text-slate-600">
          <Users size={16} className="text-slate-400" />
          <span className="text-xs">
            {currentInvigilators} / {slot.required_invigilators} مراقبين
            {isFull && !isBooked && (
              <span className="mr-2 text-red-500 font-bold">(اكتمل)</span>
            )}
          </span>
        </div>
      </div>

      <div className="mt-auto">
        {isBooked ? (
          <button
            onClick={() => onCancel(slot.id)}
            disabled={actionLoading === slot.id || !isRegistrationActive}
            className="w-full py-2.5 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            {actionLoading === slot.id ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'إلغاء الحجز'}
          </button>
        ) : (
          <button
            onClick={() => onBook(slot)}
            disabled={isFull || actionLoading === slot.id || !isRegistrationActive}
            className={`
              w-full py-2.5 rounded-xl text-sm font-bold transition-colors disabled:opacity-50
              ${isFull || !isRegistrationActive ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}
            `}
          >
            {actionLoading === slot.id ? (
              <Loader2 className="animate-spin mx-auto" size={18} />
            ) : !isRegistrationActive ? (
              'التسجيل مغلق'
            ) : isFull ? (
              'اكتمل العدد'
            ) : (
              'حجز الآن'
            )}
          </button>
        )}
      </div>
    </div>
  );
}
