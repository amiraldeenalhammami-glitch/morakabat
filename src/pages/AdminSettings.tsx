import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { AppSettings } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Settings, Save, AlertCircle, CheckCircle, Loader2, Image as ImageIcon, Camera, Shield, UserMinus, UserPlus } from 'lucide-react';
import { uploadToCloudinary } from '../utils/cloudinary';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function AdminSettings() {
  const { profile, isSuperAdmin } = useAuth();
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
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

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
        });
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });
    return () => unsubscribe();
  }, [profile?.uid]);

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
    if (isSuperAdmin) {
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
  }, [isSuperAdmin]);

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
      setMessage({ type: 'success', text: 'تم حفظ الإعدادات بنجاح' });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'settings/global');
    } finally {
      setSaving(false);
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
            <p className="text-xs text-slate-400 mt-2">هذا الرقم سيطبق على جميع الطلاب الذين لم يتم تحديد ساعات خاصة بهم.</p>
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

      {isSuperAdmin && (
        <div className="max-w-2xl bg-white rounded-3xl shadow-sm border border-slate-100 p-8 space-y-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl shadow-sm">
              <Shield size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">إدارة المدراء</h2>
              <p className="text-sm text-slate-500">ترقية الطلاب أو سحب صلاحيات المدراء (الحد الأقصى: 5)</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-bold text-slate-900 text-sm">ترقية طالب إلى مدير</h3>
            <div className="flex gap-3">
              <select 
                className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none"
                onChange={(e) => {
                  if (e.target.value) handlePromoteToAdmin(e.target.value);
                }}
                defaultValue=""
              >
                <option value="" disabled>اختر طالباً لترقيته...</option>
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
                      title="سحب الصلاحية وتحويل لطالب"
                    >
                      <UserMinus size={20} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
