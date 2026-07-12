import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, doc, updateDoc, getDoc, deleteDoc, addDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { UserProfile, Booking, AppSettings, ExamSlot } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Search, Mail, Phone, IdCard, Clock, Loader2, Edit2, Download, Trash2, ChevronDown, CheckCircle2, XCircle, MessageSquare, Save, Image as ImageIcon, Check, X } from 'lucide-react';
import SecurityConfirmModal from '../components/SecurityConfirmModal';
import NoteInputWithModal from '../components/NoteInputWithModal';

// Admin Note Input Component for better state management
const AdminNoteInput = ({ 
  initialValue, 
  onSave 
}: { 
  initialValue: string, 
  onSave: (val: string) => void 
}) => {
  return (
    <NoteInputWithModal
      initialValue={initialValue}
      onSave={onSave}
      placeholder="ملاحظة للمراقب..."
      label="ملاحظة الإدارة على المراقب"
      rows={2}
      iconOnly={true}
    />
  );
};

export default function AdminStudents() {
  const { user, profile, isSuperAdmin } = useAuth();
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slots, setSlots] = useState<ExamSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingHours, setEditingHours] = useState<{ uid: string, hours: number, mode: 'default' | 'manual' } | null>(null);
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const [updatingBooking, setUpdatingBooking] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'active' | 'pending' | 'frozen'>('active');
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [deleteConfirmStudent, setDeleteConfirmStudent] = useState<string | null>(null);

  // Group notes states
  const [activeNote, setActiveNote] = useState('');
  const [frozenNote, setFrozenNote] = useState('');
  const [pendingNote, setPendingNote] = useState('');
  const [isSavingActive, setIsSavingActive] = useState(false);
  const [isSavingFrozen, setIsSavingFrozen] = useState(false);
  const [isSavingPending, setIsSavingPending] = useState(false);

  // Security code confirmation states
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [securityAction, setSecurityAction] = useState<{
    onConfirm: () => void;
    title: string;
    description: string;
  } | null>(null);

  const requestSecurityConfirm = (onConfirm: () => void, title: string, description: string) => {
    setSecurityAction({ onConfirm, title, description });
    setSecurityModalOpen(true);
  };

  useEffect(() => {
    if (!user?.uid) return;

    // Listen to group_notes in real-time
    const unsubscribeGroupNotes = onSnapshot(collection(db, 'group_notes'), (snapshot) => {
      snapshot.docs.forEach((doc) => {
        const id = doc.id;
        const data = doc.data();
        if (id === 'active') {
          setActiveNote(data.content || '');
        } else if (id === 'frozen') {
          setFrozenNote(data.content || '');
        } else if (id === 'pending') {
          setPendingNote(data.content || '');
        }
      });
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'group_notes');
    });

    return () => unsubscribeGroupNotes();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

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
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });

    return () => unsubscribeSettings();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    const unsubscribeStudents = onSnapshot(query(collection(db, 'users')), (snapshot) => {
      const users = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile));
      setAllUsers(users);
      setStudents(users.filter(u => u.role === 'student' && u.email !== "amiraldeenalhammami@ab3adacademy.com"));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    const unsubscribeBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'bookings');
    });

    const unsubscribeSlots = onSnapshot(collection(db, 'exam_slots'), (snapshot) => {
      setSlots(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExamSlot)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'exam_slots');
    });

    return () => {
      unsubscribeStudents();
      unsubscribeBookings();
      unsubscribeSlots();
    };
  }, [user?.uid]);

  const studentIds = new Set(students.map(s => s.uid));
  const activeBookings = bookings.filter(b => {
    const slot = slots.find(s => s.id === b.slot_id);
    return slot && !slot.isDeleted;
  });
  const studentBookings = activeBookings.filter(b => studentIds.has(b.student_id));

  const handleDownloadCSV = () => {
    const headers = ['الاسم', 'الرقم الجامعي', 'القسم', 'البريد', 'الهاتف', 'الساعات المنجزة', 'الساعات المطلوبة'];
    const sortedStudents = [...students].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    const rows = sortedStudents.map(s => {
      const hours = activeBookings
        .filter(b => b.student_id === s.uid)
        .reduce((acc, curr) => acc + curr.booked_hours, 0);
      return [
        s.name,
        s.university_id || '',
        s.department || '',
        s.email,
        s.phone || '',
        hours,
        s.required_hours_mode === 'manual' ? (s.required_hours ?? 16) : (globalSettings?.default_required_hours ?? 16)
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
    const headers = [
      'اسم المراقب',
      'الوضع',
      'القسم',
      'البريد الإلكتروني',
      'رقم الهاتف',
      'الساعات المطلوبة منه',
      'الساعات التي حجزها ضمن البرنامج',
      'الساعات التي سجل حضور فيها بالفعل',
      'نسبة الإنجاز'
    ];
    const rows: any[] = [];

    students.forEach(s => {
      // 1. الوضع (Account status/type)
      let statusType = s.observer_type || '';
      if (statusType.includes('دراسات')) statusType = 'دراسات';
      else if (statusType.includes('موظف')) statusType = 'موظف';
      else if (statusType.includes('أمين قاعة')) statusType = 'أمين قاعة';

      // 2. Bookings for this student
      const studentBookings = activeBookings.filter(b => b.student_id === s.uid);
      
      // 3. الساعات التي حجزها
      const bookedHours = studentBookings.reduce((sum, b) => sum + Math.abs(Number(b.booked_hours || 0)), 0);

      // 4. الساعات التي حضرها بالفعل (حالة الحضور 'present')
      const attendedBookings = studentBookings.filter(b => b.attendance_status === 'present');
      const attendedHours = attendedBookings.reduce((sum, b) => sum + Math.abs(Number(b.booked_hours || 0)), 0);

      // 5. الساعات المطلوبة منه
      const requiredHours = Number(s.required_hours_mode === 'manual' ? (s.required_hours ?? 16) : (globalSettings?.default_required_hours ?? 16));

      // 6. نسبة الإنجاز
      const achievementRate = requiredHours > 0 ? `${Math.round((attendedHours / requiredHours) * 100)}%` : '0%';

      rows.push([
        s.name,
        statusType,
        s.department || '',
        s.email,
        s.phone || '',
        requiredHours,
        bookedHours,
        attendedHours,
        achievementRate
      ]);
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'observers_attendance_report.csv');
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

  const handleSetAttendanceStatus = async (bookingId: string, status: 'present' | 'absent' | 'pending') => {
    setUpdatingBooking(bookingId);
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        attendance_status: status,
        attended: status === 'present'
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
        required_hours: editingHours.hours,
        required_hours_mode: editingHours.mode
      });
      setEditingHours(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${editingHours.uid}`);
    }
  };

  const handleActivateStudent = async (student: UserProfile) => {
    if (student.requested_role === 'admin' && !isSuperAdmin) {
      alert('فقط السوبر أدمن يمكنه الموافقة على طلبات المدراء');
      return;
    }

    if (student.requested_role === 'admin') {
      const currentAdmins = allUsers.filter(u => u.role === 'admin' || u.email === "amiraldeenalhammami@ab3adacademy.com").length;
      if (currentAdmins >= 5) {
        alert('لا يمكن تجاوز الحد الأقصى وهو 5 مدراء');
        return;
      }
    }

    setUpdatingStatus(student.uid);
    try {
      await updateDoc(doc(db, 'users', student.uid), {
        status: 'active',
        role: student.requested_role === 'admin' ? 'admin' : 'student'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${student.uid}`);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleBulkActivatePending = async () => {
    const pendingList = students.filter(s => s.status === 'pending' || !s.status);
    if (pendingList.length === 0) {
      alert('لا توجد طلبات معلقة لتفعيلها.');
      return;
    }

    const finalToActivate = pendingList.filter(student => {
      if (student.requested_role === 'admin' && !isSuperAdmin) {
        return false;
      }
      return true;
    });

    if (finalToActivate.length === 0) {
      alert('لا توجد طلبات معلقة يمكنك تفعيلها (طلبات المدراء تتطلب حساب سوبر أدمن).');
      return;
    }

    const adminsToApprove = finalToActivate.filter(s => s.requested_role === 'admin');
    if (adminsToApprove.length > 0) {
      const currentAdminsCount = allUsers.filter(u => u.role === 'admin' || u.email === "amiraldeenalhammami@ab3adacademy.com").length;
      if (currentAdminsCount + adminsToApprove.length > 5) {
        alert('لا يمكن تجاوز الحد الأقصى وهو 5 مدراء. يرجى تفعيل طلبات المدراء يدوياً.');
        return;
      }
    }

    setUpdatingStatus('bulk_activating');
    try {
      const promises = finalToActivate.map(student => 
        updateDoc(doc(db, 'users', student.uid), {
          status: 'active',
          role: student.requested_role === 'admin' ? 'admin' : 'student'
        }).catch(err => {
          handleFirestoreError(err, OperationType.UPDATE, `users/${student.uid}`);
        })
      );

      await Promise.all(promises);
      alert(`تم تفعيل جميع طلبات المراقبين بنجاح (إجمالي: ${finalToActivate.length} حساب).`);
    } catch (err) {
      console.error('Error in bulk activation:', err);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleFreezeStudent = async (uid: string) => {
    setUpdatingStatus(uid);
    try {
      await updateDoc(doc(db, 'users', uid), {
        status: 'frozen'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleUpdateAdminNote = async (uid: string, note: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        admin_note: note
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleUpdateObserverType = async (uid: string, type: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), {
        observer_type: type
      });
      const userBookings = bookings.filter(b => b.student_id === uid);
      for (const b of userBookings) {
        await updateDoc(doc(db, 'bookings', b.id), {
          observer_type: type
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleSaveGroupNote = async (status: 'active' | 'frozen' | 'pending', content: string) => {
    if (!profile) return;
    
    if (status === 'active') setIsSavingActive(true);
    if (status === 'frozen') setIsSavingFrozen(true);
    if (status === 'pending') setIsSavingPending(true);

    try {
      await setDoc(doc(db, 'group_notes', status), {
        content: content.trim(),
        admin_name: profile.name,
        admin_id: profile.uid,
        timestamp: serverTimestamp()
      });
      alert('تم حفظ الملاحظة الجماعية بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `group_notes/${status}`);
    } finally {
      if (status === 'active') setIsSavingActive(false);
      if (status === 'frozen') setIsSavingFrozen(false);
      if (status === 'pending') setIsSavingPending(false);
    }
  };

  // Note: studentIds and studentBookings are defined at the top level of the component

  const filteredStudents = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         s.university_id?.includes(searchTerm);
    let matchesTab = false;
    if (activeTab === 'active') {
      matchesTab = s.status === 'active';
    } else if (activeTab === 'pending') {
      matchesTab = s.status === 'pending' || !s.status;
    } else if (activeTab === 'frozen') {
      matchesTab = s.status === 'frozen';
    }
    return matchesSearch && matchesTab;
  }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>;
  }

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">قائمة المراقبين</h1>
          <p className="text-slate-500 mt-1">عرض بيانات المراقبين ومتابعة ساعات المراقبة</p>
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

      <div className="flex gap-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('active')}
          className={`pb-4 px-2 font-bold transition-all relative ${activeTab === 'active' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          المراقبون النشطون
          {activeTab === 'active' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full" />}
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`pb-4 px-2 font-bold transition-all relative ${activeTab === 'pending' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          طلبات معلقة
          {students.filter(s => s.status === 'pending' || !s.status).length > 0 && (
            <span className="mr-2 bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {students.filter(s => s.status === 'pending' || !s.status).length}
            </span>
          )}
          {activeTab === 'pending' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full" />}
        </button>
        <button
          onClick={() => setActiveTab('frozen')}
          className={`pb-4 px-2 font-bold transition-all relative ${activeTab === 'frozen' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
        >
          المراقبون المجمدون
          {students.filter(s => s.status === 'frozen').length > 0 && (
            <span className="mr-2 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              {students.filter(s => s.status === 'frozen').length}
            </span>
          )}
          {activeTab === 'frozen' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-t-full" />}
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start md:items-end justify-between w-full">
        <div className="relative w-full md:max-w-md">
          <label className="block text-xs font-bold text-slate-500 mb-1 mr-2">البحث عن المراقبين</label>
          <div className="relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="بحث بالاسم أو الرقم الجامعي..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-12 pl-4 py-3 bg-white border border-slate-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
        </div>

        {activeTab === 'pending' && students.filter(s => s.status === 'pending' || !s.status).length > 0 && (
          <button
            onClick={() => requestSecurityConfirm(
              handleBulkActivatePending,
              'تفعيل كافة المراقبين المعلقين دفعة واحدة',
              `هل أنت متأكد من رغبتك في تفعيل كافة طلبات المراقبين المعلقة المتبقية في هذه القائمة دفعة واحدة؟ (إجمالي الطلبات: ${students.filter(s => s.status === 'pending' || !s.status).length})`
            )}
            disabled={updatingStatus !== null}
            className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-sm shadow-emerald-100 disabled:opacity-50 shrink-0"
          >
            {updatingStatus === 'bulk_activating' ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <CheckCircle2 size={18} />
            )}
            <span>تفعيل كافة المراقبين المعلقين ({students.filter(s => s.status === 'pending' || !s.status).length})</span>
          </button>
        )}
      </div>

      {/* Group Notes System */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <MessageSquare className="text-indigo-600" size={20} />
          <h2 className="text-sm font-bold text-slate-900">نظام الملاحظات الجماعية المخصصة (سريعة التحديث)</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Active Note */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">ملاحظة المراقبين النشطين</label>
            </div>
            <NoteInputWithModal
              initialValue={activeNote}
              onSave={(val) => {
                setActiveNote(val);
                return handleSaveGroupNote('active', val);
              }}
              placeholder="اكتب ملاحظة للمراقبين النشطين..."
              label="ملاحظة جماعية للمراقبين النشطين"
              rows={2}
            />
          </div>

          {/* Frozen Note */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg">ملاحظة المراقبين المجمدين</label>
            </div>
            <NoteInputWithModal
              initialValue={frozenNote}
              onSave={(val) => {
                setFrozenNote(val);
                return handleSaveGroupNote('frozen', val);
              }}
              placeholder="اكتب ملاحظة للمراقبين المجمدين..."
              label="ملاحظة جماعية للمراقبين المجمدين"
              rows={2}
            />
          </div>

          {/* Pending Note */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-[11px] font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-lg">ملاحظة المراقبين المعلقين</label>
            </div>
            <NoteInputWithModal
              initialValue={pendingNote}
              onSave={(val) => {
                setPendingNote(val);
                return handleSaveGroupNote('pending', val);
              }}
              placeholder="اكتب ملاحظة للمراقبين المعلقين..."
              label="ملاحظة جماعية للمراقبين المعلقين"
              rows={2}
            />
          </div>
        </div>
      </div>

      {/* Mobile Scroll Hint */}
      <div className="md:hidden bg-indigo-50/50 border border-indigo-100/50 text-indigo-700 text-xs font-bold py-3 px-4 rounded-2xl flex items-center justify-between gap-2 shadow-xs animate-pulse">
        <span className="flex items-center gap-1.5">
          <span>💡</span>
          <span>اسحب الجدول لليمين واليسار لمشاهدة كامل البيانات (الساعات، الملاحظات، الأزرار)</span>
        </span>
        <span className="text-sm">↔️</span>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-x-auto touch-pan-x">
        <table className="w-full text-right min-w-[1100px] md:min-w-full">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-sm">
              <th className="px-6 py-4 font-medium">المراقب</th>
              <th className="px-6 py-4 font-medium text-center">ملاحظة المراقب</th>
              <th className="px-6 py-4 font-medium">البيانات الجامعية</th>
              <th className="px-6 py-4 font-medium">الساعات (منجز / مطلوب)</th>
              <th className="px-6 py-4 font-medium text-center w-24">ملاحظة الأدمن</th>
              <th className="px-6 py-4 font-medium">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredStudents.map((student) => {
              const currentStudentBookings = studentBookings.filter(b => b.student_id === student.uid);
              const studentHours = currentStudentBookings.reduce((acc, curr) => acc + curr.booked_hours, 0);
              const required = student.required_hours_mode === 'manual' 
                ? (student.required_hours ?? 16) 
                : (globalSettings?.default_required_hours ?? 16);
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
                        <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 text-xl font-bold overflow-hidden border border-slate-100">
                          {student.profile_image_url ? (
                            <img src={student.profile_image_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            student.avatar_emoji || student.name.charAt(0)
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-900 flex items-center gap-2">
                            {student.name}
                            {student.status === 'pending' && student.requested_role === 'admin' && (
                              <span className="bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">طلب مدير</span>
                            )}
                            {student.status === 'pending' && student.requested_role === 'student' && (
                              <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">طلب مراقب</span>
                            )}
                          </span>
                          <span className="text-[10px] text-slate-400">{student.email}</span>
                          {(student.status === 'pending' || !student.status) && (
                            <div className="mt-1">
                              {student.email_verified ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] px-2 py-0.5 rounded-lg font-bold border border-emerald-200">
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                                  تم تأكيد الإيميل برمجياً
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 text-[10px] px-2 py-0.5 rounded-lg font-bold border border-rose-200">
                                  <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                                  لم يتم تأكيد الإيميل من قبل المراقب بعد
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="max-w-[150px] mx-auto text-center">
                        {student.student_note ? (
                          <p className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg italic">"{student.student_note}"</p>
                        ) : (
                          <span className="text-[10px] text-slate-300">لا توجد ملاحظة</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-2 text-right">
                        <div className="flex flex-col text-sm text-slate-600">
                          <span className="flex items-center gap-1 justify-end"><IdCard size={14} /> {student.university_id}</span>
                          <span className="text-xs text-slate-400">{student.department}</span>
                        </div>
                        <div className="relative w-36 self-end">
                          <select
                            value={student.observer_type || 'طالب دراسات'}
                            onChange={async (e) => {
                              const newType = e.target.value as any;
                              await handleUpdateObserverType(student.uid, newType);
                            }}
                            className="w-full pr-2 pl-6 py-1 bg-indigo-50/50 border border-indigo-100 rounded-lg text-xs font-bold text-indigo-700 outline-none transition-all appearance-none text-right"
                          >
                            <option value="طالب دراسات">طالب دراسات</option>
                            <option value="موظف">موظف</option>
                            <option value="أمين قاعة">أمين قاعة</option>
                            <option value="دكتور مشرف">دكتور مشرف</option>
                          </select>
                          <ChevronDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-indigo-600 pointer-events-none" />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-900">{studentHours} / {required}</span>
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div className="h-full bg-indigo-600" style={{ width: `${Math.min(100, (studentHours/required)*100)}%` }} />
                          </div>
                          <span className={`text-[9px] mt-1 font-bold px-1 py-0.5 rounded-md self-start ${
                            student.required_hours_mode === 'manual' 
                              ? 'bg-amber-50 text-amber-600 border border-amber-200' 
                              : 'bg-slate-50 text-slate-500 border border-slate-200'
                          }`}>
                            {student.required_hours_mode === 'manual' ? 'يدوي' : 'افتراضي'}
                          </span>
                        </div>
                        <button 
                          onClick={() => setEditingHours({ 
                            uid: student.uid, 
                            hours: student.required_hours || globalSettings?.default_required_hours || 16, 
                            mode: student.required_hours_mode || 'default' 
                          })}
                          className="p-1 text-slate-400 hover:text-indigo-600"
                        >
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <AdminNoteInput 
                        initialValue={student.admin_note || ''} 
                        onSave={(val) => handleUpdateAdminNote(student.uid, val)} 
                      />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {(student.status === 'pending' || !student.status || student.status === 'frozen') && (
                          <button 
                            onClick={() => requestSecurityConfirm(
                              () => handleActivateStudent(student),
                              'تفعيل حساب المراقب',
                              `يرجى إدخال كلمة المرور الموحدة لتأكيد تفعيل حساب المراقب: ${student.name}`
                            )}
                            disabled={updatingStatus === student.uid}
                            className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-3.5 py-2 rounded-xl text-xs font-bold hover:bg-emerald-100 transition-all disabled:opacity-50 whitespace-nowrap"
                            title={`تفعيل كـ ${student.requested_role === 'admin' ? 'مدير' : 'مراقب'}`}
                          >
                            {updatingStatus === student.uid ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                            <span>تفعيل {student.requested_role === 'admin' ? '(مدير)' : ''}</span>
                          </button>
                        )}
                        {student.status === 'active' && (
                          <button 
                            onClick={() => requestSecurityConfirm(
                              () => handleFreezeStudent(student.uid),
                              'تجميد حساب المراقب',
                              `يرجى إدخال كلمة المرور الموحدة لتأكيد تجميد حساب المراقب: ${student.name}`
                            )}
                            disabled={updatingStatus === student.uid}
                            className="p-2.5 bg-amber-50 text-amber-600 hover:bg-amber-100 rounded-xl transition-all disabled:opacity-50 inline-flex items-center justify-center"
                            title="تجميد المراقب"
                          >
                            {updatingStatus === student.uid ? <Loader2 size={15} className="animate-spin" /> : <XCircle size={15} />}
                          </button>
                        )}
                        <button 
                          onClick={() => setDeleteConfirmStudent(student.uid)}
                          className="p-2.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl transition-all inline-flex items-center justify-center"
                          title="حذف المراقب نهائياً"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 bg-slate-50/50">
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden animate-in slide-in-from-top-2 duration-200">
                          <div className="p-4 border-b border-slate-50 bg-slate-50/30 flex justify-between items-center">
                            <h4 className="font-bold text-slate-700 text-sm">سجل فترات المراقبة والالتزام</h4>
                            {student.id_card_image_url && (
                              <a 
                                href={student.id_card_image_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                              >
                                <ImageIcon size={14} /> عرض صورة البطاقة الجامعية
                              </a>
                            )}
                          </div>
                          <div className="divide-y divide-slate-50">
                            {currentStudentBookings.length > 0 ? (
                              currentStudentBookings.map((booking) => (
                                <div key={booking.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                                  <div className="flex items-center gap-4 min-w-[200px]">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                      booking.attendance_status === 'present' 
                                        ? 'bg-emerald-50 text-emerald-600' 
                                        : booking.attendance_status === 'absent'
                                        ? 'bg-red-50 text-red-600'
                                        : 'bg-slate-100 text-slate-400'
                                    }`}>
                                      {booking.attendance_status === 'present' ? (
                                        <CheckCircle2 size={20} />
                                      ) : booking.attendance_status === 'absent' ? (
                                        <XCircle size={20} />
                                      ) : (
                                        <Clock size={20} />
                                      )}
                                    </div>
                                    <div>
                                      <p className="font-bold text-slate-900">{booking.course_name}</p>
                                      <p className="text-xs text-slate-500">{booking.exam_date} • {booking.booked_hours} ساعة</p>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-6 flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-slate-500">حالة الالتزام:</span>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => handleSetAttendanceStatus(booking.id, 'present')}
                                          disabled={updatingBooking === booking.id}
                                          title="حاضر"
                                          className={`p-1 rounded-md border transition-colors ${
                                            booking.attendance_status === 'present' 
                                              ? 'bg-emerald-50 border-emerald-300 text-emerald-600' 
                                              : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                                          }`}
                                        >
                                          <Check size={12} className="font-black" />
                                        </button>
                                        <button
                                          onClick={() => handleSetAttendanceStatus(booking.id, 'absent')}
                                          disabled={updatingBooking === booking.id}
                                          title="غائب"
                                          className={`p-1 rounded-md border transition-colors ${
                                            booking.attendance_status === 'absent' 
                                              ? 'bg-red-50 border-red-300 text-red-600' 
                                              : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                                          }`}
                                        >
                                          <X size={12} className="font-black" />
                                        </button>
                                        <button
                                          onClick={() => handleSetAttendanceStatus(booking.id, 'pending')}
                                          disabled={updatingBooking === booking.id}
                                          title="قيد الانتظار"
                                          className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold transition-colors ${
                                            booking.attendance_status === 'pending' || !booking.attendance_status 
                                              ? 'bg-slate-100 border-slate-300 text-slate-600' 
                                              : 'border-slate-200 text-slate-400 hover:bg-slate-50'
                                          }`}
                                        >
                                          انتظار
                                        </button>
                                      </div>
                                    </div>
                                    
                                    <div className="flex-1">
                                      <NoteInputWithModal
                                        initialValue={booking.admin_notes || ''}
                                        onSave={(val) => handleUpdateNotes(booking.id, val)}
                                        placeholder="إضافة ملاحظات للحجز..."
                                        label="ملاحظة الإدارة على هذا الحجز"
                                        rows={1}
                                        inputClassName="bg-slate-50 border-none rounded-xl"
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="p-8 text-center text-slate-400 text-sm italic">
                                لا توجد حجوزات مسجلة لهذا المراقب بعد.
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

      {/* Delete Confirmation Modal */}
      {deleteConfirmStudent && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 size={40} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">هل أنت متأكد؟</h2>
            <p className="text-slate-500 mb-8">سيتم حذف المراقب وجميع حجوزاته نهائياً من النظام. لا يمكن التراجع عن هذا الإجراء.</p>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  const uidToDelete = deleteConfirmStudent;
                  setDeleteConfirmStudent(null);
                  requestSecurityConfirm(
                    () => handleDeleteStudent(uidToDelete),
                    'تأكيد حذف المراقب نهائياً',
                    'يرجى إدخال كلمة المرور الموحدة لتأكيد عملية حذف المراقب وحجوزاته من النظام نهائياً.'
                  );
                }} 
                className="flex-1 bg-red-600 text-white py-3 rounded-xl font-bold hover:bg-red-700 transition-colors"
              >
                نعم، متأكد
              </button>
              <button 
                onClick={() => setDeleteConfirmStudent(null)} 
                className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Hours Modal */}
      {editingHours && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 border border-slate-100 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h2 className="text-xl font-bold text-slate-900 mb-4 text-right">تعديل الساعات المطلوبة</h2>
            <div className="space-y-4 text-right">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 mr-1">نظام تحديد الساعات</label>
                <select
                  value={editingHours.mode}
                  onChange={(e) => {
                    const newMode = e.target.value as 'default' | 'manual';
                    setEditingHours({
                      ...editingHours,
                      mode: newMode,
                      hours: newMode === 'default' 
                        ? (globalSettings?.default_required_hours || 16) 
                        : (editingHours.hours || globalSettings?.default_required_hours || 16)
                    });
                  }}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm font-medium"
                >
                  <option value="default">افتراضي - Default</option>
                  <option value="manual">يدوي - Manual</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5 mr-1">عدد الساعات المطلوبة</label>
                <div className="relative">
                  <input
                    type="number"
                    disabled={editingHours.mode === 'default'}
                    value={
                      editingHours.mode === 'default' 
                        ? (globalSettings?.default_required_hours || 16) 
                        : (isNaN(editingHours.hours) ? 0 : editingHours.hours)
                    }
                    onChange={(e) => setEditingHours({ ...editingHours, hours: parseInt(e.target.value) || 0 })}
                    className={`w-full pl-12 pr-4 py-2.5 border rounded-xl outline-none text-sm font-semibold text-right ${
                      editingHours.mode === 'default'
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-slate-50 border-slate-200 text-slate-900 focus:ring-2 focus:ring-indigo-500'
                    }`}
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">ساعة</span>
                </div>
                {editingHours.mode === 'default' && (
                  <p className="text-[11px] text-slate-400 mt-1.5 mr-1 leading-relaxed">
                    يتم قفل الحقل ويأخذ القيمة تلقائياً من الإعدادات العامة ({globalSettings?.default_required_hours} ساعة).
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button 
                  onClick={handleUpdateHours} 
                  className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors"
                >
                  تحديث
                </button>
                <button 
                  onClick={() => setEditingHours(null)} 
                  className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Security Code Confirm Modal */}
      {securityModalOpen && securityAction && (
        <SecurityConfirmModal
          isOpen={securityModalOpen}
          onClose={() => {
            setSecurityModalOpen(false);
            setSecurityAction(null);
          }}
          onConfirm={securityAction.onConfirm}
          title={securityAction.title}
          description={securityAction.description}
        />
      )}
    </div>
  );
}
