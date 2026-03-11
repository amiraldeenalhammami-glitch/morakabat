import React, { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AppSettings } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { Settings, Save, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function AdminSettings() {
  const [settings, setSettings] = useState<AppSettings>({
    registration_open: true,
    registration_start: '',
    registration_end: '',
    default_required_hours: 16,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setSettings(docSnap.data() as AppSettings);
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/global');
    });
    return () => unsubscribe();
  }, []);

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
          <div className="md:col-span-2">
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
    </div>
  );
}
