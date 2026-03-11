import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, Mail, Phone, IdCard, Building, Clock, Shield, Edit2, Save, X, Camera, Loader2 } from 'lucide-react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { AppSettings } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';

// Helper to compress image
const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('Canvas to Blob failed'));
          },
          'image/jpeg',
          0.7 // Quality
        );
      };
    };
    reader.onerror = (error) => reject(error);
  });
};

export default function ProfilePage() {
  const { profile, user } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [globalSettings, setGlobalSettings] = useState<AppSettings | null>(null);
  const [formData, setFormData] = useState({
    name: profile?.name || '',
    phone: profile?.phone || '',
    university_id: profile?.university_id || '',
    department: profile?.department || '',
  });
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [idCardFile, setIdCardFile] = useState<File | null>(null);

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
      let photoUrl = profile.photo;
      let idCardUrl = profile.student_card_image;

      if (photoFile) {
        const compressedPhoto = await compressImage(photoFile);
        const photoRef = ref(storage, `users/${user.uid}/photo`);
        await uploadBytes(photoRef, compressedPhoto);
        photoUrl = await getDownloadURL(photoRef);
      }

      if (idCardFile) {
        const compressedIdCard = await compressImage(idCardFile);
        const idCardRef = ref(storage, `users/${user.uid}/id_card`);
        await uploadBytes(idCardRef, compressedIdCard);
        idCardUrl = await getDownloadURL(idCardRef);
      }

      await updateDoc(doc(db, 'users', user.uid), {
        ...formData,
        photo: photoUrl,
        student_card_image: idCardUrl,
      });

      setIsEditing(false);
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
      <header className="flex justify-between items-center">
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
              <span>حفظ</span>
            </button>
            <button
              onClick={() => setIsEditing(false)}
              disabled={loading}
              className="flex items-center gap-2 bg-slate-100 text-slate-600 px-6 py-3 rounded-2xl font-bold hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              <X size={20} />
              <span>إلغاء</span>
            </button>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 text-center relative">
            <div className="w-32 h-32 rounded-full bg-indigo-50 mx-auto mb-6 flex items-center justify-center text-indigo-600 text-4xl font-bold overflow-hidden border-4 border-white shadow-lg relative group">
              {photoFile ? (
                <img src={URL.createObjectURL(photoFile)} alt="Preview" className="w-full h-full object-cover" />
              ) : profile.photo ? (
                <img src={profile.photo} alt={profile.name} className="w-full h-full object-cover" />
              ) : (
                profile.name.charAt(0)
              )}
              
              {isEditing && (
                <label className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera size={24} />
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhotoFile(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>
            
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
            
            <div className="mt-6 pt-6 border-t border-slate-100">
              <span className={`px-4 py-2 rounded-full text-sm font-bold ${profile.role === 'admin' ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600'}`}>
                {profile.role === 'admin' ? 'مدير نظام' : 'طالب مراقب'}
              </span>
            </div>
          </div>

          {/* ID Card Display */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <IdCard size={20} className="text-indigo-600" />
              البطاقة الجامعية
            </h3>
            <div className="aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 relative group">
              {idCardFile ? (
                <img src={URL.createObjectURL(idCardFile)} alt="Preview" className="w-full h-full object-contain" />
              ) : profile.student_card_image ? (
                <img src={profile.student_card_image} alt="البطاقة الجامعية" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">لا توجد صورة</div>
              )}
              
              {isEditing && (
                <label className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <div className="flex flex-col items-center gap-2">
                    <Camera size={32} />
                    <span className="text-sm font-bold">تغيير صورة البطاقة</span>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setIdCardFile(e.target.files?.[0] || null)} />
                </label>
              )}
            </div>
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
