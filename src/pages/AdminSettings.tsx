import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { AppSettings } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Settings, Save, AlertCircle, CheckCircle, Loader2, Image as ImageIcon, Camera, Shield, UserMinus, UserPlus, Lock, Unlock, Users } from 'lucide-react';
import { uploadToCloudinary } from '../utils/cloudinary';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { compileAndPublishSchedule } from '../utils/publicSchedule';

export default function AdminSettings() {
  const { profile, isSuperAdmin, isAdmin } = useAuth();
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({
    registration_open: true,
    registration_start: '',
    registration_end: '',
    exam_start: '',
    exam_end: '',
    default_required_hours: 16,
    app_logo_url: '',
    reset_password: '',
    security_code: '',
    profiles_locked: false,
    trim_hours_duration: 6,
    trim_hours_deadline: null,
    trim_hours_target: null,
    trim_hours_started_at: null,
    trim_hours_processed: false,
    show_public_schedule: false,
    show_public_results: false,
    global_settings_version: 0,
    developer_fb_link: '',
    distribution_unlock_hours: 6,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (!profile?.uid) return;

    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as AppSettings;
        setSettings({
          registration_open: data.registration_open ?? true,
          registration_start: data.registration_start ?? '',
          registration_end: data.registration_end ?? '',
          exam_start: data.exam_start ?? '',
          exam_end: data.exam_end ?? '',
          default_required_hours: data.default_required_hours ?? 16,
          app_logo_url: data.app_logo_url ?? '',
          reset_password: data.reset_password ?? '',
          security_code: data.security_code ?? '',
          profiles_locked: data.profiles_locked ?? false,
          trim_hours_duration: data.trim_hours_duration ?? 6,
          trim_hours_deadline: data.trim_hours_deadline ?? null,
          trim_hours_target: data.trim_hours_target ?? null,
          trim_hours_started_at: data.trim_hours_started_at ?? null,
          trim_hours_processed: data.trim_hours_processed ?? false,
          show_public_schedule: data.show_public_schedule ?? false,
          show_public_results: data.show_public_results ?? false,
          global_settings_version: data.global_settings_version ?? 0,
          developer_fb_link: data.developer_fb_link ?? '',
          distribution_unlock_hours: data.distribution_unlock_hours ?? 6,
        });
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });
    return () => unsubscribe();
  }, [profile?.uid]);

  useEffect(() => {
    if (!settings.trim_hours_deadline) {
      setTimeLeft('');
      return;
    }
    const interval = setInterval(() => {
      const diff = new Date(settings.trim_hours_deadline!).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('انتهت المهلة - سيتم تقليص الساعات تلقائياً عند أول تحديث أو زيارة');
        clearInterval(interval);
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`متبقي ${hours} ساعة و ${minutes} دقيقة و ${seconds} ثانية`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [settings.trim_hours_deadline]);

  const handleStartTrimmingGracePeriod = async () => {
    if (saving) return;
    
    const confirmed = window.confirm(
      `هل أنت متأكد من بدء مهلة تقليص الساعات؟\n` +
      `سيتم منح المراقبين الذين تتجاوز ساعاتهم الحالية ${settings.default_required_hours} ساعة مهلة مدتها ${settings.trim_hours_duration || 6} ساعات للتعديل اليدوي، وبعدها سيقوم النظام بالتقليص تلقائياً.`
    );
    if (!confirmed) return;

    setSaving(true);
    setMessage(null);
    try {
      const duration = settings.trim_hours_duration || 6;
      const deadline = new Date(Date.now() + duration * 60 * 60 * 1000).toISOString();
      
      const updatedSettings = {
        ...settings,
        trim_hours_deadline: deadline,
        trim_hours_target: settings.default_required_hours,
        trim_hours_started_at: new Date().toISOString(),
        trim_hours_processed: false
      };

      await setDoc(doc(db, 'settings', 'global'), updatedSettings);
      setSettings(updatedSettings);
      setMessage({ type: 'success', text: 'تم بدء مهلة التقليص وإرسال التنبيهات للمراقبين بنجاح!' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/global');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelTrimmingGracePeriod = async () => {
    if (saving) return;
    const confirmed = window.confirm('هل أنت متأكد من إلغاء مهلة التقليص النشطة؟');
    if (!confirmed) return;

    setSaving(true);
    setMessage(null);
    try {
      const updatedSettings = {
        ...settings,
        trim_hours_deadline: null,
        trim_hours_target: null,
        trim_hours_started_at: null,
        trim_hours_processed: false
      };

      await setDoc(doc(db, 'settings', 'global'), updatedSettings);
      setSettings(updatedSettings);
      setMessage({ type: 'success', text: 'تم إلغاء مهلة التقليص بنجاح.' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/global');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setMessage(null);
    try {
      const url = await uploadToCloudinary(file);
      setSettings(prev => ({ ...prev, app_logo_url: url }));
      // Automatically save the new logo URL to Firestore
      await updateDoc(doc(db, 'settings', 'global'), { app_logo_url: url });
      setMessage({ type: 'success', text: 'تم تحديث شعار التطبيق بنجاح' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'فشل رفع الشعار' });
    } finally {
      setUploadingLogo(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin || isAdmin) {
      const fetchUsers = async () => {
        setLoadingAdmins(true);
        try {
          const snapshot = await getDocs(collection(db, 'users'));
          setAllUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, 'users');
        } finally {
          setLoadingAdmins(false);
        }
      };
      fetchUsers();
    }
  }, [isSuperAdmin, isAdmin]);

  const handlePromoteToAdmin = async (userId: string) => {
    const currentAdmins = allUsers.filter(u => u.role === 'admin' || u.email === "amiraldeenalhammami@ab3adacademy.com").length;
    if (currentAdmins >= 5) {
      setMessage({ type: 'error', text: 'لا يمكن تجاوز الحد الأقصى وهو 5 مدراء' });
      return;
    }

    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', userId), { role: 'admin' });
      setAllUsers(prev => prev.map(u => u.uid === userId ? { ...u, role: 'admin' } : u));
      setMessage({ type: 'success', text: 'تمت الترقية إلى مدير بنجاح' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePromoteToOfficer = async (userId: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', userId), { role: 'exam_officer' });
      setAllUsers(prev => prev.map(u => u.uid === userId ? { ...u, role: 'exam_officer' } : u));
      setMessage({ type: 'success', text: 'تمت ترقية العضو إلى موظف امتحانات بنجاح' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDemoteToStudent = async (userId: string) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', userId), { role: 'student' });
      setAllUsers(prev => prev.map(u => u.uid === userId ? { ...u, role: 'student' } : u));
      setMessage({ type: 'success', text: 'تم سحب الصلاحية وتحويل المستخدم إلى طالب' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${userId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await setDoc(doc(db, 'settings', 'global'), settings);
      
      if (settings.show_public_schedule || settings.show_public_results) {
        await compileAndPublishSchedule();
        setMessage({ type: 'success', text: 'تم حفظ الإعدادات ونشر وتحديث البيانات للعموم بنجاح!' });
      } else {
        setMessage({ type: 'success', text: 'تم حفظ الإعدادات بنجاح.' });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/global');
    } finally {
      setSaving(false);
    }
  };

  const [migrationLoading, setMigrationLoading] = useState(false);
  const [migrationLog, setMigrationLog] = useState<string[]>([]);
  const [migrationResult, setMigrationResult] = useState<{ scanned: number, mapped: number, deleted: number } | null>(null);

  const runDatabaseMigration = async () => {
    setMigrationLoading(true);
    setMigrationLog([]);
    setMigrationResult(null);
    const logList: string[] = [];
    const addLog = (msg: string) => {
      logList.push(`[${new Date().toLocaleTimeString('ar-EG')}] ${msg}`);
      setMigrationLog([...logList]);
    };

    try {
      addLog("بدء عملية فحص وصيانة قاعدة البيانات...");
      
      const bookingsSnap = await getDocs(collection(db, 'bookings'));
      const slotsSnap = await getDocs(collection(db, 'exam_slots'));

      const allBookingsData = bookingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      const allSlotsData = slotsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      addLog(`تم تحميل ${allBookingsData.length} حجز و ${allSlotsData.length} مادة امتحانية.`);

      let scannedCount = 0;
      let mappedCount = 0;
      let deletedCount = 0;

      for (const booking of allBookingsData) {
        scannedCount++;
        // Find if associated slot exists
        const associatedSlot = allSlotsData.find(s => s.id === booking.slot_id);
        
        if (!associatedSlot) {
          addLog(`عثرنا على حجز معلق للمراقب: (${booking.student_name}) لمادة قديمة: "${booking.course_name}" (معرّف غير موجود).`);
          
          // Try to map this orphaned booking to a matching active slot based on course_name
          const matchingSlot = allSlotsData.find(s => 
            !s.isDeleted && 
            s.course_name.trim().toLowerCase() === booking.course_name.trim().toLowerCase()
          );

          if (matchingSlot) {
            // Check if student already has another booking for this matching active slot
            const alreadyHasBookingForActiveSlot = allBookingsData.some(b => 
              b.student_id === booking.student_id && 
              b.slot_id === matchingSlot.id &&
              b.id !== booking.id
            );

            if (alreadyHasBookingForActiveSlot) {
              addLog(`الطالب لديه بالفعل حجز نشط في المادة المماثلة: "${matchingSlot.course_name}". جاري حذف الحجز المعلق المكرر نهائياً...`);
              await deleteDoc(doc(db, 'bookings', booking.id));
              deletedCount++;
              addLog(`تم حذف الحجز المعلق المكرر بنجاح.`);
            } else {
              addLog(`جاري مطابقة وربط الحجز المعلق بالمادة الجديدة المماثلة: "${matchingSlot.course_name}" تلقائياً...`);
              
              await updateDoc(doc(db, 'bookings', booking.id), {
                slot_id: matchingSlot.id,
                booked_hours: matchingSlot.duration_hours || booking.booked_hours || 2
              });
              
              mappedCount++;
              addLog(`تمت إعادة ربط الحجز بنجاح مع المعرّف الجديد (${matchingSlot.id})!`);
            }
          } else {
            addLog(`لم نجد أي مادة مطابقة نشطة بالاسم: "${booking.course_name}". جاري تنظيف وحذف الحجز المعلق لحماية نصاب المراقب...`);
            await deleteDoc(doc(db, 'bookings', booking.id));
            deletedCount++;
            addLog(`تم حذف الحجز المعلق بنجاح.`);
          }
        } else if (associatedSlot.isDeleted) {
          // Associated slot is soft-deleted
          addLog(`عثرنا على حجز مرتبط بمادة محذوفة ناعماً: "${booking.course_name}" للمراقب: (${booking.student_name}).`);
          
          const activeMatchingSlot = allSlotsData.find(s => 
            !s.isDeleted && 
            s.course_name.trim().toLowerCase() === booking.course_name.trim().toLowerCase()
          );

          if (activeMatchingSlot) {
            const alreadyHasBookingForActiveSlot = allBookingsData.some(b => 
              b.student_id === booking.student_id && 
              b.slot_id === activeMatchingSlot.id &&
              b.id !== booking.id
            );

            if (alreadyHasBookingForActiveSlot) {
              addLog(`الطالب لديه حجز جديد وفعال في نفس المادة المستعادة: "${activeMatchingSlot.course_name}". جاري حذف الحجز القديم المرتبط بالمادة المحذوفة ناعماً نهائياً...`);
              await deleteDoc(doc(db, 'bookings', booking.id));
              deletedCount++;
              addLog(`تم حذف الحجز القديم بنجاح.`);
            } else {
              addLog(`جاري إعادة توجيه حجز الطالب للمادة المستعادة النشطة: "${activeMatchingSlot.course_name}" تلقائياً...`);
              await updateDoc(doc(db, 'bookings', booking.id), {
                slot_id: activeMatchingSlot.id,
                booked_hours: activeMatchingSlot.duration_hours || booking.booked_hours || 2
              });
              mappedCount++;
              addLog(`تم تحديث وربط الحجز بالمادة النشطة المستعادة بنجاح.`);
            }
          } else {
            addLog(`المادة "${booking.course_name}" محذوفة ناعماً ولا توجد نسخة نشطة منها حالياً. سيتم تجاهل حجزها في الإحصائيات النشطة.`);
          }
        }
      }

      setMigrationResult({ scanned: scannedCount, mapped: mappedCount, deleted: deletedCount });
      addLog("اكتملت عملية صيانة قاعدة البيانات بنجاح!");
    } catch (err: any) {
      addLog(`حدث خطأ أثناء الصيانة: ${err.message || err}`);
    } finally {
      setMigrationLoading(false);
    }
  };

  const activeStudents = allUsers.filter(u => u.role === 'student' && u.status === 'active');
  const admins = allUsers.filter(u => u.role === 'admin' || u.email === "amiraldeenalhammami@ab3adacademy.com");

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>;
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-900">إعدادات النظام</h1>
        <p className="text-slate-500 mt-1">التحكم في فترة التسجيل والمواعيد العامة</p>
      </header>

      <div className="max-w-2xl bg-white rounded-3xl shadow-sm border border-slate-100 p-8 space-y-8">
        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white rounded-xl shadow-sm">
              <Settings className="text-indigo-600" size={24} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">حالة التسجيل</h3>
              <p className="text-sm text-slate-500">فتح أو إغلاق إمكانية حجز الفترات للطلاب</p>
            </div>
          </div>
          <button
            onClick={() => setSettings({ ...settings, registration_open: !settings.registration_open })}
            className={`
              relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none
              ${settings.registration_open ? 'bg-indigo-600' : 'bg-slate-300'}
            `}
          >
            <span
              className={`
                inline-block h-6 w-6 transform rounded-full bg-white transition-transform
                ${settings.registration_open ? '-translate-x-7' : '-translate-x-1'}
              `}
            />
          </button>
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white rounded-xl shadow-sm">
              {settings.profiles_locked ? (
                <Lock className="text-red-600" size={24} />
              ) : (
                <Unlock className="text-emerald-600" size={24} />
              )}
            </div>
            <div>
              <h3 className="font-bold text-slate-900">قفل تعديل البيانات الشخصية</h3>
              <p className="text-sm text-slate-500">قفل الاسم، الصورة، بطاقة الجامعة والبيانات المعتمدة للمراقبين</p>
            </div>
          </div>
          <button
            id="profiles-locked-toggle"
            onClick={() => setSettings({ ...settings, profiles_locked: !settings.profiles_locked })}
            className={`
              relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none
              ${settings.profiles_locked ? 'bg-red-600' : 'bg-slate-300'}
            `}
          >
            <span
              className={`
                inline-block h-6 w-6 transform rounded-full bg-white transition-transform
                ${settings.profiles_locked ? '-translate-x-7' : '-translate-x-1'}
              `}
            />
          </button>
        </div>

        <div className="border-t border-slate-100 pt-6">
          <h3 className="font-bold text-slate-900 mb-4">شعار التطبيق</h3>
          <div className="flex items-center gap-6">
            <div className="relative w-24 h-24 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex items-center justify-center overflow-hidden group">
              {settings.app_logo_url ? (
                <img src={settings.app_logo_url} alt="App Logo" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
              ) : (
                <ImageIcon size={32} className="text-slate-300" />
              )}
              <label className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Camera className="text-white" size={24} />
                <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
              </label>
              {uploadingLogo && (
                <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                  <Loader2 className="animate-spin text-indigo-600" size={24} />
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="text-sm text-slate-500 leading-relaxed">
                هذا الشعار سيظهر في صفحة تسجيل الدخول وفي أعلى التطبيق لدى جميع المستخدمين.
              </p>
              <label className="mt-2 inline-block cursor-pointer text-indigo-600 text-sm font-bold hover:text-indigo-700">
                تغيير الشعار
                <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} disabled={uploadingLogo} />
              </label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">بداية فترة التسجيل</label>
            <input
              type="date"
              value={settings.registration_start}
              onChange={(e) => setSettings({ ...settings, registration_start: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">نهاية فترة التسجيل</label>
            <input
              type="date"
              value={settings.registration_end}
              onChange={(e) => setSettings({ ...settings, registration_end: e.target.value })}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div className="md:col-span-2 border-t border-slate-100 pt-6">
            <h3 className="font-bold text-slate-900 mb-4">فترة الامتحانات (للتقويم)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">بداية الامتحانات</label>
                <input
                  type="date"
                  value={settings.exam_start}
                  onChange={(e) => setSettings({ ...settings, exam_start: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">نهاية الامتحانات</label>
                <input
                  type="date"
                  value={settings.exam_end}
                  onChange={(e) => setSettings({ ...settings, exam_end: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-2 border-t border-slate-100 pt-6">
            <label className="block text-sm font-bold text-slate-700 mb-2">كلمة المرور الموحدة للعمليات الحساسة وتصفير البرنامج</label>
            <div className="relative">
              <Shield size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={isSuperAdmin ? "text" : "password"}
                disabled={!isSuperAdmin}
                placeholder={isSuperAdmin ? "أدخل كلمة المرور الموحدة (لتصفير البرنامج والعمليات الحساسة)..." : "••••••••"}
                value={isSuperAdmin ? settings.reset_password : "••••••••"}
                onChange={(e) => setSettings({ ...settings, reset_password: e.target.value })}
                className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-900"
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {isSuperAdmin 
                ? "هذه كلمة المرور الموحدة التي يضعها السوبر أدمن، وتستخدم لتأكيد كافة العمليات الحساسة (مثل تصفير البرنامج، حذف المراقبين، حذف المواد، تفعيل/تجميد الحسابات)."
                : "كلمة المرور الموحدة تظهر ويتم تعديلها فقط بواسطة السوبر أدمن."}
            </p>
          </div>

          <div className="md:col-span-2 border-t border-slate-100 pt-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">عدد الساعات المطلوب من كل مراقب (افتراضي)</label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="1"
                value={settings.default_required_hours}
                onChange={(e) => setSettings({ ...settings, default_required_hours: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <span className="text-slate-500 font-medium">ساعة</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">هذا الرقم سيطبق على جميع المراقبين الذين لم يتم تحديد ساعات خاصة بهم.</p>
          </div>

          {/* كود تفعيل حساب المشرف */}
          <div className="md:col-span-2 border-t border-slate-100 pt-6">
            <label className="block text-sm font-bold text-slate-700 mb-2">كود تفعيل حساب المشرف / المراقب لإنشاء حسابات جديدة</label>
            <div className="relative">
              <Lock size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="أدخل كود تفعيل التسجيل الموحد..."
                value={settings.security_code || ''}
                onChange={(e) => setSettings({ ...settings, security_code: e.target.value })}
                className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-sans font-medium text-slate-900"
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              هذا الكود يتم مطابقته إجبارياً أثناء قيام أي مشرف أو مراقب بإنشاء حساب جديد، لمنع الطلاب أو الغرباء من التسجيل في النظام.
            </p>
          </div>

          {/* زر التحكم بظهور البرنامج الامتحاني للعامة */}
          <div className="md:col-span-2 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between bg-slate-50 p-5 rounded-3xl border border-slate-100">
              <div className="space-y-1">
                <span className="font-extrabold text-slate-800 text-sm block">إظهار البرنامج الامتحاني للعموم</span>
                <span className="text-xs text-slate-400 block">عند التفعيل، يظهر برنامج الامتحانات والزر التلقائي لتوزيع الطلاب في البوابة الرئيسية للعامة (/).</span>
              </div>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, show_public_schedule: !settings.show_public_schedule })}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.show_public_schedule ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings.show_public_schedule ? '-translate-x-7' : '-translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* زر التحكم بظهور النتائج الامتحانية للعامة */}
          <div className="md:col-span-2 border-t border-slate-100 pt-6">
            <div className="flex items-center justify-between bg-slate-50 p-5 rounded-3xl border border-slate-100">
              <div className="space-y-1">
                <span className="font-extrabold text-slate-800 text-sm block">إظهار النتائج الامتحانية للعموم</span>
                <span className="text-xs text-slate-400 block">عند التفعيل، يظهر قسم النتائج الامتحانية والبحث عن العلامات للطلاب في البوابة الرئيسية للعامة (/).</span>
              </div>
              <button
                type="button"
                onClick={() => setSettings({ ...settings, show_public_results: !settings.show_public_results })}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  settings.show_public_results ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    settings.show_public_results ? '-translate-x-7' : '-translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* وقت فتح توزيع القاعات للطلاب */}
          <div className="md:col-span-2 border-t border-slate-100 pt-6">
            <label className="block text-sm font-bold text-slate-700 mb-2">توقيت إتاحة وعرض توزيع قاعات الطلاب قبل الامتحان (بالساعات)</label>
            <div className="flex items-center gap-4">
              <input
                type="number"
                min="0"
                value={settings.distribution_unlock_hours ?? 6}
                onChange={(e) => setSettings({ ...settings, distribution_unlock_hours: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
              />
              <span className="text-slate-500 font-medium">ساعة</span>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              تحديد متى يفتح زر "عرض القاعات" للطلاب في الواجهة العامة قبل موعد المادة (مثلاً: قبل 6 ساعات).
            </p>
          </div>

          {/* رابط مبرمج النظام (للسوبر أدمن فقط) */}
          {isSuperAdmin && (
            <div className="md:col-span-2 border-t border-slate-100 pt-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">رابط حساب مبرمج النظام (المهندس أمير الدين)</label>
              <div className="relative">
                <Shield size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="أدخل رابط فيسبوك المبرمج الجديد..."
                  value={settings.developer_fb_link || ''}
                  onChange={(e) => setSettings({ ...settings, developer_fb_link: e.target.value })}
                  className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-sans font-medium text-slate-900"
                />
              </div>
              <p className="text-xs text-slate-400 mt-2">
                هذا الحقل خاص بـ Super Admin لتحديث الرابط التشعبي للمهندس أمير الدين الحمامي في أسفل لوحة التحكم وبقية واجهات التطبيق.
              </p>
            </div>
          )}

          {/* New fields for surplus trimming grace period */}
          <div className="md:col-span-2 border-t border-slate-100 pt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">مدة مهلة التعديل للمراقبين (بالساعات)</label>
              <div className="flex items-center gap-4">
                <input
                  type="number"
                  min="1"
                  value={settings.trim_hours_duration ?? 6}
                  onChange={(e) => setSettings({ ...settings, trim_hours_duration: parseInt(e.target.value) || 6 })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <span className="text-slate-500 font-medium">ساعة</span>
              </div>
              <p className="text-xs text-slate-400 mt-2">الوقت المتاح للمراقبين لتخفيض ساعاتهم الزائدة بأنفسهم قبل الحذف التلقائي.</p>
            </div>

            <div className="pt-2">
              {settings.trim_hours_deadline ? (
                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center gap-3 text-amber-800">
                    <AlertCircle size={20} className="shrink-0" />
                    <div>
                      <p className="font-bold text-sm">مهلة تقليص الساعات الزائدة نشطة حالياً</p>
                      <p className="text-xs mt-0.5 font-semibold text-slate-700">{timeLeft}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCancelTrimmingGracePeriod}
                    className="w-full bg-rose-600 hover:bg-rose-700 text-white py-2 px-4 rounded-xl font-bold text-xs transition-colors"
                  >
                    إلغاء مهلة التقليص الحالية
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartTrimmingGracePeriod}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white py-3.5 px-4 rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-2 shadow-sm"
                >
                  <span>⚠️ بدء مهلة تقليص الساعات الفائضة</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {message && (
          <div className={`p-4 rounded-2xl flex items-center gap-3 text-sm ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{message.text}</span>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
          <span>حفظ الإعدادات</span>
        </button>
      </div>

      {(isSuperAdmin || isAdmin) && (
        <div className="space-y-6">
          {isSuperAdmin && (
            <div className="max-w-2xl bg-white rounded-3xl shadow-sm border border-slate-100 p-8 space-y-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shadow-sm">
              <Shield size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">إدارة المدراء</h2>
              <p className="text-sm text-slate-500">ترقية المراقبين أو سحب صلاحيات المدراء (الحد الأقصى: 5)</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">ترقية مراقب إلى مدير</h3>
            <div className="flex gap-3">
              <select 
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
                onChange={(e) => {
                  if (e.target.value) handlePromoteToAdmin(e.target.value);
                }}
                defaultValue=""
              >
                <option value="" disabled>اختر مراقباً لترقيته...</option>
                {activeStudents.map(student => (
                  <option key={student.uid} value={student.uid}>{student.name} ({student.email})</option>
                ))}
              </select>
              <div className="px-4 py-3 bg-indigo-50 text-indigo-600 rounded-2xl font-bold flex items-center gap-2">
                <UserPlus size={20} />
                <span>{admins.length} / 5</span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <h3 className="font-bold text-slate-900 text-sm mb-4">المدراء الحاليون</h3>
            <div className="space-y-3">
              {admins.map(admin => (
                <div key={admin.uid} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-indigo-600 font-bold border border-slate-100">
                      {admin.name?.charAt(0) || 'A'}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{admin.name} {admin.email === "amiraldeenalhammami@ab3adacademy.com" && <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full mr-1">Super Admin</span>}</p>
                      <p className="text-xs text-slate-500">{admin.email}</p>
                    </div>
                  </div>
                  {admin.email !== "amiraldeenalhammami@ab3adacademy.com" && (
                    <button
                      onClick={() => handleDemoteToStudent(admin.uid)}
                      className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                      title="سحب الصلاحية وتحويل لمراقب"
                    >
                      <UserMinus size={20} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Database Migration & Maintenance Tool */}
          <div className="border-t border-slate-100 pt-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <Settings size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">صيانة وتحديث قاعدة البيانات</h3>
                <p className="text-xs text-slate-500">فحص الحجوزات المعلقة وإعادة ربطها بالمواد الجديدة المستعادة تلقائياً</p>
              </div>
            </div>

            <button
              onClick={runDatabaseMigration}
              disabled={migrationLoading}
              className="w-full bg-amber-500 text-white py-3 rounded-2xl font-bold hover:bg-amber-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
            >
              {migrationLoading ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  <span>جاري فحص وصيانة قاعدة البيانات...</span>
                </>
              ) : (
                <span>بدء صيانة وربط الحجوزات</span>
              )}
            </button>

            {migrationLog.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700">سجل الصيانة المباشر:</span>
                <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl text-xs font-mono h-48 overflow-y-auto space-y-1 text-left" dir="ltr">
                  {migrationLog.map((logLine, idx) => (
                    <div key={idx} className="whitespace-pre-wrap">{logLine}</div>
                  ))}
                </div>
              </div>
            )}

            {migrationResult && (
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-150 grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-xs text-slate-400 font-bold">الحجوزات التي تم فحصها</div>
                  <div className="text-lg font-black text-slate-800">{migrationResult.scanned}</div>
                </div>
                <div>
                  <div className="text-xs text-emerald-600 font-bold">تم ربطها بنجاح</div>
                  <div className="text-lg font-black text-emerald-600">{migrationResult.mapped}</div>
                </div>
                <div>
                  <div className="text-xs text-rose-600 font-bold">تم تنظيفها (حذفها)</div>
                  <div className="text-lg font-black text-rose-600">{migrationResult.deleted}</div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Exam Officer Management (Admin or Super Admin can access) */}
      <div className="max-w-2xl bg-white rounded-3xl shadow-sm border border-slate-100 p-8 space-y-8">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl shadow-sm">
            <Users size={24} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">إدارة موظفي الامتحانات</h2>
            <p className="text-sm text-slate-500">ترقية المراقبين إلى موظفي امتحانات لتسهيل رفع القاعات والنتائج</p>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-slate-900 text-sm">ترقية مراقب إلى موظف امتحانات</h3>
          <div className="flex gap-3">
            <select 
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-purple-500 outline-none"
              onChange={(e) => {
                if (e.target.value) handlePromoteToOfficer(e.target.value);
              }}
              defaultValue=""
            >
              <option value="" disabled>اختر مراقباً لترقيته...</option>
              {activeStudents.map(student => (
                <option key={student.uid} value={student.uid}>{student.name} ({student.email})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-6">
          <h3 className="font-bold text-slate-900 text-sm mb-4">موظفو الامتحانات الحاليون</h3>
          <div className="space-y-3">
            {allUsers.filter(u => u.role === 'exam_officer').length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2 font-medium">لا يوجد موظفو امتحانات حالياً.</p>
            ) : (
              allUsers.filter(u => u.role === 'exam_officer').map(officer => (
                <div key={officer.uid} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-purple-600 font-bold border border-slate-100">
                      {officer.name?.charAt(0) || 'O'}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{officer.name}</p>
                      <p className="text-xs text-slate-500">{officer.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDemoteToStudent(officer.uid)}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors"
                    title="سحب الصلاحية وتحويل لمراقب"
                  >
                    <UserMinus size={20} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )}
</div>
);
}
