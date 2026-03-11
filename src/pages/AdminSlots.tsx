import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { ExamSlot, Booking } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Plus, Trash2, Edit2, X, Check, Calendar, Clock, MapPin, Users, Loader2, User, Download } from 'lucide-react';

export default function AdminSlots() {
  const [slots, setSlots] = useState<ExamSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ExamSlot | null>(null);
  const [expandedYear, setExpandedYear] = useState<number | null>(1);
  const [formData, setFormData] = useState({
    course_name: '',
    exam_date: '',
    start_time: '',
    end_time: '',
    session_type: 'morning',
    required_invigilators: 2,
    location: '',
    academic_year: 1 as 1 | 2 | 3 | 4 | 5,
  });

  useEffect(() => {
    const unsubscribeSlots = onSnapshot(collection(db, 'exam_slots'), (snapshot) => {
      setSlots(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamSlot)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'exam_slots');
    });

    const unsubscribeBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'bookings');
    });

    return () => {
      unsubscribeSlots();
      unsubscribeBookings();
    };
  }, []);

  const handleDownloadCSV = () => {
    const headers = ['المادة', 'السنة الدراسية', 'التاريخ', 'الوقت', 'الفترة', 'الموقع', 'المراقبون المحجوزون'];
    // Sort slots by year and date to match UI expectation
    const sortedSlots = [...slots].sort((a, b) => {
      if (a.academic_year !== b.academic_year) return (a.academic_year || 1) - (b.academic_year || 1);
      return a.exam_date.localeCompare(b.exam_date);
    });

    const rows = sortedSlots.map(s => {
      const slotBookings = bookings.filter(b => b.slot_id === s.id);
      const invigilators = slotBookings.map(b => b.student_name).join(' | ');
      const yearNames = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];
      return [
        s.course_name,
        yearNames[(s.academic_year || 1) - 1],
        s.exam_date,
        `${s.start_time} - ${s.end_time}`,
        s.session_type === 'morning' ? 'صباحي' : 'مسائي',
        s.location || '',
        invigilators
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
    link.setAttribute('download', 'exam_schedule.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        current_invigilators: editingSlot?.current_invigilators || 0
      };
      if (editingSlot) {
        await updateDoc(doc(db, 'exam_slots', editingSlot.id), data);
      } else {
        await addDoc(collection(db, 'exam_slots'), data);
      }
      setIsModalOpen(false);
      setEditingSlot(null);
      setFormData({
        course_name: '',
        exam_date: '',
        start_time: '',
        end_time: '',
        session_type: 'morning',
        required_invigilators: 2,
        location: '',
        academic_year: 1,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'exam_slots');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'exam_slots', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `exam_slots/${id}`);
    }
  };

  const handleClearAll = async () => {
    if (slots.length === 0) return;
    try {
      setLoading(true);
      for (const slot of slots) {
        await deleteDoc(doc(db, 'exam_slots', slot.id));
      }
      // Also clear bookings? User said "zero the program", usually means slots.
      // But bookings are tied to slots. If slots are gone, bookings are orphaned.
      // Better to clear bookings too if we are resetting.
      for (const booking of bookings) {
        await deleteDoc(doc(db, 'bookings', booking.id));
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'exam_slots/all');
    } finally {
      setLoading(false);
    }
  };

  const openEdit = (slot: ExamSlot) => {
    setEditingSlot(slot);
    setFormData({
      course_name: slot.course_name,
      exam_date: slot.exam_date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      session_type: slot.session_type,
      required_invigilators: slot.required_invigilators,
      location: slot.location || '',
      academic_year: slot.academic_year || 1,
    });
    setIsModalOpen(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>;
  }

  const years = [1, 2, 3, 4, 5];
  const yearNames = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">البرنامج الامتحاني</h1>
          <p className="text-slate-500 mt-1">إدارة وتوزيع فترات المراقبة حسب السنوات الدراسية</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleClearAll}
            className="bg-red-50 text-red-600 px-6 py-3 rounded-2xl font-bold hover:bg-red-100 transition-colors flex items-center gap-2"
          >
            <Trash2 size={20} />
            <span>تصفير البرنامج</span>
          </button>
          <button
            onClick={handleDownloadCSV}
            className="bg-emerald-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-emerald-700 transition-colors flex items-center gap-2"
          >
            <Download size={20} />
            <span>تصدير البرنامج</span>
          </button>
          <button
            onClick={() => {
              setEditingSlot(null);
              setFormData({
                course_name: '',
                exam_date: '',
                start_time: '',
                end_time: '',
                session_type: 'morning',
                required_invigilators: 2,
                location: '',
                academic_year: 1,
              });
              setIsModalOpen(true);
            }}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <Plus size={20} />
            <span>إضافة مادة جديدة</span>
          </button>
        </div>
      </header>

      <div className="space-y-4">
        {years.map((year) => {
          const yearSlots = slots.filter(s => s.academic_year === year);
          const isOpen = expandedYear === year;

          return (
            <div key={year} className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <button
                onClick={() => setExpandedYear(isOpen ? null : year)}
                className={`w-full flex items-center justify-between p-6 transition-colors ${isOpen ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${isOpen ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                    {year}
                  </div>
                  <div className="text-right">
                    <h2 className="text-xl font-bold text-slate-900">برنامج السنة {yearNames[year - 1]}</h2>
                    <p className="text-sm text-slate-500">{yearSlots.length} مواد مضافة</p>
                  </div>
                </div>
                <div className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                  <Plus size={24} className={isOpen ? 'rotate-45' : ''} />
                </div>
              </button>

              {isOpen && (
                <div className="p-6 pt-0 animate-in slide-in-from-top-2 duration-200">
                  {yearSlots.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                      <Calendar className="mx-auto mb-3 opacity-20" size={48} />
                      <p>لا توجد مواد مضافة لهذه السنة بعد</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-right text-sm md:text-base">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-sm">
                            <th className="px-6 py-4 font-medium">المادة</th>
                            <th className="px-6 py-4 font-medium">التاريخ والوقت</th>
                            <th className="px-6 py-4 font-medium">الموقع</th>
                            <th className="px-6 py-4 font-medium">الحجوزات</th>
                            <th className="px-6 py-4 font-medium">الإجراءات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {yearSlots.map((slot) => {
                            const slotBookings = bookings.filter(b => b.slot_id === slot.id);
                            const current = slotBookings.length;
                            const required = slot.required_invigilators;
                            const isFull = current >= required;

                            return (
                              <tr key={slot.id} className={`transition-colors ${isFull ? 'bg-green-50/50' : 'hover:bg-slate-50'}`}>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <p className="font-bold text-slate-900">{slot.course_name}</p>
                                    {isFull && <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full">مكتمل</span>}
                                  </div>
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${slot.session_type === 'morning' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                    {slot.session_type === 'morning' ? 'صباحي' : 'مسائي'}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-col text-sm text-slate-600">
                                    <span className="flex items-center gap-1"><Calendar size={14} /> {slot.exam_date}</span>
                                    <span className="flex items-center gap-1"><Clock size={14} /> {slot.start_time} - {slot.end_time}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-slate-600">
                                  <span className="flex items-center gap-1"><MapPin size={14} /> {slot.location || 'غير محدد'}</span>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex justify-between text-xs mb-1">
                                      <span className={isFull ? 'text-green-600 font-bold' : 'text-slate-500'}>{current} / {required}</span>
                                    </div>
                                    <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                                      <div 
                                        className={`h-full transition-all ${isFull ? 'bg-green-500' : 'bg-indigo-500'}`} 
                                        style={{ width: `${Math.min((current / required) * 100, 100)}%` }}
                                      />
                                    </div>
                                    <div className="flex flex-wrap gap-1">
                                      {bookings
                                        .filter(b => b.slot_id === slot.id)
                                        .map(b => (
                                          <span key={b.id} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md flex items-center gap-1">
                                            <User size={10} />
                                            {b.student_name}
                                          </span>
                                        ))}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2">
                                    <button onClick={() => openEdit(slot)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                      <Edit2 size={18} />
                                    </button>
                                    <button onClick={() => handleDelete(slot.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <h2 className="text-xl font-bold text-slate-900">{editingSlot ? 'تعديل مادة' : 'إضافة مادة جديدة'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">اسم المادة</label>
                  <input
                    required
                    value={formData.course_name}
                    onChange={(e) => setFormData({ ...formData, course_name: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">السنة الدراسية</label>
                  <select
                    value={formData.academic_year}
                    onChange={(e) => setFormData({ ...formData, academic_year: parseInt(e.target.value) as any })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {years.map(y => <option key={y} value={y}>السنة {yearNames[y-1]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">نوع الفترة</label>
                  <select
                    value={formData.session_type}
                    onChange={(e) => setFormData({ ...formData, session_type: e.target.value as any })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="morning">صباحية</option>
                    <option value="evening">مسائية</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">التاريخ</label>
                  <input
                    type="date"
                    required
                    value={formData.exam_date}
                    onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">الموقع / القاعة</label>
                  <input
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">وقت البدء</label>
                  <input
                    type="time"
                    required
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">وقت الانتهاء</label>
                  <input
                    type="time"
                    required
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">عدد المراقبين المطلوب</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={formData.required_invigilators}
                  onChange={(e) => setFormData({ ...formData, required_invigilators: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors">حفظ</button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
