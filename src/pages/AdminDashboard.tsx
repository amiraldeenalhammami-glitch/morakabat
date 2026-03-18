import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ExamSlot, Booking, UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Users, Calendar, Clock, CheckCircle, ArrowRight, Download } from 'lucide-react';
import { Link } from 'react-router-dom';
import { usePWA } from '../hooks/usePWA';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const [slots, setSlots] = useState<ExamSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { canInstall, installApp } = usePWA();

  useEffect(() => {
    if (!profile?.uid) return;

    const unsubscribeSlots = onSnapshot(collection(db, 'exam_slots'), (snapshot) => {
      setSlots(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamSlot)));
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

    return () => {
      unsubscribeSlots();
      unsubscribeBookings();
      unsubscribeStudents();
    };
  }, [profile?.uid]);

  const totalRequiredInvigilators = slots.reduce((acc, curr) => acc + curr.required_invigilators, 0);
  const studentIds = new Set(students.map(s => s.uid));
  const studentBookings = bookings.filter(b => studentIds.has(b.student_id));
  const totalBookedSlots = studentBookings.length;
  const coveragePercentage = totalRequiredInvigilators > 0 
    ? Math.round((totalBookedSlots / totalRequiredInvigilators) * 100) 
    : 0;

  if (loading) {
    return <div className="animate-pulse space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-200 rounded-3xl"></div>)}
      </div>
      <div className="h-96 bg-slate-200 rounded-3xl"></div>
    </div>;
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">لوحة تحكم المدير</h1>
          <p className="text-slate-500 mt-1">نظرة عامة على حالة المراقبة والطلاب</p>
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
          <p className="text-sm text-slate-500">إجمالي الطلاب النشطين</p>
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
          <p className="text-sm text-slate-500">الحجوزات المؤكدة</p>
          <p className="text-3xl font-bold text-slate-900">{totalBookedSlots}</p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl w-fit mb-4">
            <CheckCircle size={24} />
          </div>
          <p className="text-sm text-slate-500">نسبة التغطية</p>
          <div className="flex items-end gap-2">
            <p className="text-3xl font-bold text-slate-900">{coveragePercentage}%</p>
            <div className="w-16 h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden">
              <div className="h-full bg-rose-500" style={{ width: `${coveragePercentage}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-indigo-600 rounded-3xl p-8 text-white flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h2 className="text-2xl font-bold">إجراءات سريعة</h2>
          <p className="text-indigo-100 mt-1">إدارة النظام والطلاب والبرنامج الامتحاني من مكان واحد</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/admin/slots" className="px-6 py-3 bg-white text-indigo-600 rounded-2xl font-bold hover:bg-indigo-50 transition-colors">
            إدارة البرنامج
          </Link>
          <Link to="/admin/students" className="px-6 py-3 bg-indigo-500 text-white rounded-2xl font-bold hover:bg-indigo-400 transition-colors">
            إدارة الطلاب
          </Link>
          <Link to="/admin/settings" className="px-6 py-3 bg-indigo-700 text-white rounded-2xl font-bold hover:bg-indigo-800 transition-colors">
            الإعدادات العامة
          </Link>
        </div>
      </div>

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
            <h3 className="font-bold text-slate-900">إنجاز الطلاب</h3>
            <Link to="/admin/students" className="text-indigo-600 text-sm font-bold flex items-center gap-1">
              عرض الكل <ArrowRight size={16} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {students.slice(0, 5).map((student) => {
              const studentHours = studentBookings
                .filter(b => b.student_id === student.uid)
                .reduce((acc, curr) => acc + curr.booked_hours, 0);
              const required = student.required_hours || 16;
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
              <div className="p-12 text-center text-slate-500">لا يوجد طلاب مسجلين بعد.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
