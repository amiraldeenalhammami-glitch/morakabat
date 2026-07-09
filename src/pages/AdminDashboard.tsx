import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, getDocs, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ExamSlot, Booking, UserProfile, AppSettings } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Users, Calendar, Clock, CheckCircle, ArrowRight, Download, X, Sparkles, ShieldCheck, AlertCircle, UserMinus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePWA } from '../hooks/usePWA';
import { getSlotRooms, getObserverRoom } from '../utils/roomUtils';

export default function AdminDashboard() {
  const { user, profile } = useAuth();
  const [slots, setSlots] = useState<ExamSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const { canInstall, installApp } = usePWA();
  const [activeReportTab, setActiveReportTab] = useState<'completed' | 'partial' | 'inactive' | null>(null);

  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribeSlots = onSnapshot(collection(db, 'exam_slots'), (snapshot) => {
      const activeSlots = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as ExamSlot))
        .filter(s => !s.isDeleted);
      setSlots(activeSlots);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'exam_slots');
    });

    const unsubscribeBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'bookings');
    });

    const unsubscribeStudents = onSnapshot(query(collection(db, 'users')), (snapshot) => {
      setStudents(snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(u => u.role === 'student' && u.email !== "amiraldeenalhammami@ab3adacademy.com")
      );
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setGlobalSettings(docSnap.data() as AppSettings);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });

    return () => {
      unsubscribeSlots();
      unsubscribeBookings();
      unsubscribeStudents();
      unsubscribeSettings();
    };
  }, [user?.uid]);

  const studentIds = new Set(students.map(s => s.uid));
  const studentBookings = bookings.filter(b => studentIds.has(b.student_id) && slots.some(s => s.id === b.slot_id));
  const totalBookedSlots = studentBookings.length;

  // ==================== FIRST: ROOMS & ROOMS COVERAGE (Part 1) ====================
  let totalRoomsCount = 0;
  let coveredRoomsCount = 0;

  slots.forEach(slot => {
    const rooms = getSlotRooms(slot);
    totalRoomsCount += rooms.length;

    if (rooms.length > 0) {
      const bookingsForSlot = bookings.filter(b => b.slot_id === slot.id);
      const limit = slot.observers_per_room !== undefined ? Number(slot.observers_per_room) : 3;

      const roomsState = rooms.map(name => ({
        name,
        hasSecretary: false,
        hasEmployee: false,
        assignedCount: 0
      }));

      const sortedBookings = [...bookingsForSlot].sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return a.id.localeCompare(b.id);
      });

      sortedBookings.forEach(b => {
        const type = b.observer_type || 'طالب دراسات';
        let assigned = false;

        if (type === 'أمين قاعة') {
          const targetRoom = roomsState.find(r => !r.hasSecretary && r.assignedCount < limit);
          if (targetRoom) {
            targetRoom.hasSecretary = true;
            targetRoom.assignedCount++;
            assigned = true;
          }
        } else if (type === 'موظف') {
          const targetRoom = roomsState.find(r => !r.hasEmployee && r.assignedCount < limit);
          if (targetRoom) {
            targetRoom.hasEmployee = true;
            targetRoom.assignedCount++;
            assigned = true;
          }
        }

        if (!assigned) {
          const targetRoom = roomsState.find(r => r.assignedCount < limit);
          if (targetRoom) {
            targetRoom.assignedCount++;
          }
        }
      });

      const coveredInSlot = roomsState.filter(r => r.assignedCount >= limit).length;
      coveredRoomsCount += coveredInSlot;
    }
  });

  const roomsCoveragePercentage = totalRoomsCount > 0
    ? Math.round((coveredRoomsCount / totalRoomsCount) * 100)
    : 0;

  // ==================== SECOND: PROGRAM HOURS COVERAGE (Part 2) ====================
  let totalSlotHours = 0;
  slots.forEach(s => {
    try {
      const roomsCount = getSlotRooms(s).length;
      const observersPerRoom = s.observers_per_room !== undefined ? Number(s.observers_per_room) : 3;
      const durationHours = s.duration_hours !== undefined 
        ? Number(s.duration_hours) 
        : (() => {
            const start = s.start_time.split(':');
            const end = s.end_time.split(':');
            const startMin = parseInt(start[0]) * 60 + parseInt(start[1]);
            const endMin = parseInt(end[0]) * 60 + parseInt(end[1]);
            return Math.max(1, Math.round((endMin - startMin) / 60));
          })();
      totalSlotHours += (roomsCount * observersPerRoom * durationHours);
    } catch (e) {
      totalSlotHours += (s.required_invigilators * 2);
    }
  });

  const finalActiveStudents = students.filter(s => s.status === 'active');
  const finalActiveStudentIds = new Set(finalActiveStudents.map(s => s.uid));
  const activeObserversCount = finalActiveStudents.length;

  const activeSlotIds = new Set(slots.map(s => s.id));
  const totalObserverHours = bookings
    .filter(b => finalActiveStudentIds.has(b.student_id) && activeSlotIds.has(b.slot_id))
    .reduce((sum, b) => {
      const hours = b.booked_hours !== undefined ? Math.abs(Number(b.booked_hours)) : 2;
      return sum + (isNaN(hours) ? 2 : hours);
    }, 0);

  const averageHours = activeObserversCount > 0 ? parseFloat((totalSlotHours / activeObserversCount).toFixed(2)) : 0;

  const programHoursCoveragePercentage = totalSlotHours > 0
    ? Math.round((totalObserverHours / totalSlotHours) * 100)
    : 0;

  // ==================== THIRD: PROCTORS CATEGORIZATION (Part 3) ====================
  const fullyCoveredProctors: { profile: UserProfile; bookedHours: number; bookings: Booking[] }[] = [];
  const partiallyCoveredProctors: { profile: UserProfile; bookedHours: number; remainingHours: number; bookings: Booking[] }[] = [];
  const inactiveProctors: UserProfile[] = [];

  finalActiveStudents.forEach(student => {
    const studentHours = bookings
      .filter(b => b.student_id === student.uid && activeSlotIds.has(b.slot_id))
      .reduce((acc, curr) => {
        const h = curr.booked_hours !== undefined ? Math.abs(Number(curr.booked_hours)) : 2;
        return acc + (isNaN(h) ? 2 : h);
      }, 0);

    const required = student.required_hours_mode === 'manual' 
      ? (student.required_hours ?? 16) 
      : (globalSettings?.default_required_hours ?? 16);

    const proctorBookings = bookings.filter(b => b.student_id === student.uid && activeSlotIds.has(b.slot_id));

    if (studentHours === 0) {
      inactiveProctors.push(student);
    } else if (studentHours >= required) {
      fullyCoveredProctors.push({
        profile: student,
        bookedHours: studentHours,
        bookings: proctorBookings
      });
    } else if (studentHours > 0 && studentHours < required) {
      partiallyCoveredProctors.push({
        profile: student,
        bookedHours: studentHours,
        remainingHours: required - studentHours,
        bookings: proctorBookings
      });
    }
  });

  // Sort lists alphabetically by Arabic name (Part 3 Rule)
  fullyCoveredProctors.sort((a, b) => a.profile.name.localeCompare(b.profile.name, 'ar'));
  partiallyCoveredProctors.sort((a, b) => a.profile.name.localeCompare(b.profile.name, 'ar'));
  inactiveProctors.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  // Helper to resolve a booking's assigned room
  const getBookingRoom = (booking: Booking, slot: ExamSlot) => {
    if (!slot) return 'القاعة العامة';
    const bookingsForSlot = bookings.filter(b => b.slot_id === slot.id);
    return getObserverRoom(slot, booking, bookingsForSlot);
  };

  // ==================== FOURTH: EXPORT FUNCTION (Part 4) ====================
  const handleExportCSV = (type: 'completed' | 'partial' | 'inactive') => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = '';

    if (type === 'completed') {
      filename = 'المراقبون_المكتملون.csv';
      headers = ['اسم المراقب', 'البريد الإلكتروني', 'رقم الهاتف', 'المادة المحجوزة', 'تاريخ المادة', 'القاعة الامتحانية'];
      fullyCoveredProctors.forEach(p => {
        if (p.bookings.length === 0) {
          rows.push([
            p.profile.name,
            p.profile.email,
            p.profile.phone || 'غير حدد',
            'لا يوجد مواد',
            '-',
            '-'
          ]);
        } else {
          p.bookings.forEach(b => {
            const slot = slots.find(s => s.id === b.slot_id);
            const room = slot ? getBookingRoom(b, slot) : 'القاعة العامة';
            rows.push([
              p.profile.name,
              p.profile.email,
              p.profile.phone || 'غير محدد',
              b.course_name,
              b.exam_date,
              room
            ]);
          });
        }
      });
    } else if (type === 'partial') {
      filename = 'المراقبون_غير_المكتملين.csv';
      headers = ['اسم المراقب', 'البريد الإلكتروني', 'رقم الهاتف', 'الساعات المطلوبة', 'الساعات المحجوزة', 'الساعات المتبقية', 'المواد المحجوزة'];
      partiallyCoveredProctors.forEach(p => {
        const required = p.profile.required_hours_mode === 'manual' 
          ? (p.profile.required_hours ?? 16) 
          : (globalSettings?.default_required_hours ?? 16);
        const bookedNames = p.bookings.map(b => b.course_name).join(' | ') || 'لا يوجد';
        rows.push([
          p.profile.name,
          p.profile.email,
          p.profile.phone || 'غير محدد',
          required.toString(),
          p.bookedHours.toString(),
          p.remainingHours.toString(),
          bookedNames
        ]);
      });
    } else if (type === 'inactive') {
      filename = 'المراقبون_غير_النشطين.csv';
      headers = ['اسم المراقب', 'البريد الإلكتروني', 'رقم الهاتف', 'القسم/التخصص', 'الرقم الجامعي'];
      inactiveProctors.forEach(p => {
        rows.push([
          p.name,
          p.email,
          p.phone || 'غير محدد',
          p.department || 'غير محدد',
          p.university_id || 'غير محدد'
        ]);
      });
    }

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return <div className="animate-pulse space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-200 rounded-3xl"></div>)}
      </div>
      <div className="h-96 bg-slate-200 rounded-3xl"></div>
    </div>;
  }

  return (
    <div className="space-y-8 text-right" dir="rtl">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">لوحة تحكم المدير</h1>
          <p className="text-slate-500 mt-1">نظرة عامة على حالة المراقبة والمراقبين</p>
        </div>
        {canInstall && (
          <button
            onClick={installApp}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
          >
            <Download size={20} />
            <span>تنزيل التطبيق</span>
          </button>
        )}
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl w-fit mb-4">
            <Users size={24} />
          </div>
          <p className="text-sm text-slate-500">إجمالي المراقبين النشطين</p>
          <p className="text-3xl font-bold text-slate-900">{students.filter(s => s.status === 'active').length}</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl w-fit mb-4">
            <Calendar size={24} />
          </div>
          <p className="text-sm text-slate-500">فترات الامتحانات</p>
          <p className="text-3xl font-bold text-slate-900">{slots.length}</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl w-fit mb-4">
            <Clock size={24} />
          </div>
          <p className="text-sm text-slate-500 font-bold text-slate-500">القاعات المغطاة</p>
          <p className="text-3xl font-bold text-slate-900">{coveredRoomsCount} / {totalRoomsCount}</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mb-4">
            <CheckCircle size={24} />
          </div>
          <p className="text-sm text-slate-500 font-bold text-slate-500 font-bold text-slate-500">نسبة تغطية القاعات</p>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-900">{roomsCoveragePercentage}%</p>
            <div className="w-16 h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden">
              <div className="h-full bg-rose-500" style={{ width: `${roomsCoveragePercentage}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* ==================== SECOND: PROGRAM HOURS COVERAGE (Part 2) ==================== */}
      <div className="bg-gradient-to-r from-indigo-50 via-slate-50 to-amber-50/40 p-8 rounded-3xl border border-indigo-100/60 shadow-xs animate-in fade-in duration-300">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 text-indigo-700 rounded-2xl">
              <Clock size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">برنامج ونصيب الساعات الامتحانية</h3>
              <p className="text-sm text-slate-500 mt-1">نظرة تحليلية شاملة لنصاب وتغطية الساعات الكلية في البرنامج الامتحاني</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-white/90 backdrop-blur-xs px-5 py-3 rounded-2xl border border-indigo-100/40 shadow-xs">
            <div className="text-right">
              <p className="text-xs text-slate-400 font-bold">نسبة إشغال البرنامج بالساعات</p>
              <p className="text-2xl font-black text-indigo-600">{programHoursCoveragePercentage}%</p>
            </div>
            <div className="w-24 h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${programHoursCoveragePercentage}%` }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-100/85 flex flex-col items-center text-center shadow-xs">
            <span className="text-xs text-slate-400 font-bold">الساعات الكلية المطلوبة للبرنامج</span>
            <span className="text-2xl font-black text-indigo-600 mt-2">{totalSlotHours} ساعة</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100/85 flex flex-col items-center text-center shadow-xs">
            <span className="text-xs text-slate-400 font-bold">الساعات الكلية المنجزة (الحجوزات)</span>
            <span className="text-2xl font-black text-emerald-600 mt-2">{totalObserverHours} ساعة</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100/85 flex flex-col items-center text-center shadow-xs">
            <span className="text-xs text-slate-400 font-bold">عدد المراقبين الفعّالين</span>
            <span className="text-2xl font-black text-slate-800 mt-2">{activeObserversCount} مراقب</span>
          </div>
          <div className="bg-white p-5 rounded-2xl border border-slate-100/85 flex flex-col items-center text-center shadow-xs">
            <span className="text-xs text-slate-400 font-bold">متوسط الساعات لكل مراقب فعّال</span>
            <span className="text-2xl font-black text-amber-600 mt-2">{averageHours} ساعة/مراقب</span>
          </div>
        </div>
      </div>



      {/* ==================== THIRD: PROCTORS ANALYTICS & REPORTS (Part 3) ==================== */}
      <div className="space-y-4">
        <div className="border-r-4 border-indigo-600 pr-3">
          <h2 className="text-2xl font-bold text-slate-950">إحصائيات وتقارير المراقبين</h2>
          <p className="text-sm text-slate-500 mt-0.5">اضغط على أي بطاقة لعرض تفاصيل الجدول وتصديرها</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Completed */}
          <div 
            onClick={() => setActiveReportTab('completed')}
            className="bg-white p-6 rounded-3xl border border-emerald-100 shadow-xs hover:shadow-md hover:border-emerald-200 transition-all cursor-pointer flex flex-col justify-between group active:scale-98"
          >
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
                  <ShieldCheck size={24} />
                </div>
                <span className="text-xs bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-full font-bold">مكتمل النصاب</span>
              </div>
              <p className="text-sm text-slate-500 font-bold">المراقبون المكتملون</p>
              <p className="text-xs text-slate-400 mt-1">الذين غطوا وحجزوا كامل نصابهم من الساعات</p>
            </div>
            <p className="text-5xl font-black text-emerald-600 mt-6 group-hover:scale-105 transition-transform origin-right">{fullyCoveredProctors.length}</p>
          </div>

          {/* Card 2: Partially */}
          <div 
            onClick={() => setActiveReportTab('partial')}
            className="bg-white p-6 rounded-3xl border border-amber-100 shadow-xs hover:shadow-md hover:border-amber-200 transition-all cursor-pointer flex flex-col justify-between group active:scale-98"
          >
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                  <AlertCircle size={24} />
                </div>
                <span className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full font-bold">لديهم نقص</span>
              </div>
              <p className="text-sm text-slate-500 font-bold">المراقبون غير المكتملين</p>
              <p className="text-xs text-slate-400 mt-1">الذين لديهم حجز نشط ولكن ساعاتهم أقل من النصاب</p>
            </div>
            <p className="text-5xl font-black text-amber-600 mt-6 group-hover:scale-105 transition-transform origin-right">{partiallyCoveredProctors.length}</p>
          </div>

          {/* Card 3: Inactive */}
          <div 
            onClick={() => setActiveReportTab('inactive')}
            className="bg-white p-6 rounded-3xl border border-rose-100 shadow-xs hover:shadow-md hover:border-rose-200 transition-all cursor-pointer flex flex-col justify-between group active:scale-98"
          >
            <div>
              <div className="flex justify-between items-center mb-4">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                  <UserMinus size={24} />
                </div>
                <span className="text-xs bg-rose-50 text-rose-700 px-3 py-1.5 rounded-full font-bold">غير نشط</span>
              </div>
              <p className="text-sm text-slate-500 font-bold">المراقبون غير النشطين</p>
              <p className="text-xs text-slate-400 mt-1">الذين لم يسجلوا أي ساعات أو مواد في البرنامج أبداً</p>
            </div>
            <p className="text-5xl font-black text-rose-600 mt-6 group-hover:scale-105 transition-transform origin-right">{inactiveProctors.length}</p>
          </div>
        </div>
      </div>

      {/* ==================== INTERACTIVE REPORTS POPUPS (Part 3 & 4) ==================== */}
      {activeReportTab && (
        <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity" onClick={() => setActiveReportTab(null)} />
          
          <div className="relative bg-white rounded-3xl max-w-6xl w-full max-h-[85vh] overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {activeReportTab === 'completed' && 'تقرير المراقبين المكتملين'}
                  {activeReportTab === 'partial' && 'تقرير المراقبين غير المكتملين (لديهم نقص)'}
                  {activeReportTab === 'inactive' && 'تقرير المراقبين غير النشطين'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {activeReportTab === 'completed' && `عرض المراقبين الذين حجزوا ساعات نصابهم بالكامل (العدد: ${fullyCoveredProctors.length})`}
                  {activeReportTab === 'partial' && `عرض المراقبين الذين لديهم نقص في الساعات المطلوبة (العدد: ${partiallyCoveredProctors.length})`}
                  {activeReportTab === 'inactive' && `عرض المراقبين الذين لم يسجلوا أي حجوزات بعد (العدد: ${inactiveProctors.length})`}
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleExportCSV(activeReportTab)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors shadow-xs"
                >
                  <Download size={16} />
                  <span>تصدير هذا الجدول</span>
                </button>
                <button
                  onClick={() => setActiveReportTab(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Table Content */}
            <div className="overflow-y-auto p-6 flex-1">
              {activeReportTab === 'completed' && (
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-100 text-right">
                    <thead className="bg-slate-50/70">
                      <tr>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">اسم المراقب</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">البريد الإلكتروني</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">رقم الهاتف</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">المواد المحجوزة</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">تاريخ المادة</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">موقع القاعة</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {fullyCoveredProctors.map(({ profile: p, bookings: pb }) => (
                        <tr key={p.uid} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">{p.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-left" dir="ltr">{p.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{p.phone || '-'}</td>
                          <td className="px-6 py-4 text-sm text-slate-800">
                            <div className="space-y-1">
                              {pb.map(b => (
                                <div key={b.id} className="font-semibold">{b.course_name}</div>
                              ))}
                              {pb.length === 0 && <span className="text-slate-400">لا يوجد مواد</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            <div className="space-y-1">
                              {pb.map(b => (
                                <div key={b.id}>{b.exam_date}</div>
                              ))}
                              {pb.length === 0 && <span>-</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            <div className="space-y-1">
                              {pb.map(b => {
                                const slot = slots.find(s => s.id === b.slot_id);
                                const room = slot ? getBookingRoom(b, slot) : 'القاعة العامة';
                                return (
                                  <div key={b.id} className="text-indigo-600 font-bold">{room}</div>
                                );
                              })}
                              {pb.length === 0 && <span>-</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {fullyCoveredProctors.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400 font-medium">لا يوجد مراقبين مكتملين حتى الآن.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeReportTab === 'partial' && (
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-100 text-right">
                    <thead className="bg-slate-50/70">
                      <tr>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">اسم المراقب</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">الساعات المطلوبة</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">الساعات المحجوزة</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">الساعات الناقصة</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">المواد المحجوزة الحالية</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {partiallyCoveredProctors.map(({ profile: p, bookedHours, remainingHours, bookings: pb }) => {
                        const required = p.required_hours_mode === 'manual' 
                          ? (p.required_hours ?? 16) 
                          : (globalSettings?.default_required_hours ?? 16);
                        return (
                          <tr key={p.uid} className="hover:bg-slate-50/40 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">{p.name}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{required} ساعة</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-emerald-600 font-bold">{bookedHours} ساعة</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-rose-600 font-black">{remainingHours} ساعة ناقصة</td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                              <div className="flex flex-wrap gap-1.5 max-w-md">
                                {pb.map(b => (
                                  <span key={b.id} className="inline-block px-2.5 py-1 bg-slate-100 text-slate-700 font-bold text-xs rounded-lg border border-slate-200">
                                    {b.course_name} ({b.booked_hours}س)
                                  </span>
                                ))}
                                {pb.length === 0 && <span className="text-slate-400">لا يوجد مواد</span>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {partiallyCoveredProctors.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium">لا يوجد مراقبين غير مكتملين.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {activeReportTab === 'inactive' && (
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-100 text-right">
                    <thead className="bg-slate-50/70">
                      <tr>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">اسم المراقب</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">البريد الإلكتروني</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">رقم الهاتف</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">القسم/التخصص</th>
                        <th className="px-6 py-3 text-xs font-bold text-slate-500 tracking-wider">الرقم الجامعي</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {inactiveProctors.map((p) => (
                        <tr key={p.uid} className="hover:bg-slate-50/40 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-900">{p.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 text-left" dir="ltr">{p.email}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{p.phone || 'غير محدد'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{p.department || 'غير محدد'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{p.university_id || 'غير محدد'}</td>
                        </tr>
                      ))}
                      {inactiveProctors.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 font-medium">لا يوجد مراقبين غير نشطين.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setActiveReportTab(null)}
                className="px-5 py-2.5 bg-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-300 transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Bookings List */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-900">آخر الحجوزات</h3>
            <Link to="/admin/slots" className="text-indigo-600 text-sm font-bold flex items-center gap-1">
              عرض الكل <ArrowRight size={16} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {studentBookings.slice(0, 5).map((booking) => (
              <div key={booking.id} className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold">
                  {booking.student_name.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">{booking.student_name}</p>
                  <p className="text-xs text-slate-500">{booking.course_name} - {booking.exam_date}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-indigo-600">{booking.booked_hours} ساعة</p>
                </div>
              </div>
            ))}
            {studentBookings.length === 0 && (
              <div className="p-12 text-center text-slate-500">لا توجد حجوزات بعد.</div>
            )}
          </div>
        </div>

        {/* Student Progress Summary */}
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-bold text-slate-900">إنجاز المراقبين</h3>
            <Link to="/admin/students" className="text-indigo-600 text-sm font-bold flex items-center gap-1">
              عرض الكل <ArrowRight size={16} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {[...students].sort((a, b) => a.name.localeCompare(b.name, 'ar')).slice(0, 5).map((student) => {
              const studentHours = studentBookings
                .filter(b => b.student_id === student.uid)
                .reduce((acc, curr) => acc + curr.booked_hours, 0);
              const required = student.required_hours_mode === 'manual' 
                ? (student.required_hours ?? 16) 
                : (globalSettings?.default_required_hours ?? 16);
              const progress = Math.min(100, (studentHours / required) * 100);

              return (
                <div key={student.uid} className="p-4 space-y-2">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-bold text-slate-900">{student.name}</p>
                    <p className="text-xs text-slate-500">{studentHours} / {required} ساعة</p>
                  </div>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-indigo-600" 
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {students.length === 0 && (
              <div className="p-12 text-center text-slate-500">لا يوجد مراقبون مسجلون بعد.</div>
            )}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-indigo-600 rounded-3xl p-8 text-white flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-2xl font-bold">إجراءات سريعة</h2>
          <p className="text-indigo-100 mt-1">إدارة النظام والمراقبين والبرنامج الامتحاني من مكان واحد</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/slots" className="px-6 py-3 bg-white text-indigo-600 rounded-2xl font-bold hover:bg-indigo-50 transition-colors">
            إدارة البرنامج
          </Link>
          <Link to="/admin/students" className="px-6 py-3 bg-indigo-500 text-white rounded-2xl font-bold hover:bg-indigo-400 transition-colors">
            إدارة المراقبين
          </Link>
          <Link to="/admin/settings" className="px-6 py-3 bg-indigo-700 text-white rounded-2xl font-bold hover:bg-indigo-800 transition-colors">
            الإعدادات العامة
          </Link>
        </div>
      </div>
    </div>
  );
}
