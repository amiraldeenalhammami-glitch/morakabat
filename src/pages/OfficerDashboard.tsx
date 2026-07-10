import React, { useState, useEffect } from 'react';
import { collection, doc, onSnapshot, updateDoc, setDoc, getDoc, addDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { ExamSlot, AppSettings, StudentExamResult, Booking, UserProfile, RoomRange } from '../types';
import { parseCSVToStudentDistribution } from '../utils/studentDistributionParser';
import { parseCSVToStudentResults } from '../utils/studentResultsParser';
import { compileAndPublishSchedule } from '../utils/publicSchedule';
import { getSlotRooms } from '../utils/roomUtils';
import { parseCSVToSlots } from '../utils/csvParser';
import { 
  Calendar, 
  Settings, 
  Upload, 
  Eye, 
  CheckCircle, 
  XCircle, 
  FileSpreadsheet, 
  AlertCircle, 
  Clock, 
  HelpCircle, 
  X, 
  RefreshCw, 
  Trophy, 
  Database,
  ArrowRight,
  EyeOff,
  Trash2,
  Shield,
  ChevronDown,
  ChevronUp,
  Plus,
  Edit2,
  Download,
  Loader2
} from 'lucide-react';
import PublicLanding from './PublicLanding';
import SecurityConfirmModal from '../components/SecurityConfirmModal';

export default function OfficerDashboard() {
  const { profile } = useAuth();
  const [slots, setSlots] = useState<ExamSlot[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'schedule' | 'settings' | 'exam_slots' | 'preview'>('schedule');

  // Expanded/collapsed states for each year
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({
    1: true,
    2: true,
    3: true,
    4: true,
    5: true
  });

  const toggleYear = (year: number) => {
    setExpandedYears(prev => ({
      ...prev,
      [year]: !prev[year]
    }));
  };

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'distribution' | 'results'>('distribution');
  const [selectedSlot, setSelectedSlot] = useState<ExamSlot | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSuccess, setPreviewSuccess] = useState<string | null>(null);
  const [parsedDistribution, setParsedDistribution] = useState<{ exam_number: string; student_name: string; room: string }[]>([]);
  const [parsedResults, setParsedResults] = useState<StudentExamResult[]>([]);
  const [saveLoading, setSaveLoading] = useState(false);

  // Viewing synchronized current table state
  const [viewingData, setViewingData] = useState<{ type: 'distribution' | 'results'; slot: ExamSlot } | null>(null);

  // Security Modal State
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

  const handleRequestDelete = (type: 'distribution' | 'results', slot: ExamSlot) => {
    if (type === 'distribution') {
      requestSecurityConfirm(
        async () => {
          try {
            await updateDoc(doc(db, 'exam_slots', slot.id), {
              student_distribution: []
            });
            await compileAndPublishSchedule();
            alert('تم حذف توزيع الطلاب لهذه المادة بنجاح.');
          } catch (err: any) {
            alert('فشل في حذف توزيع الطلاب: ' + err.message);
          }
        },
        'حذف توزيع قاعات الطلاب',
        'يرجى إدخال كلمة المرور الموحدة المعتمدة من السوبر أدمن لتأكيد حذف جدول توزيع الطلاب.'
      );
    } else {
      requestSecurityConfirm(
        async () => {
          try {
            await updateDoc(doc(db, 'exam_slots', slot.id), {
              exam_results: []
            });
            await compileAndPublishSchedule();
            alert('تم حذف نتائج الطلاب لهذه المادة بنجاح.');
          } catch (err: any) {
            alert('فشل في حذف نتائج الطلاب: ' + err.message);
          }
        },
        'حذف نتائج وعلامات الطلاب',
        'يرجى إدخال كلمة المرور الموحدة المعتمدة من السوبر أدمن لتأكيد حذف جدول علامات ونتائج الطلاب.'
      );
    }
  };

  // Settings modification states
  const [savingSettings, setSavingSettings] = useState(false);

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [students, setStudents] = useState<UserProfile[]>([]);

  // Slots Management states
  const [isSlotsModalOpen, setIsSlotsModalOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ExamSlot | null>(null);
  const [expandedSlotsYear, setExpandedSlotsYear] = useState<number | null>(1);

  // CSV Import States for Schedule
  const [isScheduleUploadModalOpen, setIsScheduleUploadModalOpen] = useState(false);
  const [parsedSlots, setParsedSlots] = useState<any[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  // Form State for adding/editing a slot
  const [slotsFormData, setSlotsFormData] = useState({
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
    room_ranges: [] as RoomRange[],
  });

  useEffect(() => {
    // Load Settings
    const unsubscribeSettings = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as AppSettings);
      }
    });

    // Load Exam Slots (including deleted ones so we can restore them)
    const unsubscribeSlots = onSnapshot(collection(db, 'exam_slots'), (snapshot) => {
      const activeSlots = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() } as ExamSlot));
      setSlots(activeSlots);
      setLoading(false);
    });

    // Load Bookings for quota checking
    const unsubscribeBookings = onSnapshot(collection(db, 'bookings'), (snapshot) => {
      setBookings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Booking)));
    });

    // Load Users (Students) for quota checking
    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setStudents(snapshot.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(u => u.role === 'student' && u.email !== "amiraldeenalhammami@ab3adacademy.com")
      );
    });

    return () => {
      unsubscribeSettings();
      unsubscribeSlots();
      unsubscribeBookings();
      unsubscribeUsers();
    };
  }, []);

  const readCSVFile = (file: File, callback: (text: string) => void) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        if (!arrayBuffer) {
          setPreviewError('فشل في قراءة محتوى الملف.');
          return;
        }
        let text = '';
        try {
          const decoder = new TextDecoder('utf-8', { fatal: true });
          text = decoder.decode(arrayBuffer);
        } catch (utf8Error) {
          try {
            const decoder = new TextDecoder('windows-1256');
            text = decoder.decode(arrayBuffer);
          } catch (winError) {
            const decoder = new TextDecoder('utf-8');
            text = decoder.decode(arrayBuffer);
          }
        }
        callback(text);
      } catch (err) {
        console.error(err);
        setPreviewError('حدث خطأ أثناء معالجة الملف.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreviewError(null);
    setPreviewSuccess(null);
    setParsedDistribution([]);
    setParsedResults([]);

    readCSVFile(selectedFile, (text) => {
      if (!text.trim()) {
        setPreviewError('الملف فارغ أو غير صالح.');
        return;
      }

      if (modalType === 'distribution') {
        const list = parseCSVToStudentDistribution(text);
        if (list.length === 0) {
          setPreviewError('لم يتم العثور على بيانات توزيع طلاب صالحة. يرجى مراجعة إرشادات تنسيق الأعمدة الثلاثة.');
        } else {
          setParsedDistribution(list);
          setPreviewSuccess(`تم بنجاح تحليل ${list.length} سجل لتوزيع قاعات الطلاب! جاهز للحفظ.`);
        }
      } else {
        const list = parseCSVToStudentResults(text);
        if (list.length === 0) {
          setPreviewError('لم يتم العثور على نتائج طلاب صالحة. يرجى التحقق من صياغة الملف.');
        } else {
          setParsedResults(list);
          setPreviewSuccess(`تم بنجاح تحليل ${list.length} سجل لنتائج علامات الطلاب! جاهز للرفع.`);
        }
      }
    });
  };

  const handleSaveUpload = async () => {
    if (!selectedSlot) return;
    setSaveLoading(true);

    try {
      if (modalType === 'distribution') {
        if (parsedDistribution.length === 0) return;
        await updateDoc(doc(db, 'exam_slots', selectedSlot.id), {
          student_distribution: parsedDistribution
        });
        await compileAndPublishSchedule();
        alert(`تم بنجاح حفظ وتحديث توزيع قاعات الطلاب لـ ${parsedDistribution.length} طالب!`);
      } else {
        if (parsedResults.length === 0) return;
        await updateDoc(doc(db, 'exam_slots', selectedSlot.id), {
          exam_results: parsedResults
        });
        await compileAndPublishSchedule();
        alert(`تم بنجاح حفظ وتحديث نتائج علامات الطلاب لـ ${parsedResults.length} طالب!`);
      }
      setIsModalOpen(false);
      setFile(null);
      setParsedDistribution([]);
      setParsedResults([]);
    } catch (err: any) {
      alert('حدث خطأ أثناء حفظ البيانات: ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleToggleSetting = async (field: 'show_public_schedule' | 'show_public_results') => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const updated = {
        ...settings,
        [field]: !settings[field]
      };
      await setDoc(doc(db, 'settings', 'global'), updated);
      await compileAndPublishSchedule();
    } catch (err: any) {
      alert('فشل في حفظ التغيير: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleUpdateUnlockHours = async (hours: number) => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const updated = {
        ...settings,
        distribution_unlock_hours: hours
      };
      await setDoc(doc(db, 'settings', 'global'), updated);
    } catch (err: any) {
      alert('فشل في تعديل الساعات: ' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const openUploadModal = (type: 'distribution' | 'results', slot: ExamSlot) => {
    setModalType(type);
    setSelectedSlot(slot);
    setFile(null);
    setPreviewError(null);
    setPreviewSuccess(null);
    setParsedDistribution([]);
    setParsedResults([]);
    setIsModalOpen(true);
  };

  // Group slots by academic year, sorted by date (oldest first) then start time
  const groupedSlots = [1, 2, 3, 4, 5].reduce((acc, year) => {
    acc[year] = slots
      .filter(s => s.academic_year === year && s.isDeleted !== true)
      .sort((a, b) => {
        const dateA = a.exam_date || '';
        const dateB = b.exam_date || '';
        const dateCompare = dateA.localeCompare(dateB);
        if (dateCompare !== 0) return dateCompare;
        
        const timeA = a.start_time || '';
        const timeB = b.start_time || '';
        return timeA.localeCompare(timeB);
      });
    return acc;
  }, {} as Record<number, ExamSlot[]>);

  // Slots Management helpers
  const getRoomsCount = (data: typeof slotsFormData) => {
    if (data.room_ranges && data.room_ranges.length > 0) {
      return data.room_ranges.reduce((acc, range) => {
        if (range.to >= range.from) {
          return acc + (range.to - range.from + 1);
        }
        return acc;
      }, 0);
    }

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

  const resetSlotsForm = () => {
    setSlotsFormData({
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
      room_ranges: [] as RoomRange[],
    });
  };

  const getRoomRangesFromSlot = (slot: ExamSlot): RoomRange[] => {
    if (slot.room_ranges && Array.isArray(slot.room_ranges)) {
      return slot.room_ranges;
    }
    const ranges: RoomRange[] = [];
    if (slot.has_studios) {
      ranges.push({ type: 'المرسم', from: Number(slot.studios_from) || 1, to: Number(slot.studios_to) || 8 });
    }
    if (slot.has_lobbies) {
      ranges.push({ type: 'البهو', from: Number(slot.lobbies_from) || 1, to: Number(slot.lobbies_to) || 3 });
    }
    if (slot.has_basements) {
      ranges.push({ type: 'القبو', from: Number(slot.basements_from) || 1, to: Number(slot.basements_to) || 3 });
    }
    if (slot.has_halls) {
      ranges.push({ type: 'القاعات', from: Number(slot.halls_from) || 1, to: Number(slot.halls_to) || 2 });
    }
    if (slot.has_expansions) {
      ranges.push({ type: 'التوسع', from: Number(slot.expansions_from) || 1, to: Number(slot.expansions_to) || 6 });
    }
    return ranges;
  };

  const openAddSlot = () => {
    setEditingSlot(null);
    resetSlotsForm();
    setIsSlotsModalOpen(true);
  };

  const openEditSlot = (slot: ExamSlot) => {
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

    setSlotsFormData({
      course_name: slot.course_name,
      exam_date: slot.exam_date,
      start_time: slot.start_time,
      end_time: slot.end_time,
      session_type: slot.session_type as any,
      required_invigilators: slot.required_invigilators ?? 2,
      location: slot.location || '',
      academic_year: slot.academic_year as any,
      duration_hours: slot.duration_hours !== undefined ? slot.duration_hours : fallbackDuration,
      observers_per_room: slot.observers_per_room !== undefined ? slot.observers_per_room : 3,
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
      room_ranges: getRoomRangesFromSlot(slot),
    });
    setIsSlotsModalOpen(true);
  };

  const addRoomRange = () => {
    const updatedRanges = [
      ...slotsFormData.room_ranges,
      { type: 'المرسم' as const, from: 1, to: 1 }
    ];
    setSlotsFormData({ ...slotsFormData, room_ranges: updatedRanges });
  };

  const updateRoomRange = (index: number, field: keyof RoomRange, value: any) => {
    const updatedRanges = slotsFormData.room_ranges.map((range, idx) => {
      if (idx === index) {
        return { ...range, [field]: value };
      }
      return range;
    });
    setSlotsFormData({ ...slotsFormData, room_ranges: updatedRanges });
  };

  const removeRoomRange = (index: number) => {
    const updatedRanges = slotsFormData.room_ranges.filter((_, idx) => idx !== index);
    setSlotsFormData({ ...slotsFormData, room_ranges: updatedRanges });
  };

  const handleSlotsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveLoading(true);
    try {
      const roomsCount = getRoomsCount(slotsFormData);
      const reqInvigilators = roomsCount > 0 
        ? (roomsCount * slotsFormData.observers_per_room) 
        : slotsFormData.required_invigilators;

      const has_studios = slotsFormData.room_ranges.some(r => r.type === 'المرسم');
      const studios_range = slotsFormData.room_ranges.find(r => r.type === 'المرسم');
      const studios_from = studios_range ? studios_range.from : (slotsFormData.has_studios ? slotsFormData.studios_from : 1);
      const studios_to = studios_range ? studios_range.to : (slotsFormData.has_studios ? slotsFormData.studios_to : 8);

      const has_lobbies = slotsFormData.room_ranges.some(r => r.type === 'البهو');
      const lobbies_range = slotsFormData.room_ranges.find(r => r.type === 'البهو');
      const lobbies_from = lobbies_range ? lobbies_range.from : (slotsFormData.has_lobbies ? slotsFormData.lobbies_from : 1);
      const lobbies_to = lobbies_range ? lobbies_range.to : (slotsFormData.has_lobbies ? slotsFormData.lobbies_to : 3);

      const has_basements = slotsFormData.room_ranges.some(r => r.type === 'القبو');
      const basements_range = slotsFormData.room_ranges.find(r => r.type === 'القبو');
      const basements_from = basements_range ? basements_range.from : (slotsFormData.has_basements ? slotsFormData.basements_from : 1);
      const basements_to = basements_range ? basements_range.to : (slotsFormData.has_basements ? slotsFormData.basements_to : 3);

      const has_halls = slotsFormData.room_ranges.some(r => r.type === 'القاعات');
      const halls_range = slotsFormData.room_ranges.find(r => r.type === 'القاعات');
      const halls_from = halls_range ? halls_range.from : (slotsFormData.has_halls ? slotsFormData.halls_from : 1);
      const halls_to = halls_range ? halls_range.to : (slotsFormData.has_halls ? slotsFormData.halls_to : 2);

      const has_expansions = slotsFormData.room_ranges.some(r => r.type === 'التوسع');
      const expansions_range = slotsFormData.room_ranges.find(r => r.type === 'التوسع');
      const expansions_from = expansions_range ? expansions_range.from : (slotsFormData.has_expansions ? slotsFormData.expansions_from : 1);
      const expansions_to = expansions_range ? expansions_range.to : (slotsFormData.has_expansions ? slotsFormData.expansions_to : 6);

      const data = {
        ...slotsFormData,
        has_studios,
        studios_from,
        studios_to,
        has_lobbies,
        lobbies_from,
        lobbies_to,
        has_basements,
        basements_from,
        basements_to,
        has_halls,
        halls_from,
        halls_to,
        has_expansions,
        expansions_from,
        expansions_to,
        required_invigilators: reqInvigilators,
        current_invigilators: editingSlot?.current_invigilators || 0
      };

      if (editingSlot) {
        await updateDoc(doc(db, 'exam_slots', editingSlot.id), data);
      } else {
        // Check if there is an existing deleted slot with the same course_name and academic_year
        const existingDeletedSlot = slots.find(s => 
          s.isDeleted && 
          s.course_name.trim() === slotsFormData.course_name.trim() && 
          s.academic_year === slotsFormData.academic_year
        );

        if (existingDeletedSlot) {
          // Found a deleted slot! Restore it and remap bookings
          const slotBookingsToProcess = bookings.filter(b => b.slot_id === existingDeletedSlot.id);
          
          for (const booking of slotBookingsToProcess) {
            const student = students.find(u => u.uid === booking.student_id);
            const defaultReqHours = settings?.default_required_hours ?? 16;
            const requiredHours = Number(student?.required_hours_mode === 'manual' ? (student?.required_hours ?? defaultReqHours) : defaultReqHours);
            
            const studentOtherBookings = bookings.filter(b => b.student_id === booking.student_id && b.slot_id !== existingDeletedSlot.id);
            const otherActiveHours = studentOtherBookings.reduce((sum, b) => {
              const otherSlot = slots.find(s => s.id === b.slot_id);
              if (otherSlot && !otherSlot.isDeleted) {
                return sum + Math.abs(Number(b.booked_hours || 0));
              }
              return sum;
            }, 0);
            
            const newSlotHours = Number(slotsFormData.duration_hours) || 2;
            
            if (otherActiveHours + newSlotHours > requiredHours) {
              await deleteDoc(doc(db, 'bookings', booking.id));
            } else {
              if (booking.booked_hours !== newSlotHours) {
                await updateDoc(doc(db, 'bookings', booking.id), { booked_hours: newSlotHours });
              }
            }
          }

          await updateDoc(doc(db, 'exam_slots', existingDeletedSlot.id), {
            ...data,
            isDeleted: false
          });
        } else {
          await addDoc(collection(db, 'exam_slots'), {
            ...data,
            isDeleted: false
          });
        }
      }

      try {
        await compileAndPublishSchedule();
      } catch (compileErr) {
        console.error("Failed to auto-compile schedule:", compileErr);
      }

      setIsSlotsModalOpen(false);
      setEditingSlot(null);
      resetSlotsForm();
    } catch (err: any) {
      alert('حدث خطأ أثناء حفظ الفترة: ' + err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDeleteSlotDirect = async (slotId: string, courseName: string) => {
    if (!confirm(`هل أنت متأكد من حذف مادة: ${courseName}؟`)) return;
    try {
      await updateDoc(doc(db, 'exam_slots', slotId), { isDeleted: true });
      try {
        await compileAndPublishSchedule();
      } catch (compileErr) {
        console.error("Failed to auto-compile schedule after delete:", compileErr);
      }
    } catch (err: any) {
      alert('فشل في حذف المادة: ' + err.message);
    }
  };

  const handleScheduleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileObj = e.target.files?.[0];
    if (!fileObj) return;

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
        try {
          const decoder = new TextDecoder('utf-8', { fatal: true });
          text = decoder.decode(arrayBuffer);
        } catch (utf8Error) {
          try {
            const decoder = new TextDecoder('windows-1256');
            text = decoder.decode(arrayBuffer);
          } catch (winError) {
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
    reader.readAsArrayBuffer(fileObj);
  };

  const handleImportSlotsSchedule = async () => {
    if (parsedSlots.length === 0) return;
    setImportLoading(true);
    setImportError(null);
    try {
      for (const s of parsedSlots) {
        const existingDeletedSlot = slots.find(item => 
          item.isDeleted && 
          item.course_name.trim() === s.course_name.trim() && 
          item.academic_year === s.academic_year
        );

        if (existingDeletedSlot) {
          const slotBookingsToProcess = bookings.filter(b => b.slot_id === existingDeletedSlot.id);
          
          for (const booking of slotBookingsToProcess) {
            const student = students.find(u => u.uid === booking.student_id);
            const defaultReqHours = settings?.default_required_hours ?? 16;
            const requiredHours = Number(student?.required_hours_mode === 'manual' ? (student?.required_hours ?? defaultReqHours) : defaultReqHours);
            
            const studentOtherBookings = bookings.filter(b => b.student_id === booking.student_id && b.slot_id !== existingDeletedSlot.id);
            const otherActiveHours = studentOtherBookings.reduce((sum, b) => {
              const otherSlot = slots.find(slotItem => slotItem.id === b.slot_id);
              if (otherSlot && !otherSlot.isDeleted) {
                return sum + Math.abs(Number(b.booked_hours || 0));
              }
              return sum;
            }, 0);
            
            const newSlotHours = Number(s.duration_hours) || 2;
            
            if (otherActiveHours + newSlotHours > requiredHours) {
              await deleteDoc(doc(db, 'bookings', booking.id));
            } else {
              if (booking.booked_hours !== newSlotHours) {
                await updateDoc(doc(db, 'bookings', booking.id), { booked_hours: newSlotHours });
              }
            }
          }

          await updateDoc(doc(db, 'exam_slots', existingDeletedSlot.id), {
            course_name: s.course_name,
            academic_year: s.academic_year,
            exam_date: s.exam_date,
            start_time: s.start_time,
            end_time: s.end_time,
            session_type: s.session_type,
            duration_hours: s.duration_hours || 2,
            isDeleted: false
          });
        } else {
          await addDoc(collection(db, 'exam_slots'), {
            course_name: s.course_name,
            academic_year: s.academic_year,
            exam_date: s.exam_date,
            start_time: s.start_time,
            end_time: s.end_time,
            session_type: s.session_type,
            duration_hours: s.duration_hours || 2,
            required_invigilators: 2,
            observers_per_room: 3,
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
            isDeleted: false
          });
        }
      }
      try {
        await compileAndPublishSchedule();
      } catch (compileErr) {
        console.error("Failed to auto-compile schedule after import:", compileErr);
      }
      alert(`تم استيراد ${parsedSlots.length} فترة امتحانية بنجاح!`);
      setIsScheduleUploadModalOpen(false);
      setParsedSlots([]);
      setImportSuccess(null);
    } catch (err: any) {
      setImportError('حدث خطأ أثناء حفظ الفترات في قاعدة البيانات: ' + err.message);
      console.error(err);
    } finally {
      setImportLoading(false);
    }
  };

  const handleExportSlotsCSV = () => {
    const headers = ['اسم المادة', 'السنة الدراسية', 'تاريخ المادة', 'وقت البدء', 'مدة الامتحان'];
    const years = [1, 2, 3, 4, 5];

    let csvRows: string[] = [];
    csvRows.push('النسخة النهائية من البرنامج الامتحاني');
    csvRows.push('');
    csvRows.push(headers.join(','));
    
    years.forEach((yr) => {
      const yearSlots = slots
        .filter(s => s.academic_year === yr && !s.isDeleted)
        .sort((a, b) => a.exam_date.localeCompare(b.exam_date));
        
      if (yearSlots.length > 0) {
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
        csvRows.push('');
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

  const getRoomsSummary = (slot: ExamSlot) => {
    const rooms = getSlotRooms(slot);
    if (rooms.length === 0) return 'قاعة عامة';
    
    const ranges = getRoomRangesFromSlot(slot);
    if (ranges.length === 0) return `قاعات (${rooms.length})`;
    
    return ranges.map(r => `${r.type} (${r.from}-${r.to})`).join('، ');
  };

  const yearNames = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة'];

  if (loading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-600" size={36} />
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans text-right" dir="rtl">
      {/* Banner */}
      <div className="bg-gradient-to-r from-purple-800 to-indigo-950 text-white rounded-3xl p-6 shadow-md border border-indigo-900/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <span className="bg-purple-600/30 text-purple-200 border border-purple-500/30 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-wider">
            صلاحيات: موظف امتحانات
          </span>
          <h1 className="text-2xl font-black mt-2 leading-tight">لوحة تحكم شؤون الامتحانات</h1>
          <p className="text-xs text-indigo-200 mt-1">إدخال جداول توزيع قاعات الطلاب، ترفيع العلامات والنتائج، وإدارة إعدادات الظهور للعامة.</p>
        </div>
        <div className="bg-white/10 px-4 py-2.5 rounded-2xl border border-white/10 text-xs font-mono">
          المستخدم الحالي: <span className="font-bold text-yellow-300">{profile?.name}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100 bg-white p-1.5 rounded-2xl shadow-xs gap-1 flex-wrap">
        <button
          onClick={() => setActiveTab('schedule')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'schedule' 
              ? 'bg-purple-600 text-white shadow-md shadow-purple-100' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Database size={18} />
          <span>إدارة واجهة الطلاب</span>
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'settings' 
              ? 'bg-purple-600 text-white shadow-md shadow-purple-100' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Settings size={18} />
          <span>إعدادات الظهور</span>
        </button>
        <button
          onClick={() => setActiveTab('exam_slots')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'exam_slots' 
              ? 'bg-purple-600 text-white shadow-md shadow-purple-100' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Calendar size={18} />
          <span>البرنامج الامتحاني</span>
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all ${
            activeTab === 'preview' 
              ? 'bg-purple-600 text-white shadow-md shadow-purple-100' 
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Eye size={18} />
          <span>المعاينة الذكية للواجهة العامة</span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-xs">
            <h2 className="text-lg font-black text-slate-900 mb-2">إدارة ترفيع الجداول الامتحانية والطلابية</h2>
            <p className="text-xs text-slate-500">اختر السنة الدراسية للوصول إلى المواد المقررة ورفع جداولها مباشرة.</p>
          </div>

          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((year) => {
              const yearSlots = groupedSlots[year] || [];
              return (
                <div key={year} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs space-y-4">
                  {/* Clickable Header for Collapsible Year Section */}
                  <div 
                    onClick={() => toggleYear(year)}
                    className="flex items-center justify-between cursor-pointer select-none group transition-all"
                    role="button"
                    aria-expanded={expandedYears[year]}
                  >
                    <div className="flex items-center gap-3">
                      <span className="p-1 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center text-slate-500 group-hover:text-purple-600">
                        {expandedYears[year] ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </span>
                      <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2 group-hover:text-purple-700 transition-colors">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                        <span>السنة {yearNames[year - 1]}</span>
                      </h3>
                    </div>
                    <span className="text-xs bg-slate-100 group-hover:bg-purple-50 group-hover:text-purple-700 px-3 py-1 rounded-full text-slate-600 font-bold transition-all">
                      {yearSlots.length} مواد امتحانية
                    </span>
                  </div>

                  {/* Collapsible content container */}
                  {expandedYears[year] && (
                    <div className="pt-4 border-t border-slate-100 animate-in fade-in duration-200">
                      {yearSlots.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-4">لا توجد مواد مضافة بعد في هذه السنة.</p>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {yearSlots.map((slot) => {
                            const hasDist = slot.student_distribution && slot.student_distribution.length > 0;
                            const hasResults = slot.exam_results && slot.exam_results.length > 0;

                            return (
                              <div key={slot.id} className="py-4 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                                {/* Course Details */}
                                <div className="space-y-1">
                                  <h4 className="font-bold text-slate-900 text-sm">{slot.course_name}</h4>
                                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                    <span className="inline-flex items-center gap-1">
                                      <Clock size={13} className="text-slate-400" />
                                      <span>{slot.exam_date}</span>
                                    </span>
                                    <span className="text-slate-300">|</span>
                                    <span>من {slot.start_time} إلى {slot.end_time}</span>
                                  </div>
                                  <div className="flex flex-wrap gap-2 pt-1.5">
                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg ${
                                      hasDist ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${hasDist ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                                      <span>توزيع القاعات: {hasDist ? `مرفوع (${slot.student_distribution?.length} طالب)` : 'لم يرفع بعد'}</span>
                                    </span>
                                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg ${
                                      hasResults ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
                                    }`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${hasResults ? 'bg-purple-500 animate-pulse' : 'bg-rose-500'}`} />
                                      <span>النتائج: {hasResults ? `صدرت (${slot.exam_results?.length} طالب)` : 'لم تصدر بعد'}</span>
                                    </span>
                                  </div>
                                </div>

                                {/* Buttons */}
                                <div className="flex flex-wrap items-center gap-2">
                                  {/* Distribution Buttons */}
                                  <div className="flex items-center gap-1.5 bg-emerald-50/30 p-1.5 rounded-2xl border border-emerald-100/50">
                                    <button
                                      onClick={() => openUploadModal('distribution', slot)}
                                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all shadow-xs"
                                    >
                                      <Upload size={14} />
                                      <span>{hasDist ? 'تحديث التوزيع (CSV)' : 'رفع التوزيع (CSV)'}</span>
                                    </button>
                                    {hasDist && (
                                      <>
                                        <button
                                          onClick={() => setViewingData({ type: 'distribution', slot })}
                                          className="flex items-center gap-1 bg-white hover:bg-slate-50 text-emerald-700 border border-emerald-200 text-xs font-bold px-3 py-2.5 rounded-xl transition-all shadow-xs"
                                          title="عرض جدول التوزيع الحالي المتزامن"
                                        >
                                          <Eye size={13} />
                                          <span>عرض</span>
                                        </button>
                                        <button
                                          onClick={() => handleRequestDelete('distribution', slot)}
                                          className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100"
                                          title="حذف جدول التوزيع"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>

                                  {/* Results Buttons */}
                                  <div className="flex items-center gap-1.5 bg-purple-50/30 p-1.5 rounded-2xl border border-purple-100/50">
                                    <button
                                      onClick={() => openUploadModal('results', slot)}
                                      className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition-all shadow-xs"
                                    >
                                      <Upload size={14} />
                                      <span>{hasResults ? 'تحديث النتائج (CSV)' : 'رفع النتائج (CSV)'}</span>
                                    </button>
                                    {hasResults && (
                                      <>
                                        <button
                                          onClick={() => setViewingData({ type: 'results', slot })}
                                          className="flex items-center gap-1 bg-white hover:bg-slate-50 text-purple-700 border border-purple-200 text-xs font-bold px-3 py-2.5 rounded-xl transition-all shadow-xs"
                                          title="عرض جدول النتائج الحالي المتزامن"
                                        >
                                          <Eye size={13} />
                                          <span>عرض</span>
                                        </button>
                                        <button
                                          onClick={() => handleRequestDelete('results', slot)}
                                          className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors border border-transparent hover:border-red-100"
                                          title="حذف جدول النتائج"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'exam_slots' && (
        <div className="space-y-6">
          {/* Header Action Card */}
          <div className="bg-white border border-slate-100 p-6 rounded-3xl shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-900 mb-1">البرنامج الامتحاني وجدول الفترات</h2>
              <p className="text-xs text-slate-500">إدارة المواد الامتحانية والفترات الزمنية وتوزيع قاعاتها للمراقبين دون تداخل.</p>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button
                onClick={openAddSlot}
                className="flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-md shadow-purple-100 flex-1 sm:flex-none"
              >
                <Plus size={16} />
                <span>إضافة مادة جديدة</span>
              </button>
              <button
                onClick={() => {
                  setImportError(null);
                  setImportSuccess(null);
                  setParsedSlots([]);
                  setIsScheduleUploadModalOpen(true);
                }}
                className="flex items-center justify-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs px-4 py-2.5 rounded-xl transition-all border border-indigo-100/50 flex-1 sm:flex-none"
              >
                <Upload size={16} />
                <span>رفع جدول المواد (CSV)</span>
              </button>
              <button
                onClick={handleExportSlotsCSV}
                className="flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs px-4 py-2.5 rounded-xl transition-all border border-slate-200/60 flex-1 sm:flex-none"
              >
                <Download size={16} />
                <span>تصدير المواد</span>
              </button>
            </div>
          </div>

          {/* Years Accordion List */}
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((year) => {
              const yearSlots = slots
                .filter(s => s.academic_year === year && s.isDeleted !== true)
                .sort((a, b) => {
                  const dateA = a.exam_date || '';
                  const dateB = b.exam_date || '';
                  const dateCompare = dateA.localeCompare(dateB);
                  if (dateCompare !== 0) return dateCompare;
                  
                  const timeA = a.start_time || '';
                  const timeB = b.start_time || '';
                  return timeA.localeCompare(timeB);
                });

              const isExpanded = expandedSlotsYear === year;

              return (
                <div key={year} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs space-y-4">
                  {/* Clickable Header */}
                  <div 
                    onClick={() => setExpandedSlotsYear(isExpanded ? null : year)}
                    className="flex items-center justify-between cursor-pointer select-none group transition-all"
                    role="button"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex items-center gap-3">
                      <span className="p-1 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center text-slate-500 group-hover:text-purple-600">
                        {isExpanded ? (
                          <ChevronUp size={20} />
                        ) : (
                          <ChevronDown size={20} />
                        )}
                      </span>
                      <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2 group-hover:text-purple-700 transition-colors">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                        <span>السنة {yearNames[year - 1]}</span>
                      </h3>
                    </div>
                    <span className="text-xs bg-slate-100 group-hover:bg-purple-50 group-hover:text-purple-700 px-3 py-1 rounded-full text-slate-600 font-bold transition-all">
                      {yearSlots.length} مواد امتحانية مقررة
                    </span>
                  </div>

                  {/* Collapsible Content */}
                  {isExpanded && (
                    <div className="pt-4 border-t border-slate-100 animate-in fade-in duration-200 overflow-x-auto">
                      {yearSlots.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-6">لا توجد مواد مضافة بعد في هذه السنة.</p>
                      ) : (
                        <table className="w-full text-right text-xs">
                          <thead>
                            <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-100">
                              <th className="p-3 text-right">المادة والنوع</th>
                              <th className="p-3 text-right">التاريخ والوقت</th>
                              <th className="p-3 text-right">القاعات والمواقع</th>
                              <th className="p-3 text-center">الإجراءات</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {yearSlots.map((slot) => (
                              <tr key={slot.id} className="hover:bg-slate-50/50">
                                {/* Course Name & Session */}
                                <td className="p-3">
                                  <div className="font-extrabold text-slate-900 text-sm">{slot.course_name}</div>
                                  <div className="mt-0.5">
                                    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-md ${
                                      slot.session_type === 'evening' 
                                        ? 'bg-amber-50 text-amber-700 border border-amber-100/60' 
                                        : 'bg-blue-50 text-blue-700 border border-blue-100/60'
                                    }`}>
                                      {slot.session_type === 'evening' ? 'فترة مسائية' : 'فترة صباحية'}
                                    </span>
                                  </div>
                                </td>

                                {/* Date & Time */}
                                <td className="p-3 space-y-0.5">
                                  <div className="font-bold text-slate-700">{slot.exam_date}</div>
                                  <div className="text-slate-500 flex items-center gap-1.5">
                                    <Clock size={12} className="text-slate-400" />
                                    <span>
                                      من {slot.start_time} إلى {slot.end_time} ({slot.duration_hours || 2}س)
                                    </span>
                                  </div>
                                </td>

                                {/* Rooms Summary */}
                                <td className="p-3 space-y-0.5">
                                  <div className="font-medium text-slate-800">
                                    {getRoomsSummary(slot)}
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-semibold flex items-center gap-3">
                                    <span>إجمالي القاعات: {getRoomsCount({ ...slot, room_ranges: getRoomRangesFromSlot(slot) } as any)}</span>
                                    <span>|</span>
                                    <span>المراقبين المطلوبين: {slot.required_invigilators || 2}</span>
                                  </div>
                                </td>

                                {/* Actions */}
                                <td className="p-3">
                                  <div className="flex items-center justify-center gap-2">
                                    <button
                                      onClick={() => openEditSlot(slot)}
                                      className="flex items-center gap-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-extrabold px-3 py-1.5 rounded-lg transition-all"
                                      title="تعديل تفاصيل المادة"
                                    >
                                      <Edit2 size={13} />
                                      <span>تعديل</span>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteSlotDirect(slot.id, slot.course_name)}
                                      className="flex items-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 font-extrabold px-3 py-1.5 rounded-lg transition-all"
                                      title="حذف المادة"
                                    >
                                      <Trash2 size={13} />
                                      <span>حذف</span>
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-3">
            <h2 className="text-lg font-black text-slate-900">إعدادات العرض والنشر العام</h2>
            <p className="text-xs text-slate-500 mt-1">تعديل فوري وسريع لإظهار الجداول وتوقيت فتحها للعموم.</p>
          </div>

          <div className="space-y-4">
            {/* Toggle Show Schedule */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="space-y-1">
                <span className="text-sm font-bold text-slate-900">إظهار البرنامج الامتحاني للعموم</span>
                <p className="text-xs text-slate-500">عند التفعيل، يستطيع الطلاب والزوار تصفح مواعيد المواد والبرنامج الامتحاني وتوزيع الطلاب.</p>
              </div>
              <button
                onClick={() => handleToggleSetting('show_public_schedule')}
                disabled={savingSettings || !settings}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings?.show_public_schedule ? 'bg-purple-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings?.show_public_schedule ? '-translate-x-5' : '-translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Toggle Show Results */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="space-y-1">
                <span className="text-sm font-bold text-slate-900">إظهار النتائج الامتحانية للعموم</span>
                <p className="text-xs text-slate-500">عند تفعيل هذا الخيار، سيتمكن الطلاب من البحث ومعاينة درجاتهم ونتائجهم من الواجهة الخارجية.</p>
              </div>
              <button
                onClick={() => handleToggleSetting('show_public_results')}
                disabled={savingSettings || !settings}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings?.show_public_results ? 'bg-purple-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings?.show_public_results ? '-translate-x-5' : '-translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Unlock Hours Numeric Input */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
              <div className="space-y-1">
                <span className="text-sm font-bold text-slate-900">توقيت إتاحة وعرض توزيع قاعات الطلاب قبل الامتحان (بالساعات)</span>
                <p className="text-xs text-slate-500">عدد الساعات المسموح بها لعرض قاعات الطلاب للامتحان بشكل تلقائي قبل بداية وقت الامتحان الفعلي للمادة.</p>
              </div>
              <div className="flex items-center gap-2 max-w-[200px]">
                <input
                  type="number"
                  min="0"
                  max="168"
                  value={settings?.distribution_unlock_hours ?? 6}
                  onChange={(e) => handleUpdateUnlockHours(parseInt(e.target.value) || 0)}
                  disabled={savingSettings || !settings}
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl font-sans text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <span className="text-xs font-bold text-slate-600">ساعة</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-xs">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Eye className="text-purple-600" size={22} />
              <span>الظهور للعامة (كيف يبدو العمل)</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">معاينة حية ومباشرة للواجهة العامة بنفس طريقة تصفح الطلاب والعموم، لرصد النتائج والقاعات بدقة.</p>
          </div>

          <div className="border-4 border-dashed border-purple-200 rounded-3xl overflow-hidden bg-slate-100">
            {/* Mounted Public Landing */}
            <PublicLanding isPreview={true} />
          </div>
        </div>
      )}

      {/* CSV Upload Modal */}
      {isModalOpen && selectedSlot && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 overflow-y-auto">
          <div className="relative max-w-2xl w-full bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden my-8">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between flex-row-reverse">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-50"
              >
                <X size={20} />
              </button>
              <div className="flex items-center gap-2.5 flex-row-reverse">
                <Database className={modalType === 'distribution' ? 'text-emerald-600' : 'text-purple-600'} size={24} />
                <h2 className="text-lg font-black text-slate-900">
                  {modalType === 'distribution' ? 'رفع جدول توزيع قاعات الطلاب' : 'ترفيع علامات ونتائج الطلاب'}
                </h2>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 max-h-[60vh] space-y-4 text-right">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="text-xs font-bold text-slate-700">المادة المقررة: <span className="text-purple-700 font-black">{selectedSlot.course_name}</span></p>
                <p className="text-[10px] text-slate-400 mt-1">تاريخ الامتحان: {selectedSlot.exam_date} | توقيت الامتحان: {selectedSlot.start_time} - {selectedSlot.end_time}</p>
              </div>

              {modalType === 'distribution' ? (
                // Distribution Instructions (3 Columns)
                <div className="space-y-3">
                  <div className="bg-emerald-50/70 border border-emerald-100 p-5 rounded-2xl space-y-3">
                    <h3 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5 flex-row-reverse">
                      <AlertCircle size={16} className="text-emerald-600" />
                      <span>تنسيق الملف المطلوب (3 أعمدة فقط):</span>
                    </h3>
                    <p className="text-[11px] text-emerald-950 leading-relaxed">
                      يرجى إنشاء ملف إكسل يحتوي على 3 أعمدة رئيسية لتوزيع قاعات الطلاب، ثم تصديره وحفظه بصيغة <strong>CSV (Comma delimited)</strong>:
                    </p>

                    <div className="grid grid-cols-3 gap-2.5 text-xs text-slate-700 font-medium">
                      <div className="bg-white p-2.5 rounded-lg border border-emerald-100 flex flex-col items-end text-right">
                        <span className="font-bold text-emerald-700 text-[10px]">العمود الأول (1)</span>
                        <span className="text-[9px] text-slate-500 mt-0.5">الرقم الامتحاني</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-emerald-100 flex flex-col items-end text-right">
                        <span className="font-bold text-emerald-700 text-[10px]">العمود الثاني (2)</span>
                        <span className="text-[9px] text-slate-500 mt-0.5">اسم الطالب</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-emerald-100 flex flex-col items-end text-right">
                        <span className="font-bold text-emerald-700 text-[10px]">العمود الثالث (3)</span>
                        <span className="text-[9px] text-slate-500 mt-0.5">القاعة الامتحانية / المكان</span>
                      </div>
                    </div>
                  </div>

                  {/* Example Table */}
                  <div className="border border-emerald-100 rounded-2xl overflow-hidden bg-white shadow-xs">
                    <div className="bg-emerald-600/5 px-4 py-2 border-b border-emerald-100 text-[11px] font-bold text-emerald-800 text-center">
                      مثال تطبيقي لملف التوزيع المكون من 3 أعمدة
                    </div>
                    <table className="w-full text-center text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-emerald-50 text-slate-600 font-bold">
                          <th className="p-2 border-l border-emerald-50">الرقم الامتحاني</th>
                          <th className="p-2 border-l border-emerald-50">اسم الطالب</th>
                          <th className="p-2">القاعة الامتحانية</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        <tr className="text-slate-700">
                          <td className="p-2 border-l border-emerald-50 font-mono">10501</td>
                          <td className="p-2 border-l border-emerald-50 font-bold">عامر الدين الحمامي</td>
                          <td className="p-2">القاعة الأولى (طابق أول)</td>
                        </tr>
                        <tr className="text-slate-700 bg-slate-50/50">
                          <td className="p-2 border-l border-emerald-50 font-mono">10502</td>
                          <td className="p-2 border-l border-emerald-50 font-bold">رنا أحمد المحمد</td>
                          <td className="p-2">المرسم الثاني</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                // Results Instructions
                <div className="space-y-3">
                  <div className="bg-purple-50/70 border border-purple-100 p-5 rounded-2xl space-y-3">
                    <h3 className="text-xs font-bold text-purple-900 flex items-center gap-1.5 flex-row-reverse">
                      <AlertCircle size={16} className="text-purple-600" />
                      <span>تنسيق ملف العلامات (الأعمدة الرئيسية):</span>
                    </h3>
                    <p className="text-[11px] text-purple-950 leading-relaxed">
                      يرجى إنشاء ملف إكسل يحتوي على أعمدة نتائج الطلاب (الاسم، الرقم الامتحاني، علامة العملي، النظري، المجموع)، ثم تصديره كملف <strong>CSV (Comma delimited)</strong>:
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 font-medium">
                      <div className="bg-white p-2 rounded-lg border border-purple-100 flex flex-col items-end text-right">
                        <span className="font-bold text-purple-700 text-[10px]">اسم الطالب</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-purple-100 flex flex-col items-end text-right">
                        <span className="font-bold text-purple-700 text-[10px]">الرقم الامتحاني</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-purple-100 flex flex-col items-end text-right">
                        <span className="font-bold text-purple-700 text-[10px]">علامة العملي</span>
                      </div>
                      <div className="bg-white p-2 rounded-lg border border-purple-100 flex flex-col items-end text-right">
                        <span className="font-bold text-purple-700 text-[10px]">علامة النظري</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Zone */}
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-3xl p-6 bg-slate-50/50 hover:bg-slate-50 transition-colors relative group">
                <Upload size={32} className="text-slate-400 group-hover:scale-110 transition-transform mb-2" />
                <p className="text-xs font-bold text-slate-700 mb-1">انقر هنا لاختيار ملف الـ CSV المطلوب ترفيعه</p>
                <p className="text-[10px] text-slate-400">يدعم الملفات بصيغة CSV فقط بترميز UTF-8 أو Windows-1256</p>
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileChange} 
                  className="absolute inset-0 opacity-0 cursor-pointer" 
                />
              </div>

              {/* Preview Status */}
              {previewError && (
                <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-2 text-rose-700 text-xs font-bold flex-row-reverse">
                  <XCircle size={16} />
                  <span>{previewError}</span>
                </div>
              )}

              {previewSuccess && (
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center gap-2 text-emerald-800 text-xs font-bold flex-row-reverse">
                  <CheckCircle size={16} />
                  <span>{previewSuccess}</span>
                </div>
              )}

              {/* Parsed Distribution Preview */}
              {modalType === 'distribution' && parsedDistribution.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800">معاينة البيانات قبل الحفظ:</h4>
                  <div className="border border-slate-100 rounded-2xl overflow-x-auto touch-pan-x max-h-60 overflow-y-auto bg-white shadow-xs">
                    <table className="w-full text-right text-xs min-w-full border-collapse">
                      <thead>
                        <tr className="bg-emerald-50/50 text-emerald-900 font-bold border-b border-emerald-100 sticky top-0 bg-white">
                          <th className="p-2.5 text-right">الرقم الامتحاني</th>
                          <th className="p-2.5 text-right">اسم الطالب</th>
                          <th className="p-2.5 text-right">القاعة الامتحانية / المكان</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {parsedDistribution.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2.5 text-slate-500 font-mono font-medium">{row.exam_number || 'غير متوفر'}</td>
                            <td className="p-2.5 text-slate-800 font-bold">{row.student_name}</td>
                            <td className="p-2.5 text-emerald-700 font-semibold">{row.room}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Parsed Results Preview */}
              {modalType === 'results' && parsedResults.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800">معاينة البيانات قبل الحفظ:</h4>
                  <div className="border border-slate-100 rounded-2xl overflow-x-auto touch-pan-x max-h-60 overflow-y-auto bg-white shadow-xs">
                    <table className="w-full text-right text-xs min-w-full border-collapse">
                      <thead>
                        <tr className="bg-purple-50/50 text-purple-900 font-bold border-b border-purple-100 sticky top-0 bg-white">
                          <th className="p-2.5 text-right">الرقم الامتحاني</th>
                          <th className="p-2.5 text-right">اسم الطالب</th>
                          <th className="p-2.5 text-center">عملي</th>
                          <th className="p-2.5 text-center">نظري</th>
                          <th className="p-2.5 text-center">المحصلة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {parsedResults.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2.5 text-slate-500 font-mono font-medium">{row.exam_number}</td>
                            <td className="p-2.5 text-slate-800 font-bold">{row.student_name}</td>
                            <td className="p-2.5 text-center text-slate-500">{row.practical_grade}</td>
                            <td className="p-2.5 text-center text-slate-500">{row.theory_grade}</td>
                            <td className="p-2.5 text-center text-indigo-600 font-black">{row.final_score}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              <button
                onClick={() => setIsModalOpen(false)}
                className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs px-5 py-2.5 rounded-xl transition-all"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveUpload}
                disabled={saveLoading || (!parsedDistribution.length && !parsedResults.length)}
                className={`text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-1.5 ${
                  modalType === 'distribution' 
                    ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100' 
                    : 'bg-purple-600 hover:bg-purple-700 shadow-purple-100'
                } disabled:opacity-50 disabled:shadow-none`}
              >
                {saveLoading ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                <span>حفظ البيانات والرفع</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Viewing Synchronized Data Modal */}
      {viewingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200" dir="rtl">
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 flex-row-reverse">
              <button 
                onClick={() => setViewingData(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-1 hover:bg-slate-100 rounded-lg"
              >
                <X size={18} />
              </button>
              <div className="text-right">
                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-bold mb-1 ${
                  viewingData.type === 'distribution' ? 'bg-emerald-50 text-emerald-700' : 'bg-purple-50 text-purple-700'
                }`}>
                  {viewingData.type === 'distribution' ? 'توزيع القاعات المتزامن' : 'نتائج الطلاب المنشورة'}
                </span>
                <h3 className="text-base font-black text-slate-900">
                  {viewingData.slot.course_name}
                </h3>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4">
              <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl flex items-center justify-between text-xs text-slate-500 flex-row-reverse">
                <span>تاريخ المادة: <strong>{viewingData.slot.exam_date}</strong></span>
                <span>توقيت المادة: <strong>من {viewingData.slot.start_time} إلى {viewingData.slot.end_time}</strong></span>
              </div>

              {viewingData.type === 'distribution' ? (
                (!viewingData.slot.student_distribution || viewingData.slot.student_distribution.length === 0) ? (
                  <div className="text-center py-12 text-slate-400">
                    لا يوجد بيانات توزيع مرفوعة حالياً.
                  </div>
                ) : (
                  <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-emerald-50 text-emerald-900 font-bold border-b border-emerald-100">
                          <th className="p-3 text-right">الرقم الامتحاني</th>
                          <th className="p-3 text-right">اسم الطالب</th>
                          <th className="p-3 text-right">القاعة الامتحانية / المكان</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {viewingData.slot.student_distribution.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-3 text-slate-500 font-mono font-medium">{row.exam_number || 'غير متوفر'}</td>
                            <td className="p-3 text-slate-800 font-bold">{row.student_name}</td>
                            <td className="p-3 text-emerald-700 font-semibold">{row.room}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : (
                (!viewingData.slot.exam_results || viewingData.slot.exam_results.length === 0) ? (
                  <div className="text-center py-12 text-slate-400">
                    لا يوجد علامات أو نتائج مرفوعة حالياً.
                  </div>
                ) : (
                  <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xs">
                    <table className="w-full text-right text-xs">
                      <thead>
                        <tr className="bg-purple-50 text-purple-900 font-bold border-b border-purple-100">
                          <th className="p-3 text-right">الرقم الامتحاني</th>
                          <th className="p-3 text-right">اسم الطالب</th>
                          <th className="p-3 text-center">علامة العملي</th>
                          <th className="p-3 text-center">علامة النظري</th>
                          <th className="p-3 text-center">المحصلة النهائية</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {viewingData.slot.exam_results.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-3 text-slate-500 font-mono font-medium">{row.exam_number || 'غير متوفر'}</td>
                            <td className="p-3 text-slate-800 font-bold">{row.student_name}</td>
                            <td className="p-3 text-center text-slate-500">{row.practical_grade ?? '-'}</td>
                            <td className="p-3 text-center text-slate-500">{row.theory_grade ?? '-'}</td>
                            <td className="p-3 text-center text-indigo-600 font-black">{row.final_score ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setViewingData(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs px-5 py-2.5 rounded-xl transition-all"
              >
                إغلاق النافذة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slots Addition/Editing Modal */}
      {isSlotsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200 text-right" dir="rtl">
          <form 
            onSubmit={handleSlotsSubmit} 
            className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-8 animate-in zoom-in-95 duration-200 flex flex-col max-h-[calc(100vh-2rem)] md:max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0 flex-row-reverse">
              <h2 className="text-xl font-black text-slate-900">{editingSlot ? 'تعديل مادة' : 'إضافة مادة جديدة'}</h2>
              <button 
                type="button" 
                onClick={() => {
                  setIsSlotsModalOpen(false);
                  setEditingSlot(null);
                  resetSlotsForm();
                }} 
                className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 text-right">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">اسم المادة</label>
                  <input
                    required
                    value={slotsFormData.course_name}
                    onChange={(e) => setSlotsFormData({ ...slotsFormData, course_name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السنة الدراسية</label>
                  <select
                    value={slotsFormData.academic_year}
                    onChange={(e) => setSlotsFormData({ ...slotsFormData, academic_year: parseInt(e.target.value) as any })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold text-slate-800"
                  >
                    {[1, 2, 3, 4, 5].map(y => <option key={y} value={y}>السنة {yearNames[y-1]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع الفترة</label>
                  <select
                    value={slotsFormData.session_type}
                    onChange={(e) => setSlotsFormData({ ...slotsFormData, session_type: e.target.value as any })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold text-slate-800"
                  >
                    <option value="morning">صباحية</option>
                    <option value="evening">مسائية</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">تاريخ الامتحان</label>
                  <input
                    type="date"
                    required
                    value={slotsFormData.exam_date}
                    onChange={(e) => setSlotsFormData({ ...slotsFormData, exam_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت البدء (المباشرة)</label>
                  <input
                    type="time"
                    required
                    value={slotsFormData.start_time}
                    onChange={(e) => {
                      const newStart = e.target.value;
                      let newEnd = slotsFormData.end_time;
                      try {
                        const startParts = newStart.split(':');
                        const hours = parseInt(startParts[0]) || 9;
                        const minutes = parseInt(startParts[1]) || 0;
                        const totalMinutes = hours * 60 + minutes + Math.round(slotsFormData.duration_hours * 60);
                        const endHours = Math.floor(totalMinutes / 60) % 24;
                        const endMinutes = totalMinutes % 60;
                        newEnd = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
                      } catch (err) {}
                      setSlotsFormData({ ...slotsFormData, start_time: newStart, end_time: newEnd });
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">مدة الامتحان (ساعات)</label>
                  <select
                    value={slotsFormData.duration_hours}
                    onChange={(e) => {
                      const newDuration = parseInt(e.target.value) || 2;
                      let newEnd = slotsFormData.end_time;
                      try {
                        if (slotsFormData.start_time) {
                          const startParts = slotsFormData.start_time.split(':');
                          const hours = parseInt(startParts[0]) || 9;
                          const minutes = parseInt(startParts[1]) || 0;
                          const totalMinutes = hours * 60 + minutes + Math.round(newDuration * 60);
                          const endHours = Math.floor(totalMinutes / 60) % 24;
                          const endMinutes = totalMinutes % 60;
                          newEnd = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
                        }
                      } catch (err) {}
                      setSlotsFormData({ ...slotsFormData, duration_hours: newDuration, end_time: newEnd });
                    }}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold text-slate-800"
                  >
                    <option value={1}>ساعة واحدة (1)</option>
                    <option value={2}>ساعتان (2)</option>
                    <option value={3}>3 ساعات (3)</option>
                    <option value={4}>4 ساعات (4)</option>
                    <option value={5}>5 ساعات (5)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">وقت انتهاء الامتحان</label>
                  <input
                    type="time"
                    required
                    value={slotsFormData.end_time}
                    onChange={(e) => setSlotsFormData({ ...slotsFormData, end_time: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                  />
                </div>
              </div>

              {/* Dynamic Room Ranges Inputs */}
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-extrabold text-slate-800">توزيع وتحديد القاعات (المراسم والقاعات) لهذه المادة</h3>
                  <button
                    type="button"
                    onClick={addRoomRange}
                    className="flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-lg transition-all"
                  >
                    <Plus size={14} />
                    <span>إضافة موقع +</span>
                  </button>
                </div>
                
                {slotsFormData.room_ranges && slotsFormData.room_ranges.length > 0 ? (
                  <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                    {slotsFormData.room_ranges.map((range, index) => (
                      <div key={index} className="flex flex-wrap md:flex-nowrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100 animate-in fade-in slide-in-from-top-1 duration-150">
                        <div className="flex-1 min-w-[120px]">
                          <select
                            value={range.type}
                            onChange={(e) => updateRoomRange(index, 'type', e.target.value as any)}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-1 focus:ring-purple-500 outline-none"
                          >
                            <option value="المرسم">المرسم</option>
                            <option value="البهو">البهو</option>
                            <option value="القبو">القبو</option>
                            <option value="القاعات">القاعات</option>
                            <option value="التوسع">التوسع</option>
                          </select>
                        </div>
                        
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500">من</span>
                          <input
                            type="number"
                            min="1"
                            value={range.from}
                            onChange={(e) => updateRoomRange(index, 'from', Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-14 px-1.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-center focus:ring-1 focus:ring-purple-500 outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-bold text-slate-500">إلى</span>
                          <input
                            type="number"
                            min="1"
                            value={range.to}
                            onChange={(e) => updateRoomRange(index, 'to', Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-14 px-1.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-center focus:ring-1 focus:ring-purple-500 outline-none"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeRoomRange(index)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors mr-auto"
                          title="حذف هذا الموقع"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 p-4">
                    <p className="text-xs text-slate-400 font-medium">لا توجد قاعات أو مراسم محددة لهذه المادة حالياً</p>
                    <button
                      type="button"
                      onClick={addRoomRange}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-purple-600 hover:underline"
                    >
                      اضغط هنا لإضافة أول موقع
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">كم مراقب تحتاج في كل مرسم/قاعة؟</label>
                    <input
                      type="number"
                      min="1"
                      value={slotsFormData.observers_per_room}
                      onChange={(e) => setSlotsFormData({ ...slotsFormData, observers_per_room: parseInt(e.target.value) || 3 })}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                    />
                  </div>
                  <div className="bg-purple-50 p-3 rounded-2xl flex flex-col justify-center">
                    <span className="text-[10px] text-purple-600 font-bold">الحساب التلقائي لعدد المراقبين</span>
                    <span className="text-xs font-extrabold text-slate-700 mt-1">
                      عدد القاعات: {getRoomsCount(slotsFormData)} | المراقبون: {getRoomsCount(slotsFormData) * slotsFormData.observers_per_room}
                    </span>
                  </div>
                </div>
              </div>

              {getRoomsCount(slotsFormData) === 0 && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">عدد المراقبين المطلوب (إدخال يدوي)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={isNaN(slotsFormData.required_invigilators) ? 2 : slotsFormData.required_invigilators}
                    onChange={(e) => setSlotsFormData({ ...slotsFormData, required_invigilators: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-purple-500 outline-none font-bold"
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
              <button 
                type="submit" 
                disabled={saveLoading}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold transition-all shadow-md shadow-purple-100 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {saveLoading && <Loader2 className="animate-spin" size={16} />}
                <span>حفظ المادة</span>
              </button>
              <button 
                type="button" 
                onClick={() => {
                  setIsSlotsModalOpen(false);
                  setEditingSlot(null);
                  resetSlotsForm();
                }} 
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold transition-all"
              >
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CSV Upload & Analysis Modal for Exam Program */}
      {isScheduleUploadModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto animate-in fade-in duration-200 text-right" dir="rtl">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[calc(100vh-2rem)] md:max-h-[90vh] overflow-hidden flex flex-col shadow-xl border border-slate-100 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-row-reverse bg-slate-50">
              <h2 className="text-xl font-black text-slate-900 font-sans flex items-center gap-2">
                <Upload className="text-purple-600" size={22} />
                <span>رفع وتحليل جدول البرنامج التلقائي (CSV)</span>
              </h2>
              <button 
                onClick={() => {
                  setIsScheduleUploadModalOpen(false);
                  setParsedSlots([]);
                  setImportError(null);
                  setImportSuccess(null);
                }} 
                className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-right">
              {/* Instructions */}
              <div className="bg-purple-50/70 border border-purple-100 p-5 rounded-2xl space-y-4">
                <h3 className="text-sm font-extrabold text-purple-900 flex items-center gap-2 flex-row-reverse">
                  <HelpCircle size={18} />
                  <span>تنسيق ملف CSV المطلوبة أعمدته</span>
                </h3>
                <p className="text-xs text-purple-800 leading-relaxed">
                  يجب أن يحتوي ملف الـ CSV المرفوع على ترويسة واضحة تحتوي على الحقول التالية على الأقل لتتم العملية بنجاح:
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-center text-xs font-mono bg-white rounded-xl border border-purple-100">
                    <thead>
                      <tr className="bg-purple-100/50 text-purple-900 font-bold border-b border-purple-100">
                        <th className="p-2 border-l border-purple-100">اسم المادة</th>
                        <th className="p-2 border-l border-purple-100">السنة الدراسية</th>
                        <th className="p-2 border-l border-purple-100">تاريخ المادة</th>
                        <th className="p-2">وقت البدء</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="text-slate-600">
                        <td className="p-2 border-l border-purple-100">خرسانة 2</td>
                        <td className="p-2 border-l border-purple-100">الرابعة</td>
                        <td className="p-2 border-l border-purple-100">2026-06-15</td>
                        <td className="p-2">09:00</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Upload Input */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-slate-700">اختر ملف CSV من جهازك</label>
                <div className="flex items-center gap-3">
                  <input 
                    type="file" 
                    accept=".csv"
                    onChange={handleScheduleCSVUpload}
                    className="block w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-purple-50 file:text-purple-700 hover:file:bg-purple-100 cursor-pointer"
                  />
                </div>
              </div>

              {/* Error & Success Messages */}
              {importError && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-start gap-2.5 text-xs text-red-700">
                  <XCircle className="shrink-0 mt-0.5 text-red-500" size={16} />
                  <span>{importError}</span>
                </div>
              )}

              {importSuccess && (
                <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-start gap-2.5 text-xs text-emerald-700">
                  <CheckCircle className="shrink-0 mt-0.5 text-emerald-500" size={16} />
                  <span>{importSuccess}</span>
                </div>
              )}

              {/* Data Preview */}
              {parsedSlots.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  <h3 className="text-xs font-extrabold text-slate-800">معاينة الجدول المستورد ({parsedSlots.length} فترة)</h3>
                  <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-xs max-h-[220px] overflow-y-auto">
                    <table className="w-full text-right text-[11px]">
                      <thead>
                        <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-100">
                          <th className="p-2.5">المادة</th>
                          <th className="p-2.5">السنة</th>
                          <th className="p-2.5">التاريخ والوقت</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {parsedSlots.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-2.5 font-bold text-slate-950">{item.course_name}</td>
                            <td className="p-2.5 font-semibold text-purple-700">السنة {yearNames[item.academic_year - 1]}</td>
                            <td className="p-2.5 text-slate-500">{item.exam_date} | {item.start_time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
              <button
                onClick={handleImportSlotsSchedule}
                disabled={importLoading || parsedSlots.length === 0}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-xl font-bold transition-all shadow-md shadow-purple-100 flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {importLoading && <Loader2 className="animate-spin" size={16} />}
                <span>استيراد وحفظ الآن</span>
              </button>
              <button
                onClick={() => {
                  setIsScheduleUploadModalOpen(false);
                  setParsedSlots([]);
                  setImportError(null);
                  setImportSuccess(null);
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold transition-all"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Confirm Modal */}
      <SecurityConfirmModal
        isOpen={securityModalOpen}
        onClose={() => setSecurityModalOpen(false)}
        onConfirm={() => {
          if (securityAction) {
            securityAction.onConfirm();
          }
          setSecurityModalOpen(false);
        }}
        title={securityAction?.title || ''}
        description={securityAction?.description || ''}
      />
    </div>
  );
}
