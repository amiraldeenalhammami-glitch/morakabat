import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, doc, updateDoc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, Booking, AppSettings } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Search, Mail, Phone, IdCard, Clock, ExternalLink, Loader2, Edit2, Download, Trash2, ChevronDown, CheckCircle2, XCircle, MessageSquare } from 'lucide-react';

export default function AdminStudents() {
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingHours, setEditingHours] = useState<{ uid: string, hours: number } | null>(null);
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [updatingBooking, setUpdatingBooking] = useState<string | null>(null);

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
    const unsubscribeStudents = onSnapshot(query(collection(db, 'users'), where('role', '==', 'student')), (snapshot) => {
      setStudents(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    const unsubscribeBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'bookings');
    });

    return () => {
      unsubscribeStudents();
      unsubscribeBookings();
    };
  }, []);

  const handleDownloadCSV = () => {
    const headers = ['الاسم', 'الرقم الجامعي', 'القسم', 'البريد', 'الهاتف', 'الساعات المنجزة', 'الساعات المطلوبة'];
    const rows = students.map(s => {
      const hours = bookings
        .filter(b => b.student_id === s.uid)
        .reduce((acc, curr) => acc + curr.booked_hours, 0);
      return [
        s.name,
        s.university_id || '',
        s.department || '',
        s.email,
        s.phone || '',
        hours,
        s.required_hours || globalSettings?.default_required_hours || 16
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'students_progress.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAttendanceReport = () => {
    const headers = ['اسم الطالب', 'الرقم الجامعي', 'المادة', 'التاريخ', 'عدد الساعات', 'الالتزام', 'الملاحظات'];
    const rows: any[] = [];

    students.forEach(s => {
      const studentBookings = bookings.filter(b => b.student_id === s.uid);
      studentBookings.forEach(b => {
        rows.push([
          s.name,
          s.university_id || '',
          b.course_name,
          b.exam_date,
          b.booked_hours,
          b.attended ? 'ملتزم' : 'غير ملتزم',
          b.admin_notes || ''
        ]);
      });
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'attendance_report.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteStudent = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      // Also delete their bookings? Usually yes to keep DB clean
      const studentBookings = bookings.filter(b => b.student_id === uid);
      for (const b of studentBookings) {
        await deleteDoc(doc(db, 'bookings', b.id));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
    }
  };

  const handleToggleAttendance = async (bookingId: string, currentStatus: boolean) => {
    setUpdatingBooking(bookingId);
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        attended: !currentStatus
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${bookingId}`);
    } finally {
      setUpdatingBooking(null);
    }
  };

  const handleUpdateNotes = async (bookingId: string, notes: string) => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        admin_notes: notes
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  const handleUpdateHours = async () => {
    if (!editingHours) return;
    try {
      await updateDoc(doc(db, 'users', editingHours.uid), {
        required_hours: editingHours.hours
      });
      setEditingHours(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${editingHours.uid}`);
    }
  };

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.university_id?.includes(searchTerm)
  );

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>;
  }

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">قائمة الطلاب</h1>
          <p className="text-slate-500 mt-1">عرض بيانات الطلاب ومتابعة ساعات المراقبة</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDownloadAttendanceReport}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <Download size={20} />
            <span>تصدير تقرير المراقبات</span>
          </button>
          <button
            onClick={handleDownloadCSV}
            className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2"
          >
            <Download size={20} />
            <span>تصدير البيانات</span>
          </button>
        </div>
      </header>

      <div className="relative max-w-md">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="بحث بالاسم أو الرقم الجامعي..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pr-12 pl-4 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
        />
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-right">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-sm">
              <th className="px-6 py-4 font-medium">الطالب</th>
              <th className="px-6 py-4 font-medium">البيانات الجامعية</th>
              <th className="px-6 py-4 font-medium">التواصل</th>
              <th className="px-6 py-4 font-medium">الساعات (منجز / مطلوب)</th>
              <th className="px-6 py-4 font-medium">المستندات</th>
              <th className="px-6 py-4 font-medium">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStudents.map((student) => {
              const studentBookings = bookings.filter(b => b.student_id === student.uid);
              const studentHours = studentBookings.reduce((acc, curr) => acc + curr.booked_hours, 0);
              const required = student.required_hours || globalSettings?.default_required_hours || 16;
              const isExpanded = expandedStudent === student.uid;

              return (
                <React.Fragment key={student.uid}>
                  <tr className={`hover:bg-slate-50 transition-colors ${isExpanded ? 'bg-slate-50' : ''}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setExpandedStudent(isExpanded ? null : student.uid)}
                          className={`p-1 rounded-lg transition-transform ${isExpanded ? 'rotate-180 bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-100'}`}
                        >
                          <ChevronDown size={20} />
                        </button>
                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold overflow-hidden">
                          {student.photo ? <img src={student.photo} className="w-full h-full object-cover" /> : student.name.charAt(0)}
                        </div>
                        <span className="font-bold text-slate-900">{student.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-sm text-slate-600">
                        <span className="flex items-center gap-1"><IdCard size={14} /> {student.university_id}</span>
                        <span className="text-xs text-slate-400">{student.department}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col text-sm text-slate-600">
                        <span className="flex items-center gap-1"><Mail size={14} /> {student.email}</span>
                        <span className="flex items-center gap-1"><Phone size={14} /> {student.phone}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">{studentHours} / {required}</span>
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-indigo-600" style={{ width: `${Math.min(100, (studentHours/required)*100)}%` }} />
                          </div>
                        </div>
                        <button 
                          onClick={() => setEditingHours({ uid: student.uid, hours: required })}
                          className="p-1 text-slate-400 hover:text-indigo-600"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {student.student_card_image && (
                        <a 
                          href={student.student_card_image} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline text-xs flex items-center gap-1"
                        >
                          البطاقة الجامعية <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => handleDeleteStudent(student.uid)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                        title="حذف الطالب نهائياً"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                  
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 bg-slate-50/50">
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-200">
                          <div className="p-4 border-b border-slate-50 bg-slate-50/30">
                            <h4 className="font-bold text-slate-700 text-sm">سجل فترات المراقبة والالتزام</h4>
                          </div>
                          <div className="divide-y divide-slate-50">
                            {studentBookings.length > 0 ? (
                              studentBookings.map((booking) => (
                                <div key={booking.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                                  <div className="flex items-center gap-4 min-w-[200px]">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${booking.attended ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                                      {booking.attended ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                                    </div>
                                    <div>
                                      <p className="font-bold text-slate-900">{booking.course_name}</p>
                                      <p className="text-xs text-slate-500">{booking.exam_date} • {booking.booked_hours} ساعة</p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-6 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-slate-500">حالة الالتزام:</span>
                                      <button
                                        onClick={() => handleToggleAttendance(booking.id, !!booking.attended)}
                                        disabled={updatingBooking === booking.id}
                                        className={`
                                          flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all
                                          ${booking.attended 
                                            ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' 
                                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}
                                        `}
                                      >
                                        {updatingBooking === booking.id ? (
                                          <Loader2 size={14} className="animate-spin" />
                                        ) : booking.attended ? (
                                          <><CheckCircle2 size={14} /> ملتزم</>
                                        ) : (
                                          <><XCircle size={14} /> غير محدد</>
                                        )}
                                      </button>
                                    </div>
                                    
                                    <div className="flex-1 flex items-center gap-2">
                                      <MessageSquare size={14} className="text-slate-400" />
                                      <input 
                                        type="text"
                                        placeholder="إضافة ملاحظات..."
                                        defaultValue={booking.admin_notes || ''}
                                        onBlur={(e) => handleUpdateNotes(booking.id, e.target.value)}
                                        className="flex-1 text-xs bg-slate-50 border-none rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="p-8 text-center text-slate-400 text-sm italic">
                                لا توجد حجوزات مسجلة لهذا الطالب بعد.
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Edit Hours Modal */}
      {editingHours && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4">تعديل الساعات المطلوبة</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">عدد الساعات</label>
                <input
                  type="number"
                  value={editingHours.hours}
                  onChange={(e) => setEditingHours({ ...editingHours, hours: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={handleUpdateHours} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">تحديث</button>
                <button onClick={() => setEditingHours(null)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200">إلغاء</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
