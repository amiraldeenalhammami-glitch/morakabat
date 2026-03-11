import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { User, Phone, IdCard, Building, AlertCircle, Loader2 } from 'lucide-react';

export default function CompleteProfile() {
  const { user, profile, loading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    phone: '',
    university_id: '',
    department: '',
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [idCard, setIdCard] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/login');
    }
    if (!authLoading && profile) {
      navigate('/dashboard');
    }
  }, [user, profile, authLoading, navigate]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setError('لم يتم العثور على بيانات المستخدم. يرجى تسجيل الدخول مرة أخرى.');
      return;
    }
    
    setError('');
    setLoading(true);
    setLoadingText('جاري بدء العملية...');
    console.log('Submit started. User:', user.uid);

    try {
      let photoUrl = user.photoURL || '';
      let idCardUrl = '';

      // Upload Photo
      if (photo) {
        if (photo.size > 5 * 1024 * 1024) {
          throw new Error('حجم الصورة الشخصية كبير جداً. يرجى اختيار صورة أقل من 5 ميجابايت.');
        }
        setLoadingText('جاري رفع الصورة الشخصية...');
        console.log('Uploading photo:', photo.name);
        try {
          const photoRef = ref(storage, `users/${user.uid}/photo`);
          
          // Manual timeout for upload
          const uploadPromise = uploadBytes(photoRef, photo);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('انتهت مهلة رفع الصورة الشخصية. يرجى التحقق من اتصالك بالإنترنت.')), 30000)
          );
          
          const uploadTask = await Promise.race([uploadPromise, timeoutPromise]) as any;
          photoUrl = await getDownloadURL(uploadTask.ref);
          console.log('Photo uploaded:', photoUrl);
        } catch (uploadErr: any) {
          console.error('Photo upload error:', uploadErr);
          throw new Error(`فشل رفع الصورة الشخصية: ${uploadErr.message}`);
        }
      }

      // Upload ID Card
      if (idCard) {
        if (idCard.size > 5 * 1024 * 1024) {
          throw new Error('حجم صورة البطاقة كبير جداً. يرجى اختيار صورة أقل من 5 ميجابايت.');
        }
        setLoadingText('جاري رفع صورة البطاقة الجامعية...');
        console.log('Uploading ID card:', idCard.name);
        try {
          const idCardRef = ref(storage, `users/${user.uid}/id_card`);
          
          // Manual timeout for upload
          const uploadPromise = uploadBytes(idCardRef, idCard);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('انتهت مهلة رفع صورة البطاقة. يرجى التحقق من اتصالك بالإنترنت.')), 30000)
          );
          
          const uploadTask = await Promise.race([uploadPromise, timeoutPromise]) as any;
          idCardUrl = await getDownloadURL(uploadTask.ref);
          console.log('ID card uploaded:', idCardUrl);
        } catch (uploadErr: any) {
          console.error('ID card upload error:', uploadErr);
          throw new Error(`فشل رفع صورة البطاقة: ${uploadErr.message}`);
        }
      }

      // Save Profile to Firestore
      setLoadingText('جاري حفظ البيانات النهائية...');
      console.log('Saving to Firestore...');
      try {
        const userData = {
          name: user.displayName || 'مستخدم جديد',
          email: user.email || '',
          phone: formData.phone,
          university_id: formData.university_id,
          department: formData.department,
          role: 'student',
          photo: photoUrl,
          student_card_image: idCardUrl,
          required_hours: 16,
          createdAt: new Date().toISOString(),
        };
        
        // Use a timeout for Firestore just in case
        const savePromise = setDoc(doc(db, 'users', user.uid), userData);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('انتهت مهلة الاتصال بقاعدة البيانات. يرجى المحاولة مرة أخرى.')), 15000)
        );

        await Promise.race([savePromise, timeoutPromise]);
        console.log('Firestore save successful');
      } catch (firestoreErr: any) {
        console.error('Firestore save error:', firestoreErr);
        throw new Error(`خطأ في حفظ البيانات: ${firestoreErr.message}`);
      }

      console.log('Navigation to dashboard...');
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Final error catch:', err);
      setError(err.message || 'حدث خطأ غير متوقع أثناء إكمال الملف الشخصي.');
    } finally {
      setLoading(false);
      setLoadingText('');
    }
  };

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-indigo-600" size={40} /></div>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 py-12">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600">إكمال الملف الشخصي</h1>
          <p className="text-slate-500 mt-2">يرجى تزويدنا ببياناتك الجامعية للمتابعة</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl flex items-center gap-3 text-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-blue-50 p-4 rounded-2xl text-blue-700 text-sm flex items-start gap-3 mb-4">
            <AlertCircle className="shrink-0 mt-0.5" size={18} />
            <p>ملاحظة: إذا واجهت مشكلة في رفع الصور أو كان الإنترنت بطيئاً، يمكنك ترك حقول الصور فارغة وإكمال التسجيل مباشرة.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">رقم الهاتف</label>
              <div className="relative">
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  name="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="05xxxxxxxx"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">الرقم الجامعي</label>
              <div className="relative">
                <IdCard className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  name="university_id"
                  type="text"
                  required
                  value={formData.university_id}
                  onChange={handleChange}
                  className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="2024xxxx"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">القسم / التخصص</label>
              <div className="relative">
                <Building className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  name="department"
                  type="text"
                  required
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full pr-12 pl-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  placeholder="علوم الحاسب"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">الصورة الشخصية (اختياري)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">صورة البطاقة الجامعية (اختياري)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setIdCard(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin" size={24} />
                <span>{loadingText}</span>
              </div>
            ) : (
              <span>حفظ وإكمال التسجيل</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
