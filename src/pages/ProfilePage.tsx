import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Phone, IdCard, Building, Clock, Shield, Edit2, Save, X, Loader2, Camera, Image as ImageIcon, CheckCircle2, MessageSquare, XCircle } from 'lucide-react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { AppSettings } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import { uploadToCloudinary } from '../utils/cloudinary';

export default function ProfilePage() {
  const { profile, user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [idCardImage, setIdCardImage] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    university_id: '',
    department: '',
  });

  useEffect(() => {
    if (profile && !isEditing) {
      setFormData({
        name: profile.name || '',
        phone: profile.phone || '',
        university_id: profile.university_id || '',
        department: profile.department || '',
      });
    }
  }, [profile, isEditing]);

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

  if (!profile || !user) return null;

  const handleSave = async () => {
    setLoading(true);
    try {
      let profile_image_url = profile.profile_image_url || '';
      let id_card_image_url = profile.id_card_image_url || '';

      if (profileImage) {
        profile_image_url = await uploadToCloudinary(profileImage);
      }
      if (idCardImage) {
        id_card_image_url = await uploadToCloudinary(idCardImage);
      }

      await updateDoc(doc(db, 'users', user.uid), {
        ...formData,
        profile_image_url,
        id_card_image_url,
      });

      setIsEditing(false);
      setProfileImage(null);
      setIdCardImage(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const requiredHours = profile.required_hours || globalSettings?.default_required_hours || 16;

  const infoItems = [
    { label: 'الاسم الكامل', value: profile.name, icon: User, key: 'name' },
    { label: 'البريد الإلكتروني', value: profile.email, icon: Mail, readonly: true },
    { label: 'رقم الهاتف', value: profile.phone || 'غير محدد', icon: Phone, key: 'phone' },
    { label: 'الرقم الجامعي', value: profile.university_id || 'غير محدد', icon: IdCard, key: 'university_id' },
    { label: 'القسم / التخصص', value: profile.department || 'غير محدد', icon: Building, key: 'department' },
    { label: 'الساعات المطلوبة', value: `${requiredHours} ساعة`, icon: Clock, readonly: true },
    { label: 'نوع الحساب', value: profile.role === 'admin' ? 'مدير نظام' : 'طالب مراقب', icon: Shield, readonly: true },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">الملف الشخصي</h1>
          <p className="text-slate-500 mt-1">بياناتك الشخصية والجامعية المسجلة في النظام</p>
        </div>
        {!isEditing ? (
          <button
            onClick={() => setIsEditing(true)}
            className="flex items-center gap-2 bg-indigo-50 text-indigo-600 px-6 py-3 rounded-2xl font-bold hover:bg-indigo-100 transition-colors"
          >
            <Edit2 size={20} />
            <span>تعديل البيانات</span>
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
              <span>حفظ التغييرات</span>
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setProfileImage(null);
                setIdCardImage(null);
              }}
              disabled={loading}
              className="flex items-center gap-2 bg-slate-100 text-slate-600 px-6 py-3 rounded-2xl font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <X size={20} />
              <span>إلغاء</span>
            </button>
          </div>
        )}
      </header>

      {profile.admin_note && (
        <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl flex items-start gap-4 text-indigo-900 shadow-sm">
          <div className="p-2 bg-white rounded-xl text-indigo-600 shadow-sm">
            <MessageSquare size={20} />
          </div>
          <div>
            <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">ملاحظة من الإدارة</p>
            <p className="font-medium">{profile.admin_note}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 text-center relative">
            <div className="w-32 h-32 rounded-full bg-indigo-50 mx-auto mb-6 flex items-center justify-center text-indigo-600 text-6xl font-bold overflow-hidden border-4 border-white shadow-lg relative group">
              {profile.profile_image_url ? (
                <img 
                  src={profile.profile_image_url} 
                  alt={profile.name} 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                profile.avatar_emoji || profile.name.charAt(0)
              )}
              
              {isEditing && (
                <label className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center cursor-pointer transition-opacity text-white">
                  <Camera size={32} className="mb-1" />
                  <span className="text-[10px] font-bold">تغيير الصورة</span>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => setProfileImage(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>

            {profileImage && (
              <p className="text-xs text-indigo-600 font-bold mb-4 flex items-center justify-center gap-1">
                <CheckCircle2 size={12} /> تم اختيار صورة جديدة
              </p>
            )}
            
            {isEditing ? (
              <input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="text-center w-full text-2xl font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <h2 className="text-2xl font-bold text-slate-900">{profile.name}</h2>
            )}
            
            <p className="text-slate-500 mt-1">{profile.department}</p>
            
            <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col gap-3">
              <div className="flex items-center justify-center gap-2">
                {profile.status === 'active' ? (
                  <span className="flex items-center gap-1 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-full text-xs font-bold ring-1 ring-emerald-200">
                    <CheckCircle2 size={14} /> حساب مفعل
                  </span>
                ) : profile.status === 'frozen' ? (
                  <span className="flex items-center gap-1 bg-rose-50 text-rose-600 px-4 py-2 rounded-full text-xs font-bold ring-1 ring-rose-200">
                    <XCircle size={14} /> حساب مجمد
                  </span>
                ) : (
                  <span className="flex items-center gap-1 bg-amber-50 text-amber-600 px-4 py-2 rounded-full text-xs font-bold ring-1 ring-amber-200">
                    <Clock size={14} /> قيد المراجعة
                  </span>
                )}
                <span className={`px-4 py-2 rounded-full text-xs font-bold ${profile.role === 'admin' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                  {profile.role === 'admin' ? 'مدير نظام' : 'طالب مراقب'}
                </span>
              </div>
            </div>
          </div>

          {/* ID Card Display/Upload */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <IdCard size={18} className="text-indigo-600" />
              صورة البطاقة الجامعية
            </h3>
            
            <div className="relative aspect-video bg-slate-50 rounded-2xl overflow-hidden border-2 border-dashed border-slate-200 group">
              {profile.id_card_image_url ? (
                <img 
                  src={profile.id_card_image_url} 
                  alt="ID Card" 
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                  <ImageIcon size={32} className="mb-2" />
                  <p className="text-xs">لم يتم رفع صورة البطاقة</p>
                </div>
              )}

              {isEditing && (
                <label className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center cursor-pointer transition-opacity text-white">
                  <Camera size={32} className="mb-1" />
                  <span className="text-xs font-bold">رفع صورة جديدة</span>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => setIdCardImage(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>
            {idCardImage && (
              <p className="text-xs text-indigo-600 font-bold mt-2 flex items-center gap-1">
                <CheckCircle2 size={12} /> تم اختيار صورة بطاقة جديدة
              </p>
            )}
          </div>
        </div>

        {/* Info Grid */}
        <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
          <h3 className="text-xl font-bold text-slate-900 mb-8">المعلومات التفصيلية</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {infoItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={index} className="flex items-start gap-4">
                  <div className="p-3 bg-slate-50 text-slate-400 rounded-2xl">
                    <Icon size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 font-medium mb-1">{item.label}</p>
                    {isEditing && !item.readonly ? (
                      <input
                        value={formData[item.key as keyof typeof formData]}
                        onChange={(e) => setFormData({ ...formData, [item.key as string]: e.target.value })}
                        className="w-full text-slate-900 font-bold bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    ) : (
                      <p className="text-slate-900 font-bold">{item.value}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
