import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc, getDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ExamSlot, Booking, AppSettings, UserProfile } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Plus, Trash2, Edit2, X, Check, Calendar, Clock, MapPin, Users, Loader2, User, Download, Shield, AlertCircle, Sparkles, Upload, ChevronDown } from 'lucide-react';
import SecurityConfirmModal from '../components/SecurityConfirmModal';
import { getSlotRooms, getObserverRoom } from '../utils/roomUtils';
import { parseCSVToSlots } from '../utils/csvParser';

export default function AdminSlots() {
  const { profile } = useAuth();
  const [slots, setSlots] = useState<ExamSlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ExamSlot | null>(null);
  const [expandedYear, setExpandedYear] = useState<number | null>(1);
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [expandedSlotRooms, setExpandedSlotRooms] = useState<string | null>(null);
  const [completionResult, setCompletionResult] = useState<{
    totalSlotHours: number;
    totalObserverHours: number;
    activeObserversCount: number;
    averageHours: number;
  } | null>(null);

  // CSV Upload States
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [parsedSlots, setParsedSlots] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Security confirmation states
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
  const [formData, setFormData] = useState({
    course_name: '',
    exam_date: '',
    start_time: '',
    end_time: '',
    session_type: 'morning' as 'morning' | 'evening',
    required_invigilators: 2,
    location: '',
    academic_year: 1 as 1 | 2 | 3 | 4 | 5,
    duration_hours: 2,
    observers_per_room: 3,
    has_studios: false,
    studios_from: 1,
    studios_to: 8,
    has_lobbies: false,
    lobbies_from: 1,
    lobbies_to: 3,
    has_basements: false,
    basements_from: 1,
    basements_to: 3,
    has_halls: false,
    halls_from: 1,
    halls_to: 2,
    has_expansions: false,
    expansions_from: 1,
    expansions_to: 6,
  });

  useEffect(() => {
    if (!profile?.uid) return;

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

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setStudents(snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(u => u.role === 'student' && u.email !== "amiraldeenalhammami@ab3adacademy.com")
      );
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    return () => {
      unsubscribeSlots();
      unsubscribeBookings();
      unsubscribeUsers();
    };
  }, [profile?.uid]);

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

  const handleDownloadCSV = () => {
    const headers = ['اسم المادة', 'السنة الدراسية', 'تاريخ المادة', 'وقت البدء', 'مدة الامتحان'];
    const yearNames = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];
    const years = [1, 2, 3, 4, 5];

    let csvRows: string[] = [];
    csvRows.push('النسخة النهائية من البرنامج الامتحاني');
    csvRows.push(''); // Spacer
    csvRows.push(headers.join(',')); // Main headers at the top
    
    years.forEach((yr) => {
      const yearSlots = slots
        .filter(s => s.academic_year === yr)
        .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
        
      if (yearSlots.length > 0) {
        // Add a clear divider row for this academic year
        csvRows.push(`--- مواد السنة ${yearNames[yr - 1]} ---`);
        
        yearSlots.forEach(s => {
          let duration = s.duration_hours || 2;
          if (!s.duration_hours && s.start_time && s.end_time) {
            try {
              const start = s.start_time.split(':');
              const end = s.end_time.split(':');
              const startMin = parseInt(start[0]) * 60 + parseInt(start[1]);
              const endMin = parseInt(end[0]) * 60 + parseInt(end[1]);
              duration = Math.max(1, Math.round((endMin - startMin) / 60));
            } catch (e) {
              duration = 2;
            }
          }
          
          const row = [
            s.course_name,
            yearNames[yr - 1],
            s.exam_date,
            s.start_time,
            `${duration} ساعات`
          ];
          csvRows.push(row.join(','));
        });
        csvRows.push(''); // Spacer between sections
      }
    });

    const csvContent = csvRows.join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'النسخة_النهائية_من_البرنامج_الامتحاني.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getRoomsCount = (data: typeof formData) => {
    let count = 0;
    if (data.has_studios && data.studios_to >= data.studios_from) {
      count += (data.studios_to - data.studios_from + 1);
    }
    if (data.has_lobbies && data.lobbies_to >= data.lobbies_from) {
      count += (data.lobbies_to - data.lobbies_from + 1);
    }
    if (data.has_basements && data.basements_to >= data.basements_from) {
      count += (data.basements_to - data.basements_from + 1);
    }
    if (data.has_halls && data.halls_to >= data.halls_from) {
      count += (data.halls_to - data.halls_from + 1);
    }
    if (data.has_expansions && data.expansions_to >= data.expansions_from) {
      count += (data.expansions_to - data.expansions_from + 1);
    }
    return count;
  };

  const resetForm = () => {
    setFormData({
      course_name: '',
      exam_date: '',
      start_time: '',
      end_time: '',
      session_type: 'morning',
      required_invigilators: 2,
      location: '',
      academic_year: 1,
      duration_hours: 2,
      observers_per_room: 3,
      has_studios: false,
      studios_from: 1,
      studios_to: 8,
      has_lobbies: false,
      lobbies_from: 1,
      lobbies_to: 3,
      has_basements: false,
      basements_from: 1,
      basements_to: 3,
      has_halls: false,
      halls_from: 1,
      halls_to: 2,
      has_expansions: false,
      expansions_from: 1,
      expansions_to: 6,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const roomsCount = getRoomsCount(formData);
      const reqInvigilators = roomsCount > 0 
        ? (roomsCount * formData.observers_per_room) 
        : formData.required_invigilators;

      const data = {
        ...formData,
        required_invigilators: reqInvigilators,
        current_invigilators: editingSlot?.current_invigilators || 0
      };
      if (editingSlot) {
        await updateDoc(doc(db, 'exam_slots', editingSlot.id), data);
      } else {
        await addDoc(collection(db, 'exam_slots'), data);
      }
      setIsModalOpen(false);
      setEditingSlot(null);
      resetForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'exam_slots');
    }
  };

  const toggleAttendance = async (bookingId: string, newStatus: 'present' | 'absent' | 'pending') => {
    try {
      await updateDoc(doc(db, 'bookings', bookingId), {
        attendance_status: newStatus
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'bookings');
    }
  };

  const handleDownloadSlotCSV = (slot: ExamSlot) => {
    const headers = ['مكان المراقبة', 'اسم المراقب', 'حالة الحضور'];
    
    const slotBookings = bookings.filter(b => b.slot_id === slot.id);
    const sortedBookings = [...slotBookings].sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

    const rooms = getSlotRooms(slot);
    const roomsList = rooms.length > 0 ? rooms : ['القاعة العامة'];

    const rows: string[][] = [];

    roomsList.forEach(roomName => {
      const observersInRoom = sortedBookings.filter(b => 
        rooms.length > 0 
          ? getObserverRoom(slot, b, sortedBookings) === roomName 
          : true
      );

      if (observersInRoom.length === 0) {
        rows.push([
          roomName,
          'لا يوجد مراقبون مخصصون بعد',
          'غائب'
        ]);
      } else {
        observersInRoom.forEach(b => {
          let statusStr = 'قيد الانتظار';
          if (b.attendance_status === 'present') statusStr = '✓ حاضر';
          if (b.attendance_status === 'absent') statusStr = '✗ غائب';

          rows.push([
            roomName,
            b.student_name,
            statusStr
          ]);
        });
      }
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${slot.course_name}_حضور_وتوزيع.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
      for (const booking of bookings) {
        await deleteDoc(doc(db, 'bookings', booking.id));
      }
      alert('تم تصفير البرنامج بنجاح');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'exam_slots/all');
    } finally {
      setLoading(false);
    }
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportSuccess(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
          setImportError('الملف فارغ أو غير صالح');
          return;
        }

        let text = '';
        
        // Try decoding with UTF-8 first (fatal: true will throw on invalid sequences like CP1256 Arabic)
        try {
          const decoder = new TextDecoder('utf-8', { fatal: true });
          text = decoder.decode(arrayBuffer);
        } catch (utf8Error) {
          console.warn('UTF-8 decoding failed, trying windows-1256 (Arabic/Excel compatibility)...', utf8Error);
          // Fallback to Windows-1256 which is the standard ANSI codepage for Arabic exports in Excel
          try {
            const decoder = new TextDecoder('windows-1256');
            text = decoder.decode(arrayBuffer);
          } catch (winError) {
            console.error('Windows-1256 decoding failed, falling back to non-fatal UTF-8...', winError);
            // Final fallback: non-fatal UTF-8
            const decoder = new TextDecoder('utf-8');
            text = decoder.decode(arrayBuffer);
          }
        }

        if (!text.trim()) {
          setImportError('لم نتمكن من قراءة محتوى الملف بشكل صحيح.');
          return;
        }

        const parsed = parseCSVToSlots(text);
        if (parsed.length === 0) {
          setImportError('لم يتم العثور على أي مواد صالحة في الملف. يرجى التحقق من وجود الأعمدة المطلوبة: اسم المادة، السنة الدراسية، تاريخ المادة، وقت البدء.');
          setParsedSlots([]);
        } else {
          setParsedSlots(parsed);
          setImportError(null);
          setImportSuccess(`تم قراءة وتحليل ${parsed.length} مادة بنجاح! جاهز للاستيراد.`);
        }
      } catch (err) {
        setImportError('حدث خطأ أثناء قراءة وتحليل الملف.');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleImportSlots = async () => {
    if (parsedSlots.length === 0) return;
    setImportLoading(true);
    setImportError(null);
    try {
      for (const s of parsedSlots) {
        await addDoc(collection(db, 'exam_slots'), {
          course_name: s.course_name,
          academic_year: s.academic_year,
          exam_date: s.exam_date,
          start_time: s.start_time,
          end_time: s.end_time,
          session_type: s.session_type,
          duration_hours: s.duration_hours || 2,
          required_invigilators: 2, // Default
          observers_per_room: 3, // Default
          location: '',
          current_invigilators: 0,
          has_studios: false,
          studios_from: 1,
          studios_to: 8,
          has_lobbies: false,
          lobbies_from: 1,
          lobbies_to: 3,
          has_basements: false,
          basements_from: 1,
          basements_to: 3,
          has_halls: false,
          halls_from: 1,
          halls_to: 2,
          has_expansions: false,
          expansions_from: 1,
          expansions_to: 6,
        });
      }
      alert(`تم استيراد ${parsedSlots.length} فترة امتحانية بنجاح!`);
      setIsUploadModalOpen(false);
      setParsedSlots([]);
      setImportSuccess(null);
    } catch (err) {
      setImportError('حدث خطأ أثناء حفظ الفترات في قاعدة البيانات.');
      console.error(err);
    } finally {
      setImportLoading(false);
    }
  };

  const openEdit = (slot: ExamSlot) => {
    setEditingSlot(slot);
    
    let fallbackDuration = 2;
    try {
      if (slot.start_time && slot.end_time) {
        const start = slot.start_time.split(':');
        const end = slot.end_time.split(':');
        const startMin = parseInt(start[0]) * 60 + parseInt(start[1]);
        const endMin = parseInt(end[0]) * 60 + parseInt(end[1]);
        fallbackDuration = Math.max(1, Math.round((endMin - startMin) / 60));
      }
    } catch (e) {
      fallbackDuration = 2;
    }

    setFormData({
      course_name: slot.course_name,
      exam_date: slot.exam_date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      session_type: slot.session_type,
      required_invigilators: slot.required_invigilators,
      location: slot.location || '',
      academic_year: slot.academic_year || 1,
      duration_hours: slot.duration_hours || fallbackDuration,
      observers_per_room: slot.observers_per_room ?? 3,
      has_studios: slot.has_studios ?? false,
      studios_from: slot.studios_from ?? 1,
      studios_to: slot.studios_to ?? 8,
      has_lobbies: slot.has_lobbies ?? false,
      lobbies_from: slot.lobbies_from ?? 1,
      lobbies_to: slot.lobbies_to ?? 3,
      has_basements: slot.has_basements ?? false,
      basements_from: slot.basements_from ?? 1,
      basements_to: slot.basements_to ?? 3,
      has_halls: slot.has_halls ?? false,
      halls_from: slot.halls_from ?? 1,
      halls_to: slot.halls_to ?? 2,
      has_expansions: slot.has_expansions ?? false,
      expansions_from: slot.expansions_from ?? 1,
      expansions_to: slot.expansions_to ?? 6,
    });
    setIsModalOpen(true);
  };

  const handleCompleteProgram = () => {
    // 1. Calculate Total Slot Hours (sum of: required_invigilators * slot_duration_in_hours for each slot)
    let totalSlotHours = 0;
    slots.forEach(s => {
      try {
        const durationHours = s.duration_hours !== undefined 
          ? Number(s.duration_hours) 
          : (() => {
              const start = s.start_time.split(':');
              const end = s.end_time.split(':');
              const startMin = parseInt(start[0]) * 60 + parseInt(start[1]);
              const endMin = parseInt(end[0]) * 60 + parseInt(end[1]);
              return Math.max(1, Math.round((endMin - startMin) / 60));
            })();
        totalSlotHours += (s.required_invigilators * durationHours);
      } catch (e) {
        totalSlotHours += (s.required_invigilators * 2); // fallback to 2 hours
      }
    });

    // 2. Calculate Active Observers list and count correctly
    const activeStudentsList = students.filter(s => s.status === 'active');
    const bookedStudentIds = new Set(bookings.map(b => b.student_id).filter(Boolean));
    
    // Determine active observers: students with active status, or fallback to booked student ids if students list is empty
    const finalActiveStudents = activeStudentsList.length > 0 
      ? activeStudentsList 
      : Array.from(bookedStudentIds).map(id => ({ uid: id, status: 'active' } as UserProfile));
      
    const finalActiveStudentIds = new Set(finalActiveStudents.map(s => s.uid));
    const activeObserversCount = finalActiveStudents.length;

    // 3. Calculate total hours booked by those active observers only
    const totalObserverHours = bookings
      .filter(b => finalActiveStudentIds.has(b.student_id))
      .reduce((sum, b) => {
        const hours = b.booked_hours !== undefined ? Math.abs(Number(b.booked_hours)) : 2;
        return sum + (isNaN(hours) ? 2 : hours);
      }, 0);

    // 4. Average Hours per Active Observer (calculated by dividing total required hours by active observers)
    const averageHours = activeObserversCount > 0 ? parseFloat((totalSlotHours / activeObserversCount).toFixed(2)) : 0;

    setCompletionResult({
      totalSlotHours,
      totalObserverHours,
      activeObserversCount,
      averageHours
    });
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>;
  }

  const years = [1, 2, 3, 4, 5];
  const yearNames = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];

  return (
    <div className="space-y-8 text-right" dir="rtl">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">البرنامج الامتحاني</h1>
          <p className="text-slate-500 mt-1">إدارة وتوزيع فترات المراقبة حسب السنوات الدراسية</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={() => {
              requestSecurityConfirm(
                handleClearAll,
                'تصفير البرنامج الامتحاني',
                'سيتم حذف جميع المواد المضافة وجميع حجوزات المراقبين نهائياً من النظام. يرجى إدخال كلمة المرور الموحدة للتأكيد.'
              );
            }}
            className="bg-red-50 text-red-600 px-4 py-2.5 rounded-2xl font-bold hover:bg-red-100 transition-colors flex items-center gap-2 text-sm"
          >
            <Trash2 size={16} />
            <span>تصفير البرنامج</span>
          </button>
          <button
            onClick={handleDownloadCSV}
            className="bg-emerald-50 text-emerald-700 px-4 py-2.5 rounded-2xl font-bold hover:bg-emerald-100 transition-colors flex items-center gap-2 text-sm"
          >
            <Download size={16} />
            <span>تصدير المواد</span>
          </button>

          <button
            onClick={() => {
              setImportError(null);
              setImportSuccess(null);
              setParsedSlots([]);
              setIsUploadModalOpen(true);
            }}
            className="bg-indigo-50 text-indigo-700 px-4 py-2.5 rounded-2xl font-bold hover:bg-indigo-100 transition-colors flex items-center gap-2 text-sm border border-indigo-100"
          >
            <Upload size={16} />
            <span>رفع جدول المواد (CSV)</span>
          </button>
          
          <button
            onClick={handleCompleteProgram}
            className="bg-amber-50 text-amber-700 border border-amber-200 px-4 py-2.5 rounded-2xl font-bold hover:bg-amber-100 transition-all flex items-center gap-2 text-sm shadow-xs"
          >
            <Sparkles size={16} className="text-amber-500" />
            <span>اكتمل البرنامج</span>
          </button>

          <button
            onClick={() => {
              setEditingSlot(null);
              resetForm();
              setIsModalOpen(true);
            }}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-2xl font-bold hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm shadow-xs"
          >
            <Plus size={18} />
            <span>إضافة مادة جديدة</span>
          </button>
        </div>
      </header>

      {/* Completion calculation results block */}
      {completionResult && (
        <div className="bg-gradient-to-r from-indigo-50 via-slate-50 to-amber-50/40 p-6 rounded-3xl border border-indigo-100/60 shadow-xs animate-in fade-in duration-300">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="text-amber-500 animate-pulse" size={20} />
            <h3 className="text-base font-bold text-slate-900">إحصائيات البرنامج المكتمل</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col items-center text-center">
              <span className="text-xs text-slate-400 font-bold">الساعات الكلية المطلوبة للبرنامج</span>
              <span className="text-2xl font-black text-indigo-600 mt-1">{completionResult.totalSlotHours} ساعة</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col items-center text-center">
              <span className="text-xs text-slate-400 font-bold">الساعات الكلية المنجزة (الحجوزات)</span>
              <span className="text-2xl font-black text-emerald-600 mt-1">{completionResult.totalObserverHours} ساعة</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col items-center text-center">
              <span className="text-xs text-slate-400 font-bold">عدد المراقبين الفعّالين</span>
              <span className="text-2xl font-black text-slate-800 mt-1">{completionResult.activeObserversCount} مراقب</span>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-slate-100 flex flex-col items-center text-center">
              <span className="text-xs text-slate-400 font-bold">متوسط الساعات لكل مراقب فعّال</span>
              <span className="text-2xl font-black text-amber-600 mt-1">{completionResult.averageHours} ساعة/مراقب</span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {years.map((year) => {
          const yearSlots = slots
            .filter(s => s.academic_year === year)
            .sort((a, b) => {
              const dateCompare = a.exam_date.localeCompare(b.exam_date);
              if (dateCompare !== 0) return dateCompare;
              return a.start_time.localeCompare(b.start_time);
            });
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
                    <div className="overflow-x-auto touch-pan-x">
                      <table className="w-full text-right text-sm md:text-base min-w-[850px] md:min-w-full">
                        <thead>
                          <tr className="bg-slate-50 text-slate-500 text-sm">
                            <th className="px-6 py-4 font-medium">المادة</th>
                            <th className="px-6 py-4 font-medium">التاريخ والوقت</th>
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

                            const sortedBookings = [...slotBookings].sort((a, b) => {
                              const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                              const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                              if (timeA !== timeB) return timeA - timeB;
                              return a.id.localeCompare(b.id);
                            });

                            return (
                              <React.Fragment key={slot.id}>
                                <tr className={`transition-colors ${isFull ? 'bg-green-50/50' : 'hover:bg-slate-50'}`}>
                                  <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                      <p className="font-bold text-slate-900">{slot.course_name}</p>
                                      {isFull && <span className="text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full">مكتمل</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${slot.session_type === 'morning' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                                        {slot.session_type === 'morning' ? 'صباحي' : 'مسائي'}
                                      </span>
                                      <button
                                        onClick={() => setExpandedSlotRooms(expandedSlotRooms === slot.id ? null : slot.id)}
                                        className="text-xs text-indigo-600 hover:text-indigo-800 underline font-semibold focus:outline-none"
                                      >
                                        {expandedSlotRooms === slot.id ? 'إخفاء التفاصيل' : 'تفاصيل القاعات والحضور ☰'}
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4">
                                    <div className="flex flex-col text-sm text-slate-600">
                                      <span className="flex items-center gap-1"><Calendar size={14} /> {slot.exam_date}</span>
                                      <span className="flex items-center gap-1"><Clock size={14} /> {slot.start_time} - {slot.end_time}</span>
                                    </div>
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
                                        {sortedBookings.map(b => (
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
                                      <button 
                                        onClick={() => requestSecurityConfirm(
                                          () => handleDelete(slot.id),
                                          'حذف مادة',
                                          `يرجى إدخال كلمة المرور الموحدة لتأكيد حذف مادة: ${slot.course_name}`
                                        )} 
                                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                      >
                                        <Trash2 size={18} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>

                                {expandedSlotRooms === slot.id && (
                                  <tr className="bg-slate-50/70">
                                    <td colSpan={4} className="px-6 py-4">
                                      <div className="bg-white rounded-2xl p-4 border border-slate-200/60 shadow-xs space-y-4 text-right">
                                        <div className="flex justify-between items-center border-b border-slate-100 pb-2 flex-row-reverse">
                                          <span className="text-sm font-bold text-slate-800 font-sans">توزيع المراقبين على القاعات وحالة الحضور</span>
                                          <span className="text-xs text-slate-500">
                                            التوزيع: {slot.observers_per_room ?? 3} مراقبين لكل قاعة بالتسلسل الزمني للحجز
                                          </span>
                                        </div>

                                        {/* 3-Column Table */}
                                        <div className="overflow-x-auto touch-pan-x border border-slate-100 rounded-xl">
                                          <table className="w-full text-right text-xs min-w-[600px] md:min-w-full">
                                            <thead>
                                              <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                                                <th className="px-4 py-3 text-right">مكان المراقبة</th>
                                                <th className="px-4 py-3 text-right font-sans">اسم المراقب</th>
                                                <th className="px-4 py-3 text-right">حضور/غياب</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 bg-white">
                                              {(() => {
                                                const rooms = getSlotRooms(slot);
                                                const roomsList = rooms.length > 0 ? rooms : ['القاعة العامة'];
                                                return roomsList.flatMap((roomName) => {
                                                  const observersInRoom = sortedBookings.filter(b => 
                                                    rooms.length > 0 
                                                      ? getObserverRoom(slot, b, sortedBookings) === roomName 
                                                      : true
                                                  );

                                                  if (observersInRoom.length === 0) {
                                                    return (
                                                      <tr key={roomName} className="hover:bg-slate-50/30">
                                                        <td className="px-4 py-3 font-bold text-indigo-700">{roomName}</td>
                                                        <td colSpan={2} className="px-4 py-3 text-slate-400 italic">لا يوجد مراقبون مخصصون بعد</td>
                                                      </tr>
                                                    );
                                                  }

                                                  return observersInRoom.map((b, idx) => {
                                                    const studentObj = students.find(s => s.uid === b.student_id);
                                                    return (
                                                      <tr key={b.id} className="hover:bg-slate-50/60 transition-colors">
                                                        <td className="px-4 py-3 font-bold text-indigo-700 align-middle">
                                                          {roomName}
                                                        </td>
                                                        <td className="px-4 py-3 text-slate-800">
                                                          <div className="font-bold">{b.student_name}</div>
                                                          <div className="text-[10px] text-slate-400">{studentObj?.university_id || 'مراقب'}</div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                          <div className="flex items-center gap-1">
                                                            <button
                                                              onClick={() => toggleAttendance(b.id, 'present')}
                                                              title="حاضر"
                                                              className={`p-1 rounded-md border transition-colors ${b.attendance_status === 'present' ? 'bg-emerald-50 border-emerald-300 text-emerald-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                                            >
                                                              <Check size={12} className="font-black" />
                                                            </button>
                                                            <button
                                                              onClick={() => toggleAttendance(b.id, 'absent')}
                                                              title="غائب"
                                                              className={`p-1 rounded-md border transition-colors ${b.attendance_status === 'absent' ? 'bg-red-50 border-red-300 text-red-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                                            >
                                                              <X size={12} className="font-black" />
                                                            </button>
                                                            <button
                                                              onClick={() => toggleAttendance(b.id, 'pending')}
                                                              title="قيد الانتظار"
                                                              className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold transition-colors ${b.attendance_status === 'pending' || !b.attendance_status ? 'bg-slate-100 border-slate-300 text-slate-600' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                                            >
                                                              انتظار
                                                            </button>
                                                          </div>
                                                        </td>
                                                      </tr>
                                                    );
                                                  });
                                                });
                                              })()}
                                            </tbody>
                                          </table>
                                        </div>

                                        {/* Download button below table */}
                                        <div className="flex justify-start">
                                          <button
                                            onClick={() => handleDownloadSlotCSV(slot)}
                                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-4 py-2.5 rounded-2xl text-xs flex items-center gap-2 transition-all border border-indigo-100 shadow-xs"
                                          >
                                            <Download size={14} />
                                            <span>تنزيل جدول الحضور والتوزيع (Excel)</span>
                                          </button>
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
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

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

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50 shrink-0">
              <h2 className="text-xl font-bold text-slate-900">{editingSlot ? 'تعديل مادة' : 'إضافة مادة جديدة'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
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
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">التاريخ</label>
                  <input
                    type="date"
                    required
                    value={formData.exam_date}
                    onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">وقت البدء (المباشرة)</label>
                  <input
                    type="time"
                    required
                    value={formData.start_time}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      let newEnd = formData.end_time;
                      try {
                        const startParts = newStart.split(':');
                        const hours = parseInt(startParts[0]) || 9;
                        const minutes = parseInt(startParts[1]) || 0;
                        const totalMinutes = hours * 60 + minutes + Math.round(formData.duration_hours * 60);
                        const endHours = Math.floor(totalMinutes / 60) % 24;
                        const endMinutes = totalMinutes % 60;
                        newEnd = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
                      } catch (err) {}
                      setFormData({ ...formData, start_time: newStart, end_time: newEnd });
                    }}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">مدة الامتحان (ساعات)</label>
                  <select
                    value={formData.duration_hours}
                    onChange={(e) => {
                      const newDuration = parseInt(e.target.value) || 2;
                      let newEnd = formData.end_time;
                      try {
                        if (formData.start_time) {
                          const startParts = formData.start_time.split(':');
                          const hours = parseInt(startParts[0]) || 9;
                          const minutes = parseInt(startParts[1]) || 0;
                          const totalMinutes = hours * 60 + minutes + Math.round(newDuration * 60);
                          const endHours = Math.floor(totalMinutes / 60) % 24;
                          const endMinutes = totalMinutes % 60;
                          newEnd = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
                        }
                      } catch (err) {}
                      setFormData({ ...formData, duration_hours: newDuration, end_time: newEnd });
                    }}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800"
                  >
                    <option value={1}>ساعة واحدة (1)</option>
                    <option value={2}>ساعتان (2)</option>
                    <option value={3}>3 ساعات (3)</option>
                    <option value={4}>4 ساعات (4)</option>
                    <option value={5}>5 ساعات (5)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">وقت انتهاء الامتحان</label>
                  <input
                    type="time"
                    required
                    value={formData.end_time}
                    onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Dynamic room range inputs */}
              <div className="border-t border-slate-200 pt-4 space-y-3">
                <h3 className="text-sm font-bold text-slate-800">توزيع وتحديد القاعات (المراسم والقاعات) لهذه المادة</h3>
                
                <div className="space-y-2">
                  {/* Studios */}
                  <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <input
                      type="checkbox"
                      id="has_studios"
                      checked={formData.has_studios}
                      onChange={(e) => setFormData({ ...formData, has_studios: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="has_studios" className="text-xs font-bold text-slate-700 w-16 shrink-0">المراسم</label>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-slate-500">من</span>
                      <input
                        type="number"
                        min="1"
                        disabled={!formData.has_studios}
                        value={formData.studios_from}
                        onChange={(e) => setFormData({ ...formData, studios_from: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                      <span className="text-xs text-slate-500">إلى</span>
                      <input
                        type="number"
                        min="1"
                        disabled={!formData.has_studios}
                        value={formData.studios_to}
                        onChange={(e) => setFormData({ ...formData, studios_to: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Lobbies */}
                  <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <input
                      type="checkbox"
                      id="has_lobbies"
                      checked={formData.has_lobbies}
                      onChange={(e) => setFormData({ ...formData, has_lobbies: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="has_lobbies" className="text-xs font-bold text-slate-700 w-16 shrink-0">البهو</label>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-slate-500">من</span>
                      <input
                        type="number"
                        min="1"
                        disabled={!formData.has_lobbies}
                        value={formData.lobbies_from}
                        onChange={(e) => setFormData({ ...formData, lobbies_from: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                      <span className="text-xs text-slate-500">إلى</span>
                      <input
                        type="number"
                        min="1"
                        disabled={!formData.has_lobbies}
                        value={formData.lobbies_to}
                        onChange={(e) => setFormData({ ...formData, lobbies_to: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Basements */}
                  <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <input
                      type="checkbox"
                      id="has_basements"
                      checked={formData.has_basements}
                      onChange={(e) => setFormData({ ...formData, has_basements: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="has_basements" className="text-xs font-bold text-slate-700 w-16 shrink-0">القبو</label>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-slate-500">من</span>
                      <input
                        type="number"
                        min="1"
                        disabled={!formData.has_basements}
                        value={formData.basements_from}
                        onChange={(e) => setFormData({ ...formData, basements_from: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                      <span className="text-xs text-slate-500">إلى</span>
                      <input
                        type="number"
                        min="1"
                        disabled={!formData.has_basements}
                        value={formData.basements_to}
                        onChange={(e) => setFormData({ ...formData, basements_to: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Halls */}
                  <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <input
                      type="checkbox"
                      id="has_halls"
                      checked={formData.has_halls}
                      onChange={(e) => setFormData({ ...formData, has_halls: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="has_halls" className="text-xs font-bold text-slate-700 w-16 shrink-0">القاعات</label>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-slate-500">من</span>
                      <input
                        type="number"
                        min="1"
                        disabled={!formData.has_halls}
                        value={formData.halls_from}
                        onChange={(e) => setFormData({ ...formData, halls_from: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                      <span className="text-xs text-slate-500">إلى</span>
                      <input
                        type="number"
                        min="1"
                        disabled={!formData.has_halls}
                        value={formData.halls_to}
                        onChange={(e) => setFormData({ ...formData, halls_to: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Expansions */}
                  <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <input
                      type="checkbox"
                      id="has_expansions"
                      checked={formData.has_expansions}
                      onChange={(e) => setFormData({ ...formData, has_expansions: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                    />
                    <label htmlFor="has_expansions" className="text-xs font-bold text-slate-700 w-16 shrink-0">التوسع</label>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-slate-500">من</span>
                      <input
                        type="number"
                        min="1"
                        disabled={!formData.has_expansions}
                        value={formData.expansions_from}
                        onChange={(e) => setFormData({ ...formData, expansions_from: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                      <span className="text-xs text-slate-500">إلى</span>
                      <input
                        type="number"
                        min="1"
                        disabled={!formData.has_expansions}
                        value={formData.expansions_to}
                        onChange={(e) => setFormData({ ...formData, expansions_to: parseInt(e.target.value) || 1 })}
                        className="w-16 px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">كم مراقب تحتاج في كل مرسم/قاعة؟</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.observers_per_room}
                      onChange={(e) => setFormData({ ...formData, observers_per_room: parseInt(e.target.value) || 3 })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="bg-indigo-50 p-3 rounded-2xl flex flex-col justify-center">
                    <span className="text-[10px] text-indigo-600 font-bold">الحساب التلقائي</span>
                    <span className="text-xs font-bold text-slate-700 mt-1">
                      عدد القاعات: {getRoomsCount(formData)} | المراقبون: {getRoomsCount(formData) * formData.observers_per_room}
                    </span>
                  </div>
                </div>
              </div>

              {getRoomsCount(formData) === 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">عدد المراقبين المطلوب (يدوي)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={isNaN(formData.required_invigilators) ? 2 : formData.required_invigilators}
                    onChange={(e) => setFormData({ ...formData, required_invigilators: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              )}

              <div className="pt-4 flex gap-3 shrink-0">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors">حفظ</button>
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold hover:bg-slate-200 transition-colors">إلغاء</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Upload & Analysis Modal */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-200 text-right" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-xl border border-slate-100 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-row-reverse">
              <h2 className="text-xl font-bold text-slate-900 font-sans flex items-center gap-2">
                <Upload className="text-indigo-600" size={22} />
                <span>رفع وتحليل البرنامج التلقائي</span>
              </h2>
              <button 
                onClick={() => setIsUploadModalOpen(false)} 
                className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Educational Note & Example Table */}
              <div className="bg-indigo-50/70 border border-indigo-100 p-5 rounded-2xl space-y-4">
                <h3 className="text-sm font-bold text-indigo-900 flex items-center gap-2 flex-row-reverse">
                  <AlertCircle size={18} className="text-indigo-600" />
                  <span>تنويه وإرشادات هامة لتنسيق الملف:</span>
                </h3>
                <p className="text-xs text-indigo-950 leading-relaxed">
                  يتعرف النظام على البرنامج تلقائياً ويقوم بإنشاء فترات المراقبة بكبسة واحدة. يرجى كتابة الأعمدة التالية في ملف الاكسل ثم حفظه وتصديره بصيغة <strong>CSV (Comma delimited)</strong>:
                </p>

                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-slate-700 font-medium">
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-50 flex flex-col items-end">
                    <span className="font-bold text-indigo-700">اسم المادة</span>
                    <span className="text-[10px] text-slate-500 mt-1">اسم المقرر (مثال: تصميم معماري 1)</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-50 flex flex-col items-end">
                    <span className="font-bold text-indigo-700">السنة الدراسية</span>
                    <span className="text-[10px] text-slate-500 mt-1">رقم من 1-5 أو الكلمة (الأولى - الخامسة)</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-50 flex flex-col items-end">
                    <span className="font-bold text-indigo-700">تاريخ المادة</span>
                    <span className="text-[10px] text-slate-500 mt-1">التاريخ بتنسيق سنة-شهر-يوم (YYYY-MM-DD)</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-50 flex flex-col items-end">
                    <span className="font-bold text-indigo-700">وقت البدء</span>
                    <span className="text-[10px] text-slate-500 mt-1">بتنسيق 24 ساعة (مثال: 09:00 أو 13:30)</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-indigo-50 flex flex-col items-end col-span-2 lg:col-span-1">
                    <span className="font-bold text-indigo-700">مدة الامتحان</span>
                    <span className="text-[10px] text-slate-500 mt-1">مدة الامتحان بالساعات (مثال: ساعتان أو 3 ساعات أو 2)</span>
                  </div>
                </div>

                {/* Example Representation */}
                <div className="border border-indigo-100 rounded-xl overflow-hidden bg-white">
                   <div className="bg-indigo-600/5 px-3 py-1.5 border-b border-indigo-100 text-[11px] font-bold text-indigo-800 text-center">
                    مثال عن جدول ملف الاكسل المطلوب
                  </div>
                  <table className="w-full text-center text-[10px] border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-indigo-50 text-slate-600 font-bold">
                        <th className="p-2 border-l border-indigo-50">اسم المادة</th>
                        <th className="p-2 border-l border-indigo-50">السنة الدراسية</th>
                        <th className="p-2 border-l border-indigo-50">تاريخ المادة</th>
                        <th className="p-2 border-l border-indigo-50">وقت البدء</th>
                        <th className="p-2">مدة الامتحان</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-100 text-slate-700">
                        <td className="p-2 border-l border-indigo-50 font-medium">تصميم داخلي 3</td>
                        <td className="p-2 border-l border-indigo-50">الثالثة</td>
                        <td className="p-2 border-l border-indigo-50">2026-07-15</td>
                        <td className="p-2 border-l border-indigo-50">09:00</td>
                        <td className="p-2">ساعتان</td>
                      </tr>
                      <tr className="text-slate-700">
                        <td className="p-2 border-l border-indigo-50 font-medium font-sans">تاريخ العمارة 1</td>
                        <td className="p-2 border-l border-indigo-50">الأولى</td>
                        <td className="p-2 border-l border-indigo-50">2026-07-16</td>
                        <td className="p-2 border-l border-indigo-50">13:30</td>
                        <td className="p-2">ساعة واحدة</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Upload input area */}
              <div className="relative border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-2xl p-6 transition-all flex flex-col items-center justify-center bg-slate-50 hover:bg-indigo-50/10 cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCSVUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
                <Upload size={32} className="text-slate-400 mb-2" />
                <span className="text-sm font-bold text-slate-700">اسحب ملف الـ CSV هنا أو اضغط للاختيار</span>
                <span className="text-xs text-slate-400 mt-1">ملاحظة: يمكنك حفظ ملف الاكسل الخاص بك كـ CSV (Comma delimited) لرفعه هنا</span>
              </div>

              {/* Status alerts */}
              {importError && (
                <div className="p-4 bg-red-50 border border-red-100 text-red-700 text-xs font-bold rounded-xl flex items-center gap-2 flex-row-reverse">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {importSuccess && (
                <div className="p-4 bg-green-50 border border-green-100 text-green-700 text-xs font-bold rounded-xl flex items-center gap-2 flex-row-reverse">
                  <Check size={16} className="shrink-0 animate-bounce" />
                  <span>{importSuccess}</span>
                </div>
              )}

              {/* Parsed slots preview table */}
              {parsedSlots.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800">معاينة المواد والتحليل قبل الإنشاء والرفع:</h4>
                  <div className="border border-slate-100 rounded-xl overflow-x-auto touch-pan-x max-h-52 overflow-y-auto">
                    <table className="w-full text-right text-xs min-w-[550px] md:min-w-full">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-100">
                          <th className="p-2 text-right">اسم المادة</th>
                          <th className="p-2 text-right">السنة</th>
                          <th className="p-2 text-right">التاريخ والوقت</th>
                          <th className="p-2 text-right">الفترة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {parsedSlots.map((s, idx) => {
                          const yearNamesShort = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-2 text-slate-800 font-bold">{s.course_name}</td>
                              <td className="p-2 text-slate-500 font-semibold">السنة {yearNamesShort[s.academic_year - 1] || s.academic_year}</td>
                              <td className="p-2 text-slate-500 font-medium">
                                <div>{s.exam_date}</div>
                                <div className="text-[10px] text-slate-400">{s.start_time} - {s.end_time}</div>
                              </td>
                              <td className="p-2">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  s.session_type === 'morning' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'
                                }`}>
                                  {s.session_type === 'morning' ? 'صباحي' : 'مسائي'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button
                type="button"
                disabled={parsedSlots.length === 0 || importLoading}
                onClick={handleImportSlots}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 text-sm shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    <span>جاري تحليل وإنشاء الفترات...</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    <span>إنشاء وتحليل الفترات ({parsedSlots.length})</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="flex-1 bg-white border border-slate-200 text-slate-700 py-3 rounded-xl font-bold hover:bg-slate-50 transition-colors text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
